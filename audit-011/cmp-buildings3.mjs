import fs from 'node:fs';
const s = fs.readFileSync('audit-011/master-inline.js','utf8');
// each building def: {id:"mill",name:"磨坊",icon:...,maxInstances:...,materialRequirements:...,construction:{workDays:480,...}
const re = /([a-z_]+):Object\.freeze\(\{id:"([a-z_]+)",name:"([^"]+)",icon:"([^"]*)",description:"([^"]*)",maxInstances:(\d+)/g;
let m;
const rows=[];
while((m=re.exec(s))) rows.push({key:m[1],id:m[2],name:m[3],max:m[6],desc:m[5]});
console.log('found', rows.length);
for (const r of rows) console.log(JSON.stringify(r));
