import fs from 'node:fs';
const s = fs.readFileSync('audit-011/master-inline.js','utf8');
const i = s.indexOf('t.freeze({id:"millers"');
// walk back to find the enclosing object start for the buildings content
let start = s.lastIndexOf('buildings:', i);
console.log('buildings: at', start);
let j = s.indexOf('{', start); let depth=0, k=j;
for (; k<s.length; k++){ if(s[k]==='{')depth++; else if(s[k]==='}'){depth--; if(depth===0)break;} }
const block = s.slice(j, k+1);
fs.writeFileSync('audit-011/master-buildings.raw.js', block);
console.log('len', block.length);
// list building ids + names + levels
const re = /id:"([a-z_]+)",name:"([^"]+)"/g; let m; const seen=new Set();
while((m=re.exec(block))) { if(!seen.has(m[1])) { seen.add(m[1]); console.log(m[1], m[2]); } }
