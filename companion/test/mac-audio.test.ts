import test from 'node:test';import assert from 'node:assert/strict';
import {MacOutput} from '../src/voice/mac-output.js';
test('native Mac output can drain two seconds of silent PCM without starving between buffers',{timeout:10000},async()=>{
 const output=new MacOutput();const turn={id:1,signal:new AbortController().signal};
 try{const began=performance.now();await output.play(new Uint8Array(96000),turn);await output.finish(turn);assert(performance.now()-began<4800,'PCM playback must not run at less than half real-time speed');}finally{await output.cancel(turn.id);}
});
