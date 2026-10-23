import test from 'node:test';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {parseControl,parseReaction} from '../src/protocol/schema.js';
import {encodeAudio,decodeAudio} from '../src/protocol/audio-frame.js';
import {isExpired,toDeviceDeadline} from '../src/protocol/clock.js';
test('invalid reaction cannot pass unsafe values to the eye renderer',()=>{
 for(const value of [{emotion:'shell',hold_ms:1000},{emotion:'happy',hold_ms:299},{emotion:'sad',hold_ms:3001},{emotion:'happy',hold_ms:1000,url:'bad'}])assert.throws(()=>parseReaction(value));
 assert.deepEqual(parseReaction({emotion:'happy',hold_ms:1600}),{emotion:'happy',hold_ms:1600});
});
test('version and envelope bounds reject malformed controls',()=>{
 assert.throws(()=>parseControl({v:2}));assert.equal(parseControl(JSON.parse(readFileSync(new URL('fixtures/protocol.json',import.meta.url),'utf8'))).type,'reaction');
 assert.throws(()=>parseControl({v:1,type:'reaction',device_id:'d',boot_id:'b',session_id:'s',seq:1,turn_seq:0,command_id:'c',deadline_ms:1,payload:{emotion:'happy',hold_ms:999999}}));
});
test('audio uses independently specified little endian header and rejects malformed frames',()=>{
 const frame={stream_id:1,frame_seq:2,turn_seq:3,end:true,sample_rate_khz:16 as const,pcm:new Uint8Array([0x34,0x12])};
 const encoded=encodeAudio(frame);
 assert.deepEqual([...encoded], [82,69,89,69,1,1,24,0,1,0,0,0,2,0,0,0,3,0,0,0,2,0,16,1,52,18]);
 assert.deepEqual(decodeAudio(encoded),frame);assert.equal(Buffer.from(encoded).toString('hex'),readFileSync(new URL('fixtures/protocol-audio.hex',import.meta.url),'utf8').trim());
 for(const b of [encoded.subarray(0,25),new Uint8Array(985)])assert.throws(()=>decodeAudio(b));
 const wrong=encoded.slice();wrong[5]=128;assert.throws(()=>decodeAudio(wrong));
 assert.throws(()=>encodeAudio({...frame,pcm:new Uint8Array(961)}));
});
test('uptime wrap and RTT use device time rather than wall time',()=>{
 assert.equal(isExpired(0xfffffff0,0x10),false);assert.equal(isExpired(0x11,0x10),true);
 assert.equal(toDeviceDeadline(1000,{host_ms:900,device_ms:100,rtt_ms:20},2000),2210);
 assert.throws(()=>toDeviceDeadline(0,{host_ms:0,device_ms:0,rtt_ms:0},16000));
});
