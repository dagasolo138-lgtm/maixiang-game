# 0.1.11 母版 → 当前源码 对比审计 · 缺失清单

- **母版（只读，未改动）**：`/home/hatch/workspace/user/files/-0_1_11_html-5.html`（版本 `0.1.11`，build `0111-r13-b001`）
- **当前源码**：`/home/hatch/workspace/maixiang-game/work/maixiang-src/src/`（109 个 ES 模块，版本 `0.2.3`，build `0203-r01-b001`）
- **审计方式**：把母版内联 JS 抽出后建立行号引用文件，逐功能/逐文案对照；未修改任何源码、未触碰母版。

### 母版引用行号的使用方法

母版内联 JS 已抽取到本目录：

| 文件 | 说明 |
|---|---|
| `master-inline.js` | 母版 `<script>` 原文（573,562 字符，原始 496 行，极长） |
| `master-lines.js` | **本清单引用行号所用**：在字符串外按 `;`/换行切分后的稳定行号版本（3,425 行），可直接 `sed -n 'Np' master-lines.js` |
| `master-pretty.js` | 早期粗略美化版（仅参考） |

本清单中「母版 `master-lines.js:NNNN`」均可直接定位。母版关键渲染函数行号表：

| 函数 | 职责 | master-lines.js 行 | master-inline.js 字节偏移 |
|---|---|---|---|
| `q0` | 事件记录 + 合并 | 32 | 17422 |
| `b7` / `ZM` / `zM` | 批发市场历史快照 / 7日均售 / trends 视图 | 901 / 902 / 916 | 108100 / 108505 / 109586 |
| `_2` | 地块标签人性化（`空地 3` → `3号地`） | 2968 | 379462 |
| `r5` | sparkline 走势图 | 2968 | 379612 |
| `Cz` | 建设面板 | 3063 | 416787 |
| `jz` | 镇民面板 | 3106 | 426321 |
| `Uz` | 居民主粮购买 | 3114 | 428904 |
| `gz` | 账目与历史交易 | 3134 | 434558 |
| `yz` | 本年收支明细 | 3161 | 440109 |
| `uz` | 经营面板 | 3280 | 458236 |
| `lz` | 政策面板 | 3291 | 459508 |
| `pz` | 银行 / 货币改革 | 3331 | 467786 |
| `j_` | 开荒区块 | 3354 | 471587 |
| `cz` | 地方详情面板 | 3363 | 474237 |
| `$$` | 建筑管理（升级/拆除） | 3369 | 492834 |
| `i3` | 设置 / 存档 | 3395 | 499438 |

> 字节偏移可用 `python3 -c "print(open('master-inline.js',encoding='utf-8').read()[OFFSET:OFFSET+24])"` 复核，已全部验证指向对应 `function` 开头。

### 审计结论摘要

母版的**面板行、政策项、建筑、商品、事件文案**绝大部分已被 0.2.3 逐字继承。真正的缺失集中在 **4 个功能机制** 和 **若干展示层退化**：

| 级别 | 缺失 | 类别 |
|---|---|---|
| 🔴 严重 | 事件合并（merge）机制整体失效，`untilDay` 字段消失 | 功能缺失 F-1 / F-2 |
| 🔴 严重 | 批发市场 30 日历史快照 / 7日均售 / 库存可售天数 / 双走势线 整条管线不存在 | 功能缺失 F-3 |
| 🟠 一般 | 账目面板账户名解析字典（`镇库`/`应收租金`/家庭名/店铺名…）缺失，直接显示内部 token | 功能缺失 F-4 |
| 🟠 一般 | 地块标签人性化 `_2()` 缺失，建筑副标题退化为内部 id | 内容缺失 C-1 |
| 🟡 轻微 | 政策面板 2 处建筑门控丢失、货币改革建行前简化态丢失、居民主粮购买空态丢失、`存储详情` 标题 | 功能/内容缺失 |
| 🟡 轻微 | 「支付媒介不产生利润」等若干 subtle 文案被改写/插入 | 文案差异 T-1…T-6 |

---

# 【功能缺失】

## F-1 🔴 事件合并（merge）机制整体失效 —— `recordEvent` 丢弃全部合并参数

**母版**（`master-lines.js:32`，函数 `q0`）：

