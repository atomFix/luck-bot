import test from 'node:test';import assert from 'node:assert/strict';
import {DeepSeekBrain} from '../src/providers/deepseek.js';
import {AnimationSchema} from '../src/voice/animation.js';
test('model preset and custom timeline share the metered structured response path and history',async()=>{
 let calls=0;const b=new DeepSeekBrain({key:'fixture',fetch:async(_u,init)=>{const request=JSON.parse(init!.body as string);assert.equal(request.max_tokens,768);assert(JSON.parse(request.messages[1].content).user_utterance);return Response.json({choices:[{message:{content:JSON.stringify(++calls===1?{preset:'horror'}:{scene:'looking',steps:[{emotion:'thinking',duration_ms:700,look_x:-.6,blink_once:true},{emotion:'relaxed',duration_ms:1200}]})}}]});}});
 const signal=new AbortController().signal;assert.equal((await b.animation('恐怖故事',[],signal)).scene,'horror');const custom=await b.animation('看向左边再放松',[],signal);assert.equal(custom.steps[0]!.look_x,-.6);assert(custom.steps[0]!.blink_once);assert(AnimationSchema.safeParse(custom).success);
});
