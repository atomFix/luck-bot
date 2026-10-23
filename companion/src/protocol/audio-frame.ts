import type {AudioFrame} from '../contracts.js';
function u32(n:number):boolean{return Number.isInteger(n)&&n>=0&&n<=0xffffffff;}
export function encodeAudio(f:AudioFrame):Uint8Array {
 if(!u32(f.stream_id)||!u32(f.frame_seq)||!u32(f.turn_seq)||f.pcm.length>960||f.pcm.length%2||![16,24].includes(f.sample_rate_khz))throw new Error('format');
 const b=Buffer.alloc(24+f.pcm.length);b.write('REYE');b[4]=1;b[5]=f.end?1:0;b.writeUInt16LE(24,6);
 b.writeUInt32LE(f.stream_id,8);b.writeUInt32LE(f.frame_seq,12);b.writeUInt32LE(f.turn_seq,16);b.writeUInt16LE(f.pcm.length,20);b[22]=f.sample_rate_khz;b[23]=1;b.set(f.pcm,24);return b;
}
export function decodeAudio(input:Uint8Array):AudioFrame {
 const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(b.length<24||b.length>984||b.toString('ascii',0,4)!=='REYE'||b[4]!==1||(b[5]!&~1)!==0||b.readUInt16LE(6)!==24||b[23]!==1||![16,24].includes(b[22]!)||b.readUInt16LE(20)!==b.length-24||b.length%2)throw new Error('format');
 return {stream_id:b.readUInt32LE(8),frame_seq:b.readUInt32LE(12),turn_seq:b.readUInt32LE(16),end:!!b[5],sample_rate_khz:b[22] as 16|24,pcm:new Uint8Array(b.subarray(24))};
}
