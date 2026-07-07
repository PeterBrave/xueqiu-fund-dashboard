import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Slider,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme
} from "antd";
import {
  ClearOutlined,
  DeleteOutlined,
  DownOutlined,
  FundOutlined,
  GroupOutlined,
  LineChartOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
  SlidersOutlined,
  UploadOutlined
} from "@ant-design/icons";
import "antd/dist/reset.css";
import "./theme.css";

const { Text } = Typography;
const ALL_ACCOUNTS_ID = "__ALL_FUND_ACCOUNTS__";
const UNGROUPED_ID = "__UNGROUPED__";
const CASH_ID = "__CASH__";

const DEFAULT_GROUPS = [
  { id: "nasdaq100", name: "纳指100", matchers: ["纳斯达克100"], fundCodes: [], target: 15 },
  { id: "kechuang50", name: "科创50", matchers: ["科创50"], fundCodes: [], target: 8 },
  { id: "chuangyeban", name: "创业板", matchers: ["创业板"], fundCodes: [], target: 8 },
  { id: "hs300", name: "沪深300", matchers: ["沪深300"], fundCodes: [], target: 20 },
  { id: "a500", name: "中证A500", matchers: ["中证A500"], fundCodes: [], target: 12 },
  { id: "sp500", name: "标普500", matchers: ["标普500"], fundCodes: [], target: 12 },
  { id: "bonds", name: "债基底仓", matchers: ["债", "中债"], fundCodes: [], target: 15 }
];

const DEFAULT_STRATEGY_SETTINGS = {
  targetCash: 10,
  maxSingleFund: 18,
  rebalanceThreshold: 5
};

const ALLOC_COLORS = ["#5b3df4", "#2775f6", "#16a36f", "#f59e0b", "#ef4444", "#0ea5e9", "#d946ef", "#84cc16", "#f97316", "#14b8a6"];

const HAS_EXTENSION_API =
  typeof globalThis.chrome !== "undefined" &&
  Boolean(globalThis.chrome?.runtime?.sendMessage) &&
  Boolean(globalThis.chrome?.storage?.local);

/* ---------------- demo 数据（无插件环境预览用） ---------------- */

const DEMO_FUNDS = [
  {
    fd_code: "110020",
    fd_name: "易方达沪深300ETF联接A",
    category_text: "偏股类",
    market_value: 228006.97,
    hold_gain: 28540.94,
    daily_gain: -212.32,
    hold_gain_rate: 14.31,
    market_percent: 29.59,
    nav: 1.692,
    nav_date: "2026-07-02"
  },
  {
    fd_code: "000968",
    fd_name: "广发纳斯达克100指数A",
    category_text: "偏股类(海外)",
    market_value: 127129.64,
    hold_gain: 11240.54,
    daily_gain: -1903.58,
    hold_gain_rate: 9.71,
    market_percent: 16.5,
    nav: 1.244,
    nav_date: "2026-07-02"
  },
  {
    fd_code: "003376",
    fd_name: "广发创业板ETF联接A",
    category_text: "偏股类",
    market_value: 101964.15,
    hold_gain: -1204.55,
    daily_gain: -6909.11,
    hold_gain_rate: -1.17,
    market_percent: 13.23,
    nav: 0.981,
    nav_date: "2026-07-02"
  },
  {
    fd_code: "004069",
    fd_name: "南方中证全债指数A",
    category_text: "偏债类",
    market_value: 72074.03,
    hold_gain: 4730.22,
    daily_gain: -576.89,
    hold_gain_rate: 6.98,
    market_percent: 9.35,
    nav: 1.086,
    nav_date: "2026-07-02"
  },
  {
    fd_code: "050025",
    fd_name: "博时标普500ETF联接A",
    category_text: "偏股类(海外)",
    market_value: 60071.57,
    hold_gain: 8180.31,
    daily_gain: -2410.12,
    hold_gain_rate: 15.77,
    market_percent: 7.8,
    nav: 2.134,
    nav_date: "2026-07-02"
  },
  {
    fd_code: "000217",
    fd_name: "广发安享混合A",
    category_text: "偏债类",
    market_value: 88323.19,
    hold_gain: 1058.48,
    daily_gain: -3.16,
    hold_gain_rate: 1.21,
    market_percent: 11.53,
    nav: 1.102,
    nav_date: "2026-07-02"
  }
];

const DEMO_OVERVIEW = {
  data: {
    amount: 770551.06,
    daily_gain: -16635.76,
    hold_gain: 28540.94,
    items: [
      {
        summary_type: "FUND",
        amount: 681727.87,
        daily_gain: -16632.18,
        hold_gain: 27482.46,
        invest_account_list: [
          { invest_account_id: "demo-main", invest_account_name: "三方活账户（主）", market_value: 649022.33, daily_gain: -16018.03 },
          { invest_account_id: "demo-growth", invest_account_name: "默认账户", market_value: 13866.52, daily_gain: -412.1 },
          { invest_account_id: "demo-cash", invest_account_name: "养老账户", market_value: 31319.02, daily_gain: -202.05 }
        ]
      },
      {
        summary_type: "XJB",
        amount: 88823.19,
        daily_gain: -3.58
      }
    ]
  }
};

const DEMO_PAYLOAD = {
  data: {
    total_assets: 770551.06,
    daily_gain: -16635.76,
    hold_gain: 28540.94,
    daily_gain_date: "2026-07-02",
    items: DEMO_FUNDS
  }
};

function demoPayloadForAccount(accountId) {
  const scaleByAccount = {
    "demo-main": 0.82,
    "demo-growth": 0.1,
    "demo-cash": 0.08
  };
  const scale = scaleByAccount[accountId] || 1;
  return {
    data: {
      ...DEMO_PAYLOAD.data,
      total_assets: 681727.87 * scale,
      daily_gain: -16632.18 * scale,
      hold_gain: 27482.46 * scale,
      items: DEMO_FUNDS.map((fund) => ({
        ...fund,
        market_value: fund.market_value * scale,
        hold_gain: fund.hold_gain * scale,
        daily_gain: fund.daily_gain * scale
      }))
    }
  };
}

const DEMO_TRADES = {
  "demo-main": {
    accountId: "demo-main",
    records: [
      { type: "买入", name: "沪深300", time: "2026-06-28", amount: "1,500.00元", status: "已完成" },
      { type: "定投", name: "纳指100", time: "2026-06-25", amount: "2,000.00元", status: "进行中" },
      { type: "买入", name: "创业板", time: "2026-06-20", amount: "1,000.00元", status: "已完成" }
    ]
  }
};

const DEMO_FUND_VALUATIONS = DEMO_FUNDS.reduce((acc, fund, index) => {
  const rate = [-0.42, -1.86, -2.34, 0.12, -1.28, 0.02][index] ?? 0;
  const nav = num(fund.nav) || 1;
  acc[fund.fd_code] = {
    code: fund.fd_code,
    payload: {
      fundcode: fund.fd_code,
      name: fund.fd_name,
      jzrq: "2026-07-02",
      dwjz: String(nav),
      gsz: (nav * (1 + rate / 100)).toFixed(4),
      gszzl: rate.toFixed(2),
      gztime: "2026-07-03 14:45"
    },
    fetchedAt: Date.now()
  };
  return acc;
}, {});

const DEMO_GROUPS = DEFAULT_GROUPS.map((group) => {
  const codesByGroup = {
    hs300: ["110020"],
    nasdaq100: ["000968"],
    chuangyeban: ["003376"],
    bonds: ["004069"],
    sp500: ["050025"]
  };
  return { ...group, fundCodes: codesByGroup[group.id] || [] };
});

const demoStorage = {
  fundGroups: DEMO_GROUPS,
  lastOverview: DEMO_OVERVIEW,
  lastPayload: DEMO_PAYLOAD,
  selectedAccountId: ALL_ACCOUNTS_ID,
  tradeRecordsByAccount: DEMO_TRADES,
  fundValuationsByCode: DEMO_FUND_VALUATIONS,
  strategySettings: DEFAULT_STRATEGY_SETTINGS,
  aiChatMessages: []
};

function fallbackStorageGet(keys) {
  if (Array.isArray(keys)) {
    return keys.reduce((acc, key) => ({ ...acc, [key]: demoStorage[key] }), {});
  }
  if (typeof keys === "string") return { [keys]: demoStorage[keys] };
  if (keys && typeof keys === "object") {
    return Object.keys(keys).reduce((acc, key) => ({ ...acc, [key]: demoStorage[key] ?? keys[key] }), {});
  }
  return { ...demoStorage };
}

function sendMessage(message) {
  return new Promise((resolve) => {
    if (HAS_EXTENSION_API) {
      globalThis.chrome.runtime.sendMessage(message, resolve);
      return;
    }
    if (message?.type === "fetch-overview") {
      resolve({ ok: true, gain: DEMO_OVERVIEW, icons: { data: null } });
      return;
    }
    if (message?.type === "fetch-assets") {
      resolve({ ok: true, payload: demoPayloadForAccount(message.accountId) });
      return;
    }
    if (message?.type === "get-last-account") {
      resolve({ ok: true, account: { accountId: ALL_ACCOUNTS_ID, accountName: "全部基金账户" } });
      return;
    }
    if (message?.type === "get-trade-records" || message?.type === "refresh-trade-records") {
      resolve({ ok: true, captured: true, tradeRecordsByAccount: DEMO_TRADES });
      return;
    }
    if (message?.type === "get-fund-valuations" || message?.type === "fetch-fund-valuations") {
      resolve({ ok: true, fundValuationsByCode: DEMO_FUND_VALUATIONS, failed: 0 });
      return;
    }
    resolve({ ok: true });
  });
}

/* ---------------- 基础工具 ---------------- */

function normalizePayload(payload) {
  const data = payload?.data || payload;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("JSON 中没有 data.items");
  }
  return { ...payload, data };
}

