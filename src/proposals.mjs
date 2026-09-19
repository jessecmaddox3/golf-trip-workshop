import {z} from 'zod';
const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).refine(s=>!['constructor','prototype'].includes(s));
const text=z.string().min(1).max(4000),label=z.string().min(1).max(140);
const amount=z.number().finite().min(0).max(10_000_000).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-7,'Use whole cents');
const group=z.number().int().min(1).max(80);
const image=z.string().regex(/^\/(?!\/)[a-zA-Z0-9/._-]+$/).max(300);
const link=z.string().max(500).refine(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}});
const item=z.object({label,amount}).strict(),items=z.array(item).min(1).max(40);
const basicHouse=z.object({id,name:label,total:amount}).strict();
const costs={
 'hard-soft':z.object({sharedItems:items,personalSpend:amount,hardBase:amount}).strict(),
 shared:z.object({sharedItems:items,personalSpend:amount}).strict(),
 winner:z.object({sharedItems:items,personalSpend:amount,hardBase:amount,winnerReturn:amount}).strict(),
 'split-house':z.object({houses:z.array(basicHouse).length(2),golfItems:items,cart:amount,forecaddie:amount,vehicles:amount,contingency:amount,personalSpend:amount,comparisonBase:amount,rateContext:z.array(z.object({label,amount,note:text}).strict()).min(1).max(20)}).strict(),
 'group-package':z.object({houses:z.array(z.object({id,name:label,total:amount.nullable(),description:text,image,directionsUrl:link.optional()}).strict()).min(1).max(40),packages:z.array(z.object({id,name:label,amount,rounds:z.number().int().min(1).max(20),description:text}).strict()).min(1).max(20),premiumRate:amount,premiumMin:amount,premiumMax:amount,gambling:amount,holeInOne:amount,swag:amount,groupFood:amount}).strict(),
};
const common={id,name:label,kind:z.enum(Object.keys(costs)),tagline:label,description:text,groupSize:group,currency:z.literal('USD'),target:amount,practiceDefault:z.boolean(),practiceCost:amount,
 origins:z.array(z.object({id,name:label,cost:amount,route:text,arrival:text,transfer:text}).strict()).min(1).max(30),
 courses:z.array(z.object({id,name:label,fee:amount,description:text,walkable:z.boolean(),drive:label,image,notes:z.array(text).max(30),x:z.number().min(0).max(800),y:z.number().min(0).max(500),directionsUrl:link.optional()}).strict()).min(1).max(30),
 days:z.array(z.object({id,label,title:label,items:z.array(text).min(1).max(40),rounds:z.array(z.enum(['package','premium','replay'])).max(5).optional()}).strict()).min(1).max(30),gallery:z.array(z.object({src:image,caption:text}).strict()).min(1).max(40),logistics:z.array(text).min(1).max(30)};
