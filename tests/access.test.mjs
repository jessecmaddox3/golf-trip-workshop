import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.mjs';
import {createAccessFile,changeAccess,productionOrigin} from '../server/access.mjs';
import {tokenHash} from '../server/app.mjs';
test('every participant receives a distinct high-entropy link and revocation is scoped',()=>{
 const f=createAccessFile(config,'https://golf.example.invalid'),hashes=new Set();
 for(const [id,link] of Object.entries(f.links)){const token=new URL(link.url).searchParams.get('access');assert.equal(token.length,43);assert.equal(tokenHash(token),f.actors[id].tokenHash);hashes.add(token);}
 assert.equal(hashes.size,10);const revoked=changeAccess(f,'p01','revoke');assert.equal(revoked.actors.p01.disabled,true);assert.equal(revoked.links.p01,undefined);assert.deepEqual(revoked.actors.p02,f.actors.p02);
 const rotated=changeAccess(revoked,'p01','rotate','https://golf.example.invalid');assert.equal(rotated.actors.p01.disabled,false);assert.notEqual(rotated.actors.p01.sessionVersion,f.actors.p01.sessionVersion);assert.notEqual(rotated.actors.p01.tokenHash,f.actors.p01.tokenHash);
});
test('origin refuses credential-bearing, insecure and path-based configuration',()=>{
 for(const v of ['http://golf.example.invalid','https://user:secret@golf.example.invalid','https://golf.example.invalid/path','https://golf.example.invalid/?private=value'])assert.throws(()=>productionOrigin(v));
 assert.equal(productionOrigin('https://golf.example.invalid/'),'https://golf.example.invalid');
});
