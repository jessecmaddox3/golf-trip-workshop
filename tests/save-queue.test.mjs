import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveQueue} from '../src/save-queue.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('background refresh adopts newer clean snapshots and never regresses',()=>{
 const q=new SaveQueue({scope:'event:owner',revision:1,value:{score:1},persist:()=>{},remote:()=>{}});
 q.observe({revision:3,value:{score:3}});assert.equal(q.value.score,3);assert.equal(q.revision,3);assert.equal(q.status,'saved');
 q.observe({revision:2,value:{score:2}});assert.equal(q.value.score,3);
});
test('background refresh preserves a draft and catches a newer edit after a delayed receipt',async()=>{
 const d=deferred();let cmd;const q=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:()=>{},remote:c=>{cmd=c;return d.promise;}});
 q.stage({score:1});q.observe({revision:2,value:{score:9}});assert.equal(q.value.score,1);
 d.resolve({operationId:cmd.operationId,revision:1});await tick();assert.equal(q.status,'conflict');assert.equal(q.value.score,1);assert.equal(q.conflict.value.score,9);
 q.observe({revision:3,value:{score:12}});q.acceptServer();assert.equal(q.value.score,12);
});
test('a late older conflict response cannot replace the newest observed server copy',async()=>{
 for(const resolve of ['accept','rebase']){
  const d=deferred();let next;
  const q=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:()=>{},remote:cmd=>{if(cmd.baseRevision===0)return d.promise;next=cmd;return Promise.resolve({operationId:cmd.operationId,revision:3});}});
  q.stage({score:10});q.observe({revision:2,value:{score:2}});d.reject(Object.assign(new Error('conflict'),{code:'CONFLICT',details:{revision:1,value:{score:1}}}));await tick();
  assert.equal(q.conflict.revision,2);
  if(resolve==='accept'){q.acceptServer();assert.equal(q.value.score,2);assert.equal(q.revision,2);}else{q.rebaseLocal();await tick();assert.equal(next.baseRevision,2);assert.equal(next.value.score,10);}
 }
});
test('a delayed acknowledgement cannot clear a newer local draft',async()=>{
 const requests=[],journal=[];
 const q=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:v=>journal.push(structuredClone(v)),remote:cmd=>{const d=deferred();requests.push({cmd,d});return d.promise;}});
 q.stage({score:1});q.stage({score:2});assert.equal(requests.length,1);assert.equal(journal.at(-1).desired.score,2);
 requests[0].d.resolve({operationId:requests[0].cmd.operationId,revision:1});await tick();
 assert.equal(requests.length,2);assert.equal(requests[1].cmd.value.score,2);assert.equal(requests[1].cmd.baseRevision,1);assert.equal(q.status,'saving');
 requests[1].d.resolve({operationId:requests[1].cmd.operationId,revision:2});await tick();assert.equal(q.status,'saved');assert.equal(q.value.score,2);
});
test('lost-response retry uses the same immutable operation after page recovery',async()=>{
 let saved,first;const q=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:v=>saved=structuredClone(v),remote:cmd=>{first=cmd;return Promise.reject(new Error('offline'));}});
 q.stage({score:1});await tick();assert.equal(q.status,'offline');
 const calls=[],recovered=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},recovery:saved,persist:()=>{},remote:async cmd=>{calls.push(cmd);return {operationId:cmd.operationId,revision:1};}});
 recovered.retry();await tick();assert.deepEqual(calls[0],first);assert.equal(recovered.status,'saved');
});
test('account changes retire callbacks and never reuse a different scope journal',async()=>{
 const d=deferred(),events=[];let journal;
 const q=new SaveQueue({scope:'event:person-a',revision:0,value:{a:0},persist:v=>journal=v,onChange:v=>events.push(v.status),remote:()=>d.promise});q.stage({a:1});q.dispose();const length=events.length;
 d.resolve({operationId:journal.flight.operationId,revision:1});await tick();assert.equal(events.length,length);
 assert.throws(()=>new SaveQueue({scope:'event:person-b',revision:0,value:{a:0},recovery:journal,persist:()=>{},remote:()=>{}}),/different identity/);
});
test('conflict retains base, local and server versions until explicit resolution',async()=>{
 let journal;const q=new SaveQueue({scope:'event:owner',revision:2,value:{score:2},persist:v=>journal=structuredClone(v),remote:async()=>{throw Object.assign(new Error('newer edit'),{code:'CONFLICT',details:{revision:3,value:{score:9}}});}});
 q.stage({score:4});await tick();assert.equal(q.status,'conflict');assert.equal(journal.base.score,2);assert.equal(journal.desired.score,4);assert.equal(journal.conflict.value.score,9);
 q.stage({score:5});await tick();assert.equal(q.status,'conflict');assert.equal(q.value.score,5);
 q.acceptServer();assert.equal(q.status,'saved');assert.equal(q.value.score,9);assert.equal(q.revision,3);
});
test('pending changes are persisted before any network request; storage failure is visible',()=>{
 let calls=0;const q=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:()=>{throw new Error('storage full');},remote:()=>{calls++;}});
 assert.throws(()=>q.stage({score:1}),/storage full/);assert.equal(calls,0);assert.notEqual(q.status,'saved');
});
test('a recovered old receipt cannot replace the newer server snapshot loaded at startup',async()=>{
 let recovery,command;
 const old=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:j=>recovery=structuredClone(j),remote:cmd=>{command=cmd;return Promise.reject(new Error('lost response'));}});
 old.stage({score:1});await tick();old.dispose();
 const fresh=new SaveQueue({scope:'event:owner',revision:2,value:{score:2},recovery,persist:()=>{},remote:async()=>({operationId:command.operationId,revision:1})});
 fresh.retry();await tick();assert.equal(fresh.status,'conflict');assert.deepEqual(fresh.conflict,{revision:2,value:{score:2}});
 fresh.acceptServer();assert.equal(fresh.revision,2);assert.equal(fresh.value.score,2);
});
test('a recovered conflict uses the newest loaded server for accept and rebase',async()=>{
 let recovery;const first=new SaveQueue({scope:'event:owner',revision:0,value:{score:0},persist:j=>recovery=structuredClone(j),remote:async()=>{throw Object.assign(new Error('conflict'),{code:'CONFLICT',details:{revision:1,value:{score:1}}});}});
 first.stage({score:10});await tick();first.dispose();
 const accepted=new SaveQueue({scope:'event:owner',revision:2,value:{score:2},recovery,persist:()=>{},remote:()=>{}});accepted.acceptServer();assert.equal(accepted.revision,2);assert.equal(accepted.value.score,2);
 let command;const rebased=new SaveQueue({scope:'event:owner',revision:2,value:{score:2},recovery,persist:()=>{},remote:async cmd=>{command=cmd;return {operationId:cmd.operationId,revision:3};}});rebased.rebaseLocal();await tick();assert.equal(command.baseRevision,2);assert.equal(command.value.score,10);
});
