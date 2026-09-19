import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import config from '../src/config.mjs';
import {buildSeedData} from '../src/model.mjs';
import {LocalStore,digest} from '../server/store.mjs';
import {createApplication,makeRegistry} from '../server/app.mjs';
import {blankAnswer} from '../src/poll.mjs';
async function fixture(t,mode='demo'){
 const dir=await mkdtemp(join(tmpdir(),'golf-api-test-')),store=new LocalStore({dir,eventId:config.event.id,configHash:digest(config)});
 const registry=makeRegistry(config);let calls=0;
 const app=await createApplication({config,store,mode,registry,initialState:buildSeedData(),ocr:{enabled:true,dailyLimit:2,read:async()=>{calls++;return {notation:'strokes',players:[{name:'Invented',scores:Array(18).fill(4)}]};}}});
 const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const req=async(path,{method='GET',body,cookie,actor,origin=base,headers={}}={})=>{
  const res=await fetch(base+path,{method,redirect:'manual',headers:{...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(actor?{'X-Golf-Actor':actor}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const type=res.headers.get('content-type')??'';return {status:res.status,body:type.includes('json')?await res.json():await res.text(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 const login=async(actor)=>{const r=await req('/api/demo/login',{method:'POST',body:{actor}});assert.equal(r.status,200);return {cookie:r.cookie,actor};};
 return {req,login,store,registry,calls:()=>calls,base};
}
test('demo sign-in is explicit, writes require origin and the captured actor',async t=>{
 const {req,login}=await fixture(t);
 assert.equal((await req('/api/event')).status,401);
 const owner=await login('owner'),loaded=await req('/api/event',owner);assert.equal(loaded.status,200);
 const cmd={baseRevision:0,operationId:randomUUID(),value:loaded.body.value};
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd,origin:'https://unrelated.invalid'})).status,403);
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd,actor:'p02'})).body.code,'ACCOUNT_CHANGED');
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd})).status,200);
});
test('participants can save only their own poll, not scores or another answer',async t=>{
 const {req,login}=await fixture(t),p01=await login('p01');
 const event=await req('/api/event',p01),command={baseRevision:0,operationId:randomUUID(),value:event.body.value};
 assert.equal((await req('/api/event',{...p01,method:'PUT',body:command})).status,403);
 const answer=blankAnswer();answer.suggestion='Invented practice idea';
 assert.equal((await req('/api/poll/p02',{...p01,method:'PUT',body:{baseRevision:0,operationId:randomUUID(),value:answer}})).status,403);
 assert.equal((await req('/api/poll/p01',{...p01,method:'PUT',body:{baseRevision:0,operationId:randomUUID(),value:answer}})).status,200);
});
test('authentication is checked before replay and revocation blocks an old cookie',async t=>{
 const {req,login,registry}=await fixture(t),owner=await login('owner');
 const event=await req('/api/event',owner),cmd={baseRevision:0,operationId:randomUUID(),value:event.body.value};
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd})).status,200);
 registry.actors.owner.disabled=true;
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd})).status,401);
 registry.actors.owner.disabled=false;registry.actors.owner.sessionVersion=randomUUID();
 assert.equal((await req('/api/event',{...owner,method:'PUT',body:cmd})).status,401);
});
test('malformed score, photo, poll and unauthorized OCR cause no provider calls',async t=>{
 const f=await fixture(t),owner=await f.login('owner'),p01=await f.login('p01');
 const event=await f.req('/api/event',owner);event.body.value.playerScores['match-a'].p01[0]=true;
 assert.equal((await f.req('/api/event',{...owner,method:'PUT',body:{baseRevision:0,operationId:randomUUID(),value:event.body.value}})).status,400);
 assert.equal((await f.req('/api/photos',{...owner,method:'POST',body:{mime:'image/svg+xml',data:'PHN2Zy8+'}})).status,400);
 assert.equal((await f.req('/api/ocr',{...p01,method:'POST',body:{mime:'image/png',data:'bad'}})).status,403);
 assert.equal((await f.req('/api/ocr',{...owner,method:'POST',body:{mime:'image/png',data:'bad'}})).status,400);
 const answer=blankAnswer();answer.mustPlay=['not-an-option'];
 assert.equal((await f.req('/api/poll/p01',{...p01,method:'PUT',body:{baseRevision:0,operationId:randomUUID(),value:answer}})).status,400);
 assert.equal(f.calls(),0);
});
test('unauthenticated production requests never expose config, proposals or app bundles',async t=>{
 const {req}=await fixture(t,'production');
 for(const path of ['/','/proposals/','/assets/app.js','/tournament.config.json']){const r=await req(path);assert.equal(r.status,401);assert.equal(r.body.includes(config.event.name),false);}
 assert.equal((await req('/api/demo/login',{method:'POST',body:{actor:'owner'}})).status,404);
});
test('score payload is recalculated server-side, and stale versions are conflicts',async t=>{
 const {req,login}=await fixture(t),owner=await login('owner'),event=await req('/api/event',owner);
 const value=event.body.value;value.handicaps.p01=54;
 const cmd={baseRevision:0,operationId:randomUUID(),value};
 const saved=await req('/api/event',{...owner,method:'PUT',body:cmd});assert.equal(saved.status,200);
 const stale=await req('/api/event',{...owner,method:'PUT',body:{...cmd,operationId:randomUUID()}});
 assert.equal(stale.status,409);assert.equal(stale.body.code,'CONFLICT');assert.equal(stale.body.details.revision,1);
});
