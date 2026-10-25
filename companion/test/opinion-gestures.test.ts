import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnimationChoice,paceAnimation,requestedAnimation} from '../src/voice/animation.js';
import {asksForOpinion,opinionGesture} from '../src/voice/opinion-gestures.mjs';
import {requestedGesture,missingOpinionReferent} from '../src/voice/fast-reaction.js';
import {VoicePipeline} from '../src/voice/pipeline.js';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Ledger} from '../src/ledger/repository.js';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('gesture commands are local; truth questions, stories, negations and quotations require understanding',()=>{
 for(const text of ['点点头','你点一下头好吗？','来个点头认可','上下摆动一下'])assert.equal(requestedGesture(text),'agree',text);
 for(const text of ['摇摇头','你摇一下头吧','表示不认可','左右摆动一下'])assert.equal(requestedGesture(text),'disagree',text);
 for(const text of ['你觉得对么？','一加一等于三，对不对？','不要点头','他说摇摇头','“点头”','如果你同意就点头','我很难过，你不同意吗'])assert.equal(requestedGesture(text),null,text);
 for(const text of ['你觉得对么？','这对不对','你同意这个观点吗','你觉得呢'])assert(asksForOpinion(text),text);
 assert.equal(asksForOpinion('我今天有点累'),false);
});
test('bare opinion questions wait for a real referent, while full claims still reach the model',async()=>{
 assert(missingOpinionReferent('你觉得对么？',[]));
 assert(missingOpinionReferent('那你觉得对不对？',[{role:'user',content:'点点头'},{role:'user',content:'嗯。'}]));
 assert(!missingOpinionReferent('你觉得对么？',[{role:'user',content:'一加一等于三'}]));
 assert(!missingOpinionReferent('一加一等于三，你觉得对么？',[]));
 const sent:any[]=[];const p=new VoicePipeline({animations:true,brain:{animation:async()=>{throw Error('no referent must wait locally');}},device:{animate:async(plan:any)=>{sent.push(plan);return {command_id:'a',applied_uptime_ms:0};},cancel:async()=>{}},asr:{},tts:{},output:{cancel:async()=>{}}}as any);
 await p.expression(new Uint8Array(),1,'owner',undefined,{text:'你觉得对么？',fast:false});
 assert.equal(sent[0].scene,'opinion_uncertain');assert(sent[0].steps.every((s:any)=>s.emotion==='thinking'));
});

