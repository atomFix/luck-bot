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
