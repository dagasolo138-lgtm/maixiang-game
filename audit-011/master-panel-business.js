function uz($){let Z=new Set(($.buildings||[]).map((N)=>N.typeId)),z=(...N)=>N.some((M)=>Z.has(M));return`<div class="subtle">${D(Z4($))}；经营收入、成本与利润一律按小麦等值核算，支付媒介不产生利润。</div>
    <section class="panel-section" id="foodSection"><h2>口粮</h2>
      ${$.shortageQeq>0?`<div class="shortage-banner visible">口粮短缺 ${_z($.shortageQeq,$.qeqUnitsPerJin)}，时光已暂停。</div>`:""}
      <div class="cardlet"><div class="row"><span class="label">居民可吃</span><strong class="value">${Q2($.residentFoodDays,1)}天</strong></div><div class="row"><span class="label">每日需要</span><strong class="value">${$.dailyNeed.toLocaleString("zh-CN")}斤</strong></div>
      <label class="toggle"><input id="autoRelief" type="checkbox" ${$.autoRelief?"checked":""}><span>自动救济</span></label>
      <div class="settings-actions"><button class="secondary" id="manualAid" ${$.accounts.town.qeq<=0?"disabled":""}>拨粮 ${$.manualReliefAmountJin.toLocaleString("zh-CN")}斤</button></div></div></section>
    ${mz($)}
    ${z("commercial_street")?t5("bread-trade","居民主粮购买",Uz($)):""}
    ${z("lumberyard","saltworks","public_housing")?t5("industry-accounts","林业、盐业与住房",vz($)):""}
    ${z("mill","bakery")?t5("workshop-accounts","镇营作坊账",Iz($)):""}
    ${t5("ledger","账目与历史交易",gz($))}
    ${t5("annual-flows","本年收支明细",yz($))}`}