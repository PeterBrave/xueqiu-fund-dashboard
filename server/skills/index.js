import {
  brokerReports,
  fundNavHistory,
  fundProfile,
  fundRealtimeEstimate,
  indexValuationTable,
  searchFund
} from "./sources.js";
import { computeTrendIndicators } from "../strategy.js";
import { appendNote, listJournalDates, readJournal, readNotes } from "../memory.js";

/* Agent 可调用的 skills（Qwen function calling 工具集） */

export const skills = [
  {
    name: "fund_profile",
    description: "查询一只基金的概况：基金类型、规模、基金公司、基金经理、成立日期、近1年/3年收益、股债现金仓位、前十大重仓股、风险等级。",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "6位基金代码，如 110020" }
      },
      required: ["code"]
    },
    handler: async ({ code }) => fundProfile(String(code).trim())
  },
  {
    name: "fund_nav_trend",
    description: "查询一只基金的净值走势与趋势指标：最新净值、MA20/MA60/MA120、近20/60/120日涨跌幅、距52周高点回撤、趋势判定（强势上行/上行/震荡/下行/弱势下行）。",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "6位基金代码" }
      },
      required: ["code"]
    },
    handler: async ({ code }) => {
      const history = await fundNavHistory(String(code).trim(), 300);
      return {
        code,
        indicators: computeTrendIndicators(history),
        recentNavs: history.slice(-10)
      };
    }
  },
  {
    name: "fund_realtime_estimate",
    description: "查询一只基金的盘中实时估值：预估净值、预估涨跌幅、估值时间。QDII与部分债基没有实时估值。",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "6位基金代码" }
      },
      required: ["code"]
    },
    handler: async ({ code }) => fundRealtimeEstimate(String(code).trim())
  },
  {
    name: "index_valuation",
    description: "查询全市场主要指数的估值表：PE/PB及其历史百分位、ROE、低估/正常/高估状态。用于判断买卖时点的估值水位。",
    parameters: { type: "object", properties: {} },
    handler: async () => indexValuationTable()
  },
  {
    name: "broker_reports",
    description: "查询券商最新研报列表（东方财富研报库）：策略报告、宏观研究、行业研报、个股研报。返回标题、券商、日期、评级、PDF链接。用于了解卖方对市场/行业的最新观点。",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["strategy", "macro", "industry", "stock"],
          description: "研报类型：strategy=策略报告，macro=宏观研究，industry=行业研报，stock=个股研报"
        },
        stockCode: { type: "string", description: "个股研报时的股票代码（6位），可选" },
        days: { type: "number", description: "回看天数，默认14" },
        limit: { type: "number", description: "返回条数，默认10，最大20" }
      }
    },
    handler: async ({ type, stockCode, days, limit }) =>
      brokerReports({
        type: type || "strategy",
        stockCode: stockCode || "",
        days: Math.min(Number(days) || 14, 60),
        limit: Math.min(Number(limit) || 10, 20)
      })
  },
  {
    name: "remember",
    description: "把一条值得长期记住的信息写入本地记忆文件（用户偏好、重要决定、经验教训、用户明确要求记住的事）。写入后未来的对话和投研报告都能看到。",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "要记住的内容，一句话说清楚" }
      },
      required: ["note"]
    },
    handler: async ({ note }) => appendNote(note)
  },
  {
    name: "recall_journal",
    description: "查询过往投研日志：不带 date 时返回有日志的日期列表；带 date（YYYY-MM-DD）时返回当天完整投研日志。用于回顾之前给过什么建议、对比执行情况。",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "日期 YYYY-MM-DD，可选" }
      }
    },
    handler: async ({ date }) =>
      date ? readJournal(String(date).trim()) : { dates: listJournalDates(30), notes: readNotes(2000) }
  },
  {
    name: "search_fund",
    description: "按关键词搜索基金，返回代码、名称、类型、基金经理。用于用户提到基金名但没给代码时。",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "基金名称关键词，如 纳斯达克100" }
      },
      required: ["keyword"]
    },
    handler: async ({ keyword }) => searchFund(String(keyword).trim())
  }
];

export const toolDefinitions = skills.map((skill) => ({
  type: "function",
  function: {
    name: skill.name,
    description: skill.description,
    parameters: skill.parameters
  }
}));

export async function executeSkill(name, args) {
  const skill = skills.find((item) => item.name === name);
  if (!skill) return { error: `未知工具: ${name}` };
  try {
    return await skill.handler(args || {});
  } catch (error) {
    return { error: error.message || String(error) };
  }
}
