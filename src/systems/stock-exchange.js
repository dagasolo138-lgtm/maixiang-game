import { currencyScale } from "../economy/currency.js";
import { currentPaymentComposition, maximumPayableValueUnits, settleMonetaryPayment } from "../economy/payment.js";
import { recordEvent } from "../economy/ledger.js";
import { householdList } from "./households.js";
import { companyActualProfitValuation } from "./companies.js";

export function hasStockExchange(state) {
  return (state.buildings || []).some(row => row.typeId === "stock_exchange") || Boolean(state.stockExchange?.legacyAccess);
}

export function ensureStockExchangeState(state) {
  state.stockExchange ||= { legacyAccess: false, rotation: 0 };
  state.stockExchange.rotation ||= 0;
  return state.stockExchange;
}

export function nearbyDivisibleShareCounts(levels, requested) {
  const n = Math.max(1, Math.floor(Number(levels) || 1));
  const value = Math.max(n, Math.floor(Number(requested) || n));
  const lower = Math.max(n, Math.floor(value / n) * n);
  const upper = Math.max(n, Math.ceil(value / n) * n);
  return [...new Set([lower, upper, Math.max(n, lower - n), upper + n])].sort((a, b) => Math.abs(a - value) - Math.abs(b - value) || a - b).slice(0, 3);
}

function listingGate(state) {
  if (!hasStockExchange(state)) return "尚未建成交易所";
  if (state.monetaryReform?.stage !== "voucher") return "须先完成货币改革，上市与股票交易只使用粮券";
  return null;
}

export function listCompanyOnExchange(state, companyId, options, content) {
  ensureStockExchangeState(state);
  const company = state.companies?.[companyId];
  if (!company) return { ok: false, reason: "公司不存在" };
  const gate = listingGate(state);
  if (gate) return { ok: false, reason: gate };
  if (company.listing?.listed) return { ok: false, reason: "公司已经上市；再次售股沿用现有总股本" };
  const ticker = String(options?.ticker ?? "").trim();
  if (!/^\d{3}$/.test(ticker)) return { ok: false, reason: "股票代码必须是三位数字，可保留前导零" };
  if (Object.values(state.companies || {}).some(other => other.id !== companyId && other.listing?.ticker === ticker)) return { ok: false, reason: "股票代码已被使用" };
  const totalShares = Math.floor(Number(options?.totalShares) || 0);
  if (!Number.isSafeInteger(totalShares) || totalShares <= 0) return { ok: false, reason: "总股本必须为正整数" };
  if (totalShares % company.listedLevels !== 0) {
    return { ok: false, reason: `总股本必须能被公司${company.listedLevels}级整除`, nearby: nearbyDivisibleShareCounts(company.listedLevels, totalShares) };
  }
  const priceUnits = Math.round(Number(options?.priceVoucherPerShare) * currencyScale(content));
  const offeredShares = Math.floor(Number(options?.offeredShares) || 0);
  if (!Number.isSafeInteger(priceUnits) || priceUnits <= 0) return { ok: false, reason: "每股价格必须大于0" };
  if (!Number.isSafeInteger(offeredShares) || offeredShares < 0 || offeredShares > totalShares) return { ok: false, reason: "本次出售股数不能超过镇库持股" };

  company.totalShares = totalShares;
  company.townShares = totalShares;
  company.residentShares = 0;
  company.householdShares = {};
  company.listing = { listed: true, ticker, listedAt: { year: state.year, day: Math.min(content.rules.daysPerYear, state.day + 1) } };
  company.shareSale ||= {};
  company.shareSale.offeredShares = offeredShares;
  company.shareSale.sharePriceVoucherUnits = priceUnits;
  company.shareSale.cumulativeProceedsVoucherUnits ||= 0;
  company.shareSale.lastSaleVoucherUnits ||= 0;
  company.shareSale.lastSoldShares ||= 0;
  recordEvent(state, `${company.name}（${ticker}）在交易所挂牌，总股本${totalShares.toLocaleString("zh-CN")}股；挂牌不代表已全部售出。`, content, { day: state.day + 1 });
  return { ok: true, ticker, totalShares, offeredShares, priceVoucherUnits: priceUnits, townShares: totalShares };
}

export function configureListedShareOffer(state, companyId, offeredShares, priceVoucherPerShare, content) {
  const company = state.companies?.[companyId];
  if (!company) return { ok: false, reason: "公司不存在" };
  const gate = listingGate(state);
  if (gate) return { ok: false, reason: gate };
  if (!company.listing?.listed) return { ok: false, reason: "公司尚未上市" };
  const shares = Math.floor(Number(offeredShares) || 0);
  const priceUnits = Math.round(Number(priceVoucherPerShare) * currencyScale(content));
  if (shares < 0 || shares > company.townShares) return { ok: false, reason: "出售股数不能超过镇库持股" };
  if (!Number.isSafeInteger(priceUnits) || priceUnits <= 0) return { ok: false, reason: "每股售价须大于0" };
  company.shareSale.offeredShares = shares;
  company.shareSale.sharePriceVoucherUnits = priceUnits;
  return { ok: true, offeredShares: shares, priceVoucherUnits: priceUnits };
}

