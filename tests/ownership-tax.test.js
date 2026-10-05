import test from "node:test";
import assert from "node:assert/strict";
import { jobCount, setJobCount } from "../src/systems/households.js";
import { simulation } from "../src/engine.js";
import { CONTENT } from "../src/content/index.js";
import { selectJobRows } from "../src/selectors/labor.js";
import { exportState, importState } from "../src/persistence/storage.js";
import { processPrivateBuilding } from "../src/systems/private-industry.js";
import { migrateSave } from "../src/persistence/migrations.js";
import { renderPolicy } from "../src/ui/panel-policy.js";
import { renderSite } from "../src/ui/panel-site.js";
import { grantResidentVouchers, setResidentInventoryJin, richestHousehold } from "./helpers-v16.js";
import { legacyVoucherState } from "./helpers-monetary.js";

function addBuilding(state, typeId, id, level = 1, townLevels = level, privateLevels = 0) {
  const plot = state.plots.find(row => !row.feature && !state.buildings.some(b => b.plotId === row.id));
  const building = { id, typeId, level, ownership: { townLevels, privateLevels }, plotId: plot.id, x: plot.x, y: plot.y,
    materialInvestments: [], completed: { year: state.year, day: 1 } };
  state.buildings.push(building);
  const job = CONTENT.buildings[typeId].jobs[0];
  if (job) {
  }
  return building;
}

test("农业税0%、50%、80%与年中调税按农事日平均分粮", () => {
  for (const [rate, town, resident] of [[0, 0, 1600000], [50, 800000, 800000], [80, 1280000, 320000]]) {
    const state = simulation.createInitialState();
    simulation.setAgricultureTax(state, rate);
    simulation.advanceDays(state, 274);
    const harvest = state.agriculture.taxHistory.at(-1);
    assert.equal(harvest.townUnits / CONTENT.precision.inventoryUnitsPerJin, town);
    assert.equal(harvest.residentUnits / CONTENT.precision.inventoryUnitsPerJin, resident);
  }
  const mixed = simulation.createInitialState();
  simulation.setAgricultureTax(mixed, 0);
  simulation.advanceDays(mixed, 137);
  simulation.setAgricultureTax(mixed, 80);
  simulation.advanceDays(mixed, 137);
  const harvest = mixed.agriculture.taxHistory.at(-1);
  assert.equal(harvest.averageRateBps, 4000);
  assert.equal(harvest.townUnits + harvest.residentUnits, harvest.totalUnits);
});

test("经营权成交守恒、保留总等级与总就业，镇营工资继续只按镇营工人支付", () => {
  const state = simulation.createInitialState();
  const salt = addBuilding(state, "saltworks", "salt-works-A", 2, 2, 0);
  assert.equal(simulation.setEmployment(state, `${salt.id}::salt_workers`, 10).assigned, 10);
  const buyer = richestHousehold(state);
  assert.equal(grantResidentVouchers(state, 100000, CONTENT, buyer.id).ok, true);
  const beforeGoods = state.accounts.residents.wheat + state.accounts.town.wheat;
  const beforeJobs = selectJobRows(state, CONTENT).employed;
  const quote = simulation.selectOperatingRightPreview(state, salt.id);
  assert.ok(quote.referencePriceWheatJin > 0);
  assert.ok(quote.maxHouseholdPayVoucher > 0);
  assert.equal(simulation.setOperatingRightPrice(state, salt.id, Math.min(quote.maximumPriceWheatJin / 2, quote.maxHouseholdPayVoucher / 2)).ok, true);
  const priced = simulation.selectOperatingRightPreview(state, salt.id);
  assert.equal(priced.available, true, priced.reason);
  const sale = simulation.sellOperatingLevel(state, salt.id);
  assert.equal(sale.ok, true, sale.reason);
  assert.equal(salt.level, 2);
  assert.equal(salt.ownership.townLevels, 1);
  assert.equal(salt.ownership.privateLevels, 1);
  assert.equal(state.accounts.residents.wheat + state.accounts.town.wheat, beforeGoods);
  assert.ok(state.financialFlows.year.residents.operatingRightWheatUnits > 0);
  assert.equal(state.financialFlows.year.town.operatingRightWheatUnits, state.financialFlows.year.residents.operatingRightWheatUnits);
  assert.equal(selectJobRows(state, CONTENT).employed, beforeJobs);
  assert.equal(jobCount(state, `${salt.id}::salt_workers`), 10);
  assert.equal(jobCount(state, `${salt.id}::salt_workers::private`), 0);
  assert.equal(salt.ownership.townLevels + salt.ownership.privateLevels, salt.level);
});

