import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../poll.config.json' with {type:'json'};
import {createPoll,validatePollConfig} from '../src/poll-core.mjs';
test('arbitrary configured choices validate and aggregate without demo IDs',()=>{
 const c=structuredClone(source);for(const key of ['bases','driving','mustPlay','dates','arrival'])c[key].forEach((o,i)=>o.id=key.toLowerCase()+'-choice-'+i);
 const poll=createPoll(c),answer=poll.blankAnswer();answer.baseRatings[c.bases[0].id]=4;answer.dates[c.dates[0].id]='maybe';answer.mustPlay=[c.mustPlay[1].id];answer.driving=c.driving[0].id;
 assert.deepEqual(poll.validateAnswer(answer),answer);const summary=poll.summarize({person:answer});assert.equal(summary.baseRatings[c.bases[0].id].mean,4);assert.equal(summary.dates[c.dates[0].id].maybe,1);assert.equal(summary.driving[c.driving[0].id],1);
 assert.throws(()=>poll.validateAnswer({...answer,arrival:'unknown'}));
});
test('config rejects duplicate choices; answers distinguish blanks, missing and invalid ratings',()=>{
 const c=structuredClone(source);c.bases.push(c.bases[0]);assert.throws(()=>validatePollConfig(c));
 const p=createPoll(source),blank=p.blankAnswer();assert.equal(p.summarize({}).respondents,0);assert.equal(p.summarize({person:blank}).baseRatings[source.bases[0].id].count,0);
 for(const bad of [{baseRatings:{[source.bases[0].id]:0}},{mustPlay:source.mustPlay.slice(0,3).map(x=>x.id)},{dates:{[source.dates[0].id]:'unsure'}},{suggestion:'x'.repeat(2001)}])assert.throws(()=>p.validateAnswer({...blank,...bad}));
});
