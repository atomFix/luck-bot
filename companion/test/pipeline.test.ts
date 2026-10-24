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