```js
function q0($, Z, z, N = {}) {
  let M = N.day ?? $.day;
  if (N.mergeKey) {
    let Q = $.events.find(f => f.mergeKey === N.mergeKey),
        _ = Q ? Q.untilDay ?? Q.day : null;
    if (Q && Q.year === $.year && M - _ >= 0 && M - _ <= (N.mergeWindowDays || 1)) {
      Q.untilDay = M;
      Q.mergeCount = (Q.mergeCount || 1) + 1;
      Q.mergeAmount = (Q.mergeAmount || 0) + (N.amount || 0);
      Q.text = N.mergedText ? N.mergedText(Q.mergeCount, Q.mergeAmount) : Z;
      return;
    }
    $.events.unshift({ year: $.year, day: ..., text: Z,
                       mergeKey: N.mergeKey, mergeCount: 1, mergeAmount: N.amount || 0 });
    if ($.events.length > 24) $.events.length = 24;
    return;
  }
  $.events.unshift({ year: $.year, day: ..., text: Z });
  if ($.events.length > 24) $.events.length = 24;
}
```

**源码现状**：`src/economy/ledger.js:17-25`

```js
export function recordEvent(state, text, content, options = {}) {
  const eventDay = options.day ?? state.day;
  state.events.unshift({
    year: state.year,
    day: Math.max(1, Math.min(content.rules.daysPerYear, eventDay)),
    text
  });
  if (state.events.length > 24) state.events.length = 24;
}
```

`options` 只被读取 `day`；`mergeKey`、`mergeWindowDays`、`amount`、`mergedText` **全部被静默丢弃**，也不写入 `mergeCount`/`mergeAmount`/`untilDay`。

**证据（标识符出现次数，母版 bundle vs 当前 bundle）**：

| 标识符 | 母版 | 当前 | 说明 |
|---|---|---|---|
| `mergeKey` | 11 | 3 | 当前 3 次全是**死参数** |
| `mergeWindowDays` | 6 | 3 | 同上 |
| `mergedText` | 7 | 3 | 同上 |
| `untilDay` | 4 | **0** | 字段彻底消失 |

**受影响的 3 个「死参数」调用点**（参数传了但函数不消费）：

| 文件:行 | 传入的合并配置 |
|---|---|
| `src/systems/labor-market.js:222-230` | `mergeKey:"labor-poach"`, `mergeWindowDays:30` |
| `src/systems/neighbor-aid.js:148-160` | `mergeKey:"neighbor-aid"`, `mergeWindowDays:30` |
| `src/systems/shop-pricing.js:263-266` | `mergeKey:"shop-promotion:${shop.id}"`, `mergeWindowDays:30`（0.2.3 新增功能，聚合从诞生起即无效） |

**另有 3 处母版启用合并且当前源码连参数都没传**：

| 母版（`master-lines.js`） | 母版 merge 配置 | 源码现状 |
|---|---|---|
| 房屋修缮（`house-repair-wood`） | `mergeWindowDays:3` | `src/systems/housing.js:93` 无 merge 参数 |
| 镇库欠薪（`town-wage-arrears`） | `mergeWindowDays:3` | `src/systems/payroll.js:383` 无 merge 参数 |
| 自动救济（`auto-relief`） | `mergeWindowDays:30` | `src/systems/finance.js:162` 无 merge 参数 |

**后果**：母版中重复发生的事件（挖人 / 邻里接济 / 欠薪 / 房屋修缮 / 自动救济 / 促销）会被折叠为一条并改写为「近来 N 天/N 次…」的叙述句；当前源码每次都 `unshift` 一条新事件，24 条上限被快速刷爆，聚合叙述**永不出现**。

**关联**：`src/core/validation.js:25-28` 只校验 `year/day/text`，不含 `untilDay`；`src/persistence/migrations.js:249`、`:1208` 用 `{...event}` 迁移，但已无字段可保留。

---

## F-2 🔴 `untilDay` 的日期范围展示丢失

**母版**：事件气泡历史渲染 `第${V(Y0.year)}年 · 第${V(Y0.day)}${Y0.untilDay ? \`–${V(Y0.untilDay)}\` : ""}日`，即合并事件显示为「第1年 · 第3–6日」。

**源码现状**：`src/ui/app.js:249` 只有

```js
`<div class="event-line"><time>第${number(event.year)}年 · 第${number(event.day)}日</time>${escapeHtml(event.text)}</div>`
```

无 `untilDay` 分支。全仓库 `grep -rn "untilDay" src/` → **0 命中**。

---

## F-3 🔴 批发市场历史/走势整条管线不存在

母版批发市场详情页每个商品 cardlet 有 4 项当前源码完全没有的分析数据。

