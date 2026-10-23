import test from 'node:test';import assert from 'node:assert/strict';import {toolAction} from '../src/integrations/tools.js';
test('agent tools cannot access pairing credentials management or arbitrary actions',()=>{
 assert.throws(()=>toolAction('pair',{path:'/dev/cu.usbmodem21201'}),/unknown_tool/);
 assert.throws(()=>toolAction('set_reaction',{device_id:'d',emotion:'shell',hold_ms:1200}));
 assert.deepEqual(toolAction('set_reaction',{device_id:'roundeyes-123456789abc',emotion:'thinking',hold_ms:1200}),{name:'react',input:{device_id:'roundeyes-123456789abc',emotion:'thinking',hold_ms:1200,source:'agent'}});
 assert.equal(toolAction('semantic_input',{device_id:'roundeyes-123456789abc',text:'你好'}).input.speak,false);
});
