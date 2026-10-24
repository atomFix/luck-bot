import {EventEmitter} from 'node:events';import {performance} from 'node:perf_hooks';import type WebSocket from 'ws';
import type {DeviceClient,DeviceStatus,Reaction,Turn,Applied,AudioFrame,Secrets} from '../contracts.js';
import {encodeAudio,decodeAudio} from '../protocol/audio-frame.js';import {parseReaction} from '../protocol/schema.js';import {toDeviceDeadline} from '../protocol/clock.js';
import {AnimationSchema,type AnimationPlan} from '../voice/animation.js';
import {pinnedSocket,type PairingRecord} from './pinned-transport.js';
export function connectionFailure(error:unknown):Error {
 const code=typeof error==='object'&&error!==null&&'code' in error ? String(error.code) : '';
 const allowed=['EHOSTUNREACH','ENETUNREACH','EACCES','EPERM','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID'];
 return new Error('device_connection_failed'+(allowed.includes(code)?'_'+code.toLowerCase():''));
}
export class DeviceConnection extends EventEmitter implements DeviceClient {
 private seq=0;private turn=0;private wireTurn=0;private commandTail?:Promise<void>;private queuedCommands=0;private closed=false;private clock:{host_ms:number;device_ms:number;rtt_ms:number};
 private pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;turn:number;cleanup:()=>void}>();
 private heartbeat:ReturnType<typeof setInterval>;
 constructor(private ws:WebSocket,private state:DeviceStatus&{session_id:string;turn_seq?:number},rtt=0){super();this.turn=state.turn_seq??0;this.wireTurn=this.turn;this.clock={host_ms:performance.now(),device_ms:state.uptime_ms,rtt_ms:rtt};
  ws.on('message',(bytes,isBinary)=>{try{
   if(isBinary){const f=decodeAudio(Buffer.from(bytes as Buffer));if(f.sample_rate_khz!==16)throw new Error('format');this.emit('audio',f);return;}
   const msg=JSON.parse(bytes.toString());
   if(msg.type==='utterance.start'){if(!Number.isInteger(msg.turn_seq)||msg.turn_seq<=this.turn)return;this.turn=msg.turn_seq;this.wireTurn=msg.turn_seq;for(const [id,p] of this.pending)if(p.turn<msg.turn_seq){p.cleanup();p.reject(new Error('stale'));this.pending.delete(id);}}
   if(msg.type==='status'){
    if(msg.boot_id!==this.state.boot_id||msg.session_id!==this.state.session_id){this.close();return;}
    this.state=msg;this.wireTurn=Math.max(this.wireTurn,msg.turn_seq??0);this.turn=Math.max(this.turn,msg.turn_seq??0);this.clock={host_ms:performance.now(),device_ms:msg.uptime_ms,rtt_ms:0};
   }
   const p=this.pending.get(msg.command_id);if(p){p.cleanup();this.pending.delete(msg.command_id);msg.type==='error'?p.reject(new Error(msg.code)):p.resolve(msg);}
   this.emit('event',msg);
  }catch{this.close();}});
  ws.on('close',()=>this.disconnected());ws.on('error',()=>this.disconnected());
  this.heartbeat=setInterval(()=>{void this.command('heartbeat',{},this.turn).then(()=>this.status(new AbortController().signal)).catch(()=>this.close());},5000);this.heartbeat.unref();
 }
 private animationUntil=0;
 get animationActive(){return performance.now()<this.animationUntil;}
 get currentTurn(){return this.turn;}
 get info(){return {...this.state,turn_seq:this.turn};}
 private disconnected(){if(this.closed)return;this.closed=true;clearInterval(this.heartbeat);for(const p of this.pending.values()){p.cleanup();p.reject(new Error('disconnected'));}this.pending.clear();this.emit('disconnected');}
 close(){this.ws.close();this.disconnected();}
 private async command(type:string,payload:object,turn:number,signal?:AbortSignal):Promise<any>{
  signal?.throwIfAborted();if(this.closed)throw new Error('disconnected');if(turn<this.turn)throw new Error('stale');this.turn=turn;
  if(this.queuedCommands>=64)throw new Error('overflow');this.queuedCommands++;
  const send=()=>this.sendCommand(type,payload,turn,signal);const work=this.commandTail?this.commandTail.then(send):send();const tail=work.then(()=>{},()=>{});this.commandTail=tail;void tail.then(()=>{this.queuedCommands--;if(this.commandTail===tail)this.commandTail=undefined;});return work;
 }
 private async sendCommand(type:string,payload:object,turn:number,signal?:AbortSignal):Promise<any>{
  signal?.throwIfAborted();if(this.closed)throw new Error('disconnected');if(type==='heartbeat'||type==='status')turn=Math.max(turn,this.wireTurn);if(turn<this.wireTurn)throw new Error('stale');this.wireTurn=turn;
  const id=crypto.randomUUID();const data={v:1,type,device_id:this.state.device_id,boot_id:this.state.boot_id,session_id:this.state.session_id,seq:++this.seq,turn_seq:turn,command_id:id,deadline_ms:toDeviceDeadline(performance.now(),this.clock,2500),payload};
  return new Promise((resolve,reject)=>{
   const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   const abort=()=>{done();this.pending.delete(id);reject(new Error('cancelled'));};
   const timer=setTimeout(()=>{done();this.pending.delete(id);reject(new Error('device_timeout'));},2500);
   this.pending.set(id,{resolve,reject,turn,cleanup:done});signal?.addEventListener('abort',abort,{once:true});
   try{this.ws.send(JSON.stringify(data));}catch{abort();}
  });
 }
 async listen(enabled:boolean,purpose:'ambient'|'enroll'='ambient'){return this.command('listen',{enabled,purpose},this.turn);}
 async processingPose(active:boolean){if(this.animationActive)return;return this.command('reaction',{emotion:active?'thinking':'neutral',hold_ms:active?3000:300,source:'voice'},this.turn);}
 async listenPose(listening:boolean){if(listening&&this.animationActive)return;return this.command('listen_pose',{listening},this.turn);}
 async status(signal:AbortSignal):Promise<DeviceStatus>{return this.command('status',{},this.turn,signal);}
 async animate(value:AnimationPlan,turn:Turn):Promise<Applied>{if(!this.state.capabilities?.includes('animation_v1'))throw new Error('firmware_update_required');const plan=AnimationSchema.parse(value);const result=await this.command('animation',plan,turn.id,turn.signal);this.animationUntil=performance.now()+plan.steps.reduce((n,s)=>n+s.duration_ms,0);return result;}
 async react(value:Reaction,turn:Turn,source:'voice'|'manual'|'agent'):Promise<Applied>{this.animationUntil=0;return this.command('reaction',{...parseReaction(value),source},turn.id,turn.signal);}
 async revokeController(controller_id:string):Promise<void>{if(!/^[a-f0-9]{16}$/.test(controller_id))throw new Error('controller_id');await this.command('revoke',{controller_id},this.turn);}
 async mode(mode:'companion'|'xiaozhi'):Promise<void>{await this.command('mode',{mode},this.turn);this.state.mode=mode;}
 async play(frame:AudioFrame,turn:Turn):Promise<void>{turn.signal.throwIfAborted();if(this.closed||frame.turn_seq!==turn.id||turn.id!==this.turn)throw new Error('stale');
  if(this.ws.bufferedAmount>20000)throw new Error('overflow');await new Promise<void>((resolve,reject)=>this.ws.send(encodeAudio(frame),error=>error?reject(new Error('audio_send')):resolve()));
 }
 async cancel(turn:number):Promise<void>{this.animationUntil=0;if(!this.closed&&turn>=this.turn)await this.command('cancel',{},turn);}
 async release():Promise<void>{if(!this.closed)await this.command('release',{},this.turn);this.close();}
}
export async function connect(p:PairingRecord,secrets:Secrets,signal:AbortSignal):Promise<DeviceConnection>{
 signal.throwIfAborted();const token=await secrets.get(`device/${p.device_id}/${p.controller_id}`);if(!token)throw new Error('credential_missing');
 signal.throwIfAborted();const ws=pinnedSocket(p);return new Promise((resolve,reject)=>{
  const began=performance.now();const timeout=setTimeout(()=>fail(new Error('device_timeout')),6000);
  const abort=()=>fail(new Error('cancelled'));const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);ws.off('message',message);ws.off('error',fail);};
  const fail=(_e:unknown)=>{cleanup();ws.close();reject(connectionFailure(_e));};
  const message=(data:WebSocket.RawData)=>{try{const m=JSON.parse(data.toString());if(m.type!=='status'||m.device_id!==p.device_id)throw new Error();cleanup();resolve(new DeviceConnection(ws,m,performance.now()-began));}catch{fail(null);}};
  signal.addEventListener('abort',abort,{once:true});ws.once('error',fail);ws.once('message',message);ws.once('open',()=>ws.send(JSON.stringify({type:'auth',controller_id:p.controller_id,token})));
 });
}
