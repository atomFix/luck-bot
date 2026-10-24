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

test('automatic animation pacing leaves a readable hold and stays within the 30 second device budget',async()=>{
 const {paceAnimation,animationReplacementDelay}=await import('../src/voice/animation.js');
 const raw=parseAnimationChoice({scene:'rapid',steps:Array.from({length:12},(_,i)=>({emotion:i%2?'thinking':'surprised',duration_ms:i%2?4500:200,transition_ms:150}))});
 const paced=paceAnimation(raw);assert.equal(paced.steps.length,12);assert(paced.steps.every(s=>s.duration_ms>=2200&&s.duration_ms-s.transition_ms>=1000));assert(paced.steps.reduce((n,s)=>n+s.duration_ms,0)<=30000);
 const p=parseAnimationChoice({preset:'celebration'});assert.equal(animationReplacementDelay(p,0),600);assert.equal(animationReplacementDelay(p,1500),300);assert.equal(animationReplacementDelay(p,2000),0);assert.equal(animationReplacementDelay(p,999999),0);
});

test('criticism and hearing checks have grounded acknowledgements and no playful detours',async()=>{
 const {conversationalAnimation,socialAnimation}=await import('../src/voice/animation.js');
 for(const text of ['你乱回啊','你现在能听到我说什么东西吗？','我刚才说的不是这个意思']){
  const plan=conversationalAnimation(text);assert(plan);assert(plan.steps.every(s=>['thinking','neutral'].includes(s.emotion)),text);
 }
 assert.equal(conversationalAnimation('你现在什么表情？','loving')!.steps[0]!.emotion,'loving');
 assert.equal(conversationalAnimation('他说你乱回啊，后来又讲了一个好消息'),null);
 assert(socialAnimation({emotion:'loving',hold_ms:2500},'我很累').steps.every(s=>['loving','neutral'].includes(s.emotion)));
 for(const scene of ['horror','teased','problem'] as const)assert(!SCENES[scene].steps.some(s=>s.emotion==='angry'||s.emotion==='confident'));
});

test('continuing the same scene keeps its current phase and repairs bypass a playful plan',async()=>{
 const sent:any[]=[],events:any[]=[];let calls=0;
 const p=new VoicePipeline({animations:true,diagnose:(e:{event:string})=>events.push(e),brain:{animation:async()=>{calls++;return parseAnimationChoice({preset:'horror'});}},device:{animate:async(plan:any)=>{sent.push(plan);return {command_id:'a',applied_uptime_ms:0};},cancel:async()=>{}},asr:{},tts:{},output:{cancel:async()=>{}}}as any);
 await p.expression(new Uint8Array(),1,'owner',undefined,{text:'黑暗中门外传来脚步声',fast:false,continued:true});
 await p.expression(new Uint8Array(),2,'owner',undefined,{text:'脚步声还在门口徘徊',fast:false,continued:true});
 assert.equal(calls,2);assert.equal(sent.length,1);assert(events.some(e=>e.event==='animation.continued'));
 await p.expression(new Uint8Array(),3,'owner',undefined,{text:'我刚才说的不是这个意思',fast:false});
 assert.equal(calls,2);assert.equal(sent.at(-1).scene,'repair');assert.equal(sent.at(-1).steps[0].emotion,'thinking');
});
