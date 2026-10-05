import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../src/content/index.js";
import { simulation } from "../src/engine.js";
import { changeInventory, addInventory } from "../src/economy/inventory.js";
import { selectHousing } from "../src/selectors/housing.js";
import { accrueSaltNeed, buySaltForResidents, consumeDailySalt } from "../src/systems/salt.js";
import { migrateSave } from "../src/persistence/migrations.js";
import { renderPeople } from "../src/ui/panel-people.js";
import { grantResidentVouchers, setResidentInventoryJin } from "./helpers-v16.js";
import { householdFoodQeqUnits, householdList, householdReserveQeqUnits, syncResidentAggregates } from "../src/systems/households.js";
import { legacyVoucherState } from "./helpers-monetary.js";

const SCALE = CONTENT.precision.inventoryUnitsPerJin;

function totalItem(state, id) {
  return (state.accounts.residents[id] || 0) + (state.accounts.town[id] || 0);
}

function setStock(state, owner, id, quantity) {
  if (owner === "residents") return setResidentInventoryJin(state, id, quantity, CONTENT);
  const target = Math.round(quantity * SCALE);
  return changeInventory(state, owner, id, target - state.accounts[owner][id],
    "测试备料", "test_adjustment", CONTENT);
}

test("伐木场与盐场按岗位人数生产；行业工资不混入面包链", () => {
  const state = simulation.createInitialState();
  assert.equal(simulation.buildAt(state, "lumberyard", "east").reason, "伐木场只能建在南部森林资源点地块");
  const build = simulation.buildAt(state, "lumberyard", "forest-logging-01");
  assert.equal(build.ok, true);
  simulation.advanceDays(state, 20);
  assert.equal(state.project, null);
  assert.equal(simulation.setEmployment(state, build.instanceId + "::lumberjacks", 7).assigned, 7);
  const wheatBefore = totalItem(state, "wheat");
  simulation.advanceDay(state);

  assert.equal(state.accounts.town.wood / SCALE, 7);
  assert.equal(state.accounts.residents.wood, 0);
  assert.equal(state.industries.forestry.day.producedUnits.wood / SCALE, 7);
  assert.equal(state.industries.forestry.day.operatingWagesWheatUnits / SCALE, 70);
  assert.equal(state.business.day.producedUnits.wood, undefined);
  assert.equal(state.business.day.operatingWagesWheatUnits, 0);
  assert.equal(totalItem(state, "wheat"), wheatBefore - 2000 * SCALE);

  const saltState = simulation.createInitialState();
  addInventory(saltState, "town", "wood", 100, "test stock", "test", CONTENT);
  const saltworks = simulation.buildAt(saltState, "saltworks", "forest-salt-01");
  assert.equal(saltworks.ok, true);
  simulation.advanceDays(saltState, 30);
  assert.equal(saltState.project, null);
  assert.equal(simulation.setEmployment(saltState, saltworks.instanceId + "::salt_workers", 6).assigned, 6);
  simulation.advanceDay(saltState);
  assert.ok(Math.abs(saltState.accounts.town.salt / SCALE -
    (30 - saltState.salt.day.satisfiedUnits / SCALE)) < 1e-10);
  assert.equal(saltState.industries.salt.day.producedUnits.salt / SCALE, 30);
  assert.equal(saltState.industries.salt.day.operatingWagesWheatUnits / SCALE, 60);
  assert.equal(saltState.business.day.operatingWagesWheatUnits, 0);
  assert.equal(simulation.validateState(saltState).valid, true);
});

test("年度盐需求精确；六名盐工连续生产365日的物理产能覆盖居民需求", () => {
  const demandState = simulation.createInitialState({ seed: 1501 });
  simulation.advanceDays(demandState, 365);
  assert.equal(demandState.annualReports[0].populationAtClose, 1000);
  assert.equal(demandState.annualReports[0].salt.demandUnits / SCALE, 10000);
  assert.equal(demandState.annualReports[0].salt.satisfiedUnits, 0);
  assert.equal(demandState.salt.graceDaysElapsed, 30);

  const state = simulation.createInitialState({ seed: 1501 });
  addInventory(state, "town", "wood", 100, "test stock", "test", CONTENT);
  const build = simulation.buildAt(state, "saltworks", "forest-salt-01");
  simulation.advanceDays(state, 30);
  assert.equal(state.project, null);
  simulation.setEmployment(state, build.instanceId + "::salt_workers", 6);

  // Stage a fresh year after construction so the 365 counted production days are exact.
  state.year = 1;
  state.day = 0;
  state.salt.demandCarry = 0;
  state.salt.graceDaysElapsed = 0;
  state.salt.history = [];
  state.salt.day = { demandUnits: 0, satisfiedUnits: 0, purchasedUnits: 0, paidWheatUnits: 0 };
  state.salt.year = { demandUnits: 0, satisfiedUnits: 0, purchasedUnits: 0, paidWheatUnits: 0 };
  state.salt.lifetime = { demandUnits: 0, satisfiedUnits: 0, purchasedUnits: 0, paidWheatUnits: 0 };
  for (const group of [state.industries.salt.day, state.industries.salt.year, state.industries.salt.cumulative]) {
    group.producedUnits = {};
    group.soldUnits = 0;
    group.revenueWheatUnits = 0;
    group.operatingWagesWheatUnits = 0;
  }
  state.agriculture.lastHarvestYear = 0;

  assert.equal(grantResidentVouchers(state, 300000, CONTENT).ok, true);
  simulation.advanceDays(state, 365);
  assert.equal(state.annualReports[0].industries.salt.cumulative.producedUnits.salt / SCALE, 10950);
  assert.equal(state.annualReports[0].salt.demandUnits / SCALE, 10000);
  assert.equal(state.annualReports[0].salt.satisfiedUnits / SCALE, 10000);
  assert.equal(state.annualReports[0].industries.salt.cumulative.soldUnits / SCALE, 10000);
  assert.equal(state.annualReports[0].industries.salt.cumulative.revenueWheatUnits / SCALE, 100000);
  assert.equal(state.annualReports[0].industries.salt.cumulative.operatingWagesWheatUnits / SCALE, 21900);
  assert.equal(state.accounts.town.salt / SCALE, 950);
});

