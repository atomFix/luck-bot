import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {SettingsStore} from '../src/local/settings.js';
test('settings persist supplier choices atomically and reject secret fields',async()=>{const dir=await mkdtemp(join(tmpdir(),'re-settings-'));try{
 const store=new SettingsStore(dir);const current=await store.read();assert.equal(current.output,'device');
 await assert.rejects(store.update({...current,api_key:'sentinel'}));
 await store.update({...current,output:'mac'});const next=await store.read();assert.equal(next.output,'mac');assert.equal((await stat(join(dir,'settings.json'))).mode&0o777,0o600);assert(!(await readFile(join(dir,'settings.json'),'utf8')).includes('sentinel'));
}finally{await rm(dir,{recursive:true,force:true});}});
