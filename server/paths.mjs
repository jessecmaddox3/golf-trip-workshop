import {realpathSync,statSync} from 'node:fs';
import {resolve,dirname,basename,sep} from 'node:path';

// Resolve aliases even when the final directory/file has not been created yet.
export function canonicalPath(value){
 let path=resolve(value);const missing=[];
 for(;;){try{return resolve(realpathSync(path),...missing.reverse());}catch(error){
  if(error.code!=='ENOENT')throw error;
  const parent=dirname(path);if(parent===path)throw error;missing.push(basename(path));path=parent;
 }}
}
export const inside=(file,dir)=>file===dir||file.startsWith(dir+sep);
export function sameFile(a,b){
 if(canonicalPath(a)===canonicalPath(b))return true;
 try{const x=statSync(a),y=statSync(b);return x.ino!==0&&x.dev===y.dev&&x.ino===y.ino;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}
