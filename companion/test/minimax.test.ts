import test from 'node:test';import assert from 'node:assert/strict';import {MiniMaxAsr} from '../src/providers/minimax-asr.js';import {MiniMaxTts} from '../src/providers/minimax-tts.js';import {DEFAULT_SPEECH} from '../src/providers/config.js';import {EventEmitter} from 'node:events';
const secrets={get:async()=> 'fixture-only',set:async()=>{},delete:async()=>{}};const signal=new AbortController().signal;
test('ASR uploads a WAV container and never sends naked PCM as a file',async()=>{
 const asr=new MiniMaxAsr(DEFAULT_SPEECH.asr,secrets,async(_url,init)=>{
 const body=init!.body as FormData;assert.equal(body.get('model'),'asr-1.0');const file=body.get('file') as File;assert.equal(file.type,'audio/wav');assert.equal(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).subarray(0,4)),'RIFF');return Response.json({text:'你好',duration:0.02});});
 const {wav16k}=await import('../src/voice/utterance.js');assert.equal(await asr.transcribe(wav16k(new Uint8Array(640)),signal),'你好');
});
test('TTS waits for task_started and decodes documented hex payload into PCM',async()=>{
 class Socket extends EventEmitter {sent:any[]=[];close(){};send(text:string){const o=JSON.parse(text);this.sent.push(o);if(o.event==='task_start')queueMicrotask(()=>this.emit('message',JSON.stringify({event:'task_started',base_resp:{status_code:0}})));if(o.event==='task_finish')queueMicrotask(()=>{this.emit('message',JSON.stringify({event:'task_continued',data:{audio:'3412cdab'},base_resp:{status_code:0}}));this.emit('message',JSON.stringify({event:'task_finished',base_resp:{status_code:0}}));});}}
 const socket=new Socket();const tts=new MiniMaxTts(DEFAULT_SPEECH.tts,secrets,()=>{queueMicrotask(()=>socket.emit('open'));return socket as any;});
 const chunks=[];for await(const pcm of tts.synthesize('你好',signal))chunks.push(...pcm);assert.deepEqual(chunks,[52,18,205,171]);assert.deepEqual(socket.sent.map(x=>x.event),['task_start','task_continue','task_finish']);
});
