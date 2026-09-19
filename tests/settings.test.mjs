import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadSettings,buildManifest,verifyBuild} from '../server/settings.mjs';
test('demo ignores production configuration paths and remains invented',async()=>{
 const settings=await loadSettings({GOLF_MODE:'demo',GOLF_CONFIG:'/does-not-exist',GOLF_POLL_CONFIG:'/does-not-exist',GOLF_PROPOSALS_CONFIG:'/does-not-exist'});
 assert.equal(settings.tournament.demo.fictional,true);assert.equal(settings.proposals.fictional,true);
});
test('private settings bind the browser build and poll to the actual event',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'golf-settings-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const demo=await loadSettings({}),custom=structuredClone(demo.tournament);custom.event.name='Another invented event';
 const file=join(dir,'tournament.json');await writeFile(file,JSON.stringify(custom));
 const settings=await loadSettings({GOLF_MODE:'production',GOLF_CONFIG:file});assert.equal(settings.tournament.event.name,custom.event.name);assert.notEqual(settings.configHash,demo.configHash);
 await writeFile(join(dir,'workshop-build.json'),JSON.stringify(buildManifest(demo)));await assert.rejects(verifyBuild(settings,dir),/does not match/);
 await writeFile(join(dir,'workshop-build.json'),JSON.stringify(buildManifest(settings)));await verifyBuild(settings,dir);
 const poll=structuredClone(demo.poll);poll.bases[0].id='unknown-proposal';const pf=join(dir,'poll.json');await writeFile(pf,JSON.stringify(poll));await assert.rejects(loadSettings({GOLF_MODE:'production',GOLF_POLL_CONFIG:pf}),/match a configured proposal/);
});
