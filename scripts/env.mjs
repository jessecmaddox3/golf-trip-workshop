import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export function loadEnv(){
 try{process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)),'../.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
}
