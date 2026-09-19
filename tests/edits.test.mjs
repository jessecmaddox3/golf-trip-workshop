import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.mjs';
import {buildEmptyData,recalculate} from '../src/model.mjs';
import {validateConfig,stateValidator} from '../src/schema.mjs';
import {setPlayerTee,playedTotals,removeManualOverride} from '../src/edits.mjs';
test('promoting a shared tee preserves every other eligible player’s choice',()=>{
 const data=buildEmptyData(config);data.teeSelections['match-a']=2;
 const result=setPlayerTee(config,data,'match-a','p01',0),s=config.schedule.flatMap(d=>d.sessions).find(s=>s.id==='match-a');
 assert.equal(result.teeSelections['match-a'].p01,0);for(const id of s.participants.filter(p=>p!=='p01'))assert.equal(result.teeSelections['match-a'][id],2);
 assert.equal(data.teeSelections['match-a'],2);assert.throws(()=>setPlayerTee(config,data,'match-a','unknown',0));
 const next=setPlayerTee(config,result,'match-a','p02',1);assert.equal(next.teeSelections['match-a'].p01,0);assert.equal(next.teeSelections['match-a'].p03,2);
});
test('partial totals use only played-hole strokes, including negative and zero net',()=>{
 assert.deepEqual(playedTotals([4,null,''],new Map([[1,7]])),{gross:4,net:4,thru:1,strokes:0});
 assert.deepEqual(playedTotals([1,null],new Map([[0,1]])),{gross:1,net:0,thru:1,strokes:1});
 assert.deepEqual(playedTotals([1,null],new Map([[0,2]])),{gross:1,net:-1,thru:1,strokes:2});
 assert.deepEqual(playedTotals([4,null],new Map([[0,-1]])),{gross:4,net:5,thru:1,strokes:-1});
});
test('removing a manual override preserves the scorecard and resumes automatic results',()=>{
 const data=buildEmptyData(config),session=config.schedule.flatMap(d=>d.sessions).find(s=>s.id==='match-b'),m=session.matches[0];
 data.playerScores[session.id]={};for(const id of [...m.usaPlayers,...m.euroPlayers])data.playerScores[session.id][id]=config.courses[session.courseId].pars;
 data.matchResults[m.id]={outcome:'halved',winner:null,margin:'All Square',source:'manual'};
 const result=recalculate(config,removeManualOverride(data,m.id));
 assert.deepEqual(result.playerScores,data.playerScores);assert.equal(result.matchResults[m.id].source,'automatic');assert.equal(data.matchResults[m.id].source,'manual');
});
test('closest-to-pin owner lookup is exact when session IDs share a prefix',()=>{
 const settings=structuredClone(config),practice=settings.schedule.flatMap(d=>d.sessions).find(s=>!s.isCompetitive);practice.id='match';practice.participants=['p01'];validateConfig(settings);
 const data=buildEmptyData(settings),session=settings.schedule.flatMap(d=>d.sessions).find(s=>s.id==='match-a'),hole=settings.courses[session.courseId].holes.filter(h=>h.par===3).sort((a,b)=>a.yds-b.yds)[0];
 data.ctpResults[session.id+'-'+hole.num]={player:'p02',distance:'3 ft'};assert.doesNotThrow(()=>stateValidator(settings)(data));
});
