// Native animation_v1 already supports these poses and timings. Keep the two
// full gestures canonical so generic emotional pacing cannot stretch each beat.
const step=(emotion,duration_ms,motion={})=>({emotion,duration_ms,look_x:.04,look_y:-.03,scale:1,shake:0,blink:0,blink_once:false,transition_ms:280,...motion});
// Two sinusoidal cycles sampled within the existing 12-step wire limit.
// The second cycle decays gently; the native spring retains velocity between beats.
const wave=[0,.72,.445,-.445,-.72,0,.58,.36,-.36,-.58,0];
const gesture=(emotion,axis)=>[
 ...wave.map(value=>step(emotion,280,{[axis]:value+(axis==='look_x'?.04:-.03),transition_ms:420})),
 step(emotion,1000,{transition_ms:650,blink:.7}),
];
export const OPINION_GESTURES={
 agree:{label:'点头认可',steps:gesture('happy','look_y')},
 disagree:{label:'摇头不认可',steps:gesture('neutral','look_x')},
};
export function opinionGesture(plan,canonicalOnly=true){
 const key=plan?.scene==='agree'?'agree':plan?.scene==='disagree'?'disagree':null;
 if(!key||!Array.isArray(plan.steps))return null;
 if(JSON.stringify(plan.steps)===JSON.stringify(OPINION_GESTURES[key].steps))return key;
 // Read historical or custom gestures without changing stored plans or granting
 // them the canonical fast pacing exception.
 if(!canonicalOnly){
  const axis=key==='agree'?'look_y':'look_x',other=key==='agree'?'look_x':'look_y';
  const values=plan.steps.map(s=>s[axis]??0),cross=plan.steps.map(s=>s[other]??0);
  if(Math.max(...values)>.2&&Math.min(...values)<-.2&&Math.max(...cross)-Math.min(...cross)<.15)return key;
 }
 return null;
}
// Selects the semantic route only; this never decides whether a claim is true.
export function asksForOpinion(text){return /对(?:吗|么|不对)|是否正确|是不是正确|同不同意|认不认(?:可|同)|同意(?:吗|么)|赞不赞同|赞同(?:吗|么)|认同(?:吗|么)|认可(?:吗|么)|你(?:觉得|认为)(?:呢|如何|怎么样)|你(?:是否|会)?(?:觉得|认为|同意|赞同|赞成|认同|认可).*(?:吗|么)/su.test(text);}
