import fs from 'node:fs';
const rules = fs.readFileSync('audit-011/master-rules.raw.js','utf8');
const master = eval('(' + rules.replace(/Object\.freeze\(/g,'(') + ')');
const curMod = await import('../src/content/rules.js');
const cur = curMod.RULES || curMod.rules || curMod.default || curMod;
function flat(o, p='', out={}) {
  for (const [k,v] of Object.entries(o||{})) {
    const key = p? p+'.'+k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key]=v;
  }
  return out;
}
const m = flat(master), c = flat(cur);
const mk = new Set(Object.keys(m)), ck = new Set(Object.keys(c));
const onlyMaster = [...mk].filter(k=>!ck.has(k)).sort();
const onlyCur = [...ck].filter(k=>!mk.has(k)).sort();
console.log('master keys', mk.size, '| cur keys', ck.size);
console.log('\n=== master-only rule keys ('+onlyMaster.length+') ===');
for (const k of onlyMaster) console.log('  '+k+' = '+JSON.stringify(m[k]));
console.log('\n=== value differences on shared keys ===');
for (const k of [...mk].filter(k=>ck.has(k)).sort()) {
  const a=JSON.stringify(m[k]), b=JSON.stringify(c[k]);
  if (a!==b) console.log('  '+k+': master='+a+' cur='+b);
}
console.log('\n=== current-only keys ('+onlyCur.length+') ===');
console.log(onlyCur.join('\n'));
