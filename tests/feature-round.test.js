import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../src/content/index.js";
import { createSimulation, simulation } from "../src/engine.js";
import {
  addInventory, atomicItemExchange, changeInventory, qeqJinToUnits, totalQeqUnits, transferFoodQeq, transferItem
} from "../src/economy/inventory.js";
import { breadDemandShare, buyBreadForResidents } from "../src/systems/market.js";
import { migrateSave } from "../src/persistence/migrations.js";
import { populationStats, selectJobRows } from "../src/selectors/labor.js";
import { grantResidentVouchers, setResidentInventoryJin } from "./helpers-v16.js";
import { legacyVoucherState } from "./helpers-monetary.js";

const SCALE = CONTENT.precision.inventoryUnitsPerJin;
function totalItemUnits(state, itemId) {
  return (state.accounts.residents[itemId] || 0) + (state.accounts.town[itemId] || 0);
}
function rows(state, type) { return state.ledger.filter(row => row.type === type); }
test("expanded map permits separate same-type buildings and job rosters", () => {
  const game = simulation;
  const state = game.createInitialState();
  assert.equal(state.plots.length, 26);
  assert.equal(new Set(state.plots.map(plot => plot.id)).size, 26);
  assert.equal(new Set(state.plots.map(plot => plot.x + "," + plot.y)).size, 26);
  // At a 300px-wide mobile map, plot targets and building icons still do not cover neighbors.
  for (let i = 0; i < state.plots.length; i += 1) {
    for (let j = i + 1; j < state.plots.length; j += 1) {
      const a = state.plots[i];
      const b = state.plots[j];
      const dx = Math.abs(a.x - b.x) * 3;
      const dy = Math.abs(a.y - b.y) * 2.56;
      assert.ok(dx >= 34 || dy >= 32, `地图点击区重叠：${a.id}/${b.id}`);
    }
  }
  const landmarks = [[18, 28], [82, 23], [66, 37], [57, 50]];
  for (const plot of state.plots) {
    for (const [x, y] of landmarks) {
      const dx = Math.abs(plot.x - x) * 3;
      const dy = Math.abs(plot.y - y) * 2.56;
      assert.ok(dx >= 32.5 || dy >= 32, `地图地标与空地点击区重叠：${plot.id}`);
    }
  }
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const first = game.buildAt(state, "mill", "east");
  assert.equal(first.ok, true);
  assert.equal(game.buildAt(state, "mill", "east").ok, false);
  game.advanceDays(state, 40);
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const second = game.buildAt(state, "mill", "village-01");
  assert.equal(second.ok, true);
  game.advanceDays(state, 40);
  assert.equal(state.buildings.filter(row => row.typeId === "mill").length, 2);
  assert.equal(state.buildings[0].plotId, "east");
  assert.equal(state.buildings[1].plotId, "village-01");
  assert.equal(game.setEmployment(state, first.instanceId + "::millers", 3).assigned, 3);
  assert.equal(game.setEmployment(state, second.instanceId + "::millers", 5).assigned, 5);
  const jobs = game.selectJobRows(state).rows.filter(row => row.roleId === "millers");
  assert.deepEqual(jobs.map(row => row.count), [3, 5]);
  assert.equal(game.validateState(state).valid, true);
});

test("wage arrears keep their old amount and pay separately from current wages", () => {
  const state = legacyVoucherState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const start = simulation.buildAt(state, "mill", "east");
  changeInventory(state, "town", "wheat", -state.accounts.town.wheat, "empty treasury", "test_adjustment", CONTENT);
  simulation.advanceDay(state);
  const first = state.payroll.lastDay;
  assert.equal(first.expectedWheatJin, 120);
  assert.equal(first.currentPaidWheatJin, 0);
  assert.equal(first.unpaidCurrentWheatJin, 120);
  assert.equal(state.payroll.arrearsWheatUnits["builders::" + start.instanceId], 120 * SCALE);
  simulation.setWageRate(state, "builders", 20);
  transferItem(state, "residents", "town", "wheat", 360, "补充镇库小麦", CONTENT);
  assert.equal(simulation.issueGrainVouchers(state, "town", 360).ok, true);
  simulation.advanceDay(state);
  const second = state.payroll.lastDay;
  assert.equal(second.expectedWheatJin, 240);
  assert.equal(second.arrearsPaidWheatJin, 120);
  assert.equal(second.currentPaidWheatJin, 240);
  assert.equal(second.arrearsBalanceWheatJin, 0);
  assert.equal(state.payroll.totals.paidWheatUnits / SCALE, 360);
  assert.equal(state.business.cumulative.constructionWagesWheatUnits / SCALE, 360);
  assert.equal(totalQeqUnits(state, CONTENT), 730000 * CONTENT.precision.qeqUnitsPerJin - 4000 * CONTENT.precision.qeqUnitsPerJin);
});

