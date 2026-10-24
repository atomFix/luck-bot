import type {Reaction,Emotion,Message} from '../contracts.js';
// Only explicit whole-sentence eye requests; no keyword-only matching in stories.
export function requestedExpression(input:string):Reaction|null {
 if(input.length>60||/[“”"'「」『』]/u.test(input))return null;
 const text=input.replace(/[\s，,。.!！、]/gu,'').replace(/^(?:嗯|你好|小智|Luck)+/u,'');
 if(/^(?:你)?(?:给我)?给点回应(?:吧|呀|呗)?$/.test(text))return {emotion:'winking',hold_ms:2500};
 if(!/^(?:请|现在|你|给我|表演|表现|表达|展示|显示|做|来)/.test(text)&&!/(?:一下|试试)/.test(text))return null;
 const match=/^(?:请)?(?:现在)?(?:你)?(?:给我)?(?:(?:表演|表现|表达|展示|显示|做|来)(?:一下|一个)?)?(?:自己的)?(大笑|笑|开心|尴尬|害羞|好奇心|好奇|思考|困惑|惊讶|眨眼|调皮|生气|难过|伤心|哭泣|自信|专注|放松|困倦|瞌睡)(?:的)?(?:眼神|表情)?(?:一下|一个)?(?:试试)?(?:吧|呀|呗)?[?？]?$/.exec(text);
 if(!match)return null;
 const map:Record<string,Emotion>={大笑:'laughing',笑:'happy',开心:'happy',尴尬:'embarrassed',害羞:'embarrassed',好奇心:'surprised',好奇:'surprised',思考:'thinking',困惑:'confused',惊讶:'surprised',眨眼:'winking',调皮:'silly',生气:'angry',难过:'sad',伤心:'sad',哭泣:'crying',自信:'confident',专注:'neutral',放松:'relaxed',困倦:'sleepy',瞌睡:'sleepy'};
 return {emotion:map[match[1]!]!,hold_ms:2500};
}
// Whole-phrase social responses from the robot's perspective. Uncertain semantics defer.
export function localReaction(input:string,history:Message[]=[]):Reaction|null {
 const requested=requestedExpression(input);if(requested)return requested;
 if(input.length>60||/[“”"'「」『』]/u.test(input))return null;
 const text=input.replace(/[\s，,。.!！、]/gu,'');
 const finish=(choices:Emotion[]):Reaction=>{
  const recent=history.filter(m=>m.role==='assistant').slice(-2).map(m=>m.content);
  const emotion=choices.find(e=>!recent.includes(`表情：${e}`))??choices.find(e=>recent.at(-1)!==`表情：${e}`)??choices[0]!;
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