export function stockReference(state, company, content) {
  const scale = currencyScale(content);
  const profit = companyActualProfitValuation(state, company, content);
  const basisUnits = profit.referenceCompanyValueVoucherUnits || 0;
  return {
    ...profit,
    bookAssetsVoucherUnits: 0,
    referenceCompanyValueVoucherUnits: basisUnits,
    referencePerShareVoucherUnits: company.totalShares > 0 ? Math.floor(basisUnits / company.totalShares) : 0,
    basis: profit.validProfitMethod
      ? `最近${profit.observedDays}个日历日真实净利润与投入资本利润率统一估值；停工日计入观察窗口`
      : (profit.observedDays > 0 ? `${profit.performanceStatus || "观察中"}；库存不计入公司估值` : "暂无业绩；库存不计入公司估值"),
    scale
  };
}

export function previewTownBuyback(state, companyId, options, content) {
  const company = state.companies?.[companyId];
  if (!company) return { available: false, reason: "公司不存在" };
  const gate = listingGate(state);
  if (gate) return { available: false, reason: gate };
  if (!company.listing?.listed) return { available: false, reason: "公司尚未上市" };
  const requestedShares = Math.max(0, Math.floor(Number(options?.shares) || 0));
  const priceUnits = Math.round(Number(options?.priceVoucherPerShare) * currencyScale(content));
  if (!requestedShares || !Number.isSafeInteger(priceUnits) || priceUnits <= 0) return { available: false, reason: "请输入回购股数和正的每股价格" };
  const reference = stockReference(state, company, content);
  const willing = [];
  let willingShares = 0;
  // 无人家庭仍是合法资产账户；人口归零不能让既有股份失去回购/清算出口。
  for (const household of householdList(state)) {
    const shares = Math.max(0, company.householdShares?.[household.id] || 0);
    if (!shares) continue;
    // 自愿出售：报价不低于统一业绩估值参考；暂无业绩时参考价为0。
    if (priceUnits >= reference.referencePerShareVoucherUnits) {
      willing.push({ householdId: household.id, shares });
      willingShares += shares;
    }
  }
  const affordableShares = Math.floor(maximumPayableValueUnits(state, "town", content) / priceUnits);
  const executableShares = Math.min(requestedShares, willingShares, affordableShares);
  return {
    available: executableShares > 0,
    reason: executableShares > 0 ? null : willingShares <= 0 ? "当前回购价下没有居民自愿出售" : "镇库粮券不足",
    requestedShares, priceVoucherUnits: priceUnits, willingShares, affordableShares, executableShares,
    costVoucherUnits: executableShares * priceUnits, reference
  };
}

export function executeTownBuyback(state, companyId, options, content) {
  const company = state.companies?.[companyId];
  const preview = previewTownBuyback(state, companyId, options, content);
  if (!company || !preview.available) return { ok: false, reason: preview.reason || "当前无可回购股份", preview };
  let left = preview.executableShares;
  let paid = 0;
  const sellers = [];
  const rows = householdList(state)
    .filter(h => (company.householdShares?.[h.id] || 0) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const start = ensureStockExchangeState(state).rotation % Math.max(1, rows.length);
  const ordered = rows.slice(start).concat(rows.slice(0, start));
  for (const household of ordered) {
    if (left <= 0) break;
    const held = company.householdShares?.[household.id] || 0;
    if (held <= 0) continue;
    if (preview.priceVoucherUnits < preview.reference.referencePerShareVoucherUnits) continue;
    const shares = Math.min(held, left);
    const cost = shares * preview.priceVoucherUnits;
    const payment = settleMonetaryPayment(state, "town", `household:${household.id}`, currentPaymentComposition(state, cost), content,
      "town_share_buyback", `镇库回购${company.name}股份`, { requireFull: true });
    if (!payment.ok) break;
    company.householdShares[household.id] -= shares;
    if (company.householdShares[household.id] <= 0) delete company.householdShares[household.id];
    household.shares ||= {};
    household.shares[company.id] = Math.max(0, (household.shares[company.id] || 0) - shares);
    if (household.shares[company.id] <= 0) delete household.shares[company.id];
    company.residentShares -= shares;
    company.townShares += shares;
    left -= shares;
    paid += cost;
    sellers.push({ householdId: household.id, shares, voucherUnits: cost });
  }
  ensureStockExchangeState(state).rotation = rows.length ? (start + 1) % rows.length : 0;
  const boughtShares = preview.executableShares - left;
  if (boughtShares <= 0) return { ok: false, reason: "回购未成交", preview };
  recordEvent(state, `镇库以玩家定价回购${company.name}${boughtShares.toLocaleString("zh-CN")}股。`, content, { day: state.day + 1 });
  return { ok: true, boughtShares, paidVoucherUnits: paid, sellers, preview };
}
