function currentAccount() {
  const url = new URL(window.location.href);
  const accountId =
    url.searchParams.get("accountid") ||
    url.searchParams.get("invest_account_id") ||
    url.searchParams.get("investAccountId");
  const accountName =
    url.searchParams.get("accountname") ||
    url.searchParams.get("invest_account_name") ||
    url.searchParams.get("investAccountName") ||
    "";
  return accountId ? { accountId, accountName } : null;
}

const TRADE_TYPES = ["超级转换", "买入", "卖出", "转换", "定投", "分红", "撤单"];
const STATUS_KEYWORDS = [
  "交易成功",
  "交易失败",
  "交易完成",
  "确认成功",
  "确认失败",
  "确认中",
  "待确认",
  "已确认",
  "已受理",
  "受理中",
  "处理中",
  "撤单成功",
  "撤单失败",
  "已撤单",
  "已完成",
  "完成",
  "失败",
  "成功",
  "进行中"
];
// 前后断言避免匹配到金额里的小数（如 1,500.00元 里的 00.00）
const DATE_RE =
  /(?<![\d.,:])(?:\d{4}[-/.年])?\d{1,2}[-/.月]\d{1,2}日?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?(?![\d元份%])/;
const CLOCK_RE = /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/;
const AMOUNT_RE = /[-+]?\d[\d,]*(?:\.\d+)?\s*(?:元|份)/;
// 记录行里可能混入的净值/预计确认日期，不是交易时间
const DATE_NOISE_RE = /净值|估值|预计|确认日|发放|到账/;
const FIELD_LABEL_RE =
  /^(交易类型|类型|基金名称|产品名称|标的|申请时间|交易时间|确认时间|时间|金额|份额|交易状态|状态)\s*[:：]?\s*/;

