import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {Companion} from '../src/app.js';import {SettingsStore} from '../src/local/settings.js';
test('daemon refuses unpaired control and never claims a missing provider is available',async()=>{const dir=await mkdtemp(join(tmpdir(),'re-app-'));try{
 const app=new Companion(new SettingsStore(dir),{get:async()=>null,set:async()=>{},delete:async()=>{}});await app.initialize();
 await assert.rejects(app.action('react',{device_id:'unknown',emotion:'happy',hold_ms:1200}),/device_offline/);
 await assert.rejects(app.action('shell',{}),/unknown_action/);assert.equal((await app.state()).connected,false);
}finally{await rm(dir,{recursive:true,force:true});}});
test('speaker operations remain local UI only and disabled background survives initialization',async()=>{const dir=await mkdtemp(join(tmpdir(),'speaker-app-'));try{const app=new Companion(new SettingsStore(dir),{get:async()=>null,set:async()=>{},delete:async()=>{}});await app.initialize();assert.equal((await app.state()).speaker.state,'unavailable');await assert.rejects(app.action('speaker',{}),/unknown_action/);await assert.rejects(app.speakerAction('enroll-start',{name:'owner'}),/speaker_unavailable/);}finally{await rm(dir,{recursive:true,force:true});}});
