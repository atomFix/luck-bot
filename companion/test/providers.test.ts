import test from 'node:test';import assert from 'node:assert/strict';
import {DeepSeekBrain} from '../src/providers/deepseek.js';
import {SpeechRegistry} from '../src/providers/registry.js';
import {wav16k,UtteranceBuffer} from '../src/voice/utterance.js';
const signal=new AbortController().signal;
test('DeepSeek sends low latency model and rejects untrusted reaction output',async()=>{
 let calls=0;
 const brain=new DeepSeekBrain({key:'fixture-only',fetch:async(url,init)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(init!.body as string);assert.equal(body.model,'deepseek-flash');assert.deepEqual(body.thinking,{type:'disabled'});return Response.json({choices:[{message:{content:'{"emotion":"shell","hold_ms":999999}'}}]});}});
 await assert.rejects(brain.reaction('你好',[],signal),/provider_reaction_format/);assert.equal(calls,2);
});
test('authentication errors do not retry or expose provider response text',async()=>{
 let calls=0;const brain=new DeepSeekBrain({key:'fixture-only',fetch:async()=>{calls++;return new Response('sensitive-provider-response',{status:401});}});
 await assert.rejects(brain.reaction('你好',[],signal),{message:'provider_auth'});assert.equal(calls,1);
});
test('SSE reply handles UTF8 split across network chunks and no blank tokens',async()=>{
 const bytes=new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n');
 const brain=new DeepSeekBrain({key:'fixture-only',fetch:async()=>new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}}))});
 let text='';for await(const s of brain.reply('hi',[],signal))text+=s;assert.equal(text,'你好');
});
test('ASR and TTS providers resolve independently and never claim an absent DashScope adapter is available',async()=>{
 const registry=new SpeechRegistry();const secrets={get:async()=>null,set:async()=>{},delete:async()=>{}};
 assert.equal((await registry.capabilities({provider:'dashscope',endpoint:'https://example.com/api/v1',model:'',credential_ref:'provider/dashscope'},signal)).state,'not-implemented');
 assert.throws(()=>registry.resolve({asr:{provider:'minimax',endpoint:'https://api.minimax.cn',model:'asr-1.0',credential_ref:'provider/dashscope'},tts:{provider:'minimax',endpoint:'wss://api.minimax.cn/ws/v1/t2a_v2',model:'speech-2.8-turbo',credential_ref:'provider/minimax'}},secrets),/credential_provider/);
});
test('audio gaps and oversized utterances cancel instead of submitting corrupt audio',()=>{
 const b=new UtteranceBuffer();const frame={stream_id:1,frame_seq:0,turn_seq:1,end:false,sample_rate_khz:16 as const,pcm:new Uint8Array(640)};
 b.push(frame);assert.throws(()=>b.push({...frame,frame_seq:2}),/audio_gap/);assert.throws(()=>b.finish(),/cancelled/);
 const wav=wav16k(new Uint8Array([0x34,0x12]));const view=new DataView(wav.buffer);
 assert.equal(new TextDecoder().decode(wav.subarray(0,4)),'RIFF');assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint32(40,true),2);assert.deepEqual([...wav.subarray(44)],[52,18]);
});
test('text-only semantics can coexist with an unimplemented ASR adapter',async()=>{
 const registry=new SpeechRegistry();registry.registerSpeechAdapter('minimax',{capabilities:async()=>({asr:true,tts:true,state:'unverified'}),createAsr:()=>({transcribe:async()=> 'ok'}),createTts:()=>({synthesize:async function*(){yield new Uint8Array([1,0]);}})});
 const speech=registry.resolve({asr:{provider:'dashscope',endpoint:'https://example.com/api/v1',model:'',credential_ref:'provider/dashscope'},tts:{provider:'minimax',endpoint:'wss://api.minimax.cn/ws/v1/t2a_v2',model:'speech-2.8-turbo',credential_ref:'provider/minimax'}},{get:async()=>null,set:async()=>{},delete:async()=>{}});
 const out=[];for await(const b of speech.tts.synthesize('hi',signal))out.push(...b);assert.deepEqual(out,[1,0]);await assert.rejects(speech.asr.transcribe(new Uint8Array(),signal),/provider_not_implemented/);
});
