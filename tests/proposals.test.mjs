import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateProposals,calculateProposal,defaultChoices,proposalItinerary} from '../src/proposals.mjs';
const data=validateProposals(JSON.parse(fs.readFileSync(new URL('../proposals.config.json',import.meta.url),'utf8')));
const byId=id=>data.proposals.find(p=>p.id===id);
test('each origin and practice combination retains each budget scope',()=>{
 const expectations={valley:{shared:783,personal:165,hard:678},meadow:{shared:783,personal:154},lakes:{shared:924,personal:182,hard:802}};
 for(const [id,e] of Object.entries(expectations)){const p=byId(id);for(const origin of p.origins)for(const practice of [false,true]){
  const r=calculateProposal(p,{...defaultChoices(p),origin:origin.id,practice});
  assert.equal(r.projected,e.shared+e.personal+origin.cost+(practice?p.practiceCost:0));
  assert.equal(r.hard,e.hard===undefined?null:e.hard+origin.cost+(practice?p.practiceCost:0));
 }}
});
test('winner credit changes projected net only and is never promised cash',()=>{
 const p=byId('lakes'),base=defaultChoices(p),a=calculateProposal(p,base),b=calculateProposal(p,{...base,winner:true});
 assert.equal(a.projected-b.projected,215);assert.equal(a.hard,b.hard);assert.equal(b.beforeCredit,a.projected);
});
test('split-house whole-dollar hard-base rounding precedes travel and practice',()=>{
 const p=byId('cottages');for(const origin of p.origins)for(const practice of [false,true])for(const groupSize of [1,8,13]){
  const r=calculateProposal(p,{...defaultChoices(p),origin:origin.id,practice,groupSize});
  const hardBase=Math.round(342+38+42+(1357.5+1543.25)/groupSize+73+81);
  assert.equal(r.hard,hardBase+origin.cost+(practice?75:0));assert.equal(r.projected,r.hard+193);
  assert.equal(r.comparison,1480+origin.cost+(practice?75:0));assert.equal(r.savings,r.comparison-r.projected);
 }
});
test('group-package house/finale/replay choices retain a narrower total',()=>{
 const p=byId('clubhouse');for(const house of p.costs.houses.filter(h=>h.total!==null))for(const pack of p.costs.packages)for(const replay of [false,true])for(const premiumRate of [1,186,2000]){
  const r=calculateProposal(p,{...defaultChoices(p),house:house.id,package:pack.id,replay,premiumRate});
  assert.equal(r.projected,Math.round((pack.amount+premiumRate*(replay?2:1)+house.total/8+75+20+38+127)*100)/100);
  assert.equal(r.rounds,pack.rounds+1+Number(replay));assert.equal(r.hard,null);assert.equal(r.travelIncluded,false);
  const days=proposalItinerary(p,{...defaultChoices(p),package:pack.id,replay});assert.equal(days.flatMap(d=>d.roundLabels).length,r.rounds);assert.ok(days.at(-1).roundLabels[0].includes(pack.name));
 }
});
test('replay costs one premium round, targets go above and below, group size changes lodging',()=>{
 const p=byId('clubhouse'),base=defaultChoices(p),a=calculateProposal(p,base),b=calculateProposal(p,{...base,replay:true});
 assert.equal(b.projected-a.projected,186);assert.equal(calculateProposal(p,{...base,target:1}).headroom,1-a.projected);
 assert.equal(calculateProposal(p,{...base,target:5000}).headroom,5000-a.projected);
 assert.equal(Math.round(calculateProposal(p,{...base,groupSize:4}).projected*100)-Math.round(a.projected*100),32970);
});
test('displayed cost rows reconcile to the final per-player amount',()=>{
 for(const p of data.proposals)for(const groupSize of [3,8,13]){
  const o=defaultChoices(p);if('groupSize' in o)o.groupSize=groupSize;
  const r=calculateProposal(p,o);assert.equal(r.lines.reduce((s,row)=>s+Math.round(row.amount*100),0),Math.round(r.projected*100));
 }
});
test('divided lodging rounds an exact half cent up after combining all charges',()=>{
 const p=structuredClone(byId('clubhouse'));p.costs.packages[0].amount=200.19;p.costs.premiumRate=100.02;p.costs.houses[0].total=1000.01;
 for(const key of ['gambling','holeInOne','swag','groupFood'])p.costs[key]=0;
 const r=calculateProposal(p,{...defaultChoices(p),groupSize:2});assert.equal(r.projected,800.22);
});
test('unknown, unavailable, empty, nonfinite and out-of-range choices fail visibly',()=>{
 const p=byId('clubhouse'),base=defaultChoices(p);
 for(const change of [{house:'unquoted'},{house:'missing'},{package:'missing'},{premiumRate:''},{premiumRate:0},{premiumRate:2001},{premiumRate:NaN},{premiumRate:Infinity},{groupSize:0},{groupSize:1.5},{replay:'yes'},{origin:'fly'}])assert.throws(()=>calculateProposal(p,{...base,...change}));
 assert.throws(()=>calculateProposal(byId('valley'),{...defaultChoices(byId('valley')),origin:'missing'}));
});
test('proposal configuration rejects damaged identities, unsafe assets and invalid amounts',()=>{
 for(const mutate of [c=>c.proposals[1].id=c.proposals[0].id,c=>c.proposals[0].origins.push(c.proposals[0].origins[0]),c=>c.proposals[0].gallery[0].src='https://outside.invalid/private.png',c=>c.proposals[0].costs.sharedItems[0].amount=-10,c=>c.proposals[3].costs.houses[0].total=null,c=>c.proposals[4].costs.premiumRate=9999,c=>c.proposals[0].costs.hardBase=99999]){
  const c=structuredClone(data);mutate(c);assert.throws(()=>validateProposals(c));
 }
});
