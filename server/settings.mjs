import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConfig} from '../src/schema.mjs';
import {validatePollConfig} from '../src/poll-core.mjs';
import {validateProposals} from '../src/proposals.mjs';
import {digest} from './store.mjs';
export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function loadSettings(env=process.env){
 const mode=env.GOLF_MODE??'demo';if(!['demo','production'].includes(mode))throw new Error('GOLF_MODE must be demo or production.');
 const paths=Object.fromEntries([['tournament','GOLF_CONFIG','tournament.config.json'],['poll','GOLF_POLL_CONFIG','poll.config.json'],['proposals','GOLF_PROPOSALS_CONFIG','proposals.config.json']].map(([key,variable,fallback])=>[key,resolve(projectRoot,mode==='production'&&env[variable]?env[variable]:fallback)]));
 const values={};for(const [key,path] of Object.entries(paths)){const info=await stat(path);if(!info.isFile()||info.size>2_000_000)throw new Error('Each configuration must be a JSON file smaller than 2 MB.');values[key]=JSON.parse(await readFile(path,'utf8'));}
 const tournament=validateConfig(values.tournament),poll=validatePollConfig(values.poll),proposals=validateProposals(values.proposals);
 if(mode==='demo'&&(!tournament.demo.fictional||!proposals.fictional))throw new Error('The shipped demo configurations must remain wholly invented.');
 const ids=new Set(proposals.proposals.map(p=>p.id));if(poll.bases.some(b=>!ids.has(b.id)))throw new Error('Every poll base must match a configured proposal ID.');
 return {mode,tournament,poll,proposals,paths,configHash:digest({mode,tournament,poll,proposals})};
}
export function buildManifest(settings){return {version:1,mode:settings.mode,configHash:settings.configHash};}
export async function verifyBuild(settings,dist){
 let saved;try{saved=JSON.parse(await readFile(resolve(dist,'workshop-build.json'),'utf8'));}catch{throw new Error('Build the app for this mode before starting it.');}
 if(saved.version!==1||saved.mode!==settings.mode||saved.configHash!==settings.configHash)throw new Error('The browser build does not match this event configuration. Stop the server and run npm run build with the same mode and configuration.');
}
