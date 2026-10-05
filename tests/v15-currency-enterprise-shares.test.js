import test from "node:test";
import assert from "node:assert/strict";
import { jobCount, setJobCount } from "../src/systems/households.js";
import fs from "node:fs";
import { simulation } from "../src/engine.js";
import { CONTENT } from "../src/content/index.js";
import { migrateSave } from "../src/persistence/migrations.js";
import { exportState, importState } from "../src/persistence/storage.js";
import { processListedCompany, settleAnnualCompanyDividends } from "../src/systems/companies.js";
import { renderEconomy } from "../src/ui/panel-economy.js";
import { purchaseItemForResidents } from "../src/systems/consumer-market.js";
import { grantResidentVouchers, richestHousehold } from "./helpers-v16.js";
import { legacyVoucherState } from "./helpers-monetary.js";

const I = CONTENT.precision.inventoryUnitsPerJin;
const V = CONTENT.precision.currencyUnitsPerVoucher;

function addBuilding(state, typeId, id, level = 1, townLevels = level, privateLevels = 0) {
  const required = CONTENT.buildings[typeId].requiredPlotFeature || null;
  const plot = state.plots.find(row => (required ? row.feature === required : !row.feature) &&
    !state.buildings.some(building => building.plotId === row.id));
  assert.ok(plot, `missing plot for ${typeId}`);
  const building = {
    id, typeId, level,
    ownership: { townLevels, privateLevels, listedLevels: 0 },
    plotId: plot.id, x: plot.x, y: plot.y,
    materialInvestments: [], completed: { year: state.year, day: 1 }
  };
  state.buildings.push(building);
  const job = CONTENT.buildings[typeId].jobs[0];
  return building;
}

function listForShareTest(state, buildingId, options, ticker = "001", totalShares = 1000) {
  const formed = simulation.createCompany(state, buildingId, options);
  assert.equal(formed.ok, true, formed.reason);
  state.stockExchange ||= { legacyAccess: true, rotation: 0 };
  state.stockExchange.legacyAccess = true;
  state.monetaryReform.stage = "voucher";
  const listed = simulation.listCompanyShares(state, formed.companyId, { ticker, totalShares, priceVoucherPerShare: 1, offeredShares: 0 });
  assert.equal(listed.ok, true, listed.reason);
  return formed;
}

function blankUiView(state) {
  const view = simulation.selectDashboard(state, {});
  view.numericDrafts = {};
  view.currencyPreview = null;
  view.listingPreview = null;
  view.sharePreviewCompanyId = null;
  return view;
}

test("r04 粮券发行、转账与兑回严格守恒且不再建立兑付储备", () => {
  const state = legacyVoucherState();
  const townWheat = state.accounts.town.wheat;
  const totalQeq = simulation.totalQeq(state);
  const issue = simulation.issueGrainVouchers(state, "town", 12345);
  assert.equal(issue.ok, true, issue.reason);
  assert.equal(state.accounts.town.wheat, townWheat);
  assert.equal(state.currency.reserveWheatUnits, 0);
  assert.equal(state.currency.issuedUnits, 12345 * V);
  assert.equal(state.currency.balances.town, 12345 * V);
  assert.equal(simulation.totalQeq(state), totalQeq, "镇库自行发行不移动实际小麦");
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);

  const beforeResidentWheat = state.accounts.residents.wheat;
  const redeem = simulation.redeemGrainVouchers(state, "town", 2345);
  assert.equal(redeem.ok, true, redeem.reason);
  assert.equal(state.currency.reserveWheatUnits, 0);
  assert.equal(state.currency.issuedUnits, 10000 * V);
  assert.equal(state.accounts.town.wheat, townWheat);
  assert.equal(state.accounts.residents.wheat, beforeResidentWheat);
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);
});

