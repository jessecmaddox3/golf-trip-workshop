import {useState,useRef,useEffect} from 'react';
import {getPlayer,TEE_DATA} from './model.mjs';
import {api,getRuntime,saveData,download} from './client.mjs';
import {validateReading,convertScores} from './scorecards.mjs';
async function compressImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20_000_000)throw new Error('Choose a JPEG, PNG or WebP photo smaller than 20 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((ok,fail)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=()=>fail(new Error('This browser could not open the photo.'));image.src=url;});
  const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
  let dataUrl,quality=.86;do{dataUrl=canvas.toDataURL('image/jpeg',quality);quality-=.12;}while(dataUrl.length>980000&&quality>.2);
  if(dataUrl.length>1000000)throw new Error('The compressed photo is still too large. Crop it closer to the scorecard and try again.');
  return {dataUrl,mime:'image/jpeg',data:dataUrl.split(',')[1],filename:'scorecard.jpg'};
 }finally{URL.revokeObjectURL(url);}
}
export default function ScorecardScanner({sessionId,players,data,setData,toast}){
 const input=useRef(),camera=useRef(),generation=useRef(0),request=useRef(null);const [photo,setPhoto]=useState(null),[reading,setReading]=useState(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const runtime=getRuntime(),actor=runtime?.principal?.id;
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[sessionId,actor]);
 function cancel(){generation.current++;request.current?.abort();request.current=null;setReading(null);setBusy(false);setStatus('Review canceled. No scores were applied.');}
 async function choose(e){const file=e.target.files?.[0];if(!file)return;const turn=++generation.current;setBusy(true);setReading(null);setStatus('Preparing the photo…');try{const p=await compressImage(file);if(turn!==generation.current)return;setPhoto(p);setStatus('Photo ready. Enter scores manually, or use optional AI reading if your organizer enabled it.');}catch(e){if(turn===generation.current)setStatus(e.message);}finally{if(turn===generation.current)setBusy(false);e.target.value='';}}
 function manual(){setReading({notation:'strokes',players:players.map(pid=>({name:getPlayer(pid).name,scores:Array(18).fill(null)}))});}
 function invented(){const pars=TEE_DATA[sessionId].pars;setReading({notation:'relative',players:players.map((pid,i)=>({name:getPlayer(pid).name,scores:pars.map((_,h)=>h===6?null:(h+i)%5===0?1:0)}))});setStatus('Invented scan result: zero means par in this example; hole 7 is unreadable.');}
 async function read(){if(!photo)return;if(!confirm('Send this compressed scorecard photo to the organizer’s configured Gemini account? It may incur an API charge. You will review every score before saving.'))return;const turn=++generation.current;setBusy(true);setStatus('Reading the scorecard…');try{const {dataUrl,...body}=photo;const result=validateReading(await api('/api/ocr',{method:'POST',body,actor}));if(turn===generation.current){setReading(result);setStatus('Review the reading and confirm the notation.');}}catch(e){if(turn===generation.current)setStatus(e.message);}finally{if(turn===generation.current)setBusy(false);}}
 async function save(assigned){const turn=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);try{
  let metadata;if(photo){const {dataUrl,...body}=photo;metadata=await api('/api/photos',{method:'POST',body,actor,signal:controller.signal});}
  if(turn!==generation.current||getRuntime()?.principal?.id!==actor)return;
  setData(prev=>({...prev,playerScores:{...prev.playerScores,[sessionId]:{...(prev.playerScores[sessionId]??{}),...assigned}},scorecardPhotos:metadata?{...prev.scorecardPhotos,[sessionId]:metadata}:prev.scorecardPhotos,lastUpdated:new Date().toISOString()}));
  if(!await saveData())return;setReading(null);setStatus('Scores queued. The save bar shows when the shared copy is saved.');toast('Scorecard queued');
 }catch(e){if(turn===generation.current)setStatus(e.message);}finally{if(turn===generation.current){setBusy(false);request.current=null;}}}
 async function downloadPhoto(){try{const metadata=data.scorecardPhotos[sessionId],blob=await api('/api/photos/'+metadata.id,{blob:true,actor});download(metadata.filename,blob);}catch(e){setStatus(e.message);}}
 return <section className="scorecard-scanner" aria-label="Scorecard photo and review">
  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!runtime.canEdit} onChange={choose}/><input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" hidden disabled={!runtime.canEdit} onChange={choose}/>
  <div className="button-row"><button className="btn btn2" disabled={busy||!runtime.canEdit} onClick={()=>camera.current.click()}>Take photo</button><button className="btn btn2" disabled={busy||!runtime.canEdit} onClick={()=>input.current.click()}>Upload photo</button><button className="btn btn2" disabled={busy||!runtime.canEdit} onClick={manual}>Enter scorecard manually</button>{runtime.mode==='demo'&&<button className="btn btn2" disabled={busy||!runtime.canEdit} onClick={invented}>Try invented scan</button>}</div>
  {photo&&<img className="scan-preview" src={photo.dataUrl} alt="Your compressed scorecard, ready for review"/>}
  {photo&&runtime.ocrEnabled&&<button className="btn btn1" disabled={busy||!runtime.canEdit} onClick={read}>Read with AI</button>}
  {data.scorecardPhotos[sessionId]&&<button className="btn btn2" onClick={downloadPhoto}>Download saved scorecard photo</button>}
  <p role="status" className="inline-note">{status}</p>
  {reading&&<ScanReview reading={reading} players={players} sessionId={sessionId} busy={busy} onSave={save} onCancel={cancel}/>}
 </section>;
}
function ScanReview({reading,players,sessionId,onSave,onCancel,busy}){
 const dialog=useRef(null);useEffect(()=>{dialog.current.showModal();},[]);
 const [notation,setNotation]=useState(reading.notation==='unknown'?'':reading.notation),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const [rows,setRows]=useState(()=>{const claimed=new Set();return reading.players.map(p=>{const pid=players.find(id=>!claimed.has(id)&&[getPlayer(id).name,getPlayer(id).short].some(n=>n.toLowerCase()===p.name.toLowerCase()))??'';if(pid)claimed.add(pid);return {name:p.name,pid,raw:[...p.scores]};});});
 const pars=TEE_DATA[sessionId].pars;
 function change(i,patch){setRows(prev=>prev.map((r,j)=>i===j?{...r,...patch}:r));setConfirmed(false);}
 function save(){try{if(!confirmed)throw new Error('Confirm the notation and review before saving.');if(rows.some(r=>!r.pid)||new Set(rows.map(r=>r.pid)).size!==rows.length)throw new Error('Assign each row to a different player.');onSave(Object.fromEntries(rows.map(r=>[r.pid,convertScores(r.raw,notation,pars)])));}catch(e){setError(e.message);}}
 return <dialog ref={dialog} className="sr-overlay" aria-labelledby="score-review-title" onCancel={e=>{e.preventDefault();onCancel();}}><div className="sr-header"><div><h2 id="score-review-title" className="sr-title">Review scorecard</h2><p>Match the people, check every hole, then save.</p></div><button className="btn btn2" onClick={onCancel}>Close</button></div>
  <div className="sr-body"><div className="card"><label className="field">What do the numbers on this card mean?<select value={notation} onChange={e=>{setNotation(e.target.value);setConfirmed(false);}}><option value="">Choose notation</option><option value="strokes">Actual strokes, such as 4, 5, 3</option><option value="relative">Relative to par, such as 0, +1, -1</option></select></label><p className="inline-note">Blank means unreadable or unplayed. It never becomes par automatically. The entered values below stay in the notation you selected.</p></div>
  {rows.map((row,ri)=><section className="sr-card" key={ri}><label className="field">Scorecard row: {row.name}<select disabled={busy} value={row.pid} onChange={e=>change(ri,{pid:e.target.value})}><option value="">Choose player</option>{players.map(id=><option key={id} value={id}>{getPlayer(id).name}</option>)}</select></label><div className="review-grid">{row.raw.map((v,hi)=><label className="review-hole" key={hi}><span>Hole {hi+1}</span><small>Par {pars[hi]}</small><input disabled={busy} aria-label={`${row.name} hole ${hi+1}`} type="number" min={notation==='relative'?-5:1} max={30} step="1" value={v??''} onChange={e=>{const raw=[...row.raw];raw[hi]=e.target.value===''?null:Number(e.target.value);change(ri,{raw});}}/>{notation==='relative'&&v!==null&&<small>{pars[hi]+v} strokes</small>}</label>)}</div><button disabled={busy} className="btn btn2" onClick={()=>setRows(prev=>prev.filter((_,i)=>i!==ri))}>Remove this row</button></section>)}
  <button disabled={busy} className="btn btn2" onClick={()=>{setRows(prev=>[...prev,{name:'Additional row',pid:'',raw:Array(18).fill(null)}]);setConfirmed(false);}}>Add a player row</button>
  <label className="check-row"><input disabled={busy} type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked the people, notation and scores. Blank cells should stay blank.</label>
  {error&&<p role="alert" className="error-note">{error}</p>}<div className="button-row"><button className="btn btn1" disabled={busy||!confirmed||!notation||!rows.length} onClick={save}>Save reviewed scores</button><button className="btn btn2" onClick={onCancel}>Cancel</button></div></div></dialog>;
}
