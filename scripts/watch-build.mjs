import {readdir,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'vite';
import {loadSettings} from '../server/settings.mjs';

// Only the normal compiler writes browser assets. No development file-serving
// middleware is attached to the HTTP server, including Vite's /@fs handler.
export async function watchBuild(root,settings){
 const compile=async()=>{
  if((await loadSettings()).configHash!==settings.configHash)throw new Error('Configuration changed. Stop and restart development with matching event settings before building again.');
  return build({root,plugins:[{name:'workshop-watch-binding',enforce:'post',generateBundle(_options,bundle){
  const manifest=JSON.parse(String(bundle['workshop-build.json']?.source??'null'));
  if(manifest?.configHash!==settings.configHash||manifest?.mode!==settings.mode)throw new Error('Configuration changed. Stop and restart development with matching event settings before building again.');
 }}]});};
 async function snapshot(){
  const entries=[];
  async function visit(path){for(const name of (await readdir(path)).sort()){
   if(name.startsWith('.')||name==='private')continue;const file=resolve(path,name),info=await lstat(file);
   if(info.isDirectory())await visit(file);else entries.push([file,info.size,info.mtimeMs,info.ctimeMs]);
  }}
  for(const name of ['src','public'])await visit(resolve(root,name));return JSON.stringify(entries);
 }
 let previous=await snapshot(),timer,pending,closed=false;await compile();
 // Polling works in restricted desktops and on platforms with low watcher limits.
 async function tick(){
  try{const next=await snapshot();if(next!==previous){previous=next;await compile();console.log('App rebuilt. Refresh your browser.');}}
  catch(error){console.error(error.message);console.error('Build failed. Fix the reported source error and save again.');}
  finally{if(!closed)timer=setTimeout(()=>{pending=tick();},750);}
 }
 timer=setTimeout(()=>{pending=tick();},750);
 return {async close(){closed=true;clearTimeout(timer);await pending;}};
}