function uid() {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function num(value) {
  return Number(value || 0);
}

function finiteNum(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const next = finiteNum(value);
    if (next !== null) return next;
  }
  return null;
}

function rateFromGain(gain, currentValue) {
  if (!Number.isFinite(gain) || !Number.isFinite(currentValue)) return null;
  const previousValue = currentValue - gain;
  return previousValue ? (gain / previousValue) * 100 : null;
}

function dailyRateOf(fund, currentValue) {
  return firstFinite(
    fund.daily_gain_rate,
    fund.day_gain_rate,
    fund.daily_profit_rate,
    fund.daily_yield_rate
  ) ?? rateFromGain(finiteNum(fund.daily_gain), currentValue);
}

function shareOf(fund) {
  return firstFinite(
    fund.hold_share,
    fund.current_share,
    fund.total_share,
    fund.fd_share,
    fund.share,
    fund.shares
  );
}

function navDisplay(value) {
  const next = finiteNum(value);
  if (next === null) return "--";
  return String(Number(next.toFixed(4)));
}

function money(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedMoney(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

function percent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function percent1(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function signedPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${percent(value)}`;
}

function valueColor(value) {
  if (value > 0) return "#cf1322";
  if (value < 0) return "#237804";
  return undefined;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function localDate(date = new Date()) {
  return date.toLocaleDateString("sv-SE");
}

function valuationDataOf(entry) {
  return entry?.payload || entry?.data || entry || {};
}

function fundValuationFrom(fund, entry) {
  const data = valuationDataOf(entry);
  const rate = Number(data.gszzl);
  const estimatedNav = Number(data.gsz);
  return {
    code: data.fundcode || fund.fd_code,
    name: data.name || fund.fd_name,
    estimatedNav: Number.isFinite(estimatedNav) ? estimatedNav : null,
    confirmedNav: Number(data.dwjz),
    rate: Number.isFinite(rate) ? rate : null,
    time: data.gztime || "",
    navDate: data.jzrq || ""
  };
}

function buildCombinedPayload(accountPayloads, accountList, overviewFund) {
  const normalized = accountPayloads.map(({ account, payload }) => ({
    account,
    payload: normalizePayload(payload)
  }));
  const totalAssets = num(overviewFund?.amount) || normalized.reduce((sum, item) => sum + num(item.payload.data.total_assets), 0);
  const allItems = normalized.flatMap(({ account, payload }) =>
    payload.data.items.map((fund) => ({
      ...fund,
      _accountId: account.accountId,
      _accountName: account.accountName,
      market_percent: totalAssets ? (num(fund.market_value) / totalAssets) * 100 : num(fund.market_percent)
    }))
  );

  return {
    data: {
      total_assets: totalAssets,
      daily_gain: num(overviewFund?.daily_gain) || normalized.reduce((sum, item) => sum + num(item.payload.data.daily_gain), 0),
      hold_gain: num(overviewFund?.hold_gain) || normalized.reduce((sum, item) => sum + num(item.payload.data.hold_gain), 0),
      daily_gain_date: overviewFund?.daily_gain_date || normalized[0]?.payload.data.daily_gain_date || "",
      items: allItems,
      account_list: accountList,
      combined: true
    }
  };
}

function normalizeGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return DEFAULT_GROUPS;
  return rawGroups.map((group) => ({
    ...group,
    fundCodes: Array.isArray(group.fundCodes) ? group.fundCodes : [],
    target: Number.isFinite(Number(group.target)) ? Number(group.target) : 0
  }));
}

function MoneyText({ value, signed = false }) {
  return (
    <Text style={{ color: valueColor(value), fontVariantNumeric: "tabular-nums" }}>
      {signed ? signedMoney(value) : money(value)}
    </Text>
  );
}

function PercentText({ value, signed = false }) {
  return (
    <Text style={{ color: valueColor(value), fontVariantNumeric: "tabular-nums" }}>
      {signed ? signedPercent(value) : percent(value)}
    </Text>
  );
}

function FundMetric({ value, sub }) {
  return (
    <div className="fund-metric">
      <div className="fund-metric-value">{value}</div>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
}

function ValueStack({ value, sub }) {
  return (
    <div className="value-stack">
      <div>{value}</div>
      {sub ? <Text type="secondary">{sub}</Text> : null}
    </div>
  );
}

function useStorage() {
  const get = useCallback((keys) => {
    if (HAS_EXTENSION_API) return globalThis.chrome.storage.local.get(keys);
    return Promise.resolve(fallbackStorageGet(keys));
  }, []);
  const set = useCallback((value) => {
    if (HAS_EXTENSION_API) return globalThis.chrome.storage.local.set(value);
    Object.assign(demoStorage, value);
    return Promise.resolve();
  }, []);
  return { get, set };
}

/* ---------------- AI Agent（本地投研后端） ----------------
 * 后端为 server/ 目录下的 Node 服务（npm run server 启动），基于阿里千问：
 * - askAgent：对话问答，模型可调用 skills（基金概况/趋势/估值/研报/记忆）
 * - requestAiAdvice：生成结构化每日投研报告
 * 后端不在线时对话自动回退到本地规则应答。
 */

const ADVISOR_API_BASE = "http://127.0.0.1:8787";

async function advisorFetch(path, options = {}, timeoutMs = 180000) {
  const response = await fetch(`${ADVISOR_API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `后端返回 ${response.status}`);
  }
  return payload;
}

async function checkAdvisorHealth() {
  try {
    const payload = await advisorFetch("/api/health", {}, 2500);
    return { online: true, model: payload.model, memoryDir: payload.memoryDir };
  } catch {
    return { online: false };
  }
}

async function askAgent(question, context, history = [], qwenApiKey = "") {
  try {
    const payload = await advisorFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question, context, history, qwenApiKey })
    });
    return payload.answer || "（模型没有返回内容）";
  } catch (error) {
    const fallback = localAnswer(question, context);
    return `${fallback}\n\n⚠️ AI 后端不可用（${error.message}），以上为本地规则应答。启动方式：npm run server`;
  }
}

async function requestAiAdvice(context, qwenApiKey = "") {
  return advisorFetch("/api/advice", {
    method: "POST",
    body: JSON.stringify({ context, qwenApiKey })
  });
}

async function fetchTodayAdvice() {
  try {
    const payload = await advisorFetch("/api/advice/today", {}, 4000);
    return payload.entry || null;
  } catch {
    return null;
  }
}

function fmtAllocationLine(row) {
  return `${row.name}：当前 ${row.current.toFixed(1)}% / 目标 ${row.target.toFixed(1)}%，偏离 ${row.deviation > 0 ? "+" : ""}${row.deviation.toFixed(1)}%`;
}

function localAnswer(question, ctx) {
  const q = String(question || "");
  const lines = [];
  const exceeded = ctx.allocations.filter((row) => Math.abs(row.deviation) >= ctx.rebalanceThreshold);

  if (/(偏移|偏离|比例|配置|仓位)/.test(q)) {
    lines.push("当前组合与目标比例的对照：", "");
    ctx.allocations.forEach((row) => lines.push(`· ${fmtAllocationLine(row)}`));
    lines.push("");
    lines.push(
      exceeded.length
        ? `其中 ${exceeded.map((row) => row.name).join("、")} 偏离超过 ±${ctx.rebalanceThreshold}% 阈值，可以查看右侧「调仓计划」。`
        : `所有 tag 偏离都在 ±${ctx.rebalanceThreshold}% 阈值内，暂时不需要动作。`
    );
  } else if (/(盘中|估值|今天|今日|行情|涨|跌)/.test(q)) {
    if (ctx.intraday.covered) {
      lines.push(
        `盘中估值覆盖 ${percent(ctx.intraday.coverage)}，预估收益 ${signedMoney(ctx.intraday.estimatedGain)}（${signedPercent(ctx.intraday.rate)}），估值时间 ${ctx.intraday.time || "--"}。`
      );
      const sorted = [...ctx.allocations].filter((row) => Number.isFinite(row.liveRate)).sort((a, b) => a.liveRate - b.liveRate);
      if (sorted.length) {
        lines.push("");
        lines.push(`盘中最弱：${sorted[0].name}（${signedPercent(sorted[0].liveRate)}）；最强：${sorted.at(-1).name}（${signedPercent(sorted.at(-1).liveRate)}）。`);
      }
    } else {
      lines.push("暂时没有拿到盘中估值数据，可以点击左侧「刷新估值」重试。");
    }
  } else if (/(调仓|建议|计划|平衡|买|卖|加仓|减仓)/.test(q)) {
    if (ctx.actions.length) {
      lines.push(`按 ±${ctx.rebalanceThreshold}% 阈值，当前有 ${ctx.actions.length} 项动作：`, "");
      ctx.actions.forEach((action) => lines.push(`· ${action.name}：${action.actionLabel}，${action.note}`));
      if (ctx.pendingTrades > 0) {
        lines.push("", `注意：还有 ${ctx.pendingTrades} 笔交易进行中，建议等确认后再执行。`);
      }
    } else {
      lines.push(`所有 tag 偏离都在 ±${ctx.rebalanceThreshold}% 内，现在不需要调仓，保持定投节奏即可。`);
    }
  } else if (/(现金|资金|水位)/.test(q)) {
    const cash = ctx.allocations.find((row) => row.id === CASH_ID);
    lines.push(
      cash
        ? `现金当前 ${cash.current.toFixed(1)}%（目标 ${cash.target.toFixed(1)}%），约 ${money(cash.liveValue)} 元。${cash.deviation < 0 ? "低于目标，调仓时优先补足现金缓冲。" : "高于或接近目标，可作为再平衡的弹药。"}`
        : "暂无现金数据。"
    );
  } else {
    lines.push(`组合总资产约 ${money(ctx.totalAssets)} 元，共 ${ctx.allocations.length} 个配置项。`);
    lines.push(
      exceeded.length
        ? `目前 ${exceeded.map((row) => row.name).join("、")} 偏离超过阈值。`
        : "目前所有配置偏离都在阈值内。"
    );
    lines.push("", "可以这样问我：「分析当前偏移」「今天盘中表现」「给我调仓建议」「现金水位如何」。");
  }
  lines.push("", "—— 本回复由本地规则生成，接入 AI Agent 后将替换为模型分析。");
  return lines.join("\n");
}

