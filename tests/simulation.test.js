import test from "node:test";
import assert from "node:assert/strict";
import { jobCount, householdList, householdEmploymentCount } from "../src/systems/households.js";
import { CONTENT, extendContent } from "../src/content/index.js";
import { simulation, createSimulation } from "../src/engine.js";
import {
  accountQeqUnits, addInventory, changeInventory, totalQeqUnits,
  transferFoodQeq, transferItem, qeqJinToUnits
} from "../src/economy/inventory.js";
import { productionStatus } from "../src/selectors/production.js";
import { selectHarvestForecast } from "../src/selectors/agriculture.js";
import { populationStats } from "../src/selectors/labor.js";
import { renderPeople } from "../src/ui/panel-people.js";
import { legacyVoucherState } from "./helpers-monetary.js";

function totalItemUnits(state, itemId) {
  return (state.accounts.residents[itemId] || 0) + (state.accounts.town[itemId] || 0);
}

function recordByType(state, type) {
  return state.ledger.filter(function (row) { return row.type === type; });
}

test("initial population, jobs and both food accounts match the v1 start", () => {
  const state = simulation.createInitialState();
  assert.deepEqual(populationStats(state), {
    children: 200, workers: 600, elders: 200, total: 1000,
    marriedCouples: 96, marriedWomen: 96
  });
  assert.deepEqual(simulation.selectJobRows(state).rows.map(function (row) {
    return [row.key, row.count, row.capacity];
  }), [["farmers", 400, 400], ["builders", 0, 0]]);
  assert.equal(simulation.accountQeq(state, "residents"), 730000);
  assert.equal(simulation.accountQeq(state, "town"), 730000);
  assert.equal(simulation.totalQeq(state), 1460000);
});

test("full crop labor yields 1.6 million jin at day 274; town tax reaches town", () => {
  const state = simulation.createInitialState();
  const result = simulation.advanceDays(state, 274);
  const harvest = result.results.find(function (row) { return row.harvest; }).harvest;
  assert.equal(harvest.total, 1600000);
  assert.equal(harvest.residentShare, 800000);
  assert.equal(harvest.townShare, 800000);
  const entries = recordByType(state, "harvest");
  assert.deepEqual(entries.map(function (row) {
    return [row.destination, row.quantityUnits / CONTENT.precision.inventoryUnitsPerJin];
  }).sort(), [["residents", 800000], ["town", 800000]]);
  assert.equal(state.agriculture.lastHarvestYear, 1);

  const taxed = createSimulation(CONTENT);
  const taxState = taxed.createInitialState();
  taxed.setAgricultureTax(taxState, 30);
  taxed.advanceDays(taxState, 274);
  const split = recordByType(taxState, "harvest").reduce(function (result, row) {
    result[row.destination] = row.quantityUnits / CONTENT.precision.inventoryUnitsPerJin;
    return result;
  }, {});
  assert.equal(split.town, 480000);
  assert.equal(split.residents, 1120000);
});

test("365-day consumption is exact; the annual harvest and report are not duplicated", () => {
  const state = simulation.createInitialState();
  simulation.advanceDays(state, 365);
  assert.equal(state.year, 2);
  assert.equal(state.day, 0);
  assert.equal(state.annualReports[0].consumptionQeq / CONTENT.precision.qeqUnitsPerJin, 730000);
  assert.equal(state.annualReports[0].harvestQeq / CONTENT.precision.qeqUnitsPerJin, 1600000);
  assert.equal(state.annualReports.length, 1);
  assert.equal(recordByType(state, "harvest").filter(function (row) {
    return row.transactionId === "harvest-y1";
  }).length, 2);
  assert.equal(simulation.totalQeq(state), 2330000);
  simulation.advanceDays(state, 274);
  assert.equal(state.year, 2);
  assert.equal(recordByType(state, "harvest").filter(function (row) {
    return row.transactionId === "harvest-y2";
  }).length, 2);
});

test("agricultural output reflects labor put in before the harvest", () => {
  const state = simulation.createInitialState();
  simulation.setEmployment(state, "farmers", 0);
  simulation.advanceDays(state, 100);
  assert.equal(selectHarvestForecast(state, CONTENT), 0);
  simulation.setEmployment(state, "farmers", 400);
  simulation.advanceDays(state, 174);
  const harvest = state.ledger.filter(function (row) { return row.type === "harvest"; });
  const output = harvest.reduce(function (sum, row) {
    return sum + row.quantityUnits / CONTENT.precision.inventoryUnitsPerJin;
  }, 0);
  assert.equal(output, 1016058.394);
});

