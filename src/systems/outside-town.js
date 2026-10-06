import { nextRandom } from "../core/random.js";
import { makeTransactionId, recordEvent, recordLedger } from "../economy/ledger.js";
import { addInventory, changeInventory, quantityToUnits, unitsToQuantity } from "../economy/inventory.js";
import { hasWholesaleMarket, readWholesaleMarket, takeWholesaleInventoryForExport } from "./wholesale-market.js";

// 外镇v1「四地主镇」：纯贸易伙伴，不做完整模拟，只用动态算法维持基础数值。
// 四地主（陈/王/李/赵）统治的农业小镇：1万亩、1000劳动力，主产小麦，有面粉店/面包店；
// 对盐、木材需求高；贸易以小麦斤计价：本镇可卖小麦/面粉/面包/盐/木材，可买小麦/面粉/面包。
// 结算走实物小麦（镇小麦库存 <-> 外镇小麦库存），不印新券，不破坏货币恒等式。

export const OUTSIDE_TOWN_NAME = "四地主镇";
export const OUTSIDE_RULERS = ["陈", "王", "李", "赵"];
export const TRADE_SELL_ITEMS = ["flour", "bread", "salt", "wood"];
export const TRADE_BUY_ITEMS = ["flour", "bread"];
export const MAX_TRADE_JIN_PER_ORDER = 100000;
export const PRICE_ELASTICITY = 1.0;
export const MEMORY_DECAY_PER_DAY = 0.995;
export const DEFAULT_TRADE_TARIFF_PERCENT = 5;
export const MAX_TRADE_TARIFF_PERCENT = 30;

// 外镇收购价（我们卖出）：小麦斤/单位。盐、木材需求高，收购价高。
// 小麦不做贸易商品（镇库直管的战略物资），只做结算货币；缺粮时走小麦贷款。
const BASE_BUY_PRICE = { flour: 1.15, bread: 1.35, salt: 4.5, wood: 2.8 };
// 外镇售价（我们买入）
const BASE_SELL_PRICE = { flour: 1.55, bread: 1.9 };
const YIELD_PER_MU_JIN = 500;
const FOOD_PER_PERSON_DAY_JIN = 2;

export function ensureOutsideTown(state) {
  const ot = state.outsideTown ||= {};
  applyOutsideTownDefaults(ot, ot);
  return ot;
}

// 只读版本：供 selector/UI 使用，不回写游戏状态（0.1.8 selector 纯度要求）。
export function readOutsideTown(state) {
  const ot = {};
  applyOutsideTownDefaults(ot, state.outsideTown || {});
  return ot;
}

