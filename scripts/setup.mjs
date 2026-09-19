#!/usr/bin/env node
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import lockfile from 'proper-lockfile';
import {loadEnv} from './env.mjs';
import {loadSettings} from '../server/settings.mjs';
import {runtimePaths,openStore} from '../server/runtime.mjs';
import {createAccessFile,changeAccess,productionOrigin} from '../server/access.mjs';
import {durableJson,durableText} from '../server/store.mjs';
import {buildEmptyData} from '../src/model.mjs';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function exists(path){try{await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function writeLinkPage(file,path){
 const rows=Object.entries(file.links??{}).map(([id,link])=>`<tr><th>${escape(link.name)}</th><td>${escape(link.role)}</td><td><a href="${escape(link.url)}">Open ${escape(id)} link</a><p><code>${escape(link.url)}</code></p></td></tr>`).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private workshop access links</title><style>body{font:17px/1.5 system-ui;max-width:1100px;margin:40px auto;padding:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccc;padding:14px}code{overflow-wrap:anywhere}aside{padding:20px;background:#eee}</style><h1>Your private access links</h1><aside>Each link signs in as its named person. Give people only their own participant link. Organizer and scorekeeper links can change tournament records. Keep this file private.</aside><p>Open a link to test it after your HTTPS server is running. No messages have been sent.</p><table><thead><tr><th>Person</th><th>Access</th><th>Private link</th></tr></thead><tbody>${rows}</tbody></table></html>`;
 await durableText(path,html);
}
async function main(){
 loadEnv();const env={...process.env,GOLF_MODE:'production'},settings=await loadSettings(env),paths=runtimePaths(settings,env),origin=productionOrigin(env.GOLF_PUBLIC_ORIGIN);
 const [action='init',actor,...extra]=process.argv.slice(2);if(extra.length||!['init','links','rotate','revoke'].includes(action)||(!!actor!==['rotate','revoke'].includes(action)))throw new Error('Use setup, setup links, setup rotate PLAYER_ID or setup revoke PLAYER_ID.');
 await mkdir(dirname(paths.accessFile),{recursive:true,mode:0o700});
 const release=await lockfile.lock(dirname(paths.accessFile),{realpath:false,lockfilePath:paths.accessFile+'.lock',retries:0});
 try{
  let file;
  if(action==='init'){
   if(await exists(paths.accessFile))throw new Error('Access is already configured. Use the links, rotate or revoke command; existing links were preserved.');
   const store=await openStore(settings,env,{allowCreate:true});await store.initialize({event:buildEmptyData(settings.tournament)});
   file=createAccessFile(settings.tournament,origin);await writeFile(paths.accessFile,JSON.stringify(file,null,2)+'\n',{mode:0o600,flag:'wx'});
  }else{
   file=JSON.parse(await readFile(paths.accessFile,'utf8'));if(file.eventId!==settings.tournament.event.id||file.version!==1||!file.links)throw new Error('This access file does not belong to the configured event.');
   if(action!=='links'){file=changeAccess(file,actor,action,origin);await durableJson(paths.accessFile,file);}
  }
  const page=paths.linkPage;await writeLinkPage(file,page);
  console.log(`Private access is ready. Open this local file to view the links:\n${page}\nNo links were printed or sent. Keep the JSON and HTML files private.`);
 }finally{await release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
