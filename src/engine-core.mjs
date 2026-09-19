export function createEngine(settings){
const TEAMS=settings.teams;
const ALL_PLAYERS=Object.values(TEAMS).flatMap(t=>t.players);
const getTeamForPlayer=id=>Object.keys(TEAMS).find(key=>TEAMS[key].players.some(p=>p.id===id));
const getPlayer=id=>ALL_PLAYERS.find(p=>p.id===id);
const SCHEDULE=settings.schedule;
const TEE_DATA=Object.fromEntries(SCHEDULE.flatMap(day=>day.sessions).filter(s=>s.isCompetitive).map(s=>[s.id,{...settings.courses[s.courseId],courseName:settings.courses[s.courseId].name}]));
const SEED_HANDICAPS=Object.fromEntries(ALL_PLAYERS.map(p=>[p.id,p.handicap]));
const numeric=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value);
function getPlayerIndex(data, playerId) {
  const value = data?.handicaps?.[playerId] ?? SEED_HANDICAPS[playerId];
  if (!numeric(value) || Number(value) < -20 || Number(value) > 54) throw new Error('Enter a valid handicap from -20 to 54. A negative value represents a plus handicap.');
  return Number(value);
}
function rawCourseHC(index, sessionId, teeSelections, playerId) {
  if(!numeric(index) || Number(index)<-20 || Number(index)>54) throw new Error('Invalid handicap index.');
  const td = TEE_DATA[sessionId];
  if (!td) throw new Error('Unknown course session.');
  const selected = teeSelections?.[sessionId];
  const teeIndex = (typeof selected === 'object' ? selected?.[playerId] : selected) ?? td.defaultTee;
  const tee = Number.isInteger(teeIndex) ? td.tees[teeIndex] : null;
  if (!tee || !Number.isFinite(tee.slope) || !Number.isFinite(tee.rating)) throw new Error('Choose a valid tee.');
  return Number(index) * tee.slope / 113 + tee.rating - td.par;
}
function getCourseHC(index, sessionId, teeSelections, playerId) {
  return Math.round(rawCourseHC(index, sessionId, teeSelections, playerId));
}
function allocateStrokes(strokes, indices) {
  if (!Number.isInteger(strokes) || Math.abs(strokes)>180 || indices.length!==18 || new Set(indices).size!==18 || indices.some(n=>!Number.isInteger(n)||n<1||n>18)) throw new Error('Invalid stroke allocation.');
  const count=Math.abs(strokes), sign=Math.sign(strokes), whole=Math.floor(count/18), extra=count%18;
  return new Map(indices.map((index,hole)=>[hole,sign*(whole+((sign<0?19-index:index)<=extra?1:0))]));
}
function getMatchStrokes(match, sessionId, data) {
  if(match.tbd) return {};
  const td=TEE_DATA[sessionId];
  if(!td) throw new Error('Unknown course session.');
  const count=match.type==='2v2'?2:match.type==='1v1'?1:0;
  const ids=[...match.usaPlayers,...match.euroPlayers];
  if(!count || match.usaPlayers.length!==count || match.euroPlayers.length!==count || new Set(ids).size!==ids.length || ids.some(id=>!getPlayer(id)) || match.usaPlayers.some(id=>getTeamForPlayer(id)!=='usa') || match.euroPlayers.some(id=>getTeamForPlayer(id)!=='europe')) throw new Error('Complete the pairings before calculating strokes.');
  const raw=Object.fromEntries(ids.map(id=>[id,rawCourseHC(getPlayerIndex(data,id),sessionId,data.teeSelections,id)]));
  const rules=settings.handicapping;
  const allowance=match.type==='2v2'?rules.betterBallAllowance:rules.singlesAllowance;
  if(!Number.isFinite(allowance)||allowance<=0||allowance>1||!['full-course','relative-match'].includes(rules.mode)) throw new Error('Invalid competition handicap rules.');
  const base=rules.mode==='relative-match'?Math.min(...Object.values(raw)):0;
  return Object.fromEntries(ids.map(id=>{
    const strokes=Math.round((raw[id]-base)*allowance);
    return [id,{courseHC:Math.round(raw[id]),strokes,strokeHoles:allocateStrokes(strokes,td.hcpIndex)}];
  }));
}
function scoreValue(value){
  if(!numeric(value) || (typeof value==='string'&&!/^\d+$/.test(value))) return null;
  const score=Number(value);return Number.isInteger(score)&&score>=1&&score<=30?score:null;
}
function computeMatchResult(match, sessionId, data) {
  if(match.tbd) return null;
  const strokes=getMatchStrokes(match,sessionId,data);
  const ids=[...match.usaPlayers,...match.euroPlayers];
  let lead=0;
  for(let hole=0;hole<18;hole++){
    const gross=Object.fromEntries(ids.map(id=>[id,scoreValue(data.playerScores?.[sessionId]?.[id]?.[hole])]));
    if(Object.values(gross).some(v=>v===null)) return null;
    const best=team=>Math.min(...team.map(id=>gross[id]-strokes[id].strokeHoles.get(hole)));
    const a=best(match.usaPlayers),b=best(match.euroPlayers);
    lead+=a<b?1:a>b?-1:0;
    const remaining=17-hole;
    if(remaining>0&&Math.abs(lead)>remaining) return {outcome:'win',winner:lead>0?'usa':'europe',margin:`${Math.abs(lead)}&${remaining}`};
  }
  return lead===0?{outcome:'halved',winner:null,margin:'All Square'}:{outcome:'win',winner:lead>0?'usa':'europe',margin:`${Math.abs(lead)}UP`};
}
function tryAutoCalcResults(sessionId, data) {
  let updated=null;
  for(const session of SCHEDULE.flatMap(day=>day.sessions)){
    if(session.id!==sessionId) continue;
    for(const original of session.matches){
      const match=applyPairings(original,data),old=data.matchResults?.[match.id];
      if(old && old.source!=='automatic') continue;
      const result=computeMatchResult(match,sessionId,data);
      const next=result?{...result,source:'automatic'}:null;
      if(JSON.stringify(old??null)===JSON.stringify(next)) continue;
      updated??={...(data.matchResults||{})};
      if(next) updated[match.id]=next;else delete updated[match.id];
    }
  }
  return updated;
}

