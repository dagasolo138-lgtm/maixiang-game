# 麦乡 · AGENTS.md

给 AI 开发者的项目速览。读完这个再动手，能省掉约 20 分钟的代码探索。

## 项目是什么

麦乡：单文件网页模拟经营游戏。小麦小镇，镇长视角，核心是**政策模拟**——调一个参数看全镇连锁反应（工资→物价→利润→挖人，全链联动）。

- 源码：ES 模块，`src/` 约 110 个模块
- 构建：`scripts/bundle-single.mjs` → `dist-single/maixiang-<版本>.html`（1.2MB 单文件，**构建产物，不要直接改**）
- 模拟：`scripts/simulate.mjs`（场景 JSON → 指标 CSV，10 年约 60 秒）
- 测试：`node --test tests/`

## 核心概念（名词对照）

| 概念 | 说明 |
|---|---|
| 小麦（斤） | 价值尺度，一切价格以小麦斤计价 |
| 粮券 | 货币；`券≈斤`口径，数值上可互换理解 |
| 镇库 | 镇财政，收税、发救济、战略小麦储备 |
| 货币阶段 | 小麦阶段（实物）→ 粮券阶段（货币改革完成后）；很多逻辑按阶段分叉 |
| 批发市场 | 流通枢纽；0.2.3 起是做市商（收购价/售价表）+ 镇营统购统销结算中心 |
| 综合商店 | 主零售；0.2.3 起动态加价（目标利润率 20%，7 天复核） |
| 镇营建筑 | 镇办企业（农田/磨坊/面包店/木材厂/盐矿）；工资受双系数调控 |
| 民营 / 公司 / 上市公司 | 依次升级的私有经济形态 |

关键系统：`labor-market.js`（动态劳动力市场：商店按行情调薪、挖人跳槽）、`payroll.js`（工资双系数）、`neighbor-aid.js`（邻里互助）、`wholesale-market.js`、`social-security.js`（社保基金）、`outside-town.js`（外镇贸易）。

## 铁律（违反必返工）

1. **存档兼容**：新字段一律 `||=` 初始化，`SAVE_VERSION` 保持 v15。版本号单处定义在 `src/content/version.js`。
2. **测试零新增失败**：基线 275 用例 / 25 个历史失败（面包/盐/磨坊等遗留），逐名对照，新增 1 个都不行。
3. **selector 只读不写**：读数据的选择器里顺手写状态是重灾区（已出过两次 bug）。
4. **`validateState` 全绿**：任何模拟/冒烟必须过；禁 NaN / Infinity / 负钱负粮。
5. **发版流程**：实现 → 测试+模拟验证 → 打包验证（`node --check` + 30 天 headless 冒烟）→ Kavi 逐 diff 验收 → 发版。**不要动构件、不要碰云端存档。**

## 目录速查

- `src/systems/` — 日循环、生产、消费、就业、救济等核心系统
- `src/ui/` — 面板（`panel-*.js`）、地图、壳
- `src/content/` — 物品/建筑/规则/版本号等静态内容
- `src/core/` — engine、commands、state
- `src/economy/` — 货币、支付、价格
- `src/selectors/` — 只读派生数据
- `src/persistence/` — 存档、迁移
- `scripts/`、`tests/`、`scenarios/`、`docs/` — 字面意思

## 常见坑（前人踩过）

- 小麦阶段居民直接从镇库买主粮，**不经过**批发市场/商店——给批发市场写验证场景时必须先推进到粮券阶段、开商店，不然零销售是场景问题不是 bug。
- 镇营施工（`construction.js`）需要木材，缺口从批发市场采购——**要付钱**，别写成白嫖（2026-10-05 真出过）。
- 小麦归镇库直管，不做市：`WHOLESALE_MONOPOLY_ITEM_IDS`（面粉/面包/木材/盐）才是可买卖清单，`WHOLESALE_ITEM_IDS`（含小麦）只用于库存/调拨。市场不挂小麦收购价/售价、不收购小麦；但公司/民营仍可按镇库价买小麦当原料（0.1.1 面包链不断），镇营磨坊走免费内部调拨。综合商店只卖面粉/面包/盐/木材（居民小麦零售走镇库直接购买）。面板渲染的商品清单别手写硬编码，要和可买卖清单保持一致（2026-10-05 hotfix 教训：面板写死五商品，逻辑说小麦直管，两边打架）。
- `payDailyWages` 里欠薪循环和当期循环的付款主体要一致。
- 老存档迁移（`normalizeV15`）的价格/字段口径优先保留存档值，别被新默认值覆盖。
- 按钮点击逻辑放 click 分支，别塞进 change 处理器（2026-10-05 真出过：建设页签点不动）。
- `/tmp` 会被运行时不定期清空，重要中间文件放 `~/workspace/` 下。

## d2 可用工具（除 bash/读写文件外）

- 联网搜索：`~/workspace/skills/deepseek/bin/tavily_search.py --query "..." [--max-results 5]`（走用户自带 Tavily key，直接调，不用问）
- 发版前必跑：`node --test tests/`、`node scripts/simulate.mjs`、`scripts/bundle-single.mjs` + `node --check` + 30 天 headless 冒烟
- Git：本仓库 remote 配好（PAT 在系统 git 凭据里），可直接 `git push` 推分支；**推 main 前必须经 Kavi 验收**

## 版本

当前：0.2.3 开发中（流通改革）。历史版本见 `CHANGELOG.md`。
GitHub：`dagasolo138-lgtm/maixiang-game`（main 分支）。一个需求一个分支，PR 交付，Kavi 验收。

## 基线清零教训（2026-10-05 深夜，Kavi 亲自修）
- 无批发市场时 `buyWholesaleForOwner` 回退到镇库直购（`buyTownDirectForOwner`）：多卖家聚合，镇库优先、不足时从其他住户买（小麦保留对方口粮，面粉等加工品不保留），返回 sellerRows。0.1.10 契约"生产原料优先从镇库供应"。
- 镇库从批发市场付费采购（`procureTownInputFromWholesale` 非免费品类）必须真实入库到 `state.accounts.town`，否则镇库付钱收不到货（BUG A，木材）。
- 镇营建造从市场领料走免费内部调拨（`allocateInputToTown`），不用 `procureTownInputFromWholesale`（后者对木材收费，与"不重复收费"注释矛盾）。
- `townMillWheatDemandUnits` 要算上市（listedLevels>0）的磨坊，否则公司磨坊永久断小麦。
- 面粉/面包/盐 `generalStoreOnly` 是既定设计（0.2.2 起）：镇库/公司/住户不得直售居民，只能经综合商店。测试 fixture 须建商店。
- 住户换券的粮券由"镇库现有余额支付"，测试须先 `issueGrainVouchers(state,"town",N)` 印制。
