import test from 'node:test';import assert from 'node:assert/strict';
import {performReaction} from '../src/voice/reaction-performance.js';
import type {Reaction} from '../src/contracts.js';
test('celebration acknowledges immediately then settles into smile with bounded device payloads',async()=>{
 const trace:Reaction[]=[];const events:string[]=[];
 await performReaction({emotion:'happy',hold_ms:2500},new AbortController().signal,async r=>{trace.push(r);},undefined,e=>events.push(e));
 assert.deepEqual(trace,[{emotion:'surprised',hold_ms:500},{emotion:'happy',hold_ms:2500}]);assert.deepEqual(events,['reaction.applied','reaction.settled']);
});
test('interruption after first eye cue prevents late followup',async()=>{
 const abort=new AbortController();const trace:string[]=[];
 await assert.rejects(performReaction({emotion:'embarrassed',hold_ms:2500},abort.signal,async r=>{trace.push(r.emotion);abort.abort();}));
 assert.deepEqual(trace,['surprised']);
});
test('every phase respects listening gate and abort while waiting never sends next phase',async()=>{
 const abort=new AbortController();const trace:string[]=[];let gate=0;
 await assert.rejects(performReaction({emotion:'silly',hold_ms:2500},abort.signal,async r=>{trace.push(r.emotion);},async()=>{if(++gate===2){abort.abort();abort.signal.throwIfAborted();}}));
 assert.deepEqual(trace,['embarrassed']);assert.equal(gate,2);
});
test('care responds directly instead of performing surprise at distress',async()=>{
 const trace:Reaction[]=[];await performReaction({emotion:'loving',hold_ms:2500},new AbortController().signal,async r=>{trace.push(r);});assert.deepEqual(trace,[{emotion:'loving',hold_ms:2500}]);
});