const proposalSchema=z.discriminatedUnion('kind',Object.entries(costs).map(([kind,schema])=>z.object({...common,kind:z.literal(kind),costs:schema}).strict()));
const sum=rows=>rows.reduce((n,r)=>n+r.amount,0);
const cents=n=>Math.round(n*100);
const roundRatio=(numerator,denominator)=>Math.floor((2*numerator+denominator)/(2*denominator));
function unique(rows){return new Set(rows.map(r=>r.id)).size===rows.length;}
export function validateProposals(value){
 const data=z.object({schemaVersion:z.literal(1),fictional:z.boolean(),proposals:z.array(proposalSchema).min(1).max(30)}).strict().parse(value);
 if(!unique(data.proposals))throw new Error('Proposal IDs must be unique.');
 for(const p of data.proposals){
  for(const rows of [p.origins,p.courses,p.days,p.costs.houses,p.costs.packages].filter(Boolean))if(!unique(rows))throw new Error('Proposal option IDs must be unique.');
  if(p.costs.hardBase!==undefined&&p.costs.hardBase>sum(p.costs.sharedItems))throw new Error('Hard base cannot exceed shared costs.');
  if(p.kind==='group-package'){
   const c=p.costs;if(!c.houses.some(h=>h.total!==null))throw new Error('At least one house needs a full-stay quote.');
   if(c.premiumMin<0.01||c.premiumMin>c.premiumRate||c.premiumRate>c.premiumMax)throw new Error('Premium round rate must be within positive limits.');
   const slots=p.days.flatMap(d=>d.rounds||[]);if(slots.filter(s=>s==='premium').length!==1||slots.filter(s=>s==='replay').length!==1||c.packages.some(k=>k.rounds!==slots.filter(s=>s==='package').length))throw new Error('Itinerary round slots must match the package, premium round and optional replay.');
  }
 }
 return data;
}
export function proposalItinerary(p,options=defaultChoices(p)){
 const o=choices(p,options);if(p.kind!=='group-package')return p.days;
 const pack=p.costs.packages.find(k=>k.id===o.package);if(!pack)throw new Error('Choose a known finale package.');
 let included=0;
 return p.days.map(day=>({...day,roundLabels:(day.rounds||[]).flatMap(slot=>{
  if(slot==='replay')return o.replay?['Optional premium replay round']:[];
  if(slot==='premium')return ['Premium round, separate from the package'];
  included++;return [included===pack.rounds?`Finale: ${pack.name}`:`Included package round ${included}`];
 })}));
}
export function defaultChoices(p){
 const base={target:p.target};
 if(p.kind==='group-package')return {...base,groupSize:p.groupSize,house:p.costs.houses.find(h=>h.total!==null).id,package:p.costs.packages[0].id,premiumRate:p.costs.premiumRate,replay:false};
 return {...base,origin:p.origins[0].id,practice:p.practiceDefault,...(p.kind==='winner'?{winner:false}:{}),...(p.kind==='split-house'?{groupSize:p.groupSize}:{})};
}
function choices(p,o){
 const shape={target:amount};
 if(p.kind==='group-package')Object.assign(shape,{groupSize:group,house:id,package:id,premiumRate:amount.refine(n=>n>=p.costs.premiumMin&&n<=p.costs.premiumMax,'Enter a rate within the stated limits'),replay:z.boolean()});
 else Object.assign(shape,{origin:id,practice:z.boolean(),...(p.kind==='winner'?{winner:z.boolean()}:{}),...(p.kind==='split-house'?{groupSize:group}:{})});
 return z.object(shape).strict().parse(o);
}
/** Values are USD per player. A winner credit is a scenario, not a reduced bill. */
export function calculateProposal(p,options=defaultChoices(p)){
 const o=choices(p,options),c=p.costs,lines=[];
 const add=(label,n,denominator=1)=>{lines.push({label,amount:roundRatio(n,denominator)/100});return n;};
 const addMoney=(label,n)=>add(label,cents(n));
 let projected,hard=null,comparison=null,savings=null,rounds=p.courses.length,credit=0,hardBase=null;
 if(p.kind==='group-package'){
  const house=c.houses.find(h=>h.id===o.house),pack=c.packages.find(k=>k.id===o.package);
  if(!house||house.total===null)throw new Error('Choose a house with an available full-stay quote.');
  if(!pack)throw new Error('Choose a known finale package.');
  const fixed=addMoney(pack.name,pack.amount)+addMoney('Premium round',o.premiumRate)+(o.replay?addMoney('Premium replay',o.premiumRate):0)+addMoney('Contest pool',c.gambling)+addMoney('Hole-in-one pool',c.holeInOne)+addMoney('Mementos',c.swag)+addMoney('Group food',c.groupFood);
  add('Lodging share',cents(house.total),o.groupSize);
  projected=roundRatio(fixed*o.groupSize+cents(house.total),o.groupSize);
  rounds=pack.rounds+1+Number(o.replay);
 }else{
  const origin=p.origins.find(v=>v.id===o.origin);if(!origin)throw new Error('Choose a known arrival option.');
  const travel=cents(origin.cost),practice=o.practice?cents(p.practiceCost):0;
  if(p.kind==='split-house'){
   const fixed=c.golfItems.reduce((n,r)=>n+cents(r.amount),0)+cents(c.cart)+cents(c.forecaddie)+cents(c.vehicles)+cents(c.contingency),lodging=c.houses.reduce((n,h)=>n+cents(h.total),0);
   hardBase=roundRatio(fixed*o.groupSize+lodging,o.groupSize*100)*100;
   for(const row of c.golfItems)addMoney(row.label,row.amount);
   for(const h of c.houses)add(h.name+' share',cents(h.total),o.groupSize);
   addMoney('Carts',c.cart);addMoney('Forecaddie',c.forecaddie);addMoney('Vehicles',c.vehicles);addMoney('Contingency',c.contingency);
   add('Whole-dollar hard-base adjustment',hardBase-lines.reduce((n,r)=>n+cents(r.amount),0));
   hard=hardBase+travel+practice;projected=hard+cents(c.personalSpend);
   comparison=cents(c.comparisonBase)+travel+practice;savings=comparison-projected;
  }else{
   for(const row of c.sharedItems)addMoney(row.label,row.amount);
   projected=c.sharedItems.reduce((n,r)=>n+cents(r.amount),0)+cents(c.personalSpend)+travel+practice;
   if(c.hardBase!==undefined)hard=cents(c.hardBase)+travel+practice;
   if(p.kind==='winner'&&o.winner)credit=cents(c.winnerReturn);
  }
  addMoney('Personal spending allowance',c.personalSpend);add(origin.name+' travel',travel);if(o.practice){add('Optional practice round',practice);rounds++;}
 }
 const displayAdjustment=projected-lines.reduce((n,r)=>n+cents(r.amount),0);if(displayAdjustment)add('Displayed share rounding',displayAdjustment);
 const beforeCredit=projected;if(credit)add('Hypothetical winner return',-credit);
 projected-=credit;
 return {projected:projected/100,beforeCredit:beforeCredit/100,credit:credit/100,hard:hard===null?null:hard/100,hardBase:hardBase===null?null:hardBase/100,comparison:comparison===null?null:comparison/100,savings:savings===null?null:savings/100,headroom:(cents(o.target)-projected)/100,rounds,travelIncluded:p.kind!=='group-package',lines,groupSize:o.groupSize??p.groupSize};
}
