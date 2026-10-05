import { escapeHtml, number } from "./format.js";
import { renderNumericInput } from "./numeric-drafts.js";

const ITEM_META = {
  wheat: { name: "小麦", unit: "斤" },
  flour: { name: "面粉", unit: "斤" },
  bread: { name: "面包", unit: "斤" },
  salt: { name: "食盐", unit: "斤" },
  wood: { name: "木材", unit: "单位" }
};
const SELL_ITEMS = ["wheat", "flour", "bread", "salt", "wood"];
const BUY_ITEMS = ["wheat", "flour", "bread"];

function tradeRow(view, itemId) {
  const ot = view.outsideTown;
  const meta = ITEM_META[itemId];
  const buyPrice = ot.buyPrices?.[itemId];
  const sellPrice = ot.sellPrices?.[itemId];
  const stock = ot.townStock?.[itemId] ?? 0;
  const canBuy = BUY_ITEMS.includes(itemId);
  return `<div class="cardlet"><div class="row"><span class="label">${meta.name}</span>
      <strong class="value">收购 ${number(buyPrice, 2)}${canBuy ? ` / 售价 ${number(sellPrice, 2)}` : ""} <span class="subtle">小麦斤/${meta.unit}</span></strong></div>
    <div class="row"><span class="label">镇库存</span><strong class="value">${number(stock)}${meta.unit}</strong></div>
    <div class="row"><span class="label">数量</span><div class="setting-input">${renderNumericInput(view, { key: `outside-qty:${itemId}`, kind: "outside-trade-qty", target: itemId, value: "", label: `${meta.name}交易数量`, minimum: 0, maximum: 100000, className: "setting-editor" })}<b>${meta.unit}</b>
      <button class="secondary" data-outside-sell="${itemId}">卖出</button>
      ${canBuy ? `<button class="secondary" data-outside-buy="${itemId}">买入</button>` : ""}</div></div>
  </div>`;
}

export function renderOutsideTown(view) {
  const ot = view.outsideTown;
  if (!ot) return `<div class="subtle">外贸数据不可用。</div>`;
  const eventText = ot.event ? `${escapeHtml(ot.event.type)}（${ot.event.year}年）` : "无";
  const statusLine = ot.tradeClosed
    ? `<div class="row"><span class="label">商路</span><strong class="value">中断中（今年无法贸易）</strong></div>`
    : "";
  return `<h2>外贸 · ${escapeHtml(ot.name)}</h2>
    <div class="cardlet">
      <div class="row"><span class="label">统治者</span><strong class="value">${ot.rulers.map(r => escapeHtml(r) + "地主").join("、")}</strong></div>
      <div class="row"><span class="label">耕地 / 劳动力</span><strong class="value">${number(ot.landMu)}亩 / ${number(ot.laborers)}人</strong></div>
      <div class="row"><span class="label">人口 / 繁荣度</span><strong class="value">${number(ot.population)}人 / ${number(ot.prosperity, 1)}</strong></div>
      <div class="row"><span class="label">小麦库存</span><strong class="value">${number(ot.wheatStockJin)}斤</strong></div>
      <div class="row"><span class="label">去年收成 / 消耗</span><strong class="value">${number(ot.lastYearProductionJin)} / ${number(ot.lastYearConsumptionJin)}斤</strong></div>
      <div class="row"><span class="label">今年大事</span><strong class="value">${eventText}</strong></div>
      ${statusLine}
      <div class="subtle">农业小镇，盛产小麦；对盐、木材出价高。所有价格以小麦斤计价、实物小麦结算。</div>
    </div>
    ${SELL_ITEMS.map(itemId => tradeRow(view, itemId)).join("")}
    <div class="cardlet"><div class="row"><span class="label">出口关税税率</span><div class="setting-input">${renderNumericInput(view, { key: "trade-tariff-rate", kind: "trade-tariff-rate", target: "tradeTariff", value: ot.tariffRate ?? 5, label: "出口关税税率", minimum: 0, maximum: 30, className: "setting-editor" })}<b>%</b></div></div>
      <div class="row"><span class="label">本年出口 / 关税</span><strong class="value">${number(ot.stats?.yearExportJin || 0)} / ${number(ot.stats?.yearTariffJin || 0, 1)}斤</strong></div>
      <div class="row"><span class="label">累计关税</span><strong class="value">${number(ot.stats?.tariffJin || 0, 1)}斤</strong></div>
    </div>`;
}
