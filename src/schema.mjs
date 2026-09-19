import {z} from 'zod';
import {createEngine} from './engine-core.mjs';
import {sessionEnd,calendarLabels} from './calendar.mjs';

const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).refine(v=>!['constructor','prototype','__proto__','owner','scorekeeper'].includes(v),'Reserved ID');
const safeLink=z.string().max(500).refine(v=>{if(/^(?:\/(?!\/)|#)/.test(v)&&!/[\\\u0000-\u0020]/.test(v))return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use a local path or an HTTPS link');
const localImage=z.string().max(300).regex(/^\/(?!\/)[a-zA-Z0-9/._-]+$/);
const dateInZone=(instant,timezone)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;};
const text=z.string().max(4000);
const label=z.string().min(1).max(140);
const integer=z.number().int();
const score=z.union([integer.min(1).max(30),z.string().regex(/^(?:[1-9]|[12][0-9]|30)?$/),z.null()]);
const index=z.number().finite().min(-20).max(54);
const instant=z.string().datetime({offset:true});
const civilDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'Invalid calendar date');
const money=z.number().finite().min(0.01).max(10_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-7,'Use whole cents');
function keyed(keys,value){
  const allowed=new Set(keys);
  return z.record(z.string(),value).superRefine((record,ctx)=>{for(const key of Object.keys(record))if(!allowed.has(key))ctx.addIssue({code:'custom',path:[key],message:'Unknown record ID'});});
}
const player=z.object({id,name:label,short:label,role:z.string().max(80),handicap:index}).strict();
const team=z.object({name:label,flag:z.string().max(12),players:z.array(player).min(1).max(40)}).strict();
const tee=z.object({tee:label,yds:z.string().regex(/^\d[\d,]*$/),rating:z.number().finite().min(20).max(100),slope:z.number().finite().min(55).max(155),note:z.string().max(140)}).strict();
const hole=z.object({num:integer.min(1).max(18),name:label,par:integer.min(3).max(6),yds:integer.min(40).max(900),hcp:integer.min(1).max(18),strategy:text,difficulty:integer.min(1).max(5),desc:text,keyMiss:text,dangerZone:text,scoringTip:text}).strict();
const course=z.object({id,name:label,icon:z.string().max(12),tag:label,description:text,overview:text,strategy:text,color:label,par:integer.min(54).max(108),pars:z.array(integer.min(3).max(6)).length(18),hcpIndex:z.array(integer.min(1).max(18)).length(18),tees:z.array(tee).min(1).max(12),defaultTee:integer.min(0),holes:z.array(hole).length(18),tagline:text,personality:text,idealFormat:text,pairingAdvice:text,directionsUrl:safeLink.optional(),mapImage:localImage.optional(),mapAlt:label.optional()}).strict();
const match=z.object({id,tee:z.string().max(40),usaPlayers:z.array(id).max(2),euroPlayers:z.array(id).max(2),type:z.enum(['1v1','2v2']),tbd:z.boolean()}).strict();
const session=z.object({id,start:instant,time:z.string().max(40),courseId:id,course:label,format:label,isCompetitive:z.boolean(),matches:z.array(match).max(40),participants:z.array(id).max(80)}).strict();
const place=z.object({id,name:label,cat:label.optional(),cuisine:label.optional(),addr:z.string().max(300),drive:z.string().max(160),price:z.string().max(160),desc:text,hours:z.string().max(300),img:localImage.optional(),x:z.number().min(0).max(800),y:z.number().min(0).max(500),priceNote:z.string().max(300).optional(),goodFor:z.string().max(140).optional(),phone:z.string().max(60).optional(),rating:z.union([z.string().max(80),z.number().min(0).max(5)]).optional(),catering:z.string().max(300).optional(),url:safeLink.optional(),menuUrl:safeLink.optional(),directionsUrl:safeLink.optional()}).strict();
const configSchema=z.object({
  schemaVersion:z.literal(1),event:z.object({id,name:label,edition:label,location:label,timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Unknown timezone'),startsAt:instant,endsAt:instant,demoNow:instant}).strict(),
  teams:z.object({usa:team,europe:team}).strict(),courses:z.record(id,course),
  schedule:z.array(z.object({day:label,date:label,isoDate:civilDate,label,sessions:z.array(session).min(1).max(8)}).strict()).min(1).max(31),
  handicapping:z.object({mode:z.enum(['full-course','relative-match']),singlesAllowance:z.number().positive().max(1),betterBallAllowance:z.number().positive().max(1),description:text}).strict(),
  contests:z.object({teamPot:money,mvpPot:money,ctpPerHole:money,birdiePrizes:z.array(money).min(1).max(10)}).strict(),
  lodging:z.object({name:label,address:z.string().max(300),checkIn:label,checkOut:label,arrival:text,wifi:text,amenities:z.array(label).max(30),directionsUrl:safeLink.optional(),image:localImage.optional(),imageAlt:label.optional()}).strict(),
  demo:z.object({fictional:z.boolean(),description:text}).strict(),
  explore:z.object({activities:z.array(place).max(100),restaurants:z.array(place).max(100),delivery:z.array(place).max(100)}).strict(),
  turfGuide:z.object({title:label,sections:z.array(z.object({title:label,tips:z.array(text).max(30)}).strict()).max(30)}).strict(),
}).strict();
export function validateConfig(value){
  const c=configSchema.parse(value),players=Object.values(c.teams).flatMap(t=>t.players),pids=new Set(players.map(p=>p.id));
  const assert=(ok,message)=>{if(!ok)throw new Error('Tournament configuration: '+message);};
  assert(pids.size===players.length,'player IDs must be unique');
  assert(c.teams.usa.players.length===c.teams.europe.players.length,'both teams need the same number of players');
  assert(new Date(c.event.startsAt)<new Date(c.event.endsAt),'event end must follow its start');
  for(const [key,course] of Object.entries(c.courses)){
    assert(key===course.id,'course key must match its ID');assert(course.defaultTee<course.tees.length,'default tee must exist');
    assert(new Set(course.hcpIndex).size===18,'stroke indices must be a permutation');
    assert(course.pars.reduce((a,b)=>a+b,0)===course.par,'course par must match its holes');
    course.holes.forEach((h,i)=>assert(h.num===i+1&&h.par===course.pars[i]&&h.hcp===course.hcpIndex[i],'hole guide must match its scoring arrays'));
  }
  const places=Object.values(c.explore).flat();assert(new Set(places.map(p=>p.id)).size===places.length,'place IDs must be unique across categories');
  const sessions=c.schedule.flatMap(d=>d.sessions),sessionIds=new Set(),matchIds=new Set();
  assert(c.schedule.every((d,i)=>i===0||d.isoDate>c.schedule[i-1].isoDate),'day rows must be unique and chronological');
  for(const day of c.schedule)for(const session of day.sessions){
    assert(!sessionIds.has(session.id),'session IDs must be unique');sessionIds.add(session.id);
    assert(Object.hasOwn(c.courses,session.courseId)&&c.courses[session.courseId].name===session.course,'session course must resolve consistently');
    assert(session.participants.every(id=>pids.has(id))&&new Set(session.participants).size===session.participants.length,'session participants must be known and unique');
    assert(dateInZone(session.start,c.event.timezone)===day.isoDate,'session must fall on its declared local date');
    assert(Date.parse(session.start)>=Date.parse(c.event.startsAt)&&Date.parse(session.start)<=Date.parse(c.event.endsAt),'session must fall within the event');
    assert(Date.parse(sessionEnd(session.start))<=Date.parse(c.event.endsAt),'session must finish within the event');
    assert(day.sessions.every((s,i)=>i===0||Date.parse(s.start)>Date.parse(day.sessions[i-1].start)),'sessions must be chronological');
    const seen=new Set();
    for(const m of session.matches){
      assert(!matchIds.has(m.id),'match IDs must be unique');matchIds.add(m.id);
      for(const [field,teamKey] of [['usaPlayers','usa'],['euroPlayers','europe']]){
        assert(m.tbd?m[field].length===0:m[field].length===(m.type==='2v2'?2:1),'pairing sizes must match the format');
        for(const playerId of m[field]){assert(session.participants.includes(playerId)&&c.teams[teamKey].players.some(p=>p.id===playerId)&&!seen.has(playerId),'each player must play on their own side at most once per session');seen.add(playerId);}
      }
    }
    for(const teamKey of ['usa','europe']){const slots=session.matches.reduce((n,m)=>n+(m.type==='2v2'?2:1),0);assert(c.teams[teamKey].players.filter(p=>session.participants.includes(p.id)).length>=slots,'each team needs enough eligible participants for its matches');}
    assert(session.isCompetitive?session.matches.length>0:session.matches.length===0,'practice and competitive sessions must be distinct');
  }
  assert(sessions.some(s=>s.isCompetitive),'include at least one competitive session');
  c.schedule=calendarLabels(c.schedule,c.event.timezone);return c;
}
export function stateValidator(config){
  const players=Object.values(config.teams).flatMap(t=>t.players),pids=players.map(p=>p.id),sessions=config.schedule.flatMap(d=>d.sessions),sids=sessions.filter(s=>s.isCompetitive).map(s=>s.id),matches=sessions.flatMap(s=>s.matches),mids=matches.map(m=>m.id);
  const pid=id.refine(v=>pids.includes(v),'Unknown player');
  const result=z.discriminatedUnion('outcome',[
    z.object({outcome:z.literal('halved'),winner:z.null(),margin:z.literal('All Square'),source:z.enum(['manual','automatic'])}).strict(),
    z.object({outcome:z.literal('win'),winner:z.enum(['usa','europe']),margin:z.string().refine(v=>{
      if(/^[12]UP$/.test(v))return true;const m=/^(\d{1,2})&(\d)$/.exec(v);if(!m)return false;const a=Number(m[1]),b=Number(m[2]);return b>0&&a>b&&a<=18-b&&a<=b+2;
    },'Invalid match margin'),source:z.enum(['manual','automatic'])}).strict(),
  ]);
  const pairings=z.object({usaPlayers:z.array(pid).max(2),euroPlayers:z.array(pid).max(2)}).strict();
  const schema=z.object({schemaVersion:z.literal(1),eventId:z.literal(config.event.id),handicaps:keyed(pids,index),teeSelections:keyed(sids,z.union([integer.min(0),keyed(pids,integer.min(0))])),playerScores:keyed(sids,keyed(pids,z.array(score).length(18))),matchResults:keyed(mids,result),satPairings:keyed(mids,pairings),announcements:z.array(z.object({time:z.string().max(80),text:z.string().min(1).max(2000)}).strict()).max(200),scorecardPhotos:keyed(sids,z.object({id:z.string().uuid(),filename:z.string().max(100),timestamp:instant,bytes:integer.positive().max(750000),mime:z.enum(['image/jpeg','image/png'])}).strict()),ctpResults:z.record(z.string().max(100),z.object({player:z.union([pid,z.literal('')]),distance:z.string().max(80)}).strict()),mvpWinner:z.union([pid,z.literal('')]),paymentHandles:keyed(pids,z.string().max(140)),lodgingNotes:text,expenses:z.array(z.object({id,desc:z.string().min(1).max(200),amount:money,category:z.enum(['House','Food','Golf','Betting','Activities']),paidBy:pid,splitAmong:z.array(pid).min(1).max(80),date:civilDate}).strict()).max(500),lastUpdated:instant}).strict();
  return value=>{
    const state=schema.parse(value);
    const fail=message=>{throw new Error('Tournament state: '+message);};
    if(pids.some(id=>state.handicaps[id]===undefined))fail('every player needs a handicap');
    if(new Set(state.expenses.map(e=>e.id)).size!==state.expenses.length)fail('expense IDs must be unique');
    for(const exp of state.expenses)if(new Set(exp.splitAmong).size!==exp.splitAmong.length)fail('split participants must be unique');
    for(const session of sessions){
      const course=config.courses[session.courseId],selected=state.teeSelections[session.id];
      if(selected&&typeof selected==='object'&&Object.keys(selected).some(id=>!session.participants.includes(id)))fail('tee selection belongs to a nonparticipant');
      if(selected!==undefined){const values=typeof selected==='number'?[selected]:Object.values(selected);if(values.some(v=>v>=course.tees.length))fail('selected tee does not exist');}
      if(Object.keys(state.playerScores[session.id]??{}).some(id=>!session.participants.includes(id)))fail('score belongs to a nonparticipant');
      const seen=new Set();
      for(const original of session.matches){
        const overlay=state.satPairings[original.id];if(overlay&&!original.tbd)fail('only an unassigned match can have a pairing overlay');
        const m=overlay??original;if(original.tbd&&!overlay){if(state.matchResults[original.id])fail('an unassigned match cannot have a result');continue;}
        for(const [field,key] of [['usaPlayers','usa'],['euroPlayers','europe']]){
          if(m[field].length!==(original.type==='2v2'?2:1))fail('complete both sides of a pairing');
          for(const id of m[field]){if(seen.has(id)||!session.participants.includes(id)||!config.teams[key].players.some(p=>p.id===id))fail('player is duplicated or on the wrong team');seen.add(id);}
        }
      }
    }
    const ctpKeys=new Map(sessions.filter(s=>s.isCompetitive).flatMap(s=>{
      const holes=config.courses[s.courseId].holes.filter(h=>h.par===3).sort((a,b)=>a.yds-b.yds);return holes.length<2?[]:[[`${s.id}-${holes[0].num}`,s],[`${s.id}-${holes.at(-1).num}`,s]];
    }));
    if(Object.keys(state.ctpResults).some(key=>!ctpKeys.has(key)))fail('unknown closest-to-pin hole');
    for(const [key,entry] of Object.entries(state.ctpResults)){const session=ctpKeys.get(key);if(entry.player&&!session.participants.includes(entry.player))fail('closest-to-pin winner did not participate in this session');}
    const engine=createEngine(config);
    for(const session of sessions)for(const original of session.matches){
      const given=state.matchResults[original.id];if(given?.source!=='automatic')continue;
      const expected=engine.computeMatchResult(engine.applyPairings(original,state),session.id,state);
      if(!expected||given.winner!==expected.winner||given.margin!==expected.margin||given.outcome!==expected.outcome)fail('automatic result does not match the current scorecard');
    }
    return state;
  };
}
