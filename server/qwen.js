import { config } from "./config.js";
import { executeSkill, toolDefinitions } from "./skills/index.js";

async function chatCompletion(messages, { useTools = true, temperature = 0.4, apiKey = "" } = {}) {
  const dashscopeApiKey = apiKey || config.dashscopeApiKey;
  if (!dashscopeApiKey) throw new Error("缺少 Qwen API Key");

  const body = {
    model: config.model,
    messages,
    temperature
  };
  if (useTools) {
    body.tools = toolDefinitions;
    body.parallel_tool_calls = true;
  }

  const response = await fetch(`${config.dashscopeBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dashscopeApiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`千问接口 ${response.status}: ${text.slice(0, 300)}`);
  }
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error("千问接口返回为空");
  return { message, usage: payload.usage };
}

/**
 * Agent 循环：模型可多轮调用 skills 查数据，直到给出最终回答。
 * 返回 { content, toolTrace, usage }
 */
export async function runAgent(messages, { maxTurns = 6, temperature = 0.4, apiKey = "" } = {}) {
  const conversation = [...messages];
  const toolTrace = [];
  let totalTokens = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const isLastTurn = turn === maxTurns - 1;
    const { message, usage } = await chatCompletion(conversation, {
      useTools: !isLastTurn,
      temperature,
      apiKey
    });
    totalTokens += usage?.total_tokens || 0;

    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      return { content: message.content || "", toolTrace, totalTokens };
    }

    conversation.push({
      role: "assistant",
      content: message.content || "",
      tool_calls: toolCalls
    });

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        let args = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          /* 保留空参数 */
        }
        const result = await executeSkill(call.function?.name, args);
        toolTrace.push({ tool: call.function?.name, args, ok: !result?.error });
        return { call, result };
      })
    );

    for (const { call, result } of results) {
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000)
      });
    }
  }

  return { content: "分析轮次超限，请重试。", toolTrace, totalTokens };
}

/** 从模型输出中提取 JSON（容忍 markdown 代码块包裹） */
export function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