test("公司等级、工人与产能只归属一个经营部分，升级前后总等级不重叠", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "salt-listed", 2, 2, 0);
  simulation.setEmployment(state, `${salt.id}::salt_workers`, 15);
  assert.equal(simulation.issueGrainVouchers(state, "town", 50000).ok, true);
  const listed = simulation.listCompany(state, salt.id, { levels: 1, operatingCapitalVoucher: 10000, initialMaterialQuantity: 0 });
  assert.equal(listed.ok, true, listed.reason);
  assert.deepEqual(salt.ownership, { townLevels: 1, privateLevels: 0, listedLevels: 1 });
  assert.equal(jobCount(state, `${salt.id}::salt_workers`), 10);
  assert.equal(jobCount(state, `${salt.id}::salt_workers::listed`), 5);
  const rows = simulation.selectJobRows(state).rows.filter(row => row.buildingId === salt.id);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 15);
  assert.equal(rows.reduce((sum, row) => sum + row.capacity, 0), 20);
  assert.equal(state.companies[listed.companyId].totalShares, 0);
  assert.equal(state.companies[listed.companyId].townShares, 0);
  assert.equal(state.companies[listed.companyId].residentShares, 0);
  assert.equal(state.companies[listed.companyId].listing.listed, false);
  assert.equal(simulation.validateState(state).valid, true, simulation.validateState(state).errors.join("；"));
});

test("磨坊企业采购居民小麦、向面包房企业供粉、面包销售后才确认收入和利润", () => {
  const state = legacyVoucherState();
  state.policy.unemploymentBenefit.enabled = false;
  addBuilding(state, "mill", "listed-mill");
  addBuilding(state, "bakery", "listed-bakery");
  assert.equal(simulation.issueGrainVouchers(state, "town", 100000).ok, true);
  const mill = simulation.listCompany(state, "listed-mill", { levels: 1, operatingCapitalVoucher: 25000, initialMaterialQuantity: 0 });
  const bakery = simulation.listCompany(state, "listed-bakery", { levels: 1, operatingCapitalVoucher: 25000, initialMaterialQuantity: 0 });
  assert.equal(mill.ok, true, mill.reason);
  assert.equal(bakery.ok, true, bakery.reason);
  const residentWheatBefore = state.accounts.residents.wheat;
  const outcome = simulation.advanceDay(state);
  const millCompany = state.companies[mill.companyId];
  const bakeryCompany = state.companies[bakery.companyId];
  assert.ok(millCompany.accounts.day.purchasedInputUnits.wheat > 0, "磨坊必须真实买入小麦");
  assert.ok(state.accounts.residents.wheat < residentWheatBefore, "居民卖出小麦后实物库存减少");
  assert.ok(bakeryCompany.accounts.day.purchasedInputUnits.flour > 0, "面包房必须从可售面粉中真实采购");
  assert.ok(millCompany.accounts.day.revenueVoucherUnits > 0, "磨坊卖出面粉后取得粮券收入");
  assert.ok(bakeryCompany.accounts.day.producedUnits.bread > 0, "企业面包进入企业库存后再销售");
  assert.ok(outcome.trade.purchasedBreadJin > 0, "居民真实购买上市企业面包");
  assert.ok(bakeryCompany.accounts.day.revenueVoucherUnits > 0);
  assert.ok((millCompany.inventory.flour || 0) >= 0 && (bakeryCompany.inventory.bread || 0) >= 0);
  assert.ok(millCompany.cashVoucherUnits >= 0 && bakeryCompany.cashVoucherUnits >= 0);
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);
  assert.equal(simulation.validateState(state).valid, true, simulation.validateState(state).errors.join("；"));
});