test("无正估值、超过接受价或居民90天口粮储备不足时拒绝经营权交易", () => {
  const state = simulation.createInitialState();
  const wood = addBuilding(state, "lumberyard", "wood-no-market", 1, 1, 0);
  assert.equal(simulation.selectOperatingRightPreview(state, wood.id).available, false);
  const salt = addBuilding(state, "saltworks", "salt-priced", 2, 2, 0);
  const buyer = richestHousehold(state);
  assert.equal(grantResidentVouchers(state, 100000, CONTENT, buyer.id).ok, true);
  const quote = simulation.selectOperatingRightPreview(state, salt.id);
  assert.ok(quote.referencePriceWheatJin > 0);
  simulation.setOperatingRightPrice(state, salt.id, quote.maximumPriceWheatJin + 1);
  assert.equal(simulation.sellOperatingLevel(state, salt.id).ok, false);
  simulation.setOperatingRightPrice(state, salt.id, Math.min(quote.maximumPriceWheatJin / 2, quote.maxHouseholdPayVoucher / 2));
  setResidentInventoryJin(state, "wheat", 1000 * 2 * 30 / 6, CONTENT);
  assert.equal(simulation.selectOperatingRightPreview(state, salt.id).available, false);
});

test("民营盐场按需求渐进用工并按实物税分账，工资债务不由镇库承担", () => {
  const state = legacyVoucherState();
  const salt = addBuilding(state, "saltworks", "salt-private", 1, 0, 1);
  state.policy.unemploymentBenefit.enabled = false;
  const townWheat = state.accounts.town.wheat;
  const outcome = simulation.advanceDay(state);
  const privateResult = outcome.privateProduction.find(row => row.buildingId === salt.id);
  assert.equal(privateResult.workers, CONTENT.rules.operatingWorkerAdjustMaxPerCycle);
  assert.equal(privateResult.batches, privateResult.workers);
  const produced = state.privateEconomy.day.producedUnits.salt;
  const tax = state.privateEconomy.day.taxedUnits.salt;
  const residents = state.privateEconomy.day.outputUnits.salt;
  assert.equal(produced, tax + residents);
  assert.equal(tax / CONTENT.precision.inventoryUnitsPerJin, 1);
  assert.equal(residents / CONTENT.precision.inventoryUnitsPerJin, 9);
  assert.ok(state.accounts.town.wheat >= townWheat);
  assert.equal(state.payroll.lastDay.expectedWheatJin, 0);
  assert.equal(jobCount(state, `${salt.id}::salt_workers::private`), 2);
  assert.ok(state.privateEconomy.payrollByBuilding[salt.id].arrearsVoucherUnits > 0);
  assert.ok(state.privateEconomy.payrollByBuilding[salt.id].arrearsVoucherUnits < 20 * CONTENT.precision.currencyUnitsPerVoucher, "允许家庭按就业额度换券后，只保留未付工资债务");
  assert.equal(state.currency.ledger.some(row => row.type === "private_wage_payment" && row.from === "town"), false, "民营工资不能由镇库代付");
  assert.equal(state.policy.lastDay.eligible, 198);
});

