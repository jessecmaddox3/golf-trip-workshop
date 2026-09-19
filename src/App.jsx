import {useState,useEffect,useRef,useMemo,createContext,useContext} from 'react';
import './app.css';
import ScorecardScanner from './ScorecardScanner.jsx';
import {api,saveData,download,getRuntime,setRuntime,bindQueue,makeQueue,markStage,hasPendingChanges} from './client.mjs';
import {stateValidator} from './schema.mjs';
import {recalculate,buildEmptyData} from './model.mjs';
import {wxEmoji,getSessionWeather} from './weather.mjs';
import {POLL,blankAnswer,validateAnswer} from './poll.mjs';
import {contestSummary} from './contests.mjs';
import ProposalsTab from './Proposals.jsx';
import {setPlayerTee,playedTotals,removeManualOverride} from './edits.mjs';
import {config,TEAMS,ALL_PLAYERS,getPlayer,getTeamForPlayer,SCHEDULE,SESSIONS,COMPETITIVE,COURSE_DATA,TEE_DATA,SEED_HANDICAPS,FIRST_TEE,SESSION_STARTS,TOTAL_POINTS,EXPLORE_ACTIVITIES,EXPLORE_RESTAURANTS,EXPLORE_DELIVERY,TURF_INTEL,CTP_HOLES,WEATHER_SESSIONS,getEventContext,buildSeedData,computePoints,civilParts} from './model.mjs';
import {getCourseHC,getMatchStrokes,computeMatchResult,tryAutoCalcResults,applyPairings,computeNetBirdies,computeFunStats,computeSandbaggerData,computeBalances,computeSettlements,getPlayerIndex,scoreValue} from './engine.mjs';
const ga=()=>{};
const EditAccess=createContext(false);
function EditButton(props){const canEdit=useContext(EditAccess);return <button {...props} disabled={!canEdit||props.disabled}/>;}
function EditInput(props){const canEdit=useContext(EditAccess);return <input {...props} disabled={!canEdit||props.disabled}/>;}
function EditSelect(props){const canEdit=useContext(EditAccess);return <select {...props} disabled={!canEdit||props.disabled}/>;}
function EditTextarea(props){const canEdit=useContext(EditAccess);return <textarea {...props} disabled={!canEdit||props.disabled}/>;}
const MATCH_RESULTS=[{value:'AS',label:'All Square',desc:'A tied match'},...Array.from({length:2},(_,i)=>({value:`${i+1}UP`,label:`${i+1} up`,desc:'Won on the last hole'})),...Array.from({length:9},(_,i)=>{const remaining=i+1;return Array.from({length:Math.min(18-remaining,remaining+2)-remaining},(_,j)=>{const lead=remaining+j+1;return {value:`${lead}&${remaining}`,label:`${lead} & ${remaining}`,desc:`Clinched with ${remaining} holes remaining`};});}).flat()];
function Toast({msg}){return msg?<div className="toast">{msg}</div>:null}
function Badge({result,match}){
  if(match?.tbd&&!result) return <span className="bdg bdg-t">TBD Pairings</span>;
  if(!result) return <span className="bdg bdg-p">Upload Scores</span>;
  if(result.outcome==="halved") return <span className="bdg bdg-h">All Square: ½ each</span>;
  const c=result.winner==="usa"?"bdg-u":"bdg-a";const n=result.winner==="usa"?TEAMS.usa.name:TEAMS.europe.name;
  return <span className={`bdg ${c}`}>{n} wins, {result.margin}</span>;
}


function ScoreModal({match,result:cur,onSave,onClose,onClear}){
  const [winner,setWinner]=useState(cur?.winner||"");
  const [margin,setMargin]=useState(cur?.outcome==='halved'?'AS':cur?.margin||"");
  const dialog=useRef(null);
  useEffect(()=>{dialog.current.showModal();},[]);
  const un=match.usaPlayers.map(id=>getPlayer(id)?.short).join(" & ");
  const an=match.euroPlayers.map(id=>getPlayer(id)?.short).join(" & ");
  const isHalved=margin==="AS";
  const canSave=margin&&(isHalved||winner);
  const save=()=>{
    if(isHalved) onSave({outcome:"halved",winner:null,margin:"All Square",source:"manual"});
    else onSave({outcome:"win",winner,margin,source:"manual"});
  };
  return (
    <dialog className="score-dialog" ref={dialog} aria-labelledby="match-result-title" onCancel={e=>{e.preventDefault();onClose();}}><div className="mdl">
      <div className="mdt" id="match-result-title">Match Result</div>
      <div style={{marginBottom:14,fontSize:14,color:"var(--text-sec)"}}>
        <span style={{color:"var(--usa)",fontWeight:600}}>{un}</span> vs <span style={{color:"var(--europe)",fontWeight:600}}>{an}</span>
      </div>

      <div className="cl" style={{marginBottom:8}}>Who Won?</div>
      <div className="ol">
        <button className={`oi ${winner==="usa"&&!isHalved?"sel":""}`} aria-pressed={winner==='usa'&&!isHalved} onClick={()=>{setWinner("usa");if(margin==="AS")setMargin("")}}><span className="od"/><span>{TEAMS.usa.flag} <strong>{un}</strong></span></button>
        <button className={`oi ${winner==="europe"&&!isHalved?"sel":""}`} aria-pressed={winner==='europe'&&!isHalved} onClick={()=>{setWinner("europe");if(margin==="AS")setMargin("")}}><span className="od"/><span>{TEAMS.europe.flag} <strong>{an}</strong></span></button>
        <button className={`oi ${isHalved?"sel":""}`} aria-pressed={isHalved} onClick={()=>{setMargin("AS");setWinner("")}}><span className="od"/><span>🤝 <strong>All Square (Halved)</strong></span></button>
      </div>

      {!isHalved&&winner&&<>
        <div className="cl" style={{marginBottom:8}}>Final Score</div>
        <div className="ol" style={{maxHeight:280,overflowY:"auto"}}>
          {MATCH_RESULTS.filter(r=>r.value!=="AS").map(r=>(
            <button key={r.value} className={`oi ${margin===r.value?"sel":""}`} aria-pressed={margin===r.value} onClick={()=>setMargin(r.value)} style={{padding:"10px 14px"}}>
              <span className="od"/><span style={{fontWeight:600}}>{r.label}</span><span className="oi-desc">{r.desc}</span>
            </button>
          ))}
        </div>
      </>}

      <div className="br">
        {cur?.source==='manual'&&<EditButton className="btn btn2" onClick={onClear}>Remove manual override</EditButton>}
        <button className="btn btn2" onClick={onClose}>Cancel</button>
        <EditButton className="btn btn1" disabled={!canSave} onClick={save}>Save Result</EditButton>
      </div>
    </div></dialog>
  );
}

// ─── Image Compression ───────────────────────────────────────────────────────
function FunStatsCard({data}){
  const [expanded,setExpanded]=useState(false);
  const [copied,setCopied]=useState(false);
  const stats=computeFunStats(data);
  if(!stats.length)return null;
  const shown=expanded?stats:stats.slice(0,10);
  const copyStats=()=>{
    const lines=stats.map(s=>`${s.emoji} ${s.title}: ${s.detail}: ${s.value}`);
    const text=`📊 Tournament Stats: ${config.event.name}\n`+("─".repeat(44))+"\n"+lines.join("\n");
    navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)});
  };
  return(<div className="card" style={{marginBottom:20,borderLeft:"3px solid var(--gold)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)"}}>📊 Tournament Stats</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button className="eb" style={{fontSize:11,padding:"4px 10px"}} onClick={copyStats}>{copied?"Copied!":"Copy"}</button>
        <span style={{fontSize:11,color:"var(--text-mut)"}}>{stats.length} stats</span>
      </div>
    </div>
    {shown.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:i>0?"1px solid var(--ivory)":"none"}}>
      <div style={{fontSize:18,flexShrink:0,width:28,textAlign:"center"}}>{s.emoji}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:14,color:"var(--text)"}}>{s.title}</div>
        <div style={{fontSize:12,color:"var(--text-mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.detail}</div>
      </div>
      <div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,fontSize:14,color:"var(--forest)",flexShrink:0,textAlign:"right"}}>{s.value}</div>
    </div>)}
    {stats.length>10&&<button className="btn btn2" style={{width:"100%",marginTop:12,fontSize:13}} onClick={()=>{setExpanded(!expanded);ga('fun_stats_expand',{expanded:!expanded})}}>{expanded?`Show Less`:`Show All ${stats.length} Stats`}</button>}
  </div>);
}

function SandbaggerCard({data}){
  const [exp,setExp]=useState(null);
  const [copied,setCopied]=useState(false);
  const sbData=useMemo(()=>computeSandbaggerData(data),[data]);
  if(!sbData.length) return null;
  const copyText=()=>{
    const lines=[`🕵️ Performance Model: ${config.event.name}`,"═".repeat(44)];
    sbData.forEach((p,i)=>{
      lines.push(`\n${i+1}. ${p.name} (HC ${p.index}): ${p.verdict}`);
      lines.push(`   Avg ${Math.abs(p.avgPerformance)} strokes ${p.avgPerformance>0?"better":"worse"} than expected · Net avg: ${p.avgNetVsPar>=0?"+":""}${p.avgNetVsPar} vs par`);
      p.rounds.forEach(r=>{
        lines.push(`   ${r.course}: Shot ${r.gross} (exp ~${r.expected}) · Net ${r.netVsPar>=0?"+":""}${r.netVsPar} · ${r.oneInX>=3?"1 in "+r.oneInX:"Expected"}`);
      });
      if(p.rounds.length>1) lines.push(`   Combined odds: 1 in ${p.combinedOneInX}`);
    });
    navigator.clipboard.writeText(lines.join("\n")).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)});
  };
  const meterColor=v=>v>4?"#dc2626":v>2?"#ea580c":v>0?"#ca8a04":v>-2?"#16a34a":"#2563eb";
  const meterPct=v=>Math.max(0,Math.min(100,50+(v/8)*50));
  return(<div className="card" style={{marginBottom:20,borderLeft:"3px solid var(--red-soft)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)"}}>🕵️ Sandbagger Index</div>
      <button className="eb" style={{fontSize:11,padding:"4px 10px"}} onClick={copyText}>{copied?"Copied!":"Copy"}</button>
    </div>
    <div style={{fontSize:12,color:"var(--text-mut)",marginBottom:14,lineHeight:1.4}}>How well did each player perform vs. what their handicap predicted?</div>
    {sbData.map((p,i)=>{
      const isExp=exp===p.id;
      return<div key={p.id} style={{borderTop:i>0?"1px solid var(--ivory)":"none"}}>
        <div onClick={()=>setExp(isExp?null:p.id)} style={{padding:"10px 0",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontWeight:700,fontSize:13,color:"var(--text-mut)",width:18,flexShrink:0}}>{i+1}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontWeight:600,fontSize:14,color:p.team==="usa"?"var(--usa)":"var(--europe)"}}>{p.name}</span>
                <span style={{fontSize:11,fontFamily:"'JetBrains Mono Variable',monospace",color:"var(--text-mut)"}}>HC {p.index}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                <div style={{flex:1,height:6,borderRadius:3,background:"var(--ivory)",overflow:"hidden",maxWidth:120}}>
                  <div style={{width:`${meterPct(p.avgPerformance)}%`,height:"100%",borderRadius:3,background:meterColor(p.avgPerformance),transition:"width 0.3s"}}/>
                </div>
                <span style={{fontSize:11,color:p.verdictColor,fontWeight:600}}>{p.verdict}</span>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontSize:16,fontWeight:700,color:meterColor(p.avgPerformance)}}>{p.avgPerformance>0?"+":""}{p.avgPerformance}</div>
              <div style={{fontSize:10,color:"var(--text-mut)"}}>vs expected</div>
            </div>
          </div>
        </div>
        {isExp&&<div style={{padding:"0 0 12px 26px"}}>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:10}}>
            <div style={{fontSize:12}}><span style={{color:"var(--text-mut)"}}>Avg Net: </span><span style={{fontWeight:700,color:p.avgNetVsPar<0?"var(--forest)":p.avgNetVsPar>0?"var(--red-soft)":"var(--text)"}}>{p.avgNetVsPar>=0?"+":""}{p.avgNetVsPar}</span><span style={{color:"var(--text-mut)"}}> vs par</span></div>
            <div style={{fontSize:12}}><span style={{color:"var(--text-mut)"}}>Rounds: </span><span style={{fontWeight:600}}>{p.rounds.length}</span></div>
            {p.rounds.length>1&&<div style={{fontSize:12}}><span style={{color:"var(--text-mut)"}}>Combined odds: </span><span style={{fontWeight:700,color:p.combinedOneInX>10?"var(--red-soft)":"var(--text)"}}>1 in {p.combinedOneInX}</span></div>}
          </div>
          {p.rounds.map((r,ri)=><div key={ri} style={{padding:"8px 0",borderTop:"1px solid var(--ivory)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:4}}>
              <span style={{fontWeight:600,fontSize:13,color:"var(--navy)"}}>{r.course}</span>
              <span style={{fontSize:11,color:"var(--text-mut)"}}>{r.teeName} tees</span>
            </div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:4,fontSize:12}}>
              <span><span style={{color:"var(--text-mut)"}}>Gross </span><span style={{fontWeight:700}}>{r.gross}</span></span>
              <span><span style={{color:"var(--text-mut)"}}>Exp </span><span style={{fontWeight:600}}>~{r.expected}</span></span>
              <span><span style={{color:"var(--text-mut)"}}>CH </span><span style={{fontWeight:600}}>{r.courseHC}</span></span>
              <span><span style={{color:"var(--text-mut)"}}>Net </span><span style={{fontWeight:700,color:r.netVsPar<0?"var(--forest)":r.netVsPar>0?"var(--red-soft)":"var(--text)"}}>{r.netVsPar>=0?"+":""}{r.netVsPar}</span></span>
              <span><span style={{color:"var(--text-mut)"}}>Diff </span><span style={{fontWeight:600,color:r.diff>0?"var(--red-soft)":"var(--forest)"}}>{r.diff>0?"+":""}{r.diff}</span></span>
              <span style={{fontWeight:600,color:r.oneInX>=10?"var(--red-soft)":r.oneInX>=3?"var(--gold-dk)":"var(--text-mut)"}}>{r.oneInX>=3?`1 in ${r.oneInX}`:"Expected"}</span>
            </div>
          </div>)}
          <div style={{fontSize:11,color:"var(--text-mut)",marginTop:8,lineHeight:1.4,borderTop:"1px dashed var(--sand)",paddingTop:8}}>
            Unadjusted differential estimate: {p.rounds.map(r=>r.ghinDiff).join(", ")} · Index: {p.index} · "vs Exp" = strokes better than predicted avg for this handicap. Odds use a simplified normal model for fun, not an official handicap calculation or evidence of cheating.
          </div>
        </div>}
      </div>})}
  </div>);
}

