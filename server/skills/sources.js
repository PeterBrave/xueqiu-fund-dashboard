/* 公开行情数据源：蛋卷基金 + 天天基金。全部为只读接口，无需登录态。 */

const JSON_HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};

async function fetchJson(url, { referer } = {}) {
  const response = await fetch(url, {
    headers: referer ? { ...JSON_HEADERS, referer } : JSON_HEADERS,
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`接口返回 ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: JSON_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`接口返回 ${response.status}: ${url}`);
  return response.text();
}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pct = (value) => {
  const parsed = num(value);
  return parsed == null ? null : Number(parsed.toFixed(2));
};

/** 基金概况：合并蛋卷 djapi/fund/{code}（基本信息/收益/排名）与 fund/detail/{code}（经理/持仓） */
export async function fundProfile(code) {
  const encoded = encodeURIComponent(code);
  const [basePayload, detailPayload] = await Promise.allSettled([
    fetchJson(`https://danjuanfunds.com/djapi/fund/${encoded}`),
    fetchJson(`https://danjuanfunds.com/djapi/fund/detail/${encoded}`)
  ]);
  const base = basePayload.status === "fulfilled" ? basePayload.value?.data || {} : {};
  const detail = detailPayload.status === "fulfilled" ? detailPayload.value?.data || {} : {};
  if (!base.fd_code && !detail.fund_position) throw new Error(`基金 ${code} 概况查询失败`);

  const derived = base.fund_derived || {};
  const position = detail.fund_position || {};
  const managers = (detail.manager_list || []).map((item) => ({
    name: item.name,
    workTime: item.work_time || "",
    fundSameKind: item.achievement_list?.length || undefined
  }));
  const topStocks = (position.stock_list || []).slice(0, 10).map((item) => ({
    name: item.name,
    code: item.code,
    percent: pct(item.percent),
    quarterChange: item.change_of_pre_quarter || ""
  }));

  return {
    code: base.fd_code || code,
    name: base.fd_name || "",
    type: base.type_desc || "",
    foundDate: base.found_date || "",
    scale: base.totshare || "",
    company: base.keeper_name || "",
    managers: managers.length ? managers : base.manager_name || "",
    riskLevel: base.risk_level || "",
    rating: base.rating_desc || "",
    latestNav: derived.unit_nav || "",
    navDate: derived.end_date || "",
    yield1m: pct(derived.nav_grl1m),
    yield3m: pct(derived.nav_grl3m),
    yield1y: pct(derived.nav_grl1y),
    yield3y: pct(derived.nav_grl3y),
    yield5y: pct(derived.nav_grl5y),
    rankLast1y: derived.srank_l1y || "",
    rankLast3y: derived.srank_l3y || "",
    stockPercent: pct(position.stock_percent),
    bondPercent: pct(position.bond_percent),
    cashPercent: pct(position.cash_percent),
    positionDate: position.end_date_str || position.enddate || "",
    topStocks,
    investOrientation: (base.invest_orientation || "").slice(0, 200)
  };
}

/** 净值历史：蛋卷 nav/history，返回按时间升序的 [{date, nav}] */
export async function fundNavHistory(code, size = 300) {
  const payload = await fetchJson(
    `https://danjuanfunds.com/djapi/fund/nav/history/${encodeURIComponent(code)}?size=${size}&page=1`
  );
  const items = payload?.data?.items || [];
  return items
    .map((item) => ({ date: item.date, nav: num(item.nav) }))
    .filter((item) => item.date && item.nav != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 盘中实时估值：天天基金 fundgz jsonp */
export async function fundRealtimeEstimate(code) {
  const text = await fetchText(
    `https://fundgz.1234567.com.cn/js/${encodeURIComponent(code)}.js?rt=${Date.now()}`
  );
  const match = text.match(/jsonpgz\((.*)\);?\s*$/s);
  if (!match) throw new Error(`基金 ${code} 无实时估值（可能是 QDII/债基或非交易时段）`);
  const data = JSON.parse(match[1]);
  return {
    code: data.fundcode,
    name: data.name,
    confirmedNav: num(data.dwjz),
    confirmedNavDate: data.jzrq,
    estimatedNav: num(data.gsz),
    estimatedRate: num(data.gszzl),
    estimateTime: data.gztime
  };
}

/** 指数估值表：蛋卷指数估值（PE/PB 百分位与低估/正常/高估状态） */
export async function indexValuationTable() {
  const payload = await fetchJson("https://danjuanfunds.com/djapi/index_eva/dj");
  const items = payload?.data?.items || [];
  return items.map((item) => ({
    name: item.name,
    indexCode: item.index_code,
    pe: num(item.pe),
    pePercentile: item.pe_percentile != null ? Number((num(item.pe_percentile) * 100).toFixed(1)) : null,
    pb: num(item.pb),
    pbPercentile: item.pb_percentile != null ? Number((num(item.pb_percentile) * 100).toFixed(1)) : null,
    roe: num(item.roe),
    yeildRate: num(item.yeild),
    evaluation: item.eva_type === "low" ? "低估" : item.eva_type === "high" ? "高估" : "正常"
  }));
}

/**
 * 券商研报：东方财富 reportapi。
 * qType: 0=个股研报 1=行业研报 2=策略报告 3=宏观研究（宏观走 report/jg 接口）
 */
export async function brokerReports({ type = "strategy", stockCode = "", days = 14, limit = 10 } = {}) {
  const end = new Date();
  const begin = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const fmt = (date) => date.toISOString().slice(0, 10);
  const referer = "https://data.eastmoney.com/";

  const qTypeMap = { stock: "0", industry: "1", strategy: "2", macro: "3" };
  const qType = qTypeMap[type] || "2";

  let url;
  if (qType === "3") {
    url = `https://reportapi.eastmoney.com/report/jg?pageSize=${limit}&beginTime=${fmt(begin)}&endTime=${fmt(
      end
    )}&pageNo=1&qType=3&fields=&orgCode=&author=`;
  } else {
    url = `https://reportapi.eastmoney.com/report/list?industryCode=*&pageSize=${limit}&industry=*&rating=*&ratingChange=*&beginTime=${fmt(
      begin
    )}&endTime=${fmt(end)}&pageNo=1&fields=&qType=${qType}&orgCode=&code=${stockCode || "*"}&rcode=`;
  }

  const payload = await fetchJson(url, { referer });
  return (payload?.data || []).slice(0, limit).map((item) => ({
    title: item.title,
    org: item.orgSName || item.orgName || "",
    date: String(item.publishDate || "").slice(0, 10),
    stock: item.stockName || "",
    industry: item.industryName || "",
    rating: item.sRatingName || item.emRatingName || "",
    pdfUrl: item.infoCode ? `https://pdf.dfcfw.com/pdf/H3_${item.infoCode}_1.pdf` : ""
  }));
}

/** 基金搜索：天天基金搜索接口 */
export async function searchFund(keyword) {
  const payload = await fetchJson(
    `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`,
    { referer: "https://fund.eastmoney.com/" }
  );
  const items = payload?.Datas || [];
  return items
    .filter((item) => item.CATEGORYDESC === "基金")
    .slice(0, 10)
    .map((item) => ({
      code: item.CODE,
      name: item.NAME,
      type: item.FundBaseInfo?.FTYPE || "",
      manager: item.FundBaseInfo?.JJJL || "",
      company: item.FundBaseInfo?.JJGSMC || ""
    }));
}
