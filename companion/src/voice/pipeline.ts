import {performance} from 'node:perf_hooks';import type {Brain,DeviceClient,Asr,Tts,AudioOutput,Turn,Message,EventMeta} from '../contracts.js';
import {TurnManager} from './turn.js';import {History} from './history.js';import {wav16k} from './utterance.js';
type Options={brain:Brain;device:DeviceClient;asr:Asr;tts:Tts;output:AudioOutput;diagnose?:(meta:EventMeta)=>void;onReply?:(text:string)=>void};
export class VoicePipeline {
 private turns=new TurnManager();private history=new History();
 constructor(private options:Options){}
 async interrupt(){const old=this.turns.number;this.turns.cancel();if(old){await Promise.allSettled([this.options.device.cancel(old),this.options.output.cancel(old)]);}}
 clearHistory(){this.history.clear();}
 private async begin(id?:number){const old=this.turns.number;const turn=this.turns.start(id);if(old)await Promise.allSettled([this.options.device.cancel(old),this.options.output.cancel(old)]);this.check(turn);return turn;}
 private check(turn:Turn){turn.signal.throwIfAborted();if(!this.turns.isCurrent(turn))throw new Error('stale');}
 async text(text:string,options:{turn?:number;speak?:boolean;source?:'voice'|'agent'}={}){
  if(!text.trim()||text.length>4000)throw new Error('text_size');const turn=await this.begin(options.turn);return this.process(text.trim(),turn,options.speak!==false,options.source??'voice');
 }
 async audio(pcm:Uint8Array,externalTurn?:number){const turn=await this.begin(externalTurn);const t=performance.now();const text=await this.options.asr.transcribe(wav16k(pcm),turn.signal);this.check(turn);this.event('asr.done',turn,t);if(text.trim())return this.process(text,turn,true);return '';}
 private event(event:string,turn:Turn,start:number){this.options.diagnose?.({event,turn:turn.id,duration_ms:Math.round(performance.now()-start)});}
 private async process(text:string,turn:Turn,speak:boolean,source:'voice'|'agent'='voice'):Promise<string>{
  const history=this.history.snapshot();let began=performance.now();const reaction=await this.options.brain.reaction(text,history,turn.signal);this.check(turn);this.event('reaction.ready',turn,began);
  began=performance.now();await this.options.device.react(reaction,turn,source);this.check(turn);this.event('reaction.applied',turn,began);
  let reply='',sentence='',first=true;began=performance.now();
  const say=async(value:string)=>{if(!speak||!value.trim())return;for await(const pcm of this.options.tts.synthesize(value,turn.signal)){this.check(turn);await this.options.output.play(pcm,turn);this.check(turn);}};
  try{
   for await(const token of this.options.brain.reply(text,history,turn.signal)){
    this.check(turn);if(first){this.event('reply.first_token',turn,began);first=false;}reply+=token;sentence+=token;if(reply.length>4000)throw new Error('reply_size');
    // Consume TTS sequentially: no unbounded sentence queue or parallel billing.
    let index;while((index=sentence.search(/[。！？!?\n]/))>=0||sentence.length>=120){const end=index>=0?index+1:120;const part=sentence.slice(0,end);sentence=sentence.slice(end);await say(part);}
   }
   await say(sentence);if(speak)await this.options.output.finish?.(turn);this.check(turn);this.history.add(text,reply);this.options.onReply?.(reply);return reply;
  }catch(error){if(this.turns.isCurrent(turn))await Promise.allSettled([this.options.device.cancel(turn.id),this.options.output.cancel(turn.id)]);throw error;}
 }
}
