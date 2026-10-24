import test from 'node:test';import assert from 'node:assert/strict';
import {SpeechEndpoint,SileroScorer} from '../src/voice/endpoint.js';
import {UtteranceBuffer} from '../src/voice/utterance.js';
const pcm=new Uint8Array(1536*2);
test('host endpoint ignores noise and ends only after sustained speech followed by silence',async()=>{
 let probability=0.1;const endpoint=new SpeechEndpoint({score:async()=>probability},{noSpeechTimeoutMs:10000,silenceMs:768});
 for(let i=0;i<12;i++)assert.equal(await endpoint.push(pcm),false);
 probability=0.9;for(let i=0;i<3;i++)assert.equal(await endpoint.push(pcm),false);
 probability=0.1;for(let i=0;i<7;i++)assert.equal(await endpoint.push(pcm),false);
 assert.equal(await endpoint.push(pcm),true);
});
test('brief noise bursts and indefinitely quiet capture cannot create a paid speech request',async()=>{
 let probability=0.9;const endpoint=new SpeechEndpoint({score:async()=>probability},{noSpeechTimeoutMs:10000,silenceMs:768});
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
test('default wake opening wait lasts twenty seconds and continuous quiet never times out',async()=>{const quiet={score:async()=>.01};const normal=new SpeechEndpoint(quiet);for(let n=0;n<130;n++)assert.equal(await normal.push(pcm),false);await assert.rejects(async()=>{for(let n=0;n<90;n++)await normal.push(pcm);},/no_speech/);const background=new SpeechEndpoint(quiet,{continuous:true});for(let n=0;n<700;n++)assert.equal(await background.push(pcm),false);});
test('waiting capture keeps only pre-roll while continuing transport gap validation',()=>{const b=new UtteranceBuffer();for(let n=0;n<2000;n++){b.push({stream_id:1,turn_seq:1,frame_seq:n,end:false,sample_rate_khz:16,pcm:new Uint8Array(640)});b.retainTail(16000);}assert.equal(b.finishAtEndpoint().length,16000);const gap=new UtteranceBuffer();gap.push({stream_id:1,turn_seq:1,frame_seq:0,end:false,sample_rate_khz:16,pcm:new Uint8Array(640)});gap.retainTail(0);assert.throws(()=>gap.push({stream_id:1,turn_seq:1,frame_seq:2,end:false,sample_rate_khz:16,pcm:new Uint8Array(640)}),/audio_gap/);});
test('ambient two-frame onset accepts a short phrase while one-frame impulses remain noise',async()=>{
 let probability=.9;const endpoint=new SpeechEndpoint({score:async()=>probability},{continuous:true,speechFrames:2,silenceMs:600});await endpoint.push(pcm);assert.equal(endpoint.hasSpeech,false);probability=.1;await endpoint.push(pcm);probability=.9;await endpoint.push(pcm);await endpoint.push(pcm);assert.equal(endpoint.hasSpeech,true);assert.equal(endpoint.stats.voiced_ms,288);
});
