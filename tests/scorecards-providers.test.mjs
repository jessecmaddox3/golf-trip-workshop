import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReading,convertScores} from '../src/scorecards.mjs';
import {geminiReader,nwsWeather} from '../server/providers.mjs';
const scores=()=>Array(18).fill(0),response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('unreadable cells stay blank and relative notation converts once',()=>{
 const raw=scores();raw[0]=null;raw[1]=-1;
 const result=convertScores(raw,'relative',Array(18).fill(4));assert.equal(result[0],'');assert.equal(result[1],'3');assert.equal(result[2],'4');assert.deepEqual(raw.slice(0,3),[null,-1,0]);
 assert.throws(()=>convertScores(raw,'unknown',Array(18).fill(4)));
});
test('malformed provider values cannot become zeros or truncated scorecards',()=>{
 for(const bad of [Array(17).fill(4),Array(19).fill(4),[true,...Array(17).fill(4)],['-',...Array(17).fill(4)]])assert.throws(()=>validateReading({notation:'strokes',players:[{name:'Invented',scores:bad}]}));
 assert.throws(()=>validateReading({notation:'strokes',players:[{name:'Invented',scores:scores()}]}));
});
test('Gemini adapter sends a header key to its fixed host, and validates exact structured output',async()=>{
 const calls=[],reading={notation:'relative',players:[{name:'Invented Player',scores:scores()}]};
 const adapter=geminiReader({GEMINI_API_KEY:'invented-not-a-secret',GEMINI_MODEL:'synthetic-test-model',GOLF_OCR_DAILY_LIMIT:'3'},async(url,options)=>{calls.push({url,options});return response({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(reading)}]}}]});});
 assert.deepEqual(await adapter.read({mime:'image/png',data:'invented'},['Invented Player']),reading);
 assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).hostname,'generativelanguage.googleapis.com');assert.equal(new URL(calls[0].url).search,'');assert.equal(calls[0].options.headers['x-goog-api-key'],'invented-not-a-secret');assert.equal(calls[0].options.redirect,'error');
});
test('invalid provider configuration fails before any network call',()=>{
 let calls=0;const fetcher=()=>calls++;
 assert.throws(()=>geminiReader({GEMINI_API_KEY:'invented'},fetcher));
 assert.throws(()=>nwsWeather({GOLF_NWS_OFFICE:'../../private',GOLF_NWS_GRID_X:'1',GOLF_NWS_GRID_Y:'2'},fetcher));assert.equal(calls,0);
});
test('truncated Gemini output is rejected without salvage or token coercion',async()=>{
 const adapter=geminiReader({GEMINI_API_KEY:'invented',GEMINI_MODEL:'synthetic'},async()=>response({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}));
 await assert.rejects(adapter.read({mime:'image/png',data:'invented'},[]),/complete/);
});
test('weather reuses its own cache and failed refresh retains labelled old data',async()=>{
 let calls=0,time=0,fail=false;
 const forecast={properties:{periods:[{startTime:'2030-05-07T08:00:00Z',endTime:'2030-05-07T09:00:00Z',temperature:20,temperatureUnit:'C',windSpeed:'5 mph',windDirection:'SW',shortForecast:'Cloudy',probabilityOfPrecipitation:{value:null}}]}};
 const read=nwsWeather({GOLF_NWS_OFFICE:'TOP',GOLF_NWS_GRID_X:'31',GOLF_NWS_GRID_Y:'80'},async()=>{calls++;if(fail)throw new Error('offline');return response(forecast);},()=>time);
 const first=await read();assert.equal(first.hourly.data.properties.periods[0].temperature,68);assert.equal(calls,2);await read();assert.equal(calls,2);
 time=31*60*1000;fail=true;const stale=await read();assert.equal(stale.stale,true);assert.deepEqual(stale.hourly,first.hourly);assert.equal(calls,4);
});
