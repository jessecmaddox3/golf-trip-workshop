import {mkdir,readFile,open,rename,unlink,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import lockfile from 'proper-lockfile';

export class StoreError extends Error {constructor(code,message,status=400,details){super(message);this.code=code;this.status=status;this.details=details;}}
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const clone=value=>structuredClone(value);
const absent=error=>error.code==='ENOENT';
async function exists(path){try{await stat(path);return true;}catch(e){if(absent(e))return false;throw e;}}
export async function durableJson(path,value,beforeRename,afterRename){
 return durableText(path,JSON.stringify(value),beforeRename,afterRename);
}
export async function durableText(path,value,beforeRename,afterRename){
 const tmp=path+'.'+randomUUID()+'.tmp';let file;
 try{
  file=await open(tmp,'wx',0o600);await file.writeFile(value);await file.sync();await file.close();file=null;
  await beforeRename?.();await rename(tmp,path);
  let parent;try{parent=await open(join(path,'..'),'r');await parent.sync();}catch(e){if(!['EINVAL','ENOTSUP','EPERM','EISDIR','EBADF'].includes(e.code))throw e;}finally{await parent?.close();}
  await afterRename?.();
 }finally{await file?.close();await unlink(tmp).catch(e=>{if(!absent(e))throw e;});}
}
function validateEnvelope(value,eventId,configHash){
 if(!value||value.version!==1||value.eventId!==eventId||value.configHash!==configHash)throw new StoreError('STORE_BINDING','This folder belongs to a different event or configuration. Use an explicit migration or a new data folder.',503);
 if(!value.documents||typeof value.documents!=='object'||!value.photos||!value.quotas)throw new StoreError('STORE_DAMAGED','The saved store is damaged. Restore a verified backup; no demo data was substituted.',503);
 for(const doc of Object.values(value.documents))if(!Number.isSafeInteger(doc.revision)||doc.revision<0||!doc.receipts||typeof doc.receipts!=='object'||!Object.hasOwn(doc,'value'))throw new StoreError('STORE_DAMAGED','The saved document is damaged.',503);
 return value;
}
export class LocalStore {
 constructor({dir,eventId,configHash,beforeRename,afterRename}){Object.assign(this,{dir,eventId,configHash,beforeRename,afterRename});this.path=join(dir,'state.json');this.binding=join(dir,'binding.json');}
 async locked(fn){
  await mkdir(this.dir,{recursive:true,mode:0o700});
  const release=await lockfile.lock(this.dir,{realpath:false,retries:{retries:30,minTimeout:10,maxTimeout:100,randomize:true},stale:30000});
  try{return await fn();}finally{await release();}
 }
 async load(){
  try{
   const binding=JSON.parse(await readFile(this.binding,'utf8'));
   if(binding.eventId!==this.eventId||binding.configHash!==this.configHash)throw new StoreError('STORE_BINDING','Event/configuration changed. Use a new data folder or an explicit migration.',503);
   return validateEnvelope(JSON.parse(await readFile(this.path,'utf8')),this.eventId,this.configHash);
  }catch(e){if(e instanceof StoreError)throw e;throw new StoreError('STORE_DAMAGED','Saved files are missing or unreadable. Restore a verified backup; the event was not reset.',503);}
 }
 async initialize(initial={}){return this.locked(async()=>{
  if(await exists(this.binding)||await exists(this.path)){await this.load();return;}
  // A binding is written first. An interrupted first initialization fails closed,
  // rather than confusing a missing established store with a brand-new demo.
  await durableJson(this.binding,{version:1,eventId:this.eventId,configHash:this.configHash});
  await durableJson(this.path,{version:1,eventId:this.eventId,configHash:this.configHash,documents:Object.fromEntries(Object.entries(initial).map(([id,value])=>[id,{revision:0,value,receipts:{}}])),photos:{},quotas:{}});
 });}
 async transaction(fn){return this.locked(async()=>{const state=await this.load(),result=await fn(state);await durableJson(this.path,state,this.beforeRename,this.afterRename);return clone(result);});}
 async read(id){return this.locked(async()=>{const doc=(await this.load()).documents[id];return clone(doc?{revision:doc.revision,value:doc.value}:{revision:0,value:null});});}
 async readMany(ids){return this.locked(async()=>{const docs=(await this.load()).documents;return Object.fromEntries(ids.map(id=>[id,clone(docs[id]?{revision:docs[id].revision,value:docs[id].value}:{revision:0,value:null})]));});}
 async commit(id,{operationId,baseRevision,value}){
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(operationId)||!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new StoreError('INVALID_COMMAND','Invalid operation or revision.');
  const hash=digest({id,baseRevision,value});
  return this.transaction(state=>{
   const doc=state.documents[id]??{revision:0,value:null,receipts:{}};
   const prior=doc.receipts[operationId];
   if(prior){if(prior.hash!==hash)throw new StoreError('OPERATION_REUSED','This operation ID was already used for different content.',409);return prior.receipt;}
   if(doc.revision!==baseRevision)throw new StoreError('CONFLICT','Someone saved a newer version. Review both versions before saving.',409,{revision:doc.revision,value:doc.value});
   if(Object.keys(doc.receipts).length>=10000)throw new StoreError('RECEIPTS_FULL','This document reached its operation limit. Export and migrate it to a new event store.',507);
   const receipt={revision:doc.revision+1,operationId};
   state.documents[id]={revision:receipt.revision,value:clone(value),receipts:{...doc.receipts,[operationId]:{hash,receipt}}};return receipt;
  });
 }
 async putPhoto(id,value){return this.transaction(state=>{if(Object.keys(state.photos).length>=200&&!state.photos[id])throw new StoreError('PHOTO_LIMIT','Export your photos before adding more than 200.',507);state.photos[id]=clone(value);return {id};});}
 async getPhoto(id){return this.locked(async()=>clone((await this.load()).photos[id]??null));}
 async reserveQuota(key,limit){return this.transaction(state=>{const count=state.quotas[key]??0;if(count>=limit)throw new StoreError('QUOTA','The configured daily image-reading limit has been reached.',429);state.quotas[key]=count+1;return count+1;});}
}

// Keep each event in one Redis hash. Its binding and every document are
// checked in the same transaction. JSON documents stay opaque strings so Lua
// cjson never turns empty JavaScript arrays into objects.
export const CAS_LUA=`
if redis.call('HGET',KEYS[1],'binding')~=ARGV[5] then return cjson.encode({error='STORE_BINDING'}) end
local field=ARGV[6]
local raw=redis.call('HGET',KEYS[1],field)
if not raw and field=='doc:event' then return cjson.encode({error='STORE_DAMAGED'}) end
local doc=raw and cjson.decode(raw) or {revision=0,valueJson='null',receipts={}}
local op=ARGV[1]
local old=doc.receipts[op]
if old then
 if old.hash~=ARGV[3] then return cjson.encode({error='OPERATION_REUSED'}) end
 return cjson.encode(old.receipt)
end
if doc.revision~=tonumber(ARGV[2]) then return cjson.encode({error='CONFLICT',revision=doc.revision,valueJson=doc.valueJson}) end
local count=0 for _ in pairs(doc.receipts) do count=count+1 end
if count>=10000 then return cjson.encode({error='RECEIPTS_FULL'}) end
local receipt={revision=doc.revision+1,operationId=op}
doc.revision=receipt.revision doc.valueJson=ARGV[4] doc.receipts[op]={hash=ARGV[3],receipt=receipt}
redis.call('HSET',KEYS[1],field,cjson.encode(doc))
return cjson.encode(receipt)
`;
const QUOTA_LUA=`if redis.call('HGET',KEYS[1],'binding')~=ARGV[1] then return -2 end;local n=tonumber(redis.call('HGET',KEYS[1],ARGV[2]) or '0');if n>=tonumber(ARGV[3]) then return -1 end;return redis.call('HINCRBY',KEYS[1],ARGV[2],1)`;
export class RedisStore {
 constructor({client,eventId,configHash,allowCreate=false}){Object.assign(this,{client,eventId,configHash,allowCreate});this.key=`golf:{${eventId}}:store`;this.bindingValue=canonical({version:1,eventId,configHash});}
 decode(raw){return typeof raw==='string'?JSON.parse(raw):raw;}
 fail(code){throw new StoreError(code,code==='STORE_BINDING'?'The Redis event binding is missing or belongs to different configuration. Restore it or explicitly initialize a new event.':'An established Redis document is missing or damaged. Restore a verified backup.',503);}
 async initialize(initial={}){
  const script=`local old=redis.call('HGET',KEYS[1],'binding');if old then if old~=ARGV[1] then return 'STORE_BINDING' end;if redis.call('HEXISTS',KEYS[1],'doc:event')==0 then return 'STORE_DAMAGED' end;return 'EXISTS' end;if redis.call('EXISTS',KEYS[1])==1 then return 'STORE_DAMAGED' end;if ARGV[2]~='create' then return 'STORE_BINDING' end;redis.call('HSET',KEYS[1],'binding',ARGV[1]);for i=3,#ARGV,2 do redis.call('HSET',KEYS[1],ARGV[i],ARGV[i+1]) end;return 'NEW'`;
  const fields=Object.entries(initial).flatMap(([id,value])=>['doc:'+id,JSON.stringify({revision:0,valueJson:JSON.stringify(value),receipts:{}})]);
  const result=await this.client.eval(script,[this.key],[this.bindingValue,this.allowCreate?'create':'existing',...fields]);
  if(result!=='NEW'&&result!=='EXISTS')this.fail(result);await this.read('event');
 }
 async read(id){return (await this.readMany([id]))[id];}
 async readMany(ids){
  const script=`if redis.call('HGET',KEYS[1],'binding')~=ARGV[1] then return cjson.encode({error='STORE_BINDING'}) end;local result={} for i=2,#ARGV do local raw=redis.call('HGET',KEYS[1],ARGV[i]);if not raw and ARGV[i]=='doc:event' then return cjson.encode({error='STORE_DAMAGED'}) end;result[ARGV[i]]=raw or cjson.null end;return cjson.encode(result)`;
  const raw=this.decode(await this.client.eval(script,[this.key],[this.bindingValue,...ids.map(id=>'doc:'+id)]));if(raw.error)this.fail(raw.error);
  return Object.fromEntries(ids.map(id=>{if(raw['doc:'+id]===null)return [id,{revision:0,value:null}];try{const d=this.decode(raw['doc:'+id]);if(!Number.isSafeInteger(d.revision)||d.revision<0||typeof d.valueJson!=='string'||!d.receipts)throw new Error();return [id,{revision:d.revision,value:JSON.parse(d.valueJson)}];}catch{this.fail('STORE_DAMAGED');}}));
 }
 async commit(id,{operationId,baseRevision,value}){
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(operationId)||!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new StoreError('INVALID_COMMAND','Invalid operation or revision.');
  const result=this.decode(await this.client.eval(CAS_LUA,[this.key],[operationId,baseRevision,digest({id,baseRevision,value}),JSON.stringify(value),this.bindingValue,'doc:'+id]));
  if(result.error){if(result.error.startsWith('STORE_'))this.fail(result.error);throw new StoreError(result.error,result.error==='CONFLICT'?'Someone saved a newer version. Review both versions before saving.':'The operation could not be accepted.',result.error==='RECEIPTS_FULL'?507:409,result.error==='CONFLICT'?{revision:result.revision,value:JSON.parse(result.valueJson)}:undefined);}
  return result;
 }
 async putPhoto(id,value){
  const script=`if redis.call('HGET',KEYS[1],'binding')~=ARGV[1] then return -1 end;local n=tonumber(redis.call('HGET',KEYS[1],'photo-count') or '0');if n>=200 and redis.call('HEXISTS',KEYS[1],ARGV[2])==0 then return 0 end;if redis.call('HEXISTS',KEYS[1],ARGV[2])==0 then redis.call('HINCRBY',KEYS[1],'photo-count',1) end;redis.call('HSET',KEYS[1],ARGV[2],ARGV[3]);return 1`;
  const result=await this.client.eval(script,[this.key],[this.bindingValue,'photo:'+id,JSON.stringify(value)]);if(result===-1)this.fail('STORE_BINDING');if(result===0)throw new StoreError('PHOTO_LIMIT','Export photos before adding more than 200.',507);return {id};
 }
 async getPhoto(id){
  const script=`if redis.call('HGET',KEYS[1],'binding')~=ARGV[1] then return cjson.encode({error='STORE_BINDING'}) end;return cjson.encode({value=redis.call('HGET',KEYS[1],ARGV[2]) or cjson.null})`;
  const result=this.decode(await this.client.eval(script,[this.key],[this.bindingValue,'photo:'+id]));if(result.error)this.fail(result.error);return result.value===null?null:this.decode(result.value);
 }
 async reserveQuota(key,limit){const n=await this.client.eval(QUOTA_LUA,[this.key],[this.bindingValue,'quota:'+key,limit]);if(n===-2)this.fail('STORE_BINDING');if(n===-1)throw new StoreError('QUOTA','The configured daily image-reading limit has been reached.',429);return n;}
}