test("unemployment benefit is limited to idle workers, can be disabled, and creates no debt", () => {
  const state = legacyVoucherState();
  assert.equal(state.policy.unemploymentBenefit.enabled, false);
  simulation.setUnemploymentPolicy(state, { enabled: true, dailyPerWorkerJin: 1 });
  changeInventory(state, "town", "wheat", -state.accounts.town.wheat, "empty treasury", "test_adjustment", CONTENT);
  addInventory(state, "town", "wheat", 50, "test fund", "test_adjustment", CONTENT);
  assert.equal(simulation.issueGrainVouchers(state, "town", 50).ok, true);
  simulation.advanceDay(state);
  assert.equal(state.policy.lastDay.eligible, 200);
  assert.equal(state.policy.lastDay.paidPeople, 50);
  assert.equal(state.policy.lastDay.paidWheatJin, 50);
  assert.equal(state.policy.lastDay.shortWheatJin, 150);
  assert.equal(rows(state, "unemployment_benefit").reduce((sum, row) => sum + row.quantityUnits, 0) / CONTENT.precision.currencyUnitsPerVoucher, 50);
  assert.equal(rows(state, "unemployment_shortfall")[0].quantityUnits / CONTENT.precision.currencyUnitsPerVoucher, 150);
  assert.deepEqual(state.payroll.arrearsWheatUnits, {});
  assert.equal(simulation.setUnemploymentPolicy(state, { dailyPerWorkerJin: 0 }).dailyPerWorkerJin, 0);

  const funded = legacyVoucherState();
  simulation.setUnemploymentPolicy(funded, { enabled: true, dailyPerWorkerJin: 1 });
  assert.equal(simulation.issueGrainVouchers(funded, "town", 100000).ok, true);
  simulation.advanceDays(funded, 365);
  assert.equal(funded.annualReports[0].payroll.unemploymentPaidVoucherUnits / CONTENT.precision.currencyUnitsPerVoucher, 73000);
});

test("bread barter is atomic, price sensitive, uses existing stock and protects thirty days", () => {
  const state = legacyVoucherState();
  addInventory(state, "town", "bread", 1000, "test market stock", "test_adjustment", CONTENT);
  const before = Object.fromEntries(["wheat", "bread"].map(id => [id, totalItemUnits(state, id)]));
  const beforeQeq = totalQeqUnits(state, CONTENT);
  const satisfaction = state.satisfaction;
  const traded = buyBreadForResidents(state, 1000, CONTENT);
  assert.equal(traded.targetShare, 0.25);
  assert.equal(traded.targetBreadQeqJin, 500);
  assert.equal(traded.purchasedBreadJin, 400);
  assert.equal(traded.paidVoucher, 800);
  assert.equal(state.satisfaction, satisfaction);
  assert.equal(totalItemUnits(state, "bread"), before.bread);
  assert.equal(totalItemUnits(state, "wheat") + state.currency.reserveWheatUnits, before.wheat);
  assert.equal(totalQeqUnits(state, CONTENT), beforeQeq);
  const meal = simulation.advanceDay(state).meal;
  assert.equal(meal.consumedQeqUnits / CONTENT.precision.qeqUnitsPerJin, 2000);
  assert.equal(meal.moves.find(row => row.itemId === "bread").quantityUnits / SCALE, 400);

  const existing = legacyVoucherState();
  setResidentInventoryJin(existing, "bread", 300, CONTENT);
  addInventory(existing, "town", "bread", 1000, "shop stock", "test_adjustment", CONTENT);
  assert.ok(buyBreadForResidents(existing, 1000, CONTENT).purchasedBreadJin < traded.purchasedBreadJin);

  const reserve = legacyVoucherState();
  setResidentInventoryJin(reserve, "wheat", 60500, CONTENT);
  addInventory(reserve, "town", "bread", 1000, "shop stock", "test_adjustment", CONTENT);
  const limited = buyBreadForResidents(reserve, 1000, CONTENT);
  assert.ok(limited.purchasedBreadJin > 0 && limited.purchasedBreadJin < 600);
  assert.match(limited.limitReason, /保护线|预算|换券额度/);
  const belowReserve = legacyVoucherState();
  setResidentInventoryJin(belowReserve, "wheat", 59900, CONTENT);
  addInventory(belowReserve, "town", "bread", 1000, "shop stock", "test_adjustment", CONTENT);
  const protectedTrade = buyBreadForResidents(belowReserve, 1000, CONTENT);
  assert.equal(protectedTrade.purchasedBreadJin, 0);
  assert.match(protectedTrade.limitReason, /保护线|预算|换券额度/);
  assert.ok(breadDemandShare(4, CONTENT) < breadDemandShare(2, CONTENT));
  assert.ok(breadDemandShare(1, CONTENT) > breadDemandShare(2, CONTENT));
  assert.ok(breadDemandShare(0.01, CONTENT) <= 0.5);
  assert.equal(simulation.setBreadPrice(reserve, 0).ok, false);
  const beforeAtomic = JSON.stringify(reserve.accounts);
  const atomic = atomicItemExchange(reserve, [
    { from: "residents", to: "town", itemId: "wheat", quantityUnits: 999999999999 },
    { from: "town", to: "residents", itemId: "bread", quantityUnits: SCALE }
  ], "failing exchange", CONTENT);
  assert.equal(atomic.ok, false);
  assert.equal(JSON.stringify(reserve.accounts), beforeAtomic);
});