function cleanTradeLine(line) {
  return String(line || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFieldLabel(line) {
  const cleaned = cleanTradeLine(line);
  if (FIELD_LABEL_RE.test(cleaned) && !cleaned.replace(FIELD_LABEL_RE, "").trim()) return "";
  const stripped = cleaned.replace(FIELD_LABEL_RE, "").trim();
  return stripped || cleaned;
}

function normalizeTradeLines(text) {
  const rawLines = text
    .split(/\n+/)
    .map(cleanTradeLine)
    .filter(Boolean);
  const lines = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    if (rawLines[index] === "超级" && rawLines[index + 1] === "转换") {
      lines.push("超级转换");
      index += 1;
    } else {
      const line = stripFieldLabel(rawLines[index]);
      if (line) lines.push(line);
    }
  }
  return lines;
}

function getTradeType(line) {
  return TRADE_TYPES.find((type) => line === type || line.startsWith(`${type} `) || line.startsWith(`${type}：`));
}

function getStatus(line) {
  return STATUS_KEYWORDS.find((status) => line.includes(status)) || "";
}

function normalizeDate(value) {
  const match = String(value || "").match(DATE_RE);
  if (!match) return "";
  const clock = match[0].match(CLOCK_RE)?.[0] || "";
  const dateText = clock ? match[0].slice(0, match[0].indexOf(clock)) : match[0];
  const parts = dateText.match(/\d+/g) || [];
  const [year, month, day] =
    parts.length >= 3 ? parts : [String(new Date().getFullYear()), ...parts];
  if (!month || !day) return "";
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return clock ? `${date} ${clock}` : date;
}

// 日期分组的组头行：只有日期（可带星期），没有时钟和其他内容
function isStandaloneDate(line) {
  const match = line.match(DATE_RE);
  if (!match || CLOCK_RE.test(line)) return false;
  const leftover = line
    .replace(match[0], "")
    .replace(/[年月日号\s]|周[一二三四五六日天]|星期[一二三四五六日天]|今天|昨天/g, "");
  return !leftover;
}

function extractTradeTime(lines, contextDate) {
  const candidates = lines
    .map((line, index) => {
      const match = line.match(DATE_RE);
      if (!match) return null;
      return {
        index,
        time: normalizeDate(match[0]),
        hasClock: CLOCK_RE.test(match[0]),
        noisy: DATE_NOISE_RE.test(line)
      };
    })
    .filter((item) => item?.time);
  const statusIndex = lines.findIndex((line) => getStatus(line));

  // 1. 带时钟的日期最可靠，一定是这条记录自己的交易时间
  const withClock = candidates.find((item) => item.hasClock && !item.noisy);
  if (withClock) return withClock.time;
  // 2. 只有时钟没有日期（按日期分组的列表），用当前分组的日期拼起来
  const clockOnly = lines
    .map((line) => (DATE_RE.test(line) ? "" : line.match(CLOCK_RE)?.[0] || ""))
    .find(Boolean);
  if (clockOnly && contextDate) return `${contextDate} ${clockOnly}`;
  // 3. 状态行之前的普通日期；状态行之后的日期很可能是下一组的组头，不能用
  const beforeStatus = candidates.find(
    (item) => !item.noisy && (statusIndex < 0 || item.index <= statusIndex)
  );
  if (beforeStatus) return beforeStatus.time;
  if (contextDate) return contextDate;
  return candidates.find((item) => !item.noisy)?.time || candidates[0]?.time || "";
}

function isLikelyName(line) {
  if (!line || getTradeType(line) || getStatus(line) || DATE_RE.test(line) || CLOCK_RE.test(line) || AMOUNT_RE.test(line))
    return false;
  if (/^(交易记录|全部|筛选|查询|近|暂无|加载|查看更多|买入|卖出|转换|定投|分红|撤单)$/.test(line)) return false;
  return true;
}

function parseTradeChunk(type, chunk, contextDate) {
  const normalized = chunk.map(stripFieldLabel).filter(Boolean);
  const joined = normalized.join(" ");
  const time = extractTradeTime(normalized, contextDate);
  const amount = joined.match(AMOUNT_RE)?.[0]?.replace(/\s+/g, "") || "";
  const status = normalized.map(getStatus).find(Boolean) || getStatus(joined);
  const dateIndex = normalized.findIndex((line) => DATE_RE.test(line) || CLOCK_RE.test(line));
  const nameLines = normalized.filter((line, index) => {
    if (index === 0 && getTradeType(line)) return false;
    if (dateIndex >= 0 && index > dateIndex) return false;
    return isLikelyName(line);
  });
  const name = nameLines[0] || "";

  if (!time || !amount || !status || !name) return null;
  return { type, name, time, amount, status };
}

function parseTradeRecordsFromText(text) {
  const lines = normalizeTradeLines(text);
  const records = [];
  let contextDate = "";

  for (let index = 0; index < lines.length; index += 1) {
    if (isStandaloneDate(lines[index])) {
      contextDate = normalizeDate(lines[index]).slice(0, 10);
      continue;
    }
    const type = getTradeType(lines[index]);
    if (!type) continue;

    const nextTypeIndex = lines.findIndex((line, nextIndex) => nextIndex > index && getTradeType(line));
    const endIndex = nextTypeIndex > index ? nextTypeIndex : Math.min(lines.length, index + 14);
    const record = parseTradeChunk(type, lines.slice(index, endIndex), contextDate);
    if (record) records.push(record);
  }

  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.type}|${record.name}|${record.time}|${record.amount}|${record.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function captureTradeRecords(account) {
  if (!window.location.href.includes("trade-record")) return;
  const records = parseTradeRecordsFromText(document.body.innerText || "");
  if (!records.length) return;
  chrome.runtime.sendMessage({
    type: "save-trade-records",
    accountId: account?.accountId || currentAccount()?.accountId || "all",
    records
  });
}

let lastTradeSignature = "";
let tradeCaptureTimer = null;

function scheduleTradeCapture(account, delay = 300) {
  if (!window.location.href.includes("trade-record")) return;
  window.clearTimeout(tradeCaptureTimer);
  tradeCaptureTimer = window.setTimeout(() => {
    const records = parseTradeRecordsFromText(document.body.innerText || "");
    const signature = JSON.stringify(records.slice(0, 12));
    if (!records.length || signature === lastTradeSignature) return;
    lastTradeSignature = signature;
    chrome.runtime.sendMessage({
      type: "save-trade-records",
      accountId: account?.accountId || currentAccount()?.accountId || "all",
      records
    });
  }, delay);
}

function injectDashboardButton(account) {
  if (document.getElementById("xq-aggregate-entry")) return;

  const button = document.createElement("button");
  button.id = "xq-aggregate-entry";
  button.type = "button";
  button.textContent = "桌面看板";
  button.style.cssText = [
    "position: fixed",
    "right: 18px",
    "bottom: 92px",
    "z-index: 2147483647",
    "height: 40px",
    "padding: 0 14px",
    "border: 0",
    "border-radius: 20px",
    "background: #111827",
    "color: #fff",
    "font-size: 14px",
    "font-weight: 700",
    "box-shadow: 0 10px 24px rgba(17,24,39,.24)",
    "cursor: pointer"
  ].join(";");

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "open-dashboard", account });
  });

  document.documentElement.appendChild(button);
}

const account = currentAccount();
if (account) {
  chrome.runtime.sendMessage({ type: "account-seen", account });
}
injectDashboardButton(account);
captureTradeRecords(account);
setTimeout(() => captureTradeRecords(account), 1200);
scheduleTradeCapture(account);
setTimeout(() => scheduleTradeCapture(account), 1600);
setTimeout(() => scheduleTradeCapture(account), 4000);

if (window.location.href.includes("trade-record")) {
  const observer = new MutationObserver(() => scheduleTradeCapture(account, 500));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(() => observer.disconnect(), 15000);
}