**母版数据管线**（`master-lines.js:901/902/916`）：

```js
// b7：每日快照，保留 30 天
function b7($, Z) {
  if (!U1($, Z)) return;
  let z = Y1($, Z);
  z.history = Array.isArray(z.history) ? z.history : [];
  z.history.push({
    year: $.year, day: $.day + 1,
    inventory: Object.fromEntries(x1.map(N => [N, z.inventory[N] || 0])),
    sold:      Object.fromEntries(x1.map(N => [N, z.day?.soldUnits?.[N] || 0])),
    price:     Object.fromEntries(x1.map(N => [N, z.pricesVoucherPerUnit[N] || 0]))
  });
  if (z.history.length > P7) z.history.splice(0, z.history.length - P7);   // P7 = 30
}
// ZM：近 7 日（$M = 7）均售
function ZM($, Z) {
  let z = ($.history || []).slice(-$M);
  if (!z.length) return 0;
  return z.reduce((N, M) => N + (M.sold?.[Z] || 0), 0) / z.length;
}
// zM：供面板使用的 trends 视图
function zM($, Z) {
  let z = Y1($, Z), N = Z.precision.inventoryUnitsPerJin, M = z.history || [];
  return Object.fromEntries(x1.map(Q => {
    let _ = ZM(z, Q) / N, f = (z.inventory[Q] || 0) / N;
    return [Q, {
      avgSoldJin: _, stockDays: _ > 0 ? f / _ : null,
      townStockJin: ($.accounts?.town?.[Q] || 0) / N,
      inventory: M.map(O => (O.inventory?.[Q] || 0) / N),
      price:     M.map(O => O.price?.[Q] || 0)
    }];
  }));
}
```

**母版面板行**（`master-lines.js:3363`，函数 `cz` 的 `wholesale_market` 分支）：

```
${W}库存   →   ${库存}${单位} · ${stockDays == null ? "近7日无销量" : `约可售${Q2(stockDays,1)}天`}
7日均售 / 镇库存  →  ${avgSoldJin} / ${townStockJin}${单位}
<div class="trend-pair">${r5(L.inventory,"库存")}${r5(L.price,"批发价")}</div>   // 双 sparkline
```

**源码现状**：

| 母版内容 | 源码现状 | 证据 |
|---|---|---|
| `b7` 每日快照 / `history` 数组（30 天） | **不存在** | `grep -n "history" src/systems/wholesale-market.js` → 0 命中 |
| `ZM` 7 日均售 | **不存在** | `grep -rn "avgSoldJin" src/` → 0 命中 |
| `stockDays` 可售天数 | **不存在** | `grep -rn "stockDays" src/` → 0 命中 |
| `townStockJin`（批发市场语境） | **不存在** | `grep -rn "townStockJin" src/` 只命中 `src/selectors/dashboard.js:468`（**食盐**库存，非批发市场） |
| `trends` 视图 | **不存在** | `grep -rn "trends" src/` → 0 命中；`wholesaleSummary()`（`src/systems/wholesale-market.js:778-818`）返回体无 `trends` 键 |
| 空态文案 `近7日无销量` | **不存在** | 母版 1 处，源码 0 处 |
| `约可售N天` | **不存在** | 母版 1 处，源码 0 处 |
| `7日均售 / 镇库存` 行 | **不存在** | 母版 1 处，源码 0 处 |
| `<div class="trend-pair">` 双走势线 | **不存在** | `grep -rn "trend-pair" src/` → 0 命中；`.trend-pair`/`.sparkline` CSS 也不存在 |
| `r5` sparkline 渲染器 | 仅 `src/ui/econ-mini.js:5` 有一份**无关**的 `sparkline()`（经济迷你面板用） | — |

**源码现状替代**：`src/ui/panel-site.js:158` 该商品卡只显示 `库存` 数值，无 `约可售` 后缀、无 7 日均售行、无走势图。

> 0.2.2 的 CHANGELOG 明确记录了「批发市场单次调运（收储入镇库/镇库投放平抑库存）」的移植，但**未提**趋势卡片 —— 说明 `trends` 三件套是在 0.1.11 → 0.2.x 逆向移植时被漏掉的，而非有意移除。

> 注：0.2.3 把批发市场改成了做市商（收购价/售价表 + 镇库结算），新增了 `收购价（向公司/民营）`、`当前实际收购价`、`售价（卖给综合商店）`、`批发市场现金`、`累计销售/累计收购`、`镇库注资` 等行（`src/ui/panel-site.js:151-183`）。这些是**新增**，不抵消 F-3 的缺失：母版的库存周转分析能力（可售天数、7 日均售、库存/价格双走势）整体没有对应实现。

