import {z} from 'zod';
import {requestedExpression,requestedDirection} from './fast-reaction.js';
import type {Message} from '../contracts.js';
import {EMOTIONS,type Emotion,type Reaction} from '../contracts.js';
const StepSchema=z.object({emotion:z.enum(EMOTIONS),duration_ms:z.number().int().min(200).max(5000),look_x:z.number().min(-1).max(1).default(0),look_y:z.number().min(-1).max(1).default(0),scale:z.number().min(.65).max(1.2).default(1),shake:z.number().min(0).max(1).default(0),blink:z.number().min(0).max(3).default(1),blink_once:z.boolean().default(false),transition_ms:z.number().int().min(120).max(1500).default(300)}).strict();
export const AnimationSchema=z.object({scene:z.string().regex(/^[a-z_]{1,32}$/),steps:z.array(StepSchema).min(1).max(12)}).strict().refine(p=>p.steps.reduce((n,s)=>n+s.duration_ms,0)<=30000,{message:'animation_duration'});
export type AnimationPlan=z.infer<typeof AnimationSchema>;
export type AnimationStep=AnimationPlan['steps'][number];
const step=(emotion:Emotion,duration_ms:number,motion:Partial<AnimationStep>={})=>StepSchema.parse({emotion,duration_ms,transition_ms:750,...motion});
export const SCENES={
 horror:{label:'恐怖与警惕',steps:[step('confused',2400,{look_x:-.45}),step('shocked',2600,{scale:1.15,blink:0,transition_ms:650}),step('shocked',4000,{scale:.72,shake:.65,blink:1.3,transition_ms:1000}),step('thinking',3500,{scale:.95,look_x:.3,transition_ms:1100})]},
 relief:{label:'虚惊一场',steps:[step('confused',2200,{look_x:.35}),step('relaxed',4000,{scale:.95,transition_ms:1100}),step('neutral',2600,{transition_ms:1200})]},
 celebration:{label:'庆祝好消息',steps:[step('happy',3600,{scale:1.15,look_y:-.3}),step('laughing',3200,{scale:1.16,shake:.1,blink:.5}),step('relaxed',3400,{transition_ms:1000}),step('neutral',2600,{transition_ms:1200})]},
 comfort:{label:'安慰与陪伴',steps:[step('loving',4500,{scale:1.08,transition_ms:850,blink:.4}),step('loving',4000,{look_x:.2,blink:.5,transition_ms:1000}),step('neutral',2800,{transition_ms:1200})]},
 teased:{label:'被逗后的反应',steps:[step('embarrassed',2800,{scale:.82,look_x:-.4,look_y:.2}),step('silly',3200,{scale:1.08,look_x:.35}),step('relaxed',3400,{transition_ms:1100})]},
 problem:{label:'一起琢磨问题',steps:[step('thinking',4000,{look_x:.5,look_y:-.45}),step('confused',2600,{look_x:-.35}),step('thinking',4000,{transition_ms:1000})]},
 curious:{label:'好奇地观察',steps:[step('surprised',3200,{scale:1.12,look_x:.4,look_y:-.2}),step('thinking',2800,{look_x:-.3}),step('surprised',3200,{scale:1.05,transition_ms:1000})]},
 greeting:{label:'打招呼',steps:[step('happy',3000,{scale:1.1,look_y:-.2}),step('winking',2200,{look_x:.35,blink:0}),step('neutral',2600,{transition_ms:1100})]},
} as const;
export type Scene=keyof typeof SCENES;
export function parseAnimationChoice(value:unknown):AnimationPlan{
 const choice=z.union([z.object({preset:z.enum(Object.keys(SCENES) as [Scene,...Scene[]])}).strict(),AnimationSchema]).parse(value);
 return 'preset'in choice?AnimationSchema.parse({scene:choice.preset,steps:SCENES[choice.preset].steps}):choice;
}
export function reactionAnimation(reaction:Reaction):AnimationPlan{return AnimationSchema.parse({scene:'requested',steps:[step(reaction.emotion,reaction.hold_ms)]});}
// Explicit eye commands bypass free-form persona interpretation, even with fast reactions disabled.
export function requestedAnimation(text:string,history:Message[]=[],lastEmotion:Emotion='neutral'):AnimationPlan|null {
 const reaction=requestedExpression(text,history);
 if(reaction)return reactionAnimation(reaction);
 const direction=requestedDirection(text);
 return direction?AnimationSchema.parse({scene:'requested_direction',steps:[step(lastEmotion,3600,{...direction,transition_ms:800})]}):null;
}
export function primaryEmotion(plan:AnimationPlan):Emotion{const preferred:Record<string,Emotion>={horror:'shocked',relief:'relaxed',celebration:'happy',comfort:'loving',teased:'silly',problem:'thinking',curious:'surprised',greeting:'happy',shy:'embarrassed'};const target=preferred[plan.scene];if(target&&plan.steps.some(s=>s.emotion===target))return target;return [...plan.steps].filter(s=>s.emotion!=='neutral').sort((a,b)=>b.duration_ms-a.duration_ms)[0]?.emotion??'neutral';}

