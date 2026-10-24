import type {Reaction,Emotion,Message} from '../contracts.js';
// Catalog labels and intentional synonyms; each maps to one supported wire emotion.
export const EXPRESSION_NAMES:Record<string,Emotion>={专注:'neutral',开心:'happy',笑:'happy',大笑:'laughing',逗趣:'funny',难过:'sad',伤心:'sad',生气:'angry',哭泣:'crying',关心:'loving',害羞:'embarrassed',尴尬:'embarrassed',惊喜:'surprised',惊讶:'surprised',好奇心:'surprised',好奇:'surprised',震惊:'shocked',思考:'thinking',眨眼:'winking',淡定:'cool',冷静:'cool',放松:'relaxed',满足:'delicious',亲昵:'kissy',自信:'confident',困倦:'sleepy',瞌睡:'sleepy',调皮:'silly',困惑:'confused',疑惑:'confused',瞪大双眼:'wide_eyes',瞪大眼睛:'wide_eyes',睁大眼睛:'wide_eyes',超大双眼:'mega_eyes',双眼占满屏幕:'mega_eyes',两只眼睛占满屏幕:'mega_eyes',眼睛变得超级大:'mega_eyes',眼睛超级大:'mega_eyes',超大左眼:'giant_left',超大右眼:'giant_right',左眼超级大:'giant_left',右眼超级大:'giant_right',单眼占满屏幕:'giant_left',超大单眼:'giant_left',一只眼睛超级大:'giant_left'};
const names=Object.keys(EXPRESSION_NAMES).sort((a,b)=>b.length-a.length).join('|');
const prefix='(?:(?:那|那么|然后))?(?:请|麻烦)?(?:现在|再|先)?(?:你)?(?:能不能|可不可以|能|可以)?(?:给我|帮我)?';
const suffix='(?:试试)?(?:可以吗|行吗|好吗|好不好|可不可以|行不行|吗|吧|呀|呗|呢)?';
const expressionRequest=new RegExp('^'+prefix+'(?:(?:表演|表现|表达|展示|显示|做|来|变成|切换成|换成|变)(?:一下|一个|个)?)?(?:自己的)?('+names+')(?:的)?(?:眼神|表情|样子)?(?:一下|一个|一点)?'+suffix+'$');
function commandText(input:string):string|null {
 if(input.length>60||/[“”"'「」『』]/u.test(input))return null;
 return input.replace(/[\s，,。.!！?？、]/gu,'').replace(/^(?:嗯|呃|额|啊|哦|你好|小智|Luck)+/iu,'');
}
export function inEyeRequestContext(history:Message[]):boolean {
 // Only the immediately preceding command/acknowledgement can make a bare label a command.
 for(const m of history.filter(m=>m.role==='assistant').slice(-2).reverse()){
  if(/；动画：acknowledge(?:；|$)/.test(m.content))continue;
  return /；动画：requested(?:_direction)?(?:；|$)/.test(m.content);
 }
 return false;
}
// Whole sentences only: statements, stories, negations and quotations defer to the model.
export function requestedExpression(input:string,history:Message[]=[]):Reaction|null {
 const text=commandText(input);if(!text)return null;
 if(/^(?:你)?(?:给我)?给点回应(?:吧|呀|呗)?$/.test(text))return {emotion:'winking',hold_ms:2500};
 const match=expressionRequest.exec(text);if(!match)return null;
 const instruction=text.replace(match[1]!,'');
 if(!/你|请|麻烦|给我|帮我|表演|表现|表达|展示|显示|做|来|变|换|一下|一个|一点|试试|眼神|表情|样子|现在|再|先/.test(instruction)&&!/瞪大|睁大|占满|超级大/.test(match[1]!)&&!inEyeRequestContext(history))return null;
 return {emotion:EXPRESSION_NAMES[match[1]!]!,hold_ms:2500};
}
export function requestedDirection(input:string):{look_x:number;look_y:number}|null {
 const text=commandText(input);if(!text)return null;
 const m=new RegExp('^'+prefix+'(?:向|往)?(?:看向|看|看看)?(左上|右上|左下|右下|左边|右边|上面|下面|左|右|上|下|抬头|低头)(?:看一下|看看|看|一点点|一点|一下)?'+suffix+'$').exec(text);
 if(!m)return null;
 const d=m[1]!;
 return {look_x:d.includes('左')?-1:d.includes('右')?1:0,look_y:/上|抬头/.test(d)?-1:/下|低头/.test(d)?1:0};
}
// Whole-phrase social responses from the robot's perspective. Uncertain semantics defer.
export function localReaction(input:string,history:Message[]=[]):Reaction|null {
 const requested=requestedExpression(input,history);if(requested)return requested;
 if(input.length>60||/[“”"'「」『』]/u.test(input))return null;
 const text=input.replace(/[\s，,。.!！、]/gu,'');
 const finish=(choices:Emotion[]):Reaction=>{
  const recent=history.filter(m=>m.role==='assistant').slice(-2).map(m=>/^表情：([a-z_]+)/.exec(m.content)?.[1]);
  const emotion=choices.find(e=>!recent.includes(e))??choices.find(e=>recent.at(-1)!==e)??choices[0]!;
  return {emotion,hold_ms:2500};
 };
 // Exact social exchanges are safe even when their natural wording contains a question.
 if(/^(?:你怎么这么可爱|你真可爱|你好可爱|你太可爱了)[?？]?$/.test(text))return finish(['embarrassed','winking']);
 if(/^你是不是又偷懒了[?？]?$/.test(text))return finish(['silly','embarrassed']);
 if(/^(?:我)?(?:今天)?终于(?:搞定|弄好|完成|成功)了$/.test(text))return finish(['happy','laughing','winking']);
 if(/^我要开始(?:工作|学习)了$/.test(text))return finish(['confident','winking']);
 if(/^这个代码怎么又报错[?？]?$/.test(text))return finish(['thinking','confused']);
 if(/^(?:累死我了|困死我了)$/.test(text))return finish(['loving']);
 if(/[?？]/u.test(text))return null;
 if(/不|没|未|(?<!特)别|无|非|如果|假如|要是|可能|希望|以为|觉得你|他说|她说|说我|听说|据说|朋友|别人|他们|她们|他|她|你们|请|让|显示|吗|呢|么|但是|可是|不过|却|虽然|才怪|呵呵|反话|开玩笑|装|想|应该|难道|为什么|怎么|说的|刚才/gu.test(text))return null;
 if(/^(你好|您好|早上好|晚上好|早安|晚安)$/.test(text))return finish(text==='晚安'?['relaxed','winking']:['happy','winking']);
 if(/^哈{2,8}$/.test(text))return finish(['laughing','funny']);
 const match=/^(?:(?:今天|现在|最近))?(?:我|我们)(?:(?:现在|今天|最近|真的|确实|觉得|感觉|感到|心里|特别|很|非常|太|好|真|有点|有些|也|都))*?(开心|高兴|快乐|兴奋|难过|伤心|低落|生气|愤怒|累|疲惫|困|困倦|惊讶|吃惊)(?:了|啊|呀|啦|极了|得很)*$/.exec(text);
 if(!match)return null;
 const feeling=match[1]!;
 return finish(/开心|高兴|快乐|兴奋/.test(feeling)?['happy','laughing','winking']:/惊讶|吃惊/.test(feeling)?['surprised','confused']:['loving']);
}