### F-3 附：批发市场其余差异属 0.2.3 有意改版（不计入缺失，供验收确认）

| # | 母版 | 源码 | 性质 |
|---|---|---|---|
| a | 状态条 `镇营批发市场` | `镇营批发市场 · 做市商`（`panel-site.js:185`） | 有意改版 |
| b | 商品清单含小麦 `["wheat","flour","bread","wood","salt"]` | 小麦拆为独立卡片，可交易清单 `["flour","bread","wood","salt"]`（`panel-site.js:149,170-173`） | 有意改版，符合 AGENTS.md「小麦归镇库直管，不做市」 |
| c | 单一编辑器 `批发价` | 拆为 `收购价（向公司/民营）` + `售价（卖给综合商店）` + `当前实际收购价`（`panel-site.js:159-161`） | 有意改版 |
| d | 无现金账户卡片 | 新增 `批发市场现金`/`累计销售·累计收购`/`累计发放镇营工资`/`累计注资`/`镇库注资`（`panel-site.js:179-184`） | 新增 |
| e | 说明止于「…用来平抑库存。」 | 追加做市商说明与「小麦归镇库直管…磨坊用麦走免费内部调拨。」（`panel-site.js:173,185`） | 新增 |

---

## F-4 🟠 账目面板账户名解析字典缺失，直接显示内部 token

**母版**（`master-lines.js:3134` 附近）：账目的「来源 → 去向」经过 `D_()` 解析，字典 `bz` 与 `D_` 如下：

```js
var bz = { town:"镇库", residents:"居民", households:"居民家庭", wholesale_market:"批发市场",
  field:"麦田", consumed:"消耗", consumption:"消耗", loss:"损耗", currency_issuer:"印制",
  private_production:"民营生产", wage_expense:"工资计提", unpaid:"未付", waived:"减免",
  rent_due:"应收租金", construction_payroll:"施工工资", construction_investment:"建设投入" };

function D_($, Z) {
  if (!Z) return "";
  if (bz[Z]) return bz[Z];
  let [z, ...N] = String(Z).split(":"), M = N.join(":");
  if (z === "household") return $.householdNames?.[M] || (/^household-(\d+)$/.test(M) ? `第${M.slice(10)}户` : M);
  if (z === "shop")     return ($.shops || []).find(Q => Q.id === M)?.name || "店铺";
  if (z === "company")  return ($.companies || []).find(Q => Q.id === M)?.name || "公司";
  if (z === "building") return ($.buildings || []).find(Q => Q.id === M)?.name || "建筑";
  return Z;
}
```

**源码现状**：`src/ui/panel-ledger.js:30`

```js
const where = [row.source, row.destination].filter(Boolean).join(" → ");
```

即**原样拼接内部 token**，无字典、无前缀解析。证据：

- `grep -rn "应收租金" src/` → **0 命中**（母版 1 处，在 `bz` 字典）
- `grep -rn "householdNames" src/` → **0 命中**
- 源码系统仍在写入这些 token，例如 `src/systems/housing.js:41` `source: "rent_due"`、`src/systems/housing.js:89` `source: \`household:${row.householdId}\``、`src/systems/payroll.js:294` `destination: "construction_payroll"`

**用户可见后果**：账目表「缘由 / 去向」列显示 `rent_due → waived`、`household:h-3 → consumed`、`town → construction_payroll` 等内部标识，而非母版的「应收租金 → 减免」「第3户 → 消耗」「镇库 → 施工工资」。`src/ui/panel-ledger.js` 的 `LABELS` 字典只覆盖**记账类型**（左列 badge），不覆盖来源/去向。

---

## F-5 🟡 政策面板「家庭与商业」建筑门控丢失

**母版**（`master-lines.js:3291`，函数 `lz`）：

```js
let K = new Set(($.buildings || []).map(T => T.typeId)),
    L = K.has("commercial_street") || K.has("public_housing") || ($.shops || []).length > 0,
    B = L ? `<div class="cardlet"><h3>家庭与商业</h3>…</div>` : "";
```

即**无商业街、无公租房、无店铺时整卡不渲染**。

**源码现状**：`src/ui/panel-policy.js:28` 无条件渲染 `<details data-detail-key="policy-commerce"><summary>家庭与商业</summary>`，无任何条件判断。

---

