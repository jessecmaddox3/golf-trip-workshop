const copy=value=>structuredClone(value);
export class SaveQueue {
 constructor({scope,revision,value,persist,remote,onChange=()=>{},recovery}){
  Object.assign(this,{scope,revision,persist,remote,onChange});this.fresh={revision,value:copy(value)};this.base=copy(value);this.value=copy(value);this.version=0;this.ackVersion=0;this.flight=null;this.conflict=null;this.status='saved';this.running=false;this.disposed=false;
  if(recovery){
   if(recovery.scope!==scope)throw new Error('This recovery copy belongs to a different identity or event.');
   if(recovery.dirty){if(!Number.isSafeInteger(recovery.revision)||!Number.isSafeInteger(recovery.version)||!Number.isSafeInteger(recovery.ackVersion)||!Object.hasOwn(recovery,'desired'))throw new Error('The saved recovery copy is damaged. Export it before clearing it.');Object.assign(this,{revision:recovery.revision,base:copy(recovery.base),value:copy(recovery.desired),version:recovery.version,ackVersion:recovery.ackVersion,flight:copy(recovery.flight),conflict:copy(recovery.conflict)});if(this.conflict&&this.fresh.revision>this.conflict.revision)this.conflict=copy(this.fresh);this.status=this.conflict?'conflict':'offline';}
  }
 }
 journal(){return {schemaVersion:1,scope:this.scope,revision:this.revision,base:copy(this.base),desired:copy(this.value),version:this.version,ackVersion:this.ackVersion,flight:copy(this.flight),conflict:copy(this.conflict),dirty:!!this.flight||this.version>this.ackVersion||!!this.conflict};}
 notify(){if(!this.disposed)this.onChange({status:this.status,value:copy(this.value),revision:this.revision,conflict:copy(this.conflict)});}
 store(){try{this.persist(this.journal());}catch(e){this.status='storage-error';this.notify();throw e;}}
 stage(value){
  if(this.disposed)throw new Error('This identity is no longer active. Reload the page.');
  this.value=copy(value);this.version++;this.status=this.conflict?'conflict':'pending';this.store();this.notify();void this.pump();
 }
 observe(document){
  if(this.disposed||document.revision<=Math.max(this.revision,this.fresh.revision))return;
  this.fresh=copy(document);
  if(!this.journal().dirty){this.revision=document.revision;this.base=copy(document.value);this.value=copy(document.value);this.status='saved';}
  else if(this.conflict&&document.revision>this.conflict.revision)this.conflict=copy(document);
  this.store();this.notify();
 }
 async pump(){
  if(this.running||this.disposed||this.conflict||this.status==='storage-error')return;
  this.running=true;
  try{
   while(!this.disposed&&(this.flight||this.version>this.ackVersion)){
    if(!this.flight){this.flight={operationId:crypto.randomUUID(),baseRevision:this.revision,value:copy(this.value),localVersion:this.version};this.store();}
    const flight=copy(this.flight);this.status='saving';this.notify();
    let receipt;
    try{const {localVersion,...command}=flight;receipt=await this.remote(command);}catch(e){
     if(this.disposed)return;
     if(e.code==='CONFLICT'&&e.details){this.conflict=copy([e.details,this.fresh,this.conflict].filter(Boolean).sort((a,b)=>b.revision-a.revision)[0]);this.status='conflict';}else this.status=e.code==='ACCOUNT_CHANGED'||e.code==='SIGN_IN'?'account-changed':'offline';
     this.store();this.notify();return;
    }
    if(this.disposed)return;
    if(receipt.operationId!==flight.operationId||receipt.revision!==flight.baseRevision+1){this.status='offline';this.store();this.notify();return;}
    this.base=copy(flight.value);this.revision=receipt.revision;this.ackVersion=flight.localVersion;this.flight=null;
    if(this.fresh.revision>receipt.revision){this.conflict=copy(this.fresh);this.status='conflict';this.store();this.notify();return;}
    this.status=this.version===this.ackVersion?'saved':'pending';this.store();this.notify();
   }
  }catch{if(!this.disposed){this.status='storage-error';this.notify();}}
  finally{this.running=false;}
 }
 retry(){if(this.disposed||this.conflict)return;this.status='pending';this.store();void this.pump();}
 acceptServer(){
  if(!this.conflict)throw new Error('No conflict to resolve.');
  const server=this.conflict;this.base=copy(server.value);this.value=copy(server.value);this.revision=server.revision;this.flight=null;this.conflict=null;this.version++;this.ackVersion=this.version;this.status='saved';this.store();this.notify();
 }
 rebaseLocal(){
  if(!this.conflict)throw new Error('No conflict to resolve.');
  const local=copy(this.value),server=this.conflict;this.base=copy(server.value);this.revision=server.revision;this.flight=null;this.conflict=null;this.ackVersion=this.version;this.stage(local);
 }
 dispose(){this.disposed=true;}
}