// ─── Saturday Pairings Overlay ────────────────────────────────────────────────
function applyPairings(match, data) {
  if (!match.tbd) return match;
  const p = data.satPairings?.[match.id];
  if (!p) return match;
  const usa = p.usaPlayers?.length ? p.usaPlayers : match.usaPlayers;
  const europe = p.euroPlayers?.length ? p.euroPlayers : match.euroPlayers;
  const filled = usa.length > 0 && europe.length > 0;
  return { ...match, usaPlayers: usa, euroPlayers: europe, tbd: !filled };
}

// ─── Net Birdies Computation ──────────────────────────────────────────────────
function computeNetBirdies(data) {
  const results=[];
  for(const player of ALL_PLAYERS){
    let netBirdies=0,holesPlayed=0;
    for(const [sid,td] of Object.entries(TEE_DATA)){
      const scores=data.playerScores?.[sid]?.[player.id];if(!scores) continue;
      const strokes=allocateStrokes(getCourseHC(getPlayerIndex(data,player.id),sid,data.teeSelections,player.id),td.hcpIndex);
      scores.slice(0,18).forEach((raw,hole)=>{const value=scoreValue(raw);if(value===null)return;holesPlayed++;if(value-strokes.get(hole)<td.pars[hole])netBirdies++;});
    }
    if(holesPlayed)results.push({id:player.id,name:player.short,team:getTeamForPlayer(player.id),netBirdies,holesPlayed,rate:(netBirdies/holesPlayed*100).toFixed(1)});
  }
  return results.sort((a,b)=>b.netBirdies-a.netBirdies||Number(b.rate)-Number(a.rate));
}