test("wages, relief and construction start preserve total food until workers are paid day by day", () => {
  const state = simulation.createInitialState();
  const before = Object.fromEntries(Object.keys(CONTENT.items).map(function (id) {
    return [id, totalItemUnits(state, id)];
  }));
  const wage = transferFoodQeq(
    state, "town", "residents", qeqJinToUnits(10000, CONTENT), "test wage", "wage", CONTENT
  );
  assert.equal(wage.ok, true);
  assert.equal(simulation.totalQeq(state), 1460000);
  const relief = simulation.sendRelief(state, 30000);
  assert.equal(relief.movedQeqUnits / CONTENT.precision.qeqUnitsPerJin, 0, "0.1.2实物救济只拨给存在家庭口粮缺口者");
  assert.equal(simulation.totalQeq(state), 1460000);
  const afterTransfers = Object.fromEntries(Object.keys(CONTENT.items).map(function (id) {
    return [id, totalItemUnits(state, id)];
  }));
  assert.deepEqual(afterTransfers, before);

  const building = simulation.createInitialState();
  addInventory(building, "town", "wood", 600, "test stock", "test", CONTENT);
  const beforeBuild = totalQeqUnits(building, CONTENT);
  const started = simulation.buildAt(building, "mill", "east");
  assert.equal(started.ok, true);
  assert.equal(totalQeqUnits(building, CONTENT), beforeBuild);
  const wages = recordByType(building, "construction");
  assert.equal(wages.length, 0);
  assert.equal(building.project.prepaidWageCreditUnits, 0);
});

test("construction consumes worker-days, releases jobs, and rejects duplicate sites", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const before = totalQeqUnits(state, CONTENT);
  const start = simulation.buildAt(state, "mill", "east");
  assert.equal(start.assignedBuilders, 12);
  assert.equal(simulation.buildAt(state, "bakery", "east").ok, false);
  simulation.advanceDays(state, 39);
  assert.equal(state.project.workDone, 468);
  assert.equal(state.buildings.length, 0);
  simulation.advanceDay(state);
  assert.equal(state.project, null);
  assert.equal(state.buildings[0].typeId, "mill");
  assert.equal(state.buildings[0].id, start.instanceId);
  assert.equal(jobCount(state, "builders"), 0);
  assert.equal(totalQeqUnits(state, CONTENT), before - 80000 * 18000);
  assert.equal(simulation.buildAt(state, "bakery", "east").ok, false);
  assert.equal(simulation.setEmployment(state, "millers", 12).ok, false);
  assert.equal(simulation.selectJobRows(state).rows.some(function (row) {
    return row.key === start.instanceId + "::millers";
  }), true);
  assert.equal(simulation.setEmployment(state, start.instanceId + "::millers", 12).assigned, 12);
});

test("staffed mill and bakery roles survive construction completion and annual reconciliation", () => {
  const state = simulation.createInitialState({ seed: 20260924 });
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const mill = simulation.buildAt(state, "mill", "east");
  assert.equal(mill.ok, true);
  simulation.advanceDays(state, 40);
  assert.equal(state.project, null);
  assert.equal(simulation.setEmployment(state, mill.instanceId + "::millers", 3).assigned, 3);

  addInventory(state, "town", "wood", 500, "test stock", "test", CONTENT);
  const bakery = simulation.buildAt(state, "bakery", "south");
  assert.equal(bakery.ok, true);
  simulation.advanceDays(state, 40);
  assert.equal(state.project, null);
  assert.equal(jobCount(state, `${mill.instanceId}::millers`), 3,
    "completing another building must leave existing instance jobs unchanged");
  assert.equal(simulation.setEmployment(state, bakery.instanceId + "::bakers", 5).assigned, 5);

  const rows = () => Object.fromEntries(
    simulation.selectJobRows(state).rows
      .filter(row => row.buildingId)
      .map(row => [row.key, row.count])
  );
  assert.deepEqual(rows(), {
    [mill.instanceId + "::millers"]: 3,
    [bakery.instanceId + "::bakers"]: 5
  });
  simulation.advanceDays(state, 365 - state.day - 1);
  assert.deepEqual(rows(), {
    [mill.instanceId + "::millers"]: 3,
    [bakery.instanceId + "::bakers"]: 5
  });
  simulation.advanceDay(state);
  assert.deepEqual(rows(), {
    [mill.instanceId + "::millers"]: 3,
    [bakery.instanceId + "::bakers"]: 5
  }, "year-end population reconciliation must preserve staffed roles when labor is sufficient");
  assert.equal(simulation.validateState(state).valid, true);
});