function applyOutsideTownDefaults(ot, source) {
  const src = source || {};
  ot.name = ot.name ?? src.name ?? OUTSIDE_TOWN_NAME;
  ot.rulers = ot.rulers ?? (src.rulers ? [...src.rulers] : [...OUTSIDE_RULERS]);
  ot.landMu = ot.landMu ?? src.landMu ?? 10000;
  ot.laborers = ot.laborers ?? src.laborers ?? 1000;
  ot.population = ot.population ?? src.population ?? 3500;
  ot.wheatStockJin = ot.wheatStockJin ?? src.wheatStockJin ?? 3000000;
  ot.prosperity = ot.prosperity ?? src.prosperity ?? 60;
  ot.saltDemand = ot.saltDemand ?? src.saltDemand ?? 1.4;
  ot.woodDemand = ot.woodDemand ?? src.woodDemand ?? 1.3;
  ot.grainDemand = ot.grainDemand ?? src.grainDemand ?? 0.7;
  ot.weather = ot.weather ?? src.weather ?? 1.0;
  ot.event = ot.event ?? src.event ?? null;
  ot.tradeClosed = ot.tradeClosed ?? src.tradeClosed ?? false;
  ot.buyPrices = ot.buyPrices ?? {};
  ot.sellPrices = ot.sellPrices ?? {};
  ot.tradeMemory = ot.tradeMemory ?? {};
  const srcBuy = src.buyPrices || {};
  const srcSell = src.sellPrices || {};
  const srcMemory = src.tradeMemory || {};
  for (const itemId of TRADE_SELL_ITEMS) {
    const buyPrice = ot.buyPrices[itemId] ?? srcBuy[itemId];
    ot.buyPrices[itemId] = Number.isFinite(buyPrice) && buyPrice > 0 ? buyPrice : BASE_BUY_PRICE[itemId];
    const memory = ot.tradeMemory[itemId] ?? srcMemory[itemId];
    ot.tradeMemory[itemId] = Number.isFinite(memory) ? memory : 0;
  }
  for (const itemId of TRADE_BUY_ITEMS) {
    const sellPrice = ot.sellPrices[itemId] ?? srcSell[itemId];
    ot.sellPrices[itemId] = Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : BASE_SELL_PRICE[itemId];
  }
  ot.stats = ot.stats ?? {};
  const srcStats = src.stats || {};
  for (const key of ["exportJin", "importJin", "tariffJin", "trades", "yearExportJin", "yearImportJin", "yearTariffJin"]) {
    const value = ot.stats[key] ?? srcStats[key];
    ot.stats[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (ot.lastYearProductionJin === undefined) ot.lastYearProductionJin = src.lastYearProductionJin || 0;
  if (ot.lastYearConsumptionJin === undefined) ot.lastYearConsumptionJin = src.lastYearConsumptionJin || 0;
  // 小麦贷款：天灾欠收时本镇放贷给四地主镇，玩家定斤数和利息
  ot.loans = ot.loans ?? (Array.isArray(src.loans) ? src.loans.map(l => ({ ...l })) : []);
  ot.loanStats = ot.loanStats ?? {};
  const srcLoanStats = src.loanStats || {};
  for (const key of ["totalIssuedJin", "totalRepaidJin", "totalInterestJin", "activeLoans"]) {
    const value = ot.loanStats[key] ?? srcLoanStats[key];
    ot.loanStats[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  return ot;
}

export function tradeTariffRate(state) {
  const value = Number(state.policy?.tradeTariffRate);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_TRADE_TARIFF_PERCENT;
  return Math.min(MAX_TRADE_TARIFF_PERCENT, value);
}

function demandMultiplier(ot, itemId) {
  if (itemId === "salt") return Math.max(0.2, ot.saltDemand);
  if (itemId === "wood") return Math.max(0.2, ot.woodDemand);
  return Math.max(0.2, ot.grainDemand);
}

function prosperityFactor(ot) {
  return 0.7 + Math.max(0, Math.min(100, ot.prosperity)) / 100 * 0.6;
}

// 价格反馈（防刷钱核心）：本镇某商品净卖出越多 -> 外镇收购价越低；
// 净买入越多 -> 外镇售价越高。tradeMemory 以"净卖出斤数"为正。
export function recomputePrices(state) {
  const ot = ensureOutsideTown(state);
  const prosperity = prosperityFactor(ot);
  for (const itemId of TRADE_SELL_ITEMS) {
    const memory = Math.max(0, ot.tradeMemory[itemId] || 0);
    const feedback = 1 / (1 + PRICE_ELASTICITY * memory / 10000);
    ot.buyPrices[itemId] = clampPrice(BASE_BUY_PRICE[itemId] * demandMultiplier(ot, itemId) * prosperity * feedback);
  }
  for (const itemId of TRADE_BUY_ITEMS) {
    const memory = Math.max(0, -(ot.tradeMemory[itemId] || 0));
    const feedback = 1 + PRICE_ELASTICITY * memory / 10000;
    ot.sellPrices[itemId] = clampPrice(BASE_SELL_PRICE[itemId] * prosperity * feedback);
  }
  return ot;
}

function clampPrice(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(50, Math.max(0.05, Math.round(value * 100) / 100));
}

// 每日：贸易记忆缓慢衰减（价格向基准恢复），重算价格。
export function advanceOutsideTownDay(state, content) {
  const ot = ensureOutsideTown(state);
  for (const itemId of TRADE_SELL_ITEMS) {
    ot.tradeMemory[itemId] = (ot.tradeMemory[itemId] || 0) * MEMORY_DECAY_PER_DAY;
    if (Math.abs(ot.tradeMemory[itemId]) < 0.01) ot.tradeMemory[itemId] = 0;
  }
  recomputePrices(state);
  return { tradeClosed: ot.tradeClosed };
}

// 每年1月1日：天气抽签 -> 年产出/年消费 -> 库存/人口/繁荣度均值回归 -> 低概率年事件。
// 注意：调用方应把本函数放在 settleOneDay 末尾，避免扰动既有系统的随机数流。
export function settleOutsideTownYear(state, content) {
  const ot = ensureOutsideTown(state);
  ot.tradeClosed = false;
  ot.weather = Math.round((0.7 + nextRandom(state) * 0.6) * 100) / 100;
  let eventFactor = 1;
  let eventLabel = null;
  const roll = nextRandom(state);
  if (roll < 0.12) {
    const pick = nextRandom(state);
    if (pick < 0.3) {
      eventFactor = 0.55;
      eventLabel = "蝗灾";
      recordEvent(state, "四地主镇遭蝗灾，收成大减，粮价看涨。", content, { day: 1 });
    } else if (pick < 0.6) {
      eventFactor = 1.15;
      eventLabel = "丰收";
      recordEvent(state, "四地主镇风调雨顺，喜获丰收，粮价走低。", content, { day: 1 });
    } else if (pick < 0.8) {
      ot.tradeClosed = true;
      eventLabel = "商路中断";
      recordEvent(state, "山匪截断商路，今年无法与四地主镇贸易。", content, { day: 1 });
    } else {
      ot.saltDemand = 2.2;
      eventLabel = "盐荒";
      recordEvent(state, "四地主镇闹盐荒，对盐出价高企。", content, { day: 1 });
    }
  }
  ot.event = eventLabel ? { type: eventLabel, year: state.year } : null;
  const production = ot.landMu * YIELD_PER_MU_JIN * ot.weather * eventFactor;
  const consumption = ot.population * FOOD_PER_PERSON_DAY_JIN * (content.rules.daysPerYear || 365);
  ot.wheatStockJin = Math.max(0, Math.round((ot.wheatStockJin + production - consumption) * 100) / 100);
  ot.lastYearProductionJin = Math.round(production);
  ot.lastYearConsumptionJin = Math.round(consumption);
  // 库存软上限：超出部分每年一半外销/酿酒/损耗掉，避免无限累积。
  const STOCK_SOFT_CAP_JIN = 6000000;
  if (ot.wheatStockJin > STOCK_SOFT_CAP_JIN) {
    ot.wheatStockJin = Math.round(STOCK_SOFT_CAP_JIN + (ot.wheatStockJin - STOCK_SOFT_CAP_JIN) * 0.5);
  }
  // 人口/繁荣度/需求度均值回归 + 小扰动。
  const jitter = () => (nextRandom(state) - 0.5);
  ot.population = Math.round(Math.max(2500, Math.min(4500,
    ot.population + (3500 - ot.population) * 0.05 + jitter() * 40)));
  const grainBalance = ot.wheatStockJin > 0 ? 2 : -15;
  ot.prosperity = Math.round(Math.max(5, Math.min(100,
    ot.prosperity + (60 - ot.prosperity) * 0.08 + jitter() * 6 + grainBalance)) * 10) / 10;
  ot.saltDemand = Math.round(Math.max(0.5, Math.min(2.5,
    ot.saltDemand + (1.4 - ot.saltDemand) * 0.1 + jitter() * 0.1)) * 100) / 100;
  ot.woodDemand = Math.round(Math.max(0.5, Math.min(2.5,
    ot.woodDemand + (1.3 - ot.woodDemand) * 0.1 + jitter() * 0.1)) * 100) / 100;
  ot.grainDemand = Math.round(Math.max(0.3, Math.min(1.2,
    ot.grainDemand + (0.7 - ot.grainDemand) * 0.1 + jitter() * 0.05)) * 100) / 100;
  ot.stats.yearExportJin = 0;
  ot.stats.yearImportJin = 0;
  ot.stats.yearTariffJin = 0;
  recomputePrices(state);
  return { weather: ot.weather, event: eventLabel, productionJin: Math.round(production), wheatStockJin: ot.wheatStockJin };
}

// 玩家命令：与外镇贸易。direction: "sell"（我们卖出）/ "buy"（我们买入）。
// 以小麦斤计价、实物小麦结算：卖出 -> 外镇小麦库存减少、镇小麦库存增加；买入反之。
export function tradeWithOutsideTown(state, direction, itemId, quantityJin, content) {
  const ot = ensureOutsideTown(state);
  recomputePrices(state);
  if (ot.tradeClosed) return { ok: false, reason: "商路中断，今年无法与四地主镇贸易" };
  if (direction !== "sell" && direction !== "buy") return { ok: false, reason: "贸易方向无效" };
  const sellable = direction === "sell" ? TRADE_SELL_ITEMS : TRADE_BUY_ITEMS;
  if (!sellable.includes(itemId)) {
    return { ok: false, reason: direction === "sell" ? "外镇不收购该商品" : "外镇不出售该商品" };
  }
  const item = content.items[itemId];
  if (!item) return { ok: false, reason: "未知商品" };
  let qty = Number(quantityJin);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: "数量必须大于0" };
  qty = Math.min(qty, MAX_TRADE_JIN_PER_ORDER);
  const price = direction === "sell" ? ot.buyPrices[itemId] : ot.sellPrices[itemId];
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "价格无效" };
  const transactionId = makeTransactionId(state);

  if (direction === "sell") {
    // 先按外镇小麦库存把数量夹紧（他们没粮就付不起）。
    const affordableQty = Math.floor(ot.wheatStockJin / price * 100) / 100;
    if (affordableQty < 0.01) return { ok: false, reason: "四地主镇小麦不足，付不起这笔货款" };
    qty = Math.min(qty, affordableQty);
    const qtyUnits = quantityToUnits(qty, content);
    if (qtyUnits <= 0) return { ok: false, reason: "数量过小" };
    // 出口货源（0.2.3 做市商机制）：优先从批发市场库存出货，不足部分从镇库补。
    // 之前只读镇库，批发市场有货也报"镇库存不足"。
    let remainingUnits = qtyUnits;
    let fromMarketUnits = 0;
    if (hasWholesaleMarket(state)) {
      const taken = takeWholesaleInventoryForExport(state, itemId, remainingUnits, content);
      fromMarketUnits = taken.units || 0;
      remainingUnits -= fromMarketUnits;
    }
    if (remainingUnits > 0) {
      const take = changeInventory(state, "town", itemId, -remainingUnits, `对${OUTSIDE_TOWN_NAME}出口${item.name}`, "trade_export", content, transactionId);
      if (!take.ok) {
        // 镇库也不够：把批发市场已扣的回滚，避免货款两空
        if (fromMarketUnits > 0) {
          const market = readWholesaleMarket(state, content);
          market.inventory[itemId] = (market.inventory[itemId] || 0) + fromMarketUnits;
        }
        return { ok: false, reason: "批发市场与镇库存" + item.name + "不足" };
      }
      remainingUnits = 0;
    }
    const actualUnits = qtyUnits - Math.max(0, remainingUnits);
    const actualJin = unitsToQuantity(actualUnits, content);
    const valueJin = Math.round(actualJin * price * 100) / 100;
    ot.wheatStockJin = Math.round(Math.max(0, ot.wheatStockJin - valueJin) * 100) / 100;
    addInventory(state, "town", "wheat", valueJin, `对${OUTSIDE_TOWN_NAME}出口${item.name}所得`, "trade_export", content);
    const tariffJin = Math.round(valueJin * tradeTariffRate(state) / 100 * 100) / 100;
    ot.stats.exportJin = Math.round((ot.stats.exportJin + valueJin) * 100) / 100;
    ot.stats.yearExportJin = Math.round((ot.stats.yearExportJin + valueJin) * 100) / 100;
    ot.stats.tariffJin = Math.round((ot.stats.tariffJin + tariffJin) * 100) / 100;
    ot.stats.yearTariffJin = Math.round((ot.stats.yearTariffJin + tariffJin) * 100) / 100;
    ot.stats.trades += 1;
    ot.tradeMemory[itemId] = (ot.tradeMemory[itemId] || 0) + actualJin;
    if (tariffJin > 0) {
      recordLedger(state, {
        type: "trade_tariff", transactionId, source: "trade", destination: "town",
        itemId: "money_value", quantityUnits: quantityToUnits(tariffJin, content), qeqUnits: 0,
        reason: `对${OUTSIDE_TOWN_NAME}出口关税（${tradeTariffRate(state)}%）`
      }, content);
    }
    recomputePrices(state);
    return { ok: true, direction, itemId, quantityJin: actualJin, valueJin, tariffJin, priceWheatPerUnit: price };
  }

  // buy
  const valueJin = Math.round(qty * price * 100) / 100;
  const payUnits = quantityToUnits(valueJin, content);
  const pay = changeInventory(state, "town", "wheat", -payUnits, `从${OUTSIDE_TOWN_NAME}进口${item.name}付款`, "trade_import", content, transactionId);
  if (!pay.ok) return { ok: false, reason: "镇小麦库存不足以支付" };
  const actualPayJin = unitsToQuantity(payUnits, content);
  const actualQtyJin = Math.round(actualPayJin / price * 100) / 100;
  ot.wheatStockJin = Math.round((ot.wheatStockJin + actualPayJin) * 100) / 100;
  addInventory(state, "town", itemId, actualQtyJin, `从${OUTSIDE_TOWN_NAME}进口${item.name}`, "trade_import", content);
  ot.stats.importJin = Math.round((ot.stats.importJin + actualPayJin) * 100) / 100;
  ot.stats.yearImportJin = Math.round((ot.stats.yearImportJin + actualPayJin) * 100) / 100;
  ot.stats.trades += 1;
  ot.tradeMemory[itemId] = (ot.tradeMemory[itemId] || 0) - actualQtyJin;
  recomputePrices(state);
  return { ok: true, direction, itemId, quantityJin: actualQtyJin, valueJin: actualPayJin, tariffJin: 0, priceWheatPerUnit: price };
}

// 政策命令：调整出口关税税率（%）。
export function setTradeTariffRate(state, percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0 || value > MAX_TRADE_TARIFF_PERCENT) {
    return { ok: false, reason: `关税税率须在0—${MAX_TRADE_TARIFF_PERCENT}%之间` };
  }
  state.policy ||= {};
  state.policy.tradeTariffRate = value;
  return { ok: true, tradeTariffRate: value };
}

// 小麦贷款：天灾欠收时本镇放贷给四地主镇。玩家定斤数和年利率。
// 放贷：镇库小麦 -> 外镇小麦库存；还款：外镇按年结时从小麦库存扣还本付息。
export const MAX_LOAN_JIN = 1000000;
export const MAX_LOAN_RATE_PERCENT = 50;
export function issueWheatLoan(state, principalJin, annualRatePercent, content) {
  const ot = ensureOutsideTown(state);
  const principal = Math.round(Number(principalJin) * 100) / 100;
  const rate = Number(annualRatePercent);
  if (!Number.isFinite(principal) || principal <= 0) return { ok: false, reason: "贷款斤数须大于0" };
  if (principal > MAX_LOAN_JIN) return { ok: false, reason: `单笔贷款不超过${MAX_LOAN_JIN}斤` };
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_LOAN_RATE_PERCENT) {
    return { ok: false, reason: `年利率须在0—${MAX_LOAN_RATE_PERCENT}%之间` };
  }
  const scale = content.precision.inventoryUnitsPerJin;
  const units = Math.floor(principal * scale);
  if (units <= 0) return { ok: false, reason: "贷款斤数过小" };
  const townWheat = Math.max(0, state.accounts?.town?.wheat || 0);
  if (townWheat < units) return { ok: false, reason: "镇库小麦不足，放贷失败" };
  state.accounts.town.wheat = townWheat - units;
  ot.wheatStockJin = Math.round((ot.wheatStockJin + principal) * 100) / 100;
  const loan = {
    id: `loan-${state.year}-${state.day}-${ot.loans.length}`,
    principalJin: principal,
    annualRatePercent: Math.round(rate * 100) / 100,
    outstandingJin: principal,
    accruedInterestJin: 0,
    issueYear: state.year,
    issueDay: state.day,
    status: "active"
  };
  ot.loans.push(loan);
  ot.loanStats.totalIssuedJin = Math.round((ot.loanStats.totalIssuedJin + principal) * 100) / 100;
  ot.loanStats.activeLoans = ot.loans.filter(l => l.status === "active").length;
  const transactionId = makeTransactionId(state);
  recordLedger(state, {
    type: "wheat_loan_issue", transactionId, source: "town", destination: "outside_town",
    itemId: "wheat", quantityUnits: units, qeqUnits: 0,
    reason: `向${OUTSIDE_TOWN_NAME}发放小麦贷款${principal}斤，年利率${loan.annualRatePercent}%`
  }, content);
  recordEvent(state, `向${OUTSIDE_TOWN_NAME}发放小麦贷款${Math.round(principal)}斤（年利率${loan.annualRatePercent}%），解其天灾之急。`, content);
  return { ok: true, loan };
}

