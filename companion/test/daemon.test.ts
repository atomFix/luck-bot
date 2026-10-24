import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {startCompanion} from '../src/main.js';
test('restart recovers a proven stale socket but refuses a second live daemon',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'re-daemon-'));let instance:Awaited<ReturnType<typeof startCompanion>>|undefined;
 try{const path=join(dir,'control.sock');execFileSync(process.execPath,['-e','const net=require("net");net.createServer().listen(process.argv[1],()=>process.exit(0))',path]);instance=await startCompanion(dir,{port:0});await assert.rejects(startCompanion(dir,{port:0}),/daemon_running/);}finally{await instance?.close();await rm(dir,{recursive:true,force:true});}
});
test('background daemon issues a fresh one-use UI bootstrap for a browser without cookies',async()=>{
 const {daemonCall}=await import('../src/integrations/daemon-client.js');const dir=await mkdtemp(join(tmpdir(),'re-bootstrap-'));let instance:Awaited<ReturnType<typeof startCompanion>>|undefined;
 try{instance=await startCompanion(dir,{port:0});const launch=await daemonCall('open-ui',{},dir);const url=new URL(launch.url);const token=url.hash.slice(1);const origin=url.origin;const auth=await fetch(origin+'/api/bootstrap',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie')!.split(';')[0]!;assert.equal((await fetch(origin+'/api/session',{headers:{Cookie:cookie}})).status,200);assert.equal((await fetch(origin+'/api/bootstrap',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})})).status,403);
 const next=await daemonCall('open-ui',{},dir);assert.notEqual(next.url,launch.url);
 }finally{await instance?.close();await rm(dir,{recursive:true,force:true});}
});