test("real worker shortage releases only the necessary roles and names the affected instances", () => {
  const state = simulation.createInitialState({ seed: 88002 });
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const mill = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  addInventory(state, "town", "wood", 500, "test stock", "test", CONTENT);
  const bakery = simulation.buildAt(state, "bakery", "south");
  simulation.advanceDays(state, 40);
  simulation.setEmployment(state, "farmers", 0);
  simulation.setEmployment(state, mill.instanceId + "::millers", 3);
  simulation.setEmployment(state, bakery.instanceId + "::bakers", 5);

  // Eight aggregate employed workers turn 65 at once: a deterministic labor shortage.
  for (const household of householdList(state)) household.ageBands = { children: 0, workers: householdEmploymentCount(household), elders: 0 };
  state.cohorts = [{ age: 64, m: 8, f: 0, marriedM: 0, marriedF: 0 }];
  state.day = CONTENT.rules.daysPerYear - 1;
  simulation.advanceDay(state);

  assert.equal(populationStats(state).workers, 0);
  assert.equal(simulation.selectJobRows(state).employed, 0);
  assert.equal(jobCount(state, `${bakery.instanceId}::bakers`), 0);
  assert.equal(jobCount(state, `${mill.instanceId}::millers`), 0);
  assert.ok(state.events.some(event => event.text.includes("人口变化使家庭劳动力减少") && event.text.includes("释放8个超额岗位")));
  assert.equal(simulation.validateState(state).valid, true);
});

test("processing is atomic; wages settle separately even when materials are short", () => {
  const state = legacyVoucherState();
  assert.equal(simulation.issueGrainVouchers(state, "town", 5000).ok, true);
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const start = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  simulation.setEmployment(state, "farmers", 388);
  simulation.setEmployment(state, start.instanceId + "::millers", 1);
  const scale = CONTENT.precision.inventoryUnitsPerJin;
  changeInventory(state, "town", "wheat", 30 * scale - state.accounts.town.wheat,
    "test stock balance", "test_adjustment", CONTENT);
  assert.equal(productionStatus(state, state.buildings[0], CONTENT).status, "limited_materials");
  const beforeStocks = {
    wheat: state.accounts.town.wheat,
    flour: state.accounts.town.flour,
    qeq: totalQeqUnits(state, CONTENT)
  };
  simulation.advanceDay(state);
  assert.equal(state.accounts.town.flour / scale, 16);
  assert.equal(state.accounts.town.wheat / scale, 10);
  assert.equal(state.accounts.residents.flour / scale, 0);
  assert.equal(state.payroll.lastDay.currentPaidWheatJin, 10);
  assert.equal(recordByType(state, "processing_loss")[0].quantityUnits / scale, 4);
  assert.equal(recordByType(state, "process_input")[0].quantityUnits / scale, 20);
  assert.equal(recordByType(state, "process_output")[0].quantityUnits / scale, 16);
  assert.equal(simulation.totalQeq(state), (beforeStocks.qeq - 2000 * CONTENT.precision.qeqUnitsPerJin -
    4 * CONTENT.precision.qeqUnitsPerJin) / CONTENT.precision.qeqUnitsPerJin);
});

