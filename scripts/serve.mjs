#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {loadSettings,verifyBuild} from '../server/settings.mjs';
import {loadEnv} from './env.mjs';
import {buildSeedData,buildEmptyData} from '../src/model.mjs';
import {inventedWeather} from '../src/weather.mjs';
import {runtimePaths,openStore} from '../server/runtime.mjs';
import {productionOrigin} from '../server/access.mjs';
import {createApplication,makeRegistry} from '../server/app.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
loadEnv();
const args=new Set(process.argv.slice(2)),mode=args.has('--demo')?'demo':process.env.GOLF_MODE??'demo';
process.env.GOLF_MODE=mode;
const settings=await loadSettings({...process.env,GOLF_MODE:mode}),config=settings.tournament;
const {dataDir,accessFile:registryPath,staticDir}=runtimePaths(settings);
const port=Number(process.env.PORT??5088),publicOrigin=mode==='production'?productionOrigin(process.env.GOLF_PUBLIC_ORIGIN):undefined;
if(!Number.isInteger(port)||(port<1024&&!(mode==='demo'&&port===0))||port>65535)throw new Error('PORT must be from 1024 to 65535, or 0 for an automatically chosen demo port.');
if(mode==='production'&&(!publicOrigin||new URL(publicOrigin).protocol!=='https:'))throw new Error('Set GOLF_PUBLIC_ORIGIN to the HTTPS address of your authenticated Node server.');
if(mode==='production'&&args.has('--dev'))throw new Error('Use a built app in production.');
if(mode==='demo'&&!config.demo.fictional)throw new Error('Demo mode is for invented data. Use production mode with your own event.');
let watcher;
if(args.has('--dev')){
 const {watchBuild}=await import('./watch-build.mjs');watcher=await watchBuild(root,settings);
 console.log('Development build watching source files. Refresh the browser after a rebuild; restart for configuration changes.');
}
await verifyBuild(settings,staticDir);
await mkdir(dataDir,{recursive:true,mode:0o700});
try{await access(registryPath);}catch(e){if(e.code!=='ENOENT')throw e;if(mode==='production')throw new Error('Run npm run setup to create private access links first.');await writeFile(registryPath,JSON.stringify(makeRegistry(config),null,2),{mode:0o600,flag:'wx'});}
const loadRegistry=async()=>JSON.parse(await readFile(registryPath,'utf8'));
const store=await openStore(settings);
try{await access(resolve(staticDir,'index.html'));}catch{throw new Error('Run npm run build first, or use npm run dev.');}
let ocr={enabled:false},weather=mode==='demo'?async()=>inventedWeather(config):undefined;
if(mode==='production'&&(process.env.GOLF_OCR_ENABLED==='yes'||process.env.GOLF_WEATHER_ENABLED==='yes')){
 const providers=await import('../server/providers.mjs');
 if(process.env.GOLF_OCR_ENABLED==='yes')ocr=providers.geminiReader(process.env);
 if(process.env.GOLF_WEATHER_ENABLED==='yes')weather=providers.nwsWeather(process.env,fetch,Date.now,{reserveQuota:(key,limit)=>store.reserveQuota(key,limit)});
}
const app=await createApplication({config,pollConfig:settings.poll,store,mode,loadRegistry,initialState:mode==='demo'?buildSeedData():buildEmptyData(config),publicOrigin,staticDir,ocr,weather});
const server=createServer(app);server.requestTimeout=30000;server.headersTimeout=10000;
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
const url=`http://127.0.0.1:${server.address().port}`;
process.send?.({kind:'golf-ready',origin:url});
console.log(`Golf Trip Workshop is ready: ${mode==='demo'?url:publicOrigin}\n${mode==='demo'?'Invented local demo.':'Private hosted mode behind your HTTPS reverse proxy.'} Keep this window open. Press Ctrl+C to stop.`);
if(args.has('--open')){
 const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
 const openArgs=process.platform==='win32'?['/c','start','',url]:[url];const child=spawn(command,openArgs,{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await watcher?.close();process.exit(0);});server.closeIdleConnections();});
