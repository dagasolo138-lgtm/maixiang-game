// scripts/simulate.mjs
// 数值模拟 harness（简报思路 A 通用版）：读场景 JSON，跑 headless 模拟，输出关键指标。
//
// 用法：
//   node scripts/simulate.mjs <场景.json> [--out <结果路径>] [--format csv|json]
//
// 场景 JSON 示例：
// {
//   "name": "baseline-10y",
//   "seed": 42,
//   "years": 10,
//   "daysPerYear": 365,                 // 可选，默认取 content.rules.daysPerYear
//   "metrics": ["population_total"],    // 可选，默认输出全部指标
//   "script": [
//     { "year": 1, "action": "setWageRate", "args": { "roleId": "millers", "dailyJin": 12 } },
//     { "year": 2, "action": "buildAt", "args": { "typeId": "mill", "plotId": "auto" } },
//     { "year": 3, "action": "setUnemploymentPolicy", "args": { "enabled": true, "dailyPerWorkerJin": 2 } },
//     { "year": 5, "action": "toggleAutomaticRelief", "args": { "enabled": false } }
//   ]
// }
//
// 动作在指定年份"年初"（推进当年天数之前）按顺序执行；指标在每年年末采集。
// 只新增本文件，不改 src/ 下任何游戏逻辑与数值。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation, CONTENT } from "../src/engine.js";
import { APP_VERSION } from "../src/content/version.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { populationStats, selectJobRows } = await import(path.join(root, "src", "selectors", "labor.js"));
const { householdList } = await import(path.join(root, "src", "systems", "households.js"));
const { householdFoodQeqUnits } = await import(path.join(root, "src", "systems", "households.js"));
const { computeLaborMarket } = await import(path.join(root, "src", "systems", "labor-market.js"));
const { computeWealthStats } = await import(path.join(root, "src", "systems", "wealth-stats.js"));

