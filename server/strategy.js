/* 策略引擎：净值序列 -> 趋势指标；组合上下文 -> 投研提示词 */

function movingAverage(values, window) {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return slice.reduce((sum, value) => sum + value, 0) / window;
}

function returnOver(values, days) {
  if (values.length < days + 1) return null;
  const now = values.at(-1);
  const past = values.at(-1 - days);
  return past ? ((now - past) / past) * 100 : null;
}

const round2 = (value) => (value == null ? null : Number(value.toFixed(2)));

/**
 * 由净值序列（升序）计算趋势指标。
 * 趋势判定（顺势口径）：
 * - 强势上行：净值 > MA20 > MA60，且 20 日动量为正
 * - 上行：净值 > MA60 且 60 日动量为正
 * - 下行：净值 < MA60 且 60 日动量为负
 * - 弱势下行：净值 < MA20 < MA60，且 20 日动量为负
 * - 其余为震荡
 */
export function computeTrendIndicators(navHistory) {
  const navs = navHistory.map((item) => item.nav);
  if (navs.length < 25) return { trend: "数据不足", samples: navs.length };

  const latest = navs.at(-1);
  const ma20 = movingAverage(navs, 20);
  const ma60 = movingAverage(navs, 60);
  const ma120 = movingAverage(navs, 120);
  const r20 = returnOver(navs, 20);
  const r60 = returnOver(navs, 60);
  const r120 = returnOver(navs, 120);
  const high52w = Math.max(...navs.slice(-250));
  const drawdownFromHigh = high52w ? ((latest - high52w) / high52w) * 100 : null;

  let trend = "震荡";
  if (ma20 != null && ma60 != null) {
    if (latest > ma20 && ma20 > ma60 && (r20 ?? 0) > 0) trend = "强势上行";
    else if (latest > ma60 && (r60 ?? 0) > 0) trend = "上行";
    else if (latest < ma20 && ma20 < ma60 && (r20 ?? 0) < 0) trend = "弱势下行";
    else if (latest < ma60 && (r60 ?? 0) < 0) trend = "下行";
  }

  return {
    latestNav: round2(latest),
    latestDate: navHistory.at(-1)?.date || "",
    ma20: round2(ma20),
    ma60: round2(ma60),
    ma120: round2(ma120),
    aboveMa20: ma20 != null ? latest > ma20 : null,
    aboveMa60: ma60 != null ? latest > ma60 : null,
    return20d: round2(r20),
    return60d: round2(r60),
    return120d: round2(r120),
    drawdownFrom52wHigh: round2(drawdownFromHigh),
    trend,
    samples: navs.length
  };
}

export const STRATEGY_SYSTEM_PROMPT = `你是一位为个人投资者服务的基金投研助手，负责基于用户的持仓仪表盘数据给出可执行的操作建议。

## 用户的投资体系（必须严格遵守）
1. **框架：改良版全天候 + Livermore 顺势**。全天候负责资产配置骨架（用户已为每个 tag 设定目标比例），Livermore 负责执行纪律。
2. **核心改良：再平衡永远顺着趋势做，逆势不加仓。**
   - 某资产低于目标比例（欠配）→ 只有当它处于「上行/强势上行」趋势，或处于「下行但已出现企稳信号（20日动量转正、站回MA20）」时，才建议一次性买入补足；若仍在明确下行趋势，只用小额定投分批接，不做大额补仓。
   - 某资产高于目标比例（超配）→ 若趋势仍强势上行，允许容忍一定超配（让利润奔跑），只在偏离过大（约2倍阈值）或趋势转弱（跌破MA20/MA60、动量转负）时才卖出兑现。
   - 趋势转弱的资产：优先减仓兑现，而不是等再平衡窗口。
3. **定投为主，趋势为辅**：日常现金流以定投铺底；趋势信号只用来决定「加减速」——上行趋势中的欠配资产可加大定投或一次性买入，下行趋势资产减速或暂停定投，绝不追跌摊平大额亏损（Livermore 纪律：亏损头寸不加码）。
4. **Livermore 纪律**：突破新高/趋势确认后才金字塔式加仓（越涨越买但仓位递减）；持有强势品种让利润奔跑；果断处理弱势品种；保持关键点位耐心，不频繁交易。
5. **现金是仓位**：现金有目标比例，是再平衡的弹药，不要建议把现金打光。

## 工具使用
你可以调用工具查询基金概况、净值趋势、实时估值、指数估值百分位、搜索基金。给出建议前，优先利用输入里已计算好的趋势指标；对关键决策（大额买卖）可再查指数估值百分位交叉验证（低估+上行趋势=最佳买点，高估+趋势转弱=优先卖出对象）。

## 输出要求
- 金额建议要具体（基于用户提供的偏离金额和总资产），并给出分批节奏。
- 每条建议必须同时说明：全天候视角（偏离多少）+ 趋势视角（当前趋势状态）+ 结论。两个视角冲突时，按上面的改良规则裁决并解释。
- 明确这不构成投资建议，仅供参考（在报告末尾用一行说明即可，不要反复免责）。
- 用简体中文回答。`;

