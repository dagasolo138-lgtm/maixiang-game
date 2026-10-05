## [d2] 基线复核 (fix/test-baseline-zero 起点)

- main HEAD: ee51522 (0.2.3 单文件重打，含小麦 hotfix)
- 分支: fix/test-baseline-zero
- `node --test` 结果: tests 292 / pass 266 / fail 26
- 26 个失败名单（file:line 1-based，node --test 报的 test at 位置）:
tests/building-development.test.js:13:1
tests/feature-round.test.js:111:1
tests/feature-round.test.js:160:1
tests/forestry-housing-salt.test.js:62:1
tests/forestry-housing-salt.test.js:105:1
tests/ownership-tax.test.js:89:1
tests/ownership-tax.test.js:113:1
tests/simulation.test.js:38:1
tests/simulation.test.js:215:1
tests/simulation.test.js:244:1
tests/simulation.test.js:311:1
tests/v0110-r02-targeted.test.js:163:1
tests/v0110-r03-private-ui-employment.test.js:37:1
tests/v0110-r03-private-ui-employment.test.js:62:1
tests/v0110-r03-private-ui-employment.test.js:104:1
tests/v0110-r03-private-ui-employment.test.js:167:1
tests/v012-policy-household-life.test.js:66:1
tests/v012-r03-stability.test.js:104:1
tests/v012-r03-stability.test.js:174:1
tests/v013-aggregate-model.test.js:197:1
tests/v019-payment-context.test.js:102:1
tests/v15-currency-enterprise-shares.test.js:97:1
tests/v15-currency-enterprise-shares.test.js:243:1
tests/v15_1-industry-balance.test.js:51:1
tests/v16-0.0.16-regressions.test.js:127:1
tests/v16-households-commerce.test.js:60:1