const TRADE_ACTION_TONE = {
  买入: "blue",
  定投: "blue",
  卖出: "orange",
  转换: "purple",
  超级转换: "purple",
  分红: "green",
  撤单: "red"
};

function tradeDateOf(record) {
  const normalized = String(record?.time || "").replace(/[/.]/g, "-");
  const match = normalized.match(/\d{4}-\d{1,2}-\d{1,2}/);
  if (!match) return "";
  const [year, month, day] = match[0].split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// 排序键：补零后的日期 + 时钟，避免 "2026-7-3" 按字符串比较排在 "2026-07-06" 前面
function tradeSortKey(record) {
  const date = tradeDateOf(record);
  const clock = String(record?.time || "").match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0] || "";
  return `${date} ${clock.padStart(5, "0")}`;
}

function shortTradeTime(record) {
  const time = String(record?.time || "");
  const clock = time.match(/\d{1,2}:\d{2}/)?.[0];
  return clock || tradeDateOf(record) || "";
}

function MarkdownMessage({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        table: ({ node, ...props }) => (
          <div className="chat-markdown-table">
            <table {...props} />
          </div>
        )
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

/* ---------------- 主组件 ---------------- */

function FundDashboard() {
  const { message } = AntApp.useApp();
  const storage = useStorage();
  const [account, setAccount] = useState(null);
  const [payload, setPayload] = useState(null);
  const [overview, setOverview] = useState(null);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [sourceStatus, setSourceStatus] = useState("未连接");
  const [loading, setLoading] = useState(false);
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tradeRecordsByAccount, setTradeRecordsByAccount] = useState({});
  const [tradeRefreshing, setTradeRefreshing] = useState(false);
  const [fundValuationsByCode, setFundValuationsByCode] = useState({});
  const [strategySettings, setStrategySettings] = useState(DEFAULT_STRATEGY_SETTINGS);
  const [qwenApiKey, setQwenApiKey] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatThinking, setChatThinking] = useState(false);
  const [advisorStatus, setAdvisorStatus] = useState({ online: false });
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false);
  const [aiAdviceError, setAiAdviceError] = useState("");
  const [allocationExpandedIds, setAllocationExpandedIds] = useState([]);
  const [totalSummaryOpen, setTotalSummaryOpen] = useState(false);
  const [targetEditorOpen, setTargetEditorOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState({});
  const [allocationHistory, setAllocationHistory] = useState([]);
  const [form] = Form.useForm();
  const chatBodyRef = useRef(null);
  const aiEnabled = Boolean(qwenApiKey.trim());

  const funds = payload?.data?.items || [];
  const currentFundCodes = useMemo(() => new Set(funds.map((fund) => fund.fd_code)), [funds]);
  const overviewFund = overview?.data?.items?.find((item) => item.summary_type === "FUND") || null;
  const overviewCash = overview?.data?.items?.find((item) => item.summary_type === "XJB") || null;

  const accountOptions = useMemo(() => {
    const list = overviewFund?.invest_account_list || [];
    const children = list.map((item) => ({
      value: item.invest_account_id,
      label: `${item.invest_account_name} · ${money(num(item.market_value))}`,
      account: {
        accountId: item.invest_account_id,
        accountName: item.invest_account_name,
        accountType: item.invest_account_type,
        accountCode: item.invest_account_code
      }
    }));
    return [
      {
        value: ALL_ACCOUNTS_ID,
        label: `全部基金账户 · ${money(num(overviewFund?.amount))}`,
        account: { accountId: ALL_ACCOUNTS_ID, accountName: "全部基金账户" }
      },
      ...children
    ];
  }, [overviewFund]);

  const persistGroups = useCallback(
    async (nextGroups) => {
      setGroups(nextGroups);
      await storage.set({ fundGroups: nextGroups });
    },
    [storage]
  );

  const fetchOverview = useCallback(async () => {
    const result = await sendMessage({ type: "fetch-overview" });
    if (!result?.ok) {
      message.warning(result?.error || "总览接口读取失败。");
      return null;
    }
    setOverview(result.gain);
    await storage.set({ lastOverview: result.gain });
    return result.gain;
  }, [message, storage]);

  const loadTradeRecords = useCallback(async () => {
    const result = await sendMessage({ type: "get-trade-records" });
    if (result?.ok) {
      setTradeRecordsByAccount(result.tradeRecordsByAccount || {});
    }
  }, []);

  const refreshTradeRecords = useCallback(
    async ({ silent = false } = {}) => {
      setTradeRefreshing(true);
      try {
        const result = await sendMessage({ type: "refresh-trade-records" });
        if (result?.ok) {
          setTradeRecordsByAccount(result.tradeRecordsByAccount || {});
          if (!silent) {
            if (result.captured) message.success("交易记录已刷新。");
            else message.warning(result.error || "未能自动读取交易记录。");
          }
        } else if (!silent && result?.error) {
          message.warning(result.error);
        }
      } finally {
        setTradeRefreshing(false);
      }
    },
    [message]
  );

  const loadFundValuations = useCallback(
    async (codes = []) => {
      const uniqueCodes = [...new Set(codes.filter(Boolean))];
      const messageType = uniqueCodes.length ? "fetch-fund-valuations" : "get-fund-valuations";
      const result = await sendMessage({ type: messageType, codes: uniqueCodes });
      if (result?.ok) {
        setFundValuationsByCode(result.fundValuationsByCode || {});
        await storage.set({ fundValuationsByCode: result.fundValuationsByCode || {} });
        if (result.requested && result.failed >= result.requested) {
          message.warning(result.errors?.[0] || "实时估值接口暂时没有返回可用数据。");
        }
      } else if (result?.error) {
        message.warning(result.error);
      }
    },
    [message, storage]
  );

  const fetchOneAccountAssets = useCallback(async (targetAccount) => {
    if (!targetAccount?.accountId) return null;
    const result = await sendMessage({ type: "fetch-assets", accountId: targetAccount.accountId });
    if (!result?.ok) throw new Error(result?.error || "读取失败");
    return normalizePayload(result.payload);
  }, []);

  const fetchAssets = useCallback(
    async (targetAccount = account, accountList = overviewFund?.invest_account_list || []) => {
      if (!targetAccount?.accountId) {
        setSourceStatus("未找到雪球账户页");
        return;
      }
      setLoading(true);
      setSourceStatus(targetAccount.accountId === ALL_ACCOUNTS_ID ? "读取全部子账户..." : "读取中...");
      try {
        let nextPayload;
        if (targetAccount.accountId === ALL_ACCOUNTS_ID) {
          const accounts = accountList.map((item) => ({
            accountId: item.invest_account_id,
            accountName: item.invest_account_name,
            accountType: item.invest_account_type,
            accountCode: item.invest_account_code
          }));
          const results = await Promise.all(
            accounts.map(async (item) => ({
              account: item,
              payload: await fetchOneAccountAssets(item)
            }))
          );
          nextPayload = buildCombinedPayload(results, accountList, overviewFund);
        } else {
          nextPayload = await fetchOneAccountAssets(targetAccount);
        }

        setPayload(nextPayload);
        await storage.set({
          lastPayload: nextPayload,
          selectedAccountId: targetAccount.accountId
        });
        setSourceStatus(targetAccount.accountId === ALL_ACCOUNTS_ID ? "已读取全部子账户" : "已读取雪球接口");
      } catch (error) {
        setSourceStatus(error.message || "读取失败，可粘贴 JSON");
        message.error(error.message || String(error));
      } finally {
        setLoading(false);
      }
    },
    [account, fetchOneAccountAssets, message, overviewFund, storage]
  );

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlAccountId = params.get("accountid");
      const [
        {
          fundGroups,
          lastPayload,
          lastOverview,
          selectedAccountId,
	          fundValuationsByCode: cachedValuations,
	          strategySettings: cachedSettings,
	          qwenApiKey: cachedQwenApiKey,
	          aiChatMessages: cachedChat,
	          allocationHistory: cachedHistory
        },
        accountResult
      ] = await Promise.all([
        storage.get([
          "fundGroups",
          "lastPayload",
          "lastOverview",
          "selectedAccountId",
	          "fundValuationsByCode",
	          "strategySettings",
	          "qwenApiKey",
	          "aiChatMessages",
	          "allocationHistory"
        ]),
        sendMessage({ type: "get-last-account" })
      ]);

      if (Array.isArray(fundGroups)) setGroups(normalizeGroups(fundGroups));
      if (lastOverview) setOverview(lastOverview);
      if (cachedValuations) setFundValuationsByCode(cachedValuations);
      if (cachedSettings) setStrategySettings({ ...DEFAULT_STRATEGY_SETTINGS, ...cachedSettings });
      if (cachedQwenApiKey) setQwenApiKey(cachedQwenApiKey);
      if (Array.isArray(cachedChat)) setChatMessages(cachedChat);
      if (Array.isArray(cachedHistory)) setAllocationHistory(cachedHistory);
      if (lastPayload) {
        setPayload(normalizePayload(lastPayload));
        setSourceStatus("显示上次缓存");
      }
      await loadTradeRecords();
      // 打开看板时后台静默刷新一次交易记录，不用手动去访问交易记录页
      if (HAS_EXTENSION_API) refreshTradeRecords({ silent: true });

      const lastAccount = accountResult?.account || null;
      const freshOverview = await fetchOverview();
      const accountList =
        freshOverview?.data?.items?.find((item) => item.summary_type === "FUND")?.invest_account_list || [];
      const preferredAccountId = urlAccountId || selectedAccountId || ALL_ACCOUNTS_ID;
      const overviewAccount = accountList.find((item) => item.invest_account_id === preferredAccountId);
      const nextAccount =
        preferredAccountId === ALL_ACCOUNTS_ID
          ? { accountId: ALL_ACCOUNTS_ID, accountName: "全部基金账户" }
          : preferredAccountId
          ? {
              accountId: preferredAccountId,
              accountName:
                overviewAccount?.invest_account_name ||
                (lastAccount?.accountId === preferredAccountId ? lastAccount.accountName : ""),
              accountType: overviewAccount?.invest_account_type,
              accountCode: overviewAccount?.invest_account_code
            }
          : lastAccount;

      setAccount(nextAccount);
      if (nextAccount?.accountId) fetchAssets(nextAccount, accountList);
    })();
  }, []);

  useEffect(() => {
    if (!funds.length) return;
    const staleBefore = Date.now() - 5 * 60 * 1000;
    const staleCodes = [...new Set(funds.map((fund) => fund.fd_code).filter(Boolean))]
      .filter((code) => !fundValuationsByCode[code] || num(fundValuationsByCode[code]?.fetchedAt) < staleBefore)
      .slice(0, 40);
    if (staleCodes.length) loadFundValuations(staleCodes);
  }, [funds, fundValuationsByCode, loadFundValuations]);

  useEffect(() => {
    const node = chatBodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages.length, chatThinking]);

  useEffect(() => {
    if (!aiEnabled) {
      setAdvisorStatus({ online: false });
      return;
    }
    (async () => {
      const status = await checkAdvisorHealth();
      setAdvisorStatus(status);
      if (status.online) {
        const todayEntry = await fetchTodayAdvice();
        if (todayEntry) setAiAdvice(todayEntry);
      }
    })();
  }, [aiEnabled]);

  /* ---------- 实时估值融合 ---------- */

  const liveRows = useMemo(
    () =>
      funds.map((fund) => {
        const valuation = fundValuationFrom(fund, fundValuationsByCode[fund.fd_code]);
        const covered = Number.isFinite(valuation.rate);
        const baseValue = num(fund.market_value);
        return {
          fund,
          valuation,
          covered,
          baseValue,
          liveValue: covered ? baseValue * (1 + valuation.rate / 100) : baseValue,
          estimatedGain: covered ? (baseValue * valuation.rate) / 100 : 0,
          coveredAmount: covered ? baseValue : 0
        };
      }),
    [funds, fundValuationsByCode]
  );

  const liveRowsForCodes = useCallback(
    (codes) => {
      const codeSet = new Set(codes);
      return liveRows.filter((row) => codeSet.has(row.fund.fd_code));
    },
    [liveRows]
  );

  const cashAmount = num(overviewCash?.amount);
  const fundLiveTotal = liveRows.reduce((sum, row) => sum + row.liveValue, 0);
  const totalAssetsLive = fundLiveTotal + cashAmount;
  const isAllAccountsSelected = account?.accountId === ALL_ACCOUNTS_ID;
  const accountCashAmount = isAllAccountsSelected ? cashAmount : 0;
  const accountAssetsLive = fundLiveTotal + accountCashAmount;
  const totalOverviewAmount =
    firstFinite(overview?.data?.amount, overview?.data?.total_assets) ?? num(overviewFund?.amount) + cashAmount;
  const valuationCoveredAmount = liveRows.reduce((sum, row) => sum + row.coveredAmount, 0);
  const estimatedDailyProfit = liveRows.reduce((sum, row) => sum + row.estimatedGain, 0);
  const estimatedDailyReturn = valuationCoveredAmount ? (estimatedDailyProfit / valuationCoveredAmount) * 100 : 0;
  const fundBaseTotal = liveRows.reduce((sum, row) => sum + row.baseValue, 0);
  const valuationCoverageRatio = fundBaseTotal ? (valuationCoveredAmount / fundBaseTotal) * 100 : 0;
  const latestValuationTime =
    liveRows
      .map((row) => row.valuation.time)
      .filter(Boolean)
      .sort()
      .at(-1) || "";

  /* ---------- tag 组合偏移（核心） ---------- */

  const rebalanceThresholdValue = num(strategySettings.rebalanceThreshold);
  const maxSingleFundValue = num(strategySettings.maxSingleFund);
  const targetCashValue = num(strategySettings.targetCash);

  const allocationRows = useMemo(() => {
    const assigned = new Set();
    const rows = [];
    const toAllocationFund = (row) => {
      const dailyGain = finiteNum(row.fund.daily_gain);
      return {
        key: `alloc-fund:${row.fund._accountId || "single"}:${row.fund.fd_code}`,
        code: row.fund.fd_code,
        name: row.fund.fd_name,
        accountName: row.fund._accountName,
        marketValue: row.baseValue,
        liveValue: row.liveValue,
        livePercent: totalAssetsLive ? (row.liveValue / totalAssetsLive) * 100 : 0,
        dailyGain,
        dailyRate: dailyRateOf(row.fund, row.baseValue),
        estimatedRate: row.covered ? row.valuation.rate : null,
        estimatedGain: row.covered ? row.estimatedGain : null,
        estimatedNav: row.covered ? row.valuation.estimatedNav : null,
        valuationTime: row.valuation.time,
        holdGain: finiteNum(row.fund.hold_gain),
        holdGainRate: finiteNum(row.fund.hold_gain_rate),
        nav: finiteNum(row.fund.nav),
        navDate: row.fund.nav_date,
        shares: shareOf(row.fund)
      };
    };

    groups.forEach((group, index) => {
      const items = liveRowsForCodes(group.fundCodes);
      items.forEach((row) => assigned.add(row.fund.fd_code));
      const target = num(group.target);
      if (!items.length && target <= 0) return;
      const liveValue = items.reduce((sum, row) => sum + row.liveValue, 0);
      const estGain = items.reduce((sum, row) => sum + row.estimatedGain, 0);
      const coveredAmount = items.reduce((sum, row) => sum + row.coveredAmount, 0);
      rows.push({
        id: group.id,
        name: group.name,
        editable: true,
        color: ALLOC_COLORS[index % ALLOC_COLORS.length],
        liveValue,
        current: totalAssetsLive ? (liveValue / totalAssetsLive) * 100 : 0,
        target,
        fundCount: items.length,
        holdings: items.map(toAllocationFund),
        liveRate: coveredAmount ? (estGain / coveredAmount) * 100 : null,
        estimatedGain: estGain
      });
    });

    const ungroupedItems = liveRows.filter((row) => !assigned.has(row.fund.fd_code));
    const groupTargetSum = rows.reduce((sum, row) => sum + row.target, 0);
    const ungroupedTarget = Math.max(0, 100 - groupTargetSum - targetCashValue);
    if (ungroupedItems.length) {
      const liveValue = ungroupedItems.reduce((sum, row) => sum + row.liveValue, 0);
      const estGain = ungroupedItems.reduce((sum, row) => sum + row.estimatedGain, 0);
      const coveredAmount = ungroupedItems.reduce((sum, row) => sum + row.coveredAmount, 0);
      rows.push({
        id: UNGROUPED_ID,
        name: "未分组",
        editable: false,
        color: "#94a3b8",
        liveValue,
        current: totalAssetsLive ? (liveValue / totalAssetsLive) * 100 : 0,
        target: ungroupedTarget,
        fundCount: ungroupedItems.length,
        holdings: ungroupedItems.map(toAllocationFund),
        liveRate: coveredAmount ? (estGain / coveredAmount) * 100 : null,
        estimatedGain: estGain
      });
    }

    rows.push({
      id: CASH_ID,
      name: "现金宝",
      editable: true,
      color: "#f59e0b",
      liveValue: cashAmount,
      current: totalAssetsLive ? (cashAmount / totalAssetsLive) * 100 : 0,
      target: targetCashValue,
      fundCount: 0,
      holdings: [],
      liveRate: null,
      estimatedGain: 0
    });

    return rows
      .map((row) => ({
        ...row,
        deviation: row.current - row.target,
        driftAmount: ((row.target - row.current) / 100) * totalAssetsLive
      }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  }, [groups, liveRows, liveRowsForCodes, cashAmount, totalAssetsLive, targetCashValue]);

  const targetSum = useMemo(
    () => allocationRows.reduce((sum, row) => sum + row.target, 0),
    [allocationRows]
  );

  useEffect(() => {
    const expandableIds = new Set(allocationRows.filter((row) => row.holdings?.length).map((row) => row.id));
    setAllocationExpandedIds((ids) => {
      const nextIds = ids.filter((id) => expandableIds.has(id));
      return nextIds.length === ids.length ? ids : nextIds;
    });
  }, [allocationRows]);

  const toggleAllocationRow = (rowId) => {
    setAllocationExpandedIds((ids) =>
      ids.includes(rowId) ? ids.filter((id) => id !== rowId) : [...ids, rowId]
    );
  };

  const onAllocationRowKeyDown = (event, rowId) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleAllocationRow(rowId);
  };

  /* ---------- 每日偏移快照 ---------- */

  useEffect(() => {
    if (!funds.length || !allocationRows.length || !totalAssetsLive) return;
    const today = localDate();
    const byId = Object.fromEntries(
      allocationRows.map((row) => [
        row.id,
        {
          name: row.name,
          current: Number(row.current.toFixed(2)),
          target: Number(row.target.toFixed(2)),
          deviation: Number(row.deviation.toFixed(2))
        }
      ])
    );
    setAllocationHistory((prev) => {
      const existing = prev.find((item) => item.date === today);
      if (existing && JSON.stringify(existing.byId) === JSON.stringify(byId)) return prev;
      const next = [...prev.filter((item) => item.date !== today), { date: today, byId }]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-60);
      storage.set({ allocationHistory: next });
      return next;
    });
  }, [allocationRows, funds.length, storage, totalAssetsLive]);

  const previousSnapshot = useMemo(() => {
    const today = localDate();
    return [...allocationHistory].filter((item) => item.date < today).at(-1) || null;
  }, [allocationHistory]);

  const deviationTrendFor = useCallback(
    (rowId) => {
      const entries = allocationHistory
        .filter((item) => item.byId?.[rowId])
        .slice(-8)
        .map((item) => `${item.date.slice(5)}  偏离 ${signedPercent(item.byId[rowId].deviation)}`);
      return entries.length > 1 ? entries.join("\n") : "";
    },
    [allocationHistory]
  );

  /* ---------- 规则调仓计划 ---------- */

  const allTradeRecords = useMemo(() => {
    const accountNameById = new Map(
      (overviewFund?.invest_account_list || []).map((item) => [item.invest_account_id, item.invest_account_name])
    );
    const entries =
      account?.accountId === ALL_ACCOUNTS_ID
        ? Object.values(tradeRecordsByAccount)
        : [tradeRecordsByAccount[account?.accountId]].filter(Boolean);
    return entries
      .flatMap((entry) =>
        (entry.records || []).map((record, index) => ({
          ...record,
          key: `${entry.accountId}-${record.time}-${record.type}-${index}`,
          accountName: accountNameById.get(entry.accountId) || entry.accountId
        }))
      )
      .sort((a, b) => tradeSortKey(b).localeCompare(tradeSortKey(a)))
  }, [account?.accountId, overviewFund, tradeRecordsByAccount]);
  const visibleTradeRecords = useMemo(() => allTradeRecords.slice(0, 12), [allTradeRecords]);
  const todayTradeRecords = useMemo(() => {
    const today = localDate();
    return allTradeRecords.filter((record) => tradeDateOf(record) === today);
  }, [allTradeRecords]);
  const pendingTrades = allTradeRecords.filter((record) => record.status?.includes("进行中") || record.status?.includes("确认中"));

  const ruleActions = useMemo(() => {
    const actions = allocationRows
      .filter((row) => Math.abs(row.deviation) >= rebalanceThresholdValue)
      .map((row) => {
        const buy = row.deviation < 0;
        return {
          key: row.id,
          name: row.name,
          action: buy ? "加仓" : "减仓",
          actionLabel: `${buy ? "买入" : "卖出"}约 ${money(Math.abs(row.driftAmount))} 元`,
          amount: Math.abs(row.driftAmount),
          tone: buy ? "blue" : "orange",
          note: `当前 ${percent1(row.current)}，目标 ${percent1(row.target)}，偏离 ${signedPercent(row.deviation)}`
        };
      });

    liveRows.forEach((row) => {
      const livePercent = totalAssetsLive ? (row.liveValue / totalAssetsLive) * 100 : 0;
      if (livePercent > maxSingleFundValue) {
        actions.push({
          key: `overweight-${row.fund._accountId || "s"}-${row.fund.fd_code}`,
          name: row.fund.fd_name,
          action: "分散",
          actionLabel: `单只占比 ${percent1(livePercent)}，超上限 ${maxSingleFundValue}%`,
          amount: ((livePercent - maxSingleFundValue) / 100) * totalAssetsLive,
          tone: "red",
          note: `建议将超出部分（约 ${money(((livePercent - maxSingleFundValue) / 100) * totalAssetsLive)} 元）分散到同 tag 其他标的`
        });
      }
    });

    return actions.sort((a, b) => b.amount - a.amount);
  }, [allocationRows, liveRows, maxSingleFundValue, rebalanceThresholdValue, totalAssetsLive]);

  const diagnostics = [
    valuationCoveredAmount
      ? `实时估值覆盖 ${percent(valuationCoverageRatio)}，盘中预估收益 ${signedMoney(estimatedDailyProfit)}（${signedPercent(estimatedDailyReturn)}）。`
      : "暂未获取到实时估值，比例基于最新确认净值。",
    `现金水位 ${percent1(totalAssetsLive ? (cashAmount / totalAssetsLive) * 100 : 0)}（目标 ${targetCashValue}%）。`,
    pendingTrades.length
      ? `有 ${pendingTrades.length} 笔交易进行中，实际比例会在确认后变化。`
      : "当前没有进行中的交易。",
    targetSum > 100.5 || targetSum < 99.5
      ? `注意：目标比例合计 ${percent1(targetSum)}，建议调整为 100%。`
      : `目标比例合计 ${percent1(targetSum)}。`
  ];

  /* ---------- AI 上下文与对话 ---------- */

  const buildAgentContext = useCallback(
    () => ({
      generatedAt: new Date().toISOString(),
      account: account?.accountName || "",
      totalAssets: totalAssetsLive,
      rebalanceThreshold: rebalanceThresholdValue,
      maxSingleFund: maxSingleFundValue,
      intraday: {
        covered: valuationCoveredAmount > 0,
        coverage: valuationCoverageRatio,
        estimatedGain: estimatedDailyProfit,
        rate: estimatedDailyReturn,
        time: latestValuationTime
      },
      allocations: allocationRows.map((row) => ({
        id: row.id,
        name: row.name,
        current: row.current,
        target: row.target,
        deviation: row.deviation,
        liveValue: row.liveValue,
        liveRate: row.liveRate,
        driftAmount: row.driftAmount,
        fundCount: row.fundCount
      })),
      actions: ruleActions,
      pendingTrades: pendingTrades.length,
      todayTrades: todayTradeRecords.map((record) => ({
        type: record.type,
        name: record.name,
        amount: record.amount,
        time: record.time,
        status: record.status,
        accountName: record.accountName
      })),
      recentTrades: visibleTradeRecords.slice(0, 10).map((record) => ({
        type: record.type,
        name: record.name,
        amount: record.amount,
        time: record.time,
        status: record.status,
        accountName: record.accountName
      })),
      holdings: liveRows.map((row) => ({
        code: row.fund.fd_code,
        name: row.fund.fd_name,
        liveValue: row.liveValue,
        estimatedRate: row.covered ? row.valuation.rate : null,
        holdGainRate: num(row.fund.hold_gain_rate)
      })),
      allocationHistory: allocationHistory.slice(-10)
    }),
    [
      account?.accountName,
      allocationHistory,
      allocationRows,
      estimatedDailyProfit,
      estimatedDailyReturn,
      latestValuationTime,
      liveRows,
      maxSingleFundValue,
      pendingTrades.length,
      rebalanceThresholdValue,
      ruleActions,
      todayTradeRecords,
      totalAssetsLive,
      valuationCoverageRatio,
      valuationCoveredAmount,
      visibleTradeRecords
    ]
  );

  const sendChat = async (presetQuestion) => {
    const question = (presetQuestion ?? chatInput).trim();
    if (!question || chatThinking) return;
    if (!aiEnabled) {
      message.warning("请先在设置里填写 Qwen API Key。");
      return;
    }
    const withUser = [...chatMessages, { id: uid(), role: "user", text: question, at: Date.now() }];
    setChatMessages(withUser);
    setChatInput("");
    setChatThinking(true);
    try {
      const history = chatMessages.slice(-10).map((item) => ({ role: item.role, text: item.text }));
      const answer = await askAgent(question, buildAgentContext(), history, qwenApiKey.trim());
      const done = [...withUser, { id: uid(), role: "assistant", text: answer, at: Date.now() }];
      setChatMessages(done);
      await storage.set({ aiChatMessages: done.slice(-60) });
    } finally {
      setChatThinking(false);
    }
  };

  const generateAiAdvice = async () => {
    if (aiAdviceLoading) return;
    if (!aiEnabled) {
      message.warning("请先在设置里填写 Qwen API Key。");
      return;
    }
    setAiAdviceLoading(true);
    setAiAdviceError("");
    try {
      const entry = await requestAiAdvice(buildAgentContext(), qwenApiKey.trim());
      setAiAdvice(entry);
      message.success("今日投研报告已生成，并写入本地投研日志。");
    } catch (error) {
      setAiAdviceError(error.message || String(error));
    } finally {
      setAiAdviceLoading(false);
    }
  };

  const clearChat = async () => {
    setChatMessages([]);
    await storage.set({ aiChatMessages: [] });
  };

  /* ---------- 分组与设置操作 ---------- */

  const addGroup = async (values) => {
    const name = values.name.trim();
    const matchers = values.matchers
      ? values.matchers
          .split(/[,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [name];
    const nextGroups = [...groups, { id: uid(), name, matchers, fundCodes: [], target: num(values.target) }];
    await persistGroups(nextGroups);
    form.resetFields();
  };

  const deleteGroup = async (groupId) => {
    await persistGroups(groups.filter((group) => group.id !== groupId));
  };

  /* ---------- 目标比例编辑器 ---------- */

  const openTargetEditor = () => {
    const draft = Object.fromEntries(groups.map((group) => [group.id, num(group.target)]));
    draft[CASH_ID] = num(strategySettings.targetCash);
    setDraftTargets(draft);
    setTargetEditorOpen(true);
  };

  const draftSum = groups.reduce((sum, group) => sum + num(draftTargets[group.id]), 0) + num(draftTargets[CASH_ID]);
  const draftRemainder = 100 - draftSum;
  const hasUngroupedHoldings = allocationRows.some((row) => row.id === UNGROUPED_ID && row.fundCount > 0);
  const draftValid = draftRemainder >= -0.001 && (hasUngroupedHoldings || Math.abs(draftRemainder) <= 0.001);

  const fillDraftFromCurrent = () => {
    const currentById = new Map(allocationRows.map((row) => [row.id, row.current]));
    const draft = Object.fromEntries(
      groups.map((group) => [group.id, Number((currentById.get(group.id) || 0).toFixed(1))])
    );
    draft[CASH_ID] = Number((currentById.get(CASH_ID) || 0).toFixed(1));
    setDraftTargets(draft);
  };

  const scaleDraftTo100 = () => {
    const ids = [...groups.map((group) => group.id), CASH_ID];
    const sum = ids.reduce((total, id) => total + num(draftTargets[id]), 0);
    if (!sum) return;
    const scaled = {};
    let acc = 0;
    ids.forEach((id, index) => {
      if (index === ids.length - 1) {
        scaled[id] = Number((100 - acc).toFixed(1));
      } else {
        scaled[id] = Number(((num(draftTargets[id]) / sum) * 100).toFixed(1));
        acc += scaled[id];
      }
    });
    setDraftTargets(scaled);
  };

  const saveTargets = async () => {
    const nextGroups = groups.map((group) => ({ ...group, target: num(draftTargets[group.id]) }));
    await persistGroups(nextGroups);
    await updateStrategySetting("targetCash", num(draftTargets[CASH_ID]));
    setTargetEditorOpen(false);
    message.success("目标比例已保存，偏移量将按新目标计算。");
  };

  const updateStrategySetting = async (key, value) => {
    const nextSettings = {
      ...strategySettings,
      [key]: typeof value === "number" ? value : value || DEFAULT_STRATEGY_SETTINGS[key]
    };
    setStrategySettings(nextSettings);
    await storage.set({ strategySettings: nextSettings });
  };

  const updateQwenApiKey = async (value) => {
    const nextKey = String(value || "").trim();
    setQwenApiKey(nextKey);
    await storage.set({ qwenApiKey: nextKey });
    if (!nextKey) {
      setAdvisorStatus({ online: false });
      setAiAdvice(null);
      setAiAdviceError("");
    }
  };

  const importJson = async () => {
    try {
      const nextPayload = normalizePayload(JSON.parse(jsonText));
      setPayload(nextPayload);
      await storage.set({ lastPayload: nextPayload });
      setSourceStatus("已导入粘贴数据");
      setPasteOpen(false);
      setJsonText("");
      message.success("JSON 已导入。");
    } catch (error) {
      message.error(error.message || String(error));
    }
  };

  const switchAccount = async (accountId) => {
    const option = accountOptions.find((item) => item.value === accountId);
    if (!option) return;
    setAccount(option.account);
    setPayload(null);
    await storage.set({
      selectedAccountId: accountId,
      lastAccount: { accountId: option.account.accountId, accountName: option.account.accountName }
    });
    await fetchAssets(option.account, overviewFund?.invest_account_list || []);
  };

  /* ---------- tag 管理选项 ---------- */

  const fundOptions = useMemo(() => {
    const byCode = new Map();
    funds.forEach((fund) => {
      if (!byCode.has(fund.fd_code)) {
        byCode.set(fund.fd_code, { label: `${fund.fd_name} (${fund.fd_code})`, value: fund.fd_code });
      }
    });
    return [...byCode.values()];
  }, [funds]);

  /* ---------- 汇总指标 ---------- */

  const data = payload?.data;
  const dailyGain = firstFinite(data?.daily_gain, overview?.data?.daily_gain) ?? 0;
  const holdGain = firstFinite(data?.hold_gain, overview?.data?.hold_gain) ?? 0;
  const dailyGainDate = data?.daily_gain_date || overview?.data?.daily_gain_date || "";
  const exceededCount = allocationRows.filter((row) => Math.abs(row.deviation) >= rebalanceThresholdValue).length;

  const quickPrompts = advisorStatus.online
    ? ["分析今日操作", "给我调仓建议", "我最大持仓的基金概况", "哪些指数现在低估"]
    : ["分析今日操作", "分析当前偏移", "给我调仓建议", "现金水位如何"];

  /* ---------- 渲染 ---------- */

  const allocationPanel = (
    <section className="work-panel alloc-panel">
      <div className="section-head">
        <div>
          <Text strong>组合比例 · 目标 vs 实时</Text>
          <Text type="secondary">
            比例按盘中实时估值计算 · 偏离超过 ±{rebalanceThresholdValue}% 高亮 · 每日偏移自动留档
          </Text>
        </div>
        <Space>
          <Tag color={targetSum > 100.5 || targetSum < 99.5 ? "orange" : "default"}>目标合计 {percent1(targetSum)}</Tag>
          <Button size="small" type="primary" icon={<SlidersOutlined />} onClick={openTargetEditor}>
            设置目标比例
          </Button>
          <Button size="small" icon={<GroupOutlined />} onClick={() => setGroupDrawerOpen(true)}>
            tag 管理
          </Button>
        </Space>
      </div>
      <div className="alloc-head-row">
        <span>tag</span>
        <span>当前 → 目标</span>
        <span className="alloc-col-target">目标%</span>
        <span className="alloc-col-dev">今日偏离</span>
        <span className="alloc-col-drift">回到目标需</span>
      </div>
      <div className="alloc-list">
        {allocationRows.map((row) => {
          const exceeded = Math.abs(row.deviation) >= rebalanceThresholdValue;
          const expandable = Boolean(row.holdings?.length);
          const expanded = allocationExpandedIds.includes(row.id);
          return (
            <React.Fragment key={row.id}>
              <div
                className={`${exceeded ? "alloc-row exceeded" : "alloc-row"}${expandable ? " is-clickable" : ""}`}
                role={expandable ? "button" : undefined}
                tabIndex={expandable ? 0 : undefined}
                aria-expanded={expandable ? expanded : undefined}
                onClick={expandable ? () => toggleAllocationRow(row.id) : undefined}
                onKeyDown={expandable ? (event) => onAllocationRowKeyDown(event, row.id) : undefined}
              >
                <div className="alloc-name">
                  <div className="alloc-name-title">
                    {expandable ? (
                      <Tooltip title={expanded ? "收起基金" : "展开基金"}>
                        <Button
                          type="text"
                          size="small"
                          className="alloc-expand-btn"
                          icon={expanded ? <DownOutlined /> : <RightOutlined />}
                          aria-label={`${expanded ? "收起" : "展开"}${row.name}基金`}
                          aria-expanded={expanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleAllocationRow(row.id);
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <span className="alloc-expand-spacer" />
                    )}
                    <Text strong>{row.name}</Text>
                    {expandable ? <Tag>{row.fundCount} 只</Tag> : null}
                  </div>
                  <Text type="secondary">
                    {money(row.liveValue)}
                    {Number.isFinite(row.liveRate) ? (
                      <span style={{ color: valueColor(row.liveRate) }}> · 盘中 {signedPercent(row.liveRate)}</span>
                    ) : row.id === CASH_ID ? (
                      " · 现金"
                    ) : (
                      ""
                    )}
                  </Text>
                </div>
                <div className="alloc-bar">
                  <div className="alloc-track">
                    <i style={{ width: `${clamp(row.current, 0, 100)}%`, background: row.color }} />
                    <em className="alloc-target-mark" style={{ left: `${clamp(row.target, 0, 100)}%` }} />
                  </div>
                  <span className="alloc-bar-note">
                    {percent1(row.current)} → {percent1(row.target)}
                  </span>
                </div>
                <div className="alloc-col-target">
                  {row.editable ? (
                    <Text strong style={{ fontVariantNumeric: "tabular-nums" }}>{percent1(row.target)}</Text>
                  ) : (
                    <Tooltip title={`未分组的目标 = 100% − 各 tag 目标 − 现金目标，当前为 ${percent1(row.target)}`}>
                      <Text type="secondary" style={{ fontVariantNumeric: "tabular-nums" }}>{percent1(row.target)}</Text>
                    </Tooltip>
                  )}
                </div>
                <div className="alloc-col-dev">
                  <Tooltip
                    title={deviationTrendFor(row.id) ? <pre className="trend-tip">{deviationTrendFor(row.id)}</pre> : "暂无历史偏移记录"}
                  >
                    <Tag color={exceeded ? (row.deviation > 0 ? "orange" : "blue") : "default"}>{signedPercent(row.deviation)}</Tag>
                  </Tooltip>
                  {previousSnapshot?.byId?.[row.id] ? (
                    <span
                      className="dev-delta"
                      style={{ color: valueColor(row.deviation - previousSnapshot.byId[row.id].deviation) }}
                    >
                      较昨日 {signedPercent(row.deviation - previousSnapshot.byId[row.id].deviation)}
                    </span>
                  ) : null}
                </div>
                <div className="alloc-col-drift">
                  {Math.abs(row.driftAmount) < 1 ? (
                    <Text type="secondary">已平衡</Text>
                  ) : (
                    <Text style={{ color: row.driftAmount > 0 ? "#2775f6" : "#d97706", fontVariantNumeric: "tabular-nums" }}>
                      {row.driftAmount > 0 ? "买入 " : "卖出 "}
                      {money(Math.abs(row.driftAmount))}
                    </Text>
                  )}
                </div>
              </div>
	              {expanded && expandable ? (
	                <div className="alloc-fund-list" role="group" aria-label={`${row.name}基金明细`}>
	                  <div className="alloc-fund-header" aria-hidden="true">
	                    <span>基金</span>
	                    <div className="alloc-fund-metrics">
	                      <span>持仓市值</span>
	                      <span>实时市值</span>
	                      <span>今日涨跌</span>
	                      <span>盘中估值</span>
	                      <span>预估收益</span>
	                      <span>持有收益</span>
	                    </div>
	                  </div>
		                  {row.holdings.map((fund) => (
		                    <div className="alloc-fund-row" key={fund.key}>
	                      <div className="alloc-fund-name">
	                        <Tooltip title="点击查看基金详情页">
                          <a
                            className="alloc-fund-link"
                            href={`https://danjuanfunds.com/funding/${fund.code}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {fund.name}
	                          </a>
	                        </Tooltip>
	                        <Text type="secondary">
	                          {fund.accountName ? `${fund.accountName} · ` : ""}
		                          {fund.code} · 净值 {navDisplay(fund.nav)}
		                          {fund.navDate ? ` · ${fund.navDate}` : ""}
		                          {Number.isFinite(fund.shares) ? ` · 份额 ${money(fund.shares)}` : ""}
		                          {` · 占组合 ${percent1(fund.livePercent)}`}
		                        </Text>
		                        <div className="alloc-fund-track">
		                          <i style={{ width: `${clamp(fund.livePercent, 0, 100)}%`, background: row.color }} />
		                        </div>
			                      </div>
		                      <div className="alloc-fund-metrics">
		                        <FundMetric value={<MoneyText value={fund.marketValue} />} />
		                        <FundMetric value={<MoneyText value={fund.liveValue} />} sub={`占比 ${percent(fund.livePercent)}`} />
		                        <FundMetric
		                          value={<MoneyText value={fund.dailyGain} signed />}
		                          sub={Number.isFinite(fund.dailyRate) ? signedPercent(fund.dailyRate) : null}
		                        />
		                        <FundMetric
		                          value={
		                            Number.isFinite(fund.estimatedRate) ? (
		                              <PercentText value={fund.estimatedRate} signed />
	                            ) : (
	                              <Text type="secondary">--</Text>
	                            )
	                          }
	                          sub={
	                            Number.isFinite(fund.estimatedNav) || fund.valuationTime
	                              ? `${Number.isFinite(fund.estimatedNav) ? `估值 ${navDisplay(fund.estimatedNav)}` : ""}${
	                                  fund.valuationTime ? ` · ${fund.valuationTime.slice(11, 16)}` : ""
	                                }`
		                              : null
		                          }
		                        />
		                        <FundMetric
		                          value={
		                            Number.isFinite(fund.estimatedGain) ? (
		                              <MoneyText value={fund.estimatedGain} signed />
	                            ) : (
	                              <Text type="secondary">--</Text>
		                            )
		                          }
		                        />
		                        <FundMetric
		                          value={<MoneyText value={fund.holdGain} signed />}
		                          sub={Number.isFinite(fund.holdGainRate) ? signedPercent(fund.holdGainRate) : null}
		                        />
	                      </div>
	                    </div>
	                  ))}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );

  const aiReport = aiAdvice?.report || null;
  const advisorInsightContent = (
    <div className="advisor-insights">
      {aiAdviceError ? <Text type="danger">{aiAdviceError}</Text> : null}

      {advisorStatus.online && aiReport ? (
        <div className="ai-summary compact">
          <Text strong>报告摘要</Text>
          <Text type="secondary">{aiReport.summary}</Text>
        </div>
      ) : null}

      <div className="today-actions">
        <div className="today-actions-head">
          <div>
            <Text strong>今日操作</Text>
            <Text type="secondary">
              {todayTradeRecords.length
                ? `${todayTradeRecords.length} 笔真实交易，可直接问 AI 分析`
                : allTradeRecords.length
                ? "今日暂无真实交易记录"
                : "暂无交易记录，打开交易记录页后会自动读取"}
            </Text>
          </div>
          <Space size={4}>
            {aiAdviceLoading ? <Tag color="processing">生成报告中</Tag> : null}
            <Tooltip title="刷新交易记录">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                aria-label="刷新交易记录"
                loading={tradeRefreshing}
                onClick={() => refreshTradeRecords()}
              />
            </Tooltip>
          </Space>
        </div>
        <div className="today-action-list">
          {todayTradeRecords.length ? (
            todayTradeRecords.map((item) => (
              <div key={item.key} className="today-action-row" title={`${item.time} · ${item.status}`}>
                <Tag color={TRADE_ACTION_TONE[item.type] || "default"}>{item.type}</Tag>
                <span>{item.name}</span>
                <strong>{item.amount || "--"}</strong>
                <em>{item.status || shortTradeTime(item)}</em>
              </div>
            ))
          ) : (
            <div className="today-action-empty">
              <LineChartOutlined />
              <span>
                {allTradeRecords.length
                  ? `最近交易：${visibleTradeRecords[0]?.time || "--"} · ${visibleTradeRecords[0]?.type || "--"} · ${
                      visibleTradeRecords[0]?.name || "--"
                    }`
                  : "还没有捕获到交易记录。"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const advisorChatContent = (
    <div className="advisor-chat">
      <div className="chat-body" ref={chatBodyRef}>
        {chatMessages.map((item) => (
          <div key={item.id} className={`chat-msg ${item.role}`}>
            <div className="chat-bubble">
              {item.role === "assistant" ? (
                <div className="chat-markdown">
                  <MarkdownMessage text={item.text} />
                </div>
              ) : (
                item.text
              )}
            </div>
          </div>
        ))}
        {chatThinking ? (
          <div className="chat-msg assistant">
            <div className="chat-bubble thinking">分析中...</div>
          </div>
        ) : null}
      </div>
      <div className="chat-quick">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => sendChat(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <div className="chat-input">
        <Input.TextArea
          value={chatInput}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder="问问当前偏离、估值水位或调仓取舍..."
          onChange={(event) => setChatInput(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              sendChat();
            }
          }}
        />
        <Button type="primary" icon={<SendOutlined />} disabled={!chatInput.trim() || chatThinking} onClick={() => sendChat()} />
      </div>
    </div>
  );

  const dashboardHeader = (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-mark">
          <FundOutlined />
        </div>
        <div>
          <strong>基金组合工作台</strong>
          <span>{aiEnabled ? "tag 比例 · 实时估值 · AI 调仓" : "tag 比例 · 实时估值 · 数据看板"}</span>
        </div>
      </div>

      <div className="header-tools">
        <Select
          value={account?.accountId}
          options={accountOptions.map((item) => ({ value: item.value, label: item.label }))}
          className="account-select"
          style={{ width: 220 }}
          onChange={switchAccount}
          placeholder="选择账户"
        />
        <Tag className="status-tag" color={sourceStatus.includes("失败") ? "red" : "processing"}>
          {sourceStatus}
        </Tag>
        <Tooltip title="刷新估值">
          <Button
            className="header-icon-button"
            icon={<LineChartOutlined />}
            aria-label="刷新估值"
            onClick={() => loadFundValuations(funds.map((fund) => fund.fd_code))}
          />
        </Tooltip>
        <Tooltip title="刷新持仓">
          <Button
            className="header-icon-button"
            icon={<ReloadOutlined />}
            aria-label="刷新持仓"
            loading={loading}
            onClick={() => fetchAssets()}
          />
        </Tooltip>
        <Tooltip title="偏好与数据">
          <Button
            className="header-icon-button"
            icon={<SettingOutlined />}
            aria-label="偏好与数据"
            onClick={() => setSettingsOpen(true)}
          />
        </Tooltip>
      </div>
    </header>
  );

  return (
    <div className="app-shell">
      <div className={`workspace ${aiEnabled ? "" : "ai-disabled"}`}>
        <main className="board-col">
          {dashboardHeader}
	          <section className="summary-panel">
	            <div className="metric-block primary">
	              <Text type="secondary">{isAllAccountsSelected ? "全部账户资产（实时估算）" : "当前账户资产（实时估算）"}</Text>
	              <strong>{money(accountAssetsLive)}</strong>
	              <span>
	                {account?.accountName || "当前账户"} · 基金 {money(fundLiveTotal)}
	                {accountCashAmount ? ` · 现金 ${money(accountCashAmount)}` : ""}
	              </span>
	              <button type="button" className="metric-collapse" onClick={() => setTotalSummaryOpen((open) => !open)}>
	                {totalSummaryOpen ? <DownOutlined /> : <RightOutlined />}
	                <span>总资产总览</span>
	              </button>
	              {totalSummaryOpen ? (
	                <div className="metric-extra">
	                  <div>
	                    <span>全部资产</span>
	                    <strong>{money(totalOverviewAmount)}</strong>
	                  </div>
	                  <div>
	                    <span>全部基金</span>
	                    <strong>{money(num(overviewFund?.amount))}</strong>
	                  </div>
	                  <div>
	                    <span>现金宝</span>
	                    <strong>{money(cashAmount)}</strong>
	                  </div>
	                </div>
	              ) : null}
	            </div>
	            <div className="metric-block estimate">
	              <Text type="secondary">当前账户盘中估值</Text>
              <strong className={estimatedDailyProfit < 0 ? "gain-down" : "gain-up"}>
                {valuationCoveredAmount ? signedMoney(estimatedDailyProfit) : "--"}
              </strong>
              <span>
                {valuationCoveredAmount
                  ? `${signedPercent(estimatedDailyReturn)} · 覆盖 ${percent1(valuationCoverageRatio)}${
                      latestValuationTime ? ` · ${latestValuationTime.slice(11, 16)}` : ""
                    }`
                  : "等待实时估值"}
              </span>
            </div>
	            <div className="metric-block">
	              <Text type="secondary">今日确认收益</Text>
	              <strong className={dailyGain < 0 ? "gain-down" : "gain-up"}>{signedMoney(dailyGain)}</strong>
	              <span>{dailyGainDate}</span>
	            </div>
            <div className="metric-block">
              <Text type="secondary">持有收益</Text>
              <strong className={holdGain < 0 ? "gain-down" : "gain-up"}>{signedMoney(holdGain)}</strong>
              <span>{exceededCount ? `${exceededCount} 个 tag 偏离超阈值` : "配置接近目标"}</span>
            </div>
          </section>

          {allocationPanel}
        </main>

        {aiEnabled ? (
          <aside className="agent-col">
            <section className="agent-panel advisor-panel">
              <div className="agent-panel-head advisor-head">
                <div className="plan-head-title">
                  <Space size={8} wrap>
                    <span className="advisor-mark">
                      <RobotOutlined />
                    </span>
                    <Text strong>投研助手</Text>
                    <Tag color={advisorStatus.online ? "green" : "default"}>
                      {advisorStatus.online ? `AI 在线 · ${advisorStatus.model || "qwen"}` : "AI 离线"}
                    </Tag>
                  </Space>
                  <Text type="secondary">
                    {todayTradeRecords.length ? `${todayTradeRecords.length} 笔今日操作` : "今日无真实操作"} · 组合对话
                  </Text>
                </div>
                <div className="advisor-head-actions">
                  <Tooltip title={advisorStatus.online ? "生成今日报告" : "AI 后端未连接"}>
                    <Button
                      size="small"
                      type={aiAdvice ? "default" : "primary"}
                      icon={<RobotOutlined />}
                      loading={aiAdviceLoading}
                      disabled={!advisorStatus.online}
                      onClick={generateAiAdvice}
                    >
                      报告
                    </Button>
                  </Tooltip>
                  <Tooltip title="清空对话">
                    <Button
                      size="small"
                      type="text"
                      icon={<ClearOutlined />}
                      aria-label="清空 AI 对话"
                      disabled={!chatMessages.length && !chatThinking}
                      onClick={clearChat}
                    />
                  </Tooltip>
                </div>
              </div>
              <div className="advisor-body">
                {advisorInsightContent}
                {advisorChatContent}
              </div>
            </section>
          </aside>
        ) : null}
      </div>

      <Drawer title="偏好与数据" open={settingsOpen} width={400} onClose={() => setSettingsOpen(false)}>
        <div className="settings-stack">
          <Text strong>再平衡规则</Text>
          <div className="setting-row">
            <span>再平衡阈值</span>
            <InputNumber
              size="small"
              min={1}
              max={30}
              value={strategySettings.rebalanceThreshold}
              addonAfter="%"
              onChange={(value) => updateStrategySetting("rebalanceThreshold", num(value))}
            />
          </div>
          <div className="setting-row">
            <span>单只基金上限</span>
            <InputNumber
              size="small"
              min={1}
              max={80}
              value={strategySettings.maxSingleFund}
              addonAfter="%"
              onChange={(value) => updateStrategySetting("maxSingleFund", num(value))}
            />
          </div>
          <Text type="secondary" className="settings-hint">
            各 tag 与现金的目标比例在「组合比例」面板的「设置目标比例」中统一维护。
          </Text>

          <Text strong>AI 投研</Text>
          <div className="setting-card">
            <div className="setting-card-head">
              <span className="setting-label-with-help">
                Qwen API Key
                <Tooltip title="前往阿里云百炼平台获取 API Key">
                  <a
                    href="https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="前往阿里云百炼平台获取 API Key"
                  >
                    <QuestionCircleOutlined />
                  </a>
                </Tooltip>
              </span>
              <Tag color={aiEnabled ? "green" : "default"}>{aiEnabled ? "已开启" : "未开启"}</Tag>
            </div>
            <Input.Password
              size="small"
              allowClear
              value={qwenApiKey}
              placeholder="填入 key 后显示右侧 AI 助手"
              onChange={(event) => updateQwenApiKey(event.target.value)}
            />
            <Text type="secondary" className="settings-hint">
              未设置时隐藏 AI 区域，只保留数据看板。Key 仅保存在本地浏览器存储，并随本机 AI 后端请求发送。
            </Text>
          </div>

          <Text strong>数据与导入</Text>
          <button type="button" className="setting-row" onClick={() => setPasteOpen(true)}>
            <span>接口 JSON 导入</span>
            <UploadOutlined />
          </button>
          <button type="button" className="setting-row" onClick={() => loadFundValuations(funds.map((fund) => fund.fd_code))}>
            <span>实时估值缓存</span>
            <strong>{valuationCoveredAmount ? `${percent1(valuationCoverageRatio)} 覆盖` : "未覆盖"}</strong>
          </button>
          <button type="button" className="setting-row" onClick={() => refreshTradeRecords()}>
            <span>{tradeRefreshing ? "正在刷新交易记录..." : "刷新交易记录"}</span>
            <strong>{visibleTradeRecords.length} 条</strong>
          </button>

          {visibleTradeRecords.length ? (
            <>
              <Text strong>最近交易</Text>
              <div className="trade-list">
                {visibleTradeRecords.map((record) => (
                  <div key={record.key} className="trade-row">
                    <Tag color={record.status?.includes("进行中") ? "processing" : "default"}>{record.type}</Tag>
                    <span className="trade-row-name">{record.name}</span>
                    <span className="trade-row-meta">
                      {record.time} · {record.amount} · {record.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        title="tag 管理"
        open={groupDrawerOpen}
        width={440}
        onClose={() => setGroupDrawerOpen(false)}
      >
        <Form form={form} layout="vertical" onFinish={addGroup}>
          <Form.Item name="name" label="tag 名称" rules={[{ required: true, message: "请输入 tag 名称" }]}>
            <Input size="small" placeholder="例如：红利低波" />
          </Form.Item>
          <Form.Item name="matchers" label="自动匹配关键词">
            <Input size="small" placeholder="多个关键词用空格或逗号分隔" />
          </Form.Item>
          <Form.Item name="target" label="目标比例（%）" initialValue={0}>
            <InputNumber size="small" min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
          <Button size="small" type="primary" htmlType="submit" icon={<PlusOutlined />} block>
            添加 tag
          </Button>
        </Form>

        <div className="drawer-list">
          {groups.map((group) => (
            <Card
              key={group.id}
              size="small"
              title={
                <Space>
                  <Text strong>{group.name}</Text>
                  <Tag>{group.fundCodes.filter((code) => currentFundCodes.has(code)).length} 只</Tag>
                  <Tag color="purple">目标 {num(group.target)}%</Tag>
                </Space>
              }
              extra={
                <Popconfirm title="删除这个 tag？" onConfirm={() => deleteGroup(group.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              }
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text type="secondary">关键词：{group.matchers?.join("、") || "无"}</Text>
                <Select
                  mode="multiple"
                  size="small"
                  allowClear
                  placeholder="选择这个 tag 里的基金"
                  value={group.fundCodes.filter((code) => currentFundCodes.has(code))}
                  options={fundOptions}
                  onChange={async (codes) => {
                    const selected = new Set(codes);
                    const nextGroups = groups.map((item) => {
                      const externalCodes = item.fundCodes.filter((code) => !currentFundCodes.has(code));
                      if (item.id === group.id) {
                        return { ...item, fundCodes: [...externalCodes, ...codes] };
                      }
                      const keptCurrentCodes = item.fundCodes.filter(
                        (code) => currentFundCodes.has(code) && !selected.has(code)
                      );
                      return { ...item, fundCodes: [...externalCodes, ...keptCurrentCodes] };
                    });
                    await persistGroups(nextGroups);
                  }}
                  style={{ width: "100%" }}
                />
              </Space>
            </Card>
          ))}
        </div>
      </Drawer>

      <Modal
        title="设置目标比例"
        open={targetEditorOpen}
        onCancel={() => setTargetEditorOpen(false)}
        width={640}
        footer={[
          <Button key="fill" onClick={fillDraftFromCurrent}>
            按当前比例填充
          </Button>,
          <Button key="scale" onClick={scaleDraftTo100} disabled={draftSum <= 0}>
            等比归一到 100%
          </Button>,
          <Button key="cancel" onClick={() => setTargetEditorOpen(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" disabled={!draftValid} onClick={saveTargets}>
            保存目标
          </Button>
        ]}
      >
        <div className="target-editor">
          <div className="target-editor-summary">
            <div className="target-editor-total">
              <span>已分配</span>
              <strong className={draftRemainder < -0.001 ? "over" : ""}>{percent1(draftSum)}</strong>
              <span>/ 100%</span>
            </div>
            <Progress
              percent={clamp(draftSum)}
              showInfo={false}
              strokeColor={draftRemainder < -0.001 ? "#ef4444" : "#5b3df4"}
            />
            <Text type={draftRemainder < -0.001 ? "danger" : "secondary"}>
              {draftRemainder < -0.001
                ? `超出 ${percent1(-draftRemainder)}，请调低部分目标`
                : hasUngroupedHoldings
                ? `剩余 ${percent1(draftRemainder)} 自动归入「未分组」`
                : draftRemainder > 0.001
                ? `还有 ${percent1(draftRemainder)} 未分配（没有未分组持仓，需分配满 100% 才能保存）`
                : "已分配满 100%"}
            </Text>
          </div>

          <div className="target-editor-list">
            {[...groups.map((group) => ({ id: group.id, name: group.name })), { id: CASH_ID, name: "现金宝" }].map(
              (item) => {
                const currentValue = allocationRows.find((row) => row.id === item.id)?.current || 0;
                return (
                  <div key={item.id} className="target-editor-row">
                    <div className="target-editor-name">
                      <Text strong>{item.name}</Text>
                      <Text type="secondary">当前 {percent1(currentValue)}</Text>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={0.5}
                      value={num(draftTargets[item.id])}
                      tooltip={{ formatter: (value) => `${value}%` }}
                      onChange={(value) => setDraftTargets((prev) => ({ ...prev, [item.id]: num(value) }))}
                    />
                    <InputNumber
                      size="small"
                      min={0}
                      max={100}
                      step={0.5}
                      precision={1}
                      value={num(draftTargets[item.id])}
                      addonAfter="%"
                      onChange={(value) => setDraftTargets((prev) => ({ ...prev, [item.id]: num(value) }))}
                    />
                  </div>
                );
              }
            )}
          </div>
          <Text type="secondary" className="target-editor-hint">
            保存后，看板每天会自动记录一次各 tag 的实际比例和偏移量，鼠标悬停「今日偏离」可查看最近的偏移历史。
          </Text>
        </div>
      </Modal>

      <Modal
        title="粘贴接口返回 JSON"
        open={pasteOpen}
        okText="导入"
        cancelText="取消"
        onOk={importJson}
        onCancel={() => setPasteOpen(false)}
        width={760}
      >
        <Input.TextArea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          placeholder='{"data":{"items":[...]}}'
          autoSize={{ minRows: 12, maxRows: 18 }}
          spellCheck={false}
        />
      </Modal>
    </div>
  );
}

function Root() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorPrimary: "#5b3df4",
          controlHeight: 30,
          fontSize: 13,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
        }
      }}
    >
      <AntApp>
        <FundDashboard />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