const QEQ = CONTENT.precision.qeqUnitsPerJin;
const INV_JIN = CONTENT.precision.inventoryUnitsPerJin;
const VOUCHER = CONTENT.precision.currencyUnitsPerVoucher; // 粮券单位 -> 斤（与 panel-ledger 口径一致）
const qeqToJin = (qeqUnits) => (Number(qeqUnits) || 0) / QEQ;
const voucherToJin = (voucherUnits) => (Number(voucherUnits) || 0) / VOUCHER;
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ---------------------------------------------------------------- 动作注册表
// 每个动作：{ desc, run(sim, state, args, ctx) -> {ok, reason?} }
// 新增动作时只需在这里加一行，场景 JSON 即可直接使用。参数不足/非法时返回 ok:false。
function pickAutoPlot(sim, state, typeId) {
  const used = new Set([
    ...state.buildings.map((b) => b.plotId),
    ...(state.projects || []).map((p) => p.plotId),
  ]);
  const plots = state.plots || CONTENT.plots || [];
  const reasons = new Map(); // reason -> count
  for (const plot of plots) {
    if (used.has(plot.id)) continue;
    const res = sim.buildAt(state, typeId, plot.id);
    if (res && res.ok) return { ok: true, plotId: plot.id, detail: res };
    // startConstruction 先校验后落子：失败不改状态，可安全换地块重试
    const reason = (res && res.reason) || "未知原因";
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  if (reasons.size === 0) return { ok: false, reason: "没有可用空地" };
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  return { ok: false, reason: top[0] + (reasons.size > 1 ? `（另有${reasons.size - 1}种失败原因）` : "") };
}

const ACTIONS = {
  // 调工资
  setWageRate: {
    desc: "调整某工种日薪 {roleId, dailyJin}",
    run: (sim, state, a) => {
      if (!a.roleId || !Number.isFinite(Number(a.dailyJin))) return { ok: false, reason: "需要 roleId 与 dailyJin" };
      return sim.setWageRate(state, a.roleId, Number(a.dailyJin));
    },
  },
  // 开关失业金及金额
  setUnemploymentPolicy: {
    desc: "失业金政策 {enabled, dailyPerWorkerJin?}",
    run: (sim, state, a) => sim.setUnemploymentPolicy(state, {
      ...(a.enabled !== undefined ? { enabled: a.enabled } : {}),
      ...(a.dailyPerWorkerJin !== undefined ? { dailyPerWorkerJin: a.dailyPerWorkerJin } : {}),
    }),
  },
  // 建指定建筑（plotId 可为 "auto" 自动选空地）
  buildAt: {
    desc: "建造建筑 {typeId, plotId|auto}",
    run: (sim, state, a) => {
      if (!a.typeId) return { ok: false, reason: "需要 typeId" };
      if (a.plotId && a.plotId !== "auto") return sim.buildAt(state, a.typeId, a.plotId);
      return pickAutoPlot(sim, state, a.typeId);
    },
  },
  // ---- 开关政策类 ----
  setAgricultureTax: {
    desc: "农业税率 {percent}",
    run: (sim, state, a) => sim.setAgricultureTax(state, a.percent),
  },
  setPrivateProductionTax: {
    desc: "民营生产税 {typeId, percent}",
    run: (sim, state, a) => sim.setPrivateProductionTax(state, a.typeId, a.percent),
  },
  setBreadPrice: {
    desc: "面包售价 {wheatPerBreadJin}（每个面包折小麦斤数）",
    run: (sim, state, a) => {
      if (!Number.isFinite(Number(a.wheatPerBreadJin))) return { ok: false, reason: "需要 wheatPerBreadJin（正数）" };
      return sim.setBreadPrice(state, Number(a.wheatPerBreadJin));
    },
  },
  toggleAutomaticRelief: {
    desc: "自动救济开关 {enabled}（底层返回布尔值，此处统一包成 ok）",
    run: (sim, state, a) => {
      const enabled = a.enabled !== undefined ? Boolean(a.enabled) : true;
      sim.toggleAutomaticRelief(state, enabled);
      return { ok: true, enabled: state.autoRelief };
    },
  },
  sendRelief: {
    desc: "一次性发放救济 {amountJin}",
    run: (sim, state, a) => sim.sendRelief(state, a.amountJin),
  },
  startCurrencyReform: {
    desc: "启动货币改革 {}",
    run: (sim, state) => sim.startCurrencyReform(state),
  },
  finishCurrencyReform: {
    desc: "完成货币改革 {}",
    run: (sim, state) => sim.finishCurrencyReform(state),
  },
  setShopRent: {
    desc: "商铺日租金 {voucher}（每间营业店铺每日，粮券单位）",
    run: (sim, state, a) => sim.setShopRent(state, a.voucher),
  },
  setShopProfitTax: {
    desc: "商铺利润税 {value}",
    run: (sim, state, a) => sim.setShopProfitTax(state, a.value),
  },
  configureServicePrice: {
    desc: "服务价格 {serviceId, value}",
    run: (sim, state, a) => sim.configureServicePrice(state, a.serviceId, a.value),
  },
  setEmploymentExchangeQuota: {
    desc: "就业交易所配额 {value}",
    run: (sim, state, a) => sim.setEmploymentExchangeQuota(state, a.value),
  },
  // 别墅政策
  setVillaPolicy: {
    desc: "别墅政策 {priceWheatJin?, taxRatePercent?}",
    run: (sim, state, a) => sim.setVillaPolicy(state, {
      ...(a.priceWheatJin !== undefined ? { priceWheatJin: a.priceWheatJin } : {}),
      ...(a.taxRatePercent !== undefined ? { taxRatePercent: a.taxRatePercent } : {}),
    }),
  },
  // 人员安排
  setEmployment: {
    desc: "安排岗位人数 {jobKey, count}",
    run: (sim, state, a) => {
      if (!a.jobKey || !Number.isFinite(Number(a.count))) return { ok: false, reason: "需要 jobKey 与 count" };
      return sim.setEmployment(state, a.jobKey, Number(a.count));
    },
  },
  setProjectWorkers: {
    desc: "调整在建工程人数 {projectId|auto, workers}",
    run: (sim, state, a) => {
      if (a.projectId && a.projectId !== "auto") {
        return sim.setProjectWorkers(state, a.projectId, Number(a.workers));
      }
      // auto: 给所有在建工程都安排人数
      let total = 0;
      for (const proj of (state.projects || []).filter((p) => p.kind !== "upgrade")) {
        const r = sim.setProjectWorkers(state, proj.instanceId, Number(a.workers));
        if (r.ok) total += r.assigned || 0;
      }
      return total > 0 ? { ok: true, assigned: total } : { ok: false, reason: "没有在建工程" };
    },
  },
  // 工资调控
  setWageControl: {
    desc: "工资调控系数 {civil?, industry?}",
    run: (sim, state, a) => sim.setWageControl(state, {
      ...(a.civil !== undefined ? { civil: a.civil } : {}),
      ...(a.industry !== undefined ? { industry: a.industry } : {}),
    }),
  },
  // 按建筑类型安排生产工人
  assignBuildingWorkers: {
    desc: "安排建筑工人 {typeId, jobId, count}",
    run: (sim, state, a) => {
      const buildings = (state.buildings || []).filter((b) => b.typeId === a.typeId);
      if (!buildings.length) return { ok: false, reason: "没有该类型建筑" };
      let total = 0;
      for (const b of buildings) {
        const r = sim.setEmployment(state, b.id + "::" + a.jobId, Number(a.count));
        if (r.ok) total += r.assigned || 0;
      }
      return { ok: true, assigned: total };
    },
  },
  // 社保基金
  setSocialSecurityPolicy: {
    desc: "社保基金政策 {enabled?, dailyPerWorkerJin?, pensionPerElderJin?}",
    run: (sim, state, a) => sim.setSocialSecurityPolicy(state, {
      ...(a.enabled !== undefined ? { enabled: a.enabled } : {}),
      ...(a.dailyPerWorkerJin !== undefined ? { dailyPerWorkerJin: a.dailyPerWorkerJin } : {}),
      ...(a.pensionPerElderJin !== undefined ? { pensionPerElderJin: a.pensionPerElderJin } : {}),
    }),
  },
  injectSocialSecurity: {
    desc: "社保基金注资 {amountJin}",
    run: (sim, state, a) => {
      if (!Number.isFinite(Number(a.amountJin))) return { ok: false, reason: "需要 amountJin" };
      return sim.injectSocialSecurity(state, Number(a.amountJin));
    },
  },
  // 外贸
  setTradeTariffRate: {
    desc: "出口关税税率 {percent}",
    run: (sim, state, a) => {
      if (!Number.isFinite(Number(a.percent))) return { ok: false, reason: "需要 percent" };
      return sim.setTradeTariffRate(state, Number(a.percent));
    },
  },
  tradeOutside: {
    desc: "与外镇贸易 {direction: sell|buy, itemId, quantityJin}",
    run: (sim, state, a) => {
      if (!a.direction || !a.itemId || !Number.isFinite(Number(a.quantityJin))) {
        return { ok: false, reason: "需要 direction、itemId、quantityJin" };
      }
      return sim.tradeWithOutsideTown(state, a.direction, a.itemId, Number(a.quantityJin));
    },
  },
  // 测试辅助：直接给镇库发放材料（仅用于场景测试）
  grantTownMaterial: {
    desc: "镇库发放材料 {itemId, quantity}",
    run: (sim, state, a) => {
      if (!a.itemId || !CONTENT.items[a.itemId]) return { ok: false, reason: "未知物品" };
      const qty = Number(a.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: "数量无效" };
      state.accounts ||= {};
      state.accounts.town ||= {};
      state.accounts.town[a.itemId] = (state.accounts.town[a.itemId] || 0) + Math.round(qty * CONTENT.precision.inventoryUnitsPerJin);
      return { ok: true };
    },
  },
  // ---- 调试类（仅模拟用）：制造缺粮家庭，验证邻里互助/救济 ----
  drainHouseholdFood: {
    desc: "抽干 N 个最穷家庭的存粮与粮券 {count}（制造邻里互助受助方）",
    run: (sim, state, a) => {
      const n = Math.max(1, Math.floor(Number(a.count) || 5));
      const rows = householdList(state)
        .map((h) => ({ h, food: householdFoodQeqUnits(state, h, CONTENT) }))
        .sort((x, y) => x.food - y.food)
        .slice(0, n);
      for (const { h } of rows) {
        h.inventory = {};
        h.voucherUnits = 0;
      }
      return { ok: true, drained: rows.length };
    },
  },
};

// ---------------------------------------------------------------- 指标注册表
// 指标名全局稳定：跨场景、跨版本可比。新增指标只追加，不改名、不改口径。
function gini(values) {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const total = xs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let cum = 0, acc = 0;
  for (const x of xs) { cum += x; acc += cum; }
  return Math.max(0, Math.min(1, (2 * acc) / (n * total) - (n + 1) / n));
}

const METRICS = [
  { key: "year", compute: (ctx) => ctx.year },
  { key: "population_total", compute: (ctx) => ctx.pop.total },
  { key: "population_children", compute: (ctx) => ctx.pop.children },
  { key: "population_workers", compute: (ctx) => ctx.pop.workers },
  { key: "population_elders", compute: (ctx) => ctx.pop.elders },
  { key: "births", compute: (ctx) => ctx.report?.births || 0 },
  { key: "deaths", compute: (ctx) => ctx.report?.deaths || 0 },
  { key: "town_balance_jin", compute: (ctx) => round2(ctx.sim.accountQeq(ctx.state, "town")) },
  { key: "residents_balance_jin", compute: (ctx) => round2(ctx.sim.accountQeq(ctx.state, "residents")) },
  {
    key: "unemployment_rate",
    compute: (ctx) => {
      const employed = ctx.jobRows.reduce((a, r) => a + (r.count || 0), 0);
      const labor = ctx.pop.workers;
      return labor > 0 ? round2(Math.max(0, labor - employed) / labor) : 0;
    },
  },
  {
    key: "gini_household_vouchers",
    compute: (ctx) => round2(gini(householdList(ctx.state).map((h) => h.voucherUnits || 0))),
  },
  // 注意：yearTotals.wagePaidQeq / unemploymentPaidQeq 在源码中从未被累加（恒为 0），
  // 工资与失业金的真实口径在 state.payroll.year（年报 payroll 段），与 panel-ledger 一致。
  { key: "wage_paid_jin", compute: (ctx) => round2(voucherToJin(ctx.report?.payroll?.paidVoucherUnits)) },
  { key: "wage_arrears_jin", compute: (ctx) => round2(voucherToJin(ctx.report?.payroll?.unpaidVoucherUnits)) },
  { key: "unemployment_paid_jin", compute: (ctx) => round2(voucherToJin(ctx.report?.payroll?.unemploymentPaidVoucherUnits)) },
  { key: "consumption_jin", compute: (ctx) => round2(qeqToJin(ctx.report?.consumptionQeq)) },
  { key: "harvest_jin", compute: (ctx) => round2(qeqToJin(ctx.report?.harvestQeq)) },
  {
    key: "agriculture_tax_jin",
    compute: (ctx) => round2(
      (ctx.report?.agricultureTax || []).reduce((a, r) => a + (r.townUnits || 0), 0) / INV_JIN
    ),
  },
  { key: "satisfaction", compute: (ctx) => round2(ctx.state.satisfaction) },
  // 动态劳动力市场（用户 0.1.11）
  {
    key: "labor_unemployment_rate",
    compute: (ctx) => round2(computeLaborMarket(ctx.state, CONTENT).unemploymentRate),
  },
  {
    key: "labor_mood",
    compute: (ctx) => computeLaborMarket(ctx.state, CONTENT).mood,
  },
  {
    key: "labor_reference_wage",
    compute: (ctx) => round2(computeLaborMarket(ctx.state, CONTENT).referenceWage),
  },
  {
    key: "labor_target_shop_wage",
    compute: (ctx) => round2(computeLaborMarket(ctx.state, CONTENT).targetShopWage),
  },
  {
    key: "labor_poach_year",
    compute: (ctx) => ctx.state.laborCompetition?.year?.moves || 0,
  },
  {
    key: "wealth_poor10_per_capita",
    compute: (ctx) => round2(computeWealthStats(ctx.state, CONTENT)?.poorWealthPerCapita),
  },
  {
    key: "wealth_rich10_per_capita",
    compute: (ctx) => round2(computeWealthStats(ctx.state, CONTENT)?.richWealthPerCapita),
  },
  {
    key: "wealth_rich10_share_pct",
    compute: (ctx) => round2(computeWealthStats(ctx.state, CONTENT)?.richWealthSharePercent),
  },
  // 别墅
  {
    key: "villa_sold",
    compute: (ctx) => (ctx.state.villas?.sold || []).length,
  },
  {
    key: "villa_revenue_jin",
    compute: (ctx) => round2(voucherToJin(ctx.state.villas?.stats?.revenueValueUnits || 0)),
  },
  {
    key: "villa_tax_jin",
    compute: (ctx) => round2(voucherToJin(ctx.state.villas?.stats?.taxCollectedValueUnits || 0)),
  },
  {
    key: "top10_household_assets_jin",
    compute: (ctx) => {
      const scale = CONTENT.precision.currencyUnitsPerVoucher;
      const invScale = CONTENT.precision.inventoryUnitsPerJin;
      const assets = householdList(ctx.state).map((h) => {
        let v = h.voucherUnits || 0;
        for (const [itemId, units] of Object.entries(h.inventory || {})) {
          const price = CONTENT.rules.marketPricesVoucherPerUnit?.[itemId] ?? 0;
          v += Math.round((units / invScale) * price * scale);
        }
        for (const villa of h.villaAssets || []) v += Math.max(0, Number(villa.priceValueUnits) || 0);
        return v / scale;
      }).sort((a, b) => b - a);
      return round2(assets.slice(0, 10).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(10, assets.length)));
    },
  },
  // 工资调控
  {
    key: "wage_control_civil",
    compute: (ctx) => ctx.state.policy?.wageControl?.civil ?? 1,
  },
  {
    key: "wage_control_industry",
    compute: (ctx) => ctx.state.policy?.wageControl?.industry ?? 1,
  },
  // 社保基金
  {
    key: "social_fund_jin",
    compute: (ctx) => round2((ctx.state.socialSecurity?.balanceUnits || 0) / CONTENT.precision.currencyUnitsPerVoucher),
  },
  {
    key: "social_collected_jin",
    compute: (ctx) => round2((ctx.state.socialSecurity?.totalCollectedUnits || 0) / CONTENT.precision.currencyUnitsPerVoucher),
  },
  {
    key: "social_paid_jin",
    compute: (ctx) => round2((ctx.state.socialSecurity?.totalPaidUnits || 0) / CONTENT.precision.currencyUnitsPerVoucher),
  },
  {
    key: "social_injected_jin",
    compute: (ctx) => round2((ctx.state.socialSecurity?.totalInjectedUnits || 0) / CONTENT.precision.currencyUnitsPerVoucher),
  },
  // 外贸·四地主镇
  {
    key: "outside_wheat_stock_jin",
    compute: (ctx) => round2(ctx.state.outsideTown?.wheatStockJin || 0),
  },
  {
    key: "outside_prosperity",
    compute: (ctx) => round2(ctx.state.outsideTown?.prosperity ?? 0),
  },
  {
    key: "outside_population",
    compute: (ctx) => Math.round(ctx.state.outsideTown?.population || 0),
  },
  {
    key: "outside_buy_salt",
    compute: (ctx) => round2(ctx.state.outsideTown?.buyPrices?.salt ?? 0),
  },
  {
    key: "outside_buy_wheat",
    compute: (ctx) => round2(ctx.state.outsideTown?.buyPrices?.wheat ?? 0),
  },
  {
    key: "outside_sell_wheat",
    compute: (ctx) => round2(ctx.state.outsideTown?.sellPrices?.wheat ?? 0),
  },
  {
    key: "trade_export_jin",
    compute: (ctx) => round2(ctx.state.outsideTown?.stats?.exportJin || 0),
  },
  {
    key: "trade_import_jin",
    compute: (ctx) => round2(ctx.state.outsideTown?.stats?.importJin || 0),
  },
  {
    key: "trade_tariff_jin",
    compute: (ctx) => round2(ctx.state.outsideTown?.stats?.tariffJin || 0),
  },
  {
    key: "trade_count",
    compute: (ctx) => ctx.state.outsideTown?.stats?.trades || 0,
  },
  // 邻里互助（用户 0.1.11；用累计口径，年桶在跨年结算时已清零）
  {
    key: "neighbor_aid_jin",
    compute: (ctx) => round2(qeqToJin(ctx.state.neighborAid?.cumulative?.movedQeqUnits || 0)),
  },
  {
    key: "neighbor_aid_helped",
    compute: (ctx) => ctx.state.neighborAid?.cumulative?.helpedHouseholds || 0,
  },
  {
    key: "neighbor_aid_needy_today",
    compute: (ctx) => ctx.state.neighborAid?.lastDay?.needyHouseholds || 0,
  },
];

