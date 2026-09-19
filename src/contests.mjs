import {createEngine} from './engine-core.mjs';
export function contestSummary(config,state){
 const players=Object.values(config.teams).flatMap(t=>t.players),matches=config.schedule.flatMap(d=>d.sessions).flatMap(s=>s.matches),points={usa:0,europe:0};
 for(const match of matches){const r=state.matchResults[match.id];if(r?.outcome==='halved'){points.usa+=.5;points.europe+=.5;}else if(r?.outcome==='win')points[r.winner]++;}
 const complete=matches.every(m=>state.matchResults[m.id]),winners=!complete?[]:points.usa===points.europe?players:config.teams[points.usa>points.europe?'usa':'europe'].players;
 const payouts={};if(winners.length){const cents=Math.round(config.contests.teamPot*100),ids=winners.map(p=>p.id).sort();ids.forEach((id,i)=>payouts[id]=(Math.floor(cents/ids.length)+(i<cents%ids.length?1:0))/100);}
 const closest=players.map(p=>({id:p.id,name:p.short,holes:Object.values(state.ctpResults).filter(v=>v.player===p.id).length})).filter(p=>p.holes).sort((a,b)=>b.holes-a.holes||a.id.localeCompare(b.id)).map(p=>({...p,payout:Math.round(p.holes*config.contests.ctpPerHole*100)/100}));
 return {complete,points,teamPayouts:payouts,closest,birdies:createEngine(config).computeNetBirdies(state)};
}
