import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/* Agent 记忆：本地 markdown 文件，用户可直接阅读和编辑 */

const DEFAULT_STRATEGY_MD = `# 我的投资策略档案

> 这份文件是投研助手的「策略记忆」，每次生成建议前都会完整读入。
> 你可以随时用任何编辑器修改，保存后下一次生成建议即生效。

## 核心框架
- 改良版全天候：按 tag 设定目标比例做资产配置，再平衡永远顺着趋势做，逆势不加仓。
- Livermore 纪律：突破/趋势确认后金字塔式加仓；亏损头寸不加码；果断处理弱势品种。
- 定投为主，趋势为辅：现金流以定投铺底，趋势信号只决定加减速。

## 个人偏好（可自行补充）
- 再平衡执行偏好：分批执行，单批不超过偏离金额的一半。
- 风险偏好：
- 禁止事项：

## 长期观点（可自行补充）
-
`;

const NOTES_HEADER = `# 投研助手长期记忆

> 由 AI 在对话和投研过程中自动沉淀，也可以手动编辑。每条记忆带有日期。

`;

function memoryDir() {
  return config.memoryDir;
}

function journalDir() {
  return path.join(memoryDir(), "journal");
}

export function ensureMemoryScaffold() {
  fs.mkdirSync(journalDir(), { recursive: true });
  const strategyPath = path.join(memoryDir(), "strategy.md");
  if (!fs.existsSync(strategyPath)) fs.writeFileSync(strategyPath, DEFAULT_STRATEGY_MD);
  const notesPath = path.join(memoryDir(), "notes.md");
  if (!fs.existsSync(notesPath)) fs.writeFileSync(notesPath, NOTES_HEADER);
}

function readFileSafe(filePath, maxChars = 8000) {
  try {
    return fs.readFileSync(filePath, "utf8").slice(-maxChars);
  } catch {
    return "";
  }
}

export function readStrategyProfile() {
  return readFileSafe(path.join(memoryDir(), "strategy.md"), 6000);
}

export function readNotes(maxChars = 4000) {
  return readFileSafe(path.join(memoryDir(), "notes.md"), maxChars);
}

export function appendNote(note) {
  ensureMemoryScaffold();
  const stamp = new Date().toLocaleString("sv-SE").slice(0, 16);
  const entry = `- **${stamp}** ${String(note).trim().replace(/\n+/g, " ")}\n`;
  fs.appendFileSync(path.join(memoryDir(), "notes.md"), entry);
  return { saved: true, file: path.join(memoryDir(), "notes.md") };
}

export function writeJournal(date, markdown) {
  ensureMemoryScaffold();
  const filePath = path.join(journalDir(), `${date}.md`);
  fs.writeFileSync(filePath, markdown);
  return filePath;
}

export function readJournal(date) {
  const filePath = path.join(journalDir(), `${date}.md`);
  return { date, content: readFileSafe(filePath, 8000) || "（该日期没有投研日志）" };
}

export function listJournalDates(limit = 30) {
  try {
    return fs
      .readdirSync(journalDir())
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.replace(/\.md$/, ""))
      .sort()
      .slice(-limit);
  } catch {
    return [];
  }
}

/** 把投研报告转成日志 markdown 落盘 */
export function journalFromReport(entry) {
  const report = entry.report || {};
  const lines = [
    `# 投研日志 ${entry.date}`,
    "",
    `- 账户：${entry.account || "-"}`,
    `- 总资产：${Math.round(entry.totalAssets || 0).toLocaleString("zh-CN")} 元`,
    `- 模型：${entry.model} · 生成于 ${entry.generatedAt}`,
    "",
    "## 结论",
    report.summary || "-",
    "",
    "## 市场观察",
    report.marketView || "-",
    "",
    "## 操作建议"
  ];
  for (const action of report.actions || []) {
    lines.push(`- 【${action.priority || "中"}】**${action.type} · ${action.target}** ${action.amount || ""}`);
    lines.push(`  - ${action.reason || ""}`);
  }
  lines.push("", "## 定投节奏", report.dcaAdvice || "-", "", "## 风险提示");
  for (const risk of report.riskNotes || []) lines.push(`- ${risk}`);
  lines.push("");
  return lines.join("\n");
}