// ---------------------------------------------------------------- 主流程
function fail(message) {
  console.error("simulate 失败：" + message);
  process.exit(1);
}

const argv = process.argv.slice(2);
// 取第一个非选项参数为场景路径（跳过 --out/--format 的值）
let scenarioPath = null;
{
  const skipNext = new Set();
  for (let i = 0; i < argv.length; i++) {
    if (skipNext.has(i)) continue;
    const a = argv[i];
    if ((a === "--out" || a === "--format") && argv[i + 1]) { skipNext.add(i + 1); continue; }
    if (!a.startsWith("--") && scenarioPath === null) scenarioPath = a;
  }
}
if (!scenarioPath) fail("用法: node scripts/simulate.mjs <场景.json> [--out <路径>] [--format csv|json]");
let outPath = null;
let format = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--out" && argv[i + 1]) outPath = path.resolve(argv[++i]);
  else if (argv[i] === "--format" && argv[i + 1]) format = argv[++i];
}
if (!format) format = outPath && outPath.endsWith(".json") ? "json" : "csv";
if (!["csv", "json"].includes(format)) fail("format 须为 csv 或 json");

let scenario;
try {
  scenario = JSON.parse(await readFile(path.resolve(scenarioPath), "utf8"));
} catch (e) {
  fail(`场景文件读取/解析失败：${e.message}`);
}
const seed = scenario.seed ?? 1;
const years = Number(scenario.years ?? 10);
const daysPerYear = Number(scenario.daysPerYear ?? CONTENT.rules.daysPerYear);
if (!Number.isInteger(years) || years < 1 || years > 200) fail("years 须为 1—200 的整数");
if (!Number.isInteger(daysPerYear) || daysPerYear < 1) fail("daysPerYear 须为正整数");

