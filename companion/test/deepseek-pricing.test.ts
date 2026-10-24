import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ledger} from '../src/ledger/repository.js';
import {usageFrom} from '../src/ledger/journal.js';
import {deepseekPrices} from '../src/ledger/deepseek-pricing.mjs';
const sample={prompt_tokens:544,completion_tokens:13,total_tokens:557,prompt_cache_hit_tokens:384,prompt_cache_miss_tokens:160};
test('usage retains totals and derives nested cache misses without invalid numbers',()=>{
 assert.deepEqual(usageFrom(sample),{input_tokens:544,output_tokens:13,total_tokens:557,cache_hit_tokens:384,cache_miss_tokens:160});
 assert.equal(usageFrom({prompt_tokens:544,prompt_tokens_details:{cached_tokens:384}}).cache_miss_tokens,160);
 assert.equal(usageFrom({prompt_tokens:2,prompt_tokens_details:{cached_tokens:3}}).cache_miss_tokens,undefined);
 assert.deepEqual(usageFrom({prompt_tokens:-1,completion_tokens:1.5}),{});
});
test('tariff uses Beijing peak boundaries, weekends and exact model matching',()=>{
 const price=(s:string)=>deepseekPrices('deepseek','deepseek-flash',Date.parse(s))[0]!.price;
 for(const [s,p] of [['2026-10-23T00:59:59Z','0.02'],['2026-10-23T01:00:00Z','0.04'],['2026-10-23T04:00:00Z','0.02'],['2026-10-23T06:00:00Z','0.04'],['2026-10-23T10:00:00Z','0.02'],['2026-10-24T06:00:00Z','0.02']])assert.equal(price(s!),p);
 assert.deepEqual(deepseekPrices('other','deepseek-flash',Date.now()),[]);
});
test('544/13 tokens billed once; historical estimates idempotent and snapshots preserved',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eyes-price-'));const path=join(dir,'ledger.sqlite3');let db=await Ledger.open(path);
 try {
  await db.call('beginTurn',{id:'t',mode:'text',started_at:Date.now()});
  await db.call('beginAttempt',{id:'a',logical_id:'a',turn_id:'t',kind:'reaction',provider:'deepseek',model:'deepseek-flash',started_at:Date.parse('2026-10-24T07:00:00Z')});
  await db.call('finishAttempt',{id:'a',status:'completed',usage:usageFrom(sample)});
  assert.equal((await db.call('detail',{id:'t'})).attempts[0].costs.length,3);
  assert.equal((await db.call('summary',{})).costs[0].amount,'0.00021968');
  assert.equal((await db.call('summary',{})).unknown_attempts,0);
  assert.equal((await db.call('estimateDeepseekHistory')).count,0);
  await db.close();
  const {DatabaseSync}=await import('node:sqlite');const raw=new DatabaseSync(path);
  raw.exec("DELETE FROM cost_items;UPDATE provider_attempts SET price_snapshot='[]'");raw.close();
  db=await Ledger.open(path);
  assert.equal((await db.call('estimateDeepseekHistory')).count,1);
  assert.equal((await db.call('estimateDeepseekHistory')).count,0);
  assert.match((await db.call('detail',{id:'t'})).attempts[0].price_snapshot[0].note,/追溯估算/);
  assert.equal((await db.call('summary',{})).costs[0].amount,'0.00021968');
 } finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
test('manual prices take precedence and history never replaces a priced snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eyes-manual-'));const db=await Ledger.open(join(dir,'ledger.sqlite3'));
 try {
  for(const metric of ['input_tokens','output_tokens'])await db.call('savePrice',{provider:'deepseek',model:'deepseek-flash',metric,currency:'CNY',unit:1000000,price:'1',effective_at:0});
  await db.call('beginTurn',{id:'t',mode:'text',started_at:Date.now()});
  await db.call('beginAttempt',{id:'a',logical_id:'a',turn_id:'t',kind:'reply',provider:'deepseek',model:'deepseek-flash',started_at:Date.now()});
  await db.call('finishAttempt',{id:'a',status:'completed',usage:usageFrom(sample)});
  assert.equal((await db.call('summary',{})).costs[0].amount,'0.000557');
  assert.equal((await db.call('estimateDeepseekHistory')).count,0);
  assert.equal((await db.call('detail',{id:'t'})).attempts[0].price_snapshot.length,2);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
