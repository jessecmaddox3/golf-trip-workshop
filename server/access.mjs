import {randomBytes,randomUUID} from 'node:crypto';
import {makeRegistry,tokenHash} from './app.mjs';
export function productionOrigin(value){
 let url;try{url=new URL(value);}catch{throw new Error('Set GOLF_PUBLIC_ORIGIN to your HTTPS origin.');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('GOLF_PUBLIC_ORIGIN must be an HTTPS origin without a path, password, query or fragment.');
 return url.origin;
}
export function createAccessFile(config,origin){
 origin=productionOrigin(origin);const file=makeRegistry(config);file.links={};
 const players=Object.values(config.teams).flatMap(t=>t.players);
 for(const [id,actor] of Object.entries(file.actors)){
  const token=randomBytes(32).toString('base64url');actor.tokenHash=tokenHash(token);actor.sessionVersion=randomUUID();
  file.links[id]={name:players.find(p=>p.id===id)?.name??id,role:actor.role,url:origin+(actor.respondent?'/poll':'/')+'?access='+token};
 }
 return file;
}
export function changeAccess(file,id,action,origin){
 if(!['revoke','rotate'].includes(action)||!Object.hasOwn(file.actors,id))throw new Error('Choose a known actor and revoke or rotate.');
 const out=structuredClone(file),actor=out.actors[id];actor.sessionVersion=randomUUID();
 if(action==='revoke'){actor.disabled=true;delete out.links[id];}
 else{const token=randomBytes(32).toString('base64url');actor.disabled=false;actor.tokenHash=tokenHash(token);out.links[id]={name:file.links?.[id]?.name??id,role:actor.role,url:productionOrigin(origin)+(actor.respondent?'/poll':'/')+'?access='+token};}
 return out;
}