test("股份出售只把居民粮券转给镇库；高价降低认购，股份总数恒定", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "share-salt");
  assert.equal(simulation.issueGrainVouchers(state, "town", 50000).ok, true);
  const listed = listForShareTest(state, salt.id, { levels: 1, operatingCapitalVoucher: 10000, initialMaterialQuantity: 0 }, "101", 1000);
  const company = state.companies[listed.companyId];
  // 股票不会自动换粮；这里由居民主动存粮取得投资所需粮券。
  assert.equal(grantResidentVouchers(state, 150000, CONTENT).ok, true);
  company.operatingDays = 30;
  company.accounts.cumulative.profitVoucherUnits = 10000 * V;
  company.retainedEarningsVoucherUnits = 10000 * V;

  assert.equal(simulation.configureShareOffer(state, company.id, 400, 10).ok, true);
  const reasonable = simulation.previewShareSubscription(state, company.id);
  assert.equal(reasonable.available, true, reasonable.reason);
  assert.ok(reasonable.subscribedShares > 0);

  assert.equal(simulation.configureShareOffer(state, company.id, 400, 100000).ok, true);
  const expensive = simulation.previewShareSubscription(state, company.id);
  assert.ok(expensive.subscribedShares < reasonable.subscribedShares, "高价必须降低可成交认购量");

  assert.equal(simulation.configureShareOffer(state, company.id, 200, 10).ok, true);
  const beforeTown = state.currency.balances.town;
  const beforeResident = state.currency.balances.residents;
  const beforeCompanyCash = company.cashVoucherUnits;
  const totalShares = company.totalShares;
  const sale = simulation.subscribeShares(state, company.id);
  assert.equal(sale.ok, true, sale.reason);
  assert.equal(company.townShares + company.residentShares, totalShares);
  assert.equal(company.cashVoucherUnits, beforeCompanyCash, "出售镇库已有股份不得把售股款同时送进企业");
  assert.equal(state.currency.balances.town - beforeTown, sale.proceedsVoucherUnits);
  assert.equal(beforeResident - state.currency.balances.residents, sale.proceedsVoucherUnits);
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);
});

test("年度分红不超过未分配利润和可支付现金，未偿清欠薪阻止分红且同年不重复", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "dividend-salt");
  assert.equal(simulation.issueGrainVouchers(state, "town", 100000).ok, true);
  const listed = listForShareTest(state, salt.id, { levels: 1, operatingCapitalVoucher: 50000, initialMaterialQuantity: 0 }, "102", 1000);
  const company = state.companies[listed.companyId];
  const owner = richestHousehold(state);
  company.townShares = 500; company.residentShares = 500;
  company.householdShares = { [owner.id]: 500 };
  owner.shares ||= {}; owner.shares[company.id] = 500;
  company.retainedEarningsVoucherUnits = 4000 * V;
  company.accounts.cumulative.profitVoucherUnits = 4000 * V;
  setJobCount(state, `${salt.id}::salt_workers::listed`, 0, CONTENT); // 本测试聚焦分红上限，运营储备为0。
  const townBefore = state.currency.balances.town;
  const residentsBefore = state.currency.balances.residents;
  const rows = settleAnnualCompanyDividends(state, 1, CONTENT);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalVoucherUnits, 4000 * V);
  assert.equal(state.currency.balances.town - townBefore, 2000 * V);
  assert.equal(state.currency.balances.residents - residentsBefore, 2000 * V);
  assert.equal(company.retainedEarningsVoucherUnits, 0);
  assert.equal(settleAnnualCompanyDividends(state, 1, CONTENT).length, 0, "同一年度不得重复分红");

  company.lastDividendYear = 1;
  company.retainedEarningsVoucherUnits = 5000 * V;
  const impossibleDebt = 1000000 * V;
  company.payroll.arrearsVoucherUnits = impossibleDebt;
  company.payroll.legacyUnattributedArrearsVoucherUnits = impossibleDebt;
  const blocked = settleAnnualCompanyDividends(state, 2, CONTENT);
  assert.ok(company.payroll.arrearsVoucherUnits > 0, "资金不足时必须保留未偿工资债务");
  assert.equal(blocked[0].totalVoucherUnits, 0);
});

test("v6旧存档不再自动迁移", () => {
  const legacy = legacyVoucherState();
  legacy.version = 6;
  legacy.schemaVersion = 6;
  assert.throws(() => migrateSave(legacy, CONTENT), /旧版存档不兼容/);
});
test("经营面板分开公司成立与交易所上市，并保留安全区固定操作栏", () => {
  const state = legacyVoucherState();
  addBuilding(state, "saltworks", "ui-listed");
  const html = renderEconomy(blankUiView(state));
  assert.match(html, /新交易以粮券结算/);
  assert.match(html, /预览成立公司/);
  assert.match(html, /交易所/);
  const css = fs.readFileSync(new URL("../src/styles/main.css", import.meta.url), "utf8");
  assert.match(css, /business-sticky-actions/);
  assert.match(css, /safe-area-inset-bottom/);
});


