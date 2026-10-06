function jz($){let Z=$.households?.living?.counts||{困难:0,温饱:0,富裕:0},z=$.households?.issueCounts||{},N=($.households?.categories||[]).map((_)=>`<span class="mini-stat">${D(_.name)} <b>${V(_.households)}户</b>${_.satisfaction==null?"":` · ${V(_.satisfaction,1)}`}</span>`).join(""),Q=($.households?.details||[]).filter((_)=>_.issues?.length).sort((_,f)=>_.satisfaction-f.satisfaction).slice(0,8).map((_)=>`<div class="cardlet"><div class="row"><span class="label">${D(_.name)} · ${V(_.people)}人</span><strong class="value">舒心 ${V(_.satisfaction,1)}</strong></div><div class="subtle">${_.issues.map(D).join(" · ")}</div><div class="row"><span class="label">口粮 / 粮券</span><strong class="value">${V(_.foodDays,1)}日 / ${V(_.voucher,1)}券</strong></div><details class="detail-block" data-detail-key="family-${D(_.id)}"><summary>近期收支</summary><div class="detail-body"><div class="row"><span class="label">实际到账 / 生活支出</span><strong class="value">${V(_.recent.incomeVoucher,1)} / ${V(_.recent.lifeExpenseVoucher,1)}小麦等值</strong></div><div class="row"><span class="label">实物收入 / 吃掉口粮</span><strong class="value">${V(_.recent.inKindIncomeJin,1)} / ${V(_.recent.foodConsumedJin,1)}斤</strong></div><div class="row"><span class="label">应付工资 / 实发</span><strong class="value">${V(_.recent.wageDueVoucher,1)} / ${V(_.recent.wagePaidVoucher,1)}小麦等值</strong></div><div class="row"><span class="label">投资</span><strong class="value">${V(_.recent.investmentVoucher,1)}小麦等值</strong></div></div></details></div>`).join("");return`<section class="panel-section"><h2>家庭生活</h2>
    <div class="cardlet"><div class="row"><span class="label">全镇舒心值</span><strong class="value">${V($.satisfaction,1)} / 100 · ${$.households?.satisfactionChange>=0?"+":""}${V($.households?.satisfactionChange||0,1)}</strong></div>
      <div class="row"><span class="label">缺粮 / 缺盐 / 住房不足 / 欠薪</span><strong class="value">${V(z.food||0)} / ${V(z.salt||0)} / ${V(z.housing||0)} / ${V(z.wage||0)}户</strong></div>
      <div class="row"><span class="label">生活状况</span><strong class="value">困难${V(Z.困难)} · 温饱${V(Z.温饱)} · 富裕${V(Z.富裕)}</strong></div>
      <div class="row"><span class="label">今日剩余换券额度</span><strong class="value">${V($.households?.exchangeRemainingJin||0,2)}斤</strong></div>
      <div class="mini-stats">${N}</div><div class="subtle">职业相关家庭允许重叠；这里按户观察，不把分类人数相加当作全镇人口。</div>
    </div>${Q||'<div class="cardlet"><div class="subtle">当前没有突出的家庭生活问题。</div></div>'}</section>
    <section class="panel-section">${Pz($)}</section>
    <section class="panel-section">${kz($)}</section>`}var L_={wheat:"小麦",flour:"面粉",bread:"面包"};function Uz($){let Z=w0($),z=$.market.trade?.staples||{},N=z.shares||{wheat:0.6,flour:0.2,bread:0.2},M=(z.rows||[]).filter((_)=>_.itemId!=="wheat"),Q=M.length?M.map((_)=>`<div class="row"><span class="label">${L_[_.itemId]||D(_.itemId)} 目标 / 买到</span><strong class="value">${V(_.targetQeqJin)} / ${V(_.purchasedJin,1)}斤 · 付${V(_.paidVoucher,1)}${Z}</strong></div>${_.purchasedJin<=0&&_.limitReason?`<div class="subtle">${D(_.limitReason)}</div>`:""}`).join(""):'<div class="subtle">时光流动后显示当日购买情况。</div>';return`<h2>居民主粮购买</h2>
    <div class="cardlet">
      <div class="row"><span class="label">居民 / 镇库面包库存</span><strong class="value">${V($.market.residentBreadJin)} / ${V($.market.townBreadJin)}斤</strong></div>
      ${Q}
    </div>
    <details class="detail-block" data-detail-key="bread-rules"><summary>购买规则</summary><div class="detail-body"><div class="subtle">居民每天按口粮占比补足主粮：小麦${V(N.wheat*100)}%、面粉${V(N.flour*100)}%、面包${V(N.bread*100)}%。家里已有的先算进去；小麦直接向镇库和有余粮的人家买；面粉、面包、食盐、木材在商业街综合商店买，零售价为批发价×1.2。</div></div></details>`}function f2($,Z){return($||0)/Z}function Sz($,Z,z){return Object.entries($||{}).filter(([,M])=>M>0).map(([M,Q])=>`${D(Z[M]||M)} ${V(f2(Q,z))}斤`).join(" · ")||"暂无产出"}function d3($,Z){let z=Z.inventoryUnitsPerJin,N=f2($.revenueWheatUnits,z),M=f2($.breadCogsWheatUnits,z),Q=f2($.processingLossWheatUnits,z),_=f2($.operatingWagesWheatUnits,z),f=f2($.rawInputCostWheatUnits,z);return{revenue:N,cogs:M,waste:Q,wages:_,rawInputCost:f,profit:N-M-Q-_}}function Iz($){let Z=w0($),z=$.market.business,N=d3(z.day,$),M=d3(z.year,$),Q=d3(z.cumulative,$),_=$.inventoryUnitsPerJin,f=f2(z.cumulative.constructionWagesWheatUnits,_),O=Q.profit-f,Y=Object.entries($.accounts.town.items).filter(([,X])=>["wheat","flour","bread"].includes(X.itemId)).map(([,X])=>`${D(X.name)} ${V(X.quantity)}斤`).join(" · "),G=$.buildings.filter((X)=>X.typeId==="mill"||X.typeId==="bakery").map((X)=>{let q=X.jobs.reduce((K,L)=>K+L.workers,0),J=X.jobs.reduce((K,L)=>K+L.capacity,0),W=$.payroll?.lastDay?.workers?.find((K)=>K.buildingId===X.id)?.unpaidCurrentWheatJin||0;return`<div class="cardlet"><div class="row"><strong>${D(X.name)} · ${D(_2($,X))}</strong><span class="badge">${D(X.status.label)}</span></div>
      <div class="row"><span class="label">人数</span><strong class="value">${V(q)} / ${V(J)}人</strong></div>
      <div class="row"><span class="label">今日产量</span><strong class="value">${Sz(X.jobs[0]?.outputToday,$.itemNames,_)}</strong></div>
      ${W>0?`<div class="shortage-banner visible">新增欠薪 ${V(W)}${Z}</div>`:""}</div>`}).join("");return`<h2>镇营作坊</h2>
    <div class="cardlet"><div class="row"><span class="label">今日产量</span><strong class="value">${Sz(z.day.producedUnits,$.itemNames,_)}</strong></div>
      <div class="row"><span class="label">面包销量 / 已收入</span><strong class="value">${V(f2(z.day.soldBreadUnits,_))}斤 / ${V(N.revenue)}${Z}</strong></div>
      <div class="row"><span class="label">今日利润</span><strong class="value">${V(N.profit,1)}${Z}</strong></div>
      <div class="row"><span class="label">镇库库存</span><strong class="value">${Y}</strong></div></div>
    <h3>各座作坊</h3>${G||'<div class="cardlet subtle">暂无完工作坊。</div>'}
    <details class="detail-block" data-detail-key="workshop-costs"><summary>成本与累计数据</summary><div class="detail-body">
      <div class="row"><span class="label">今日成本</span><strong class="value">已售${V(N.cogs)} · 损耗${V(N.waste)} · 工资${V(N.wages)}${Z}</strong></div>
      <div class="row"><span class="label">原料投入折算</span><strong class="value">${V(N.rawInputCost)}${Z}</strong></div>
      <div class="row"><span class="label">本年收入 / 利润</span><strong class="value">${V(M.revenue)} / ${V(M.profit,1)}${Z}</strong></div>
      <div class="row"><span class="label">累计利润 - 建设工资</span><strong class="value">${V(O,1)}${Z}</strong></div>
      <div class="row"><span class="label">面粉 / 面包库存成本</span><strong class="value">${V(f2(z.inventoryCostWheatUnits.town.flour,_))} / ${V(f2(z.inventoryCostWheatUnits.town.bread,_))}${Z}</strong></div>
    </div></details>`}var K_={harvest:"收获",consume:"消耗",relief:"救济",wage:"工资",construction:"建设",process_input:"加工投入",process_output:"加工产出",process_loss:"加工损耗",processing_loss:"加工损耗",wage_expense:"工资计提",wage_payment:"当期工资发放",wage_arrears_payment:"偿还欠薪",wage_prepaid_credit:"旧预付工资抵扣",unemployment_benefit:"失业金发放",unemployment_shortfall:"失业金未足额",construction_material:"施工材料",rent_payment:"租金转账",rent_waiver:"租金减免",salt_consume:"食盐消费",market_trade:"物资买卖",construction_prepaid_remainder:"建设预付款留存",voucher_issue:"粮券印制",voucher_exchange:"粮食换券",voucher_redeem:"粮券注销/兑回",enterprise_capital_injection:"企业营运资金",enterprise_material_contribution:"企业实物投入",enterprise_input_payment:"企业原料采购",enterprise_sale:"企业销售",enterprise_dividend:"企业分红",enterprise_annual_distribution:"企业年度利润分配",enterprise_production_tax:"企业实物税",operating_right_sale:"经营权交易",transfer:"转账",deposit:"入库",withdrawal:"出库",legacy_consume:"旧版消耗",legacy_process:"旧版加工",legacy_loss:"旧版损耗",legacy_transfer:"旧版转账"},bz={town:"镇库",residents:"居民",households:"居民家庭",wholesale_market:"批发市场",field:"麦田",consumed:"消耗",consumption:"消耗",loss:"损耗",currency_issuer:"印制",private_production:"民营生产",wage_expense:"工资计提",unpaid:"未付",waived:"减免",rent_due:"应收租金",construction_payroll:"施工工资",construction_investment:"建设投入"};function D_($,Z){if(!Z)return"";if(bz[Z])return bz[Z];let[z,...N]=String(Z).split(":"),M=N.join(":");if(z==="household")return $.householdNames?.[M]||(/^household-(\d+)$/.test(M)?`第${M.slice(10)}户`:M);if(z==="shop")return($.shops||[]).find((Q)=>Q.id===M)?.name||"店铺";if(z==="company")return($.companies||[]).find((Q)=>Q.id===M)?.name||"公司";if(z==="building")return($.buildings||[]).find((Q)=>Q.id===M)?.name||"建筑";return Z}function gz($){let Z=$.annualReports.at(-1),z=$.ledger.slice(0,42).map((G)=>{let X=K_[G.type]||"记账",q=G.itemId==="grain_voucher",J=q?"粮券":G.itemId?$.itemNames[G.itemId]||G.itemId:"口粮当量",F=q?"券":G.itemId?$.itemUnits[G.itemId]||"斤":"口粮斤",W=G.quantityUnits&&G.itemId?G.quantityUnits/(q?$.currencyUnitsPerVoucher:$.inventoryUnitsPerJin):(G.qeqUnits||0)/$.qeqUnitsPerJin,K=[G.source,G.destination].filter(Boolean).map((L)=>D_($,L)).join(" → ");return`<tr><td>第${V(G.year)}年·${V(G.day)}日</td><td><span class="badge${["consume","process_loss","withdrawal","salt_consume","rent_waiver"].includes(G.type)?" red":""}">${X}</span><br>${D(J)} · ${D(G.reason||"")}<div class="subtle">${D(K)}${G.legacyDetail?" · "+D(G.legacyDetail):""}</div></td><td class="amount">${V(W)}${D(F)}</td></tr>`}).join(""),N=$.yearTotals,M=$.payroll?.year||{},Q=$.currencyUnitsPerVoucher,_=(M.accruedVoucherUnits||0)/Q,f=(M.paidVoucherUnits||0)/Q,O=(M.unemploymentPaidVoucherUnits||0)/Q,Y=Object.values($.payroll?.arrearsVoucherUnits||{}).reduce((G,X)=>G+X,0)/Q;return`<h2>粮食与粮券账目</h2>
    <div class="cardlet"><div class="row"><span class="label">居民账（口粮当量）</span><strong class="value">${V($.accounts.residents.qeq)} 斤</strong></div><div class="subtle">${w3($.accounts.residents)}</div><div class="row" style="margin-top:10px"><span class="label">镇库账（口粮当量）</span><strong class="value">${V($.accounts.town.qeq)} 斤</strong></div><div class="subtle">${w3($.accounts.town)}</div><div class="row" style="margin-top:9px;padding-top:8px;border-top:1px solid #eee9db"><span class="label">全镇可食口粮合计</span><strong class="value">${V($.totalQeq)} 斤</strong></div><div class="subtle">居民每日消费${V($.dailyNeed)}斤；口粮${Q2($.residentFoodDays,1)}天。</div></div>
    <h3>本年收支（已过${V($.day)}天）</h3>
    <div class="cardlet"><div class="row"><span class="label">收成入库</span><strong class="value">${V(N.harvest)}斤小麦</strong></div><div class="row"><span class="label">居民口粮消费</span><strong class="value">${V(N.consumption)}口粮斤</strong></div><div class="row"><span class="label">镇营/施工工资计提 · 已付</span><strong class="value">${V(_)} / ${V(f)}小麦等值</strong></div><div class="row"><span class="label">累计欠薪余额 / 本年失业金</span><strong class="value">${V(Y)} / ${V(O)}小麦等值</strong></div><div class="row"><span class="label">实物救济 / 加工损耗</span><strong class="value">${V(N.relief)}斤小麦 / ${V(N.processingLoss)}斤</strong></div><div class="subtle">工资、失业金、租金、商品和股份交易按实际支付媒介分别记账；农业税、救济口粮和生产税仍按实物记账。粮券先由镇库印制，镇库粮券可自由支出；换券时交出的小麦直接进入镇库，不设独立兑付储备。</div></div>
    ${Z?`<h3>上一年汇总 · 第${V(Z.year)}年</h3><div class="cardlet"><div class="row"><span class="label">年初至年末人口</span><strong class="value">${V(Z.populationAtClose)} → ${V(Z.populationAfterAging)}</strong></div><div class="row"><span class="label">出生 / 死亡</span><strong class="value">${V(Z.births)} / ${V(Z.deaths)} 人</strong></div><div class="subtle">显示上一年人口汇总。</div></div>`:""}
    <h3>最近账目</h3><div class="ledger-list"><table class="ledger-table"><thead><tr><th>日期</th><th>缘由 / 去向</th><th style="text-align:right">数量</th></tr></thead><tbody>${z||'<tr><td colspan="3">尚无账目。</td></tr>'}</tbody></table></div>`}function L5($,Z,z){return V(($||0)/Z,2)+z}function vz($){let Z=w0($),z=$.inventoryUnitsPerJin,N=$.industries.forestry,M=$.industries.salt,Q=$.housing.rentFiscal,_=Q.year.collectedWheatUnits||0,f=M.year.revenueWheatUnits||0,O=M.year.operatingWagesWheatUnits||0,Y=f-O,G=$.housing.rentals.map((X)=>`<div class="row"><span class="label">${D(X.name)}入住 / 空位</span><strong class="value">${V(X.occupied)} / ${V(X.vacancies)}人</strong></div>`).join("");return`<h2>林业、盐业与住房</h2>
    <div class="cardlet">
      <div class="setting-title">资源</div>
      <div class="row"><span class="label">木材 · 居民 / 镇库</span><strong class="value">${V($.accounts.residents.items.wood.quantity)} / ${V($.accounts.town.items.wood.quantity)}单位</strong></div>
      <div class="row"><span class="label">食盐 · 居民 / 镇库</span><strong class="value">${V($.salt.residentStockJin,2)} / ${V($.salt.townStockJin,2)}斤</strong></div>
      <div class="row"><span class="label">今日伐木 / 采盐</span><strong class="value">${L5(N.day.producedUnits.wood,z,"单位")} / ${L5(M.day.producedUnits.salt,z,"斤")}</strong></div>
    </div>
    <div class="cardlet">
      <div class="setting-title">食盐</div>
      <div class="row"><span class="label">今日需求 / 满足</span><strong class="value">${V($.salt.todayDemandJin,2)} / ${V($.salt.todaySatisfiedJin,2)}斤</strong></div>
      <div class="row"><span class="label">近30日保障率</span><strong class="value">${V($.salt.historyCoverage*100,1)}%</strong></div>
      <div class="row"><span class="label">今日销量 / 已收入</span><strong class="value">${L5(M.day.soldUnits,z,"斤")} / ${L5(M.day.revenueWheatUnits,z,Z)}</strong></div>
      <div class="row"><span class="label">本年利润</span><strong class="value">${L5(Y,z,Z)}</strong></div>
    </div>
    <div class="cardlet">
      <div class="setting-title">住房</div>
      <div class="row"><span class="label">容量 / 缺口</span><strong class="value">${V($.housing.capacity)} / ${V($.housing.shortage)}人</strong></div>
      ${G||'<div class="subtle">暂无公租房。</div>'}
      <div class="row"><span class="label">今日实收 / 减免</span><strong class="value">${V($.housing.lastRentDay?.collectedWheatJin||Q.day.collectedWheatUnits/z)} / ${V($.housing.lastRentDay?.waivedWheatJin||Q.day.waivedWheatUnits/z)}${Z}</strong></div>
      <div class="row"><span class="label">本年租金</span><strong class="value">${L5(_,z,Z)}</strong></div>
    </div>`}function e5($,Z,z,N){return Object.entries($||{}).filter(([,M])=>M>0).map(([M,Q])=>`${Z[M]||M} ${V(Q/N)}${z[M]||"单位"}`).join(" · ")||"无"}function yz($){let Z=$.financialFlows?.year||{},z=Z.residents||{},N=Z.town||{},M=$.inventoryUnitsPerJin;return`<section class="panel-section"><h2>本年收支</h2>
    <div class="cardlet"><h3>居民</h3>
      <div class="row"><span class="label">农业分粮</span><strong class="value">${V(z.agricultureWheatUnits/M)}斤小麦</strong></div>
      <div class="row"><span class="label">工资 / 建筑工钱 / 失业金</span><strong class="value">${V(z.wagesWheatUnits/M)} / ${V(z.constructionWagesWheatUnits/M)} / ${V(z.unemploymentWheatUnits/M)}小麦等值</strong></div>
      <div class="row"><span class="label">面包 / 食盐</span><strong class="value">${V(z.breadPurchaseWheatUnits/M)} / ${V(z.saltPurchaseWheatUnits/M)}小麦等值</strong></div>
      <div class="row"><span class="label">经营权 / 房租</span><strong class="value">${V(z.operatingRightWheatUnits/M)} / ${V(z.rentWheatUnits/M)}小麦等值</strong></div>
      <div class="row"><span class="label">口粮消费</span><strong class="value">${V(z.consumptionQeqUnits/$.qeqUnitsPerJin)}斤</strong></div>
      <div class="row"><span class="label">民营投入 / 所得</span><strong class="value">${e5(z.privateInputs,$.itemNames,$.itemUnits,M)} / ${e5(z.privateOutputs,$.itemNames,$.itemUnits,M)}</strong></div>
    </div>
    <div class="cardlet"><h3>镇库</h3>
      <div class="row"><span class="label">农业税 / 生产税</span><strong class="value">${V(N.agricultureWheatUnits/M)}斤小麦 / ${e5(N.privateTaxes,$.itemNames,$.itemUnits,M)}</strong></div>
      <div class="row"><span class="label">商品已收入</span><strong class="value">${V((($.market?.business?.year?.revenueWheatUnits||0)+($.salt?.year?.paidWheatUnits||0))/M)}小麦等值</strong></div>
      <div class="row"><span class="label">租金 / 经营权收入</span><strong class="value">${V(($.housing.rentFiscal?.year?.collectedWheatUnits||0)/M)} / ${V(($.privateEconomy?.rightSales?.yearWheatUnits||0)/M)}小麦等值</strong></div>
      <div class="row"><span class="label">工资 / 建筑工钱 / 新欠薪</span><strong class="value">${V(z.wagesWheatUnits/M)} / ${V(z.constructionWagesWheatUnits/M)} / ${V(($.payroll?.year?.unpaidWheatUnits||0)/M)}小麦等值</strong></div>
      <div class="row"><span class="label">失业金</span><strong class="value">${V(N.unemploymentWheatUnits/M)}小麦等值</strong></div>
      <div class="row"><span class="label">建设投入 / 拆除返还</span><strong class="value">${e5(N.constructionMaterials,$.itemNames,$.itemUnits,M)} / ${e5(N.constructionMaterialsReturned,$.itemNames,$.itemUnits,M)}</strong></div>
      <div class="row"><span class="label">民营人工折算</span><strong class="value">${V(($.privateEconomy?.year?.internalLaborCostWheatUnits||0)/M)}小麦等值</strong></div>
          <div class="subtle">货币收支按小麦等值汇总，实际小麦与粮券支付可在账目中逐笔查看。</div>
    </div></section>`}function B_($,Z,z){return D($.numericDrafts?.[Z]?.value??String(z??""))}function W1($,{key:Z,label:z,value:N=0,integer:M=!1,minimum:Q=0,maximum:_=1e8,positive:f=!1}){return`<input type="text" inputmode="${M?"numeric":"decimal"}" enterkeyhint="done" autocomplete="off" spellcheck="false"
    value="${B_($,Z,N)}" aria-label="${D(z)}" data-draft-key="${D(Z)}"
    data-draft-kind="stage" data-draft-label="${D(z)}" data-draft-minimum="${Q}"
    data-draft-maximum="${_}" data-draft-integer="${M}" data-draft-positive="${f}">`}function R_($){if(!$?.length)return"暂无";return $.map((Z)=>`${D(Z.name)} ${V(Z.quantity,2)}斤`).join(" · ")}function wz($,Z="暂无"){if(!$?.length)return Z;return $.map((z)=>`${D(z.name)} ${V(z.quantity,2)}${D(z.unit)}`).join(" · ")}function hz($){let Z=w0($),z=$.market.intermediatePricesVoucherPerUnit||{},N=$.market.pricesVoucherPerUnit||{};return`<details class="detail-block enterprise-section price-block" data-detail-key="prices"><summary>价格<span class="summary-note">${`小麦${V(N.wheat??1,2)} · 面粉${V(z.flour??1.8,2)} · 面包${V(N.bread??2,2)} · 盐${V(N.salt??10,2)} · 木材${V(z.wood??15,2)}`}</span></summary><div class="detail-body"><div class="cardlet">
    <div class="row"><span class="label">小麦 / 食盐</span><strong class="value">${V(N.wheat??1,3)} / ${V(N.salt??10,3)}${D(Z)}/斤</strong></div>
    <div class="row"><span class="label">面粉</span><div class="business-inline-input">${W1($,{key:"intermediate:flour",label:"面粉价格",value:z.flour??1.8,positive:!0})}<b>${D(Z)}/斤</b><button class="secondary" data-intermediate-price="flour">设置</button></div></div>
    <div class="row"><span class="label">面包</span><div class="business-inline-input">${W1($,{key:"intermediate:bread",label:"面包价格",value:N.bread??2,positive:!0})}<b>${D(Z)}/斤</b><button class="secondary" data-intermediate-price="bread">设置</button></div></div>
    <div class="row"><span class="label">木材</span><div class="business-inline-input">${W1($,{key:"intermediate:wood",label:"木材价格",value:z.wood??15,positive:!0})}<b>${D(Z)}/单位</b><button class="secondary" data-intermediate-price="wood">设置</button></div></div>
    <div class="subtle">以上均为批发价；综合商店零售价为批发价×1.2。</div>
  </div></div></details>`}function E_($,Z){let z=w0($),N=$.listingPreview?.buildingId===Z.id?$.listingPreview:null,M=`company-form:${Z.id}:levels`,Q=`company-form:${Z.id}:capital`,_=`company-form:${Z.id}:material`;return`<div class="cardlet"><div class="row"><strong>${D(Z.name)} · ${D(_2($,Z))}</strong><span class="badge">镇营${V(Z.ownership.townLevels)}级</span></div>
    <div class="business-form-grid">
      <label>公司名称<input type="text" maxlength="30" autocomplete="off" value="${D(N?.name||`${Z.name}公司`)}" data-company-name="${D(Z.id)}"></label>
      <label>划入等级${W1($,{key:M,label:"划入公司等级",value:1,integer:!0,minimum:1,maximum:Z.ownership.townLevels})}</label>
      <label>初始经营资金${W1($,{key:Q,label:"初始经营资金（小麦等值）",value:1000,minimum:0})}<small>${D(z)}</small></label>
      <label>首批主要原料${W1($,{key:_,label:"首批主要原料数量",value:0,minimum:0})}<small>斤；无原料填0</small></label>
    </div>
    <button class="secondary wide" data-company-preview="${D(Z.id)}">预览成立公司</button>
    ${N?`<div class="operation-preview"><strong>成立确认</strong>
      <div class="row"><span class="label">公司 / 划入等级</span><strong class="value">${D(N.name)} · ${V(N.levels)}级</strong></div>
      <div class="row"><span class="label">镇库投入</span><strong class="value">${V(N.capital,2)}${D(z)} · ${V(N.material,2)}斤主要原料</strong></div>
      <div class="subtle">成立后由镇库100%持有，但不会生成股票，也不要求先建交易所。</div>
      <div class="business-sticky-actions"><button class="secondary" data-company-preview-cancel>取消</button><button class="primary" data-company-create="${D(Z.id)}">确认成立</button></div>
    </div>`:""}
  </div>`}function H_($,Z){let z=w0($),N=`company:${Z.id}:wage`,M=`company:${Z.id}:target`,Q=`company:${Z.id}:capital`,_=Z.productRows||[],f=$.companyLevelPreview?.companyId===Z.id?$.companyLevelPreview:null,O=f?.preview||null,Y=f?.direction==="remove"?"划回1级":"划入1级",G=O?.listed?f.direction==="remove"?`注销镇库 ${V(O.cancelledShares||0)} 股`:`向镇库增发 ${V(O.issuedShares||0)} 股`:"未上市，不变更股本";return`<h4>独立经营</h4>
    <div class="business-form-grid">
      <label>日薪${W1($,{key:N,label:"公司日薪",value:Z.settings?.wagePerWorkerDay??10,minimum:0})}<small>${D(z)}/人日</small></label>
      <label>目标用工${W1($,{key:M,label:"公司目标用工",value:Z.plannedWorkers,integer:!0,minimum:0,maximum:Z.capacity})}<small>人</small></label>
    </div>
    <div class="business-sticky-actions"><button class="secondary" data-company-wage="${D(Z.id)}">设置工资</button><button class="secondary" data-company-target="${D(Z.id)}">设置用工</button></div>
    ${_.map((X)=>`<div class="business-form-row"><label>${D(X.name)}售价${W1($,{key:`company:${Z.id}:price:${X.itemId}`,label:`${X.name}售价`,value:X.salePrice,positive:!0})}<small>${D(z)}/斤</small></label><button class="secondary" data-company-price="${D(Z.id)}" data-item-id="${D(X.itemId)}">设置</button></div>`).join("")}
    <div class="business-form-row"><label>追加注资${W1($,{key:Q,label:"追加经营资金（小麦等值）",value:1000,positive:!0})}</label><button class="secondary" data-company-capital="${D(Z.id)}">注资</button></div>
    <div class="business-sticky-actions"><button class="secondary" data-company-level-preview="${D(Z.id)}" data-direction="add">划入1级镇营产能</button><button class="secondary" data-company-level-preview="${D(Z.id)}" data-direction="remove">划回1级</button><button class="secondary danger" data-company-liquidate="${D(Z.id)}">全部划回并清算</button></div>
    ${f?`<div class="operation-preview"><strong>${D(Y)} · 变动预览</strong>
      <div class="row"><span class="label">变动等级</span><strong class="value">${V(O?.levelsBefore??Z.listedLevels)} → ${V(O?.levelsAfter??Z.listedLevels)}级</strong></div>
      <div class="row"><span class="label">股份变动</span><strong class="value">${D(G)}</strong></div>
      ${O?.listed?`<div class="row"><span class="label">总股本</span><strong class="value">${V(O.totalSharesBefore||0)} → ${V(O.totalSharesAfter??O.totalSharesBefore??0)}股</strong></div>
      <div class="row"><span class="label">镇库持股比例</span><strong class="value">${V(O.townPercentBefore||0,2)}% → ${V(O.townPercentAfter??O.townPercentBefore??0,2)}%</strong></div>`:""}
      ${O?.reason?`<div class="shortage-banner visible">${D(O.reason)}</div>`:""}
      <div class="business-sticky-actions"><button class="secondary" data-company-level-cancel>取消</button><button class="primary" data-company-level-confirm="${D(Z.id)}" data-direction="${D(f.direction)}" ${!O?.available?"disabled":""}>确认${D(Y)}</button></div>
    </div>`:""}`}function A_($,Z){let z=$.currencyUnitsPerVoucher,N=!$.stockExchange?.available?"尚未建成交易所":!$.stockExchange?.reformComplete?"须先完成货币改革":null;if(!Z.listing?.listed){let J=$.stockListingPreview?.companyId===Z.id?$.stockListingPreview:null,F=`stock-list:${Z.id}:total`,W=`stock-list:${Z.id}:offered`,K=`stock-list:${Z.id}:price`;return`<h4>交易所上市</h4>
      ${N?`<div class="subtle">${D(N)}。公司仍可继续独立经营。</div>`:`<div class="business-form-grid">
        <label>三位代码<input type="text" inputmode="numeric" maxlength="3" autocomplete="off" value="${D(J?.ticker||"001")}" data-stock-ticker="${D(Z.id)}"></label>
        <label>总股本${W1($,{key:F,label:"总股本",value:Math.max(1000,Z.listedLevels*1000),integer:!0,minimum:1})}</label>
        <label>每股价格${W1($,{key:K,label:"每股价格",value:1,positive:!0})}<small>粮券</small></label>
        <label>本次出售${W1($,{key:W,label:"本次出售股数",value:Math.max(1,Z.listedLevels*100),integer:!0,minimum:0})}</label>
      </div>
      <button class="secondary wide" data-stock-list-preview="${D(Z.id)}">预览上市</button>
      ${J?`<div class="operation-preview"><strong>${D(J.ticker)} · 上市确认</strong>
        <div class="row"><span class="label">公司等级 / 总股本</span><strong class="value">${V(Z.listedLevels)}级 / ${V(J.totalShares)}股</strong></div>
        <div class="row"><span class="label">总估值 / 计划出售收入</span><strong class="value">${V(J.totalValue,2)} / ${V(J.plannedProceeds,2)}粮券</strong></div>
        <div class="row"><span class="label">计划出售后镇库持股</span><strong class="value">${V(J.townPercentAfter,2)}%</strong></div>
        ${J.reason?`<div class="shortage-banner visible">${D(J.reason)}</div>`:""}
        <div class="business-sticky-actions"><button class="secondary" data-stock-list-cancel>取消</button><button class="primary" data-stock-list-confirm="${D(Z.id)}" ${J.reason?"disabled":""}>确认挂牌</button></div>
      </div>`:""}`}
    `}let M=Z.subscription||{},Q=$.sharePreviewCompanyId===Z.id,_=Z.shareSale?.offeredShares||0,f=Z.sharePriceVoucher||0,O=M.subscribedShares||0,Y=(M.proceedsVoucherUnits||0)/z,G=Z.townShares-O,X=Z.totalShares?G/Z.totalShares*100:0,q=Z.stockReference||{};return`<h4>交易所 · ${D(Z.listing.ticker||"---")}</h4>
    <div class="row"><span class="label">总股本 / 镇库 / 居民</span><strong class="value">${V(Z.totalShares)} / ${V(Z.townShares)} / ${V(Z.residentShares)}股</strong></div>
    <div class="row"><span class="label">实际累计售股收入</span><strong class="value">${V(Z.shareSaleProceedsVoucher,2)}粮券 · 归镇库</strong></div>
    <div class="business-form-grid two">
      <label>出售股数${W1($,{key:`share:${Z.id}:count`,label:"出售股数",value:_,integer:!0,minimum:0,maximum:Z.townShares})}</label>
      <label>每股价格${W1($,{key:`share:${Z.id}:price`,label:"每股售价",value:f||1,positive:!0})}<small>粮券</small></label>
    </div>
    <button class="secondary wide" data-share-preview="${D(Z.id)}">预览居民认购</button>
    ${Q?`<div class="operation-preview"><strong>本次售股</strong>
      <div class="row"><span class="label">计划收入 / 预计实际收入</span><strong class="value">${V(_*f,2)} / ${V(Y,2)}粮券</strong></div>
      <div class="row"><span class="label">预计成交 / 成交后镇库持股</span><strong class="value">${V(O)}股 / ${V(X,2)}%</strong></div>
      ${M.reason?`<div class="shortage-banner visible">${D(M.reason)}</div>`:""}
      <div class="business-sticky-actions"><button class="secondary" data-share-cancel>取消</button><button class="primary" data-share-confirm="${D(Z.id)}" ${!M.available?"disabled":""}>确认售股</button></div>
    </div>`:""}
    <div class="business-form-grid two"><label>回购股数${W1($,{key:`buyback:${Z.id}:count`,label:"镇库回购股数",value:100,integer:!0,minimum:1})}</label><label>回购价${W1($,{key:`buyback:${Z.id}:price`,label:"镇库回购每股价格",value:Math.max(1,(q.referencePerShareVoucherUnits||0)/z),positive:!0})}<small>粮券</small></label></div>
    <button class="secondary wide" data-company-buyback-preview="${D(Z.id)}">预览镇库回购</button>
    ${$.buybackPreview?.companyId===Z.id?`<div class="operation-preview"><strong>回购预览</strong>
      <div class="row"><span class="label">申请 / 居民愿售</span><strong class="value">${V($.buybackPreview.preview?.requestedShares||0)} / ${V($.buybackPreview.preview?.willingShares||0)}股</strong></div>
      <div class="row"><span class="label">镇库可负担 / 预计成交</span><strong class="value">${V($.buybackPreview.preview?.affordableShares||0)} / ${V($.buybackPreview.preview?.executableShares||0)}股</strong></div>
      <div class="row"><span class="label">预计总成本</span><strong class="value">${V(($.buybackPreview.preview?.costVoucherUnits||0)/z,2)}粮券</strong></div>
      ${$.buybackPreview.preview?.reason?`<div class="shortage-banner visible">${D($.buybackPreview.preview.reason)}</div>`:""}
      <div class="business-sticky-actions"><button class="secondary" data-company-buyback-cancel>取消</button><button class="primary" data-company-buyback-confirm="${D(Z.id)}" ${!$.buybackPreview.preview?.available?"disabled":""}>确认回购</button></div>
    </div>`:""}
    <details class="detail-block" data-detail-key="stock-ref:${D(Z.id)}"><summary>估值与业绩</summary><div class="detail-body">
      <div class="row"><span class="label">业绩估值</span><strong class="value">${q.validProfitMethod?`${V((q.referenceCompanyValueVoucherUnits||0)/z,2)}粮券`:q.observedDays?"观察中/暂无正值":"暂无业绩"}</strong></div>
      <div class="row"><span class="label">观察 / 年化利润率</span><strong class="value">${V(q.observedDays||0)}日 / ${V((q.annualizedProfitRateBps||0)/100,2)}%</strong></div>
      <div class="subtle">${D(q.basis||"经营资料待观察")}</div>
    </div></details>`}function T_($,Z){let z=w0($),N=Z.lastAnnualSettlement||{},M=$.currencyUnitsPerVoucher,Q=!["运营中","生产中","原料有限","按订单生产"].includes(Z.status||"");return`<div class="company-card cardlet">
    <div class="row"><strong>${D(Z.name)}</strong><span><span class="badge">${Z.listing?.listed?`${D(Z.listing.ticker||"---")} · 已上市`:"未上市"}</span> <span class="badge${Q?" red":""}">${D(Z.status||"运营中")}</span></span></div>
    <div class="row"><span class="label">公司等级 / 在岗 / 目标</span><strong class="value">${V(Z.listedLevels)}级 · ${V(Z.workers)} / ${V(Z.plannedWorkers)}人</strong></div>
    <div class="row"><span class="label">可支付资金 / 欠薪</span><strong class="value">${V(Z.cashVoucher,2)}粮券 + ${V(Z.cashWheatJin||0,2)}斤小麦 / ${V(Z.arrearsVoucher,2)}${D(z)}</strong></div>
    <div class="row"><span class="label">近期日均销量 / 实际利润</span><strong class="value">${Z.averageDailySales>0?V(Z.averageDailySales,2):"暂无销量"} / ${V(Z.averageDailyProfitVoucher,2)}${D(z)}</strong></div>
    <div class="row"><span class="label">库存</span><strong class="value">${R_(Z.inventoryRows)}</strong></div>
    ${H_($,Z)}
    ${A_($,Z)}
    <details class="detail-block" data-detail-key="company-detail:${D(Z.id)}"><summary>账目与年度结算</summary><div class="detail-body">
      <div class="row"><span class="label">今日产出 / 售出</span><strong class="value">${wz(Z.producedRowsDay)} / ${wz(Z.soldRowsDay)}</strong></div>
      <div class="row"><span class="label">今日收入 / 净利润</span><strong class="value">${V(Z.revenueDayVoucher,2)} / ${V(Z.profitDayVoucher,2)}${D(z)}</strong></div>
      <div class="row"><span class="label">今日成本</span><strong class="value">已售${V(Z.cogsDayVoucher,2)} · 工资${V(Z.wagesDayVoucher,2)} · 税${V(Z.taxCostDayVoucher,2)} · 损耗${V(Z.processingLossDayVoucher,2)}${D(z)}</strong></div>
      <div class="row"><span class="label">360日周转金目标</span><strong class="value">${V(Z.workingCapitalReserveVoucher,2)}${D(z)}</strong></div>
      <div class="row"><span class="label">上年净利润 / 实际分配</span><strong class="value">${V((N.lastYearNetProfitVoucherUnits||0)/M,2)} / ${V((N.distributedVoucherUnits||0)/M,2)}${D(z)}</strong></div>
      <div class="row"><span class="label">未分配利润</span><strong class="value">${V(Z.retainedEarningsVoucher,2)}${D(z)}</strong></div>
    </div></details>
  </div>`}function mz($){let Z=$.listableBuildings||[],z=$.companies||[],N=Z.length?Z.map((_)=>E_($,_)).join(""):'<div class="subtle">暂无可划入公司的镇营等级。</div>',M=$.stockExchange?.available?$.stockExchange.physical?"交易所已建成":"旧档兼容交易所入口":"尚未建成交易所",Q=z.length||Z.length?`<section class="enterprise-section"><h2>独立公司</h2>
      ${z.length?z.map((_)=>T_($,_)).join(""):'<div class="cardlet subtle">暂无独立公司。</div>'}
      <details class="detail-block" data-detail-key="company-formation"><summary>从镇营等级成立公司${Z.length?` · ${V(Z.length)}处可选`:""}</summary><div class="detail-body">${N}</div></details>
    </section>`:"";if(!$.stockExchange?.available)return`${hz($)}${Q}`;return`${hz($)}${Q}
    <section class="enterprise-section"><h3>交易所</h3><div class="cardlet"><div class="row"><span class="label">状态</span><strong class="value">${D(M)}</strong></div><div class="row"><span class="label">新上市条件</span><strong class="value">${$.stockExchange?.reformComplete?"货币改革已完成":"须完成货币改革"}</strong></div><div class="subtle">交易所只负责挂牌、认购、回购与股权信息；公司成立和经营不依赖交易所。</div></div></section>`}function t5($,Z,z){return`<details class="detail-block panel-detail" data-detail-key="${$}"><summary>${Z}</summary><div class="detail-body">${z}</div></details>`}