import test from 'node:test';
import assert from 'node:assert/strict';
import {makeQueue,setRuntime,recoveryKey,hasPendingChanges} from '../src/client.mjs';
function environment(){
 const held=new Set(),memory=new Map();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{async request(name,options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}}}});
 globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 globalThis.fetch=async()=>{throw new Error('offline test');};
 setRuntime({eventId:'invented-test',principal:{id:'owner',respondent:null},canEdit:true});return {memory,held};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('another tab cannot overwrite a pending journal owned by the first tab',async()=>{
 const {memory}=environment(),q=await makeQueue('event',{revision:0,value:{score:0}},()=>{});
 q.stage({score:9});await tick();const key=recoveryKey('event','owner'),saved=memory.get(key);
 await assert.rejects(makeQueue('event',{revision:1,value:{score:1}},()=>{}),/another tab/i);
 assert.equal(memory.get(key),saved);assert.equal(hasPendingChanges(),true);q.dispose();await tick();
 const recovered=await makeQueue('event',{revision:1,value:{score:1}},()=>{});assert.equal(recovered.value.score,9);assert.equal(recovered.journal().dirty,true);recovered.dispose();
});
test('lease is released if damaged recovery prevents queue construction',async()=>{
 const {memory,held}=environment();memory.set(recoveryKey('event','owner'),'{broken');
 await assert.rejects(makeQueue('event',{revision:0,value:{score:0}},()=>{}),/unreadable/);await tick();assert.equal(held.size,0);
});
test('event and own poll queues have separate leases',async()=>{
 environment();const event=await makeQueue('event',{revision:0,value:{}},()=>{}),poll=await makeQueue('poll',{revision:0,value:{}},()=>{});event.dispose();poll.dispose();
});