test("镇库可用粮券时可从上市伐木企业采购施工木材，成交后再一次性开工扣料", () => {
  const state = legacyVoucherState();
  const lumber = addBuilding(state, "lumberyard", "listed-lumberyard");
  assert.equal(simulation.issueGrainVouchers(state, "town", 40000).ok, true);
  const listed = simulation.listCompany(state, lumber.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  company.inventory.wood = 2000 * I;
  company.inventoryCostVoucherUnits.wood = 0;
  const plot = state.plots.find(row => !row.feature && !state.buildings.some(building => building.plotId === row.id));
  assert.ok(plot);

  const view = simulation.selectDashboard(state, { build: "public_housing", plotId: plot.id });
  const option = view.constructionOptions.find(row => row.id === "public_housing");
  const wood = option.materials.find(row => row.itemId === "wood");
  assert.equal(wood.missing, 0, "预览应把企业可售木材和镇库购买力计入可满足材料");
  assert.equal(wood.marketPurchasable, 2000);
  // 0.2.3 流通改革：批发市场做市商默认木材售价 16（原 15），2000 单位 = 32000 粮券。
  assert.equal(wood.marketCostVoucher, 32000);

  const companyCashBefore = company.cashVoucherUnits;
  const townCashBefore = state.currency.balances.town;
  const started = simulation.buildAt(state, "public_housing", plot.id);
  assert.equal(started.ok, true, started.reason);
  assert.equal(company.inventory.wood, 0);
  assert.equal(state.accounts.town.wood, 0, "采购木材在同一次开工操作中进入工程，不重复保留在镇库可用库存");
  assert.equal(company.cashVoucherUnits - companyCashBefore, 32000 * V);
  assert.equal(townCashBefore - state.currency.balances.town, 32000 * V);
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);
  assert.equal(simulation.validateState(state).valid, true, simulation.validateState(state).errors.join("；"));
});