test('a nod moves vertically and a head shake horizontally on the actual projected eye geometry',async()=>{
 const ctx:any={window:{}};for(const name of ['emotion-catalog','eye-geometry'])runInNewContext(await readFile(new URL('../ui/'+name+'.js',import.meta.url),'utf8'),ctx);
 const center=(plan:any)=>Array.from({length:106},(_,i)=>i*40).map(age=>{
  const step=plan.steps[0];
  const pose=ctx.window.RoundEyesEmotionCatalog.items.find((x:any)=>x.key===step.emotion).poses[0];
  const points=ctx.window.RoundEyesGeometry.project(pose,step,age,true).flat();
  return [0,1].map(axis=>points.filter((_:number,i:number)=>i%2===axis).reduce((a:number,b:number)=>a+b,0)/96);
 });
 const span=(points:number[][],axis:number)=>Math.max(...points.map(p=>p[axis]!))-Math.min(...points.map(p=>p[axis]!));
 const nod=center(parseAnimationChoice({preset:'agree'})),shake=center(parseAnimationChoice({preset:'disagree'}));
 // Original eye poses retain a slight head tilt: the intended axis must
 // dominate clearly rather than demanding mechanically exact straight lines.
 assert(span(nod,1)>35);assert(span(nod,0)<10);assert(span(nod,1)>6*span(nod,0));
 assert(span(shake,0)>55);assert(span(shake,1)<10);assert(span(shake,0)>6*span(shake,1));
});
test('preview continuous trajectory agrees with native curve at every40ms frame',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'head-curve-'));try{
  const hardware=fileURLToPath(new URL('../../hardware/esp32-bringup/',import.meta.url)),binary=join(dir,'curve');
  execFileSync('c++',['-std=c++17','-O2','-I'+hardware,join(hardware,'preview/export_head_gestures.cc'),'-o',binary]);
  const samples=JSON.parse(execFileSync(binary,{encoding:'utf8'}));const ctx:any={window:{}};runInNewContext(await readFile(new URL('../ui/eye-geometry.js',import.meta.url),'utf8'),ctx);
  for(const [age,value] of samples)assert(Math.abs(ctx.window.RoundEyesGeometry.gestureValue('nod',age,4200)-value)<.00001,`age ${age}`);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('atomic head gestures preserve duration and reject too-short or unknown primitives',()=>{
 for(const preset of ['agree','disagree']){
  const plan=parseAnimationChoice({preset});assert.equal(plan.steps.length,1);assert.equal(opinionGesture(plan),preset);
  assert.deepEqual(paceAnimation(plan),plan);assert.equal(plan.steps.reduce((n,s)=>n+s.duration_ms,0),4200);
  assert(plan.steps.at(-1)!.duration_ms>=1000);
  const changed=parseAnimationChoice({...plan,steps:plan.steps.map(s=>({...s,duration_ms:3000,transition_ms:200}))});
  assert.equal(opinionGesture(changed),null);assert.equal(opinionGesture(changed,false),preset);assert(paceAnimation(changed).steps.every(s=>s.duration_ms>=1800));
 }
 assert.equal(requestedAnimation('你觉得对么？'),null);
 assert.throws(()=>parseAnimationChoice({scene:'bad',steps:[{emotion:'neutral',duration_ms:200,gesture:'nod'}]}));
 assert.throws(()=>parseAnimationChoice({scene:'bad',steps:[{emotion:'neutral',duration_ms:4200,gesture:'run_shell'}]}));
});

test('ambient expression uses requested gestures locally and lets the brain judge opinion questions',async()=>{
 const sent:any[]=[],modelInputs:string[]=[];
 const p=new VoicePipeline({animations:true,brain:{animation:async(text:string)=>{modelInputs.push(text);return parseAnimationChoice({preset:'disagree'});}},device:{animate:async(plan:any)=>{sent.push(plan);return {command_id:'a',applied_uptime_ms:0};},cancel:async()=>{}},asr:{},tts:{},output:{cancel:async()=>{}}}as any);
 await p.expression(new Uint8Array(),1,'owner',undefined,{text:'点点头',fast:false});
 await p.expression(new Uint8Array(),2,'owner',undefined,{text:'一加一等于三，你觉得对么？',fast:true});
 assert.deepEqual(modelInputs,['一加一等于三，你觉得对么？']);assert.deepEqual(sent.map(plan=>opinionGesture(plan)),['agree','disagree']);
 assert(sent.every(plan=>plan.steps.reduce((n:number,s:any)=>n+s.duration_ms,0)===4200));
});
test('a direct hearing check nods on the first utterance without a second command or model request',async()=>{
 const sent:any[]=[];const p=new VoicePipeline({animations:true,brain:{animation:async()=>{throw Error('a hearing check must be confirmed locally');}},device:{animate:async(plan:any)=>{sent.push(plan);return {command_id:'a',applied_uptime_ms:0};},cancel:async()=>{}},asr:{},tts:{},output:{cancel:async()=>{}}}as any);
 for(const [i,text]of ['你现在能听到我说话吗？','可以听到我说话么','你听得见吗','你能不能听见我讲话','你有没有在听我说话','你现在能听到我说什么东西吗？'].entries()){
  await p.expression(new Uint8Array(),i+1,'owner',undefined,{text,fast:false});assert.equal(opinionGesture(sent.at(-1)),'agree',text);
 }
 assert.equal(sent.length,6,'each hearing check immediately sends its own visible nod');
 const {conversationalAnimation}=await import('../src/voice/animation.js');
 for(const text of ['他说你能听到我说话吗','“你听得到吗”','如果你听到我说话会怎样','我听不到你说话','你能理解我说话的意思吗','你听不到我说话吗'])assert.equal(conversationalAnimation(text),null,text);
});

test('spoken chat and agent semantic text can animate opinions while retaining their reply path',async()=>{
 const sent:any[]=[];let modelCalls=0;
 const p=new VoicePipeline({animations:true,brain:{animation:async()=>{modelCalls++;return parseAnimationChoice({preset:'disagree'});},reaction:async()=>{throw Error('opinion needs a complete gesture');},reply:async function*(){yield '这是我的回应。';}},device:{animate:async(plan:any)=>{sent.push(plan);return {command_id:'a',applied_uptime_ms:0};},cancel:async()=>{}},asr:{transcribe:async()=> '一加一等于三，对不对？'},tts:{synthesize:async function*(){}},output:{cancel:async()=>{},finish:async()=>{}}}as any);
 assert.equal(await p.text('点点头',{speak:false,source:'agent'}),'这是我的回应。');
 assert.equal(await p.audio(new Uint8Array(32000)),'这是我的回应。');
 assert.equal(modelCalls,1);assert.deepEqual(sent.map(plan=>opinionGesture(plan)),['agree','disagree']);
});

test('ledger distinguishes stance gestures from the underlying eye label after reopening',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'opinion-ledger-'));let db=await Ledger.open(join(dir,'db'));
 try{
  await db.call('beginTurn',{id:'nod',mode:'ambient',started_at:1});await db.call('saveAnimation',{turn_id:'nod',plan:parseAnimationChoice({preset:'agree'}),source:'preset'});
  await db.close();db=await Ledger.open(join(dir,'db'));
  assert.deepEqual((await db.call('list',{})).items[0].gesture,{key:'agree',label:'点头认可'});
  assert.deepEqual((await db.call('detail',{id:'nod'})).turn.gesture,{key:'agree',label:'点头认可'});
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