test("食盐原子交易守恒，单独消费且居民粮储线会限购", () => {
  const state = simulation.createInitialState();
  setStock(state, "town", "salt", 10);
  const wheatBefore = totalItem(state, "wheat");
  const saltBefore = totalItem(state, "salt");
  const qeqBefore = simulation.totalQeq(state);
  const demandUnits = accrueSaltNeed(state, 1000, CONTENT);
  const trade = buySaltForResidents(state, CONTENT);
  assert.equal(trade.purchasedUnits, 10 * SCALE);
  assert.equal(totalItem(state, "wheat") + state.currency.reserveWheatUnits, wheatBefore);
  assert.equal(totalItem(state, "salt"), saltBefore);
  assert.equal(simulation.totalQeq(state), qeqBefore);
  assert.equal(state.accounts.residents.salt, 10 * SCALE);
  const meal = consumeDailySalt(state, CONTENT);
  assert.equal(meal.satisfiedUnits, 10 * SCALE);
  assert.equal(simulation.totalQeq(state), qeqBefore);

  const reserveState = simulation.createInitialState();
  setStock(reserveState, "residents", "wheat", 60010);
  setStock(reserveState, "town", "salt", 10000);
  accrueSaltNeed(reserveState, 1000, CONTENT);
  const limited = buySaltForResidents(reserveState, CONTENT);
  assert.ok(limited.purchasedUnits > 0 && limited.purchasedUnits <= 1 * SCALE);
  assert.equal(limited.paidWheatUnits, limited.purchasedUnits * 10, "家庭级限购仍按实际成交量付款");
  assert.ok(simulation.accountQeq(reserveState, "residents") >= 60000, "家庭换券不得突破全镇30日口粮保护线");
  assert.match(limited.limitReason, /保护线|预算|储备|换券额度|粮券/);
});

test("公租房只在开工时扣木材；按真实入住计租并保护口粮储备", () => {
  const state = legacyVoucherState({ seed: 812 });
  state.cohorts[0].m += 10;
  state.cohorts[0].f += 10;
  householdList(state)[0].ageBands.children += 20;
  syncResidentAggregates(state, CONTENT);
  assert.equal(simulation.validateState(state).valid, true);
  setStock(state, "town", "wood", 2000);
  const woodBefore = totalItem(state, "wood");
  const start = simulation.buildAt(state, "public_housing", "east");
  assert.equal(start.ok, true);
  assert.equal(totalItem(state, "wood"), woodBefore - 2000 * SCALE);
  assert.equal(state.ledger.filter(row => row.type === "construction_material").length, 1);
  assert.match(simulation.buildAt(state, "public_housing", "village-01").reason, /木材不足/);
  simulation.advanceDays(state, 100);
  assert.equal(state.project, null);
  assert.equal(state.buildings[0].typeId, "public_housing");
  assert.equal(totalItem(state, "wood"), woodBefore - 2000 * SCALE);
  let housing = selectHousing(state, CONTENT);
  assert.equal(housing.capacity, 2000);
  assert.equal(housing.villageOccupied, 1000);
  assert.equal(housing.rentals[0].occupied, 20);
  assert.equal(housing.rentals[0].dailyRentDueWheatJin, 20);

  const wheatBeforeRentDay = totalItem(state, "wheat") + state.currency.reserveWheatUnits;
  simulation.advanceDay(state);
  assert.equal(state.fiscal.lastRentDay.dueWheatJin, 20, "聚合家庭中的20名真实公租房入住者应计租");
  assert.equal(state.fiscal.lastRentDay.collectedWheatJin, 0);
  assert.equal(state.fiscal.lastRentDay.waivedWheatJin, 20);
  assert.equal(totalItem(state, "wheat") + state.currency.reserveWheatUnits, wheatBeforeRentDay - 2040 * SCALE);

  assert.equal(state.currency.balances.town, 0, "被口粮保护线减免的租金不会凭空形成镇库粮券");
  setStock(state, "residents", "wheat", 61200);
  const arrearsBeforeProtectedRent = Object.values(state.payroll.arrearsWheatUnits).reduce((sum, value) => sum + value, 0);
  simulation.advanceDay(state);
  assert.equal(state.fiscal.lastRentDay.dueWheatJin, 20);
  assert.equal(state.fiscal.lastRentDay.collectedWheatJin, 0);
  assert.equal(state.fiscal.lastRentDay.waivedWheatJin, 20);
  assert.equal(Object.values(state.payroll.arrearsWheatUnits).reduce((sum, value) => sum + value, 0), arrearsBeforeProtectedRent);
  assert.equal(state.ledger.some(row => row.type === "rent_waiver"), true);
});

test("v3旧存档不再自动迁移", () => {
  const state = simulation.createInitialState();
  state.version = 3;
  state.schemaVersion = 3;
  assert.throws(() => migrateSave(state, CONTENT), /旧版存档不兼容/);
});
