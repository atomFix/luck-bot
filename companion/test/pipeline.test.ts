import test from 'node:test';import assert from 'node:assert/strict';
import {VoicePipeline} from '../src/voice/pipeline.js';
const idleSignal=new AbortController().signal;
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
test('reply waits until reaction is actually acknowledged by the device',async()=>{
 const trace:string[]=[];const ack=deferred<any>();
 const pipeline=new VoicePipeline({brain:{reaction:async()=>({emotion:'happy',hold_ms:1000}),reply:async function*(){trace.push('reply');yield '你好。';}},device:{react:async()=>{trace.push('react');return ack.promise;},cancel:async()=>{},release:async()=>{},status:async()=>({}) as any,play:async()=>{}},asr:{transcribe:async()=>''},tts:{synthesize:async function*(){yield new Uint8Array([0,0]);}},output:{play:async()=>{trace.push('play');},cancel:async()=>{}}});
 const done=pipeline.text('你好');await new Promise(r=>setImmediate(r));assert.deepEqual(trace,['react']);ack.resolve({command_id:'c',applied_uptime_ms:1});await done;assert.deepEqual(trace,['react','reply','play']);
});
test('late old model result never overwrites a new turn',async()=>{
 const first=deferred<any>();let calls=0;const emotions:string[]=[];
 const pipeline=new VoicePipeline({brain:{reaction:async()=>++calls===1?first.promise:{emotion:'relaxed',hold_ms:1200},reply:async function*(){yield '好的。';}},device:{react:async(value)=>{emotions.push(value.emotion);return {command_id:'c',applied_uptime_ms:1};},cancel:async()=>{},release:async()=>{},status:async()=>({}) as any,play:async()=>{}},asr:{transcribe:async()=>''},tts:{synthesize:async function*(){}},output:{play:async()=>{},cancel:async()=>{}}});
 const old=pipeline.text('旧句').catch(()=>{});await new Promise(r=>setImmediate(r));await pipeline.text('新句');first.resolve({emotion:'angry',hold_ms:1000});await old;assert.deepEqual(emotions,['relaxed']);
});
test('empty ASR never submits a semantic request',async()=>{
 let count=0;const pipeline=new VoicePipeline({brain:{reaction:async()=>{count++;return {emotion:'neutral',hold_ms:1200};},reply:async function*(){}},device:{} as any,asr:{transcribe:async()=>''},tts:{} as any,output:{cancel:async()=>{}} as any});
 await pipeline.audio(new Uint8Array(640));assert.equal(count,0);
});
test('a slow cancellation cannot make an older input become the newest turn',async()=>{
 const cancellation=deferred<void>();let cancelCount=0;const applied:string[]=[];
 const pipeline=new VoicePipeline({brain:{reaction:async text=>({emotion:text==='old'?'angry':'happy',hold_ms:1200}),reply:async function*(){yield '好。';}},device:{react:async value=>{applied.push(value.emotion);return {command_id:'c',applied_uptime_ms:1};},cancel:async()=>{},release:async()=>{},status:async()=>({}) as any,play:async()=>{}},asr:{transcribe:async()=>''},tts:{synthesize:async function*(){}},output:{play:async()=>{},cancel:async()=>{if(++cancelCount===1)await cancellation.promise;}}});
 await pipeline.text('base');const old=pipeline.text('old').catch(()=>{});await new Promise(r=>setImmediate(r));await pipeline.text('new');cancellation.resolve();await old;assert.deepEqual(applied,['happy','happy']);
});

