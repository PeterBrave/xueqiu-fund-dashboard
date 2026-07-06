const SUMMARY_URL =
  "https://danjuanfunds.com/djapi/fundx/profit/assets/summary?invest_account_id=";
const OVERVIEW_GAIN_URL =
  "https://danjuanfunds.com/djapi/fundx/profit/assets/gain?gains=%5B%22private%22%5D";
const OVERVIEW_ICON_URL = "https://danjuanfunds.com/djapi/fundx/profit/assets/queryIcon/djhome";
const FUND_DETAIL_URL = "https://danjuanfunds.com/djapi/fund/detail/";
const FUND_VALUATION_URL = "https://fundgz.1234567.com.cn/js/";

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
      sendResponse({ ok: true, count: records.length });
      return;
    }

    if (message?.type === "get-trade-records") {
      const { tradeRecordsByAccount = {} } = await chrome.storage.local.get("tradeRecordsByAccount");
      sendResponse({ ok: true, tradeRecordsByAccount });
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
      const results = await Promise.allSettled(
        codes.map(async (code) => {
          try {
            const response = await fetch(`${FUND_VALUATION_URL}${encodeURIComponent(code)}.js?rt=${Date.now()}`, {
              credentials: "omit",
              headers: {
                accept: "*/*"
              }
            });
            if (!response.ok) throw new Error(`${code} 估值接口返回 ${response.status}`);
            const text = await response.text();
            const payload = parseJsonp(text, "jsonpgz");
            nextValuations[code] = {
              code,
              payload,
              fetchedAt: Date.now()
            };
          } catch (error) {
            valuationErrors.push(`${code}: ${error.message || String(error)}`);
            throw error;
          }
        })
      );
      const failed = results.filter((item) => item.status === "rejected").length;
      const succeeded = results.length - failed;
      await chrome.storage.local.set({ fundValuationsByCode: nextValuations });
      sendResponse({
        ok: true,
        fundValuationsByCode: nextValuations,
        requested: codes.length,
        succeeded,
        failed,
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
