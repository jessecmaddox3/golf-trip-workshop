import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.mjs';
import {validateConfig} from '../src/schema.mjs';
test('display calendar follows the event timezone and actual timestamps',()=>{
 const value=structuredClone(config);value.event.timezone='America/New_York';const day=value.schedule[0];day.day='Wrong weekday';day.date='Wrong date';day.sessions[0].time='Wrong time';day.sessions[0].start=day.isoDate+'T08:30:00-04:00';
 const parsed=validateConfig(value);assert.equal(parsed.schedule[0].day,'Monday');assert.equal(parsed.schedule[0].date,'May 6');assert.equal(parsed.schedule[0].sessions[0].time,'8:30 AM');
});
test('an event must include the full five-hour interval of its final session',()=>{
 const value=structuredClone(config),last=value.schedule.at(-1).sessions.at(-1);value.event.endsAt=new Date(Date.parse(last.start)+60000).toISOString();
 assert.throws(()=>validateConfig(value),/session must finish within the event/);
});
