import test from 'node:test';import assert from 'node:assert/strict';import {localReaction} from '../src/voice/fast-reaction.js';
test('explicit first person simple emotions and greetings use approved local eye reactions',()=>{for(const [text,emotion] of [['我今天特别开心','happy'],['今天我确实感觉特别开心','happy'],['我现在有点难过','loving'],['我好累啊','loving'],['我很生气','loving'],['我太困了','loving'],['你好','happy'],['哈哈哈','laughing']]){assert.equal(localReaction(text!)?.emotion,emotion);assert.equal(localReaction(text!)?.hold_ms,2500);}});
test('local classifier defers negation context quotes hypotheticals questions mixed emotions and instructions',()=>{for(const text of ['我不开心','我不是不开心','我没那么开心','他今天特别开心','如果我今天开心就好了','你觉得我开心吗','我开心才怪','真开心啊呵呵','我很开心但是也很难过','请显示开心','我希望我开心','他说我很开心','“我很开心”','我开心吗','我开','为什么','我以为我很开心','我朋友很开心','我刚才说的不是这个意思'])assert.equal(localReaction(text),null,text);});
test('possessive noun phrases and ASR fragments always defer to semantic model',()=>{for(const text of ['我的快乐','我的难过','我今天的快乐','我现在的开心','我最近的困倦'])assert.equal(localReaction(text),null,text);});

test('robot responds as a caring playful companion rather than copying tiredness or sleepiness',()=>{
 for(const text of ['我好累啊','累死我了','我太困了'])assert.equal(localReaction(text)?.emotion,'loving',text);
 for(const [text,emotion]of [['你怎么这么可爱','embarrassed'],['你真可爱','embarrassed'],['你是不是又偷懒了','silly'],['今天终于搞定了','happy'],['我要开始工作了','confident'],['这个代码怎么又报错','thinking']])assert.equal(localReaction(text!)?.emotion,emotion,text);
});
test('repeated celebrations vary based on this speakers actual previous response',()=>{
 const history=[{role:'user' as const,content:'我今天很开心'},{role:'assistant' as const,content:'表情：happy'}];
 assert.equal(localReaction('我今天真的特别开心',history)?.emotion,'laughing');
 assert.equal(localReaction('我今天真的特别开心',[])?.emotion,'happy');
});
test('playful fast interactions remain whole phrases and defer hostile context and instructions',()=>{
 for(const text of ['你真可爱才怪','如果你真可爱就好了','他说你真可爱','请显示你真可爱','你是不是又偷懒了我真的很生气','这个代码怎么又报错我不想活了','我要开始工作了但是很难过'])assert.equal(localReaction(text),null,text);
});

test('three consecutive celebrations avoid both of the last two reactions',()=>{assert.equal(localReaction('我很开心',[{role:'assistant',content:'表情：happy'},{role:'assistant',content:'表情：laughing'}])?.emotion,'winking');});
