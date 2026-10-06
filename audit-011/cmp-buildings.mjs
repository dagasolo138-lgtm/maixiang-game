import fs from 'node:fs';
const s = fs.readFileSync('audit-011/master-inline.js','utf8');
// master constructionOptions is derived; find the building definitions list by looking for constructionCost
const idx = s.indexOf('constructionOptions');
console.log('constructionOptions idx', idx);
// find definitions with 'worksites' or 'buildTimeDays'
for (const k of ['buildDays','workUnits','materials:', 'maxLevel:5', 'plotsPerLevel']) {
  const i = s.indexOf(k);
  console.log(k, i, i>0? s.slice(Math.max(0,i-260), i+260).replace(/\n/g,' ') : '');
  console.log('---');
}