test("mill to bakery accounting counts sold stock once and keeps unsold cost in inventory", () => {
  const state = legacyVoucherState();
  assert.equal(simulation.issueGrainVouchers(state, "town", 20000).ok, true);
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const mill = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  addInventory(state, "town", "wood", 500, "test stock", "test", CONTENT);
  const bakery = simulation.buildAt(state, "bakery", "south");
  simulation.advanceDays(state, 40);
  simulation.setEmployment(state, mill.instanceId + "::millers", 1);
  simulation.setEmployment(state, bakery.instanceId + "::bakers", 1);
  addInventory(state, "town", "bread", 1000, "opening stock estimate", "test_adjustment", CONTENT);
  state.business.inventoryCostWheatUnits.town.bread = Math.round(1000 * SCALE * (5 / 6));
  assert.equal(grantResidentVouchers(state, 5000, CONTENT).ok, true);
  const before = simulation.totalQeq(state);
  simulation.advanceDay(state);
  const day = state.business.day;
  assert.equal(day.producedUnits.flour / SCALE, 64);
  assert.equal(day.producedUnits.bread / SCALE, 72);
  assert.equal(day.soldBreadUnits / SCALE, 600);
  assert.equal(day.revenueWheatUnits / SCALE, 1200);
  assert.equal(day.breadCogsWheatUnits / SCALE, 500);
  assert.equal(day.rawInputCostWheatUnits / SCALE, 80);
  assert.equal(day.processingLossWheatUnits / SCALE, 16);
  assert.equal(day.operatingWagesWheatUnits / SCALE, 20);
  assert.equal((day.revenueWheatUnits - day.breadCogsWheatUnits - day.processingLossWheatUnits - day.operatingWagesWheatUnits) / SCALE, 664);
  assert.ok(state.accounts.town.bread > 0);
  assert.equal(state.business.inventoryCostWheatUnits.town.bread / SCALE, 1180000 / SCALE);
  assert.equal(simulation.totalQeq(state), before - 2016);
  const view = simulation.selectDashboard(state);
  const millView = view.buildings.find(row => row.id === mill.instanceId);
  const bakeryView = view.buildings.find(row => row.id === bakery.instanceId);
  assert.equal(millView.jobs[0].workers, 1);
  assert.equal(bakeryView.jobs[0].workers, 1);
  assert.equal(millView.jobs[0].outputToday.flour / SCALE, 64);
  const millPay = view.payroll.lastDay.workers.find(row => row.buildingId === mill.instanceId);
  const bakeryPay = view.payroll.lastDay.workers.find(row => row.buildingId === bakery.instanceId);
  assert.equal(millPay.currentPaidWheatJin, 10);
  assert.equal(bakeryPay.currentPaidWheatJin, 10);
});

test("v2旧存档不再自动迁移", () => {
  const old = simulation.createInitialState();
  old.version = 2;
  old.schemaVersion = 2;
  assert.throws(() => migrateSave(old, CONTENT), /旧版存档不兼容/);
});
test("fifteen-year headless run keeps age, job and inventory ledgers consistent", () => {
  const state = simulation.createInitialState({ seed: 884422 });
  simulation.advanceDays(state, 365 * 15);
  assert.equal(state.annualReports.length, 15);
  assert.equal(state.year, 16);
  assert.equal(state.day, 0);
  assert.equal(state.agriculture.lastHarvestYear, 15);
  const people = populationStats(state);
  const jobs = selectJobRows(state, CONTENT);
  assert.equal(people.total, people.children + people.workers + people.elders);
  assert.equal(jobs.employed + jobs.idle, people.workers);
  for (const owner of ["residents", "town"]) {
    for (const quantity of Object.values(state.accounts[owner])) assert.ok(Number.isSafeInteger(quantity) && quantity >= 0);
  }
  assert.equal(simulation.validateState(state).valid, true);
});
