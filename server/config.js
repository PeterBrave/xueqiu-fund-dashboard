import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(SERVER_DIR, ".env");
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

const fileEnv = loadEnvFile();

export const config = {
  port: Number(process.env.PORT || fileEnv.PORT || 8787),
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY || fileEnv.DASHSCOPE_API_KEY || "",
  dashscopeBaseUrl:
    process.env.DASHSCOPE_BASE_URL ||
    fileEnv.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: process.env.QWEN_MODEL || fileEnv.QWEN_MODEL || "qwen-plus",
  dataDir: path.join(SERVER_DIR, "data"),
  // Agent 记忆（markdown）存放目录，默认在用户文档目录下，方便直接查看和编辑
  memoryDir:
    process.env.MEMORY_DIR ||
    fileEnv.MEMORY_DIR ||
    path.join(os.homedir(), "Documents", "xueqiu-advisor-memory")
};

if (!config.dashscopeApiKey) {
  console.warn("[config] 未找到 DASHSCOPE_API_KEY，请在 server/.env 中配置。");
}