test("bread mass increase keeps the same qeq and shortage never makes balances negative", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 500, "test stock", "test", CONTENT);
  const start = simulation.buildAt(state, "bakery", "east");
  simulation.advanceDays(state, 40);
  simulation.setEmployment(state, start.instanceId + "::bakers", 1);
  addInventory(state, "town", "flour", 5, "测试面粉", "test_adjustment", CONTENT);
  const before = simulation.totalQeq(state);
  simulation.advanceDay(state);
  assert.equal(totalItemUnits(state, "flour") / CONTENT.precision.inventoryUnitsPerJin, 0);
  assert.equal(recordByType(state, "process_output").find(row => row.itemId === "bread").quantityUnits /
    CONTENT.precision.inventoryUnitsPerJin, 6);
  assert.equal(simulation.totalQeq(state), before - 2000);

  const hungry = simulation.createInitialState();
  simulation.toggleAutomaticRelief(hungry, false);
  for (const owner of ["residents", "town"]) {
    for (const itemId of Object.keys(CONTENT.items)) {
      changeInventory(hungry, owner, itemId, -(hungry.accounts[owner][itemId] || 0),
        "shortage boundary", "test_adjustment", CONTENT);
    }
  }
  simulation.advanceDay(hungry);
  assert.equal(hungry.shortageQeq / CONTENT.precision.qeqUnitsPerJin, 2000);
  for (const owner of ["residents", "town"]) {
    assert.ok(Object.values(hungry.accounts[owner]).every(value => value >= 0));
  }
});

test("recipe gates expose missing workers and materials and enforce job caps", () => {
  const state = simulation.createInitialState();
  addInventory(state, "town", "wood", 600, "test stock", "test", CONTENT);
  const start = simulation.buildAt(state, "mill", "east");
  simulation.advanceDays(state, 40);
  assert.equal(productionStatus(state, state.buildings[0], CONTENT).status, "no_workers");
  assert.equal(simulation.setEmployment(state, start.instanceId + "::millers", 99).assigned, 12);
  changeInventory(state, "town", "wheat", -state.accounts.town.wheat,
    "remove material for gate test", "test_adjustment", CONTENT);
  assert.equal(productionStatus(state, state.buildings[0], CONTENT).status, "no_materials");
  assert.equal(simulation.setEmployment(state, "farmers", 500).assigned, 400);
  assert.equal(simulation.selectJobRows(state).employed, 412);
  assert.equal(simulation.validateState(state).valid, true);
});

test("registered non-food items transfer and ledger but never count or get consumed", () => {
  const content = extendContent(CONTENT, {
    items: {
      wood: Object.freeze({
        id: "wood", name: "木材", unit: "根", category: "material",
        edible: false, qeq: null, consumptionPriority: 999, transferPriority: 999
      })
    }
  });
  const game = createSimulation(content);
  const state = game.createInitialState();
  addInventory(state, "town", "wood", 20, "林场测试物资", "deposit", content);
  const beforeQeq = game.totalQeq(state);
  assert.equal(transferItem(state, "town", "residents", "wood", 5, "测试拨付", content).ok, true);
  assert.equal(game.totalQeq(state), beforeQeq);
  assert.equal(totalItemUnits(state, "wood"), 20 * content.precision.inventoryUnitsPerJin);
  game.advanceDay(state);
  assert.equal(state.accounts.residents.wood / content.precision.inventoryUnitsPerJin, 5);
  assert.equal(state.accounts.town.wood / content.precision.inventoryUnitsPerJin, 15);
  assert.equal(game.totalQeq(state), beforeQeq - 2000);
  assert.equal(recordByType(state, "consume").some(function (row) { return row.itemId === "wood"; }), false);
});