test("多个同价卖家共享同一居民需求池，成交总量不重复且轮换避免后序卖家长期饿死", () => {
  const state = legacyVoucherState();
  const bakery1 = addBuilding(state, "bakery", "fair-bakery-1");
  const bakery2 = addBuilding(state, "bakery", "fair-bakery-2");
  assert.equal(grantResidentVouchers(state, 100, CONTENT).ok, true);
  const listed1 = simulation.listCompany(state, bakery1.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  const listed2 = simulation.listCompany(state, bakery2.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  assert.equal(listed1.ok, true, listed1.reason);
  assert.equal(listed2.ok, true, listed2.reason);
  const c1 = state.companies[listed1.companyId];
  const c2 = state.companies[listed2.companyId];
  state.accounts.town.bread = 10;
  c1.inventory.bread = 10; c1.inventoryCostVoucherUnits.bread = 0;
  c2.inventory.bread = 10; c2.inventoryCostVoucherUnits.bread = 0;

  const first = purchaseItemForResidents(state, "bread", 2, 2, CONTENT, "公平成交测试");
  assert.equal(first.purchasedUnits, 2);
  assert.equal(first.sellerRows.reduce((sum, row) => sum + row.quantityUnits, 0), 2, "同一份需求不得被每个卖家重复成交");
  const firstSellers = new Set(first.sellerRows.map(row => row.seller));
  assert.equal(firstSellers.has("company:" + c2.id), false, "第一轮允许尾部卖家因极小需求未成交");

  const second = purchaseItemForResidents(state, "bread", 2, 2, CONTENT, "公平成交测试第二轮");
  assert.equal(second.purchasedUnits, 2);
  const third = purchaseItemForResidents(state, "bread", 2, 2, CONTENT, "公平成交测试第三轮");
  assert.equal(third.purchasedUnits, 2);
  const laterSellers = new Set([...second.sellerRows, ...third.sellerRows].map(row => row.seller));
  assert.equal(laterSellers.has("company:" + c2.id), true, "轮换后尾部卖家应获得成交机会");
  assert.equal(simulation.validateCurrencyInvariant(state).valid, true);
});


test("上市企业缺工停摆日不计入经营观察天数", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "opday-no-workers");
  const listed = simulation.listCompany(state, salt.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  setJobCount(state, `${salt.id}::salt_workers::listed`, 0, CONTENT);

  const result = processListedCompany(state, company, CONTENT);
  assert.equal(result.status, "no_workers");
  assert.equal(company.operatingDays, 0, "没有实际生产不能增加经营观察天数");
});

test("上市企业缺料停摆日不计入经营观察天数", () => {
  const state = legacyVoucherState();
  const mill = addBuilding(state, "mill", "opday-no-materials");
  const listed = simulation.listCompany(state, mill.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  setJobCount(state, `${mill.id}::millers::listed`, 1, CONTENT);
  assert.equal(company.cashVoucherUnits, 0);
  assert.equal(company.inventory.wheat, 0);

  const result = processListedCompany(state, company, CONTENT);
  assert.equal(result.status, "no_cash_or_materials");
  assert.equal(result.batches, 0);
  assert.equal(company.operatingDays, 0, "有工人但未实际生产也不能增加经营观察天数");
});

test("上市企业正常生产日才累计经营观察天数", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "opday-producing");
  const listed = simulation.listCompany(state, salt.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 0 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  setJobCount(state, `${salt.id}::salt_workers::listed`, 1, CONTENT);

  const result = processListedCompany(state, company, CONTENT);
  assert.equal(result.status, "ready");
  assert.ok(result.batches > 0);
  assert.equal(company.operatingDays, 1);
  assert.ok(company.accounts.day.producedUnits.salt > 0);
});

test("企业初始材料投入同步转移镇库库存成本基数", () => {
  const state = legacyVoucherState();
  const mill = addBuilding(state, "mill", "initial-material-cost-basis");
  const materialUnits = 100 * I;
  const townUnitsBefore = state.accounts.town.wheat;
  const townBasisBefore = state.business.inventoryCostWheatUnits.town.wheat;
  const expectedTransferredBasis = Math.floor(townBasisBefore * materialUnits / townUnitsBefore);

  const listed = simulation.listCompany(state, mill.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 100 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  assert.equal(state.accounts.town.wheat, townUnitsBefore - materialUnits);
  assert.equal(state.business.inventoryCostWheatUnits.town.wheat, townBasisBefore - expectedTransferredBasis);
  assert.equal(company.inventory.wheat, materialUnits);
  assert.equal(company.inventoryCostVoucherUnits.wheat, expectedTransferredBasis);
  assert.equal(company.initialInvestment.materials[0].costBasisVoucherUnits, expectedTransferredBasis);
  assert.equal(state.business.inventoryCostWheatUnits.town.wheat + company.inventoryCostVoucherUnits.wheat, townBasisBefore,
    "实物资本投入只能转移成本基数，不能复制或销毁成本基数");
});

test("上市企业实物生产税入镇库时同步转入对应库存成本基数", () => {
  const state = legacyVoucherState();
  const mill = addBuilding(state, "mill", "tax-cost-basis");
  state.policy.privateProductionTaxPercent.mill = 50;
  const listed = simulation.listCompany(state, mill.id, { levels: 1, operatingCapitalVoucher: 0, initialMaterialQuantity: 80 });
  assert.equal(listed.ok, true, listed.reason);
  const company = state.companies[listed.companyId];
  setJobCount(state, `${mill.id}::millers::listed`, 1, CONTENT);
  const townFlourBefore = state.accounts.town.flour;
  const townFlourBasisBefore = state.business.inventoryCostWheatUnits.town.flour;

  const result = processListedCompany(state, company, CONTENT);
  assert.equal(result.status, "ready");
  const taxUnits = company.accounts.day.taxedUnits.flour || 0;
  const taxCost = company.accounts.day.taxCostVoucherUnits || 0;
  assert.ok(taxUnits > 0);
  assert.ok(taxCost > 0);
  assert.equal(state.accounts.town.flour - townFlourBefore, taxUnits);
  assert.equal(state.business.inventoryCostWheatUnits.town.flour - townFlourBasisBefore, taxCost,
    "税收实物进入镇库时必须带着对应成本基数");
  assert.equal(company.inventoryCostVoucherUnits.wheat, 0, "投入小麦的成本基数应随生产完整流出企业原料库存");
});