const metricKeys = scenario.metrics || METRICS.map((m) => m.key);
for (const k of metricKeys) {
  if (!METRICS.some((m) => m.key === k)) fail(`未知指标：${k}（可用：${METRICS.map((m) => m.key).join(", ")}）`);
}
const script = scenario.script || [];
for (const step of script) {
  if (!ACTIONS[step.action]) fail(`未知动作：${step.action}（可用：${Object.keys(ACTIONS).join(", ")}）`);
  if (!Number.isInteger(step.year) || step.year < 1 || step.year > years) {
    fail(`动作 ${step.action} 的 year 须为 1—${years} 的整数`);
  }
}
const scriptByYear = new Map();
for (const step of script) {
  if (!scriptByYear.has(step.year)) scriptByYear.set(step.year, []);
  scriptByYear.get(step.year).push(step);
}

const sim = createSimulation(CONTENT);
const state = sim.createInitialState({ seed });
const events = [];
const rows = [];
const t0 = Date.now();
for (let year = 1; year <= years; year++) {
  for (const step of scriptByYear.get(year) || []) {
    let result;
    try {
      result = ACTIONS[step.action].run(sim, state, step.args || {});
    } catch (e) {
      result = { ok: false, reason: "异常：" + (e.message || e) };
    }
    const ev = { year, action: step.action, args: step.args || {}, ok: Boolean(result && result.ok) };
    if (!ev.ok) ev.reason = (result && result.reason) || "未知原因";
    events.push(ev);
    console.error(`[年 ${year}] ${step.action} ${JSON.stringify(step.args || {})} -> ${ev.ok ? "ok" : "失败：" + ev.reason}`);
  }
  sim.advanceDays(state, daysPerYear);
  const report = state.annualReports[state.annualReports.length - 1] || null;
  const pop = populationStats(state);
  const jobRows = selectJobRows(state, CONTENT).rows;
  const ctx = { sim, state, year, report, pop, jobRows };
  const row = {};
  for (const m of METRICS) {
    if (metricKeys.includes(m.key)) {
      try { row[m.key] = m.compute(ctx); }
      catch (e) { row[m.key] = null; console.error(`[年 ${year}] 指标 ${m.key} 计算异常：${e.message}`); }
    }
  }
  rows.push(row);
}
const elapsedSec = Math.round((Date.now() - t0) / 100) / 10;

const check = sim.validateState(state);
const result = {
  meta: {
    name: scenario.name || path.basename(scenarioPath, ".json"),
    seed, years, daysPerYear,
    appVersion: APP_VERSION,
    elapsedSec,
    stateValid: Boolean(check.valid),
    stateErrors: check.valid ? [] : (check.errors || []).slice(0, 10),
    actions: Object.keys(ACTIONS),
    metrics: metricKeys,
    generatedAt: new Date().toISOString(),
  },
  events,
  rows,
};

let output;
if (format === "json") {
  output = JSON.stringify(result, null, 2) + "\n";
} else {
  const header = metricKeys.join(",");
  const lines = rows.map((r) => metricKeys.map((k) => (r[k] === null || r[k] === undefined ? "" : r[k])).join(","));
  output = header + "\n" + lines.join("\n") + "\n";
}
if (outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, output, "utf8");
  console.error(`模拟完成：${years} 年（${elapsedSec}s），结果已写入 ${outPath}`);
} else {
  process.stdout.write(output);
}
if (!check.valid) {
  console.error("警告：最终状态 validateState 未通过：" + (check.errors || []).slice(0, 5).join("；"));
  process.exit(2);
}
