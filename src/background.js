const SUMMARY_URL =
  "https://danjuanfunds.com/djapi/fundx/profit/assets/summary?invest_account_id=";
const OVERVIEW_GAIN_URL =
  "https://danjuanfunds.com/djapi/fundx/profit/assets/gain?gains=%5B%22private%22%5D";
const OVERVIEW_ICON_URL = "https://danjuanfunds.com/djapi/fundx/profit/assets/queryIcon/djhome";
const FUND_DETAIL_URL = "https://danjuanfunds.com/djapi/fund/detail/";
const FUND_VALUATION_URL = "https://fundgz.1234567.com.cn/js/";
const TRADE_RECORD_URL = "https://danjuanfunds.com/rn/trade-record";

/* ---- 自动刷新交易记录：后台开一个交易记录页标签，等内容脚本抓取后自动关闭 ---- */

const pendingTradeCaptureTabs = new Map();
let tradeRefreshPromise = null;

function waitForTradeCapture(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingTradeCaptureTabs.delete(tabId);
      resolve(false);
    }, timeoutMs);
    pendingTradeCaptureTabs.set(tabId, () => {
      clearTimeout(timer);
      pendingTradeCaptureTabs.delete(tabId);
      resolve(true);
    });
  });
}

async function refreshTradeRecordsFromPage(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    const captured = await waitForTradeCapture(tab.id);
    // 首次解析成功后页面可能还在补渲染，稍等一下再关闭，让内容脚本捕获完整列表
    if (captured) await new Promise((resolve) => setTimeout(resolve, 2500));
    return captured;
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // 标签可能已被用户关闭
    }
  }
}

function startTradeRefresh() {
  if (tradeRefreshPromise) return tradeRefreshPromise;
  tradeRefreshPromise = (async () => {
    const { tradeRecordsByAccount = {} } = await chrome.storage.local.get("tradeRecordsByAccount");
    // 优先复用用户真实访问过的交易记录页地址（可能带账户参数）
    const urls = [
      ...new Set(
        Object.values(tradeRecordsByAccount)
          .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))
          .map((entry) => entry.sourceUrl)
          .filter((url) => url && url.includes("trade-record"))
      )
    ].slice(0, 2);
    if (!urls.length) urls.push(TRADE_RECORD_URL);
    let captured = false;
    for (const url of urls) {
      captured = (await refreshTradeRecordsFromPage(url)) || captured;
    }
    return captured;
  })().finally(() => {
    tradeRefreshPromise = null;
  });
  return tradeRefreshPromise;
}

function parseJsonp(text, callbackName) {
  const trimmed = String(text || "").trim();
  const prefix = `${callbackName}(`;
  if (!trimmed.startsWith(prefix)) throw new Error("估值接口格式异常");
  let jsonText = trimmed.slice(prefix.length).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1).trim();
  if (!jsonText.endsWith(")")) throw new Error("估值接口格式异常");
  return JSON.parse(jsonText.slice(0, -1));
}

function parseAccountFromUrl(url) {
  try {
    const parsed = new URL(url);
    const accountId =
      parsed.searchParams.get("accountid") ||
      parsed.searchParams.get("invest_account_id") ||
      parsed.searchParams.get("investAccountId");
    const accountName =
      parsed.searchParams.get("accountname") ||
      parsed.searchParams.get("invest_account_name") ||
      parsed.searchParams.get("investAccountName");
    if (!accountId) return null;
    return { accountId, accountName: accountName || "" };
  } catch {
    return null;
  }
}

async function rememberAccount(account) {
  if (!account?.accountId) return;
  await chrome.storage.local.set({ lastAccount: account });
}

