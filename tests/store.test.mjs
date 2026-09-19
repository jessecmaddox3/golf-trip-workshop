import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalStore} from '../server/store.mjs';

async function fixture(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'golf-store-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new LocalStore({dir,eventId:'invented-event',configHash:'fixture-config',...options});
 await store.initialize({event:{score:0}});return {dir,store};
}
const command=(operationId,baseRevision,value)=>({operationId,baseRevision,value});
test('concurrent writers across separate store instances cannot both overwrite a revision',async t=>{
 const {dir,store}=await fixture(t),other=new LocalStore({dir,eventId:'invented-event',configHash:'fixture-config'});
 const results=await Promise.allSettled([store.commit('event',command('op-a',0,{score:1})),other.commit('event',command('op-b',0,{score:2}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'CONFLICT');
 assert.equal((await store.read('event')).revision,1);
});
test('lost acknowledgement retry returns the original receipt after a later edit',async t=>{
 const {store}=await fixture(t),cmd=command('op-a',0,{score:1});
 const first=await store.commit('event',cmd);
 await store.commit('event',command('op-b',1,{score:2}));
 assert.deepEqual(await store.commit('event',cmd),first);
 assert.equal((await store.read('event')).value.score,2);
 await assert.rejects(store.commit('event',command('op-a',0,{score:3})),{code:'OPERATION_REUSED'});
});
test('a failed pre-rename write leaves the previous durable document',async t=>{
 const {dir,store}=await fixture(t);
 const crashing=new LocalStore({dir,eventId:'invented-event',configHash:'fixture-config',beforeRename:()=>{throw new Error('simulated crash');}});
 await assert.rejects(crashing.commit('event',command('op-a',0,{score:1})),/simulated crash/);
 assert.equal((await store.read('event')).value.score,0);
});
test('a lost response after rename remains recoverable by operation receipt',async t=>{
 const {dir,store}=await fixture(t);
 const crashing=new LocalStore({dir,eventId:'invented-event',configHash:'fixture-config',afterRename:()=>{throw new Error('lost response');}});
 const cmd=command('op-a',0,{score:1});await assert.rejects(crashing.commit('event',cmd),/lost response/);
 assert.equal((await store.commit('event',cmd)).revision,1);
});
test('missing/corrupt bound stores never silently reset the event',async t=>{
 const {dir,store}=await fixture(t);
 await writeFile(join(dir,'state.json'),'{broken');await assert.rejects(store.initialize({event:{score:0}}),{code:'STORE_DAMAGED'});
 await rm(join(dir,'state.json'));await assert.rejects(store.initialize({event:{score:0}}),{code:'STORE_DAMAGED'});
});
test('a changed event/config binding requires explicit migration or a separate folder',async t=>{
 const {dir}=await fixture(t),other=new LocalStore({dir,eventId:'other-event',configHash:'different'});
 await assert.rejects(other.initialize({event:{score:999}}),{code:'STORE_BINDING'});
});
test('separate respondent records do not get overwritten by full tournament saves',async t=>{
 const {store}=await fixture(t);
 await store.commit('poll-p01',command('poll-a',0,{suggestion:'invented idea'}));
 await store.commit('event',command('event-a',0,{score:3}));
 assert.equal((await store.read('poll-p01')).value.suggestion,'invented idea');
});
test('photo bytes and daily quotas are durable and bounded',async t=>{
 const {dir,store}=await fixture(t);
 await store.putPhoto('photo-1',{mime:'image/png',data:'aGVsbG8='});
 assert.deepEqual(await store.getPhoto('photo-1'),{mime:'image/png',data:'aGVsbG8='});
 assert.equal(await store.reserveQuota('ocr-2030-05-06',2),1);
 assert.equal(await store.reserveQuota('ocr-2030-05-06',2),2);
 await assert.rejects(store.reserveQuota('ocr-2030-05-06',2),{code:'QUOTA'});
 assert.equal((await readFile(join(dir,'state.json'),'utf8')).includes('invented-event'),true);
});