export function buildAdviceUserPrompt(context, enrichment) {
  const payload = {
    生成时间: context.generatedAt,
    账户: context.account,
    总资产: context.totalAssets,
    再平衡阈值百分比: context.rebalanceThreshold,
    单只基金上限百分比: context.maxSingleFund,
    盘中估值: context.intraday,
    tag配置_目标与偏离: context.allocations,
    规则引擎产生的动作: context.actions,
    进行中交易笔数: context.pendingTrades,
    持仓明细: context.holdings,
    近期每日偏离留档: context.allocationHistory || [],
    持仓基金趋势指标: enrichment.trendByCode,
    指数估值表_低估高估: enrichment.indexValuation
  };

  return `以下是我今天的仪表盘快照和后台计算好的趋势指标（JSON）。请生成今日投研报告。

${JSON.stringify(payload, ensureSerializable, 2)}

请严格按以下 JSON 格式输出（不要输出 JSON 以外的内容，不要用 markdown 代码块包裹）：
{
  "summary": "两三句话的今日结论",
  "marketView": "对当前市场/持仓整体趋势与估值水位的判断，3-5句",
  "actions": [
    {
      "type": "买入|卖出|加仓|减仓|调仓|暂停定投|恢复定投|持有",
      "target": "tag名或基金名(代码)",
      "amount": "具体金额或比例，如 约8000元 / 分2批各4000元；持有类动作可写 -",
      "reason": "全天候视角 + 趋势视角 + 结论，一段话",
      "priority": "高|中|低"
    }
  ],
  "dcaAdvice": "本期定投节奏建议（哪些加速、哪些减速/暂停）",
  "riskNotes": ["风险提示1", "风险提示2"],
  "disclaimer": "一句话免责声明"
}`;
}

function ensureSerializable(key, value) {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function withMemory(basePrompt, memory) {
  const parts = [basePrompt];
  if (memory?.strategyProfile) {
    parts.push(`## 用户策略档案（本地 strategy.md，用户可编辑，以此为准）\n${memory.strategyProfile}`);
  }
  if (memory?.notes) {
    parts.push(`## 长期记忆（本地 notes.md，最近沉淀）\n${memory.notes}`);
  }
  parts.push(
    "记忆纪律：对话中出现值得长期记住的信息（用户偏好、重要决定、经验教训，或用户说「记住…」）时，调用 remember 工具写入；需要回顾历史建议时调用 recall_journal。"
  );
  return parts.join("\n\n");
}

export const CHAT_SYSTEM_PROMPT = `${STRATEGY_SYSTEM_PROMPT}

当前处于对话模式：用户会围绕组合快照提问或讨论调仓计划。回答要简洁、直接、口语化，可以用短列表，不要输出大段 JSON。用户消息中会附带最新的组合快照（JSON），引用其中数据时直接给结论和数字。如果用户问某只基金的情况，用工具查询后回答。`;