async function openDashboard(account) {
  if (account?.accountId) await rememberAccount(account);
  const query = account?.accountId ? `?accountid=${encodeURIComponent(account.accountId)}` : "";
  const dashboardPath = self.location?.pathname?.includes("/dist/")
    ? "dist/dashboard.html"
    : "dashboard.html";
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${dashboardPath}${query}`) });
}

chrome.action.onClicked.addListener(async (tab) => {
  const account = parseAccountFromUrl(tab?.url || "");
  await openDashboard(account);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "account-seen") {
      await rememberAccount(message.account);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "open-dashboard") {
      const account = message.account || parseAccountFromUrl(sender?.tab?.url || "");
      await openDashboard(account);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "get-last-account") {
      const { lastAccount } = await chrome.storage.local.get("lastAccount");
      sendResponse({ ok: true, account: lastAccount || null });
      return;
    }

    if (message?.type === "save-trade-records") {
      const accountId = message.accountId || "all";
      const records = Array.isArray(message.records) ? message.records : [];
      const { tradeRecordsByAccount = {} } = await chrome.storage.local.get("tradeRecordsByAccount");
      await chrome.storage.local.set({
        tradeRecordsByAccount: {
          ...tradeRecordsByAccount,
          [accountId]: {
            accountId,
            records,
            capturedAt: Date.now(),
            sourceUrl: sender?.tab?.url || ""
          }
        }
      });
      const notifyCapture = pendingTradeCaptureTabs.get(sender?.tab?.id);
      if (notifyCapture) notifyCapture();
      sendResponse({ ok: true, count: records.length });
      return;
    }

    if (message?.type === "get-trade-records") {
      const { tradeRecordsByAccount = {} } = await chrome.storage.local.get("tradeRecordsByAccount");
      sendResponse({ ok: true, tradeRecordsByAccount });
      return;
    }

    if (message?.type === "refresh-trade-records") {
      const captured = await startTradeRefresh();
      const { tradeRecordsByAccount = {} } = await chrome.storage.local.get("tradeRecordsByAccount");
      sendResponse({
        ok: true,
        captured,
        tradeRecordsByAccount,
        error: captured ? "" : "未能自动读取交易记录，请确认已登录雪球/蛋卷基金"
      });
      return;
    }

    if (message?.type === "get-fund-details") {
      const { fundDetailsByCode = {} } = await chrome.storage.local.get("fundDetailsByCode");
      sendResponse({ ok: true, fundDetailsByCode });
      return;
    }

    if (message?.type === "get-fund-valuations") {
      const { fundValuationsByCode = {} } = await chrome.storage.local.get("fundValuationsByCode");
      sendResponse({ ok: true, fundValuationsByCode });
      return;
    }

    if (message?.type === "fetch-assets") {
      const accountId = message.accountId;
      if (!accountId) throw new Error("缺少账户 ID");
      const response = await fetch(`${SUMMARY_URL}${encodeURIComponent(accountId)}`, {
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*"
        }
      });
      if (!response.ok) throw new Error(`接口返回 ${response.status}`);
      const payload = await response.json();
      sendResponse({ ok: true, payload });
      return;
    }

    if (message?.type === "fetch-fund-details") {
      const codes = [...new Set(Array.isArray(message.codes) ? message.codes.filter(Boolean) : [])].slice(0, 80);
      const { fundDetailsByCode = {} } = await chrome.storage.local.get("fundDetailsByCode");
      const nextDetails = { ...fundDetailsByCode };
      const results = await Promise.allSettled(
        codes.map(async (code) => {
          const response = await fetch(`${FUND_DETAIL_URL}${encodeURIComponent(code)}`, {
            credentials: "include",
            headers: {
              accept: "application/json, text/plain, */*"
            }
          });
          if (!response.ok) throw new Error(`${code} 接口返回 ${response.status}`);
          const payload = await response.json();
          nextDetails[code] = {
            code,
            payload,
            fetchedAt: Date.now()
          };
        })
      );
      await chrome.storage.local.set({ fundDetailsByCode: nextDetails });
      sendResponse({
        ok: true,
        fundDetailsByCode: nextDetails,
        failed: results.filter((item) => item.status === "rejected").length
      });
      return;
    }

    if (message?.type === "fetch-fund-valuations") {
      const codes = [...new Set(Array.isArray(message.codes) ? message.codes.filter(Boolean) : [])].slice(0, 120);
      const { fundValuationsByCode = {} } = await chrome.storage.local.get("fundValuationsByCode");
      const nextValuations = { ...fundValuationsByCode };
      const valuationErrors = [];
      let succeeded = 0;
      let failed = 0;
      let rateLimited = false;

      const markFailed = (code) => {
        failed += 1;
        // 记录失败时间，前端据此冷却，避免限流时无限重试
        nextValuations[code] = { ...(nextValuations[code] || { code }), failedAt: Date.now() };
      };

      const fetchOne = async (code) => {
        const response = await fetch(`${FUND_VALUATION_URL}${encodeURIComponent(code)}.js?rt=${Date.now()}`, {
          credentials: "omit",
          headers: { accept: "*/*" }
        });
        if (!response.ok) {
          const error = new Error(`${code} 估值接口返回 ${response.status}`);
          error.rateLimited = response.status === 514 || response.status === 403 || response.status === 429;
          throw error;
        }
        const payload = parseJsonp(await response.text(), "jsonpgz");
        nextValuations[code] = { code, payload, fetchedAt: Date.now() };
      };

      // 小批量串行请求，天天基金接口盘中限流（514），并发太高会被封
      const BATCH_SIZE = 6;
      for (let index = 0; index < codes.length; index += BATCH_SIZE) {
        if (rateLimited) {
          // 已判定被限流：剩余的不再请求，直接标记失败进入冷却
          codes.slice(index).forEach(markFailed);
          break;
        }
        const batch = codes.slice(index, index + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map(fetchOne));
        settled.forEach((item, offset) => {
          if (item.status === "fulfilled") {
            succeeded += 1;
            return;
          }
          markFailed(batch[offset]);
          valuationErrors.push(item.reason?.message || String(item.reason));
          if (item.reason?.rateLimited) rateLimited = true;
        });
        if (index + BATCH_SIZE < codes.length && !rateLimited) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      await chrome.storage.local.set({ fundValuationsByCode: nextValuations });
      sendResponse({
        ok: true,
        fundValuationsByCode: nextValuations,
        requested: codes.length,
        succeeded,
        failed,
        rateLimited,
        errors: valuationErrors.slice(0, 5)
      });
      return;
    }

    if (message?.type === "fetch-overview") {
      const [gainResponse, iconResponse] = await Promise.all([
        fetch(OVERVIEW_GAIN_URL, {
          credentials: "include",
          headers: { accept: "application/json, text/plain, */*" }
        }),
        fetch(OVERVIEW_ICON_URL, {
          credentials: "include",
          headers: { accept: "application/json, text/plain, */*" }
        })
      ]);
      if (!gainResponse.ok) throw new Error(`总览接口返回 ${gainResponse.status}`);
      const gain = await gainResponse.json();
      const icons = iconResponse.ok ? await iconResponse.json() : null;
      sendResponse({ ok: true, gain, icons });
      return;
    }

    sendResponse({ ok: false, error: "未知消息" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});
