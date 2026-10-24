import type {Reaction,Emotion} from '../contracts.js';
// This path is deliberately an allowlist, not a general sentiment classifier.
export function localReaction(input:string):Reaction|null {
 if(input.length>60||/[?？“”"'「」『』]/u.test(input))return null;
 const text=input.replace(/[\s，,。.!！、]/gu,'');
 if(/不|没|未|(?<!特)别|无|非|如果|假如|要是|可能|希望|以为|觉得你|他说|她说|说我|听说|据说|朋友|别人|他们|她们|他|她|你们|请|让|显示|吗|呢|么|但是|可是|不过|却|虽然|才怪|呵呵|反话|开玩笑|装|想|应该|难道|为什么|怎么|说的|刚才/gu.test(text))return null;
 const finish=(emotion:Emotion):Reaction=>({emotion,hold_ms:2500});
 if(/^(你好|您好|早上好|晚上好|早安|晚安)$/.test(text))return finish(text==='晚安'?'sleepy':'happy');
 if(/^哈{2,8}$/.test(text))return finish('laughing');
 const match=/^(?:(?:今天|现在|最近))?(?:我|我们)(?:(?:现在|今天|最近|真的|确实|觉得|感觉|感到|心里|的|特别|很|非常|太|好|真|有点|有些|也|都))*?(开心|高兴|快乐|兴奋|难过|伤心|低落|生气|愤怒|累|疲惫|困|困倦|惊讶|吃惊)(?:了|啊|呀|啦|极了|得很)*$/.exec(text);
 if(!match)return null;
 const emotion=match[1]!;
 return finish(/开心|高兴|快乐|兴奋/.test(emotion)?'happy':/难过|伤心|低落|生气|愤怒/.test(emotion)?'loving':/累|疲惫/.test(emotion)?'relaxed':/困/.test(emotion)?'sleepy':'surprised');
}
