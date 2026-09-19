import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,writeFile,readFile,symlink,link,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {projectRoot} from '../server/settings.mjs';
const exec=promisify(execFile),marker='ONLY-INVENTED-PRIVATE-MARKER';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'golf-privacy-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of ['src','server','scripts','public','package.json','index.html','vite.config.js','tournament.config.json','poll.config.json','proposals.config.json'])await cp(join(projectRoot,name),join(root,name),{recursive:true});
 await symlink(join(projectRoot,'node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
 const env={...process.env,GOLF_MODE:'production',GOLF_PUBLIC_ORIGIN:'https://golf.example.invalid',GOLF_DATA_DIR:join(root,'.local','production'),GOLF_ACCESS_FILE:join(root,'.local','production','access.json'),GOLF_STORAGE:'local'};
 for(const key of ['GOLF_CONFIG','GOLF_POLL_CONFIG','GOLF_PROPOSALS_CONFIG','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','GOLF_DEMO_DATA_DIR'])delete env[key];
 const run=(args,overrides={})=>exec(process.execPath,args,{cwd:root,env:{...env,...overrides},maxBuffer:2_000_000});
 return {root,env,run};
}
test('runtime paths reject symlink aliases into public assets before creating private files',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'public','media'));
 await symlink(join(f.root,'public','media'),join(f.root,'alias'),process.platform==='win32'?'junction':'dir');
 const env={GOLF_DATA_DIR:join(f.root,'alias','not-created','data'),GOLF_ACCESS_FILE:join(f.root,'alias','invitations.json')};
 await assert.rejects(f.run(['scripts/setup.mjs'],env),/outside every browser/);
 await assert.rejects(access(join(f.root,'public','media','invitations.json')));
 await assert.rejects(access(join(f.root,'public','media','not-created')));
});
test('build refuses an ordinary asset hard-linked to the configured private access registry',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'.local','production'),{recursive:true});
 await writeFile(f.env.GOLF_ACCESS_FILE,marker);await link(f.env.GOLF_ACCESS_FILE,join(f.root,'public','innocent.txt'));
 await assert.rejects(f.run(['node_modules/vite/bin/vite.js','build']),/Private configuration or runtime files/);
 assert.equal(await readFile(f.env.GOLF_ACCESS_FILE,'utf8'),marker);
 await assert.rejects(f.run(['node_modules/vite/bin/vite.js','build'],{GOLF_MODE:'demo'}),/Private configuration or runtime files/);
});
test('setup rejects a generated page collision before changing access, configuration or store',async t=>{
 const f=await fixture(t),folder=join(f.root,'.local','production'),page=join(folder,'access-links.html');await mkdir(folder,{recursive:true});
 await assert.rejects(f.run(['scripts/setup.mjs'],{GOLF_ACCESS_FILE:page}),/collid/);
 await assert.rejects(access(page));await assert.rejects(access(join(folder,'store')));
 await writeFile(f.env.GOLF_ACCESS_FILE,marker);await link(f.env.GOLF_ACCESS_FILE,page);
 await assert.rejects(f.run(['scripts/setup.mjs','links']),/collid/);
 assert.equal(await readFile(f.env.GOLF_ACCESS_FILE,'utf8'),marker);
 await rm(page);await link(join(f.root,'tournament.config.json'),page);
 const before=await readFile(join(f.root,'tournament.config.json'),'utf8');
 await assert.rejects(f.run(['scripts/setup.mjs','links']),/collid/);
 assert.equal(await readFile(page,'utf8'),before);await assert.rejects(access(join(folder,'store')));
});
test('setup initializes once, rotates one identity and atomically replaces only its generated page',async t=>{
 const f=await fixture(t),folder=join(f.root,'.local','production'),page=join(folder,'access-links.html');
 const result=await f.run(['scripts/setup.mjs']),first=JSON.parse(await readFile(f.env.GOLF_ACCESS_FILE,'utf8'));
 for(const link of Object.values(first.links))assert.ok(!result.stdout.includes(new URL(link.url).searchParams.get('access')));
 const before=await readFile(join(folder,'store','state.json'),'utf8');
 await assert.rejects(f.run(['scripts/setup.mjs']),/already configured/);
 await f.run(['scripts/setup.mjs','rotate','p01']);const rotated=JSON.parse(await readFile(f.env.GOLF_ACCESS_FILE,'utf8'));
 assert.notEqual(rotated.actors.p01.tokenHash,first.actors.p01.tokenHash);assert.deepEqual(rotated.actors.p02,first.actors.p02);
 await f.run(['scripts/setup.mjs','revoke','p01']);const revoked=JSON.parse(await readFile(f.env.GOLF_ACCESS_FILE,'utf8'));assert.equal(revoked.actors.p01.disabled,true);assert.equal(revoked.links.p01,undefined);
 const unrelated=join(folder,'unrelated.txt');await writeFile(unrelated,marker);await rm(page);if(process.platform==='win32')await link(unrelated,page);else await symlink(unrelated,page);
 await f.run(['scripts/setup.mjs','links']);assert.equal(await readFile(unrelated,'utf8'),marker);assert.match(await readFile(page,'utf8'),/Your private access links/);
 assert.equal(await readFile(join(folder,'store','state.json'),'utf8'),before);
});
test('actual dev wrapper serves the compiled app but never private files or Vite source routes',{timeout:45000},async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'.local','production'),{recursive:true});await mkdir(join(f.root,'public','private'),{recursive:true});
 await writeFile(f.env.GOLF_ACCESS_FILE,marker);await writeFile(join(f.root,'public','private','invented.txt'),marker);
 const child=spawn(process.execPath,['scripts/serve.mjs','--dev','--demo'],{cwd:f.root,env:{...f.env,PORT:'0'},stdio:['ignore','pipe','pipe','ipc']});
 let output='',done=false;child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.once('exit',()=>done=true);
 t.after(async()=>{if(!done){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}});
 const origin=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(new Error('Dev startup timed out: '+output));},35000);child.once('message',v=>{if(v.kind==='golf-ready'){clearTimeout(timer);ok(v.origin);}});child.once('exit',()=>{clearTimeout(timer);fail(new Error('Dev startup failed: '+output));});});
 assert.match(await fetch(origin).then(r=>r.text()),/<div id="root">/);
 for(const path of ['/public/private/invented.txt','/private/invented.txt','/.local/production/access.json','/.local/production/access.json?raw','/%2elocal/production/access.json','/@fs/'+f.env.GOLF_ACCESS_FILE,'/@fs/'+f.env.GOLF_ACCESS_FILE+'?import','/src/App.jsx']){
  const response=await fetch(origin+path);assert.notEqual(response.status,200,path);assert.ok(!(await response.text()).includes(marker),path);
 }
 await writeFile(join(f.root,'public','rebuild.txt'),'rebuilt invented asset');let rebuilt=false;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,50));const response=await fetch(origin+'/rebuild.txt');if(response.ok&&(await response.text())==='rebuilt invented asset'){rebuilt=true;break;}}
 assert.ok(rebuilt,'a saved source asset should trigger a new compiled build');
 const manifest=await readFile(join(f.root,'dist','workshop-build.json'),'utf8'),config=JSON.parse(await readFile(join(f.root,'tournament.config.json'),'utf8'));config.event.name='Changed invented name';
 await writeFile(join(f.root,'tournament.config.json'),JSON.stringify(config));await writeFile(join(f.root,'public','trigger.txt'),'trigger');
 for(let i=0;i<100&&!output.includes('Configuration changed');i++)await new Promise(r=>setTimeout(r,50));
 assert.match(output,/Configuration changed/);assert.equal(await readFile(join(f.root,'dist','workshop-build.json'),'utf8'),manifest);
 assert.equal((await fetch(origin+'/trigger.txt')).status,404);
});