## F-6 🟡 政策面板「民营生产税」建筑门控丢失

**母版**（`master-lines.js:3291`）：`M = [[mill,磨坊],[bakery,面包房],[lumberyard,伐木场],[saltworks,盐场]]`，`x = M.some(([T]) => K.has(T))`，`I = x ? … : ""` —— 四类建筑一个都没有时**整卡不渲染**。

**源码现状**：`src/ui/panel-policy.js:72` 无条件渲染 `<summary>民营生产税</summary>`。

---

## F-7 🟡 货币改革「建行前简化态」丢失

**母版**（`master-lines.js:3291`）：

```js
C = G.stage === "wheat" && !G.hasBankAccess
  ? '<div class="cardlet subtle">货币改革：建成银行后可启动。</div>'
  : `<div class="cardlet"><h3>货币改革</h3>…`
```

**源码现状**：`src/ui/panel-policy.js:22-27` 始终渲染完整 details。文案 `需先建成银行后才能启动。` 仍在 `:19`，但整卡简化文案 `货币改革：建成银行后可启动。` `grep -rn "建成银行后可启动" src/` → **0 命中**。

---

## F-8 🟡 居民主粮购买空态丢失

**母版**（`master-lines.js:3114`，函数 `Uz`）：

```js
Q = M.length ? M.map(...).join("")
             : '<div class="subtle">时光流动后显示当日购买情况。</div>'
```

**源码现状**：`src/ui/panel-trade.js:17` 直接 `.join("")`，无空态分支。`grep -rn "时光流动后显示当日购买情况" src/` → **0 命中**（母版 1 处）。

---

## F-9 🟡 设置面板「存储详情」标题丢失

**母版**（`master-lines.js:3395`，函数 `i3` 内的 `b_`）：

```js
<summary>${$ ? "存储故障详情" : "存储详情"}</summary>
```

**源码现状**：`src/ui/panel-settings.js:49` 硬编码 `<summary>存储故障详情</summary>`。无故障但存在存储统计时，母版显示「存储详情」，源码仍显示「存储故障详情」。`grep -rn "存储详情" src/` → 仅命中 `存储故障详情` 子串。

---

# 【内容缺失】

## C-1 🟠 地块标签人性化 `_2()` 缺失，建筑副标题退化为内部 id

**母版**（`master-lines.js:2968`）：

```js
function _2($, Z) {
  let z = ($.plots || []).find(N => N.id === Z.plotId)?.label;
  if (!z) return Z.id;
  return z.replace(/^空地\s*(\d+)$/, "$1号地").replace(/空地$/, "") || z;
}
```

母版共 **8 处**调用 `_2`，其中 **6 处是 UI 标题/卡片副标题**：

| 母版位置（`master-lines.js`） | 用途 | 母版显示 |
|---|---|---|
| `cz` 银行分支 | 地方详情标题 | `银行 · 3号地` |
| `cz` 批发市场分支 | 地方详情标题 | `批发市场 · 5号地` |
| `cz` 商业街分支 | 地方详情标题 | `商业街 · 7号地` |
| `cz` 公租房分支 | 地方详情标题 | `公租住宅区 · 9号地` |
| `cz` 普通建筑分支 | 地方详情标题 | `磨坊 · 3号地` |
| `mz`/`E_` 企业面板 | 公司成立卡片标题 | `磨坊 · 3号地` |
| `mz`/`T_` 企业面板 | 公司卡片标题 | `磨坊 · 3号地` |

**源码现状**：`grep -rn "号地" src/` → **0 命中**。源码在 5 处直接拼接内部 id：

| 文件:行 | 源码 | 母版对应 |
|---|---|---|
| `src/ui/panel-site.js:143` | `${building.name} · ${building.id}` | `${Q.name} · ${_2($,Q)}` |
| `src/ui/panel-site.js:147` | 同上 | 同上 |
| `src/ui/panel-site.js:187` | 同上 | 同上 |
| `src/ui/panel-site.js:217` | 同上 | 同上 |
| `src/ui/panel-site.js:221` | 同上 | 同上 |
| `src/ui/panel-business.js:35` | `${building.name} · ${building.id}` | `${X.name} · ${_2($,X)}` |

**用户可见后果**：标题显示 `磨坊 · building-3` 而非母版的 `磨坊 · 3号地`。（建筑实例 id 形如 `building-N`，见 `src/systems/construction.js:117`。）

