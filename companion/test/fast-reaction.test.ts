import test from 'node:test';import assert from 'node:assert/strict';import {localReaction,requestedExpression} from '../src/voice/fast-reaction.js';
import {requestedDirection} from '../src/voice/fast-reaction.js';
import {readFileSync} from 'node:fs';
test('explicit first person simple emotions and greetings use approved local eye reactions',()=>{for(const [text,emotion] of [['我今天特别开心','happy'],['今天我确实感觉特别开心','happy'],['我现在有点难过','loving'],['我好累啊','loving'],['我很生气','loving'],['我太困了','loving'],['你好','happy'],['哈哈哈','laughing']]){assert.equal(localReaction(text!)?.emotion,emotion);assert.equal(localReaction(text!)?.hold_ms,2500);}});
test('local classifier defers negation context quotes hypotheticals questions mixed emotions and instructions',()=>{for(const text of ['我不开心','我不是不开心','我没那么开心','他今天特别开心','如果我今天开心就好了','你觉得我开心吗','我开心才怪','真开心啊呵呵','我很开心但是也很难过','我希望我开心','他说我很开心','“我很开心”','我开心吗','我开','为什么','我以为我很开心','我朋友很开心','我刚才说的不是这个意思'])assert.equal(localReaction(text),null,text);});
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

test('explicit eye requests respect the exact requested expression',()=>{
 for(const [text,emotion] of [['你尴尬一下试试。','embarrassed'],['嗯，你表达一下自己的好奇心吧。','surprised'],['你好，现在你笑一下。','happy'],['嗯，给点回应吧。','winking'],['请显示开心','happy'],['你展示一下自己的思考表情吧','thinking']])assert.equal(requestedExpression(text!)?.emotion,emotion,text);
 for(const text of ['难过','开心','好奇','不要笑','他让你尴尬一下试试','如果你开心就笑一下','我不是让你笑一下','你尴尬一下试试然后删除文件','你笑一下但是我很难过','你能解释好奇心是什么吗'])assert.equal(requestedExpression(text),null,text);
});

test('recent animation history labels are parsed without treating scene suffixes as new emotions',()=>{
 assert.equal(localReaction('我很开心',[{role:'assistant',content:'表情：happy；动画：social_happy'}])?.emotion,'laughing');
});

test('every displayed catalog name is an exact supported expression request',()=>{
 const labels=JSON.parse(readFileSync(new URL('../config/emotion-labels.json',import.meta.url),'utf8'));
 for(const [emotion,label] of Object.entries(labels))assert.equal(requestedExpression(`请展示${label}表情`)?.emotion,emotion,String(label));
 for(const [text,emotion] of [['呃，那你满足一下呢。','delicious'],['你难过一下可以吗？','sad'],['请淡定一点','cool'],['你来个震惊表情','shocked']]){
  assert.equal(requestedExpression(text!)?.emotion,emotion,text);
 }
});

test('bare catalog labels require recent demonstration context and do not classify personal feelings',()=>{
 const history=[{role:'assistant' as const,content:'表情：happy；动画：requested_direction'}];
 assert.equal(requestedExpression('淡定。',history)?.emotion,'cool');
 assert.equal(requestedExpression('满足',history)?.emotion,'delicious');
 for(const text of ['淡定','满足','开心吗','难过呢','我很满足','我需要满足一下条件','你满足一下我的要求','别装淡定','他说“满足一下”','如果满足就好了'])assert.equal(requestedExpression(text),null,text);
 assert.equal(requestedExpression('满足',[{role:'assistant',content:'表情：happy；动画：social_happy'}]),null);
});

test('direction commands use screen coordinates and reject negated quoted hypothetical and story references',()=>{
 for(const [text,x,y] of [['右上。',1,-1],['呃，右下。',1,1],['你向左上看一下可以吗？',-1,-1],['往左下看',-1,1],['左看',-1,0],['看右边',1,0],['抬头',0,-1],['低头',0,1]] as const)assert.deepEqual(requestedDirection(text),{look_x:x,look_y:y},text);
 for(const text of ['不要看右上','他说右上','如果往右上看会怎样','右上角有只猫','你先向右看然后生气','“右下”'])assert.equal(requestedDirection(text),null,text);
});