test("a new multi-output production building runs through shared systems only", () => {
  const content = extendContent(CONTENT, {
    items: {
      wood: Object.freeze({ id: "wood", name: "木料", unit: "根", category: "material", edible: false, qeq: null }),
      plank: Object.freeze({ id: "plank", name: "木板", unit: "块", category: "material", edible: false, qeq: null }),
      sawdust: Object.freeze({ id: "sawdust", name: "木屑", unit: "筐", category: "material", edible: false, qeq: null })
    },
    recipes: {
      saw_goods: Object.freeze({
        id: "saw_goods", name: "锯木",
        inputs: Object.freeze([{ itemId: "wood", quantity: 2 }]),
        outputs: Object.freeze([
          { itemId: "plank", quantity: 1 },
          { itemId: "sawdust", quantity: 0.5 }
        ]),
        losses: Object.freeze([]),
        batchesPerWorkerDay: 1
      })
    },
    buildings: {
      sawmill: Object.freeze({
        id: "sawmill", name: "锯木棚", icon: "🪚", description: "木料加工",
        maxInstances: 1, recipeId: "saw_goods", productionRoleId: "sawyers",
        jobs: Object.freeze([{ id: "sawyers", name: "锯木工", slots: 1, wagePerWorkerDay: 0, note: "每人每日一批" }]),
        construction: Object.freeze({ workDays: 1, recommendedWorkers: 1, grainPerWorkerDay: 1 })
      })
    }
  });
  const game = createSimulation(content);
  const state = game.createInitialState();
  const site = game.buildAt(state, "sawmill", "east");
  assert.equal(site.ok, true);
  game.advanceDay(state);
  game.setEmployment(state, site.instanceId + "::sawyers", 1);
  addInventory(state, "town", "wood", 4, "测试木料", "deposit", content);
  const beforeFood = game.totalQeq(state);
  game.advanceDay(state);
  assert.equal(state.accounts.town.plank / content.precision.inventoryUnitsPerJin, 1);
  assert.equal(state.accounts.town.sawdust / content.precision.inventoryUnitsPerJin, 0.5);
  assert.equal(state.accounts.town.wood / content.precision.inventoryUnitsPerJin, 2);
  assert.equal(game.totalQeq(state), beforeFood - 2000);
  assert.equal(state.ledger.some(function (row) { return row.itemId === "plank" && row.type === "process_output"; }), true);
});

test("simulation replay is reproducible after saving RNG state and employment", () => {
  const left = simulation.createInitialState({ seed: 24681357 });
  simulation.advanceDays(left, 211);
  const saved = JSON.parse(JSON.stringify(left));
  const right = JSON.parse(JSON.stringify(saved));
  simulation.advanceDays(left, 30);
  simulation.advanceDays(right, 30);
  assert.deepEqual(left, right);
  const people = populationStats(left);
  const jobs = simulation.selectJobRows(left);
  assert.equal(people.total, people.children + people.workers + people.elders);
  assert.equal(jobs.employed + jobs.idle, people.workers);
  assert.equal(simulation.validateState(left).valid, true);
});

test("5-year population history reconciles births, deaths, age limits, jobs and stocks", () => {
  const state = simulation.createInitialState({ seed: 660021 });
  const startingPopulation = populationStats(state).total;
  simulation.advanceDays(state, 5 * CONTENT.rules.daysPerYear);
  assert.equal(state.annualReports.length, 5);
  let previous = startingPopulation;
  for (const report of state.annualReports) {
    assert.equal(report.populationAfterAging, previous + report.births - report.deaths);
    const labor = report.laborChange;
    assert.ok(labor);
    assert.equal(
      labor.openingWorkers + labor.adults - labor.retirees - labor.laborAgeDeaths,
      labor.closingWorkers
    );
    assert.equal(labor.balanceDifference, 0);
    previous = report.populationAfterAging;
  }
  const population = populationStats(state);
  const jobs = simulation.selectJobRows(state);
  assert.equal(population.total, previous);
  assert.equal(jobs.employed + jobs.idle, population.workers);
  assert.equal(simulation.validateState(state).valid, true);
  assert.ok(Object.values(state.accounts.residents).every(value => value >= 0));
  assert.ok(Object.values(state.accounts.town).every(value => value >= 0));
});

test("first-year labor ledger counts survivors crossing ages 17 and 64 exactly once", () => {
  const state = simulation.createInitialState({ seed: 917309 });
  assert.equal(populationStats(state).children, 200);
  assert.equal(populationStats(state).workers, 600);
  assert.equal(populationStats(state).elders, 200);
  simulation.advanceDays(state, CONTENT.rules.daysPerYear);
  const labor = state.annualReports[0].laborChange;
  assert.deepEqual(labor, {
    openingWorkers: 600,
    adults: 11,
    retirees: 12,
    laborAgeDeaths: 1,
    closingWorkers: 598,
    netChange: -2,
    balanceDifference: 0
  });
  const peoplePanel = renderPeople(simulation.selectDashboard(state));
  assert.match(peoplePanel, /年初 \/ 年末劳动力/);
  assert.match(peoplePanel, /600 \/ 598人/);
  assert.match(peoplePanel, /成年 \/ 退休/);
  assert.match(peoplePanel, /11 \/ 12人/);
});