function DashboardTab({data,pts,ctx,weather}){
  const comp=COMPETITIVE.flatMap(s=>s.matches).filter(m=>data.matchResults?.[m.id]).length;
  const d=pts.usa-pts.europe;
  const msg=ctx.phase==="pre"
    ?(ctx.daysUntil===1?"Competition begins tomorrow":`${ctx.daysUntil} days until ${config.event.name}`)
    :ctx.phase==="post"
    ?(comp<TOTAL_POINTS?"Event ended; some results are missing":d>0?`${TEAMS.usa.name} wins ${config.event.name}!`:d<0?`${TEAMS.europe.name} wins ${config.event.name}!`:`${config.event.name} ended All Square`)
    :(comp===0?"Competition has not yet begun":d>0?`${TEAMS.usa.name} leads by ${d}`:d<0?`${TEAMS.europe.name} leads by ${Math.abs(d)}`:"All square");

  const {cur,next,last}=ctx;
  const isNextToday=next&&ctx.todayIdx>=0&&next.dayIdx===ctx.todayIdx;
  const nextLabel=!next?"":isNextToday?`Up Next: ${next.time}`:next.dayIdx===ctx.todayIdx+1?`Tomorrow: ${next.dayName}`:`Coming Up: ${next.dayName}, ${next.dayDate}`;

  const renderMatchRow=(sId)=>(m_raw,i)=>{
    const m=applyPairings(m_raw,data);
    const result=data.matchResults[m.id];
    const hasScores=sId&&!m.tbd&&[...m.usaPlayers,...m.euroPlayers].some(pid=>data.playerScores?.[sId]?.[pid]?.some(v=>v!==""&&v!=null));
    const un=m.usaPlayers.map(id=>getPlayer(id)?.short||"TBD").join(" & ");
    const an=m.euroPlayers.map(id=>getPlayer(id)?.short||"TBD").join(" & ");
    return(<div key={i} style={{padding:"8px 0",borderTop:i>0?"1px solid var(--ivory)":"none"}}>
      <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:4,fontSize:15,lineHeight:1.4}}>
        <span style={{color:"var(--usa)",fontWeight:600}}>{m.tbd?"TBD":un}</span>
        <span style={{color:"var(--text-mut)",fontSize:11}}>vs</span>
        <span style={{color:"var(--europe)",fontWeight:600}}>{m.tbd?"TBD":an}</span>
        {hasScores&&!result&&<span className="bdg bdg-t" style={{fontSize:10,padding:"2px 7px"}}>Scores In</span>}
      </div>
      <div style={{marginTop:4}}><Badge result={result} match={m}/></div>
    </div>);
  };

  return (<div>
    <div className="sb">
      <div className="tb u"><div className="tf">🌲</div><div className="tn u">{TEAMS.usa.name}</div><div className="tc">{TEAMS.usa.players.find(p=>p.role==="Captain")?.short}</div></div>
      <div className="sctr"><div className="scb"><span className="u">{pts.usa}</span><span className="d">–</span><span className="a">{pts.europe}</span></div><div className="scl">Total Points</div><div style={{marginTop:8,fontSize:13,color:"var(--text-sec)"}}>{msg}</div>{comp>0&&<div className="pb" style={{maxWidth:160,margin:"8px auto 0"}}><div className="s u" style={{width:`${(pts.usa/(pts.usa+pts.europe||1))*100}%`}}/><div className="s a" style={{width:`${(pts.europe/(pts.usa+pts.europe||1))*100}%`}}/></div>}</div>
      <div className="tb a"><div className="tf">🌾</div><div className="tn a">{TEAMS.europe.name}</div><div className="tc">{TEAMS.europe.players.find(p=>p.role==="Captain")?.short}</div></div>
    </div>

    {ctx.phase==="pre"&&<div className="card" style={{borderLeft:"3px solid var(--navy)",textAlign:"center",padding:28,marginBottom:20}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:56,fontWeight:700,color:"var(--navy)",lineHeight:1}}>{ctx.daysUntil}</div>
      <div style={{fontSize:12,color:"var(--text-mut)",textTransform:"uppercase",letterSpacing:3,fontWeight:600,marginTop:6}}>{ctx.daysUntil===1?"Day Until Tee Off":"Days Until Tee Off"}</div>
      <div style={{fontSize:14,color:"var(--text-sec)",marginTop:10}}>{config.event.location} · {config.event.edition}</div>
    </div>}

    {ctx.phase==="post"&&comp===TOTAL_POINTS&&<div className="card" style={{borderLeft:"3px solid var(--gold)",textAlign:"center",padding:24,marginBottom:20}}>
      <div style={{fontSize:28,marginBottom:4}}>🏆</div>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:22,fontWeight:700,color:"var(--navy)"}}>{d>0?`${TEAMS.usa.name} Wins!`:d<0?`${TEAMS.europe.name} Wins!`:"All Square: A Draw!"}</div>
      <div style={{fontSize:14,color:"var(--text-sec)",marginTop:6}}>{config.event.name} · Final Score: {pts.usa} – {pts.europe}</div>
    </div>}

    {cur?.isCompetitive&&<div className="card" style={{borderLeft:"3px solid var(--forest)",marginBottom:20,padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
        <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"var(--red-soft)",animation:"pulse 2s ease-in-out infinite"}}/>
        <span className="cl" style={{color:"var(--forest)",marginBottom:0}}>Now Playing</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)"}}>{cur.course}</div>
        {courseAddr(cur.courseId)&&<MapLink to={courseAddr(cur.courseId)} label={cur.course}/>}
      </div>
      <div style={{fontSize:13,color:"var(--text-mut)",marginBottom:14,marginTop:2}}>{cur.format} · Started at {cur.time} · {cur.dayLabel}</div>
      {cur.matches.map(renderMatchRow(cur.id))}
    </div>}

    {cur&&!cur.isCompetitive&&<div className="card" style={{borderLeft:"3px solid var(--forest)",marginBottom:20,padding:18}}>
      <div className="cl" style={{color:"var(--forest)",marginBottom:8}}>⛳ Practice Round in Progress</div>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:18,fontWeight:700,color:"var(--navy)",marginBottom:4}}>{cur.course}</div>
      <div style={{fontSize:14,color:"var(--text-sec)"}}>{cur.time} · {cur.participants?.map(id=>getPlayer(id)?.short).join(", ")}</div>
    </div>}

    {!cur&&last?.isCompetitive&&ctx.phase==="during"&&<div className="card" style={{borderLeft:"3px solid var(--navy)",marginBottom:14,padding:18}}>
      <div className="cl" style={{marginBottom:8}}>Latest: {last.course.includes("–")?last.course.split("–").pop().trim():last.course}</div>
      {last.matches.map(renderMatchRow(last.id))}
    </div>}

    {!cur&&next&&(ctx.phase==="during"||(ctx.phase==="pre"&&ctx.daysUntil<=1))&&<div className="card" style={{borderLeft:`3px solid ${next.isCompetitive?"var(--gold)":"var(--forest)"}`,marginBottom:20,padding:16}}>
      <div className="cl" style={{color:next.isCompetitive?"var(--gold-dk)":"var(--forest)",marginBottom:8}}>⏭ {nextLabel}</div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)"}}>{next.course}</div>
        {courseAddr(next.courseId)&&<MapLink to={courseAddr(next.courseId)} label={next.course}/>}
      </div>
      <div style={{fontSize:13,color:"var(--text-mut)",marginBottom:next.matches?.length?14:0,marginTop:2}}>{next.format} · {next.dayLabel}</div>
      {next.isCompetitive&&next.matches.map(renderMatchRow(next.id))}
      {!next.isCompetitive&&next.participants&&<div style={{fontSize:14,color:"var(--text-sec)",marginTop:8}}>Players: {next.participants.map(id=>getPlayer(id)?.short).join(", ")}</div>}
    </div>}

    {weather&&(()=>{
      const target=ctx.cur||ctx.next;
      const sess=target?WEATHER_SESSIONS.find(s=>s.id===target.id):null;
      const wx=sess&&weather?.hourly?.data?getSessionWeather(weather.hourly.data,sess):null;
      return wx?<div className="card" style={{borderLeft:"3px solid var(--gold)",marginBottom:20,padding:16,cursor:"pointer"}} onClick={()=>document.querySelector('[data-tab="weather"]')?.click()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div>
            <div className="cl" style={{marginBottom:4,color:"var(--gold-dk)"}}>{wxEmoji(wx.conditions)} {sess.label}</div>
            <div style={{fontSize:14,color:"var(--text-sec)"}}>{wx.tempRange[0]}°–{wx.tempRange[1]}°F · {wx.avgWind}mph {wx.windDir} · {wx.maxPrecipChance}% rain</div>
            <div style={{fontSize:12,color:"var(--text-mut)",marginTop:2}}>{wx.conditions}</div>
          </div>
          <div style={{fontSize:28}}>{wxEmoji(wx.conditions)}</div>
        </div>
      </div>:null;
    })()}

    <div className="ig" style={{marginBottom:20}}>
      <div className="ii"><div className="il">Location</div><div className="iv">{config.event.location}</div></div>
      <div className="ii"><div className="il">Dates</div><div className="iv">{SCHEDULE[0].date} to {SCHEDULE.at(-1).date}, {config.event.startsAt.slice(0,4)}</div></div>
      <div className="ii"><div className="il">Completed</div><div className="iv">{comp} of {TOTAL_POINTS} matches</div></div>
      <div className="ii"><div className="il">Remaining</div><div className="iv">{TOTAL_POINTS-comp} points available</div></div>
    </div>
    <FunStatsCard data={data}/>
    <SandbaggerCard data={data}/>
    {data.announcements?.length>0&&<div style={{marginBottom:20}}><div className="cl" style={{marginBottom:8}}>Latest Updates</div>{data.announcements.slice(-3).reverse().map((a,i)=><div key={i} className="ann"><div className="ann-t">{a.time}</div><div className="ann-x">{a.text}</div></div>)}</div>}
    <div className="cl" style={{marginBottom:8}}>Schedule</div>
    {SCHEDULE.map((day,i)=>{const isToday=i===ctx.todayIdx;const isPast=ctx.phase!=="post"&&ctx.todayIdx>=0&&i<ctx.todayIdx;return<div key={i} className="cc" style={{borderLeftColor:isToday?"var(--forest)":undefined,opacity:isPast?.5:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div className="cn">{day.day}, {day.date}</div>
          {day.sessions.map((s,j)=><div key={j} className="cd" style={{marginTop:4}}>
            <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
              <span>{s.time}: {s.course}</span>
              {courseAddr(s.courseId)&&<MapLink to={courseAddr(s.courseId)} label={s.course}/>}
            </div>
            <div style={{fontSize:11,color:"var(--text-mut)"}}>{s.format}</div>
          </div>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {isToday&&<span className="today-badge">Today</span>}
          <span style={{fontSize:10,color:"var(--text-mut)",fontWeight:600,textTransform:"uppercase",letterSpacing:1.5}}>{day.label}</span>
        </div>
      </div>
    </div>})}
  </div>);
}

function HoleByHoleEditor({players,sessionId,strokeData,getScores,chgScore,match}){
  const [hole,setHole]=useState(()=>{
    // Start at first hole without a score
    const scores=players.map(pid=>getScores(pid)(sessionId));
    for(let i=0;i<18;i++){if(scores.every(s=>!s[i]&&s[i]!==0))return i}
    return 0;
  });
  const td=TEE_DATA[sessionId];
  const par=td?.pars?.[hole]||0;
  const prevHole=()=>{setHole(h=>Math.max(0,h-1));ga('hole_nav',{dir:'prev',hole:hole})};
  const nextHole=()=>{setHole(h=>Math.min(17,h+1));ga('hole_nav',{dir:'next',hole:hole+2})};

  const scoreName=(v,p)=>{
    if(!v||!p)return"";const d=v-p;
    if(d<=-3)return"Albatross";if(d===-2)return"Eagle";if(d===-1)return"Birdie";
    if(d===0)return"Par";if(d===1)return"Bogey";if(d===2)return"Double";if(d===3)return"Triple";return`+${d}`;
  };
  const scoreColor=(v,p)=>{
    if(!v||!p)return"var(--text-mut)";const d=v-p;
    if(d<0)return"var(--forest)";if(d===0)return"var(--navy)";return"var(--red-soft)";
  };

  // Compute hole winner and running match status
  const holeStatus=(()=>{
    if(!match||!td?.pars) return null;
    const matchPlayers=[...match.usaPlayers,...match.euroPlayers];
    const allHaveScore=matchPlayers.every(pid=>{const v=parseInt(getScores(pid)(sessionId)[hole]);return !isNaN(v)&&v>0});
    if(!allHaveScore) return null;

    // Net score per player for this hole
    const netForHole={};
    players.forEach(pid=>{
      const gross=parseInt(getScores(pid)(sessionId)[hole]);
      const strokeOnHole=(strokeData?.[pid]?.strokeHoles?.get(hole)||0);
      netForHole[pid]=gross-strokeOnHole;
    });

    let holeWinner=null; // 'usa','europe',null=halved
    if(match.type==="2v2"){
      const usaBest=Math.min(...match.usaPlayers.map(pid=>netForHole[pid]));
      const euroBest=Math.min(...match.euroPlayers.map(pid=>netForHole[pid]));
      if(usaBest<euroBest) holeWinner="usa";
      else if(euroBest<usaBest) holeWinner="europe";
    } else {
      const usaNet=netForHole[match.usaPlayers[0]];
      const euroNet=netForHole[match.euroPlayers[0]];
      if(usaNet<euroNet) holeWinner="usa";
      else if(euroNet<usaNet) holeWinner="europe";
    }

    // Running match status thru current hole
    let usaUp=0;let lastScoredHole=0;
    for(let h=0;h<=hole;h++){
      const allHave=matchPlayers.every(pid=>{const v=parseInt(getScores(pid)(sessionId)[h]);return !isNaN(v)&&v>0});
      if(!allHave) break;
      lastScoredHole=h+1;
      const hPar=td.pars[h]||0;
      if(!hPar) continue;
      let usaNet,euroNet;
      if(match.type==="2v2"){
        usaNet=Math.min(...match.usaPlayers.map(pid=>{const g=parseInt(getScores(pid)(sessionId)[h]);const sk=(strokeData?.[pid]?.strokeHoles?.get(h)||0);return g-sk}));
        euroNet=Math.min(...match.euroPlayers.map(pid=>{const g=parseInt(getScores(pid)(sessionId)[h]);const sk=(strokeData?.[pid]?.strokeHoles?.get(h)||0);return g-sk}));
      } else {
        usaNet=parseInt(getScores(match.usaPlayers[0])(sessionId)[h])-(strokeData?.[match.usaPlayers[0]]?.strokeHoles?.get(h)||0);
        euroNet=parseInt(getScores(match.euroPlayers[0])(sessionId)[h])-(strokeData?.[match.euroPlayers[0]]?.strokeHoles?.get(h)||0);
      }
      if(usaNet<euroNet) usaUp++;
      else if(euroNet<usaNet) usaUp--;
    }

    const statusText=usaUp===0?`All Square thru ${lastScoredHole}`:usaUp>0?`${TEAMS.usa.name} ${usaUp} UP thru ${lastScoredHole}`:`${TEAMS.europe.name} ${Math.abs(usaUp)} UP thru ${lastScoredHole}`;

    return {holeWinner,usaUp,statusText,netForHole};
  })();

  return(<div className="hbh-wrap">
    {/* Hole navigation header */}
    <div className="hbh-nav">
      <button className="hbh-arrow" onClick={prevHole} disabled={hole===0} aria-label="Previous hole">◀</button>
      <div className="hbh-hole-info">
        <div className="hbh-hole-num">Hole {hole+1}</div>
        {par>0&&<div className="hbh-par">Par {par}{td?.yardages?.[hole]?` · ${td.yardages[hole]} yds`:""}</div>}
      </div>
      <button className="hbh-arrow" onClick={nextHole} disabled={hole===17} aria-label="Next hole">▶</button>
    </div>

    {/* Hole dots – quick jump */}
    <div className="hbh-dots">
      {Array.from({length:18},(_,i)=>{
        const hasScore=players.some(pid=>{const v=getScores(pid)(sessionId)[i];return v!==""&&v!=null});
        return <button key={i} className={`hbh-dot${i===hole?" on":""}${hasScore?" filled":""}`} onClick={()=>setHole(i)}>{i+1}</button>;
      })}
    </div>

    {/* Player score cards */}
    {players.map(pid=>{
      const p=getPlayer(pid);const tm=getTeamForPlayer(pid);
      const sc=getScores(pid)(sessionId);
      const raw=parseInt(sc[hole]);const val=isNaN(raw)?0:raw;
      const holeStrokes=strokeData?.[pid]?.strokeHoles?.get(hole)||0;
      const isStroke=holeStrokes!==0;
      const tot=sc.reduce((s,v)=>s+(parseInt(v)||0),0);
      const thru=sc.filter(v=>v!==""&&v!=null).length;

      // Net score label for this hole
      let netLabel=null;
      if(val>0&&par>0&&isStroke){
        const netVal=val-holeStrokes;
        const netName=scoreName(netVal,par);
        if(netName) netLabel=`net ${netName}`;
      }

      return(<div key={pid} className="hbh-player" style={{borderLeftColor:tm==="usa"?"var(--usa)":"var(--europe)"}}>
        <div className="hbh-player-top">
          <div>
            <div className="hbh-player-name" style={{color:tm==="usa"?"var(--usa)":"var(--europe)"}}>{p?.short}{isStroke&&<span className="hbh-stroke">●</span>}</div>
            <div className="hbh-player-stat">Thru {thru} · {thru?tot:"-"} total{thru&&strokeData?.[pid]?` · ${playedTotals(sc,strokeData[pid].strokeHoles).net} net`:""}</div>
          </div>
          <div style={{textAlign:"right"}}>
            {val>0&&par>0&&<div className="hbh-score-label" style={{color:scoreColor(val,par)}}>{scoreName(val,par)}</div>}
            {netLabel&&<div className="hbh-net-label">({netLabel})</div>}
          </div>
        </div>
        <div className="hbh-stepper">
          <EditButton className="hbh-btn minus" onClick={()=>{const nv=val===0&&par>0?Math.max(1,par-1):Math.max(1,val-1);chgScore(sessionId,pid,hole,String(nv));ga('score_stepper',{dir:'minus',hole:hole+1,player:pid})}} disabled={val<=0&&!(par>1)}>−</EditButton>
          <EditButton className="btn btn2 hbh-clear" disabled={!val} onClick={()=>chgScore(sessionId,pid,hole,'')} aria-label={`Clear ${p?.short} hole ${hole+1}`}>Clear hole</EditButton>
          <div className="hbh-val" style={{color:val?scoreColor(val,par):"var(--text-mut)"}}>{val||"-"}</div>
          <EditButton className="hbh-btn plus" onClick={()=>{const nv=val===0&&par>0?par:Math.min(30,val+1);chgScore(sessionId,pid,hole,String(nv));ga('score_stepper',{dir:'plus',hole:hole+1,player:pid})}}>+</EditButton>
        </div>
      </div>);
    })}

    {/* Hole winner indicator */}
    {holeStatus&&<div className="hbh-hole-status">
      <div className={`hbh-hole-winner ${holeStatus.holeWinner||"halved"}`}>
        {holeStatus.holeWinner==="usa"?`${TEAMS.usa.flag} ${TEAMS.usa.name} wins hole`:holeStatus.holeWinner==="europe"?`${TEAMS.europe.flag} ${TEAMS.europe.name} wins hole`:"Hole halved"}
      </div>
      <div className="hbh-match-status">{holeStatus.statusText}</div>
    </div>}

    {/* Totals summary */}
    <div className="hbh-totals">
      <div className="hbh-totals-title">18-Hole Totals</div>
      {players.map(pid=>{
        const p=getPlayer(pid);const tm=getTeamForPlayer(pid);
        const sc=getScores(pid)(sessionId);
        const tot=sc.reduce((s,v)=>s+(parseInt(v)||0),0);
        const thru=sc.filter(v=>v!==""&&v!=null).length;
        const ps=strokeData?.[pid];
        const playedStrokes=ps?.strokeHoles?sc.reduce((s,v,hi)=>{const val=parseInt(v);return s+((!isNaN(val)&&val>0)?(ps.strokeHoles.get(hi)||0):0)},0):0;
        const net=tot>0?tot-playedStrokes:0;
        return<div key={pid} className="hbh-total-row">
          <span className="hbh-total-name" style={{color:tm==="usa"?"var(--usa)":"var(--europe)"}}>{p?.short}</span>
          <span className="hbh-total-thru">Thru {thru}</span>
          <span className="hbh-total-score">{tot||"-"}</span>
          {ps&&<span className="hbh-total-net">{thru?`${net} net`:`${ps.strokes} strokes for the round`}</span>}
        </div>;
      })}
    </div>
  </div>);
}

function PairingsModal({session,data,setData,toast,onClose}){
  // Collect all matches in this session that are originally TBD
  const matches=session.matches.filter(m=>m.tbd||data.satPairings?.[m.id]);


  // Initialize local state from stored pairings
  const [pairings,setPairings]=useState(()=>{
    const init={};
    matches.forEach(m=>{
      const stored=data.satPairings?.[m.id];
      init[m.id]={
        usaPlayers:stored?.usaPlayers||Array(m.type==="2v2"?2:1).fill(""),
        euroPlayers:stored?.euroPlayers||Array(m.type==="2v2"?2:1).fill(""),
      };
    });
    return init;
  });

  // All assigned player IDs across all matches in this session (for duplicate prevention)
  const fixed=session.matches.filter(m=>!m.tbd);
  const allAssigned={usa:new Set(fixed.flatMap(m=>m.usaPlayers)),europe:new Set(fixed.flatMap(m=>m.euroPlayers))};
  Object.values(pairings).forEach(p=>{
    p.usaPlayers.forEach(id=>{if(id)allAssigned.usa.add(id)});
    p.euroPlayers.forEach(id=>{if(id)allAssigned.europe.add(id)});
  });

  const updateSlot=(matchId,team,idx,pid)=>{
    setPairings(prev=>{
      const next={};
      // Clear pid from any other slot first
      Object.entries(prev).forEach(([mid,mp])=>{
        const u=[...mp.usaPlayers];
        const a=[...mp.euroPlayers];
        if(pid){u.forEach((v,i)=>{if(v===pid&&!(mid===matchId&&team==="usaPlayers"&&i===idx))u[i]=""});a.forEach((v,i)=>{if(v===pid&&!(mid===matchId&&team==="euroPlayers"&&i===idx))a[i]=""});}
        next[mid]={usaPlayers:u,euroPlayers:a};
      });
      const arr=[...(next[matchId]?.[team]||[])];
      arr[idx]=pid;
      next[matchId]={...next[matchId],[team]:arr};
      return next;
    });
  };

  const handleSave=async()=>{
    let nd;setData(prev=>{nd={...prev,satPairings:{...(prev.satPairings||{}),...pairings},lastUpdated:new Date().toISOString()};return nd});
    const ok=await saveData(nd);
    toast(ok?"Pairings queued":"Change not queued: check the message above");ga('sat_pairings_saved',{session:session.id});
    if(ok)onClose();
  };

  const handleClear=async()=>{
    let nd;setData(prev=>{const np={...(prev.satPairings||{})};const results={...prev.matchResults};matches.forEach(m=>{delete np[m.id];delete results[m.id];});nd={...prev,satPairings:np,matchResults:results,lastUpdated:new Date().toISOString()};return nd});
    await saveData(nd);toast("Pairings cleared");
    onClose();
  };

  return(
    <div className="ov" onClick={onClose}><div className="mdl" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
      <div className="mdt">Set Pairings</div>
      <div style={{fontSize:13,color:"var(--text-mut)",marginBottom:16}}>{session.format}: {session.course}</div>

      {matches.map((m,mi)=>{
        const p=pairings[m.id],slotsPerTeam=m.type==="2v2"?2:1;
        return<div key={m.id} style={{marginBottom:16,padding:14,background:"var(--ivory)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:14,color:"var(--text-sec)",marginBottom:10}}>Match {mi+1}: {m.tee}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--usa)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>{TEAMS.usa.name}</div>
              {Array.from({length:slotsPerTeam},(_,si)=>{
                const cur=p.usaPlayers[si]||"";
                // Available: team players not assigned elsewhere (except current slot)
                const available=TEAMS.usa.players.filter(pl=>session.participants.includes(pl.id)&&(!allAssigned.usa.has(pl.id)||pl.id===cur));
                return<EditSelect aria-label={`${TEAMS.usa.name}, match ${mi+1}, player ${si+1}`} key={si} value={cur} onChange={e=>updateSlot(m.id,"usaPlayers",si,e.target.value)}
                  style={{width:"100%",padding:"10px 8px",borderRadius:8,border:"1px solid var(--sand)",fontSize:14,fontFamily:"'DM Sans Variable',sans-serif",background:"var(--white)",color:"var(--text)",marginBottom:4,minHeight:44}}>
                  <option value="">Select player...</option>
                  {available.map(pl=><option key={pl.id} value={pl.id}>{pl.short}</option>)}
                </EditSelect>;
              })}
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--europe)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>{TEAMS.europe.name}</div>
              {Array.from({length:slotsPerTeam},(_,si)=>{
                const cur=p.euroPlayers[si]||"";
                const available=TEAMS.europe.players.filter(pl=>session.participants.includes(pl.id)&&(!allAssigned.europe.has(pl.id)||pl.id===cur));
                return<EditSelect aria-label={`${TEAMS.europe.name}, match ${mi+1}, player ${si+1}`} key={si} value={cur} onChange={e=>updateSlot(m.id,"euroPlayers",si,e.target.value)}
                  style={{width:"100%",padding:"10px 8px",borderRadius:8,border:"1px solid var(--sand)",fontSize:14,fontFamily:"'DM Sans Variable',sans-serif",background:"var(--white)",color:"var(--text)",marginBottom:4,minHeight:44}}>
                  <option value="">Select player...</option>
                  {available.map(pl=><option key={pl.id} value={pl.id}>{pl.short}</option>)}
                </EditSelect>;
              })}
            </div>
          </div>
        </div>;
      })}

      <div className="br">
        {Object.keys(data.satPairings||{}).some(k=>matches.some(m=>m.id===k))&&<EditButton className="btn btnD" onClick={handleClear}>Clear All</EditButton>}
        <button className="btn btn2" onClick={onClose}>Cancel</button>
        <EditButton className="btn btn1" disabled={Object.values(pairings).some(p=>[...p.usaPlayers,...p.euroPlayers].some(id=>!id))} onClick={handleSave}>Save Pairings</EditButton>
      </div>
    </div></div>
  );
}

function MatchesContent({data,setData,toast,ctx}){
  const [expanded,setExpanded]=useState(null); // match id or "group:tee:sessionId"
  const [editMatch,setEditMatch]=useState(null);
  const [editPairingsSession,setEditPairingsSession]=useState(null);
  const toggle=id=>{setExpanded(v=>{const next=v===id?null:id;if(next)ga('scorecard_expand',{match_id:id});return next})};

  const handleSave=async(match,r)=>{let nd;setData(prev=>{nd={...prev,matchResults:{...(prev.matchResults||{}),[match.id]:r},lastUpdated:new Date().toISOString()};return nd});const ok=await saveData(nd);if(ok)toast("Result queued");else toast("Change not queued: check the message above");ga('match_result_saved',{match_id:match.id,outcome:r.outcome,winner:r.winner||'halved'})};
  const handleClear=async(match,sessionId)=>{let nd;setData(prev=>{const nr={...(prev.matchResults||{})};delete nr[match.id];const ps={...(prev.playerScores||{})};if(sessionId&&ps[sessionId]){ps[sessionId]={...ps[sessionId]};[...match.usaPlayers,...match.euroPlayers].forEach(pid=>{if(ps[sessionId][pid])ps[sessionId][pid]=Array(18).fill("")});}nd={...prev,matchResults:nr,playerScores:ps,lastUpdated:new Date().toISOString()};return nd});const ok=await saveData(nd);if(ok)toast("Match cleared");else toast("Change not queued: check the message above")};

  const getScores=pid=>sid=>data.playerScores?.[sid]?.[pid]||Array(18).fill("");
  const chgScore=async(sid,pid,hi,v)=>{let nd;setData(prev=>{const cs={...prev.playerScores};if(!cs[sid])cs[sid]={};if(!cs[sid][pid])cs[sid][pid]=Array(18).fill("");cs[sid][pid]=[...cs[sid][pid]];cs[sid][pid][hi]=v;nd={...prev,playerScores:cs,lastUpdated:new Date().toISOString()};const autoResults=tryAutoCalcResults(sid,nd);if(autoResults)nd={...nd,matchResults:autoResults};return nd});await saveData(nd)};

  // Find the other 1v1 match sharing a tee time (same foursome)
  const getGroupmate=(match,session)=>{
    if(match.type!=="1v1") return null;
    const applied=session.matches.map(m=>applyPairings(m,data));
    return applied.find(m=>m.tee===match.tee&&m.id!==match.id&&m.type==="1v1")||null;
  };

  const renderMatchExpanded=(match,session)=>{
    const sessionId=session.id;
    const matchPlayers=[...match.usaPlayers,...match.euroPlayers];
    const strokeData=getMatchStrokes(match,sessionId,data);
    return(<div style={{borderTop:"1px solid var(--sand)",borderRadius:"0 0 8px 8px"}}>
      <div style={{padding:"12px 12px 0"}}>
        <ScorecardScanner sessionId={sessionId} players={matchPlayers} data={data} setData={setData} toast={toast}/>
      </div>
      <HoleByHoleEditor players={matchPlayers} sessionId={sessionId} strokeData={strokeData} getScores={getScores} chgScore={chgScore} match={match}/>
    </div>);
  };

  const renderGroupExpanded=(match,session)=>{
    const gm=getGroupmate(match,session);
    if(!gm) return renderMatchExpanded(match,session);
    const sessionId=session.id;
    const allPlayers=[...match.usaPlayers,...match.euroPlayers,...gm.usaPlayers,...gm.euroPlayers];
    // Combine stroke data from both matches
    const sd1=getMatchStrokes(match,sessionId,data);
    const sd2=getMatchStrokes(gm,sessionId,data);
    const strokeData={...sd1,...sd2};
    return(<div style={{borderTop:"1px solid var(--sand)",borderRadius:"0 0 8px 8px"}}>
      <div style={{padding:"12px 12px 0"}}>
        <ScorecardScanner sessionId={sessionId} players={allPlayers} data={data} setData={setData} toast={toast}/>
      </div>
      <HoleByHoleEditor players={allPlayers} sessionId={sessionId} strokeData={strokeData} getScores={getScores} chgScore={chgScore} match={match}/>
    </div>);
  };

  return (<div>
    {SCHEDULE.map((day,di)=>{
      const isToday=di===ctx.todayIdx;const isPast=ctx.phase!=="post"&&ctx.todayIdx>=0&&di<ctx.todayIdx;
      return<div key={di} style={{marginBottom:24,opacity:isPast?.55:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)"}}>{day.day}</span>
          <span style={{color:"var(--text-mut)",fontSize:14}}>{day.date}</span>
          {isToday&&<span className="today-badge">Today</span>}
          <span style={{marginLeft:"auto",fontSize:10,color:"var(--forest)",fontWeight:600,textTransform:"uppercase",letterSpacing:1.5}}>{day.label}</span>
        </div>
        {day.sessions.map((s,si)=>{
          const hasTbd=s.matches?.some(m=>m.tbd);
          return<div key={si} style={{marginBottom:14}}>
          <div className="card" style={{marginBottom:0,borderLeftColor:isToday?"var(--forest)":undefined,borderLeftWidth:isToday?3:undefined,borderLeftStyle:isToday?"solid":undefined,paddingBottom:s.matches?.length?10:undefined}}>
            <div style={{marginBottom:s.isCompetitive&&s.matches?.length?10:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:"'JetBrains Mono Variable',monospace",fontSize:12,color:"var(--forest)",flexShrink:0}}>{s.time}</span>
                <span style={{fontSize:14,fontWeight:600,color:"var(--navy)"}}>{s.course}</span>
                {courseAddr(s.courseId)&&<MapLink to={courseAddr(s.courseId)} label={s.course}/>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                <div style={{fontSize:12,color:"var(--text-mut)"}}>{s.format}</div>
                {hasTbd&&<EditButton className="eb" style={{fontSize:11,padding:"6px 12px"}} onClick={()=>{setEditPairingsSession(s);ga('sat_pairings_open',{session:s.id})}}>Set Pairings</EditButton>}
              </div>
            </div>
            {!s.isCompetitive&&s.participants&&<div style={{fontSize:13,color:"var(--text-sec)",marginTop:4}}>Players: {s.participants.map(id=>getPlayer(id)?.short).join(", ")}</div>}
            {s.isCompetitive&&s.matches.map((m_raw,mi)=>{
              const m=applyPairings(m_raw,data);
              const un=m.usaPlayers.map(id=>getPlayer(id)?.short||"TBD").join(" & ");
              const an=m.euroPlayers.map(id=>getPlayer(id)?.short||"TBD").join(" & ");
              const result=data.matchResults[m.id];
              const isExp=expanded===m.id;
              const groupKey=m.type==="1v1"?`group:${m.tee}:${s.id}`:null;
              const isGroupExp=groupKey&&expanded===groupKey;
              const gm=m.type==="1v1"?getGroupmate(m,s):null;
              const hasScores=!m.tbd&&[...m.usaPlayers,...m.euroPlayers].some(pid=>data.playerScores?.[s.id]?.[pid]?.some(v=>v!==""&&v!=null));
              return<div key={mi} style={{borderTop:mi>0||!s.isCompetitive?"1px solid var(--ivory)":"none"}}>
                <div className="match-row-mobile" style={{padding:"10px 4px"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                    <span className="match-tee">{m.tee}</span>
                    <div className="match-teams">
                      <span style={{color:"var(--usa)",fontWeight:600}}>{m.tbd?"TBD":un}</span>
                      <span style={{color:"var(--text-mut)",fontSize:11}}>vs</span>
                      <span style={{color:"var(--europe)",fontWeight:600}}>{m.tbd?"TBD":an}</span>
                    </div>
                    {hasScores&&!result&&<span className="bdg bdg-t" style={{fontSize:10,padding:"2px 7px"}}>Scores In</span>}
                  </div>
                  {result&&<div><Badge result={result} match={m}/></div>}
                  <div className="match-actions">
                    {!m.tbd&&<EditButton className="eb" onClick={e=>{e.stopPropagation();setEditMatch(m);ga('match_result_open',{match_id:m.id})}}>{result?"Edit Result":[...m.usaPlayers,...m.euroPlayers].some(pid=>data.playerScores?.[s.id]?.[pid]?.some(v=>v!==""&&v!=null))?"Match Result":"Enter Result"}</EditButton>}
                    {!m.tbd&&<button className="eb" onClick={e=>{e.stopPropagation();toggle(m.id)}}>{isExp?"Close":!getRuntime().canEdit?"View Scores":hasScores?"📷 Edit Scores":"📷 Add Scores"}</button>}
                    {!m.tbd&&gm&&<button className="eb" style={{fontSize:11}} onClick={e=>{e.stopPropagation();toggle(groupKey)}}>{isGroupExp?"Close":"📷 Group"}</button>}
                    {!m.tbd&&(result||hasScores)&&<EditButton className="eb" style={{color:"var(--red-soft)",fontSize:11}} onClick={e=>{e.stopPropagation();if(confirm("Clear the result and every score for this match? A backup will download first.")){download('before-clear-match.json',data);handleClear(m,s.id)}}}>Clear result & scores</EditButton>}
                  </div>
                </div>
                {isExp&&!m.tbd&&renderMatchExpanded(m,s)}
                {isGroupExp&&!m.tbd&&renderGroupExpanded(m,s)}
              </div>})}
          </div>
        </div>})}
      </div>})}
    {/* Full Scorecard Grid */}
    {(()=>{
      const sessions=SCHEDULE.flatMap(d=>d.sessions).filter(s=>s.isCompetitive);
      const sessionScores=sessions.map(s=>{
        const td=TEE_DATA[s.id];if(!td) return null;
        const playerRows=[];
        const seen=new Set();
        s.matches.forEach(m_raw=>{
          const m=applyPairings(m_raw,data);
          [...m.usaPlayers,...m.euroPlayers].forEach(pid=>{
            if(seen.has(pid)) return; seen.add(pid);
            const sc=data.playerScores?.[s.id]?.[pid];
            if(!sc||sc.every(v=>v===""||v==null)) return;
            const scores=sc.map(v=>{const n=parseInt(v);return isNaN(n)||n<=0?null:n});
            playerRows.push({pid,scores,team:getTeamForPlayer(pid),name:getPlayer(pid)?.short||pid});
          });
        });
        if(!playerRows.length) return null;
        return {session:s,td,playerRows};
      }).filter(Boolean);
      if(!sessionScores.length) return null;
      return <div style={{marginTop:28}}>
        <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:20,fontWeight:700,color:"var(--navy)",marginBottom:14}}>Scorecards</div>
        {sessionScores.map(({session:s,td,playerRows})=><div key={s.id} className="card" style={{padding:0,overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"10px 14px",background:"var(--ivory)",borderBottom:"1px solid var(--sand)"}}>
            <span style={{fontWeight:700,fontSize:14,color:"var(--navy)"}}>{td.courseName}</span>
            <span style={{fontSize:12,color:"var(--text-mut)",marginLeft:8}}>{s.format}</span>
          </div>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"'JetBrains Mono Variable',monospace",minWidth:540}}>
              <thead>
                <tr style={{background:"var(--ivory)"}}>
                  <th style={{padding:"6px 8px",textAlign:"left",fontWeight:600,position:"sticky",left:0,background:"var(--ivory)",zIndex:1,fontFamily:"'DM Sans Variable',sans-serif",fontSize:12,minWidth:60}}>Player</th>
                  {Array.from({length:9},(_,i)=><th key={i} style={{padding:"4px 0",textAlign:"center",fontWeight:600,color:"var(--text-mut)",width:26,fontSize:10}}>{i+1}</th>)}
                  <th style={{padding:"4px 2px",textAlign:"center",fontWeight:700,color:"var(--navy)",fontSize:11,borderLeft:"2px solid var(--sand)"}}>Out</th>
                  {Array.from({length:9},(_,i)=><th key={i+9} style={{padding:"4px 0",textAlign:"center",fontWeight:600,color:"var(--text-mut)",width:26,fontSize:10}}>{i+10}</th>)}
                  <th style={{padding:"4px 2px",textAlign:"center",fontWeight:700,color:"var(--navy)",fontSize:11,borderLeft:"2px solid var(--sand)"}}>In</th>
                  <th style={{padding:"4px 4px",textAlign:"center",fontWeight:700,color:"var(--navy)",fontSize:11,borderLeft:"2px solid var(--sand)"}}>Tot</th>
                </tr>
                <tr style={{background:"var(--ivory)"}}>
                  <td style={{padding:"2px 8px",fontSize:10,color:"var(--text-mut)",fontWeight:600,position:"sticky",left:0,background:"var(--ivory)",zIndex:1,fontFamily:"'DM Sans Variable',sans-serif"}}>Par</td>
                  {td.pars.slice(0,9).map((p,i)=><td key={i} style={{textAlign:"center",fontSize:10,color:"var(--text-mut)"}}>{p}</td>)}
                  <td style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--text-mut)",borderLeft:"2px solid var(--sand)"}}>{td.pars.slice(0,9).reduce((a,b)=>a+b,0)}</td>
                  {td.pars.slice(9).map((p,i)=><td key={i+9} style={{textAlign:"center",fontSize:10,color:"var(--text-mut)"}}>{p}</td>)}
                  <td style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--text-mut)",borderLeft:"2px solid var(--sand)"}}>{td.pars.slice(9).reduce((a,b)=>a+b,0)}</td>
                  <td style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--text-mut)",borderLeft:"2px solid var(--sand)"}}>{td.par}</td>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((pr,pi)=>{
                  const f9=pr.scores.slice(0,9).reduce((s,v)=>s+(v||0),0);
                  const b9=pr.scores.slice(9).reduce((s,v)=>s+(v||0),0);
                  const tot=f9+b9;
                  const hasFull=pr.scores.every(v=>v!=null);
                  return <tr key={pr.pid} style={{borderTop:"1px solid var(--ivory)"}}>
                    <td style={{padding:"6px 8px",fontWeight:600,color:pr.team==="usa"?"var(--usa)":"var(--europe)",whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--white)",zIndex:1,fontFamily:"'DM Sans Variable',sans-serif",fontSize:12}}>{pr.name}</td>
                    {pr.scores.slice(0,9).map((v,i)=>{
                      const p=td.pars[i];const d=v&&p?v-p:null;
                      return <td key={i} style={{textAlign:"center",padding:"4px 0",fontWeight:600,color:d===null?"var(--text-mut)":d<0?"#1A472A":d>0?"#C44D4D":"var(--text)",background:d===null?"":d<0?"#E8F0EB":d>0?"#FDF2F2":"",borderRadius:d!==null&&d!==0?4:0}}>{v||""}</td>;
                    })}
                    <td style={{textAlign:"center",padding:"4px 2px",fontWeight:700,borderLeft:"2px solid var(--sand)"}}>{f9||""}</td>
                    {pr.scores.slice(9).map((v,i)=>{
                      const p=td.pars[i+9];const d=v&&p?v-p:null;
                      return <td key={i+9} style={{textAlign:"center",padding:"4px 0",fontWeight:600,color:d===null?"var(--text-mut)":d<0?"#1A472A":d>0?"#C44D4D":"var(--text)",background:d===null?"":d<0?"#E8F0EB":d>0?"#FDF2F2":"",borderRadius:d!==null&&d!==0?4:0}}>{v||""}</td>;
                    })}
                    <td style={{textAlign:"center",padding:"4px 2px",fontWeight:700,borderLeft:"2px solid var(--sand)"}}>{b9||""}</td>
                    <td style={{textAlign:"center",padding:"4px 4px",fontWeight:700,color:hasFull&&tot<td.par?"#1A472A":hasFull&&tot>td.par?"#C44D4D":"var(--navy)",borderLeft:"2px solid var(--sand)"}}>{tot||""}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>)}
      </div>;
    })()}

    {editMatch&&<ScoreModal match={editMatch} result={data.matchResults[editMatch.id]} onSave={r=>{handleSave(editMatch,r);setEditMatch(null)}} onClose={()=>setEditMatch(null)} onClear={()=>{setData(prev=>removeManualOverride(prev,editMatch.id));setEditMatch(null)}}/>}
    {editPairingsSession&&<PairingsModal session={editPairingsSession} data={data} setData={setData} toast={toast} onClose={()=>setEditPairingsSession(null)}/>}
  </div>);
}

function StandingsContent({data,pts}){
  const ps={};ALL_PLAYERS.forEach(p=>{ps[p.id]={w:0,l:0,h:0,pts:0}});
  SCHEDULE.forEach(d=>d.sessions.forEach(s=>s.matches.forEach(m_raw=>{const m=applyPairings(m_raw,data);const r=(data.matchResults||{})[m.id];if(!r) return;if(r.outcome==="halved"){[...m.usaPlayers,...m.euroPlayers].forEach(pid=>{if(ps[pid]){ps[pid].h++;ps[pid].pts+=.5}})}else{(r.winner==="usa"?m.usaPlayers:m.euroPlayers).forEach(pid=>{if(ps[pid]){ps[pid].w++;ps[pid].pts+=1}});(r.winner==="usa"?m.euroPlayers:m.usaPlayers).forEach(pid=>{if(ps[pid])ps[pid].l++})}})));
  const sorted=ALL_PLAYERS.map(p=>({...p,...ps[p.id],team:getTeamForPlayer(p.id)})).sort((a,b)=>b.pts-a.pts||b.w-a.w);
  return (<div>
    <div className="sb" style={{marginBottom:24}}><div className="tb u"><div className="tf">🌲</div><div className="tn u">{TEAMS.usa.name}</div></div><div className="sctr"><div className="scb"><span className="u">{pts.usa}</span><span className="d">–</span><span className="a">{pts.europe}</span></div><div className="scl">Total Points</div></div><div className="tb a"><div className="tf">🌾</div><div className="tn a">{TEAMS.europe.name}</div></div></div>
    <div className="card" style={{padding:0,overflow:"hidden"}}><div className="lbr lh"><span>#</span><span>Player</span><span style={{textAlign:"center"}}>W</span><span style={{textAlign:"center"}}>L</span><span style={{textAlign:"center"}}>H</span><span style={{textAlign:"center"}}>PTS</span></div>
    {sorted.map((p,i)=><div key={p.id} className="lbr"><span className={`lrk ${i===0?"g":""}`}>{i+1}</span><span className="lnm"><span style={{color:p.team==="usa"?"var(--usa)":"var(--europe)"}}>{p.short}</span> <span style={{fontSize:10,color:"var(--text-mut)"}}>{p.team==="usa"?"🌲":"🌾"}</span></span><span className="lst" style={{color:"var(--forest)"}}>{p.w}</span><span className="lst" style={{color:"var(--red-soft)"}}>{p.l}</span><span className="lst" style={{color:"var(--gold)"}}>{p.h}</span><span className="lst lpt">{p.pts}</span></div>)}</div>
  </div>);
}

function RostersTab({data,setData}){
  const hasAnyHC=true;
  const sessions=Object.keys(TEE_DATA);
  const [hcView,setHcView]=useState("summary");
  const playersWithHC=ALL_PLAYERS;
  return(<div><div className="st">Rosters</div><div className="ss">Teams, captains & handicaps</div><div className="rg">{["usa","europe"].map(tk=><div key={tk} className="rc"><div className={`rh ${tk[0]}`}><span style={{fontSize:22}}>{TEAMS[tk].flag}</span><span className="rn">{TEAMS[tk].name}</span></div>{TEAMS[tk].players.map(p=><div key={p.id} className="rr"><div className={`av ${tk[0]}`}>{p.name.split(" ").map(n=>n[0]).join("")}</div><div style={{flex:1,minWidth:0}}><div className="pn" style={{overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>{p.role&&<div className="pr">{p.role}</div>}</div><div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontSize:14,fontWeight:600,color:"var(--forest)",flexShrink:0,minWidth:40,textAlign:"right"}}>{getPlayerIndex(data,p.id)}</div></div>)}</div>)}</div>
    <div className="card" style={{marginTop:14,borderLeft:"3px solid var(--gold)"}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:16,fontWeight:700,color:"var(--navy)",marginBottom:8}}>Rules</div>
      {[
        ["🌙","Night Balls","Players may use night balls (glow balls) if needed to finish a hole, but the match must be completed."],
        ["⛈️","Inclement Weather","If inclement weather prevents a round from being finished, the current score at the time of cancellation is the final score for that round."],
      ].map(([icon,title,detail],i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderTop:i>0?"1px solid var(--ivory)":"none"}}>
        <div style={{fontSize:18,flexShrink:0,lineHeight:1.4}}>{icon}</div>
        <div><div style={{fontWeight:700,fontSize:13,color:"var(--text)",marginBottom:1}}>{title}</div><div style={{fontSize:13,color:"var(--text-sec)",lineHeight:1.5}}>{detail}</div></div>
      </div>)}
    </div>
    {hasAnyHC&&<div style={{marginTop:18}}>
      <div className="cl" style={{marginBottom:6}}>Course Handicaps</div>
      <div className="ivd" style={{marginBottom:12}}>Course handicap from your entered index: Index × (Slope/113) + (Rating − Par)</div>
      <div className="dt" style={{marginBottom:14}}>{[["summary","Summary"],["edit","Edit Tee Selections"]].map(([id,l])=><button key={id} className={`dtb ${hcView===id?"on":""}`} onClick={()=>{setHcView(id);ga('hc_view',{view:id})}}>{l}</button>)}</div>

      {hcView==="summary"&&<div className="card" style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"'DM Sans Variable',sans-serif"}}>
            <thead><tr style={{background:"var(--ivory)"}}>
              <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-mut)",fontWeight:600,position:"sticky",left:0,background:"var(--ivory)",zIndex:1}}>Player</th>
              <th style={{padding:"10px 8px",textAlign:"center",fontSize:11,textTransform:"uppercase",letterSpacing:1,color:"var(--text-mut)",fontWeight:600,minWidth:40}}>Index</th>
              {sessions.map(sid=><th key={sid} style={{padding:"10px 8px",textAlign:"center",fontSize:11,textTransform:"uppercase",letterSpacing:1,color:"var(--text-mut)",fontWeight:600,minWidth:50}}>{TEE_DATA[sid].courseName}</th>)}
            </tr></thead>
            <tbody>{playersWithHC.map(p=>{const idx=parseFloat(getPlayerIndex(data,p.id))||0;const tm=getTeamForPlayer(p.id);return<tr key={p.id} style={{borderTop:"1px solid var(--ivory)"}}>
              <td style={{padding:"8px 12px",fontWeight:600,color:tm==="usa"?"var(--usa)":"var(--europe)",whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--white)",zIndex:1}}>{p.short}</td>
              <td style={{padding:"8px",textAlign:"center",fontFamily:"'JetBrains Mono Variable',monospace",color:"var(--text-mut)"}}>{idx}</td>
              {sessions.map(sid=>{const ch=COMPETITIVE.find(s=>s.id===sid).participants.includes(p.id)?getCourseHC(idx,sid,data.teeSelections,p.id):"Not playing";return<td key={sid} style={{padding:"8px",textAlign:"center",fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,color:"var(--forest)"}}>{ch}</td>})}
            </tr>})}</tbody>
          </table>
        </div>
      </div>}

      {hcView==="edit"&&playersWithHC.map(p=>{const idx=parseFloat(getPlayerIndex(data,p.id))||0;const tm=getTeamForPlayer(p.id);return<div key={p.id} className="card" style={{marginBottom:10,padding:0,overflow:"hidden"}}>
        <div style={{padding:"8px 12px",background:tm==="usa"?"rgba(0,39,76,0.07)":"rgba(196,30,58,0.07)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:700,fontSize:14,color:tm==="usa"?"var(--usa)":"var(--europe)"}}>{p.short}</span>
          <span style={{fontSize:11,fontFamily:"'JetBrains Mono Variable',monospace",color:"var(--text-mut)"}}>Index: {idx}</span>
        </div>
        {sessions.filter(sid=>COMPETITIVE.find(s=>s.id===sid).participants.includes(p.id)).map(sid=>{const td=TEE_DATA[sid];const sessionSel=data.teeSelections?.[sid];const curTee=(typeof sessionSel==='object'?sessionSel?.[p.id]:sessionSel)??td.defaultTee;const ch=getCourseHC(idx,sid,data.teeSelections,p.id);return<div key={sid} style={{padding:"8px 12px",borderTop:"1px solid var(--ivory)",display:"flex",alignItems:"center",gap:8,fontSize:13,flexWrap:"wrap"}}>
          <span style={{fontWeight:600,color:"var(--navy)",fontSize:12,flexShrink:0}}>{td.courseName}</span>
          <EditSelect value={curTee} onChange={async e=>{const val=parseInt(e.target.value);let nd;setData(prv=>{nd=setPlayerTee(config,prv,sid,p.id,val);return nd});await saveData(nd)}} style={{flex:"1 1 auto",fontSize:13,padding:"8px 6px",border:"1px solid var(--sand)",borderRadius:6,background:"white",fontFamily:"'JetBrains Mono Variable',monospace",color:"var(--text)",minHeight:40,minWidth:0}}>
            {td.tees.map((t,i)=><option key={i} value={i}>{t.tee} · {t.yds}yds</option>)}
          </EditSelect>
          <span style={{fontWeight:700,fontFamily:"'JetBrains Mono Variable',monospace",fontSize:14,color:"var(--forest)",flexShrink:0}}>{ch}</span>
        </div>})}
      </div>})}
    </div>}
  </div>);
}