**关联**：`src/content/world.js:15` 仍存 `label: "空地 " + n`（注意有空格），`src/content/world.js:23` 存 `label: "空地 22"` —— 与母版正则 `^空地\s*(\d+)$` 完全兼容，只是缺少 `_2()` 这一步渲染期替换。

**边界说明**：母版只在**面板标题**做改写；地图上的地块名文本（母版 `f_`）与当前 `src/ui/map.js:99,101` 一样保留「空地 N」，两边一致 —— 因此这是面板文案层差异，不是地图差异。

---

## C-2 🟡 账目面板：`rent_due` 等账户名无中文映射

见 **F-4**。单独列出是因为它同时属于内容缺失：母版字典里 `镇库`/`居民`/`居民家庭`/`批发市场`/`麦田`/`消耗`/`损耗`/`印制`/`民营生产`/`工资计提`/`未付`/`减免`/`应收租金`/`施工工资`/`建设投入` 共 **15 个中文条目**在当前源码中**一条都没有**。

---

## C-3 🟡 母版独占文案（已逐条 grep 确认源码 0 命中）

| 母版文案 | 母版位置 | 语义 | 源码现状 |
|---|---|---|---|
| `已从批发市场补货` | 采购结果 reason | 企业原料补货成功回执 | 0 命中；`src/systems/wholesale-market.js:593` 用 `"从批发市场采购"` |
| `家庭已有这批库存` | 家庭间转卖校验 | 自我交易拒绝理由 | 0 命中（`src/systems/households.js:566` 是另一条 `"居民家庭可支配粮券不足"`） |
| `镇营生产当日产出进入批发市场` | 调拨记账 reason | 镇营产出入市 | 0 命中（`src/systems/wholesale-market.js:497` 用 `"镇营生产从批发市场领用原料"`，语义相反） |
| `镇营建造从批发市场领用${name}` | 施工采购 reason | 施工材料入市 | 0 命中（母版 1 处） |
| `农业家庭分粮失败：` | 收获分粮异常 | 抛错前缀 | 0 命中；`src/systems/agriculture.js` 用 `收获分粮失败（${reason}）` 形式 |
| `再次点击确认清算` / `再次点击确认清算；居民股份或工资债务未清时会被拒绝。` | 公司清算二次确认 | 双击确认交互 | 0 命中（`grep -rn "confirmLiquidate" src/` → 0） |
| `查看${name}，${status.label}` / `选择${label}开工` / `查看${x} ${percent}%` | aria-label 无障碍标签 | 地图站点可访问名 | 0 命中（母版多处，源码未移植这批 aria-label） |

---

# 【文案差异】

## T-1 🟡 「支付媒介不产生利润」被改写并弱化

- **母版**（`master-lines.js:3280`，函数 `uz` 顶部）：`${D(Z4($))}；经营收入、成本与利润一律按小麦等值核算，支付媒介不产生利润。`
- **源码**：`src/ui/panel-business.js:52` → `利润按小麦等值核算；${moneyMixHint(view)}。支付媒介变化不改变利润。`
- **差异**：① 主语由「经营收入、成本与利润」缩为「利润」；② **「不产生利润」→「不改变利润」**（语义弱化：前者说媒介本身不创造价值，后者只是说不影响）；③ 丢失母版 `Z4($)` 摘要前缀句（如「新交易以粮券结算」）。

## T-2 🟡 账目/收支 subtle 插入 `moneyMixHint` 并改标点

- **母版**（`master-lines.js:3161`，函数 `yz`）：`货币收支按小麦等值汇总，实际小麦与粮券支付可在账目中逐笔查看。`（**逗号**）
- **源码** `src/ui/panel-flows.js:30`：`货币收支按小麦等值汇总；${moneyMixHint(view)}。实际小麦与粮券支付可在账目中逐笔查看。`（**分号 + 插入子句**）
- **母版**（`master-lines.js:3134`，函数 `gz`）：`工资、失业金、租金、商品和股份交易按实际支付媒介分别记账；…`
- **源码** `src/ui/panel-ledger.js:43`：在母版原文**之前前置插入** `${moneyMixHint(view)}。`

## T-3 🟡 救济 details 内 banner 与邻里互助顺序颠倒

- **母版**（`master-lines.js:3291`，函数 `lz`）顺序：`需救济 / 已拨家庭` → `今日正常兑付 / 救济` → **`镇库不足，尚缺 …斤口粮` banner** → **邻里互助两行 + subtle**
- **源码** `src/ui/panel-policy.js:71` 顺序：需救济 → 今日正常兑付 → **邻里互助两行 + subtle** → **banner 置于最末**
- 文案本身逐字一致，仅渲染顺序不同。

