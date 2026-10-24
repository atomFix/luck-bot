import type {AudioFrame} from '../contracts.js';
export function wav16k(pcm:Uint8Array):Uint8Array {
 if(pcm.length>960000||pcm.length%2)throw new Error('audio_size');
 const b=Buffer.alloc(44+pcm.length);b.write('RIFF');b.writeUInt32LE(36+pcm.length,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);b.set(pcm,44);return b;
}
export class UtteranceBuffer {
 private stream=-1;private turn=-1;private next=0;private chunks:Uint8Array[]=[];private size=0;private cancelled=false;private ended=false;
 push(f:AudioFrame){
  if(this.cancelled||this.ended)throw new Error('cancelled');
  if(this.stream<0){this.stream=f.stream_id;this.turn=f.turn_seq;}
  if(f.sample_rate_khz!==16||f.stream_id!==this.stream||f.turn_seq!==this.turn||f.frame_seq!==this.next++||f.pcm.length%2){this.cancel();throw new Error('audio_gap');}
  this.size+=f.pcm.length;if(this.size>960000){this.cancel();throw new Error('utterance_too_long');}this.chunks.push(f.pcm.slice());this.ended=f.end;
 }
 retainTail(maxBytes:number){if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes%2)throw new Error('audio_size');while(this.size>maxBytes){const first=this.chunks[0]!;const remove=Math.min(first.length,this.size-maxBytes);this.size-=remove;if(remove===first.length)this.chunks.shift();else this.chunks[0]=first.slice(remove);}}
 finishAtEndpoint():Uint8Array{if(this.cancelled)throw new Error('cancelled');if(!this.size)throw new Error('audio_incomplete');this.ended=true;return this.finish();}
 finish():Uint8Array{if(this.cancelled)throw new Error('cancelled');if(!this.ended)throw new Error('audio_incomplete');return Buffer.concat(this.chunks);}
 cancel(){this.cancelled=true;this.chunks=[];this.size=0;}
}
