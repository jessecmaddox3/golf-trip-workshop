import {SaveQueue} from './save-queue.mjs';
let runtime=null,queue=null,lastStageError=null;
export const markStage=error=>{lastStageError=error;};
export function setRuntime(value){runtime=value;}
export const getRuntime=()=>runtime;
export function bindQueue(value){queue?.dispose();queue=value;}
export async function api(path,{method='GET',body,signal,blob=false,actor=runtime?.principal?.id}={}){
 const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(actor?{'X-Golf-Actor':actor}:{})},body:body?JSON.stringify(body):undefined,signal});
 if(!response.ok){let data;try{data=await response.json();}catch{data={message:'The server could not complete this request.'};}throw Object.assign(new Error(data.message??'Request failed'),data,{status:response.status});}
 return blob?response.blob():response.json();
}
// The synchronous state adapter stages the immutable snapshot before child
// handlers reach this compatibility helper. This return means queued locally,
// never an acknowledgement that the shared server has saved it.
export async function saveData(){return !lastStageError&&!!queue&&queue.status!=='storage-error'&&queue.status!=='account-changed';}
export function download(name,value,type='application/json'){
 const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function recoveryKey(kind,actor){return `golf-workshop:v1:${runtime.eventId}:${kind}:${actor}`;}
export function hasPendingChanges(){
 if(!runtime?.principal)return false;
 try{return ['event','poll'].some(kind=>{const raw=localStorage.getItem(recoveryKey(kind,runtime.principal.id));return raw&&JSON.parse(raw).dirty;});}catch{return true;}
}
export async function makeQueue(kind,doc,onChange,validate){
 if(!globalThis.navigator?.locks)throw new Error('Use a current browser on HTTPS or the local demo address. This browser cannot safely protect recovery across tabs.');
 const actor=runtime.principal.id,respondent=runtime.principal.respondent,scope=`${runtime.eventId}:${kind}:${actor}`,key=recoveryKey(kind,actor);
 return new Promise((ready,fail)=>{
  navigator.locks.request('golf-recovery:'+scope,{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){fail(new Error('This identity is open in another tab. Close that tab, then reload here to continue with its saved recovery copy.'));return;}
   try{
    let recovery;const raw=localStorage.getItem(key);if(raw){try{recovery=JSON.parse(raw);}catch{throw new Error('Your local recovery file is unreadable. Export browser storage before clearing it.');}}
    if(validate){validate(doc.value);if(recovery?.dirty)for(const value of [recovery.desired,recovery.base,recovery.flight?.value,recovery.conflict?.value])if(value!==undefined)validate(value);}
    const q=new SaveQueue({scope,revision:doc.revision,value:doc.value,recovery,persist:journal=>localStorage.setItem(key,JSON.stringify(journal)),remote:cmd=>api(kind==='event'?'/api/event':`/api/poll/${respondent}`,{method:'PUT',body:cmd,actor}),onChange});
    let release;const held=new Promise(resolve=>{release=resolve;});const dispose=q.dispose.bind(q);q.dispose=()=>{dispose();release();};ready(q);await held;
   }catch(e){fail(e);}
  }).catch(fail);
 });
}
