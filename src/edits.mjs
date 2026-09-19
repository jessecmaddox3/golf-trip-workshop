import {scoreValue} from './engine.mjs';
export function setPlayerTee(config,data,sessionId,playerId,index){
 const session=config.schedule.flatMap(d=>d.sessions).find(s=>s.id===sessionId);
 if(!session?.isCompetitive||!session.participants.includes(playerId))throw new Error('Choose a participant in this session.');
 const course=config.courses[session.courseId];if(!Number.isInteger(index)||index<0||index>=course.tees.length)throw new Error('Choose a known tee.');
 const previous=data.teeSelections[sessionId];
 const perPlayer=typeof previous==='number'?Object.fromEntries(session.participants.map(id=>[id,previous])):{...previous};
 return {...data,teeSelections:{...data.teeSelections,[sessionId]:{...perPlayer,[playerId]:index}}};
}
export function playedTotals(scores,strokeHoles=new Map()){
 let gross=0,strokes=0,thru=0;
 scores.slice(0,18).forEach((raw,i)=>{const v=scoreValue(raw);if(Number.isFinite(v)&&v>0){gross+=v;strokes+=strokeHoles.get(i)||0;thru++;}});
 return {gross,net:gross-strokes,thru,strokes};
}
export function removeManualOverride(data,matchId){
 if(data.matchResults[matchId]?.source!=='manual')return data;
 const results={...data.matchResults};delete results[matchId];return {...data,matchResults:results};
}
