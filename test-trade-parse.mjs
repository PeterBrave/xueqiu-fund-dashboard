import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("src/content.js", "utf8");
const cut = source.indexOf("function captureTradeRecords");
const context = { window: undefined, console };
vm.createContext(context);
vm.runInContext(`${source.slice(0, cut)}; globalThis.parse = parseTradeRecordsFromText;`, context);
const parse = context.parse;

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.log(`FAIL ${name}`);
    console.log("  actual:  ", JSON.stringify(actual, null, 2));
    console.log("  expected:", JSON.stringify(expected, null, 2));
  } else {
    console.log(`PASS ${name}`);
  }
}

// 场景 1：按日期分组的列表（组头是日期，记录里只有时钟）
// 旧代码：7.6 组最后一条会把下一组组头 07-03 当成自己的时间，其余记录因无日期被丢弃
const grouped = `
交易记录
07-06
买入
易方达沪深300ETF联接A
1,500.00元
15:23
确认中
定投
广发纳斯达克100指数A
2,000.00元
09:10
确认中
07-03
买入
博时标普500ETF联接A
1,000.00元
14:02
交易成功
`;
check(
  "分组列表",
  parse(grouped),
  [
    { type: "买入", name: "易方达沪深300ETF联接A", time: "2026-07-06 15:23", amount: "1,500.00元", status: "确认中" },
    { type: "定投", name: "广发纳斯达克100指数A", time: "2026-07-06 09:10", amount: "2,000.00元", status: "确认中" },
    { type: "买入", name: "博时标普500ETF联接A", time: "2026-07-03 14:02", amount: "1,000.00元", status: "交易成功" }
  ]
);

// 场景 2：每行带完整日期时间，但金额小数、净值日期都可能被误认为日期
const flat = `
买入
易方达沪深300ETF联接A
最新净值 1.6920 07-03
1,500.00元
2026-07-06 15:23
确认中
卖出
南方中证全债指数A
20,007.30元
2026/7/6 9:05
交易成功
`;
check(
  "平铺列表（含净值日期与金额小数干扰）",
  parse(flat),
  [
    { type: "买入", name: "易方达沪深300ETF联接A", time: "2026-07-06 15:23", amount: "1,500.00元", status: "确认中" },
    { type: "卖出", name: "南方中证全债指数A", time: "2026-07-06 9:05", amount: "20,007.30元", status: "交易成功" }
  ]
);

// 场景 3：日期单独一行且不带时钟（旧格式），仍能解析
const plainDate = `
定投
广发创业板ETF联接A
07-06
2,000.00元
已完成
`;
check(
  "记录内独立日期行",
  parse(plainDate),
  [{ type: "定投", name: "广发创业板ETF联接A", time: "2026-07-06", amount: "2,000.00元", status: "已完成" }]
);

// 场景 4：中文日期组头
const cnGrouped = `
7月6日 周一
超级
转换
易方达科创50ETF联接A
3,000.00元
10:31
受理中
`;
check(
  "中文日期组头 + 跨行超级转换",
  parse(cnGrouped),
  [{ type: "超级转换", name: "易方达科创50ETF联接A", time: "2026-07-06 10:31", amount: "3,000.00元", status: "受理中" }]
);

process.exit(failures ? 1 : 0);
