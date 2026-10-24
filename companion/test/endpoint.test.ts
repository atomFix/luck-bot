import test from 'node:test';import assert from 'node:assert/strict';
import {SpeechEndpoint,SileroScorer} from '../src/voice/endpoint.js';
import {UtteranceBuffer} from '../src/voice/utterance.js';
const pcm=new Uint8Array(1536*2);
test('host endpoint ignores noise and ends only after sustained speech followed by silence',async()=>{
 let probability=0.1;const endpoint=new SpeechEndpoint({score:async()=>probability});
 for(let i=0;i<12;i++)assert.equal(await endpoint.push(pcm),false);
 probability=0.9;for(let i=0;i<3;i++)assert.equal(await endpoint.push(pcm),false);
 probability=0.1;for(let i=0;i<7;i++)assert.equal(await endpoint.push(pcm),false);
 assert.equal(await endpoint.push(pcm),true);
});
test('brief noise bursts and indefinitely quiet capture cannot create a paid speech request',async()=>{
 let probability=0.9;const endpoint=new SpeechEndpoint({score:async()=>probability});
 await endpoint.push(pcm);probability=0.1;for(let i=0;i<90;i++)assert.equal(await endpoint.push(pcm),false);
 await assert.rejects(async()=>{for(let i=0;i<20;i++)await endpoint.push(pcm);},/no_speech/);
});
test('host-local endpoint can close contiguous audio without accepting a transport gap',()=>{
 const frame={stream_id:1,frame_seq:0,turn_seq:1,end:false,sample_rate_khz:16 as const,pcm:new Uint8Array(640)};
 const buffer=new UtteranceBuffer();buffer.push(frame);assert.throws(()=>buffer.finish(),/audio_incomplete/);
 assert.equal(buffer.finishAtEndpoint().length,640);assert.throws(()=>buffer.push({...frame,frame_seq:1}),/cancelled/);
 const gap=new UtteranceBuffer();gap.push(frame);assert.throws(()=>gap.push({...frame,frame_seq:2}),/audio_gap/);assert.throws(()=>gap.finishAtEndpoint(),/cancelled/);
});
test('bundled real Silero model loads on this Mac and rejects digital silence',async()=>{
 const scorer=new SileroScorer();for(let i=0;i<5;i++){const p=await scorer.score(new Float32Array(1536));assert(Number.isFinite(p));assert(p<0.35);}
});
