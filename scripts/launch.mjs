#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,lstat,access} from 'node:fs/promises';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=new Set(process.argv.slice(2));
const env={...process.env,GOLF_MODE:'demo'},npm=process.platform==='win32'?'npm.cmd':'npm';
async function run(command){await new Promise((ok,fail)=>{const child=spawn(npm,command,{cwd:root,env,stdio:'inherit',shell:process.platform==='win32'});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(new Error('Installation or build did not finish. Read the message above, then reopen Start.')));});}
async function fingerprint(){
 const hash=createHash('sha256');
 async function visit(name){const path=join(root,name),info=await lstat(path);if(info.isSymbolicLink())throw new Error('Use an ordinary extracted project folder, not symbolic links inside it.');if(info.isDirectory()){for(const child of (await readdir(path)).sort()){if(child.startsWith('.')||(name==='public'&&child==='private'))continue;await visit(join(name,child));}}else{hash.update(name.split(sep).join('/'));hash.update(await readFile(path));}}
 for(const name of ['src','public','server','scripts','package.json','package-lock.json','index.html','vite.config.js','tournament.config.json','proposals.config.json','poll.config.json'])await visit(name);
 return hash.digest('hex');
}
async function main(){
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<12))throw new Error('Install the current LTS version of Node.js from https://nodejs.org/en/download, then reopen Start.');
 for(const arg of args)if(!['--no-open','--smoke-test'].includes(arg))throw new Error('Unknown launcher option.');
 console.log('Golf Trip Workshop\nPlan the trip. Play the matches.\nThe first start downloads dependencies and builds the app. Your local demo uses invented people, courses and costs.');
 const lock=createHash('sha256').update(await readFile(join(root,'package-lock.json'))).digest('hex'),stamp=join(root,'node_modules','.workshop-lock');
 const buildTool=join(root,'node_modules','vite','bin','vite.js'),toolPresent=await access(buildTool).then(()=>true,()=>false);
 if(await readFile(stamp,'utf8').catch(()=>null)!==lock||!toolPresent){await run(['ci','--include=dev','--include=optional']);await access(buildTool);await writeFile(stamp,lock);}
 const source=await fingerprint(),built=join(root,'dist','.workshop-source');if(await readFile(built,'utf8').catch(()=>null)!==source){await run(['run','build']);await writeFile(built,source);}
 const child=spawn(process.execPath,['scripts/serve.mjs','--demo',...(!args.has('--no-open')&&!args.has('--smoke-test')?['--open']:[])],{cwd:root,env,stdio:['inherit','inherit','inherit','ipc']});
 const ready=new Promise((ok,fail)=>{
  const timer=setTimeout(()=>{child.kill();fail(new Error('The local server did not become ready. Check the terminal output.'));},20000);
  child.once('error',e=>{clearTimeout(timer);fail(e);});child.once('exit',code=>{clearTimeout(timer);fail(new Error('The local server stopped before opening, exit '+code));});
  child.once('message',message=>{if(message?.kind==='golf-ready'){clearTimeout(timer);ok(message.origin);}});
 });
 const exited=new Promise(ok=>child.once('exit',code=>ok(code??0)));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 try{
  const origin=await ready;
  if(args.has('--smoke-test')){
   const runtime=await fetch(new URL('/api/runtime',origin)).then(r=>r.json());if(runtime.mode!=='demo'||runtime.principal!==null)throw new Error('The launcher did not open a clean demo session.');
   const hero=await fetch(new URL('/assets/hero.png',origin));if(!hero.ok||!hero.headers.get('content-type')?.startsWith('image/png'))throw new Error('The bundled demo artwork was not served.');
   console.log('Launcher smoke test passed.');child.kill('SIGTERM');
  }
  process.exitCode=await exited;
 }catch(e){child.kill('SIGTERM');await exited;throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
