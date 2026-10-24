import test from 'node:test';import assert from 'node:assert/strict';import {startLocalServer} from '../src/local/server.js';
test('localhost service rejects hostile origin host and CSRF, never reveals configured secret',async()=>{
 const secrets=new Map<string,string>();const server=await startLocalServer({secretStore:{get:async(n)=>secrets.get(n)??null,set:async(n,v)=>{secrets.set(n,v);},delete:async(n)=>{secrets.delete(n);}},actions:async()=>({ok:true})});
 try{
  assert.equal((await fetch(server.url+'/api/state',{headers:{Host:'evil.example'}})).status,403);
  assert.equal((await fetch(server.url+'/api/state',{headers:{Origin:'https://evil.example'}})).status,403);
  const login=await fetch(server.url+'/api/bootstrap',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json'},body:JSON.stringify({token:server.bootstrap})});
  const cookie=login.headers.get('set-cookie')!.split(';')[0]!;const {csrf}=await login.json() as any;
  assert.equal((await fetch(server.url+'/api/credentials',{method:'POST',headers:{Cookie:cookie,Origin:server.url,'Content-Type':'application/json'},body:JSON.stringify({provider:'minimax',value:'sentinel-test-only'})})).status,403);
  const saved=await fetch(server.url+'/api/credentials',{method:'POST',headers:{Cookie:cookie,Origin:server.url,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({provider:'minimax',value:'sentinel-test-only'})});assert.equal(saved.status,200);
  const blank=await fetch(server.url+'/api/credentials',{method:'POST',headers:{Cookie:cookie,Origin:server.url,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({provider:'minimax',value:''})});assert.equal(blank.status,400);assert.equal(secrets.get('provider/minimax'),'sentinel-test-only');
  const state=await (await fetch(server.url+'/api/state',{headers:{Cookie:cookie}})).text();assert(!state.includes('sentinel-test-only'));assert(state.includes('true'));
  assert.equal((await fetch(server.url+'/api/bootstrap',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json'},body:JSON.stringify({token:server.bootstrap})})).status,403);
 }finally{await server.close();}
});

test('the management page serves every declared script including the directional renderer',async()=>{
 const server=await startLocalServer({secretStore:{get:async()=>null,set:async()=>{},delete:async()=>{}},actions:async()=>({})});
 try{
  const response=await fetch(server.url+'/');assert.equal(response.status,200);const html=await response.text();
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]!);assert(scripts.includes('/eye-geometry.js'));
  for(const script of scripts){const asset=await fetch(server.url+script);assert.equal(asset.status,200,script);assert.match(asset.headers.get('content-type')??'',/javascript/);assert((await asset.text()).length>10);}
 }finally{await server.close();}
});
