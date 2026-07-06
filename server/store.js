import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const ADVICE_FILE = path.join(config.dataDir, "advice-history.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(ADVICE_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function saveAdvice(entry) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const all = readAll().filter((item) => item.date !== entry.date);
  all.push(entry);
  all.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(ADVICE_FILE, JSON.stringify(all.slice(-90), null, 2));
}

export function listAdvice(limit = 30) {
  return readAll().slice(-limit).reverse();
}

export function adviceForDate(date) {
  return readAll().find((item) => item.date === date) || null;
}
