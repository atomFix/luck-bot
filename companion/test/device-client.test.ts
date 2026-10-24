import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {DeviceConnection} from '../src/device/client.js';
class Wire extends EventEmitter {readyState=1;sent:any[]=[];send(data:any){this.sent.push(typeof data==='string'?JSON.parse(data):data);}close(){this.emit('close');}}
const status={type:'status',device_id:'d',boot_id:'boot',session_id:'sess',mode:'companion',lease:'ours',uptime_ms:100,turn_seq:0} as const;
test('reaction remains pending until device acknowledgement and disconnect rejects pending commands',async()=>{
 const w=new Wire();const c=new DeviceConnection(w as any,status);const turn={id:1,signal:new AbortController().signal};
 let applied=false;const result=c.react({emotion:'happy',hold_ms:1200},turn,'voice').then(v=>{applied=true;return v;});
 assert.equal(applied,false);const command=w.sent.at(-1);assert.equal(command.payload.emotion,'happy');
 w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:150})),false);
 assert.equal((await result).applied_uptime_ms,150);
 const pending=c.status(turn.signal);w.close();await assert.rejects(pending,/disconnected/);
});
test('aborted and old turns cannot send or replay commands',async()=>{
 const w=new Wire();const c=new DeviceConnection(w as any,status);const a=new AbortController();a.abort();
 await assert.rejects(c.react({emotion:'happy',hold_ms:1200},{id:1,signal:a.signal},'voice'));
 w.emit('message',Buffer.from(JSON.stringify({type:'utterance.start',turn_seq:5})),false);
 await assert.rejects(c.react({emotion:'happy',hold_ms:1200},{id:4,signal:new AbortController().signal},'voice'),/stale/);
 assert.equal(w.sent.length,0);w.close();
});
test('connection failures retain a known transport code without exposing arbitrary errors',async()=>{
 const {connectionFailure}=await import('../src/device/client.js');
 assert.equal(connectionFailure(Object.assign(new Error('private details'),{code:'EHOSTUNREACH'})).message,'device_connection_failed_ehostunreach');
 assert.equal(connectionFailure(Object.assign(new Error('private details'),{code:'private-secret'})).message,'device_connection_failed');
});
test('background start and listen pose use owner commands without advancing voice turns',async()=>{const w=new Wire();const c=new DeviceConnection(w as any,status);try{const start=c.listen(true,'ambient');let command=w.sent.at(-1);assert.equal(command.type,'listen');assert.equal(command.turn_seq,0);w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:1})),false);await start;const pose=c.listenPose(true);await new Promise(r=>setImmediate(r));command=w.sent.at(-1);assert.equal(command.type,'listen_pose');assert.equal(command.turn_seq,0);w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:2})),false);await pose;assert.equal(c.currentTurn,0);}finally{c.close();}});
test('a new reaction cannot advance the device turn before queued listening control is acknowledged',async()=>{const w=new Wire();const c=new DeviceConnection(w as any,status);try{const pose=c.listenPose(true);const first=w.sent[0];const reaction=c.react({emotion:'happy',hold_ms:1000},{id:1,signal:new AbortController().signal},'voice');assert.equal(w.sent.length,1);w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:first.command_id,applied_uptime_ms:1})),false);await pose;await new Promise(r=>setImmediate(r));assert.equal(w.sent.length,2);const command=w.sent[1];w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:2})),false);await reaction;}finally{c.close();}});
test('temporary thinking uses firmware-valid holds without advancing voice turns',async()=>{
 const w=new Wire();const c=new DeviceConnection(w as any,status);try{for(const active of [true,false]){
 const pending=c.processingPose(active);await new Promise(r=>setImmediate(r));const command=w.sent.at(-1);
 assert.equal(command.type,'reaction');assert.equal(command.turn_seq,0);assert.equal(command.payload.emotion,active?'thinking':'neutral');assert(command.payload.hold_ms>=300&&command.payload.hold_ms<=3000);
 w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:2})),false);await pending;
 }}finally{c.close();}
});
test('a complete bounded animation is sent once and playing animation is preserved during new listening',async()=>{
 const {parseAnimationChoice}=await import('../src/voice/animation.js');const w=new Wire();const c=new DeviceConnection(w as any,{...status,capabilities:['animation_v1']});try{
 const plan=parseAnimationChoice({preset:'horror'});const pending=c.animate(plan,{id:1,signal:new AbortController().signal});const command=w.sent.at(-1);assert.equal(command.type,'animation');assert.deepEqual(command.payload.steps,plan.steps);assert(Buffer.byteLength(JSON.stringify(command))<=4096);
 w.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:2})),false);await pending;const before=w.sent.length;await c.listenPose(true);await c.processingPose(true);assert.equal(w.sent.length,before);assert(c.animationActive);
 }finally{c.close();}
});
test('continuous head gestures require declared firmware support and use a single command',async()=>{
 const {parseAnimationChoice}=await import('../src/voice/animation.js');const plan=parseAnimationChoice({preset:'agree'});
 const old=new Wire(),legacy=new DeviceConnection(old as any,{...status,capabilities:['animation_v1']});
 try{await assert.rejects(legacy.animate(plan,{id:1,signal:new AbortController().signal}),/gesture_firmware_update_required/);assert.equal(old.sent.length,0);}finally{legacy.close();}
 const wire=new Wire(),device=new DeviceConnection(wire as any,{...status,capabilities:['animation_v1','gesture_v1']});
 try{const pending=device.animate(plan,{id:1,signal:new AbortController().signal});const command=wire.sent.at(-1);assert.equal(command.payload.steps.length,1);assert.equal(command.payload.steps[0].gesture,'nod');wire.emit('message',Buffer.from(JSON.stringify({type:'ack',command_id:command.command_id,applied_uptime_ms:10})),false);await pending;assert.equal(wire.sent.length,1);}finally{device.close();}
});
