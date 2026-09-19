export function wxEmoji(text=''){const s=text.toLowerCase();return s.includes('thunder')?'⛈️':s.includes('rain')||s.includes('shower')?'🌦️':s.includes('cloud')?'⛅':'☀️';}
export function getSessionWeather(data,session){
 const periods=(data?.properties?.periods??[]).filter(p=>Date.parse(p.startTime)<Date.parse(session.end)&&Date.parse(p.endTime)>Date.parse(session.start));
 if(!periods.length)return null;
 const temps=periods.map(p=>p.temperature),winds=periods.map(p=>Math.max(...(String(p.windSpeed).match(/\d+(?:\.\d+)?/g)??['0']).map(Number)));
 return {periods,tempRange:[Math.min(...temps),Math.max(...temps)],avgWind:Math.round(winds.reduce((a,b)=>a+b,0)/winds.length),maxWind:Math.max(...winds),windDir:periods[0].windDirection,maxPrecipChance:Math.max(...periods.map(p=>p.probabilityOfPrecipitation?.value??0)),conditions:periods[Math.floor(periods.length/2)].shortForecast};
}
export function inventedWeather(config){
 const hours=[],daily=[];let i=0;
 for(const day of config.schedule){
  for(const session of day.sessions){for(let h=0;h<5;h++){const start=new Date(Date.parse(session.start)+h*3600000);hours.push({number:i++,startTime:start.toISOString(),endTime:new Date(+start+3600000).toISOString(),temperature:62+h*3,temperatureUnit:'F',windSpeed:`${4+h} mph`,windDirection:'SW',probabilityOfPrecipitation:{value:h===4?25:10},shortForecast:h===4?'Chance of showers':'Partly cloudy',isDaytime:true});}}
  for(const isDaytime of [true,false])daily.push({number:i++,name:day.day+(isDaytime?'':' Night'),startTime:day.isoDate+(isDaytime?'T08:00:00Z':'T20:00:00Z'),endTime:day.isoDate+'T23:59:00Z',isDaytime,temperature:isDaytime?76:57,temperatureUnit:'F',windSpeed:'5 to 9 mph',windDirection:'SW',probabilityOfPrecipitation:{value:20},shortForecast:'Partly cloudy',detailedForecast:'Invented forecast: mild temperatures, a light breeze and an afternoon shower possibility.'});
 }
 return {available:true,fictional:true,lastRefresh:config.event.demoNow,forecast:{data:{properties:{periods:daily}}},hourly:{data:{properties:{periods:hours}}},afd:{issuedAt:config.event.demoNow,summary:'This is invented weather for exploring the planner. The first few hours look comfortable in this example, with a small shower possibility later. For a real event, check current conditions and follow the course staff’s directions.',raw:'INVENTED FORECAST DISCUSSION\n\nNo live forecast was downloaded. This text demonstrates the discussion panel and its longer raw-source view.',source:'Invented demo',summaryLabel:'Written demo summary'}};
}
