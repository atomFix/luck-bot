import type {Reaction,Emotion,Message} from '../contracts.js';
// Whole-phrase social responses from the robot's perspective. Uncertain semantics defer.
export function localReaction(input:string,history:Message[]=[]):Reaction|null {
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
