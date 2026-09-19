export const SESSION_DURATION_HOURS=5;
export const sessionEnd=start=>new Date(Date.parse(start)+SESSION_DURATION_HOURS*3600000).toISOString();
export function calendarLabels(schedule,timezone){
 const weekday=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}),date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),time=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:timezone});
 return schedule.map(day=>({...day,day:weekday.format(new Date(day.isoDate+'T12:00:00Z')),date:date.format(new Date(day.isoDate+'T12:00:00Z')),sessions:day.sessions.map(session=>({...session,time:time.format(new Date(session.start))}))}));
}
