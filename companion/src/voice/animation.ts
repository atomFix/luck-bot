import {z} from 'zod';
import {EMOTIONS,type Emotion,type Reaction} from '../contracts.js';
const StepSchema=z.object({emotion:z.enum(EMOTIONS),duration_ms:z.number().int().min(200).max(5000),look_x:z.number().min(-1).max(1).default(0),look_y:z.number().min(-1).max(1).default(0),scale:z.number().min(.65).max(1.2).default(1),shake:z.number().min(0).max(1).default(0),blink:z.number().min(0).max(3).default(1),blink_once:z.boolean().default(false),transition_ms:z.number().int().min(120).max(1500).default(300)}).strict();
export const AnimationSchema=z.object({scene:z.string().regex(/^[a-z_]{1,32}$/),steps:z.array(StepSchema).min(1).max(12)}).strict().refine(p=>p.steps.reduce((n,s)=>n+s.duration_ms,0)<=30000,{message:'animation_duration'});
export type AnimationPlan=z.infer<typeof AnimationSchema>;
export type AnimationStep=AnimationPlan['steps'][number];
const step=(emotion:Emotion,duration_ms:number,motion:Partial<AnimationStep>={})=>StepSchema.parse({emotion,duration_ms,...motion});
export const SCENES={
 horror:{label:'恐怖与警惕',steps:[step('confused',800,{look_x:-.65}),step('shocked',550,{scale:1.15,blink:0,transition_ms:150}),step('shocked',1700,{scale:.68,shake:1,blink:1.7}),step('angry',800,{scale:1.05,look_x:.15,transition_ms:150}),step('surprised',1500,{scale:.82,shake:.3,look_x:.6}),step('thinking',1800,{look_x:-.35,blink:1.4}),step('neutral',2200,{transition_ms:1200})]},
 relief:{label:'虚惊一场',steps:[step('surprised',500,{scale:1.15}),step('confused',600,{look_x:.6}),step('relaxed',1800,{scale:.9,transition_ms:850}),step('embarrassed',1200,{scale:.8,look_x:-.4}),step('winking',650,{blink:0}),step('neutral',1800,{transition_ms:1000})]},
 celebration:{label:'庆祝好消息',steps:[step('surprised',450,{scale:1.15,transition_ms:180}),step('happy',1050,{scale:1.16,look_y:-.45,transition_ms:180}),step('laughing',1600,{scale:1.18,shake:.18,blink:.4}),step('winking',850,{look_x:.55,blink:0}),step('happy',900,{scale:1.08}),step('relaxed',1500),step('neutral',1400,{transition_ms:900})]},
 comfort:{label:'安慰与陪伴',steps:[step('thinking',700,{scale:.95,look_y:.25}),step('sad',800),step('loving',3000,{scale:1.12,look_y:.1,transition_ms:650,blink:.4}),step('loving',1800,{look_x:.4,blink:.5}),step('neutral',2000,{transition_ms:1200})]},
 teased:{label:'被逗后的反应',steps:[step('confused',550,{scale:1.12}),step('embarrassed',1100,{scale:.76,look_x:-.65,look_y:.4}),step('angry',500,{scale:1.1,look_x:.25,transition_ms:150}),step('silly',1200,{scale:1.1,look_x:.55}),step('winking',900,{look_x:-.45,blink:0}),step('relaxed',1500)]},
 problem:{label:'一起琢磨问题',steps:[step('thinking',1600,{look_x:.7,look_y:-.65,scale:1.02}),step('confused',850,{look_x:-.55}),step('surprised',450,{scale:1.15,transition_ms:160}),step('confident',1300,{scale:1.1,look_y:-.25}),step('winking',800),step('neutral',1600,{transition_ms:900})]},
 curious:{label:'好奇地观察',steps:[step('thinking',650,{look_x:-.7}),step('surprised',1200,{scale:1.16,look_x:.55,look_y:-.35}),step('confused',900,{look_y:-.6,look_x:-.5}),step('surprised',1400,{look_x:.55,scale:1.1}),step('neutral',1700,{transition_ms:900})]},
 greeting:{label:'打招呼',steps:[step('surprised',400,{scale:1.12,transition_ms:180}),step('happy',1100,{scale:1.16,look_y:-.3}),step('winking',750,{look_x:.55,blink:0}),step('neutral',1400,{transition_ms:800})]},
} as const;
export type Scene=keyof typeof SCENES;
export function parseAnimationChoice(value:unknown):AnimationPlan{
 const choice=z.union([z.object({preset:z.enum(Object.keys(SCENES) as [Scene,...Scene[]])}).strict(),AnimationSchema]).parse(value);
 return 'preset'in choice?AnimationSchema.parse({scene:choice.preset,steps:SCENES[choice.preset].steps}):choice;
}
export function reactionAnimation(reaction:Reaction):AnimationPlan{return AnimationSchema.parse({scene:'requested',steps:[step(reaction.emotion,reaction.hold_ms)]});}
export function primaryEmotion(plan:AnimationPlan):Emotion{const preferred:Record<string,Emotion>={horror:'shocked',relief:'relaxed',celebration:'happy',comfort:'loving',teased:'silly',problem:'thinking',curious:'surprised',greeting:'happy',shy:'embarrassed'};const target=preferred[plan.scene];if(target&&plan.steps.some(s=>s.emotion===target))return target;return [...plan.steps].filter(s=>s.emotion!=='neutral').sort((a,b)=>b.duration_ms-a.duration_ms)[0]?.emotion??'neutral';}

export function animationSource(plan:AnimationPlan){return plan.scene in SCENES&&JSON.stringify(plan.steps)===JSON.stringify(SCENES[plan.scene as Scene].steps)?'preset':'model';}
export function animationPosition(plan:AnimationPlan,elapsed:number){let age=Math.max(0,elapsed);for(let index=0;index<plan.steps.length;index++){const step=plan.steps[index]!;if(age<step.duration_ms)return {scene:plan.scene,step:index+1,emotion:step.emotion,remaining_ms:step.duration_ms-age};age-=step.duration_ms;}return {scene:plan.scene,step:0,emotion:'neutral',remaining_ms:0};}

export function socialAnimation(reaction:Reaction,text:string):AnimationPlan{
 if(/^(你好|您好|早上好|晚上好|早安)[，。!！\s]*$/.test(text))return parseAnimationChoice({preset:'greeting'});
 if(['happy','laughing','funny'].includes(reaction.emotion))return parseAnimationChoice({preset:'celebration'});
 if(reaction.emotion==='loving')return parseAnimationChoice({preset:'comfort'});
 if(reaction.emotion==='silly')return parseAnimationChoice({preset:'teased'});
 if(reaction.emotion==='embarrassed')return AnimationSchema.parse({scene:'shy',steps:[step('surprised',500),step('embarrassed',2200,{look_x:.25}),step('winking',800),step('relaxed',1500)]});
 if(reaction.emotion==='thinking')return AnimationSchema.parse({scene:'thinking',steps:[step('thinking',1800,{look_x:.3,look_y:-.2}),step('confused',900),step('thinking',2200)]});
 return reactionAnimation(reaction);
}
