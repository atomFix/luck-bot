// A whole head gesture is evaluated continuously by gesture_v1 firmware.
// No sequence of look targets and no per-beat braking.
const step=(emotion,gesture)=>({emotion,duration_ms:4200,look_x:0,look_y:0,scale:1,shake:0,blink:0,blink_once:false,transition_ms:700,gesture});
export const OPINION_GESTURES={
 agree:{label:'点头认可',steps:[step('happy','nod')]},
 disagree:{label:'摇头不认可',steps:[step('neutral','head_shake')]},
};
export function opinionGesture(plan,canonicalOnly=true){
 const key=plan?.scene==='agree'?'agree':plan?.scene==='disagree'?'disagree':null;
 if(!key||!Array.isArray(plan.steps))return null;
 if(JSON.stringify(plan.steps)===JSON.stringify(OPINION_GESTURES[key].steps))return key;
 // Read historical or custom gestures without changing stored plans or granting
 // them the canonical fast pacing exception.
 if(!canonicalOnly){
  if(plan.steps.some(s=>s.gesture===(key==='agree'?'nod':'head_shake')))return key;
  const axis=key==='agree'?'look_y':'look_x',other=key==='agree'?'look_x':'look_y';
  const values=plan.steps.map(s=>s[axis]??0),cross=plan.steps.map(s=>s[other]??0);
  if(Math.max(...values)>.2&&Math.min(...values)<-.2&&Math.max(...cross)-Math.min(...cross)<.15)return key;
 }
 return null;
}
// Selects the semantic route only; this never decides whether a claim is true.
export function asksForOpinion(text){return /对(?:吗|么|不对)|是否正确|是不是正确|同不同意|认不认(?:可|同)|同意(?:吗|么)|赞不赞同|赞同(?:吗|么)|认同(?:吗|么)|认可(?:吗|么)|你(?:觉得|认为)(?:呢|如何|怎么样)|你(?:是否|会)?(?:觉得|认为|同意|赞同|赞成|认同|认可).*(?:吗|么)/su.test(text);}
