import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,writeFile,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {localSession,MANAGEMENT_PORT} from '../src/local/session.js';import {startLocalServer} from '../src/local/server.js';
const secretStore={get:async()=>null,set:async()=>{},delete:async()=>{}};
test('management identity survives restarts with owner-only permissions and refuses symlinks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eyes-session-'));try{const first=await localSession(dir);assert.equal(first,await localSession(dir));assert.equal((await stat(join(dir,'management-session'))).mode&0o777,0o600);assert.equal(MANAGEMENT_PORT,4382);await rm(join(dir,'management-session'));await writeFile(join(dir,'target'),'x');await symlink(join(dir,'target'),join(dir,'management-session'));await assert.rejects(localSession(dir),/session_ownership/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('fixed service retains browser login across restart but still rejects stale CSRF and occupied ports',async()=>{
 const session='a'.repeat(64);let mutations=0;const options={session,secretStore,actions:async()=>{mutations++;return {ok:true};}};
 let server=await startLocalServer(options);const origin=server.url,port=Number(new URL(origin).port);
 try{
 const login=await fetch(origin+'/api/bootstrap',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:server.bootstrap})});const cookie=login.headers.get('set-cookie')!.split(';')[0]!,old=(await login.json() as any).csrf;
 await assert.rejects(startLocalServer({...options,port}),e=>(e as any).code==='EADDRINUSE');
 await server.close();server=await startLocalServer({...options,port});assert.equal(server.url,origin);
 const auth=await fetch(origin+'/api/session',{headers:{Cookie:cookie}});assert.equal(auth.status,200);const current=(await auth.json() as any).csrf;assert.notEqual(current,old);
 const post=(csrf:string)=>fetch(origin+'/api/test',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});
 assert.equal((await post(old)).status,403);assert.equal(mutations,0);assert.equal((await post(current)).status,200);assert.equal(mutations,1);assert.equal((await fetch(origin+'/api/session')).status,403);
 }finally{await server.close();}
});
