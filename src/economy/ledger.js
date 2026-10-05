import { RULES } from "../content/rules.js";
import { recordFinancialFlow } from "./financial-flows.js";

export function recordLedger(state, entry, content, options = {}) {
  const date = {
    year: options.year ?? state.year,
    day: Math.max(1, Math.min(content.rules.daysPerYear, options.day ?? (state.day + 1)))
  };
  state.ledgerSequence += 1;
  state.ledger.unshift({ id: state.ledgerSequence, ...date, ...entry });
  recordFinancialFlow(state, { id: state.ledgerSequence, ...date, ...entry });
  if (state.ledger.length > content.rules.ledgerLimit) {
    state.ledger.length = content.rules.ledgerLimit;
  }
}

export function recordEvent(state, text, content, options = {}) {
  const eventDay = options.day ?? state.day;
  state.events.unshift({
    year: state.year,
    day: Math.max(1, Math.min(content.rules.daysPerYear, eventDay)),
    text
  });
  if (state.events.length > 24) state.events.length = 24;
}

export function makeTransactionId(state) {
  state.transactionSequence = (state.transactionSequence || 0) + 1;
  return "tx-" + state.transactionSequence;
}

export function emptyYearTotals() {
  return {
    harvestQeq: 0,
    consumptionQeq: 0,
    operatingWagesQeq: 0,
    constructionPayQeq: 0,
    reliefQeq: 0,
    processingLossQeq: 0,
    unemploymentPaidQeq: 0,
    wagePaidQeq: 0,
    wageArrearsQeq: 0
  };
}