export function animationSource(plan:AnimationPlan){return plan.scene in SCENES&&JSON.stringify(plan.steps)===JSON.stringify(SCENES[plan.scene as Scene].steps)?'preset':'model';}
export function animationPosition(plan:AnimationPlan,elapsed:number){let age=Math.max(0,elapsed);for(let index=0;index<plan.steps.length;index++){const step=plan.steps[index]!;if(age<step.duration_ms)return {scene:plan.scene,step:index+1,emotion:step.emotion,remaining_ms:step.duration_ms-age};age-=step.duration_ms;}return {scene:plan.scene,step:0,emotion:'neutral',remaining_ms:0};}

export function socialAnimation(reaction:Reaction,text:string):AnimationPlan{
 if(/^(你好|您好|早上好|晚上好|早安)[，。!！\s]*$/.test(text))return parseAnimationChoice({preset:'greeting'});
 const motion:Partial<AnimationStep>=reaction.emotion==='embarrassed'?{scale:.84,look_x:-.35}:reaction.emotion==='thinking'?{look_x:.35,look_y:-.25}:reaction.emotion==='loving'?{blink:.5,scale:1.06}:['happy','laughing','funny'].includes(reaction.emotion)?{scale:1.12}:{};
 return AnimationSchema.parse({scene:'social_'+reaction.emotion,steps:[step(reaction.emotion,3600,motion),step('neutral',2400,{transition_ms:1100})]});
}

// Keep a readable hold after easing. Fit the existing 30s wire limit without dropping steps.
export function paceAnimation(plan:AnimationPlan):AnimationPlan {
 const steps=plan.steps.map(s=>{
  const transition_ms=Math.max(600,Math.min(1200,s.transition_ms));
  const minimum=Math.max(s.emotion==='neutral'?1800:2200,transition_ms+1000);
  return {...s,transition_ms,duration_ms:Math.max(minimum,s.duration_ms),minimum};
 });
 const base=steps.reduce((n,s)=>n+s.minimum,0),extra=steps.reduce((n,s)=>n+s.duration_ms-s.minimum,0);
 const factor=extra?Math.min(1,(30000-base)/extra):1;
 return AnimationSchema.parse({...plan,steps:steps.map(({minimum,...s})=>({...s,duration_ms:minimum+Math.floor((s.duration_ms-minimum)*factor)}))});
}
export function animationReplacementDelay(plan:AnimationPlan,elapsed:number):number {
 let age=Math.max(0,elapsed);
 for(const step of plan.steps){
  if(age<step.duration_ms)return step.emotion==='neutral'?0:Math.min(600,Math.max(0,1800-age));
  age-=step.duration_ms;
 }
 return 0;
}
// Whole-phrase repair/acknowledgement; stories and mixed meanings still go to the model.
export function conversationalAnimation(text:string,current?:string,lastEmotion?:string):AnimationPlan|null {
 const t=text.replace(/[\s，,。.!！?？、]/gu,'').replace(/^(?:嗯|呃|啊)+/u,'');
 if((!t&&/[\p{L}\p{N}]/u.test(text))||/^(?:哦+|好|好的|好吧|这样啊|知道了)$/.test(t)){
  const emotion=EMOTIONS.find(e=>e===current)??'neutral';
  return AnimationSchema.parse({scene:'acknowledge',steps:[step(emotion,2600,{blink_once:true,transition_ms:650})]});
 }
 if(t!=='换'&&/^(?:(?:你这|这|你现在)(?:是)?(?:什么|啥)表情)?(?:你)?(?:再|请|给我|先)?换(?:一下|一个|个)?(?:其他|别的|新的|不同的)?(?:的)?(?:表情|眼神)?(?:吧|呀)?$/.test(t)){
  const choices:Emotion[]=['thinking','cool','surprised','confident','embarrassed','winking'];
  const last=EMOTIONS.find(e=>e===(lastEmotion??current));const index=last?choices.indexOf(last):-1;
  const emotion=choices[(index+1)%choices.length]!;
  return AnimationSchema.parse({scene:'requested_change',steps:[step(emotion,3600,{transition_ms:700,look_x:emotion==='thinking'?.3:0})]});
 }
 if(/^(?:你)?(?:现在|刚才)?(?:是)?(?:什么|啥)(?:表情|眼神)(?:啊|呀)?$/.test(t)){
  const emotion=EMOTIONS.find(e=>e===current)??'neutral';
  return AnimationSchema.parse({scene:'acknowledge',steps:[step(emotion,3000,{blink_once:true,transition_ms:650})]});
 }
 if(/^(?:你)?(?:现在)?(?:还)?(?:能|可以)?听(?:到|见|清)(?:我)?(?:说话|讲话|说什么|说什么东西)?(?:吗|么|了|了吗)?$/.test(t))
  return AnimationSchema.parse({scene:'acknowledge',steps:[step('neutral',3000,{blink_once:true,scale:1.12,look_y:-.3,transition_ms:650})]});
 if(/^(?:你)?(?:先|再)?(?:别|不要)(?:老是|一直|总是)?笑(?:了)?$/.test(t)||/^(?:你|你们)?(?:怎么|是不是)?(?:又|都|总是|一直)?(?:乱回|没听懂|听不懂|理解错了)(?:了|啊|呀|我的意思)?$/.test(t)||/^(?:我刚才说的不是这个意思|不是这个意思|别乱回了|你别乱笑|认真听我说)$/.test(t))
  return AnimationSchema.parse({scene:'repair',steps:[step('thinking',4000,{scale:1,look_x:0,blink:.6,transition_ms:800})]});
 return null;
}