function WeatherTab({weather}){
  const [view,setView]=useState("sessions");
  const loading=!weather;
  const stale=!weather?.fictional&&weather?.lastRefresh&&(Date.now()-new Date(weather.lastRefresh).getTime())>120*60*1000;
  return(<div>
    <div className="st">Weather</div><div className="ss">{weather?.fictional?"Invented forecast for the demo":"Configured forecast for tournament week"}</div>
    {stale&&<div style={{fontSize:12,color:"var(--red-soft)",marginBottom:8}}>Forecast data may be outdated: last updated {new Date(weather.lastRefresh).toLocaleString()}</div>}
    <div className="dt" style={{marginBottom:20}}>{[["sessions","By Session"],["daily","Daily"],["discussion","Forecaster's Take"]].map(([id,l])=><button key={id} className={`dtb ${view===id?"on":""}`} onClick={()=>{setView(id);ga('weather_tab',{tab:id})}}>{l}</button>)}</div>
    {loading&&<div className="card" style={{textAlign:"center",padding:32,color:"var(--text-mut)"}}>
      <div className="spin-sm" style={{margin:"0 auto 12px"}}/>Loading forecast data…
    </div>}
    {!loading&&view==="sessions"&&<SessionsForecast weather={weather}/>}
    {!loading&&view==="daily"&&<DailyForecast weather={weather}/>}
    {!loading&&view==="discussion"&&<ForecastDiscussion weather={weather}/>}
  </div>);
}

