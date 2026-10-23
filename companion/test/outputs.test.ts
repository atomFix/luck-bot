import test from 'node:test';import assert from 'node:assert/strict';import {DeviceOutput} from '../src/voice/output.js';
test('device output splits PCM to negotiated frame size and cancels stale playback',async()=>{
 const frames:any[]=[];const device={play:async(f:any)=>{frames.push(f);},cancel:async()=>{}};
 const output=new DeviceOutput(device as any,async()=>{});const a=new AbortController();const turn={id:4,signal:a.signal};
 await output.play(new Uint8Array(1922),turn);assert.deepEqual(frames.map(f=>[f.frame_seq,f.pcm.length,f.sample_rate_khz]),[[0,960,24],[1,960,24],[2,2,24]]);
 await output.cancel(4);await assert.rejects(output.play(new Uint8Array(2),turn),/stale/);
});
test('end marker belongs to the same stream and follows final PCM',async()=>{
 const frames:any[]=[];const output=new DeviceOutput({play:async (f:any)=>{frames.push(f);}} as any,async()=>{});const turn={id:9,signal:new AbortController().signal};await output.play(new Uint8Array(2),turn);await output.finish(turn);assert.equal(frames[1].end,true);assert.equal(frames[1].frame_seq,1);assert.equal(frames[1].pcm.length,0);
});