## T-4 🟡 建设页「预计…天完工」措辞

- **母版**：`预计${V(M.estimatedDays)}天完工`
- **源码** `src/ui/panel-build.js:82`：`预计${number(planned.estimatedDays)}天完工` ✅ **一致**；但同文件 `:59` 的折叠摘要用 `约${number(option.constructionCrewDays)}天 / …`，与母版 `Cz` 的 `约${V(N.constructionCrewDays)}天` 一致 ✅。

> 说明：本条经复核**不构成差异**，保留在此以记录已核对项。

## T-5 🟡 经营面板折叠标题与内容标题不一致（母版无此问题）

- **母版**：`t5("bread-trade","居民主粮购买", Uz($))`，`Uz` 内部 `<h2>居民主粮购买</h2>` —— 折叠标题与内容标题**一致**。
- **源码** `src/ui/panel-economy.js:21`：`detail("bread-trade", "面包交易与调价", renderTrade(view))`，而 `src/ui/panel-trade.js:14` 内部仍输出 `<h2>居民主粮购买</h2>` —— 折叠时显示「面包交易与调价」，展开后标题变成「居民主粮购买」。

## T-6 🟡 居民主粮购买新增两条 subtle

- **母版**（`master-lines.js:3114`，函数 `Uz`）：只有每行自身的 `_.limitReason`，无整体 `trade.limitReason`、无 moneyMixHint。
- **源码** `src/ui/panel-trade.js:18`：额外输出 `${trade.limitReason}` 与 `${moneyMixHint(view)}。`

---

# 【已核对：母版有且源码已逐字继承】（非缺失，供验收参考）

为避免误判，以下母版内容已逐行核对确认**已存在且逐字一致**，不计入缺失：

- **政策面板** `lz`（`master-lines.js:3291`）：农业税（当前税率 / 预计秋收分粮 / 上次秋收实际）、工资与福利（作坊建筑日薪 / 失业金 toggle / 每名待业者每日 / 符合-已覆盖-未覆盖 / 应发-实发 / 今日少发 banner）、救济（需救济-已拨家庭 / 今日正常兑付-救济 / 缺口 banner / 今日邻里互助 / 本年邻里接济 / 接济规则 subtle）、家庭与商业（营业店铺日租 / 商业利润税 / 今日住宅实收租金 / 最近店铺利润税）、民营生产税 4 项编辑器、货币改革、政策详情 4 字段 → `src/ui/panel-policy.js`
- **经营面板** `uz`（`:3280`）及各子块：口粮（居民可吃 / 每日需要 / 自动救济 / 拨粮 / 口粮短缺 banner）、居民主粮购买 `Uz`、林业盐业住房 `vz`、镇营作坊账 `Iz`、账目与历史交易 `gz`（42 行表 + 上年汇总）、本年收支明细 `yz`（居民 6 行 + 镇库 7 行）→ `src/ui/panel-economy.js`、`panel-industries.js`、`panel-business.js`、`panel-ledger.js`、`panel-flows.js`
- **地方详情** `cz`（`:3363`）与建筑管理 `$$`（`:3369`）：麦田/粮仓/村舍/古井/资源点分支、开荒 `j_`（`:3354`，含开荒账目 details）、银行 `pz`（`:3331`，含印制/注销确认、过渡进度、结束过渡期）、商业街（商人店员 steppers / 服务能力 / 零售库存 / 学费 / 饭店规则 / 未成交没钱-容量不足 / 增1店员能力-招工判断 / 可支付资金 / 今日收入成本利润 / 欠薪欠租欠税 / 停业-补资清偿 / 6 个开店按钮）、公租房、普通建筑（全镇需求-在岗-缺员 / 今日产量 / 预计每日工资 / 新增欠薪 / 镇营排班 / 镇营目标日产量 / 日薪 / 产权详情 / 民营区块 / 经营权估值详情）、施工中、升级预览/施工中/拆除确认 → `src/ui/panel-site.js`
- **建设面板** `Cz`（`:3063`）：开工确认页（地块 / 预计工期 / 预计工资 / 所需材料 / 材料已备齐 / 确认开工）、已有建筑、在建工程、生产方式（磨坊 100斤小麦→80斤面粉；面包房 100斤面粉→120斤面包）→ `src/ui/panel-build.js`（0.2.2 起增加分类页签，属有意改版）
- **镇民面板** `jz`（`:3106`）：家庭生活（全镇舒心值 / 缺粮缺盐住房欠薪 / 生活状况 / 今日剩余换券额度 / 分类 mini-stats / 家庭卡近期收支）、就业 `Pz`、人口 `kz`（年龄条 / 失业率卡 / 贫富分布 / 人口住房 / 上年人口变化）→ `src/ui/panel-residents.js`、`panel-jobs.js`、`panel-people.js`
- **设置/存档** `i3`（`:3395`）：存档槽卡（读取/导出/重命名/删除）、另存为、导入、新游戏、IndexedDB 存档列表、遗留 localStorage 清理、存储恢复、当前运行版本 → `src/ui/panel-settings.js`（仅 F-9 一处标题差异）
- **地图外壳**：资源条（人口/待业/居民/镇库）、时间控制（停/1×/4×/16×/设置）、季节缎带、`秋收预估 …斤 / 口粮可吃 …天`、地图提示、缩放按钮、舆图小地图（`town-minimap` / `townMini` / `miniViewport` / `点击舆图定位地图`）、事件气泡 → `src/ui/shell.js`、`map.js`、`jiangnan-art.js`、`map-camera.js`、`app.js`
- **规则常量** `RULES`：母版 212 个键**全部存在**于 `src/content/rules.js`，仅 2 处取值不同 ——
  - `generalStoreCustomersPerStaff`：母版 `40` → 源码 `60`（`src/content/rules.js:100`，注释写明「基线清理：从40提到60」，属有意调参，**非缺失**）
  - `shopTypes.general.itemIds`：母版 `["flour","bread","wood","salt"]` → 源码 `["flour","bread","salt","wood"]`（仅顺序）
