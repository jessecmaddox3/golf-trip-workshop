import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.mjs';
import {createEngine} from '../src/engine.mjs';

function fixture(){
  const settings=structuredClone(config);
  for(const team of Object.values(settings.teams))for(const p of team.players)p.handicap=0;
  for(const course of Object.values(settings.courses)){
    course.pars=Array(18).fill(4);course.par=72;course.hcpIndex=Array.from({length:18},(_,i)=>i+1);
    course.tees=[{tee:'Test',rating:72,slope:113,yds:'6,000'}];course.defaultTee=0;
  }
  const sid='match-b',match=settings.schedule.flatMap(d=>d.sessions).find(s=>s.id===sid).matches[0];
  const data={handicaps:Object.fromEntries(Object.values(settings.teams).flatMap(t=>t.players).map(p=>[p.id,p.handicap])),teeSelections:{},playerScores:{[sid]:{p01:Array(18).fill(4),p05:Array(18).fill(4)}},matchResults:{},satPairings:{}};
  return {settings,engine:createEngine(settings),sid,match,data};
}
test('a two-hole lead made on the last hole is 2UP',()=>{
  const {engine,sid,match,data}=fixture();data.playerScores[sid].p01[16]=3;data.playerScores[sid].p01[17]=3;
  assert.equal(engine.computeMatchResult(match,sid,data).margin,'2UP');
});
test('an early clinch can be recorded without inventing the remaining scores',()=>{
  const {engine,sid,match,data}=fixture();data.playerScores[sid].p01=Array(10).fill(3).concat(Array(8).fill(null));data.playerScores[sid].p05=Array(10).fill(4).concat(Array(8).fill(null));
  assert.equal(engine.computeMatchResult(match,sid,data).margin,'10&8');
});
test('a tied complete match is halved; a gap before resolution remains incomplete',()=>{
  const {engine,sid,match,data}=fixture();assert.equal(engine.computeMatchResult(match,sid,data).outcome,'halved');
  data.playerScores[sid].p01[5]=null;assert.equal(engine.computeMatchResult(match,sid,data),null);
});
test('current handicaps allocate all53strokes, including a third stroke on a hole',()=>{
  const {engine,sid,match,data}=fixture();data.handicaps.p01=53;
  const result=engine.getMatchStrokes(match,sid,data).p01;
  assert.equal([...result.strokeHoles.values()].reduce((a,b)=>a+b,0),53);
  assert.equal(result.strokeHoles.get(0),3);assert.equal(result.strokeHoles.get(17),2);
});
test('a plus handicap gives strokes back at stroke indices18and17',()=>{
  const {engine,sid,match,data}=fixture();data.handicaps.p01=-2;
  const result=engine.getMatchStrokes(match,sid,data).p01;
  assert.equal(result.courseHC,-2);assert.equal(result.strokeHoles.get(17),-1);assert.equal(result.strokeHoles.get(16),-1);
});
test('relative match mode applies its allowance to unrounded differences',()=>{
  const {settings,sid,match,data}=fixture();settings.handicapping={mode:'relative-match',singlesAllowance:1,betterBallAllowance:.9};
  data.handicaps.p01=10.4;data.handicaps.p05=18.1;
  const strokes=createEngine(settings).getMatchStrokes(match,sid,data);
  assert.equal(strokes.p01.strokes,0);assert.equal(strokes.p05.strokes,8);
});
test('score correction updates automatic results; clearing a score removes an automatic result',()=>{
  const {engine,sid,match,data}=fixture();data.matchResults[match.id]={outcome:'win',winner:'usa',margin:'1UP',source:'automatic'};
  let updated=engine.tryAutoCalcResults(sid,data);assert.equal(updated[match.id].outcome,'halved');assert.equal(updated[match.id].source,'automatic');
  data.playerScores[sid].p01[0]=null;updated=engine.tryAutoCalcResults(sid,data);assert.equal(updated[match.id],undefined);
});
test('manual result overrides remain explicit',()=>{
  const {engine,sid,match,data}=fixture();data.matchResults[match.id]={outcome:'win',winner:'usa',margin:'2UP',source:'manual'};
  assert.equal(engine.tryAutoCalcResults(sid,data),null);
});
test('unknown course/tee and malformed handicaps cannot silently become scratch',()=>{
  const {engine,sid}=fixture();assert.throws(()=>engine.getCourseHC('garbage',sid,{},'p01'));
  assert.throws(()=>engine.getCourseHC(7,'missing',{},'p01'));
  assert.throws(()=>engine.getCourseHC(7,sid,{[sid]:99},'p01'));
});
test('a one-cent obligation is paid and no cent disappears in a split',()=>{
  const {engine}=fixture();
  assert.deepEqual(engine.computeSettlements([{amount:.01,paidBy:'p01',splitAmong:['p05']}],['p01','p05']),[{from:'p05',to:'p01',amount:.01}]);
  const expenses=[{amount:.05,paidBy:'p01',splitAmong:['p05','p01','p02']}];
  const balances=engine.computeBalances(expenses,['p01','p02','p05']);
  assert.equal(Object.values(balances).reduce((a,b)=>a+b,0),0);
  assert.deepEqual(balances,{p01:3,p02:-2,p05:-1});
});
test('settlement rejects empty splits, unknown players and fractional cents',()=>{
  const {engine}=fixture();for(const expense of [{amount:1,paidBy:'p01',splitAmong:[]},{amount:1,paidBy:'other',splitAmong:['p01']},{amount:.005,paidBy:'p01',splitAmong:['p05']}])assert.throws(()=>engine.computeSettlements([expense],['p01','p05']));
});
test('nine arbitrary filled holes are not a front nine or full round',()=>{
  const {engine,sid,data}=fixture();data.playerScores={[sid]:{p01:[null,...Array(9).fill(4),...Array(8).fill(null)]}};
  const stats=engine.computeFunStats(data);assert.equal(stats.some(s=>['Best Gross Round','Worst Gross Round','Best Front 9'].includes(s.title)),false);
});
test('a complete front nine is useful before the back nine is played',()=>{
  const {engine,sid,data}=fixture();data.playerScores={[sid]:{p01:[...Array(9).fill(4),...Array(9).fill(null)]}};
  assert.equal(engine.computeFunStats(data).find(s=>s.title==='Best Front 9')?.value,36);
});
test('an extra cell cannot become a nineteenth hole in statistics',()=>{
  const {engine,sid,data}=fixture();data.playerScores={[sid]:{p01:Array(19).fill(4)}};
  assert.equal(engine.computeFunStats(data).find(s=>s.title==='Best Gross Round')?.value,72);
});
test('players cannot be assigned to the opposite team',()=>{
  const {engine,sid,match,data}=fixture();const swapped={...match,usaPlayers:match.euroPlayers,euroPlayers:match.usaPlayers};
  assert.throws(()=>engine.getMatchStrokes(swapped,sid,data));
});
test('numeric helpers reject booleans, arrays, objects and whitespace',()=>{
  const {engine,sid}=fixture();
  for(const value of [true,false,[],[4],{},' ']){
    assert.equal(engine.scoreValue(value),null);
    assert.throws(()=>engine.getCourseHC(value,sid,{},'p01'));
    assert.throws(()=>engine.computeBalances([{amount:value,paidBy:'p01',splitAmong:['p05']}],['p01','p05']));
  }
});
