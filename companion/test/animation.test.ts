import test from 'node:test';import assert from 'node:assert/strict';
import {AnimationSchema,SCENES,parseAnimationChoice,animationPosition} from '../src/voice/animation.js';
import {AmbientSegmenter} from '../src/speaker/segmenter.js';
import {VoicePipeline} from '../src/voice/pipeline.js';
test('all presets are bounded and custom model sequences reject invalid primitives and excessive duration',()=>{
 for(const name of Object.keys(SCENES)){const p=parseAnimationChoice({preset:name});assert(p.steps.length>2);assert(AnimationSchema.safeParse(p).success);}
 for(const bad of [{preset:'run_shell'},{scene:'bad',steps:[{emotion:'scared',duration_ms:500}]},{scene:'bad',steps:[{emotion:'happy',duration_ms:500,shake:Infinity}]},{scene:'bad',steps:Array.from({length:12},()=>({emotion:'happy',duration_ms:5000}))}])assert.throws(()=>parseAnimationChoice(bad));
 const p=parseAnimationChoice({scene:'custom',steps:[{emotion:'shocked',duration_ms:500,shake:.8,scale:.75}]});assert.equal(p.steps[0]!.look_x,0);assert.equal(animationPosition(p,500).step,0);
});
test('continuous speech produces four-second overlapping windows and still terminates on real silence',async()=>{
 let probability=.9;const s=new AmbientSegmenter(()=>({score:async()=>probability}),600,4000);s.start(9);let n=0,starts=0;const ends:any[]=[];
 const feed=async()=>{const e=await s.push({stream_id:9,frame_seq:n++,turn_seq:0,sample_rate_khz:16,end:false,pcm:new Uint8Array(640)});if(e?.type==='start')starts++;if(e?.type==='end')ends.push(e);};
 for(let i=0;i<600;i++)await feed();assert(ends.length>=3);assert(ends.every(e=>e.continued&&e.pcm.length<=128000));assert(starts>=3);
 probability=.01;for(let i=0;i<40;i++)await feed();assert.equal(ends.at(-1).continued,undefined);assert(ends.at(-1).voiced_ms>=192);
});
test('story animation sends a whole plan without waiting for playback or cancelling the previous sequence',async()=>{
 const sent:any[]=[],contexts:any[]=[],cancelled:number[]=[];
 const p=new VoicePipeline({animations:true,brain:{animation:async(_text,h)=>{contexts.push(h);return parseAnimationChoice({preset:contexts.length===1?'horror':'relief'});},reaction:async()=>{throw Error('legacy forbidden');},reply:async function*(){throw Error('speech forbidden');}},device:{animate:async(plan:any,turn:any)=>{sent.push({plan,turn:turn.id});return {command_id:'a',applied_uptime_ms:0};},cancel:async(n:number)=>{cancelled.push(n);}}as any,asr:{}as any,tts:{}as any,output:{cancel:async()=>{}}as any});
 await p.expression(new Uint8Array(32000),1,'owner',async()=>{throw Error('must not wait for storytelling to stop');},{text:'黑暗的走廊里突然有人敲门',fast:false});
 await p.expression(new Uint8Array(32000),2,'owner',undefined,{text:'原来只是一只猫，吓我一跳',fast:false});
 assert.deepEqual(cancelled,[]);assert.equal(sent[0].plan.scene,'horror');assert.equal(sent[1].plan.scene,'relief');assert(contexts[1].some((m:any)=>m.content.includes('当前板端动画状态')));
});
test('animation ledger preserves exact primitive steps after reopening and cascades full cleanup',async()=>{
 const {Ledger}=await import('../src/ledger/repository.js');const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const dir=await mkdtemp(join(tmpdir(),'animation-ledger-'));let db=await Ledger.open(join(dir,'db'));try{
 await db.call('beginTurn',{id:'t',mode:'ambient',started_at:1});const plan=parseAnimationChoice({preset:'horror'});await db.call('saveAnimation',{turn_id:'t',plan,source:'preset'});await db.close();db=await Ledger.open(join(dir,'db'));assert.deepEqual((await db.call('detail',{id:'t'})).animation.plan,plan);const p=await db.call('clear',{before:10,scope:'all'});await db.call('clear',{before:10,scope:'all',confirm:p.confirmation});assert.equal((await db.call('list',{})).total,0);
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