// 每年年结时：贷款计息 + 外镇从结余小麦中还款（先息后本）
export function settleWheatLoansYear(state, content) {
  const ot = ensureOutsideTown(state);
  let repaidJin = 0;
  let interestJin = 0;
  for (const loan of ot.loans) {
    if (loan.status !== "active") continue;
    // 计一年利息
    const yearInterest = Math.round(loan.outstandingJin * loan.annualRatePercent / 100 * 100) / 100;
    loan.accruedInterestJin = Math.round((loan.accruedInterestJin + yearInterest) * 100) / 100;
    // 外镇用结余小麦还款：先还利息，再还本金
    const totalDue = Math.round((loan.outstandingJin + loan.accruedInterestJin) * 100) / 100;
    const payable = Math.min(totalDue, Math.max(0, ot.wheatStockJin));
    if (payable > 0) {
      const payInterest = Math.min(loan.accruedInterestJin, payable);
      const payPrincipal = Math.min(loan.outstandingJin, payable - payInterest);
      loan.accruedInterestJin = Math.round((loan.accruedInterestJin - payInterest) * 100) / 100;
      loan.outstandingJin = Math.round((loan.outstandingJin - payPrincipal) * 100) / 100;
      ot.wheatStockJin = Math.round((ot.wheatStockJin - payInterest - payPrincipal) * 100) / 100;
      const townUnits = Math.floor((payInterest + payPrincipal) * content.precision.inventoryUnitsPerJin);
      state.accounts ||= {};
      state.accounts.town ||= {};
      state.accounts.town.wheat = (state.accounts.town.wheat || 0) + townUnits;
      repaidJin = Math.round((repaidJin + payInterest + payPrincipal) * 100) / 100;
      interestJin = Math.round((interestJin + payInterest) * 100) / 100;
      if (loan.outstandingJin <= 0.01 && loan.accruedInterestJin <= 0.01) {
        loan.status = "repaid";
        recordEvent(state, `${OUTSIDE_TOWN_NAME}还清小麦贷款（本金${loan.principalJin}斤）。`, content);
      }
    }
  }
  ot.loanStats.totalRepaidJin = Math.round((ot.loanStats.totalRepaidJin + repaidJin) * 100) / 100;
  ot.loanStats.totalInterestJin = Math.round((ot.loanStats.totalInterestJin + interestJin) * 100) / 100;
  ot.loanStats.activeLoans = ot.loans.filter(l => l.status === "active").length;
  if (repaidJin > 0) {
    recordLedger(state, {
      type: "wheat_loan_repay", transactionId: makeTransactionId(state),
      source: "outside_town", destination: "town", itemId: "wheat",
      quantityUnits: Math.floor(repaidJin * content.precision.inventoryUnitsPerJin), qeqUnits: 0,
      reason: `${OUTSIDE_TOWN_NAME}偿还小麦贷款${Math.round(repaidJin)}斤（含利息${Math.round(interestJin)}斤）`
    }, content);
  }
  return { repaidJin, interestJin };
}

