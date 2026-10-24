import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{Ledger}from'../src/ledger/repository.js';import{TurnJournal}from'../src/ledger/journal.js';import{DeepSeekBrain}from'../src/providers/deepseek.js';
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'model-payloads-'));const db=await Ledger.open(join(dir,'db'));const journal=new TurnJournal(db);return{db,journal,clean:async()=>{await journal.close();await db.close();await rm(dir,{recursive:true,force:true});}};}
test('real model attempt details retain sent messages and actual JSON response without auth credentials',async()=>{
 const f=await fixture();try{const body={id:'reply-id',model:'returned-model',choices:[{message:{content:'{"emotion":"loving","hold_ms":2500}'}}],usage:{prompt_tokens:20,completion_tokens:5}};
 const brain=new DeepSeekBrain({key:'sk-private-test-only-123456789',fetch:async()=>Response.json(body)});
 const r=await f.journal.run({mode:'text'},()=>brain.reaction('我今天有点累',[{role:'user',content:'你好'},{role:'assistant',content:'你好呀'}],new AbortController().signal));
 const d=await f.db.call('detail',{id:r.id});const p=d.attempts[0].payload;
 assert.equal(p.request.data.messages.at(-1).content,'我今天有点累');assert.equal(p.request.data.messages[0].role,'system');assert.equal(p.request.data.messages[1].content,'你好');assert.equal(p.request.data.thinking.type,'disabled');assert.deepEqual(p.response.data,body);assert(!JSON.stringify(p).includes('sk-private-test-only-123456789'));
 }finally{await f.clean();}
});
test('SSE records the actual event objects and marks a cancelled partial stream incomplete',async()=>{
 const f=await fixture();try{const abort=new AbortController();const event={id:'s1',model:'m',choices:[{delta:{content:'你好'}}]};
 const brain=new DeepSeekBrain({key:'fixture',fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));}}))});
 const r=await f.journal.run({mode:'text'},async()=>{for await(const text of brain.reply('你好',[],abort.signal)){assert.equal(text,'你好');abort.abort();break;}});
 const d=await f.db.call('detail',{id:r.id});assert.equal(d.attempts[0].status,'cancelled');assert.deepEqual(d.attempts[0].payload.response.data.events,[event]);assert.equal(d.attempts[0].payload.response.data.complete,false);
 }finally{await f.clean();}
});
test('privacy-off blocks request and response retention, including toggle during a call',async()=>{
 const f=await fixture();try{await f.db.call('privacy',{record_text:false});const r=await f.journal.run({mode:'text'},async()=>{const brain=new DeepSeekBrain({key:'fixture',fetch:async()=>{await f.db.call('privacy',{record_text:true});return Response.json({choices:[{message:{content:'{"emotion":"happy","hold_ms":1000}'}}]});}});await brain.reaction('private',[],new AbortController().signal);});assert.equal((await f.db.call('detail',{id:r.id})).attempts[0].payload,null);
 }finally{await f.clean();}
});
test('text-only cleanup also removes retained model prompts and replies but keeps usage',async()=>{
 const f=await fixture();try{await f.db.call('beginTurn',{id:'t',mode:'text',started_at:1});await f.db.call('beginAttempt',{id:'a',logical_id:'a',turn_id:'t',kind:'reaction',provider:'deepseek',model:'m',started_at:2,request_data:{messages:[{role:'user',content:'private prompt'}]}});await f.db.call('finishAttempt',{id:'a',status:'completed',response_data:{content:'private reply'},usage:{input_tokens:9}});await f.db.call('patchTurn',{id:'t',status:'completed'});const preview=await f.db.call('clear',{before:10,scope:'text'});await f.db.call('clear',{before:10,scope:'text',confirm:preview.confirmation});const a=(await f.db.call('detail',{id:'t'})).attempts[0];assert.equal(a.payload,null);assert.equal(a.usage.input_tokens,9);
 }finally{await f.clean();}
});
test('failed model HTTP response is retained and credentials in request/response bodies are redacted',async()=>{
 const f=await fixture();try{const brain=new DeepSeekBrain({key:'sk-header-secret-only-123456789',fetch:async()=>Response.json({error:{message:'sk-echoed-secret-123456789',api_key:'arbitrary-secret'}},{status:401})});let id='';await assert.rejects(f.journal.run({mode:'text'},async()=>{await brain.reaction('帮我看看 sk-user-sample-123456789',[],new AbortController().signal);}));const list=await f.db.call('list',{});id=list.items[0].id;const p=(await f.db.call('detail',{id})).attempts[0].payload;assert(p.response);const data=JSON.stringify(p);assert(!data.includes('sk-'));assert(!data.includes('arbitrary-secret'));assert(data.includes('REDACTED'));
 }finally{await f.clean();}
});
test('oversized model payloads are explicitly marked truncated rather than stored unbounded',async()=>{
 const f=await fixture();try{await f.db.call('beginTurn',{id:'t',mode:'text',started_at:1});await f.db.call('beginAttempt',{id:'a',logical_id:'a',turn_id:'t',kind:'reaction',provider:'deepseek',model:'m',started_at:2,request_data:{messages:[{content:'x'.repeat(100000)}]}});const p=(await f.db.call('detail',{id:'t'})).attempts[0].payload;assert.equal(p.request.truncated,true);assert(p.request.preview.length<=32768);
 }finally{await f.clean();}
});
test('successful SSE preserves ordered output and final usage event',async()=>{
 const f=await fixture();try{const events=[{choices:[{delta:{content:'你'}}]},{choices:[{delta:{content:'好呀'}}]},{choices:[],usage:{prompt_tokens:12,completion_tokens:3}}];const brain=new DeepSeekBrain({key:'fixture',fetch:async()=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n')});const r=await f.journal.run({mode:'text'},async()=>{let reply='';for await(const text of brain.reply('hi',[],new AbortController().signal))reply+=text;assert.equal(reply,'你好呀');});const a=(await f.db.call('detail',{id:r.id})).attempts[0];assert.equal(a.status,'completed');assert.equal(a.payload.response.data.complete,true);assert.deepEqual(a.payload.response.data.events,events);assert.equal(a.usage.output_tokens,3);
 }finally{await f.clean();}
});
test('additive v1 migration preserves previous turns and identifies historical payloads as absent',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const dir=await mkdtemp(join(tmpdir(),'model-v1-'));const path=join(dir,'db');let db=await Ledger.open(path);
 try{await db.call('beginTurn',{id:'old',mode:'text',started_at:1,user_text:'preserved'});await db.call('beginAttempt',{id:'a',logical_id:'a',turn_id:'old',kind:'reaction',provider:'deepseek',model:'m',started_at:2});await db.call('finishAttempt',{id:'a',status:'completed'});await db.close();const raw=new DatabaseSync(path);raw.exec('DROP TABLE model_payloads;DELETE FROM schema_migrations WHERE id=2;PRAGMA user_version=1');raw.close();db=await Ledger.open(path);const d=await db.call('detail',{id:'old'});assert.equal(d.turn.user_text,'preserved');assert.equal(d.attempts[0].payload,null);assert.equal((await db.call('ready')).version,2);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
