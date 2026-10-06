import fs from 'node:fs';
const src = fs.readFileSync('audit-011/master-inline.js','utf8');
// find content object: search for itemNames-like definitions
function findObj(s, startMarker) {
  const i = s.indexOf(startMarker);
  if (i<0) return null;
  let j=i, depth=0;
  for (; j<s.length; j++) {
    if (s[j]==='{') depth++;
    else if (s[j]==='}') { depth--; if (depth===0) break; }
  }
  return s.slice(i,j+1);
}
const markers = ['items:Object.freeze','buildings:Object.freeze','itemNames','initial:Object.freeze','recipes'];
for (const mk of markers) {
  const o = findObj(src, mk);
  console.log('---', mk, o? o.length : 'NOT FOUND');
}