// 供 UI/面板读取的视图数据（只读，不回写游戏状态）。
export function selectOutsideTownView(state, content) {
  const ot = readOutsideTown(state);
  const scale = content.precision.inventoryUnitsPerJin;
  const townStock = {};
  for (const itemId of TRADE_SELL_ITEMS) {
    townStock[itemId] = Math.round(((state.accounts?.town?.[itemId] || 0) / scale) * 100) / 100;
  }
  return {
    name: ot.name,
    rulers: ot.rulers,
    landMu: ot.landMu,
    laborers: ot.laborers,
    population: Math.round(ot.population),
    wheatStockJin: Math.round(ot.wheatStockJin),
    prosperity: Math.round(ot.prosperity * 10) / 10,
    weather: ot.weather,
    event: ot.event,
    tradeClosed: ot.tradeClosed,
    saltDemand: ot.saltDemand,
    woodDemand: ot.woodDemand,
    buyPrices: { ...ot.buyPrices },
    sellPrices: { ...ot.sellPrices },
    townStock,
    townWheatJin: Math.round(((state.accounts?.town?.wheat || 0) / scale) * 100) / 100,
    tariffRate: tradeTariffRate(state),
    stats: { ...ot.stats },
    lastYearProductionJin: ot.lastYearProductionJin || 0,
    lastYearConsumptionJin: ot.lastYearConsumptionJin || 0,
    loans: (ot.loans || []).map(l => ({ ...l })),
    loanStats: { ...ot.loanStats }
  };
}