function SessionsForecast({weather}){
  const now=new Date(weather?.fictional?config.event.demoNow:Date.now());
  return(<div>{WEATHER_SESSIONS.map(sess=>{
    const wx=getSessionWeather(weather?.hourly?.data,sess);
    const sessDate=new Date(sess.date+"T12:00:00");
    const isPast=now>new Date(sess.end);
    return(<div key={sess.id} className="card" style={{marginBottom:14,opacity:isPast?.5:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:18,fontWeight:700,color:"var(--navy)"}}>{sess.label}</div>
          <div style={{fontSize:12,color:"var(--text-mut)"}}>{sess.course} · {sessDate.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
        </div>
        {wx&&<div style={{fontSize:32,lineHeight:1}}>{wxEmoji(wx.conditions)}</div>}
      </div>
      {wx?<>
        <div className="ig" style={{marginBottom:10}}>
          <div className="ii"><div className="il">Temp</div><div className="iv">{wx.tempRange[0]}°–{wx.tempRange[1]}°F</div></div>
          <div className="ii"><div className="il">Wind</div><div className="iv">{wx.avgWind}–{wx.maxWind} mph {wx.windDir}</div></div>
          <div className="ii"><div className="il">Rain</div><div className="iv" style={{color:wx.maxPrecipChance>40?"var(--red-soft)":"inherit"}}>{wx.maxPrecipChance}%</div></div>
          <div className="ii"><div className="il">Conditions</div><div className="iv">{wx.conditions}</div></div>
        </div>
        <div className="wx-hourly">{wx.periods.map((p,i)=>{
          const d=new Date(p.startTime);const hr=civilParts(d).hour;const ampm=hr>=12?"p":"a";const h12=hr%12||12;
          const precip=p.probabilityOfPrecipitation?.value||0;
          return(<div key={i} className="wx-hr">
            <div className="wh">{h12}{ampm}</div>
            <div style={{fontSize:14,margin:"2px 0"}}>{wxEmoji(p.shortForecast)}</div>
            <div className="wt">{p.temperature}°</div>
            <div className="ww">{parseInt(p.windSpeed)||0}mph</div>
            {precip>0&&<div className="wr">{precip}%</div>}
          </div>);
        })}</div>
      </>:<div style={{fontSize:13,color:"var(--text-mut)",fontStyle:"italic"}}>Hourly forecast not yet available for this session</div>}
    </div>);
  })}</div>);
}

function DailyForecast({weather}){
  const periods=weather?.forecast?.data?.properties?.periods;
  if(!periods)return<div className="card" style={{color:"var(--text-mut)",textAlign:"center",padding:24}}>Daily forecast not yet available</div>;
  const tourneyDates=SCHEDULE.map(d=>d.isoDate);
  const filtered=periods.filter(p=>{
    const ds=civilParts(new Date(p.startTime)).date;
    return tourneyDates.includes(ds);
  });
  if(!filtered.length)return<div className="card" style={{color:"var(--text-mut)",textAlign:"center",padding:24}}>No forecast periods available for tournament dates yet</div>;
  return(<div>{filtered.map((p,i)=>{
    const precip=p.probabilityOfPrecipitation?.value;
    return(<div key={i} className="card" style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:17,fontWeight:700,color:"var(--navy)",marginBottom:4}}>{p.name}</div>
          <div style={{fontSize:14,color:"var(--text-sec)",lineHeight:1.5,marginBottom:6}}>{p.detailedForecast}</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"var(--text-mut)"}}>
            <span>💨 {p.windSpeed} {p.windDirection}</span>
            {precip!=null&&precip>0&&<span style={{color:"var(--red-soft)"}}>🌧 {precip}%</span>}
          </div>
        </div>
        <div style={{textAlign:"center",flexShrink:0,minWidth:56}}>
          <div style={{fontSize:28,marginBottom:2}}>{wxEmoji(p.shortForecast)}</div>
          <div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,fontSize:18,color:p.isDaytime?"var(--navy)":"var(--text-sec)"}}>{p.temperature}°</div>
        </div>
      </div>
    </div>);
  })}</div>);
}

