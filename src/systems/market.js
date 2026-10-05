import { itemQeqUnitsPerInventoryUnit } from "../economy/inventory.js";
import { purchaseItemForResidents } from "./consumer-market.js";
import { currentUnitPrice } from "../economy/prices.js";

export function breadDemandShare(price, content) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const base = content.rules.breadBasePriceWheatPerJin;
  return Math.max(0, Math.min(
    content.rules.breadTargetShareMaximum,
    content.rules.breadTargetShareAtBasePrice * Math.pow(base / price, content.rules.breadPriceElasticity)
  ));
}

// 主食需求份额：优先读取可调规则，缺省时回落到小麦/面粉/面包三项固定比例。
export function stapleDemandShares(content) {
  const rule = content.rules.stapleDemandShares;
  return {
    wheat: rule?.wheat ?? 0.6,
    flour: rule?.flour ?? 0.2,
    bread: rule?.bread ?? 0.2
  };
}

// 单项主食按“净需求”购买：先扣减居民当日已持有量，再折算成购买单位数。
function buyStapleItem(state, population, content, itemId, share) {
  const price = currentUnitPrice(state, itemId, content);
  const item = content.items[itemId];
  const dailyNeed = population * content.rules.foodPerPersonDay * content.precision.qeqUnitsPerJin;
  const perUnitQeq = itemQeqUnitsPerInventoryUnit(item, content);
  const targetQeq = Math.floor(dailyNeed * share);
  const currentQeq = (state.accounts.residents[itemId] || 0) * perUnitQeq;
  const targetUnits = perUnitQeq > 0
    ? Math.max(0, Math.floor((targetQeq - currentQeq) / perUnitQeq)) : 0;

  // Quote the town cost basis before the shared market moves inventory. Company sales account for their own COGS.
  const townBefore = state.accounts.town[itemId] || 0;
  const result = purchaseItemForResidents(state, itemId, targetUnits, price, content, `居民以粮券购买${item?.name || itemId}`);
  const soldJin = result.purchasedUnits / content.precision.inventoryUnitsPerJin;
  const voucher = result.paidVoucherUnits / content.precision.currencyUnitsPerVoucher;
  return {
    itemId,
    targetShare: share,
    targetQeq,
    targetQeqJin: targetQeq / content.precision.qeqUnitsPerJin,
    targetUnits,
    price,
    purchasedUnits: result.purchasedUnits,
    purchasedJin: soldJin,
    paidVoucherUnits: result.paidVoucherUnits,
    paidVoucher: voucher,
    townStockBeforeJin: townBefore / content.precision.inventoryUnitsPerJin,
    sellerRows: result.sellerRows,
    limitReason: targetUnits <= 0 ? `居民自有${item?.name || itemId}已满足今日目标` : result.reason
  };
}

export function buyStaplesForResidents(state, population, content) {
  const shares = stapleDemandShares(content);
  const rows = ["wheat", "flour", "bread"].map(itemId => buyStapleItem(state, population, content, itemId, shares[itemId]));
  const bread = rows.find(row => row.itemId === "bread");
  const purchasedBreadUnits = bread.purchasedUnits;
  const townBreadSold = bread.sellerRows.filter(row => row.seller === "town").reduce((sum, row) => sum + row.quantityUnits, 0);
  const townBreadRevenue = bread.sellerRows.filter(row => row.seller === "town").reduce((sum, row) => sum + row.paidVoucherUnits, 0);
  const townBreadCogs = bread.sellerRows.filter(row => row.seller === "town")
    .reduce((sum, row) => sum + (row.sellerCostVoucherUnits || 0), 0);
  if (townBreadSold > 0) {
    for (const group of [state.business.day, state.business.year, state.business.cumulative]) {
      group.soldBreadUnits = (group.soldBreadUnits || 0) + townBreadSold;
      group.revenueWheatUnits = (group.revenueWheatUnits || 0) + townBreadRevenue;
      group.breadCogsWheatUnits = (group.breadCogsWheatUnits || 0) + townBreadCogs;
    }
  }

  state.market.staplesLastDay = {
    shares,
    rows: rows.map(row => ({
      itemId: row.itemId, targetShare: row.targetShare, targetQeqJin: row.targetQeqJin,
      purchasedJin: row.purchasedJin, paidVoucher: row.paidVoucher, limitReason: row.limitReason
    })),
    purchasedJin: Object.fromEntries(rows.map(row => [row.itemId, row.purchasedJin])),
    paidVoucher: Object.fromEntries(rows.map(row => [row.itemId, row.paidVoucher])),
    sellerRows: rows.flatMap(row => row.sellerRows)
  };
  // 兼容旧读数：lastDay 继续以面包为主体，但份额改为固定的主食拆分份额。
  state.market.lastDay = {
    targetShare: bread.targetShare,
    targetBreadQeqJin: bread.targetQeqJin,
    purchasedBreadJin: bread.purchasedJin,
    paidVoucher: bread.paidVoucher,
    paidWheatJin: bread.paidVoucher,
    townStockBeforeJin: bread.townStockBeforeJin,
    sellerRows: bread.sellerRows,
    limitReason: bread.limitReason,
    staples: state.market.staplesLastDay
  };
  return state.market.lastDay;
}

// 旧调用兼容：等价于按下单日面包固定份额购买，其余主食由 buyStaplesForResidents 负责。
export function buyBreadForResidents(state, population, content) {
  return buyStaplesForResidents(state, population, content);
}
