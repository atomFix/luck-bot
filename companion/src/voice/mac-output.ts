import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';import {fileURLToPath} from 'node:url';import type {AudioOutput,Turn,EventMeta} from '../contracts.js';
export class MacOutput implements AudioOutput {
 private child?:ChildProcessWithoutNullStreams;private turn=-1;private cancelled=new Set<number>();
 constructor(private helper=fileURLToPath(new URL('../../build/native/audio-output',import.meta.url)),private diagnose?:(meta:EventMeta)=>void){}
 async play(pcm:Uint8Array,turn:Turn){turn.signal.throwIfAborted();if(this.cancelled.has(turn.id)||pcm.length%2)throw new Error('stale');
  if(!this.child||this.turn!==turn.id){if(this.child)this.child.stdin.end();this.turn=turn.id;const child=spawn(this.helper,[],{stdio:['pipe','pipe','pipe']});this.child=child;const began=performance.now();let marker='',reported=false;child.stdout.on('data',chunk=>{if(reported)return;marker=(marker+chunk.toString()).slice(-128);if(marker.includes('playback.started\n')){reported=true;if(this.child===child&&!turn.signal.aborted)this.diagnose?.({event:'playback.started',turn:turn.id,duration_ms:Math.round(performance.now()-began)});}});child.stderr.resume();child.on('error',()=>{});child.stdin.on('error',()=>{});turn.signal.addEventListener('abort',()=>child.kill(),{once:true});}
  const child=this.child;await new Promise<void>((resolve,reject)=>{if(child.exitCode!==null){reject(new Error('mac_audio_failed'));return;}child.stdin.write(pcm,error=>error?reject(new Error('mac_audio_failed')):resolve());});
 }
 async finish(turn:Turn){turn.signal.throwIfAborted();if(this.turn!==turn.id||!this.child)return;const child=this.child;await new Promise<void>((resolve,reject)=>{if(child.exitCode!==null){child.exitCode===0?resolve():reject(new Error('mac_audio_failed'));return;}child.once('close',code=>code===0?resolve():reject(new Error('mac_audio_failed')));child.stdin.end();});if(this.child===child)this.child=undefined;}
 async cancel(turn:number){this.cancelled.add(turn);if(turn===this.turn){this.child?.kill();this.child=undefined;}if(this.cancelled.size>32)this.cancelled.delete(this.cancelled.values().next().value!);}
}
