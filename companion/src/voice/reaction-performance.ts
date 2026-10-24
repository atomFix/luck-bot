import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import type {Reaction,Emotion} from '../contracts.js';

// Host-side choreography uses unchanged, validated single-reaction device commands.
// The firmware eases each transition and restores its focused idle when hold expires.
const leads:Partial<Record<Emotion,Emotion>>={happy:'surprised',laughing:'happy',embarrassed:'surprised',silly:'embarrassed',thinking:'confused',confident:'winking'};
export async function performReaction(
 reaction:Reaction,signal:AbortSignal,apply:(value:Reaction)=>Promise<void>,
 beforeApply?:(signal:AbortSignal)=>Promise<void>,
 event?:(name:string,started:number,value:Reaction)=>void,
):Promise<void>{
 const lead=leads[reaction.emotion];
 const phases:Reaction[]=lead?[{emotion:lead,hold_ms:500},reaction]:[reaction];
 for(let i=0;i<phases.length;i++){
  signal.throwIfAborted();await beforeApply?.(signal);signal.throwIfAborted();
  const began=performance.now();await apply(phases[i]!);signal.throwIfAborted();
  event?.(i===0?'reaction.applied':'reaction.settled',began,phases[i]!);
  if(i+1<phases.length)await delay(350,undefined,{signal});
 }
}