- **物品/建筑**：`ITEMS` 五类（小麦/面粉/面包/木材/食盐）与母版逐字一致；`src/content/buildings.js` 11 类母版建筑全部存在且 `description` 逐字一致，另**新增** `villa_complex`（别墅群，0.2.x 新增）
- **事件文案**：母版 **28 条**事件正文在当前源码**逐字全部命中**（开荒、开店、清算、挖人、公司成立/清算/认购、动工/扩建/落成、镇长拨粮、镇库紧急拨粮、邻里接济、欠薪、口粮短缺、麦收入仓、年度人口、岗位释放、岗位调整、房屋修缮、三个节气、扩建、拆除、经营权、挂牌、回购）—— 缺的只是 F-1/F-2 的**合并机制**与聚合句，不是基础文案

**母版没有、源码新增的**（不计入缺失）：外镇贸易（四地主镇/蝗灾/丰收/山匪/盐荒）、别墅群与房产税、社保基金、商店动态加价与促销、批发市场做市商与注资、公司/上市/交易所扩展、分类页签、`moneyMixHint` 等。

---

# 修复优先级建议

| 优先级 | 项 | 影响面 |
|---|---|---|
| P0 | **F-1 + F-2** 在 `src/economy/ledger.js:17` 补回 `mergeKey/mergeWindowDays/amount/mergedText/mergeCount/mergeAmount/untilDay`，并在 `src/ui/app.js:249` 补 `untilDay` 渲染 | 事件系统核心；3 处死参数 + 3 处漏传；需同步存档字段（`||=` 初始化，SAVE_VERSION 保持 v15） |
| P0 | **F-3** 补回批发市场 `history` 快照 / `ZM` 7日均售 / `zM` trends / 面板 3 行 + 双 sparkline | 批发市场是 0.2.3 核心系统，缺的是其库存周转可观测性 |
| P1 | **F-4 / C-2** 补回 `D_()` 账户名解析字典（15 条中文 + 4 类前缀） | 账目面板对所有玩家可见，当前显示内部 token |
| P1 | **C-1** 补回 `_2()` 并替换 `panel-site.js:143/147/187/217/221` 与 `panel-business.js:35` 的 `${building.id}` | 6 处标题显示内部 id |
| P2 | **F-5 / F-6 / F-7** 政策面板 3 处门控与简化态 | 无建筑时显示不该显示的卡片 |
| P2 | **T-1** 「支付媒介不产生利润」文案与 `Z4()` 前缀 | 政策语义表达 |
| P3 | **F-8 / F-9 / T-2 / T-3 / T-5 / T-6 / C-3** 空态、标题、顺序、新增 subtle | 细节体验 |

---

*本清单由独立对比审计生成，未修改任何源码、未触碰母版文件。所有「源码现状」均可用文中给出的 `grep`/文件行号复现。*
