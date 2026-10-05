import test from "node:test";
import assert from "node:assert/strict";
import { jobCount } from "../src/systems/households.js";
import { simulation } from "../src/engine.js";
import { addInventory } from "../src/economy/inventory.js";
import { CONTENT } from "../src/content/index.js";
import { migrateSave } from "../src/persistence/migrations.js";
import { renderSite } from "../src/ui/panel-site.js";

const SCALE = CONTENT.precision.inventoryUnitsPerJin;
const itemTotal = (state, item) => (state.accounts.town[item] || 0) + (state.accounts.residents[item] || 0);

test("upgrade keeps the instance, plot, existing roster and production; new capacity starts vacant", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const built = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  const mill = state.buildings[0];
  assert.equal(mill.id, built.instanceId);
  simulation.setEmployment(state, `${mill.id}::millers`, 4);
  addInventory(state, "town", "wood", 600, "test upgrade stock", "test", CONTENT);
  const woodBefore = state.accounts.town.wood;
  const upgrade = simulation.upgradeBuilding(state, mill.id);
  assert.equal(upgrade.ok, true);
  assert.equal(state.accounts.town.wood, woodBefore - 600 * SCALE);
  assert.equal(state.project.kind, "upgrade");
  assert.equal(state.project.plotId, "east");
  assert.equal(simulation.selectJobRows(state).rows.find(row => row.key === `${mill.id}::millers`).capacity, 12);
  simulation.advanceDay(state);
  assert.equal(state.buildings.length, 1);
  assert.equal(state.buildings[0].level, 1);
  assert.equal(jobCount(state, `${mill.id}::millers`), 4);
  assert.ok((state.business.buildings[mill.id].todayOutputUnits.flour || 0) > 0,
    "existing mill keeps producing during expansion");
  simulation.advanceDays(state, 39);
  assert.equal(state.project, null);
  assert.equal(state.buildings[0].level, 2);
  const row = simulation.selectJobRows(state).rows.find(item => item.key === `${mill.id}::millers`);
  assert.equal(row.capacity, 24);
  assert.equal(row.count, 4);
  assert.equal(state.buildings[0].materialInvestments.reduce((sum, line) => sum + line.quantityUnits, 0), 1200 * SCALE);
  assert.equal(simulation.validateState(state).valid, true);
});

test("demolition refunds only recorded materials once and preserves wages, arrears, stock and history", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const started = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  simulation.setEmployment(state, `${started.instanceId}::millers`, 3);
  simulation.advanceDay(state);
  const history = state.business.buildings[started.instanceId];
  const stockBefore = { wheat: itemTotal(state, "wheat"), flour: itemTotal(state, "flour"), wood: itemTotal(state, "wood") };
  const wheatTown = state.accounts.town.wheat;
  const arrears = 17 * SCALE;
  state.payroll.arrearsWheatUnits[`${started.instanceId}::millers`] = arrears;
  const result = simulation.demolishBuilding(state, started.instanceId);
  assert.equal(result.ok, true);
  assert.equal(state.accounts.town.wood, stockBefore.wood + 600 * SCALE);
  assert.equal(itemTotal(state, "wheat"), stockBefore.wheat);
  assert.equal(itemTotal(state, "flour"), stockBefore.flour);
  assert.equal(state.accounts.town.wheat, wheatTown);
  assert.equal(state.payroll.arrearsWheatUnits[`${started.instanceId}::millers`], arrears);
  assert.equal(jobCount(state, `${started.instanceId}::millers`), 0);
  assert.equal(state.buildings.length, 0);
  assert.equal(state.business.buildings[started.instanceId], history);
  assert.equal(simulation.demolishBuilding(state, started.instanceId).ok, false);
  assert.equal(state.accounts.town.wood, stockBefore.wood + 600 * SCALE);
  assert.equal(simulation.validateState(state).valid, true);
});

test("completed public-housing upgrade adds capacity and demolition is blocked if residents cannot fit", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 4000, "test housing materials", "test", CONTENT);
  const started = simulation.buildAt(state, "public_housing", "east");
  simulation.advanceDays(state, 100);
  const housing = state.buildings[0];
  assert.equal(simulation.selectDashboard(state).housing.capacity, 2000);
  assert.equal(simulation.upgradeBuilding(state, housing.id).ok, true);
  simulation.advanceDays(state, 100);
  assert.equal(housing.level, 2);
  assert.equal(simulation.selectDashboard(state).housing.capacity, 3000);
  state.cohorts.find(row => row.age === 30).m += 2001;
  const preview = simulation.selectDemolitionPreview(state, housing.id);
  assert.equal(preview.available, false);
  assert.match(preview.reason, /差/);
  state.cohorts.find(row => row.age === 30).m -= 2001;
  assert.equal(simulation.demolishBuilding(state, housing.id).ok, true);
  assert.equal(simulation.selectDashboard(state).housing.capacity, 1000);
  assert.equal(state.accounts.town.wood, 4000 * SCALE);
  assert.equal(simulation.validateState(state).valid, true);
});

test("in-progress buildings and upgrades cannot be demolished, legacy buildings have no inferred refunds", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const started = simulation.buildAt(state, "mill", "east");
  assert.equal(simulation.demolishBuilding(state, started.instanceId).ok, false);
  simulation.advanceDays(state, 40);
  const building = state.buildings[0];
  assert.equal(building.materialInvestments.length, 1);
  assert.equal(building.materialInvestments[0].itemId, "wood");
  assert.equal(building.materialInvestments[0].quantityUnits, 600 * SCALE);
  assert.equal(simulation.selectDemolitionPreview(state, building.id).refund.length, 1);
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  simulation.upgradeBuilding(state, building.id);
  assert.equal(simulation.demolishBuilding(state, building.id).ok, false);
});

test("v4旧存档不再自动迁移", () => {
  const state = simulation.createInitialState();
  state.version = 4;
  state.schemaVersion = 4;
  assert.throws(() => migrateSave(state, CONTENT), /旧版存档不兼容/);
});
test("building detail renders explicit upgrade and demolition confirmation actions", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const started = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const site = `building:${started.instanceId}`;
  const view = simulation.selectDashboard(state, { site, paused: true });
  view.upgradePreviewId = started.instanceId;
  const upgradeHtml = renderSite(view);
  assert.match(upgradeHtml, /确认开工/);
  assert.match(upgradeHtml, new RegExp(`data-upgrade-start="${started.instanceId}"`));
  view.upgradePreviewId = null;
  view.demolitionPreviewId = started.instanceId;
  const demolitionHtml = renderSite(view);
  assert.match(demolitionHtml, /确认拆除/);
  assert.match(demolitionHtml, new RegExp(`data-demolish-confirm="${started.instanceId}"`));
  assert.match(demolitionHtml, /返还材料/);
});
