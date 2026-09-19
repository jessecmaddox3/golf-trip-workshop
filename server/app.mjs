import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {z} from 'zod';
import {StoreError} from './store.mjs';
import {stateValidator} from '../src/schema.mjs';
import {buildEmptyData,recalculate} from '../src/model.mjs';
import {POLL} from '../src/poll.mjs';
import {createPoll} from '../src/poll-core.mjs';
import {validateReading} from '../src/scorecards.mjs';
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function makeRegistry(config){
 const players=Object.values(config.teams).flatMap(t=>t.players);
 return {version:1,eventId:config.event.id,cookieSecret:randomBytes(32).toString('hex'),actors:{owner:{role:'owner',respondent:null,tokenHash:tokenHash(randomBytes(32).toString('hex'))},scorekeeper:{role:'scorekeeper',respondent:null,tokenHash:tokenHash(randomBytes(32).toString('hex'))},...Object.fromEntries(players.map(p=>[p.id,{role:'participant',respondent:p.id,tokenHash:tokenHash(randomBytes(32).toString('hex'))}]))}};
}
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function sessionCookie(registry,actor,secure){
 const payload=Buffer.from(JSON.stringify({actor,eventId:registry.eventId,sessionVersion:registry.actors[actor].sessionVersion??0,exp:Date.now()+8*3600000})).toString('base64url');
 const signature=createHmac('sha256',registry.cookieSecret).update(payload).digest('base64url');
 return `golf_session=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`;
}
function principal(req,registry){
 const cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('golf_session='))?.slice(13);
 if(!cookie)return null;
 try{const [payload,signature]=cookie.split('.');if(!safeEqual(signature,createHmac('sha256',registry.cookieSecret).update(payload).digest('base64url')))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));const actor=registry.actors[data.actor];if(!Object.hasOwn(registry.actors,data.actor)||!actor||actor.disabled||data.sessionVersion!==(actor.sessionVersion??0)||data.eventId!==registry.eventId||!Number.isFinite(data.exp)||data.exp<Date.now())return null;return {id:data.actor,role:actor.role,respondent:actor.respondent??null};}catch{return null;}
}
async function jsonBody(req,limit=2_500_000){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new StoreError('CONTENT_TYPE','Send JSON content.',415);
 if(Number(req.headers['content-length']??0)>limit)throw new StoreError('TOO_LARGE','The request is too large.',413);
 let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new StoreError('TOO_LARGE','The request is too large.',413);parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new StoreError('INVALID_JSON','The request is not valid JSON.');}
}
const commandSchema=z.object({operationId:z.string().uuid(),baseRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),value:z.unknown()}).strict();
const imageSchema=z.object({mime:z.enum(['image/jpeg','image/png']),data:z.string().max(1_000_000),filename:z.string().max(100).optional()}).strict();
export function validateImage(value){
 const image=imageSchema.parse(value);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data))throw new StoreError('INVALID_IMAGE','Image encoding is invalid.');
 const bytes=Buffer.from(image.data,'base64');if(bytes.length<12||bytes.length>750000)throw new StoreError('INVALID_IMAGE','Use a JPEG or PNG image smaller than 750 KB.');
 const valid=image.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(!valid)throw new StoreError('INVALID_IMAGE','The declared image type does not match its bytes.');
 return {...image,bytes:bytes.length};
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const loginPage='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private golf workshop</title><body style="font:18px system-ui;max-width:40rem;margin:10vh auto;padding:24px"><h1>This workshop is private</h1><p>Open the personal access link your organizer gave you. It signs you in for eight hours on this browser.</p><p>Each person needs their own link. Ask the organizer if yours has expired or been replaced.</p></body></html>';
export async function createApplication({config,pollConfig=POLL,store,mode='demo',registry,loadRegistry,initialState,publicOrigin,staticDir,ocr={enabled:false},weather}){
 const {validateAnswer,summarize}=createPoll(pollConfig);
 if(!['demo','production'].includes(mode))throw new Error('Choose demo or production mode.');
 if(mode==='production'&&publicOrigin&&!/^https:\/\//.test(publicOrigin))throw new Error('Production public origin must use HTTPS.');
 const validateState=stateValidator(config),seed=validateState(initialState??buildEmptyData(config));await store.initialize({event:seed});
 // Startup is also an integrity check. Do not turn corrupted established state into a new demo.
 validateState((await store.read('event')).value);
 const players=Object.values(config.teams).flatMap(t=>t.players),pids=players.map(p=>p.id);
 const currentRegistry=async()=>{const r=loadRegistry?await loadRegistry():registry;if(!r||r.version!==1||r.eventId!==config.event.id||typeof r.cookieSecret!=='string'||r.cookieSecret.length<64||!r.actors)throw new StoreError('AUTH_CONFIG','Access configuration is unavailable.',503);return r;};
 return async(req,res)=>{
  const send=(status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
  for(const [name,value] of Object.entries({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}))res.setHeader(name,value);
  try{
   const actualHost=req.headers.host??'',expectedOrigin=publicOrigin??`http://${actualHost}`;
   let expected;try{expected=new URL(expectedOrigin);}catch{throw new StoreError('HOST','Invalid host.',403);}
   if(mode==='demo'&&!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(actualHost))throw new StoreError('HOST','Local demo requests must use loopback.',403);
   if(publicOrigin&&actualHost!==expected.host)throw new StoreError('HOST','This host does not match the configured public origin.',403);
   const url=new URL(req.url,expectedOrigin),path=url.pathname;
   const write=!['GET','HEAD'].includes(req.method);
   if(write&&(req.headers.origin!==expected.origin||req.headers['sec-fetch-site']==='cross-site'))throw new StoreError('ORIGIN','Open the app on its configured origin before saving.',403);
   if(path==='/api/demo/login'&&mode!=='demo')return send(404,{code:'NOT_FOUND',message:'Not found.'});
   const access=await currentRegistry();
   if(path==='/api/demo/login'&&req.method==='POST'){
    const body=z.object({actor:z.string().max(80)}).strict().parse(await jsonBody(req));
    if(!Object.hasOwn(access.actors,body.actor)||access.actors[body.actor].disabled)throw new StoreError('ACTOR','Unknown demo identity.');
    return send(200,{ok:true},{'Set-Cookie':sessionCookie(access,body.actor,false)});
   }
   if(req.method==='GET'&&url.searchParams.has('access')){
    const value=url.searchParams.get('access'),hash=tokenHash(value??'');
    const found=Object.entries(access.actors).find(([,a])=>!a.disabled&&safeEqual(a.tokenHash,hash));
    if(!found)throw new StoreError('ACCESS_LINK','This access link is not valid.',401);
    const destination=path.startsWith('/proposals')?path:path==='/poll'?'/#poll':'/';
    res.writeHead(303,{Location:destination,'Set-Cookie':sessionCookie(access,found[0],mode==='production')});return res.end();
   }
   const actor=principal(req,access);
   if(path==='/api/runtime'&&req.method==='GET')return send(200,{mode,eventId:actor?config.event.id:null,principal:actor,canEdit:!!actor&&['owner','scorekeeper'].includes(actor.role),ocrEnabled:!!ocr.enabled,identities:mode==='demo'?Object.entries(access.actors).map(([id,a])=>({id,name:players.find(p=>p.id===id)?.name??id,role:a.role})):[]});
   if(!actor){if(path.startsWith('/api/'))throw new StoreError('SIGN_IN','Sign in before opening this event.',401);if(mode==='production'){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});return res.end(loginPage);}}
   if(path.startsWith('/api/')&&req.headers['x-golf-actor']!==actor.id)throw new StoreError('ACCOUNT_CHANGED','The signed-in identity changed. Reload before continuing.',409);
   const editable=()=>{if(!['owner','scorekeeper'].includes(actor.role))throw new StoreError('FORBIDDEN','Only the organizer or a scorekeeper can change the tournament.',403);};
   if(path==='/api/logout'&&req.method==='POST')return send(200,{ok:true},{'Set-Cookie':'golf_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
   if(path==='/api/event'&&req.method==='GET'){const doc=await store.read('event');validateState(doc.value);return send(200,doc);}
   if(path==='/api/event'&&req.method==='PUT'){
    editable();const command=commandSchema.parse(await jsonBody(req));
    command.value=validateState(recalculate(config,command.value));
    for(const photo of Object.values(command.value.scorecardPhotos)){const saved=await store.getPhoto(photo.id);if(!saved||saved.mime!==photo.mime||Buffer.from(saved.data,'base64').length!==photo.bytes)throw new StoreError('PHOTO_REFERENCE','A referenced photo is missing or does not match this event.');}
    // lastUpdated belongs to the immutable request. The authoritative concurrency
    // version is assigned atomically by the store, never by a client timestamp.
    const receipt=await store.commit('event',command);return send(200,receipt);
   }
   if(path==='/api/poll'&&req.method==='GET'){
    const docs=await store.readMany(pids.map(id=>'poll-'+id)),answers=Object.fromEntries(pids.map(id=>[id,docs['poll-'+id].value]));
    return send(200,{respondent:actor.respondent,own:actor.respondent?docs['poll-'+actor.respondent]:null,summary:summarize(answers)});
   }
   if(path.startsWith('/api/poll/')&&req.method==='PUT'){
    const respondent=path.slice('/api/poll/'.length);
    if(!pids.includes(respondent)||respondent!==actor.respondent)throw new StoreError('FORBIDDEN','An access link can save only its own poll response.',403);
    const command=commandSchema.parse(await jsonBody(req,30000));command.value=validateAnswer(command.value);
    return send(200,await store.commit('poll-'+respondent,command));
   }
   if(path==='/api/photos'&&req.method==='POST'){
    editable();const photo=validateImage(await jsonBody(req,1_010_000)),id=randomUUID();await store.putPhoto(id,{mime:photo.mime,data:photo.data});
    return send(201,{id,filename:(photo.filename??'scorecard.jpg').replace(/[\\/\u0000-\u001f]/g,'_'),timestamp:new Date().toISOString(),bytes:photo.bytes,mime:photo.mime});
   }
   if(path.startsWith('/api/photos/')&&req.method==='GET'){
    const id=path.slice('/api/photos/'.length);if(!z.string().uuid().safeParse(id).success)throw new StoreError('NOT_FOUND','Photo not found.',404);
    const image=await store.getPhoto(id);if(!image)throw new StoreError('NOT_FOUND','Photo not found.',404);
    res.writeHead(200,{'Content-Type':image.mime,'Content-Disposition':`attachment; filename="scorecard-${id}.${image.mime==='image/png'?'png':'jpg'}"`});return res.end(Buffer.from(image.data,'base64'));
   }
   if(path==='/api/ocr'&&req.method==='POST'){
    editable();if(!ocr.enabled||!ocr.read)throw new StoreError('OCR_DISABLED','Image reading is not enabled. Enter and review the scorecard manually.',503);
    const photo=validateImage(await jsonBody(req,1_010_000));await store.reserveQuota('ocr-'+new Date().toISOString().slice(0,10),Math.min(100,Math.max(1,ocr.dailyLimit??20)));
    let result;try{result=validateReading(await ocr.read(photo,players.map(p=>p.name)));}catch{throw new StoreError('OCR_RESPONSE','The reader could not return a valid eighteen-hole scorecard. Use manual review. No scores were saved.',502);}
    return send(200,result);
   }
   if(path==='/api/weather'&&req.method==='GET')return send(200,weather?await weather():{available:false,description:'Weather is not configured. The organizer can enable a forecast source.'});
   if(path.startsWith('/api/'))throw new StoreError('NOT_FOUND','Not found.',404);
   if(write)throw new StoreError('METHOD','This page is read-only.',405);
   if(staticDir){
    let decoded;try{decoded=decodeURIComponent(path);}catch{throw new StoreError('PATH','Invalid path.');}
    let file=resolve(staticDir,'.'+decoded);if(file!==resolve(staticDir)&&!file.startsWith(resolve(staticDir)+sep))throw new StoreError('PATH','Invalid path.',403);
    let info;try{info=await stat(file);if(info.isDirectory())file=resolve(file,'index.html');}catch{if(!extname(decoded))file=resolve(staticDir,'index.html');else throw new StoreError('NOT_FOUND','Not found.',404);}
    const realRoot=await realpath(staticDir),realFile=await realpath(file);if(!realFile.startsWith(realRoot+sep)||!(await stat(realFile)).isFile())throw new StoreError('PATH','The requested file is outside the public app.',403);
    const bytes=await readFile(realFile);res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});return res.end(req.method==='HEAD'?undefined:bytes);
   }
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Golf Trip Workshop</title><p>The workshop server is ready.</p>');
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   if(error instanceof z.ZodError)return send(400,{code:'INVALID_DATA',message:'Please check the highlighted data fields.',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message})).slice(0,12)});
   if(error instanceof StoreError)return send(error.status,{code:error.code,message:error.message,...(error.details?{details:error.details}:{})});
   if(error?.message?.startsWith('Tournament ')||error instanceof TypeError)return send(400,{code:'INVALID_DATA',message:'This event data is incomplete or inconsistent. No replacement was saved.'});
   // Never return provider bodies, keys, filenames, stack traces or saved records.
   send(503,{code:'UNAVAILABLE',message:'The save service could not complete the request. Keep your local copy and retry.'});
  }
 };
}