function ForecastDiscussion({weather}){
  const [showRaw,setShowRaw]=useState(false);
  const afd=weather?.afd;
  if(!afd)return<div className="card" style={{color:"var(--text-mut)",textAlign:"center",padding:24}}>Forecast discussion not yet available</div>;
  const issued=afd.issuedAt?new Date(afd.issuedAt).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}):"Unknown";
  return(<div>
    {hasContent(afd.summary)&&<div className="card" style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:18,fontWeight:700,color:"var(--navy)"}}>Forecaster's Take</div>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:"var(--gold-dk)",background:"var(--ivory)",padding:"3px 8px",borderRadius:4}}>{afd.summaryLabel??"Summary"}</span>
      </div>
      <div style={{fontSize:11,color:"var(--text-mut)",marginBottom:12}}>{afd.source??"Configured forecast"} · {issued}</div>
      <div className="wx-disc">{afd.summary}</div>
    </div>}
    {hasContent(afd.raw)&&<>
      <button className="btn btn2" style={{width:"100%",marginBottom:8}} onClick={()=>{setShowRaw(!showRaw);ga('weather_raw_toggle',{show:!showRaw})}}>{showRaw?"Hide":"Show"} Raw NWS Discussion</button>
      {showRaw&&<div className="card"><div className="wx-raw">{afd.raw}</div></div>}
    </>}
  </div>);
}

function CompetitionTab({data,setData,toast,ctx,pts}){
  const defaultView=ctx.phase==="pre"?"matches":ctx.phase==="during"?"matches":"standings";
  const [view,setView]=useState(defaultView);
  return(<div>
    <div className="st">Competition</div><div className="ss">Matches, standings, scores & schedule</div>
    <div className="dt" style={{marginBottom:20}}>{[["matches","Matches"],["standings","Standings"]].map(([id,l])=><button key={id} className={`dtb ${view===id?"on":""}`} onClick={()=>{setView(id);ga('competition_tab',{tab:id})}}>{l}</button>)}</div>
    {view==="matches"&&<MatchesContent data={data} setData={setData} toast={toast} ctx={ctx}/>}
    {view==="standings"&&<StandingsContent data={data} pts={pts}/>}
  </div>);
}

function ExploreTab(){
  const [view,setView]=useState("activities");
  const renderCard=(item,isRestaurant)=>(
    <div key={item.name} className="ex-card">
      <img className="ex-img" src={item.img} alt={item.name} onError={e=>{e.target.style.display="none"}}/>
      <div className="ex-body">
        <div className="ex-row"><div className="ex-name">{item.name}</div><MapLink to={item.directionsUrl} label={item.name}/></div>
        <div className="ex-meta">
          <span className="ex-tag cat">{isRestaurant?item.cuisine:item.cat}</span>
          <span className="ex-tag price">{item.price}</span>
          <span className="ex-tag drive">{item.drive}</span>
          {isRestaurant&&item.goodFor&&<span className="ex-tag good">{item.goodFor}</span>}
        </div>
        <div className="ex-desc">{item.desc}</div>
        {isRestaurant&&item.priceNote&&<div style={{fontSize:13,color:"var(--gold-dk)",fontWeight:600,marginBottom:6}}>{item.priceNote}</div>}
        <div className="ex-hours">🕐 {item.hours}</div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}><div style={{fontSize:12,color:"var(--text-mut)"}}>{item.addr}</div><CopyBtn text={item.addr}/></div>
      </div>
    </div>
  );
  return(<div>
    <div className="st">Explore</div><div className="ss">{config.demo.fictional?'Ideas for time away from the course, all invented':'Ideas for time away from the course'}</div>
    <div className="dt" style={{marginBottom:16}}>{[["activities","Activities"],["restaurants","Restaurants"],["delivery","Delivery"]].map(([id,l])=><button key={id} className={`dtb ${view===id?"on":""}`} onClick={()=>{setView(id);ga('explore_tab',{tab:id})}}>{l}</button>)}</div>
    <ExploreMap items={view==="activities"?EXPLORE_ACTIVITIES:view==="restaurants"?EXPLORE_RESTAURANTS:EXPLORE_DELIVERY}/>
    {view==="activities"&&<div>
      <div className="card" style={{borderLeft:"3px solid var(--forest)",marginBottom:16,padding:16}}>
        <div style={{fontSize:14,color:"var(--text-sec)",lineHeight:1.5}}>Use this space to compare activities for an open afternoon. Distances and venues in the demo are fictional.</div>
      </div>
      {EXPLORE_ACTIVITIES.map(a=>renderCard(a,false))}
    </div>}
    {view==="restaurants"&&<div>
      <div className="card" style={{borderLeft:"3px solid var(--gold)",marginBottom:16,padding:16}}>
        <div style={{fontSize:14,color:"var(--text-sec)",lineHeight:1.5}}>Choose a place that can accommodate your group, then confirm current hours and reservations yourself.</div>
      </div>
      {EXPLORE_RESTAURANTS.map(r=>renderCard(r,true))}
    </div>}
    {view==="delivery"&&<div>
      <div className="card" style={{borderLeft:"3px solid var(--gold)",marginBottom:16,padding:16}}>
        <div style={{fontSize:14,color:"var(--text-sec)",lineHeight:1.5}}>Compare delivery options and dietary needs for your own group.</div>
      </div>
      {EXPLORE_DELIVERY.map((r,i)=><div key={i} className="ex-card" style={{padding:0}}>
        <div className="ex-body">
          <div className="ex-row"><div className="ex-name"><a href={r.url} target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"none"}}>{r.name}</a></div><MapLink to={r.directionsUrl} label={r.name}/></div>
          <div className="ex-meta">
            <span className="ex-tag cat">{r.cuisine}</span>
            <span className="ex-tag price">{r.price}</span>
            <span className="ex-tag drive">{r.drive}</span>
          </div>
          <div className="ex-desc">{r.desc}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",fontSize:13,marginBottom:6}}>
            <span style={{color:"var(--gold-dk)",fontWeight:600}}>⭐ {r.rating}</span>
            <span style={{color:"var(--text-sec)"}}>Catering: {r.catering}</span>
            {r.phone&&<a href={`tel:${r.phone}`} style={{color:"var(--forest)",fontWeight:600,textDecoration:"none",minHeight:44,display:"inline-flex",alignItems:"center"}}>{r.phone}</a>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <a href={r.menuUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:"var(--forest)",fontWeight:600,textDecoration:"none"}}>View Menu ↗</a>
          </div>
          <div className="ex-hours">🕐 {r.hours}</div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}><div style={{fontSize:12,color:"var(--text-mut)"}}>{r.addr}</div><CopyBtn text={r.addr}/></div>
        </div>
      </div>)}
    </div>}
  </div>);
}

// ─── Accommodations Tab ──────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = ["House","Food","Golf","Betting","Activities"];

function FinancesTab({data,setData,toast}){
  const [view,setView]=useState("summary");
  const expenses=data.expenses||[];
  const allIds=ALL_PLAYERS.map(p=>p.id);

  const balances=Object.fromEntries(Object.entries(computeBalances(expenses,allIds)).map(([id,cents])=>[id,cents/100]));

  // Category totals
  const catTotals={};
  expenses.forEach(exp=>{catTotals[exp.category]=(catTotals[exp.category]||0)+exp.amount});
  const totalSpent=expenses.reduce((s,e)=>s+e.amount,0);

  return(<div>
    <div className="st">Finances</div><div className="ss">Shared expenses & settlement</div>
    <div className="dt" style={{marginBottom:20}}>{[["summary","Summary"],["expenses","Expenses"],["settle","Settle Up"]].map(([id,l])=><button key={id} className={`dtb ${view===id?"on":""}`} onClick={()=>{setView(id);ga('finances_tab',{tab:id})}}>{l}</button>)}</div>

    {view==="summary"&&<div>
      <div className="card" style={{borderLeft:"3px solid var(--forest)",marginBottom:16}}>
        <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:22,fontWeight:700,color:"var(--navy)",marginBottom:4}}>💵 ${totalSpent.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <div style={{fontSize:13,color:"var(--text-mut)"}}>Total across {expenses.length} expense{expenses.length!==1?"s":""}</div>
      </div>

      {totalSpent>0&&<div className="card" style={{marginBottom:16}}>
        <div className="cl" style={{marginBottom:10}}>By Category</div>
        {EXPENSE_CATEGORIES.filter(c=>catTotals[c]>0).map(cat=>{const amt=catTotals[cat]||0;const pct=totalSpent>0?(amt/totalSpent*100):0;return<div key={cat} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:3}}>
            <span style={{fontWeight:600}}>{cat}</span>
            <span style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:600,color:"var(--forest)"}}>${amt.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </div>
          <div style={{height:6,borderRadius:3,background:"var(--ivory)",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:"var(--forest)",width:`${pct}%`,transition:"width .3s"}}/></div>
        </div>})}
      </div>}

      <div className="cl" style={{marginBottom:8}}>Player Balances</div>
      {allIds.map(id=>{const p=getPlayer(id);const tm=getTeamForPlayer(id);const bal=Math.round((balances[id]||0)*100)/100;if(bal===0)return null;return<div key={id} className="card" style={{padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:14}}>{tm==="usa"?"🌲":"🌾"}</span>
        <span style={{flex:1,fontWeight:600,fontSize:14,color:tm==="usa"?"var(--usa)":"var(--europe)"}}>{p?.short}</span>
        <span className="fin-bal" style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,fontSize:15,color:bal>0?"var(--forest)":"var(--red-soft)"}}>{bal>0?"+":""}${Math.abs(bal).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      </div>}).filter(Boolean)}
      {allIds.every(id=>(Math.round((balances[id]||0)*100)/100)===0)&&<div className="card" style={{textAlign:"center",padding:20,color:"var(--text-mut)"}}>All settled up!</div>}
    </div>}

    {view==="expenses"&&<ExpensesView data={data} setData={setData} toast={toast} expenses={expenses}/>}

    {view==="settle"&&<SettleView data={data} setData={setData} toast={toast} expenses={expenses}/>}
  </div>);
}