// ─── Fun Stats ────────────────────────────────────────────────────────────────
function computeFunStats(data) {
  const stats = [];
  const allScores = []; // {pid, sid, hole, score, par, name}

  Object.entries(TEE_DATA).forEach(([sid, td]) => {
    ALL_PLAYERS.forEach(p => {
      const scores = data.playerScores?.[sid]?.[p.id];
      if (!scores) return;
      scores.slice(0,18).forEach((raw, hi) => {
        const v = scoreValue(raw);
        if (isNaN(v) || v <= 0) return;
        allScores.push({ pid: p.id, sid, hole: hi + 1, score: v, par: td.pars[hi], name: p.short, course: td.courseName, team: getTeamForPlayer(p.id) });
      });
    });
  });

  if (!allScores.length) return stats;

  // Aggregate per player per round
  const rounds = {};
  allScores.forEach(s => {
    const key = JSON.stringify([s.pid,s.sid]);
    if (!rounds[key]) rounds[key] = { pid: s.pid, sid: s.sid, name: s.name, course: s.course, team: s.team, scores: Array(18).fill(null), pars: TEE_DATA[s.sid].pars };
    rounds[key].scores[s.hole-1]=s.score;
  });
  const fullRounds = Object.values(rounds).filter(r => r.scores.every(v=>v!==null));

  // Per player aggregates
  const playerStats = {};
  allScores.forEach(s => {
    if (!playerStats[s.pid]) playerStats[s.pid] = { id:s.pid, name: s.name, team: s.team, scores: [], pars: [], diffs: [], birdies: 0, pars_count: 0, bogeys: 0, others: 0, eagles: 0 };
    const ps = playerStats[s.pid];
    ps.scores.push(s.score);
    ps.pars.push(s.par);
    const d = s.score - s.par;
    ps.diffs.push(d);
    if (d <= -2) ps.eagles++;
    if (d === -1) ps.birdies++;
    if (d === 0) ps.pars_count++;
    if (d === 1) ps.bogeys++;
    if (d >= 2) ps.others++;
  });

  // Hole aggregates
  const holeStats = {};
  allScores.forEach(s => {
    const key = `${s.sid}-${s.hole}`;
    if (!holeStats[key]) holeStats[key] = { hole: s.hole, course: s.course, par: s.par, diffs: [] };
    holeStats[key].diffs.push(s.score - s.par);
  });

  // --- SCORING ---
  if (fullRounds.length) {
    const byGross = [...fullRounds].sort((a, b) => a.scores.reduce((s, v) => s + v, 0) - b.scores.reduce((s, v) => s + v, 0));
    const best = byGross[0]; const bestTot = best.scores.reduce((s, v) => s + v, 0);
    stats.push({ emoji: "🏅", title: "Best Gross Round", detail: `${best.name} at ${best.course}`, value: bestTot });
    const worst = byGross[byGross.length - 1]; const worstTot = worst.scores.reduce((s, v) => s + v, 0);
    stats.push({ emoji: "💀", title: "Worst Gross Round", detail: `${worst.name} at ${worst.course}`, value: worstTot });

    const withNet = fullRounds.filter(r => r.scores.length >= 18).map(r => {
      const idx = getPlayerIndex(data,r.pid);
      const ch = getCourseHC(idx, r.sid, data.teeSelections, r.pid);
      return { ...r, net: r.scores.reduce((s, v) => s + v, 0) - ch };
    }).sort((a, b) => a.net - b.net);
    if (withNet[0]) stats.push({ emoji: "🎯", title: "Best Net Round", detail: `${withNet[0].name} at ${withNet[0].course}`, value: withNet[0].net });

  }
  // A completed nine has value even while the other nine is still blank.
  for(const [start,label] of [[0,'Best Front 9'],[9,'Best Back 9']]){
    const nines=Object.values(rounds).filter(r=>r.scores.slice(start,start+9).every(v=>v!==null)).map(r=>({...r,total:r.scores.slice(start,start+9).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.total-b.total);
    if(nines[0])stats.push({emoji:start?'⚡':'🔥',title:label,detail:`${nines[0].name} at ${nines[0].course}`,value:nines[0].total});
  }

  // Hardest/easiest hole
  const holeEntries = Object.values(holeStats).filter(h => h.diffs.length >= 2);
  if (holeEntries.length) {
    const byAvg = [...holeEntries].sort((a, b) => {
      const aAvg = a.diffs.reduce((s, v) => s + v, 0) / a.diffs.length;
      const bAvg = b.diffs.reduce((s, v) => s + v, 0) / b.diffs.length;
      return bAvg - aAvg;
    });
    const hard = byAvg[0]; const hardAvg = (hard.diffs.reduce((s, v) => s + v, 0) / hard.diffs.length + hard.par).toFixed(1);
    stats.push({ emoji: "😈", title: "Hardest Hole", detail: `#${hard.hole} ${hard.course} (Par ${hard.par})`, value: `${hardAvg} avg` });
    const easy = byAvg[byAvg.length - 1]; const easyAvg = (easy.diffs.reduce((s, v) => s + v, 0) / easy.diffs.length + easy.par).toFixed(1);
    stats.push({ emoji: "😇", title: "Easiest Hole", detail: `#${easy.hole} ${easy.course} (Par ${easy.par})`, value: `${easyAvg} avg` });
  }

  // --- PATTERNS ---
  const pEntries = Object.values(playerStats).filter(p => p.scores.length >= 9);
  if (pEntries.length) {
    const byPars = [...pEntries].sort((a, b) => b.pars_count - a.pars_count);
    stats.push({ emoji: "🎳", title: "Most Pars", detail: byPars[0].name, value: byPars[0].pars_count });
    const byBirdies = [...pEntries].sort((a, b) => b.birdies - a.birdies);
    stats.push({ emoji: "🐦", title: "Most Birdies", detail: byBirdies[0].name, value: byBirdies[0].birdies });
    const byBogeys = [...pEntries].sort((a, b) => b.bogeys - a.bogeys);
    stats.push({ emoji: "😬", title: "Most Bogeys", detail: byBogeys[0].name, value: byBogeys[0].bogeys });
    const byOthers = [...pEntries].sort((a, b) => b.others - a.others);
    stats.push({ emoji: "🤯", title: "Most Others (2+ Over)", detail: byOthers[0].name, value: byOthers[0].others });

    const eagles = pEntries.filter(p => p.eagles > 0).sort((a, b) => b.eagles - a.eagles);
    if (eagles.length) stats.push({ emoji: "🦅", title: "Eagle Club", detail: eagles.map(p => p.name).join(", "), value: eagles[0].eagles });

    // Longest par streak
    let longestPar = { name: "", streak: 0 };
    pEntries.forEach(p => {
      for(const round of Object.values(rounds).filter(r=>r.pid===p.id)){
        let cur=0;
        round.scores.forEach((score,hole)=>{if(score!==null&&score===round.pars[hole]){cur++;if(cur>longestPar.streak)longestPar={name:p.name,streak:cur};}else cur=0;});
      }
    });
    if (longestPar.streak >= 2) stats.push({ emoji: "📏", title: "Longest Par Streak", detail: longestPar.name, value: `${longestPar.streak} holes` });

    // Most consistent (lowest σ)
    const withStdDev = pEntries.filter(p => p.diffs.length >= 9).map(p => {
      const mean = p.diffs.reduce((s, v) => s + v, 0) / p.diffs.length;
      const variance = p.diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / p.diffs.length;
      return { ...p, sigma: Math.sqrt(variance) };
    }).sort((a, b) => a.sigma - b.sigma);
    if (withStdDev[0]) stats.push({ emoji: "🧘", title: "Most Consistent", detail: `${withStdDev[0].name} (σ = ${withStdDev[0].sigma.toFixed(2)})`, value: `σ ${withStdDev[0].sigma.toFixed(2)}` });
  }

  // --- EXTREMES ---
  if (allScores.length) {
    const bestHole = [...allScores].sort((a, b) => (a.score - a.par) - (b.score - b.par))[0];
    stats.push({ emoji: "🌟", title: "Best Single Hole", detail: `${bestHole.name}; #${bestHole.hole} ${bestHole.course}`, value: `${bestHole.score} (${bestHole.score - bestHole.par >= 0 ? "+" : ""}${bestHole.score - bestHole.par})` });
    const worstHole = [...allScores].sort((a, b) => (b.score - b.par) - (a.score - a.par))[0];
    const wd=worstHole.score-worstHole.par;
    stats.push({ emoji: "💣", title: "Worst Single Hole", detail: `${worstHole.name}; #${worstHole.hole} ${worstHole.course}`, value: `${worstHole.score} (${wd>=0?"+":""}${wd})` });
  }

  // Biggest comeback (front→back improvement)
  if (fullRounds.filter(r => r.scores.length >= 18).length) {
    const comebacks = fullRounds.filter(r => r.scores.length >= 18).map(r => {
      const f9 = r.scores.slice(0, 9).reduce((s, v) => s + v, 0) - r.pars.slice(0, 9).reduce((s, v) => s + v, 0);
      const b9 = r.scores.slice(9, 18).reduce((s, v) => s + v, 0) - r.pars.slice(9, 18).reduce((s, v) => s + v, 0);
      return { ...r, improvement: f9 - b9 };
    }).sort((a, b) => b.improvement - a.improvement);
    if (comebacks[0] && comebacks[0].improvement > 0) stats.push({ emoji: "📈", title: "Biggest Comeback", detail: `${comebacks[0].name} at ${comebacks[0].course}`, value: `${comebacks[0].improvement} better` });
  }

  // --- TEAMS ---
  const usaScores = allScores.filter(s => s.team === "usa");
  const euroScores = allScores.filter(s => s.team === "europe");
  if (usaScores.length && euroScores.length) {
    const usaAvg = (usaScores.reduce((s, v) => s + v.score - v.par, 0) / usaScores.length).toFixed(2);
    const euroAvg = (euroScores.reduce((s, v) => s + v.score - v.par, 0) / euroScores.length).toFixed(2);
    stats.push({ emoji: TEAMS.usa.flag, title: `${TEAMS.usa.name} Avg vs Par`, detail: `${usaScores.length} holes played`, value: `${usaAvg>=0?"+":""}${usaAvg}` });
    stats.push({ emoji: TEAMS.europe.flag, title: `${TEAMS.europe.name} Avg vs Par`, detail: `${euroScores.length} holes played`, value: `${euroAvg>=0?"+":""}${euroAvg}` });
    const usaBirdies = usaScores.filter(s => s.score < s.par).length;
    const euroBirdies = euroScores.filter(s => s.score < s.par).length;
    stats.push({ emoji: "🐦", title: `${TEAMS.usa.name} Birdie Count`, detail: `${usaScores.length} holes`, value: usaBirdies });
    stats.push({ emoji: "🐦", title: `${TEAMS.europe.name} Birdie Count`, detail: `${euroScores.length} holes`, value: euroBirdies });
  }

  // --- COURSE RECORDS ---
  if (fullRounds.length) {
    const byCourse = {};
    fullRounds.forEach(r => {
      const tot = r.scores.reduce((s, v) => s + v, 0);
      const courseId=TEE_DATA[r.sid].id;
      if (!byCourse[courseId] || tot < byCourse[courseId].total) byCourse[courseId] = { name: r.name, total: tot, course: r.course };
    });
    Object.values(byCourse).forEach(rec => {
      stats.push({ emoji: "🏆", title: `Best at ${rec.course}`, detail: rec.name, value: rec.total });
    });
  }

  // --- MATCHES ---
  const matchResults = Object.entries(data.matchResults||{});
  if (matchResults.length >= 2) {
    const allMatches = [];
    SCHEDULE.forEach(d => d.sessions.forEach(s => s.matches.forEach(m_raw => {
      const m = applyPairings(m_raw, data);
      const r = data.matchResults[m.id];
      if (!r) return;
      const un = m.usaPlayers.map(id => getPlayer(id)?.short).join(" & ");
      const an = m.euroPlayers.map(id => getPlayer(id)?.short).join(" & ");
      allMatches.push({ ...r, usa: un, europe: an, id: m.id });
    })));
    const competitive = allMatches.filter(m => m.margin);
    if (competitive.length) {
      const sorted = competitive.filter(m => m.margin !== "All Square").sort((a, b) => {
        const parseM = m => { const n = parseInt(m); return isNaN(n) ? 0 : n; };
        return parseM(a.margin) - parseM(b.margin);
      });
      if (sorted.length) {
        stats.push({ emoji: "🤝", title: "Most Competitive", detail: `${sorted[0].usa} vs ${sorted[0].europe}`, value: sorted[0].margin });
        if (sorted.length >= 2) {
          const blowout = sorted[sorted.length - 1];
          stats.push({ emoji: "💨", title: "Biggest Blowout", detail: `${blowout.usa} vs ${blowout.europe}`, value: blowout.margin });
        }
      }
    }
  }

  // --- FUN ---
  if (pEntries.length) {
    // Par-3 / Par-5 King
    const par3Scores = {};
    const par5Scores = {};
    allScores.forEach(s => {
      if (s.par === 3) { if (!par3Scores[s.pid]) par3Scores[s.pid] = { name: s.name, total: 0, count: 0 }; par3Scores[s.pid].total += s.score - s.par; par3Scores[s.pid].count++; }
      if (s.par === 5) { if (!par5Scores[s.pid]) par5Scores[s.pid] = { name: s.name, total: 0, count: 0 }; par5Scores[s.pid].total += s.score - s.par; par5Scores[s.pid].count++; }
    });
    const p3 = Object.values(par3Scores).filter(p => p.count >= 2).sort((a, b) => (a.total / a.count) - (b.total / b.count));
    if (p3[0]) stats.push({ emoji: "🎯", title: "Par-3 King", detail: `${p3[0].name} (${p3[0].count} holes)`, value: `${(p3[0].total / p3[0].count + 3).toFixed(1)} avg` });
    const p5 = Object.values(par5Scores).filter(p => p.count >= 2).sort((a, b) => (a.total / a.count) - (b.total / b.count));
    if (p5[0]) stats.push({ emoji: "💪", title: "Par-5 King", detail: `${p5[0].name} (${p5[0].count} holes)`, value: `${(p5[0].total / p5[0].count + 5).toFixed(1)} avg` });

    // Feast or Famine (highest σ)
    const withStdDev = pEntries.filter(p => p.diffs.length >= 9).map(p => {
      const mean = p.diffs.reduce((s, v) => s + v, 0) / p.diffs.length;
      const variance = p.diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / p.diffs.length;
      return { ...p, sigma: Math.sqrt(variance) };
    }).sort((a, b) => b.sigma - a.sigma);
    if (withStdDev[0]) stats.push({ emoji: "🎰", title: "Feast or Famine", detail: `${withStdDev[0].name} (highest σ)`, value: `σ ${withStdDev[0].sigma.toFixed(2)}` });

    // Birdie Machine
    const byBirdieRate = pEntries.filter(p => p.scores.length >= 9).map(p => ({ ...p, rate: p.birdies / (p.scores.length / 18) })).sort((a, b) => b.rate - a.rate);
    if (byBirdieRate[0]) stats.push({ emoji: "🤖", title: "Birdie Machine", detail: `${byBirdieRate[0].name}`, value: `${byBirdieRate[0].rate.toFixed(1)}/rd` });
  }

  return stats;
}

// ─── Sandbagger Index ────────────────────────────────────────────────────────
function normalCDF(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const sign=x<0?-1:1;const ax=Math.abs(x)/Math.sqrt(2);const t=1/(1+p*ax);const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);return 0.5*(1+sign*y)}

function computeSandbaggerData(data){
  const results=[];
  ALL_PLAYERS.forEach(p=>{
    const pid=p.id;
    const index=getPlayerIndex(data,pid);
    const rounds=[];
    Object.entries(TEE_DATA).forEach(([sid,td])=>{
      const scores=data.playerScores?.[sid]?.[pid];
      if(!scores) return;
      const filled=scores.slice(0,18).map((v,i)=>({v:scoreValue(v),i})).filter(x=>x.v!==null);
      if(filled.length<18) return;
      const grossScore=filled.reduce((s,x)=>s+x.v,0);
      const sessionSel=data.teeSelections?.[sid];
      const teeIdx=(typeof sessionSel==='object'?sessionSel?.[pid]:sessionSel)??td.defaultTee;
      const tee=td.tees[teeIdx];
      if(!tee) return;
      const courseHC=getCourseHC(index,sid,data.teeSelections,pid);
      const netScore=grossScore-courseHC;
      const par=td.par;
      const netVsPar=netScore-par;
      // Expected gross = Rating + (Index + avgDiffBuffer) * Slope / 113
      // avgDiffBuffer = ~3 strokes (typical gap between index and average differential)
      const expectedGross=tee.rating+(index+3)*tee.slope/113;
      const diff=expectedGross-grossScore; // positive = beat expectations
      const sigma=3.0*tee.slope/113;
      const z=diff/sigma;
      // Tail probability: how unlikely was this performance in whichever direction?
      // Beat expectations (z>0): P(shooting this well or better) = upper tail
      // Missed expectations (z<0): P(shooting this poorly or worse) = lower tail
      const tailProb=1-normalCDF(Math.abs(z));
      const oneInX=tailProb>0.001?Math.round(1/tailProb):999;
      // Differential (GHIN-style)
      const ghinDiff=Math.round(((grossScore-tee.rating)*113/tee.slope)*10)/10;
      rounds.push({sid,course:td.courseName,gross:grossScore,expected:Math.round(expectedGross*10)/10,courseHC,net:netScore,par,netVsPar,diff:Math.round(diff*10)/10,ghinDiff,z,odds:tailProb,oneInX,teeName:tee.tee});
    });
    if(!rounds.length) return;
    const avgPerf=rounds.reduce((s,r)=>s+r.diff,0)/rounds.length;
    const avgNetVsPar=rounds.reduce((s,r)=>s+r.netVsPar,0)/rounds.length;
    const combinedProb=rounds.reduce((s,r)=>s*r.odds,1);
    const combinedOneInX=combinedProb>0.001?Math.round(1/combinedProb):999;
    const bestDiff=Math.max(...rounds.map(r=>r.diff));
    let verdict,verdictColor;
    if(avgPerf>6){verdict="FBI Most Wanted";verdictColor="#dc2626"}
    else if(avgPerf>4){verdict="Under Investigation";verdictColor="#dc2626"}
    else if(avgPerf>2){verdict="Prime Suspect";verdictColor="#ea580c"}
    else if(avgPerf>0){verdict="Suspiciously Good";verdictColor="#ca8a04"}
    else if(avgPerf>-2){verdict="Playing Honest";verdictColor="#16a34a"}
    else if(avgPerf>-4){verdict="Handicap Challenged";verdictColor="#2563eb"}
    else{verdict="Golf is Hard";verdictColor="#7c3aed"}
    results.push({id:pid,name:p.short,team:getTeamForPlayer(pid),index,rounds,avgPerformance:Math.round(avgPerf*10)/10,avgNetVsPar:Math.round(avgNetVsPar*10)/10,bestDiff:Math.round(bestDiff*10)/10,combinedOneInX,verdict,verdictColor});
  });
  return results.sort((a,b)=>b.avgPerformance-a.avgPerformance);
}

// ─── Settlement Algorithm ─────────────────────────────────────────────────────
function computeBalances(expenses, allPlayerIds) {
  if(new Set(allPlayerIds).size!==allPlayerIds.length)throw new Error('Duplicate player IDs.');
  const balances=Object.fromEntries(allPlayerIds.map(id=>[id,0]));
  for(const expense of expenses){
    const split=expense.splitAmong;
    const value=Number(expense.amount),cents=Math.round(value*100);
    if(!numeric(expense.amount)||!Number.isFinite(value)||value<=0||cents>1_000_000_000||Math.abs(value*100-cents)>1e-7||!Object.hasOwn(balances,expense.paidBy)||!Array.isArray(split)||!split.length||new Set(split).size!==split.length||split.some(id=>!Object.hasOwn(balances,id)))throw new Error('Expense needs a valid payer, unique split participants and a positive whole-cent amount.');
    balances[expense.paidBy]+=cents;
    const ordered=[...split].sort(),share=Math.floor(cents/ordered.length),remainder=cents%ordered.length;
    ordered.forEach((id,i)=>{balances[id]-=share+(i<remainder?1:0);});
  }
  if(Object.values(balances).some(v=>!Number.isSafeInteger(v)))throw new Error('Expense total is too large.');
  return balances;
}
function computeSettlements(expenses, allPlayerIds) {
  const balances=computeBalances(expenses,allPlayerIds);
  const sorted=sign=>Object.entries(balances).filter(([,amount])=>amount*sign>0).map(([id,amount])=>({id,amount:amount*sign})).sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id));
  const creditors=sorted(1),debtors=sorted(-1),transfers=[];
  let c=0,d=0;
  while(c<creditors.length&&d<debtors.length){
    const cents=Math.min(creditors[c].amount,debtors[d].amount);
    transfers.push({from:debtors[d].id,to:creditors[c].id,amount:cents/100});
    creditors[c].amount-=cents;debtors[d].amount-=cents;
    if(creditors[c].amount===0)c++;if(debtors[d].amount===0)d++;
  }
  return transfers.sort((a,b)=>b.amount-a.amount||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
}


return {getCourseHC,getMatchStrokes,computeMatchResult,tryAutoCalcResults,applyPairings,computeNetBirdies,computeFunStats,computeSandbaggerData,computeBalances,computeSettlements,getPlayerIndex,allocateStrokes,rawCourseHC,scoreValue};
}
