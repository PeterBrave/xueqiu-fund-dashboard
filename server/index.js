import http from "node:http";
import { config } from "./config.js";
import { extractJson, runAgent } from "./qwen.js";
import { fundNavHistory, indexValuationTable } from "./skills/sources.js";
import {
  buildAdviceUserPrompt,
  CHAT_SYSTEM_PROMPT,
  computeTrendIndicators,
  STRATEGY_SYSTEM_PROMPT,
  withMemory
} from "./strategy.js";
import { adviceForDate, listAdvice, saveAdvice } from "./store.js";
import {
  ensureMemoryScaffold,
  journalFromReport,
  readNotes,
  readStrategyProfile,
  writeJournal
} from "./memory.js";

const trendCache = new Map(); // code -> { at, indicators }
const TREND_TTL = 60 * 60 * 1000;

async function trendForCode(code) {
  const cached = trendCache.get(code);
  if (cached && Date.now() - cached.at < TREND_TTL) return cached.indicators;
  const history = await fundNavHistory(code, 300);
  const indicators = computeTrendIndicators(history);
  trendCache.set(code, { at: Date.now(), indicators });
  return indicators;
}

/** 为组合上下文补充：持仓基金趋势指标 + 指数估值表 */
async function enrichContext(context) {
  const holdings = [...(context.holdings || [])]
    .sort((a, b) => (b.liveValue || 0) - (a.liveValue || 0))
    .slice(0, 20);

  const trendByCode = {};
  const results = await Promise.allSettled(
    holdings.map(async (holding) => {
      trendByCode[holding.code] = {
        name: holding.name,
        ...(await trendForCode(holding.code))
      };
    })
  );
  const failed = results.filter((item) => item.status === "rejected").length;

  let indexValuation = [];
  try {
    indexValuation = await indexValuationTable();
  } catch {
    /* 估值表拉取失败时降级，不阻塞建议生成 */
  }

  return { trendByCode, indexValuation, trendFetchFailed: failed };
}

function localDate() {
  return new Date().toLocaleDateString("sv-SE");
}

/* ---------------- 路由处理 ---------------- */

async function handleAdvice(body) {
  const context = body?.context;
  if (!context?.allocations?.length) throw httpError(400, "缺少组合上下文 context");
  const apiKey = String(body?.qwenApiKey || body?.apiKey || "").trim();
  if (!apiKey && !config.dashscopeApiKey) throw httpError(400, "缺少 Qwen API Key");

  const enrichment = await enrichContext(context);
  const memory = { strategyProfile: readStrategyProfile(), notes: readNotes(3000) };
  const { content, toolTrace, totalTokens } = await runAgent(
    [
      { role: "system", content: withMemory(STRATEGY_SYSTEM_PROMPT, memory) },
      { role: "user", content: buildAdviceUserPrompt(context, enrichment) }
    ],
    { maxTurns: 5, temperature: 0.3, apiKey }
  );

  const report = extractJson(content);
  if (!report) throw httpError(502, `模型未返回有效 JSON：${String(content).slice(0, 200)}`);

  const entry = {
    date: localDate(),
    generatedAt: new Date().toISOString(),
    model: config.model,
    account: context.account || "",
    totalAssets: context.totalAssets || 0,
    report,
    trendByCode: enrichment.trendByCode,
    toolTrace,
    totalTokens
  };
  saveAdvice(entry);
  entry.journalPath = writeJournal(entry.date, journalFromReport(entry));
  return entry;
}

async function handleChat(body) {
  const question = String(body?.question || "").trim();
  if (!question) throw httpError(400, "缺少 question");
  const apiKey = String(body?.qwenApiKey || body?.apiKey || "").trim();
  if (!apiKey && !config.dashscopeApiKey) throw httpError(400, "缺少 Qwen API Key");
  const context = body?.context || null;
  const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];

  const memory = { strategyProfile: readStrategyProfile(), notes: readNotes(2500) };
  const messages = [{ role: "system", content: withMemory(CHAT_SYSTEM_PROMPT, memory) }];
  for (const item of history) {
    if ((item.role === "user" || item.role === "assistant") && item.text) {
      messages.push({ role: item.role, content: String(item.text).slice(0, 4000) });
    }
  }
  const contextBlock = context
    ? `\n\n【当前组合快照】\n${JSON.stringify(context).slice(0, 20000)}`
    : "";
  messages.push({ role: "user", content: `${question}${contextBlock}` });

  const { content, toolTrace, totalTokens } = await runAgent(messages, {
    maxTurns: 5,
    temperature: 0.5,
    apiKey
  });
  return { answer: content, toolTrace, totalTokens };
}

/* ---------------- HTTP server ---------------- */

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(httpError(413, "请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(httpError(400, "请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const route = `${req.method} ${url.pathname}`;

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (route === "GET /api/health") {
      sendJson(res, 200, {
        ok: true,
        model: config.model,
        hasApiKey: Boolean(config.dashscopeApiKey),
        memoryDir: config.memoryDir
      });
      return;
    }
    if (route === "POST /api/advice") {
      const entry = await handleAdvice(await readBody(req));
      sendJson(res, 200, { ok: true, ...entry });
      return;
    }
    if (route === "GET /api/advice/today") {
      const entry = adviceForDate(localDate());
      sendJson(res, 200, { ok: true, entry });
      return;
    }
    if (route === "GET /api/history") {
      const limit = Number(url.searchParams.get("limit")) || 30;
      sendJson(res, 200, { ok: true, items: listAdvice(limit) });
      return;
    }
    if (route === "POST /api/chat") {
      const result = await handleChat(await readBody(req));
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    sendJson(res, 404, { ok: false, error: "未知路由" });
  } catch (error) {
    const status = error.status || 500;
    console.error(`[${route}]`, error.message || error);
    sendJson(res, status, { ok: false, error: error.message || String(error) });
  }
});

ensureMemoryScaffold();

server.listen(config.port, "127.0.0.1", () => {
  console.log(`投研助手后端已启动: http://127.0.0.1:${config.port}`);
  console.log(`模型: ${config.model} · API key: ${config.dashscopeApiKey ? "已配置" : "缺失"}`);
  console.log(`记忆目录: ${config.memoryDir}`);
});
