import config from './config.mjs';
import {createEngine} from './engine.mjs';
import {sessionEnd,SESSION_DURATION_HOURS} from './calendar.mjs';

export {config};
export const TEAMS=config.teams;
export const ALL_PLAYERS=Object.values(TEAMS).flatMap(t=>t.players);
export const getPlayer=id=>ALL_PLAYERS.find(p=>p.id===id);
export const getTeamForPlayer=id=>Object.keys(TEAMS).find(key=>TEAMS[key].players.some(p=>p.id===id));
export const SCHEDULE=config.schedule;
export const SESSIONS=SCHEDULE.flatMap(d=>d.sessions);
export const COMPETITIVE=SESSIONS.filter(s=>s.isCompetitive);
export const COURSE_DATA=Object.fromEntries(Object.entries(config.courses).map(([id,c])=>[id,{...c,teeData:c.tees}]));
export const TEE_DATA=Object.fromEntries(COMPETITIVE.map(s=>[s.id,{...config.courses[s.courseId],courseName:config.courses[s.courseId].name}]));
export const SEED_HANDICAPS=Object.fromEntries(ALL_PLAYERS.map(p=>[p.id,p.handicap]));
export const SESSION_STARTS=Object.fromEntries(SESSIONS.map(s=>[s.id,new Date(s.start)]));
export const FIRST_TEE=new Date(COMPETITIVE[0].start);
export const TOTAL_POINTS=COMPETITIVE.reduce((sum,s)=>sum+s.matches.length,0);
export const EXPLORE_ACTIVITIES=config.explore.activities;
export const EXPLORE_RESTAURANTS=config.explore.restaurants;
export const EXPLORE_DELIVERY=config.explore.delivery;
export const TURF_INTEL=config.turfGuide;
export const CTP_HOLES=COMPETITIVE.flatMap(session=>{
  const course=COURSE_DATA[session.courseId],eligible=course.holes.filter(h=>h.par===3).sort((a,b)=>a.yds-b.yds);
  if(eligible.length<2)return [];
  return [eligible[0],eligible.at(-1)].map((h,i)=>({hole:h.num,par:3,sid:session.id,yds:h.yds,name:h.name,tag:i?'Longest Par 3':'Shortest Par 3',course:course.name}));
});
export function civilParts(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:config.event.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};
}
export function getEventContext(now=new Date()){
  const {date}=civilParts(now),todayIdx=SCHEDULE.findIndex(d=>d.isoDate===date);
  const start=new Date(config.event.startsAt),end=new Date(config.event.endsAt);
  const phase=now<start?'pre':now>end?'post':'during';
  const sessions=SCHEDULE.flatMap((day,dayIdx)=>day.sessions.map(s=>({...s,dayIdx,dayLabel:day.label,dayName:day.day,dayDate:day.date,startTime:new Date(s.start),endTime:new Date(sessionEnd(s.start))}))).sort((a,b)=>a.startTime-b.startTime);
  const cur=sessions.findLast(s=>now>=s.startTime&&now<s.endTime)??null;
  const next=sessions.find(s=>now<s.startTime)??null,last=sessions.findLast(s=>now>=s.endTime)??null;
  const compDays=SCHEDULE.filter(d=>d.sessions.some(s=>s.isCompetitive));
  const active=[cur,next,last].find(s=>s?.isCompetitive)??sessions.find(s=>s.isCompetitive);
  const compDayIdx=phase==='post'?compDays.length-1:Math.max(0,compDays.findIndex(d=>d.sessions.some(s=>s.id===active?.id)));
  return {phase,todayIdx,daysUntil:phase==='pre'?Math.ceil((start-now)/86400000):0,cur,next,last,compDayIdx,sessionId:active.id,courseKey:(cur??next??last??active).courseId};
}
export const WEATHER_SESSIONS=SESSIONS.map(s=>{
  const start=civilParts(new Date(s.start));return {id:s.id,label:s.format,date:start.date,startHour:start.hour,endHour:start.hour+SESSION_DURATION_HOURS,start:s.start,end:sessionEnd(s.start),course:s.course,comp:s.isCompetitive};
});
export function buildSeedData(){
  const playerScores={},engine=createEngine(config);let seed=92171;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  COMPETITIVE.slice(0,2).forEach((session,si)=>{
    playerScores[session.id]={};
    ALL_PLAYERS.forEach(player=>{
      const strokes=engine.allocateStrokes(engine.getCourseHC(player.handicap,session.id,{},player.id),COURSE_DATA[session.courseId].hcpIndex);
      playerScores[session.id][player.id]=COURSE_DATA[session.courseId].pars.map((par,hole)=>si===1&&hole>7?'':String(Math.max(1,par+strokes.get(hole)+(random()<.19?-1:Math.floor(random()*3)))));
    });
  });
  const state={schemaVersion:1,eventId:config.event.id,handicaps:{...SEED_HANDICAPS},teeSelections:{},playerScores,matchResults:{},satPairings:{},announcements:[],scorecardPhotos:{},ctpResults:{},mvpWinner:'',paymentHandles:{},lodgingNotes:'',expenses:[{id:'demo-supplies',desc:'Sketchbooks and pencils (invented)',amount:23.05,category:'Activities',paidBy:'p03',splitAmong:['p01','p03','p06'],date:'2030-05-06'},{id:'demo-snacks',desc:'Picnic supplies (invented)',amount:37.11,category:'Food',paidBy:'p07',splitAmong:ALL_PLAYERS.map(p=>p.id),date:'2030-05-07'}],lastUpdated:'2030-05-08T10:30:00Z'};
  for(const session of COMPETITIVE){const results=engine.tryAutoCalcResults(session.id,state);if(results)state.matchResults=results;}
  return state;
}
export function computePoints(data){
  const points={usa:0,europe:0};
  for(const match of COMPETITIVE.flatMap(s=>s.matches)){
    const result=data.matchResults?.[match.id];
    if(result?.outcome==='halved'){points.usa+=.5;points.europe+=.5;}
    else if(result?.outcome==='win'&&Object.hasOwn(points,result.winner))points[result.winner]++;
  }
  return points;
}

export function buildEmptyData(settings=config){
 return {schemaVersion:1,eventId:settings.event.id,handicaps:Object.fromEntries(Object.values(settings.teams).flatMap(t=>t.players).map(p=>[p.id,p.handicap])),teeSelections:{},playerScores:{},matchResults:{},satPairings:{},announcements:[],scorecardPhotos:{},ctpResults:{},mvpWinner:'',paymentHandles:{},lodgingNotes:'',expenses:[],lastUpdated:new Date().toISOString()};
}
export function recalculate(settings,value){
 const engine=createEngine(settings),state=structuredClone(value);
 state.matchResults=Object.fromEntries(Object.entries(state.matchResults??{}).filter(([,r])=>r.source!=='automatic'));
 for(const session of settings.schedule.flatMap(d=>d.sessions).filter(s=>s.isCompetitive)){const results=engine.tryAutoCalcResults(session.id,state);if(results)state.matchResults=results;}
 return state;
}
