import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {loadSettings,buildManifest,projectRoot} from './server/settings.mjs';
import {loadEnv} from './scripts/env.mjs';
import {runtimePaths} from './server/runtime.mjs';
import {sameFile} from './server/paths.mjs';
export default defineConfig(async()=>{
 loadEnv();const settings=await loadSettings(),names={tournament:'tournament.config.json',poll:'poll.config.json',proposals:'proposals.config.json'};
 const paths=runtimePaths(settings);
 async function publicFiles(){
  const files=new Map(),publicRoot=resolve(projectRoot,'public');
  if((await lstat(publicRoot)).isSymbolicLink())throw new Error('Public assets must be ordinary files, not symbolic links.');
  const visit=async dir=>{for(const name of await readdir(dir)){if(name.startsWith('.')||(settings.mode==='demo'&&dir===publicRoot&&name==='private'))continue;const path=resolve(dir,name),info=await lstat(path);if(info.isSymbolicLink())throw new Error('Public assets must be ordinary files, not symbolic links.');if(info.isDirectory())await visit(path);else if(info.isFile()){if(paths.privateFiles.some(privatePath=>sameFile(path,privatePath)))throw new Error('Private configuration or runtime files do not belong in browser assets.');if(/^(?:access(?:-links)?|credentials?|secrets?)\./i.test(name)||/\.(?:pem|key)$/i.test(name))throw new Error('Credential files do not belong in browser assets.');files.set(relative(publicRoot,path).split(sep).join('/'),await readFile(path));}}};
  await visit(publicRoot);return files;
 }
 const plugin={name:'workshop-private-settings',enforce:'pre',
  resolveId(id,importer){if(!importer||!id.startsWith('.'))return;const target=resolve(dirname(importer),id);for(const [key,name] of Object.entries(names))if(target===resolve(projectRoot,name))return '\0workshop:'+key;},
  load(id){if(id.startsWith('\0workshop:'))return 'export default '+JSON.stringify(settings[id.slice(10)])+';';},
  configureServer(){throw new Error('Use npm run dev. Its build watcher serves only compiled app files, keeping private project files outside the web server.');},
  async generateBundle(){
   this.emitFile({type:'asset',fileName:'workshop-build.json',source:JSON.stringify(buildManifest(settings))});
   for(const [fileName,source] of await publicFiles())this.emitFile({type:'asset',fileName,source});
  },
 };
 return {plugins:[plugin,react()],publicDir:false,server:{host:'127.0.0.1'},build:{outDir:settings.mode==='production'?'dist-private':'dist',sourcemap:false,assetsInlineLimit:0}};
});
