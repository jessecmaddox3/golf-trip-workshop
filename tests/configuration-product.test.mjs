import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.mjs';
import {validateConfig,stateValidator} from '../src/schema.mjs';
import {buildEmptyData} from '../src/model.mjs';
import {createEngine} from '../src/engine-core.mjs';

function rename(value,names){
 if(Array.isArray(value))return value.map(v=>rename(v,names));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[names[k]??k,rename(v,names)]));
 return typeof value==='string'?(names[value]??value):value;
}
test('hyphenated player and session IDs preserve distinct statistical rounds',()=>{
 const settings=validateConfig(rename(config,{p01:'a-b',p02:'a','match-a':'c','match-b':'b-c'})),state=buildEmptyData(settings);
 state.playerScores.c={'a-b':Array(18).fill(4)};state.playerScores['b-c']={a:Array(18).fill(5)};stateValidator(settings)(state);
 const stats=createEngine(settings).computeFunStats(state),best=stats.find(s=>s.title==='Best Gross Round'),worst=stats.find(s=>s.title==='Worst Gross Round');
 assert.equal(best.value,72);assert.match(best.detail,/Iris/);assert.equal(worst.value,90);assert.match(worst.detail,/Milo/);
});
test('team statistics use configured names and flags',()=>{
 const settings=structuredClone(config);settings.teams.usa.name='Lantern';settings.teams.europe.name='Orchard';settings.teams.usa.flag='🏮';settings.teams.europe.flag='🍎';
 const state=buildEmptyData(settings);state.playerScores['match-a']={p01:Array(18).fill(4),p05:Array(18).fill(5)};
 const stats=createEngine(settings).computeFunStats(state);
 for(const name of ['Lantern','Orchard'])for(const suffix of ['Avg vs Par','Birdie Count'])assert.ok(stats.some(s=>s.title===name+' '+suffix));
 assert.equal(stats.find(s=>s.title==='Lantern Avg vs Par').emoji,'🏮');
});
test('different courses with the same display name retain separate course records',()=>{
 const settings=structuredClone(config),sessions=settings.schedule.flatMap(d=>d.sessions).filter(s=>s.isCompetitive),a=sessions[0],b=sessions[1];
 for(const id of [a.courseId,b.courseId])settings.courses[id].name='Shared course name';
 for(const session of settings.schedule.flatMap(d=>d.sessions))session.course=settings.courses[session.courseId].name;
 validateConfig(settings);const state=buildEmptyData(settings);state.playerScores[a.id]={p01:Array(18).fill(4)};state.playerScores[b.id]={p02:Array(18).fill(5)};
 const records=createEngine(settings).computeFunStats(state).filter(s=>s.title==='Best at Shared course name');assert.deepEqual(records.map(s=>s.value).sort((a,b)=>a-b),[72,90]);
});
test('private events can configure course directions and distinct local maps',()=>{
 const settings=structuredClone(config),course=Object.values(settings.courses)[0];
 course.directionsUrl='https://maps.example.invalid/course';course.mapImage='/private/course-one.svg';course.mapAlt='Owner supplied course diagram';
 assert.equal(validateConfig(settings).courses[course.id].mapImage,course.mapImage);
 course.directionsUrl='javascript:alert(1)';assert.throws(()=>validateConfig(settings));
 course.directionsUrl='https://maps.example.invalid/course';course.mapImage='https://images.example.invalid/track.png';assert.throws(()=>validateConfig(settings));
});
test('a subset session rejects a tee record for a player who is not playing',()=>{
 const settings=structuredClone(config),session=settings.schedule.flatMap(d=>d.sessions).find(s=>s.id==='match-a');session.matches=session.matches.slice(0,1);session.participants=[...session.matches[0].usaPlayers,...session.matches[0].euroPlayers];validateConfig(settings);
 const state=buildEmptyData(settings),absent=Object.values(settings.teams).flatMap(t=>t.players).find(p=>!session.participants.includes(p.id));state.teeSelections[session.id]={[absent.id]:0};
 assert.throws(()=>stateValidator(settings)(state),/nonparticipant/);
});
