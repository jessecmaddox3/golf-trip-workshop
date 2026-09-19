import {z} from 'zod';
const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).refine(v=>!['constructor','prototype'].includes(v));
const label=z.string().min(1).max(200),option=z.object({id,name:label}).strict();
const options=schema=>z.array(schema).min(1).max(50).refine(rows=>new Set(rows.map(r=>r.id)).size===rows.length,'Choice IDs must be unique');
const schema=z.object({title:label,description:z.string().max(2000),bases:options(option.extend({desc:z.string().max(1000)})),driving:options(option),mustPlay:options(option),dates:options(option),arrival:options(option)}).strict();
export const validatePollConfig=value=>schema.parse(value);
export function createPoll(config){
 const POLL=validatePollConfig(config),blankAnswer=()=>({baseRatings:{},driving:'',mustPlay:[],dates:{},arrival:'',suggestion:''});
 const known=(rows,blank=false)=>z.string().refine(v=>(blank&&v==='')||rows.some(r=>r.id===v),'Unknown choice');
 const record=(rows,value)=>z.record(z.string(),value).refine(r=>Object.keys(r).every(k=>rows.some(x=>x.id===k)),'Unknown question');
 const answerSchema=z.object({baseRatings:record(POLL.bases,z.number().int().min(1).max(5)),driving:known(POLL.driving,true),mustPlay:z.array(known(POLL.mustPlay)).max(2).refine(a=>new Set(a).size===a.length),dates:record(POLL.dates,z.enum(['yes','maybe','no'])),arrival:known(POLL.arrival,true),suggestion:z.string().max(2000)}).strict();
 const validateAnswer=value=>answerSchema.parse(value);
 function summarize(answers){
  const rows=Object.entries(answers).filter(([,a])=>a).map(([id,a])=>({id,...validateAnswer(a)}));
  const counts=key=>Object.fromEntries(POLL[key].map(o=>[o.id,rows.filter(a=>a[key]===o.id||(Array.isArray(a[key])&&a[key].includes(o.id))).length]));
  return {respondents:rows.length,baseRatings:Object.fromEntries(POLL.bases.map(o=>{const values=rows.map(a=>a.baseRatings[o.id]).filter(v=>v!==undefined);return [o.id,{count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null}];})),driving:counts('driving'),mustPlay:counts('mustPlay'),arrival:counts('arrival'),dates:Object.fromEntries(POLL.dates.map(o=>[o.id,Object.fromEntries(['yes','maybe','no'].map(v=>[v,rows.filter(a=>a.dates[o.id]===v).length]))])),suggestions:rows.filter(a=>a.suggestion.trim()).map(a=>({id:a.id,text:a.suggestion}))};
 }
 return {POLL,blankAnswer,validateAnswer,summarize};
}