test('diagnostics record first TTS audio and completion only after output drains',async()=>{
 const events:string[]=[];
 const pipeline=new VoicePipeline({diagnose:e=>events.push(e.event),brain:{reaction:async()=>({emotion:'happy',hold_ms:1000}),reply:async function*(){yield '你好。';yield '再见。';}},device:{react:async()=>({command_id:'c',applied_uptime_ms:1}),cancel:async()=>{}} as any,asr:{} as any,tts:{synthesize:async function*(){yield new Uint8Array(2);yield new Uint8Array(2);}},output:{play:async()=>{},cancel:async()=>{},finish:async()=>{events.push('drained');}}});
 await pipeline.text('你好');assert.deepEqual(events,['reaction.ready','reaction.applied','reply.first_token','tts.first_audio','drained','reply.completed']);
});
test('ambient expression recognizes and acknowledges emotion without generating reply or TTS',async()=>{const calls:string[]=[];const p=new VoicePipeline({brain:{reaction:async()=>{calls.push('reaction');return {emotion:'happy',hold_ms:1000};},reply:async function*(){throw new Error('reply forbidden');}},device:{react:async()=>{calls.push('ack');return {command_id:'x',applied_uptime_ms:1};},cancel:async()=>{}} as any,asr:{transcribe:async()=>{calls.push('asr');return '今天开心';}},tts:{synthesize:async function*(){throw new Error('tts forbidden');}},output:{play:async()=>{throw new Error('output forbidden');},cancel:async()=>{}}});await p.expression(new Uint8Array(640),1,'speaker-a');assert.deepEqual(calls,['ack','asr','reaction','ack','ack']);});
test('ambient reaction waits for listening to finish and remains visible at least 2500ms',async()=>{const gate=deferred<void>();const applied:any[]=[];const p=new VoicePipeline({brain:{reaction:async()=>({emotion:'happy',hold_ms:1200}),reply:async function*(){throw Error('forbidden');}},device:{react:async(r:any)=>{applied.push(r);return {command_id:'x',applied_uptime_ms:1};},cancel:async()=>{}} as any,asr:{transcribe:async()=> '开心'},tts:{} as any,output:{cancel:async()=>{}} as any});const done=p.expression(new Uint8Array(640),1,'person',async()=>gate.promise);await new Promise(r=>setImmediate(r));assert.deepEqual(applied.map(r=>r.emotion),['thinking']);gate.resolve();await done;assert.equal(applied.at(-1).hold_ms,2500);});
test('cancelling a deferred ambient reaction never applies it after silence',async()=>{const gate=deferred<void>();let applied=0;const p=new VoicePipeline({brain:{reaction:async()=>({emotion:'happy',hold_ms:1200}),reply:async function*(){}},device:{react:async()=>{applied++;return {};},cancel:async()=>{}} as any,asr:{transcribe:async()=> '开心'},tts:{} as any,output:{cancel:async()=>{}} as any});const done=p.expression(new Uint8Array(640),1,'person',async()=>gate.promise).catch(()=>{});await new Promise(r=>setImmediate(r));await p.interrupt();gate.resolve();await done;assert.equal(applied,1);});
test('verified local transcript and explicit emotion avoid cloud ASR and brain while complex text falls back',async()=>{let calls=0;const applied:string[]=[];const p=new VoicePipeline({brain:{reaction:async()=>{calls++;return{emotion:'thinking',hold_ms:1200};},reply:async function*(){throw Error('forbidden');}},device:{react:async(r:any)=>{applied.push(r.emotion);return{};},cancel:async()=>{}}as any,asr:{transcribe:async()=>{throw Error('cloud ASR forbidden');}},tts:{}as any,output:{cancel:async()=>{}}as any});await p.expression(new Uint8Array(640),1,'person',undefined,{text:'我今天特别开心',fast:true});assert.equal(calls,0);assert.deepEqual(applied,['thinking','surprised','happy']);await p.expression(new Uint8Array(640),2,'person',undefined,{text:'我不是不开心',fast:true});assert.equal(calls,1);assert.deepEqual(applied,['thinking','surprised','happy','thinking','confused','thinking']);});
test('ambient companion celebrates in two phases and repeated interaction changes its response',async()=>{
 const applied:string[]=[];const p=new VoicePipeline({brain:{reaction:async()=>{throw Error('simple exchange must stay local');},reply:async function*(){throw Error('ambient must remain silent');}},device:{react:async(r:any)=>{applied.push(r.emotion);return{};},cancel:async()=>{}}as any,asr:{}as any,tts:{}as any,output:{cancel:async()=>{}}as any});
 await p.expression(new Uint8Array(640),1,'person',undefined,{text:'我今天特别开心',fast:true});
 assert.deepEqual(applied,['thinking','surprised','happy']);
 await p.expression(new Uint8Array(640),2,'person',undefined,{text:'我今天特别开心',fast:true});
 assert.deepEqual(applied,['thinking','surprised','happy','thinking','happy','laughing']);
});
test('ambient diagnostics identify each eye phase separately from the final reaction',async()=>{
 const events:any[]=[];const p=new VoicePipeline({diagnose:e=>events.push(e),brain:{reaction:async()=>({emotion:'embarrassed',hold_ms:2500}),reply:async function*(){}},device:{react:async()=>({}),cancel:async()=>{}}as any,asr:{}as any,tts:{}as any,output:{cancel:async()=>{}}as any});
 await p.expression(new Uint8Array(640),1,'person',undefined,{text:'你真可爱',fast:true});
 assert.deepEqual(events.filter(e=>['reaction.applied','reaction.settled'].includes(e.event)).map(e=>[e.event,e.code]),[['reaction.applied','surprised'],['reaction.settled','embarrassed']]);
});
test('thinking renews while semantics is pending and stops before the final emotion',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const gate=deferred<any>(),emotions:string[]=[];
 const p=new VoicePipeline({brain:{reaction:()=>gate.promise,reply:async function*(){}},device:{react:async(r:any)=>{emotions.push(r.emotion);return{};},cancel:async()=>{}}as any,asr:{}as any,tts:{}as any,output:{cancel:async()=>{}}as any});
 try{const work=p.expression(new Uint8Array(640),1,'person',undefined,{text:'需要理解的一句话',fast:false});await new Promise(r=>setImmediate(r));assert.deepEqual(emotions,['thinking']);t.mock.timers.tick(1500);await new Promise(r=>setImmediate(r));assert.deepEqual(emotions,['thinking','thinking']);gate.resolve({emotion:'relaxed',hold_ms:2500});await work;t.mock.timers.tick(6000);assert.deepEqual(emotions,['thinking','thinking','relaxed']);}finally{gate.resolve({emotion:'relaxed',hold_ms:2500});await p.interrupt();t.mock.timers.reset();}
});
