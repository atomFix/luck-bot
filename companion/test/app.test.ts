import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {Companion} from '../src/app.js';import {SettingsStore} from '../src/local/settings.js';
test('daemon refuses unpaired control and never claims a missing provider is available',async()=>{const dir=await mkdtemp(join(tmpdir(),'re-app-'));try{
 const app=new Companion(new SettingsStore(dir),{get:async()=>null,set:async()=>{},delete:async()=>{}});await app.initialize();
 await assert.rejects(app.action('react',{device_id:'unknown',emotion:'happy',hold_ms:1200}),/device_offline/);
 await assert.rejects(app.action('shell',{}),/unknown_action/);assert.equal((await app.state()).connected,false);
}finally{await rm(dir,{recursive:true,force:true});}});