function ExpensesView({data,setData,toast,expenses}){
  const [showForm,setShowForm]=useState(false);
  const [desc,setDesc]=useState("");
  const [amount,setAmount]=useState("");
  const [category,setCategory]=useState("House");
  const [paidBy,setPaidBy]=useState(ALL_PLAYERS[0].id);
  const [splitAmong,setSplitAmong]=useState(()=>ALL_PLAYERS.map(p=>p.id));
  const [date,setDate]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`});

  const sorted=[...expenses].sort((a,b)=>b.date.localeCompare(a.date));

  const handleAdd=async()=>{
    const amt=parseFloat(amount);
    if(!desc.trim()||isNaN(amt)||amt<=0||!splitAmong.length){toast("Fill in all fields");return}
    const exp={id:`exp-${crypto.randomUUID()}`,desc:desc.trim(),amount:amt,category,paidBy,splitAmong:[...splitAmong],date};
    let nd;setData(prev=>{nd={...prev,expenses:[...(prev.expenses||[]),exp],lastUpdated:new Date().toISOString()};return nd});if(!await saveData(nd))return;
    toast("Expense queued");setShowForm(false);setDesc("");setAmount("");setCategory("House");setPaidBy(ALL_PLAYERS[0].id);setSplitAmong(ALL_PLAYERS.map(p=>p.id));
    ga('expense_add',{category,amount:amt});
  };

  const handleDelete=async(id)=>{
    if(!confirm("Delete this expense?"))return;
    let nd;setData(prev=>{nd={...prev,expenses:(prev.expenses||[]).filter(e=>e.id!==id),lastUpdated:new Date().toISOString()};return nd});await saveData(nd);
    toast("Expense deleted");ga('expense_delete',{id});
  };

  const togglePlayer=(pid)=>{
    setSplitAmong(prev=>prev.includes(pid)?prev.filter(id=>id!==pid):[...prev,pid]);
  };

  return(<div>
    <EditButton className="btn btn1" style={{width:"100%",marginBottom:16}} onClick={()=>setShowForm(!showForm)}>{showForm?"Cancel":"+ Add Expense"}</EditButton>

    {showForm&&<div className="card fin-form" style={{marginBottom:16,display:"flex",flexDirection:"column",gap:12}}>
      <div>
        <div className="cl" style={{marginBottom:4}}>Description</div>
        <EditInput className="ain" style={{width:"100%"}} placeholder="e.g. Groceries, Uber, Dinner..." value={desc} onChange={e=>setDesc(e.target.value)}/>
      </div>
      <div>
        <div className="cl" style={{marginBottom:4}}>Amount ($)</div>
        <EditInput className="ain" style={{width:"100%",fontFamily:"'JetBrains Mono Variable',monospace"}} type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
      </div>
      <div>
        <div className="cl" style={{marginBottom:4}}>Category</div>
        <EditSelect value={category} onChange={e=>setCategory(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--sand)",fontSize:14,fontFamily:"'DM Sans Variable',sans-serif",background:"var(--white)",color:"var(--text)",minHeight:44}}>
          {EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </EditSelect>
      </div>
      <div>
        <div className="cl" style={{marginBottom:4}}>Paid By</div>
        <EditSelect value={paidBy} onChange={e=>setPaidBy(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--sand)",fontSize:14,fontFamily:"'DM Sans Variable',sans-serif",background:"var(--white)",color:"var(--text)",minHeight:44}}>
          {ALL_PLAYERS.map(p=><option key={p.id} value={p.id}>{p.short} ({getTeamForPlayer(p.id)==="usa"?"🌲":"🌾"})</option>)}
        </EditSelect>
      </div>
      <div>
        <div className="cl" style={{marginBottom:4}}>Split Among ({splitAmong.length} of {ALL_PLAYERS.length})</div>
        <div className="fin-check">{ALL_PLAYERS.map(p=>{const checked=splitAmong.includes(p.id);return<label key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:6,border:`1.5px solid ${checked?"var(--forest)":"var(--sand)"}`,background:checked?"var(--forest-pale)":"var(--white)",cursor:"pointer",fontSize:13,fontWeight:checked?600:400,minHeight:44,transition:"all .15s"}}>
          <EditInput type="checkbox" checked={checked} onChange={()=>togglePlayer(p.id)} style={{display:"none"}}/>
          <span>{p.short}</span>
        </label>})}</div>
      </div>
      <div>
        <div className="cl" style={{marginBottom:4}}>Date</div>
        <EditInput className="ain" style={{width:"100%"}} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>
      <EditButton className="btn btn1" onClick={handleAdd} disabled={!desc.trim()||!amount||!splitAmong.length}>Save Expense</EditButton>
    </div>}

    {sorted.map(exp=>{const payer=getPlayer(exp.paidBy);const tm=getTeamForPlayer(exp.paidBy);const splitLabel=exp.splitAmong.length===ALL_PLAYERS.length?`${exp.splitAmong.length}-way`:`${exp.splitAmong.length} of ${ALL_PLAYERS.length}`;const perPerson=exp.amount/exp.splitAmong.length;
      return<div key={exp.id} className="card" style={{marginBottom:8,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)",marginBottom:3}}>{exp.desc}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
              <span className="bdg bdg-t" style={{fontSize:11}}>{exp.category}</span>
              <span style={{fontSize:12,color:"var(--text-mut)"}}>{splitLabel} · ${perPerson.toFixed(2)}/person</span>
            </div>
            <div style={{fontSize:13,color:"var(--text-sec)"}}>Paid by <span style={{fontWeight:600,color:tm==="usa"?"var(--usa)":"var(--europe)"}}>{tm==="usa"?"🌲":"🌾"} {payer?.short}</span> · {exp.date}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,fontSize:17,color:"var(--forest)"}}>${exp.amount.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            <EditButton onClick={()=>handleDelete(exp.id)} style={{fontSize:11,color:"var(--red-soft)",background:"none",border:"none",cursor:"pointer",padding:"4px",marginTop:4}}>Delete</EditButton>
          </div>
        </div>
      </div>})}

    {!sorted.length&&<div className="card" style={{textAlign:"center",padding:24,color:"var(--text-mut)"}}>No expenses yet. Add one above.</div>}
  </div>);
}

function SettleView({data,setData,toast,expenses}){
  const allIds=ALL_PLAYERS.map(p=>p.id);
  const transfers=computeSettlements(expenses,allIds);
  const handles=data.paymentHandles||{};

  const saveHandle=async(pid,val)=>{
    let nd;setData(prev=>{nd={...prev,paymentHandles:{...(prev.paymentHandles||{}),[pid]:val},lastUpdated:new Date().toISOString()};return nd});await saveData(nd);
  };

  const renderHandle=(handle)=>{
    if(!handle)return<span style={{fontSize:12,color:"var(--text-mut)",fontStyle:"italic"}}>No handle</span>;
    if(handle.startsWith("@"))return<a href={`venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle.slice(1))}`} style={{fontSize:13,color:"var(--forest)",fontWeight:600,textDecoration:"none"}}>{handle}</a>;
    return<span style={{fontSize:13,color:"var(--text-sec)"}}>{handle}</span>;
  };

  return(<div>
    <div className="card" style={{borderLeft:"3px solid var(--forest)",marginBottom:16}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:18,fontWeight:700,color:"var(--navy)",marginBottom:8}}>Settlement Transfers</div>
      <div style={{fontSize:13,color:"var(--text-mut)",marginBottom:4}}>Suggested transfers to settle the recorded balances</div>
    </div>

    {transfers.length===0&&<div className="card" style={{textAlign:"center",padding:24,color:"var(--text-mut)"}}>Everyone is settled up! No transfers needed.</div>}

    {transfers.map((t,i)=>{const from=getPlayer(t.from);const to=getPlayer(t.to);const fromTm=getTeamForPlayer(t.from);const toTm=getTeamForPlayer(t.to);return<div key={i} className="card fin-settle" style={{marginBottom:8,padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <div style={{flex:1}}>
          <span style={{fontWeight:700,color:fromTm==="usa"?"var(--usa)":"var(--europe)"}}>{fromTm==="usa"?"🌲":"🌾"} {from?.short}</span>
          <span style={{color:"var(--text-mut)",margin:"0 8px"}}>→</span>
          <span style={{fontWeight:700,color:toTm==="usa"?"var(--usa)":"var(--europe)"}}>{toTm==="usa"?"🌲":"🌾"} {to?.short}</span>
        </div>
        <span style={{fontFamily:"'JetBrains Mono Variable',monospace",fontWeight:700,fontSize:17,color:"var(--forest)"}}>${t.amount.toFixed(2)}</span>
      </div>
      <div style={{display:"flex",gap:12,fontSize:12,color:"var(--text-mut)"}}>
        <span>{from?.short}: {renderHandle(handles[t.from])}</span>
        <span>{to?.short}: {renderHandle(handles[t.to])}</span>
      </div>
    </div>})}

    <div className="card" style={{marginTop:20,borderLeft:"3px solid var(--gold)"}}>
      <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:17,fontWeight:700,color:"var(--navy)",marginBottom:12}}>Payment Handles</div>
      <div style={{fontSize:13,color:"var(--text-mut)",marginBottom:12}}>Venmo handles (start with @) will link directly to the app</div>
      {ALL_PLAYERS.map(p=>{const tm=getTeamForPlayer(p.id);return<div key={p.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:600,color:tm==="usa"?"var(--usa)":"var(--europe)",minWidth:80}}>{tm==="usa"?"🌲":"🌾"} {p.short}</span>
        <EditInput className="ain" style={{flex:1,fontSize:13}} placeholder="@venmo or Zelle email" value={handles[p.id]||""} onChange={e=>saveHandle(p.id,e.target.value)}/>
      </div>})}
    </div>
  </div>);
}

// ─── Main App ────────────────────────────────────────────────────────────────


function PlaybookTab({ctx,data}){
  const [view,setView]=useState("holes");const [course,setCourse]=useState(ctx.courseKey);const [hole,setHole]=useState(0);
  const [showMap,setShowMap]=useState(false);const [teeCourse,setTeeCourse]=useState(COMPETITIVE[0].id);
  const [holeModal,setHoleModal]=useState(false);
  const stripRef=useRef(null);
  useEffect(()=>{if(stripRef.current){const el=stripRef.current.children[hole];if(el)el.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})}},[hole]);
  const cd=COURSE_DATA[course];const h=cd.holes[hole];
  return(<div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><div className="st" style={{marginBottom:0}}>Course Playbook</div></div><div className="ss">{config.demo.fictional?'Invented course guides, tee comparisons and planning notes':'Course guides, tee comparisons and planning notes'}</div>
    <div className="pbt">{[["overview","Strategy"],["turf","Course Notes"],["holes","Hole Guide"],["tees","Tees"],["data","Course Data"]].map(([id,l])=><button key={id} className={`ptb ${view===id?"on":""}`} onClick={()=>{setView(id);ga('playbook_tab',{tab:id})}}>{l}</button>)}</div>

    {view==="overview"&&<div>
      {Object.entries(COURSE_DATA).map(([k,c])=><div key={k} className="ch"><div className="ch-i">{c.icon}</div><div className="ch-n">{c.name}</div><div className="ch-t">"{c.tagline}"</div><div className="ch-p">{c.personality}</div><div className="cm"><div className="cmi"><div className="cml">Ideal Format</div><div className="cmv">{c.idealFormat}</div></div><div className="cmi"><div className="cml">Pairing Strategy</div><div className="cmv">{c.pairingAdvice}</div></div></div></div>)}
      <div className="card"><div className="cl">Choose suitable tees</div><div className="ivd">Compare length and course handicap, then agree on tees before playing. {config.demo.fictional?'These courses and ratings are invented; use current information for your own event.':'Confirm current ratings, slope and tee details with each course before playing.'}</div></div>
    </div>}

    {view==="turf"&&<div>
      {TURF_INTEL.sections.map((s,i)=><div key={i} className="tcard"><div className="ttl">{s.title}</div>{s.tips.map((t,j)=><div key={j} className="ttip">{t}</div>)}</div>)}
      <div className="card"><div className="cl">Keep useful notes</div><div className="ivd">Record actual conditions after observing them. The example text demonstrates the guide structure and does not describe real turf.</div></div>
    </div>}

    {view==="holes"&&<div>
      <div className="dt" style={{marginBottom:14}}>{Object.entries(COURSE_DATA).map(([k,c])=><button key={k} className={`dtb ${course===k?"on":""}`} onClick={()=>{setCourse(k);setHole(0);ga('playbook_course',{course:k})}}>{c.icon} {c.name.split(" ")[0]}</button>)}</div>
      <>{(cd.mapImage||config.demo.fictional)&&<div style={{marginBottom:14}}><button className="btn btn2" onClick={()=>setShowMap(v=>!v)}>{showMap?'Hide':'View'} {cd.mapImage?'course map':'fictional course map'}</button>{showMap&&<img src={cd.mapImage||"/assets/course-map.svg"} alt={cd.mapAlt||`${cd.name}: ${cd.mapImage?'course diagram':'invented diagram, not a geographic map'}`} style={{width:'100%',marginTop:12}}/>}</div>}</>
      <button className="hgm-launch" onClick={()=>{setHole(0);setHoleModal(true);ga('hole_guide_open',{course})}}>⛳ Open Hole-by-Hole Guide</button>
      {holeModal&&<div className="hgm-overlay">
        <div className="hgm-header">
          <div className="hgm-header-top">
            <button className="hgm-close" onClick={()=>setHoleModal(false)}>✕</button>
            <select className="hgm-select" value={hole} onChange={e=>setHole(parseInt(e.target.value))}>
              {cd.holes.map((hh,i)=><option key={i} value={i}>Hole {hh.num}: {hh.name} (Par {hh.par})</option>)}
            </select>
          </div>
          <div className="hgm-hero">
            <div className="hgm-hole-num">{h.num}</div>
            <div className="hgm-hero-info">
              <div className="hgm-name">{h.name}</div>
              <div className="hgm-meta">Par {h.par} · {h.yds} yds</div>
              <div className="hgm-diff">{Array.from({length:5},(_,i)=><div key={i} className={`hgm-diff-dot ${i<h.difficulty?"f":"e"}`}/>)}</div>
            </div>
          </div>
        </div>
        {(()=>{
          const allText=h.strategy.length+h.desc.length+h.keyMiss.length+h.dangerZone.length+h.scoringTip.length;
          const s=Math.max(2.0,Math.min(3.4,5.2-allText*0.005));
          const bodyFs=`clamp(15px,${s.toFixed(2)}dvh,24px)`;
          const intelFs=`clamp(13px,${(s*0.78).toFixed(2)}dvh,20px)`;
          const labelFs=`clamp(9px,${(s*0.42).toFixed(2)}dvh,13px)`;
          const titleFs=`clamp(10px,${(s*0.45).toFixed(2)}dvh,14px)`;
          return <div className="hgm-body">
          <div className="hgm-content">
            <div className="hgm-intel">
              <div className="hgm-intel-box miss"><div className="hgm-intel-label" style={{fontSize:labelFs}}>Worst Miss</div><div className="hgm-intel-val" style={{fontSize:intelFs}}>{h.keyMiss}</div></div>
              <div className="hgm-intel-box avoid"><div className="hgm-intel-label" style={{fontSize:labelFs}}>Don't</div><div className="hgm-intel-val" style={{fontSize:intelFs}}>{h.dangerZone}</div></div>
              <div className="hgm-intel-box target"><div className="hgm-intel-label" style={{fontSize:labelFs}}>Play For</div><div className="hgm-intel-val" style={{fontSize:intelFs}}>{h.scoringTip}</div></div>
            </div>
            <div className="hgm-card strat">
              <div className="hgm-card-t" style={{fontSize:titleFs}}>Strategy</div>
              <div className="hgm-card-x" style={{fontSize:bodyFs}}>{h.strategy}</div>
            </div>
            <div className="hgm-card desc">
              <div className="hgm-card-t" style={{fontSize:titleFs}}>About This Hole</div>
              <div className="hgm-card-x" style={{fontSize:bodyFs}}>{h.desc}</div>
            </div>
          </div>
        </div>;
        })()}
        <div className="hgm-nav-bar">
          <button className="hgm-nav-btn prev" disabled={hole===0} onClick={()=>setHole(v=>v-1)}>‹ Prev</button>
          <div style={{fontFamily:"'JetBrains Mono Variable',monospace",fontSize:13,color:"var(--text-mut)",fontWeight:600,padding:"0 10px",flexShrink:0}}>{h.num} / {cd.holes.length}</div>
          <button className="hgm-nav-btn next" disabled={hole===cd.holes.length-1} onClick={()=>setHole(v=>v+1)}>Next ›</button>
        </div>
      </div>}
    </div>}

    {view==="tees"&&(()=>{
      const TEE_SESSIONS=COMPETITIVE.map(s=>({sid:s.id,label:s.course,icon:'⛳'}));
      const td=TEE_DATA[teeCourse];
      const players=ALL_PLAYERS;
      const getRawHC=(index,tee)=>index*(tee.slope/113)+(tee.rating-td.par);
      return <div>
        <div className="dt" style={{marginBottom:14}}>{TEE_SESSIONS.map(s=><button key={s.sid} className={`dtb ${teeCourse===s.sid?"on":""}`} onClick={()=>{setTeeCourse(s.sid);ga('tee_intel_course',{course:s.sid})}}>{s.icon} {s.label}</button>)}</div>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 16px 8px",borderBottom:"1px solid var(--sand)"}}>
            <div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:17,fontWeight:700,color:"var(--navy)"}}>{TEE_SESSIONS.find(s=>s.sid===teeCourse)?.icon} {td.courseName}: Tee Advantage</div>
            <div style={{fontSize:12,color:"var(--text-mut)",marginTop:2}}>Course HC and rounding edge per tee</div>
          </div>
          <div className="tee-matrix-wrap">
            <table className="tee-matrix">
              <thead><tr>
                <th>Player</th>
                {td.tees.map((t,i)=><th key={i} className={i===td.defaultTee?"tee-default":""}>{i===td.defaultTee&&<span className="tee-default-label">Default</span>}{t.tee}<span className="tee-yds">{t.yds}</span></th>)}
              </tr></thead>
              <tbody>
                {players.map(p=>{
                  const idx=getPlayerIndex(data,p.id);
                  return <tr key={p.id}>
                    <td>{p.short}<span className="tee-player-idx">({idx})</span></td>
                    {td.tees.map((t,ti)=>{
                      const raw=getRawHC(idx,t);
                      const rounded=Math.round(raw);
                      const frac=raw-Math.floor(raw);
                      const isBonus=frac>=0.50;
                      const isNear=frac>=0.40&&frac<0.50;
                      return <td key={ti} className={`${isBonus?"tee-bonus":isNear?"tee-near":""} ${ti===td.defaultTee?"tee-default":""}`}>
                        <span className="tee-hc">{rounded}</span><span className="tee-frac">.{String(Math.round(frac*100)).padStart(2,'0')}</span>
                      </td>;
                    })}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="tee-legend" style={{padding:"8px 16px 14px"}}>
            <div className="tee-legend-item"><div className="tee-legend-dot" style={{background:"var(--forest-pale)",border:"1px solid var(--forest-lt)"}}></div> Bonus stroke: rounding works in your favor</div>
            <div className="tee-legend-item"><div className="tee-legend-dot" style={{background:"var(--gold-pale)",border:"1px solid var(--gold)"}}></div> Near miss: just barely misses an extra stroke</div>
          </div>
        </div>
        <div className="card" style={{borderLeft:"3px solid var(--gold)",marginTop:12}}><div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:15,fontWeight:700,color:"var(--gold-dk)",marginBottom:5}}>How to Read This</div><div className="ivd">Large number = course handicap. Green cells = the decimal rounds UP, giving that player an extra stroke. Amber = within one decimal of gaining a stroke. Agree on tees for distance, enjoyment and fair competition before starting.</div></div>
      </div>;
    })()}

    {view==="data"&&<div>
      {Object.entries(COURSE_DATA).map(([k,c])=><div key={k} className="card" style={{borderLeft:"3px solid var(--navy)",marginBottom:16}}><div style={{fontFamily:"'Cormorant Garamond Variable',serif",fontSize:17,fontWeight:700,color:"var(--navy)",marginBottom:10}}>{c.icon} {c.name}</div><div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><div className="tt"><div className="tc th">Tee</div><div className="tc th">Yds</div><div className="tc th">Rating</div><div className="tc th">Slope</div><div className="tc th">Note</div>{c.teeData.map((t,i)=>[<div key={`${i}t`} className="tc" style={{fontWeight:700}}>{t.tee}</div>,<div key={`${i}y`} className="tc" style={{fontFamily:"'JetBrains Mono Variable',monospace"}}>{t.yds}</div>,<div key={`${i}r`} className="tc" style={{fontFamily:"'JetBrains Mono Variable',monospace"}}>{t.rating}</div>,<div key={`${i}s`} className="tc" style={{fontFamily:"'JetBrains Mono Variable',monospace",color:t.slope>=142?"var(--red-soft)":"var(--gold-dk)",fontWeight:600}}>{t.slope}</div>,<div key={`${i}n`} className="tc" style={{fontSize:11,color:"var(--text-sec)"}}>{t.note}</div>])}</div></div></div>)}
    </div>}
  </div>);
}

// ─── Finances Tab ────────────────────────────────────────────────────────────


function CopyBtn({text}){const [copied,setCopied]=useState(false);return <button className="btn btn2 copy-button" aria-label="Copy text" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{setCopied(false);}}}>{copied?'Copied':'Copy'}</button>;}
function MapLink({to,label}){return to?<a className="map-link" href={to} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${label}`}>Directions ↗</a>:null;}
const courseAddr=id=>config.courses[id]?.directionsUrl;
function ExploreMap({items}){
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[selected,setSelected]=useState(null),drag=useRef(null);
 useEffect(()=>setSelected(null),[items]);
 return <div className="card map-card"><div className="button-row"><strong>Illustrated area map</strong><button className="btn btn2" aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(3,z+.3))}>+</button><button className="btn btn2" aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(1,z-.3))}>−</button><button className="btn btn2" onClick={()=>{setZoom(1);setOffset({x:0,y:0});}}>Reset map</button></div><p className="inline-note">Drag to pan. Select a numbered place for details. This schematic shows the group’s selected places. Pin spacing and illustrated roads are not geographic directions.</p>
  <svg role="img" aria-label={`Schematic map of ${config.event.location}`} viewBox="0 0 800 500" className="explore-map" onPointerDown={e=>{if(e.target.closest('[data-pin]'))return;drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y,width:e.currentTarget.getBoundingClientRect().width};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current){const d=drag.current,f=800/d.width;setOffset({x:Math.max(-600,Math.min(600,d.ox+(e.clientX-d.x)*f)),y:Math.max(-400,Math.min(400,d.oy+(e.clientY-d.y)*f))});}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
   <rect width="800" height="500" fill="var(--forest-pale)"/><g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}><path d="M0 80 Q240 180 380 80 T800 110 M0 310 Q180 180 470 320 T800 340" fill="none" stroke="var(--white)" strokeWidth="22"/><path d="M550 0 Q410 200 580 500" fill="none" stroke="var(--navy-pale)" strokeWidth="38"/><text x="350" y="455" fill="var(--text-mut)" fontSize="20">{config.event.location}: schematic</text>{items.map((p,i)=><g key={p.id} data-pin="true" role="button" tabIndex="0" aria-label={`Open ${p.name}`} onClick={()=>setSelected(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p);}}} transform={`translate(${p.x},${p.y})`}><circle r="22" fill="var(--forest)" stroke="var(--white)" strokeWidth="4"/><text textAnchor="middle" y="7" fill="white" fontWeight="bold" fontSize="20">{i+1}</text></g>)}</g>
  </svg>{selected&&<div className="map-popup"><h3>{selected.name}</h3><p>{selected.desc}</p><MapLink to={selected.directionsUrl} label={selected.name}/><button className="btn btn2" onClick={()=>setSelected(null)}>Close details</button></div>}</div>;
}
function AccommodationsTab({data,setData}){
 const h=config.lodging;return <div><h1 className="st">The House</h1><p className="ss">Arrival details and a useful base for the group</p>{(h.image||config.demo.fictional)&&<img className="wide-illustration" src={h.image||"/assets/invented-cottage.png"} alt={h.imageAlt||`${h.name}: ${h.image?'lodging photo':'original invented cottage illustration'}`}/>}<section className="card"><h2>{h.name}</h2><p>{h.address} <CopyBtn text={h.address}/> <MapLink to={h.directionsUrl} label={h.name}/></p><div className="ig"><div className="ii"><div className="il">Check in</div><div className="iv">{h.checkIn}</div></div><div className="ii"><div className="il">Check out</div><div className="iv">{h.checkOut}</div></div></div></section><section className="card"><h2>Getting settled</h2><p>{h.arrival}</p><p>{h.wifi}</p><div className="button-row">{h.amenities.map(a=><span className="ex-tag" key={a}>{a}</span>)}</div></section><section className="card"><label className="field">Shared house notes<EditTextarea rows="5" value={data.lodgingNotes} maxLength={4000} onChange={e=>setData(p=>({...p,lodgingNotes:e.target.value,lastUpdated:new Date().toISOString()}))}/></label><p className="inline-note">These notes are visible to everyone with access to this event. Keep permanent passwords in your own password manager.</p></section><section className="card"><h2>Nearby ideas</h2>{EXPLORE_ACTIVITIES.map(p=><p key={p.id}><strong>{p.name}</strong>: {p.drive}</p>)}</section></div>;
}
function InfoTab(){
 const pots=config.contests,total=pots.teamPot+pots.mvpPot+CTP_HOLES.length*pots.ctpPerHole+pots.birdiePrizes.reduce((a,b)=>a+b,0);
 return <div><h1 className="st">Trip Guide</h1><p className="ss">The format, logistics and decisions in one place</p><section className="card"><h2>{config.event.name}</h2><p>{config.event.edition}. {config.event.location}.</p><p>{config.demo.description}</p><div className="ig"><div className="ii"><div className="il">Players</div><div className="iv">{ALL_PLAYERS.length}</div></div><div className="ii"><div className="il">Match points</div><div className="iv">{TOTAL_POINTS}</div></div><div className="ii"><div className="il">Timezone</div><div className="iv">{config.event.timezone}</div></div></div></section><section className="card"><h2>How the competition works</h2><p>Singles compare one player on each side. Better ball compares the lower net score from each pair. Each match is worth one point; a halved match gives each team half a point.</p><p>{config.handicapping.description}</p><p>Enter every player’s actual strokes for the holes played. Unreadable and unplayed cells stay blank. Captains can enter an explicit manual result for concessions or an agreed shortened match.</p><p>The app recalculates automatic results when scores, tees, pairings or indices change. A manual override remains until you remove it.</p></section><section className="card"><h2>Contest budget</h2><p>{config.demo.fictional?'The invented example sets aside':'This event sets aside'} ${total.toFixed(2)} across the team prize, MVP, closest-to-pin holes and net-birdie prizes. Actual shared expenses are tracked separately under Finances.</p><p>Agree on your own participation and rules before the event. Prize calculations are planning records; the app does not collect or send money.</p></section><section className="card"><h2>Courses at a glance</h2>{Object.values(COURSE_DATA).map(c=><details key={c.id}><summary>{c.icon} {c.name}</summary><p>{c.description}</p><p>{c.overview}</p></details>)}</section></div>;
}
function BettingTab({data,setData,toast}){
 const [view,setView]=useState('overview'),summary=contestSummary(config,data),pots=config.contests;
 const updateCtp=(key,patch)=>setData(prev=>({...prev,ctpResults:{...prev.ctpResults,[key]:{player:'',distance:'',...prev.ctpResults[key],...patch}},lastUpdated:new Date().toISOString()}));
 return <div><h1 className="st">Contests</h1><p className="ss">Team prize, MVP, closest to the pin and net birdies</p><div className="dt">{[['overview','Prize pools'],['mvp','MVP'],['ctp','Closest to pin'],['birdies','Net birdies']].map(([id,name])=><button className={`dtb ${view===id?'on':''}`} key={id} onClick={()=>setView(id)}>{name}</button>)}</div>
 {view==='overview'&&<><section className="card"><h2>Team prize: ${pots.teamPot.toFixed(2)}</h2><p>The winning team splits the pot. A fully completed, all-square event splits it among all participants.</p>{summary.complete?<div>{Object.entries(summary.teamPayouts).map(([id,amount])=><p key={id}>{getPlayer(id).name}: ${amount.toFixed(2)}</p>)}</div>:<p className="inline-note">Payouts appear after every match has a result.</p>}</section><div className="ig"><div className="ii"><div className="il">MVP</div><div className="iv">${pots.mvpPot.toFixed(2)}</div></div><div className="ii"><div className="il">Closest to pin</div><div className="iv">${pots.ctpPerHole.toFixed(2)} per hole</div></div><div className="ii"><div className="il">Net birdies</div><div className="iv">{pots.birdiePrizes.map(n=>'$'+n).join(' / ')}</div></div></div></>}
 {view==='mvp'&&<section className="card"><h2>Captains’ choice</h2><p>Choose one MVP for the event. Prize: ${pots.mvpPot.toFixed(2)}.</p><label className="field">MVP<EditSelect value={data.mvpWinner} onChange={e=>setData(p=>({...p,mvpWinner:e.target.value,lastUpdated:new Date().toISOString()}))}><option value="">Not selected</option>{ALL_PLAYERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</EditSelect></label><EditButton className="btn btn2" onClick={()=>{setData(p=>({...p,mvpWinner:''}));toast('MVP selection cleared locally');}}>Clear selection</EditButton></section>}
 {view==='ctp'&&<><p className="inline-note">Each competitive course contributes its shortest and longest par three. Save a measured distance with units, such as “2 ft 4 in”.</p>{CTP_HOLES.map(h=>{const key=`${h.sid}-${h.hole}`,entry=data.ctpResults[key]??{player:'',distance:''},eligible=COMPETITIVE.find(s=>s.id===h.sid).participants;return <section className="card" key={key}><h2>{h.course}, hole {h.hole}</h2><p>{h.tag} · {h.yds} yards · ${pots.ctpPerHole.toFixed(2)}</p><div className="two-fields"><label className="field">Winner<EditSelect value={entry.player} onChange={e=>updateCtp(key,{player:e.target.value})}><option value="">Not selected</option>{eligible.map(id=><option key={id} value={id}>{getPlayer(id).name}</option>)}</EditSelect></label><label className="field">Distance<EditInput value={entry.distance} maxLength={80} onChange={e=>updateCtp(key,{distance:e.target.value})}/></label></div><EditButton className="btn btn2" onClick={()=>setData(p=>{const c={...p.ctpResults};delete c[key];return {...p,ctpResults:c};})}>Clear hole</EditButton></section>;})}<section className="card"><h2>Closest-to-pin tally</h2>{summary.closest.length?summary.closest.map(p=><p key={p.id}>{p.name}: {p.holes} holes, ${p.payout.toFixed(2)}</p>):<p>No winners recorded yet.</p>}</section></>}
 {view==='birdies'&&<section className="card"><h2>Net birdies or better</h2><p>Counts use each player’s full course handicap, selected tees and recorded holes. Positions sort by birdies, then rate; agree on any tied prize decision with the group.</p><div className="table-scroll"><table className="plain-table"><thead><tr><th>Place</th><th>Player</th><th>Birdies</th><th>Holes</th><th>Rate</th><th>Listed prize</th></tr></thead><tbody>{summary.birdies.map((p,i)=><tr key={p.id}><td>{i+1}</td><td>{p.name}</td><td>{p.netBirdies}</td><td>{p.holesPlayed}</td><td>{p.rate}%</td><td>{pots.birdiePrizes[i]?'$'+pots.birdiePrizes[i].toFixed(2):''}</td></tr>)}</tbody></table></div></section>}
 </div>;
}
function exportScores(data){
 const rows=[['Session','Player','Hole','Par','Strokes']];for(const s of COMPETITIVE)for(const p of ALL_PLAYERS)for(let h=0;h<18;h++)rows.push([s.course,p.name,h+1,TEE_DATA[s.id].pars[h],data.playerScores[s.id]?.[p.id]?.[h]??'']);
 const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';download('golf-scores.csv',rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv');
}
function SettingsTab({data,setData,toast,queue,runtime}){
 const [announcement,setAnnouncement]=useState(''),[imported,setImported]=useState(null),[error,setError]=useState('');const validate=stateValidator(config);
 async function inspectImport(e){try{const file=e.target.files?.[0];if(!file)return;if(file.size>2_500_000)throw new Error('This backup is too large.');const value=validate(recalculate(config,JSON.parse(await file.text())));setImported(value);setError('');}catch(e){setError('This backup does not match the configured event or its data rules.');}finally{e.target.value='';}}
 return <div><h1 className="st">Settings & Backups</h1><p className="ss">Make the workshop yours and keep a copy of your work</p><section className="card"><h2>Download your records</h2><p>A JSON backup preserves the event data and photo references. Download the actual scorecard photos separately, or back up the server data folder for a complete copy.</p><div className="button-row"><button className="btn btn1" onClick={()=>download(`${config.event.id}-backup.json`,data)}>Export event backup</button><button className="btn btn2" onClick={()=>exportScores(data)}>Export scores to CSV</button><button className="btn btn2" onClick={()=>download('pending-save-recovery.json',queue.journal())}>Export save recovery</button></div>{Object.entries(data.scorecardPhotos).map(([sid,photo])=><button className="btn btn2" key={sid} onClick={async()=>{try{download(photo.filename,await api('/api/photos/'+photo.id,{blob:true}));}catch(e){setError(e.message);}}}>Photo: {COMPETITIVE.find(s=>s.id===sid).course}</button>)}</section>
 <section className="card"><h2>Restore an event backup</h2><p>Choose a matching JSON backup, inspect the summary, then replace the current event. A recovery download is made before replacement.</p><EditInput aria-label="Choose event backup" type="file" accept="application/json,.json" onChange={inspectImport}/>{imported&&<div className="inline-note"><p>{Object.keys(imported.matchResults).length} match results, {imported.expenses.length} expenses, {Object.keys(imported.scorecardPhotos).length} photo references.</p><EditButton className="btn btn1" onClick={()=>{download('before-restore-backup.json',data);setData(imported);if(getRuntime().canEdit){setImported(null);toast('Restore queued; check the save status');}}}>Restore this backup</EditButton><button className="btn btn2" onClick={()=>setImported(null)}>Cancel</button></div>}{error&&<p className="error-note" role="alert">{error}</p>}</section>
 <section className="card"><h2>Handicap indices</h2><p>Negative numbers represent plus handicaps. The product accepts indices from -20 to 54. Changes recalculate every automatic result.</p><div className="two-fields">{ALL_PLAYERS.map(p=><label className="field" key={p.id}>{p.name}<EditInput type="number" step="0.1" min="-20" max="54" key={p.id+':'+data.handicaps[p.id]} defaultValue={data.handicaps[p.id]} onBlur={e=>{if(e.target.value!==''&&Number.isFinite(Number(e.target.value))&&Number(e.target.value)!==data.handicaps[p.id])setData(prev=>({...prev,handicaps:{...prev.handicaps,[p.id]:Number(e.target.value)}}));}}/></label>)}</div></section>
 <section className="card"><h2>Announcements</h2><label className="field">A short update<EditTextarea rows="3" maxLength={2000} value={announcement} onChange={e=>setAnnouncement(e.target.value)}/></label><EditButton className="btn btn1" disabled={!announcement.trim()} onClick={()=>{setData(p=>({...p,announcements:[...p.announcements,{time:new Date().toISOString(),text:announcement.trim()}]}));setAnnouncement('');}}>Add announcement</EditButton></section>
 <section className="card"><h2>Connections</h2><p>Storage: the organizer’s configured local or Redis store. Image reading: {runtime.ocrEnabled?'enabled by the organizer':'off; manual review works without an account'}.</p><p>Google Drive and Google Sheets synchronization is not implemented. The CSV export opens in a spreadsheet, and photos can be downloaded here. A successful save never claims to have uploaded either to Google.</p><p>To host your own event, follow <a href="/docs/setup.html">the setup guide</a>. Keep your configuration and access links private.</p></section>
 <details className="card"><summary>Release notes</summary><p>Version 1.0.0 preserves the original trip planning and tournament workflow, adds invented examples, fixes match margins and stroke allocation, retains manual overrides, saves exact cents, and introduces authenticated, revision-checked shared saves.</p></details>
 {runtime.mode==='demo'&&<section className="card"><h2>Reset this invented demo</h2><p>This replaces the tournament records. Poll answers are separate.</p><EditButton className="btn btnD" onClick={()=>{if(confirm('Download the current event and reset this invented tournament?')){download('before-demo-reset.json',data);setData(buildSeedData());}}}>Download backup and reset demo</EditButton></section>}
 </div>;
}
function SaveBar({queue,status,error}){
 const labels={saved:'Saved to the event store',saving:'Saving…',pending:'Changes queued',offline:'Offline or unavailable. Your changes remain in this browser.',conflict:'Another version was saved. Review before continuing.', 'account-changed':'The signed-in person changed. Reload to continue.','storage-error':'Browser recovery storage failed. Export your draft now.'};
 return <aside className={`save-bar ${status==='saved'?'saved':'attention'}`} aria-live="polite"><div>{error||labels[status]||status}</div>{status!=='saved'&&<div className="button-row"><button className="btn btn2" onClick={()=>download('golf-save-recovery.json',queue.journal())}>Download recovery</button>{['offline','pending'].includes(status)&&<button className="btn btn2" onClick={()=>queue.retry()}>Retry save</button>}{status==='account-changed'&&<button className="btn btn2" onClick={()=>location.reload()}>Reload</button>}</div>}{status==='conflict'&&<details><summary>Review the two versions</summary><div className="conflict-columns"><div><h3>Your draft</h3><pre>{JSON.stringify(queue.value,null,2)}</pre></div><div><h3>Current saved copy</h3><pre>{JSON.stringify(queue.conflict?.value,null,2)}</pre></div></div><p>Download both versions first. You can continue editing your local draft before choosing to replace the saved copy.</p><div className="button-row"><button className="btn btn2" onClick={()=>{download('conflict-local-and-server.json',queue.journal());queue.acceptServer();}}>Back up both and use saved copy</button><button className="btn btn1" onClick={()=>{if(confirm('Replace the current saved copy with your reviewed local draft?')){download('conflict-local-and-server.json',queue.journal());queue.rebaseLocal();}}}>Back up both and save my draft</button></div></details>}</aside>;
}
function PollTab({runtime}){
 const [answer,setAnswer]=useState(blankAnswer),[summary,setSummary]=useState(null),[status,setStatus]=useState('loading'),[error,setError]=useState(''),q=useRef(null),generation=useRef(0);
 useEffect(()=>{const turn=++generation.current;let current,timer;
  async function pull(){try{const result=await api('/api/poll',{actor:runtime.principal.id});if(turn!==generation.current)return;setSummary(result.summary);
   if(result.respondent){const doc=result.own??{revision:0,value:blankAnswer()};doc.value=doc.value??blankAnswer();validateAnswer(doc.value);
    if(current)current.observe(doc);else{current=await makeQueue('poll',doc,event=>{if(turn!==generation.current)return;setStatus(event.status);setAnswer(event.value);},validateAnswer);if(turn!==generation.current){current.dispose();return;}q.current=current;setAnswer(current.value);setStatus(current.status);if(current.status==='offline')current.retry();}
   }else{setAnswer(blankAnswer());setStatus('viewing');}setError('');
  }catch(e){if(turn===generation.current)setError(e.message);}}
  pull();timer=setInterval(pull,30000);window.addEventListener('online',pull);
  return()=>{generation.current++;clearInterval(timer);window.removeEventListener('online',pull);current?.dispose();q.current=null;};
 },[runtime.principal.id]);
 function update(patch){if(!q.current)return;try{q.current.stage(validateAnswer({...q.current.value,...patch}));setError('');}catch(e){setError(e.message);}}
 async function refresh(){const turn=generation.current;try{const result=await api('/api/poll',{actor:runtime.principal.id});if(turn!==generation.current)return;setSummary(result.summary);if(q.current){const doc=result.own??{revision:0,value:blankAnswer()};doc.value=doc.value??blankAnswer();validateAnswer(doc.value);q.current.observe(doc);}setError('');}catch(e){if(turn===generation.current)setError(e.message);}}
 const canAnswer=!!runtime.principal.respondent&&!!q.current;
 return <div><h1 className="st">{POLL.title}</h1><p className="ss">{POLL.description}</p><p className="card">{canAnswer?`Answering as ${getPlayer(runtime.principal.respondent)?.name}. Every change saves automatically.`:'You are viewing results as an organizer. Use your own participant link to answer the poll.'}{runtime.mode==='demo'&&' Use the demo identity menu above to try a different person.'}</p>{q.current&&<SaveBar queue={q.current} status={status} error={error}/>}{error&&<p role="alert" className="error-note">{error}</p>}
 <fieldset disabled={!canAnswer} className="poll-form"><section className="card"><h2>1. Rate the bases</h2><p>One means “not for me”; five means “would love it”. Leave a base blank if you have no view.</p>{POLL.bases.map(b=><div className="poll-option" key={b.id}><h3>{b.name}</h3><p>{b.desc}</p><label className="field">Your rating for {b.name}<select value={answer.baseRatings[b.id]??''} onChange={e=>{const ratings={...answer.baseRatings};if(e.target.value)ratings[b.id]=Number(e.target.value);else delete ratings[b.id];update({baseRatings:ratings});}}><option value="">Not rated</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>)}</section>
 <section className="card"><h2>2. How much driving?</h2>{POLL.driving.map(o=><label className="check-row" key={o.id}><input type="radio" name="driving" checked={answer.driving===o.id} onChange={()=>update({driving:o.id})}/>{o.name}</label>)}</section>
 <section className="card"><h2>3. Pick up to two must-plays</h2>{POLL.mustPlay.map(o=><label className="check-row" key={o.id}><input type="checkbox" checked={answer.mustPlay.includes(o.id)} disabled={!answer.mustPlay.includes(o.id)&&answer.mustPlay.length>=2} onChange={e=>update({mustPlay:e.target.checked?[...answer.mustPlay,o.id]:answer.mustPlay.filter(id=>id!==o.id)})}/>{o.name}</label>)}</section>
 <section className="card"><h2>4. Which dates work?</h2>{POLL.dates.map(o=><label className="field" key={o.id}>{o.name}<select value={answer.dates[o.id]??''} onChange={e=>{const dates={...answer.dates};if(e.target.value)dates[o.id]=e.target.value;else delete dates[o.id];update({dates});}}><option value="">Not answered</option><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option></select></label>)}</section>
 <section className="card"><h2>5. When can you arrive?</h2>{POLL.arrival.map(o=><label className="check-row" key={o.id}><input type="radio" name="arrival" checked={answer.arrival===o.id} onChange={()=>update({arrival:o.id})}/>{o.name}</label>)}</section><section className="card"><label className="field"><h2>6. Anything else?</h2><textarea rows="4" value={answer.suggestion} maxLength={2000} onChange={e=>update({suggestion:e.target.value})}/></label></section></fieldset>
 <section className="card"><div className="button-row"><h2>Group results</h2><button className="btn btn2" onClick={refresh}>Refresh results</button></div>{summary&&<><p>{summary.respondents} saved responses</p><div className="table-scroll"><table className="plain-table"><thead><tr><th>Base</th><th>Average rating</th><th>Rated by</th></tr></thead><tbody>{POLL.bases.map(b=><tr key={b.id}><td>{b.name}</td><td>{summary.baseRatings[b.id].mean?.toFixed(1)??'No ratings'}</td><td>{summary.baseRatings[b.id].count}</td></tr>)}</tbody></table></div>{[['driving','Driving'],['mustPlay','Must-plays'],['arrival','Arrival']].map(([key,title])=><div key={key}><h3>{title}</h3>{POLL[key].map(o=><p key={o.id}>{o.name}: {summary[key][o.id]}</p>)}</div>)}<h3>Dates</h3>{POLL.dates.map(o=><p key={o.id}>{o.name}: {summary.dates[o.id].yes} yes, {summary.dates[o.id].maybe} maybe, {summary.dates[o.id].no} no</p>)}<h3>Suggestions</h3>{summary.suggestions.map(s=><blockquote key={s.id}><strong>{getPlayer(s.id)?.name}</strong><p>{s.text}</p></blockquote>)}</>}</section></div>;
}
const TABS=[['dashboard','Dashboard'],['competition','Competition'],['betting','Contests'],['weather','Weather'],['rosters','Rosters'],['explore','Explore'],['house','The House'],['info','Trip Guide'],['finances','Finances'],['playbook','Course Playbook'],['proposals','Trip Proposals'],['poll','Trip Poll'],['settings','Settings']];
export default function App(){
 const [tab,setTabRaw]=useState(()=>TABS.some(([id])=>id===location.hash.slice(1))?location.hash.slice(1):'dashboard'),[runtime,setRuntimeState]=useState(null),[data,setViewData]=useState(null),[status,setStatus]=useState('loading'),[weather,setWeather]=useState(null),[error,setError]=useState(''),[toast,setToast]=useState(''),[phase,setPhase]=useState('during');
 const dataRef=useRef(null),queue=useRef(null),toastTimer=useRef(null);
 const showToast=message=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3500);};
 const setTab=id=>{setTabRaw(id);history.pushState(null,'','#'+id);window.scrollTo({top:0});};
 useEffect(()=>{const changed=()=>{const id=location.hash.slice(1);if(TABS.some(([key])=>key===id))setTabRaw(id);};window.addEventListener('popstate',changed);window.addEventListener('hashchange',changed);return()=>{window.removeEventListener('popstate',changed);window.removeEventListener('hashchange',changed);};},[]);
 useEffect(()=>{let active=true,q;async function load(){try{const info=await api('/api/runtime');if(!active)return;setRuntime(info);setRuntimeState(info);if(!info.principal)return;const doc=await api('/api/event');if(!active)return;const validate=stateValidator(config);validate(doc.value);dataRef.current=doc.value;q=await makeQueue('event',doc,event=>{if(!active)return;dataRef.current=event.value;setViewData(event.value);setStatus(event.status);},validate);if(!active){q.dispose();return;}validate(q.value);queue.current=q;bindQueue(q);dataRef.current=q.value;setViewData(q.value);setStatus(q.status);if(q.status==='offline')q.retry();api('/api/weather').then(w=>{if(active)setWeather(w);}).catch(()=>{if(active)setWeather({available:false});});}catch(e){if(active)setError(e.message);}}load();return()=>{active=false;q?.dispose();if(queue.current===q)queue.current=null;clearTimeout(toastTimer.current);};},[]);
 useEffect(()=>{if(!runtime?.principal)return;let active=true,pulling=false;
  async function refresh(){if(pulling||!queue.current)return;pulling=true;try{const doc=await api('/api/event',{actor:runtime.principal.id});stateValidator(config)(doc.value);if(active)queue.current?.observe(doc);}catch(e){if(active)setError('Refresh: '+e.message);}finally{pulling=false;}}
  const timer=setInterval(refresh,30000);window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);};
 },[runtime?.principal?.id]);
 const setData=update=>{try{if(!runtime.canEdit)throw new Error('Your link can view the tournament. Ask the organizer for scorekeeper access to edit it.');const draft=typeof update==='function'?update(structuredClone(dataRef.current)):update;draft.lastUpdated=new Date().toISOString();const next=stateValidator(config)(recalculate(config,draft));queue.current.stage(next);dataRef.current=next;setViewData(next);setError('');markStage(null);return next;}catch(e){const message=e.issues?.[0]?`${e.issues[0].path.join('.')}: ${e.issues[0].message}`:e.message;setError(message);markStage(message);return null;}};
 useEffect(()=>{const warn=e=>{if(hasPendingChanges()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 async function chooseIdentity(actor){try{if(hasPendingChanges()&&!confirm('Some changes are still pending. They will remain saved in this identity’s browser recovery copy. Switch demo identity?'))return;await api('/api/demo/login',{method:'POST',body:{actor}});queue.current?.dispose();location.reload();}catch(e){setError(e.message);}}
 if(!runtime)return <main className="mn"><h1 className="st">Golf Trip Workshop</h1><p role="status">{error||'Opening the workshop…'}</p></main>;
 if(!runtime.principal)return <main className="mn login-panel"><img src="/assets/hero.png" alt="Golf Trip Workshop, plan the trip and play the matches" className="wide-illustration"/><h1>Make a good golf weekend happen.</h1><p>Explore a complete, invented trip. Plan matches, compare destinations, collect preferences and settle the shared bill. Nothing leaves this computer in the demo.</p><h2>Choose a demo role</h2><div className="button-row"><button className="btn btn1" onClick={()=>chooseIdentity('owner')}>Open as organizer</button><button className="btn btn2" onClick={()=>chooseIdentity(ALL_PLAYERS[0].id)}>Try the participant poll</button></div><p className="inline-note">The people, courses, places, scores and costs are invented. A real shared event uses private access links.</p>{error&&<p className="error-note">{error}</p>}</main>;
 if(!data)return <main className="mn"><h1 className="st">Opening your event</h1><p role="alert">{error||'Loading saved records…'}</p>{error&&<><button className="btn btn2" onClick={()=>location.reload()}>Retry</button>{dataRef.current&&<button className="btn btn2" onClick={()=>download('saved-event-backup.json',dataRef.current)}>Download saved event backup</button>}</>}</main>;
 const now=runtime.mode==='demo'?new Date(phase==='pre'?Date.parse(config.event.startsAt)-3*86400000:phase==='post'?Date.parse(config.event.endsAt)+86400000:config.event.demoNow):new Date(),ctx=getEventContext(now),pts=computePoints(data);
 const content=()=>{switch(tab){case'dashboard':return <DashboardTab data={data} pts={pts} ctx={ctx} weather={weather}/>;case'competition':return <CompetitionTab data={data} setData={setData} toast={showToast} ctx={ctx} pts={pts}/>;case'betting':return <BettingTab data={data} setData={setData} toast={showToast}/>;case'weather':return <WeatherTab weather={weather}/>;case'rosters':return <RostersTab data={data} setData={setData}/>;case'explore':return <ExploreTab/>;case'house':return <AccommodationsTab data={data} setData={setData}/>;case'info':return <InfoTab/>;case'finances':return <FinancesTab data={data} setData={setData} toast={showToast}/>;case'playbook':return <PlaybookTab ctx={ctx} data={data}/>;case'poll':return <PollTab runtime={runtime}/>;case'settings':return <SettingsTab data={data} setData={setData} toast={showToast} queue={queue.current} runtime={runtime}/>;case'proposals':return <ProposalsTab/>;default:return null;}};
 return <EditAccess.Provider value={runtime.canEdit}><div><a className="skip-link" href="#main">Skip to content</a><div className="hero-banner"><div className="hero-inner"><div><div className="hero-badge">{config.event.edition}</div><h1 className="hero-title">{config.event.name}</h1><div className="hero-sub">{config.event.location}</div></div><div className="hero-flag"><div className="hero-flag-item"><div className="f">{TEAMS.usa.flag}</div><div className="p">{pts.usa}</div></div><div className="hero-flag-item"><div className="f">{TEAMS.europe.flag}</div><div className="p">{pts.europe}</div></div></div></div></div><header className="header"><div className="header-in"><div className="hdr-brand"><span className="hdr-crest">⛳</span><div><div className="hdr-title">Golf Trip Workshop</div><div className="hdr-sub">{runtime.canEdit?'Organizer tools':'Participant view'}</div></div></div>{runtime.mode==='demo'?<label className="demo-identity">Demo identity<select aria-label="Demo identity" value={runtime.principal.id} onChange={e=>chooseIdentity(e.target.value)}>{runtime.identities.map(p=><option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}</select></label>:<button className="btn btn2" onClick={async()=>{await api('/api/logout',{method:'POST'});location.reload();}}>Sign out</button>}</div></header><div className="nav-bar"><nav className="nav" aria-label="Workshop sections">{TABS.map(([id,label])=><button key={id} data-tab={id} className={`nb ${tab===id?'on':''}`} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav></div><main className="mn" id="main">{runtime.mode==='demo'&&<div className="demo-strip"><span>Invented offline demo</span><label>Show event phase <select value={phase} onChange={e=>setPhase(e.target.value)}><option value="pre">Before the trip</option><option value="during">During the trip</option><option value="post">After the trip</option></select></label></div>}<SaveBar queue={queue.current} status={status} error={error}/>{!runtime.canEdit&&<p className="inline-note">Your link can view tournament details and save your own poll. Tournament edits require scorekeeper access.</p>}{content()}</main><footer className="workshop-footer"><p>Built for my own personal use. Make it your own, and feel free to improve mine. Hopefully it gives you a useful starting point, or at least some ideas. Cheers!</p><a href="https://github.com/jessecmaddox3/golf-trip-workshop" target="_blank" rel="noopener noreferrer">Source & setup</a></footer><Toast msg={toast}/></div></EditAccess.Provider>;
}
