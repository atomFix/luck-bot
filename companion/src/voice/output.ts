import type {AudioOutput,DeviceClient,Turn} from '../contracts.js';import {setTimeout as sleep} from 'node:timers/promises';
export class DeviceOutput implements AudioOutput {
 private sequences=new Map<number,number>();private cancelled=new Set<number>();
 constructor(private device:DeviceClient,private pace:(ms:number,signal:AbortSignal)=>Promise<void>=(ms,signal)=>sleep(ms,undefined,{signal})){}
 async play(pcm:Uint8Array,turn:Turn){if(pcm.length%2)throw new Error('audio_format');turn.signal.throwIfAborted();if(this.cancelled.has(turn.id))throw new Error('stale');
  for(let i=0;i<pcm.length;i+=960){turn.signal.throwIfAborted();if(this.cancelled.has(turn.id))throw new Error('stale');const chunk=pcm.slice(i,i+960);const seq=this.sequences.get(turn.id)??0;this.sequences.set(turn.id,seq+1);
   await this.device.play({stream_id:turn.id,frame_seq:seq,turn_seq:turn.id,end:false,sample_rate_khz:24,pcm:chunk},turn);await this.pace(chunk.length/48,turn.signal);
  }
 }
 async finish(turn:Turn){turn.signal.throwIfAborted();if(this.cancelled.has(turn.id))throw new Error('stale');await this.device.play({stream_id:turn.id,frame_seq:this.sequences.get(turn.id)??0,turn_seq:turn.id,end:true,sample_rate_khz:24,pcm:new Uint8Array()},turn);this.sequences.delete(turn.id);}
 async cancel(turn:number){this.cancelled.add(turn);this.sequences.delete(turn);if(this.cancelled.size>32)this.cancelled.delete(this.cancelled.values().next().value!);}
}