test("同一盐场部分镇营、部分民营共享居民需求池且不重复成交", () => {
  const state = simulation.createInitialState();
  const salt = addBuilding(state, "saltworks", "salt-mixed", 2, 1, 1);
  state.policy.unemploymentBenefit.enabled = false;
  simulation.setEmployment(state, `${salt.id}::salt_workers`, 1);
  state.accounts.town.salt = 1000 * CONTENT.precision.inventoryUnitsPerJin;

  const competitionPreview = simulation.selectOperatingRightPreview(state, salt.id);
  assert.equal(competitionPreview.demandFactor, 0,
    "镇库已有大量同类商品时，经营权竞争/估值仍应看到这部分库存");

  const townProducedBefore = state.industries.salt.cumulative.producedUnits.salt || 0;
  const privateProducedBefore = state.privateEconomy.cumulative.producedUnits.salt || 0;
  let privateBatches = 0;
  let residentPurchased = 0;
  for (let day = 0; day < 30; day += 1) {
    const outcome = simulation.advanceDay(state);
    const privateRow = outcome.privateProduction.find(row => row.buildingId === salt.id);
    privateBatches += privateRow?.batches || 0;
    residentPurchased += outcome.saltTrade.purchasedUnits || 0;
    assert.equal(salt.ownership.townLevels, 1);
    assert.equal(salt.ownership.privateLevels, 1);
    assert.equal(jobCount(state, `${salt.id}::salt_workers`), 1);
    assert.ok(jobCount(state, `${salt.id}::salt_workers::private`) <= 10);
  }

  const scale = CONTENT.precision.inventoryUnitsPerJin;
  const townProduced = (state.industries.salt.cumulative.producedUnits.salt || 0) - townProducedBefore;
  const privateProduced = (state.privateEconomy.cumulative.producedUnits.salt || 0) - privateProducedBefore;
  assert.equal(townProduced / scale, 150, "镇营一级应连续按自己的工人生产");
  assert.ok(privateProduced > 0, "民营部分应持续生产并参与市场");
  assert.ok(privateBatches > 0);
  assert.ok(residentPurchased > 0, "镇库与居民直售库存都可参与同一需求池");
  assert.ok(residentPurchased <= state.salt.lifetime.demandUnits, "成交总量不得超过累计居民需求");
  const validation = simulation.validateState(state);
  assert.equal(validation.valid, true, validation.errors.join("；"));
});

test("民营产出税额余数跨小批次累计而不漏税", () => {
  const state = simulation.createInitialState();
  const lumber = addBuilding(state, "lumberyard", "wood-fine", 1, 0, 1);
  setJobCount(state, `${lumber.id}::lumberjacks::private`, 1, CONTENT);
  state.policy.privateProductionTaxPercent.lumberyard = 10;
  for (let day = 0; day < 10; day += 1) processPrivateBuilding(state, lumber, CONTENT);
  const produced = state.privateEconomy.cumulative.producedUnits.wood;
  const taxed = state.privateEconomy.cumulative.taxedUnits.wood;
  assert.equal(produced / CONTENT.precision.inventoryUnitsPerJin, 10);
  assert.equal(taxed / CONTENT.precision.inventoryUnitsPerJin, 1);
  assert.equal(state.financialFlows.cumulative.town.privateTaxes.wood, taxed);
  assert.equal(state.financialFlows.cumulative.residents.privateOutputs.wood, produced - taxed);
});

test("农业税设置和经营权与经营税在保存恢复后保留", () => {
  const state = simulation.createInitialState();
  simulation.setAgricultureTax(state, 37.5);
  simulation.setPrivateProductionTax(state, "bakery", 17.25);
  const mill = addBuilding(state, "mill", "mill-owned", 3, 3, 0);
  simulation.setOperatingRightPrice(state, mill.id, 12000.5);
  const parsed = JSON.parse(exportState(state));
  const restored = importState({ getItem: () => null, setItem() {} }, JSON.stringify(parsed), CONTENT);
  assert.equal(restored.policy.agricultureTaxPercent, 37.5);
  assert.equal(restored.policy.privateProductionTaxPercent.bakery, 17.25);
  assert.equal(restored.market.operatingRightPrices[mill.id] / CONTENT.precision.inventoryUnitsPerJin, 12000.5);
  assert.deepEqual(restored.buildings[0].ownership, { townLevels: 3, privateLevels: 0, listedLevels: 0 });
});

test("v5旧存档不再自动迁移", () => {
  const state = simulation.createInitialState();
  state.version = 5;
  state.schemaVersion = 5;
  assert.throws(() => migrateSave(state, CONTENT), /旧版存档不兼容/);
});
test("政策与建筑详情展示税率、经营权预览及民营经营状态", () => {
  const state = simulation.createInitialState();
  const salt = addBuilding(state, "saltworks", "ui-salt", 2, 1, 1);
  const view = simulation.selectDashboard(state, { site: `building:${salt.id}` });
  assert.match(renderPolicy(view), /农业税/);
  assert.match(renderPolicy(view), /民营生产税/);
  assert.match(renderSite(view), /民营/);
  assert.match(renderSite(view), /预览出售/);
});
