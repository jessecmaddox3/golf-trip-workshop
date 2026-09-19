import {resolve,dirname} from 'node:path';
import {LocalStore,RedisStore} from './store.mjs';
import {projectRoot} from './settings.mjs';
import {canonicalPath,inside,sameFile} from './paths.mjs';
export function runtimePaths(settings,env=process.env){
 const demo=settings.mode==='demo',dataDir=canonicalPath((demo?env.GOLF_DEMO_DATA_DIR:env.GOLF_DATA_DIR)??resolve(projectRoot,'.local',settings.mode));
 const accessFile=canonicalPath((demo?undefined:env.GOLF_ACCESS_FILE)??resolve(dataDir,'access.json'));
 const linkPage=resolve(dirname(accessFile),'access-links.html'),storeDir=canonicalPath(resolve(dataDir,'store'));
 for(const dir of ['public','dist','dist-private'].map(p=>canonicalPath(resolve(projectRoot,p))))if([dataDir,storeDir,accessFile,canonicalPath(linkPage)].some(p=>inside(p,dir)))throw new Error('Store data and access links outside every browser asset/build folder. Use .local or a separate private directory.');
 const configs=Object.values(settings.paths),storeFiles=['state.json','binding.json'].map(p=>resolve(storeDir,p));
 if(sameFile(accessFile,linkPage)||[accessFile,linkPage].some(p=>inside(canonicalPath(p),storeDir)||[...configs,...storeFiles].some(other=>sameFile(p,other))))throw new Error('Private access files collide with each other, a configuration or the saved store. Choose a separate private access JSON filename.');
 // Demo ignores production contents, but an asset must not be a hard-link alias
 // of a production credential, private setting or saved record beside the demo.
 const productionDirs=[resolve(projectRoot,'.local','production'),resolve(env.GOLF_DATA_DIR??resolve(projectRoot,'.local','production'))];
 const productionAccess=[...productionDirs.map(p=>resolve(p,'access.json')),...(env.GOLF_ACCESS_FILE?[resolve(env.GOLF_ACCESS_FILE)]:[])];
 const productionFiles=[...productionAccess,...productionAccess.map(p=>resolve(dirname(p),'access-links.html')),...productionDirs.flatMap(p=>['state.json','binding.json'].map(name=>resolve(p,'store',name))),...['GOLF_CONFIG','GOLF_POLL_CONFIG','GOLF_PROPOSALS_CONFIG'].filter(key=>env[key]).map(key=>resolve(projectRoot,env[key]))];
 return {dataDir,storeDir,accessFile,linkPage,privateFiles:[accessFile,linkPage,...configs,...storeFiles,...productionFiles,resolve(projectRoot,'.env')],staticDir:resolve(projectRoot,demo?'dist':'dist-private')};
}
export async function openStore(settings,env=process.env,{allowCreate=false}={}){
 const {storeDir}=runtimePaths(settings,env),options={eventId:settings.tournament.event.id,configHash:settings.configHash};
 if(settings.mode==='production'&&env.GOLF_STORAGE==='redis'){
  if(!env.UPSTASH_REDIS_REST_URL||!env.UPSTASH_REDIS_REST_TOKEN)throw new Error('Configure both private Upstash Redis credentials.');
  const {Redis}=await import('@upstash/redis');return new RedisStore({...options,allowCreate,client:new Redis({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN,automaticDeserialization:false})});
 }
 if(settings.mode==='production'&&env.GOLF_STORAGE&&!['local','redis'].includes(env.GOLF_STORAGE))throw new Error('GOLF_STORAGE must be local or redis.');
 return new LocalStore({...options,dir:storeDir});
}
