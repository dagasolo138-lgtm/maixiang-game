import { simulation } from "../src/engine.js";
import { addInventory } from "../src/economy/inventory.js";
import { CONTENT } from "../src/content/index.js";
import { jobCount } from "../src/systems/households.js";

const state = simulation.createInitialState();
addInventory(state, "town", "wood", 600, "t", "test", CONTENT);
simulation.buildAt(state, "mill", "east");
simulation.advanceDays(state, 40);
const mill = state.buildings[0];
simulation.setEmployment(state, `${mill.id}::millers`, 4);
console.log("wheat before:", state.accounts.town.wheat, "flour before:", state.accounts.town.flour);
simulation.advanceDay(state);
console.log("after 1 day -> wheat:", state.accounts.town.wheat, "flour:", state.accounts.town.flour);
console.log("business.buildings:", JSON.stringify(state.business.buildings));
console.log("millers jobCount:", jobCount(state, `${mill.id}::millers`));
console.log("monetary stage:", state.monetaryReform?.stage);
console.log("events tail:", state.events.slice(-6).map(e => e.message).join(" | "));
