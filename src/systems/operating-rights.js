import { voucherBalance } from "../economy/currency.js";
import { currentPaymentComposition, settleMonetaryPayment } from "../economy/payment.js";
import { voucherUnitsForWheatUnits } from "../economy/money-units.js";
import { recordEvent } from "../economy/ledger.js";
import { selectOperatingRightPreview } from "../selectors/operating-rights.js";
import { householdConvertibleWheatUnits, householdList, householdPopulation, isActiveHousehold, setJobCount } from "./households.js";
import { readJobCount, jobKeyForBuilding, privateJobKeyForBuilding } from "../selectors/labor.js";

function chooseBuyerHousehold(state, priceUnits, content) {
  const scale = content.precision.currencyUnitsPerVoucher;
  const minimumPerCapita = content.rules.householdLiving?.difficultPerCapitaVoucher ?? 30;
  return householdList(state).filter(household => {
    const reserve = Math.round(householdPopulation(household) * minimumPerCapita * scale);
    const wheatUnits = householdConvertibleWheatUnits(state, household, content, content.rules.householdFoodReserveDays ?? 30);
    const available = voucherBalance(state, `household:${household.id}`) + voucherUnitsForWheatUnits(wheatUnits, content, "floor");
    return isActiveHousehold(household) && available >= priceUnits + reserve;
  }).sort((a, b) => {
    const av = voucherBalance(state, `household:${a.id}`) + voucherUnitsForWheatUnits(householdConvertibleWheatUnits(state, a, content, content.rules.householdFoodReserveDays ?? 30), content, "floor");
    const bv = voucherBalance(state, `household:${b.id}`) + voucherUnitsForWheatUnits(householdConvertibleWheatUnits(state, b, content, content.rules.householdFoodReserveDays ?? 30), content, "floor");
    return bv - av || a.id.localeCompare(b.id);
  })[0] || null;
}

export function sellOperatingLevel(state, buildingId, content) {
  const preview = selectOperatingRightPreview(state, buildingId, content);
  if (!preview.available) return { ok: false, reason: preview.reason, preview };
  const building = state.buildings.find(row => row.id === buildingId);
  const definition = content.buildings[building.typeId];
  const job = definition.jobs[0];
  const priceUnits = Math.round(preview.priceWheatJin * content.precision.currencyUnitsPerVoucher);
  const buyer = chooseBuyerHousehold(state, priceUnits, content);
  if (!buyer) return { ok: false, reason: "没有家庭能在保留生活资金后买下经营权", preview };
  const exchange = settleMonetaryPayment(state, `household:${buyer.id}`, "town", currentPaymentComposition(state, priceUnits), content,
    "operating_right_sale", `${buyer.name}购买${definition.name}一级经营权`,
    { requireFull: true, maxWheatUnits: householdConvertibleWheatUnits(state, buyer, content, content.rules.householdFoodReserveDays ?? 30) });
  if (!exchange.ok) return { ok: false, reason: exchange.reason };
  const publicKey = jobKeyForBuilding(buildingId, job.id);
  const privateKey = privateJobKeyForBuilding(buildingId, job.id);
  const publicWorkers = readJobCount(state, publicKey);
  const publicCapacity = Math.max(0, (building.ownership?.townLevels || 1) - 1) * job.slots;
  const transferred = Math.max(0, publicWorkers - publicCapacity);
  setJobCount(state, publicKey, Math.min(publicWorkers, publicCapacity), content);
  const priorPrivate = readJobCount(state, privateKey);
  setJobCount(state, privateKey, Math.min(priorPrivate + transferred, ((building.ownership?.privateLevels || 0) + 1) * job.slots), content, { type: "private", id: buildingId });
  building.ownership ||= { townLevels: building.level || 1, privateLevels: 0, listedLevels: 0 };
  building.ownership.townLevels -= 1;
  building.ownership.privateLevels += 1;
  building.privateOwners ||= [];
  building.privateOwners.push(buyer.id);
  buyer.operatingRights ||= [];
  buyer.operatingRights.push({ buildingId, level: building.privateOwners.length });
  const period = state.privateEconomy.rightSales;
  period.dayWheatUnits += priceUnits;
  period.yearWheatUnits += priceUnits;
  period.cumulativeWheatUnits += priceUnits;
  if (state.market?.operatingPlan) state.market.operatingPlan.updatedSerial = -1;
  recordEvent(state, `${buyer.name}以${preview.priceWheatJin.toLocaleString("zh-CN")}斤小麦等值购入${definition.name}一级经营权。`, content, { day: state.day + 1 });
  return { ok: true, preview, ownerHouseholdId: buyer.id, transferredWorkers: transferred, transactionId: exchange.transactionId };
}
