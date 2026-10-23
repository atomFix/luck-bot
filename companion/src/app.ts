import {ReconnectLoop} from './device/reconnect.js';import type {PairingRecord} from './device/pinned-transport.js';import {setLoginStart,loginStartEnabled} from './local/login.js';import type {Secrets,EventMeta} from './contracts.js';import {SettingsStore,type Settings} from './local/settings.js';import {connect,DeviceConnection} from './device/client.js';import {discover} from './device/discovery.js';import {pairUsb} from './device/usb-pair.js';import {DeepSeekBrain} from './providers/deepseek.js';import {SpeechRegistry} from './providers/registry.js';import {minimaxAdapter} from './providers/minimax.js';import {VoicePipeline} from './voice/pipeline.js';import {DeviceOutput} from './voice/output.js';import {MacOutput} from './voice/mac-output.js';import {UtteranceBuffer} from './voice/utterance.js';import {parseReaction} from './protocol/schema.js';import {logEvent} from './diagnostics.js';
export class Companion {
 private config!:Settings;private connection?:DeviceConnection;private pipeline?:VoicePipeline;private pipelinePromise?:Promise<VoicePipeline>;private epoch=0;private registry=new SpeechRegistry();private events:EventMeta[]=[];private pairing='idle';private lastReply='';private lastError='';private voice?:{turn:number;buffer:UtteranceBuffer};private busy=false;private activeVoice=0;private manualUntil=0;private desired?:string;private retry?:ReconnectLoop<DeviceConnection>;private attempt?:AbortController;private connectionGeneration=0;
 constructor(private settings:SettingsStore,private secrets:Secrets,private connector:typeof connect=connect){this.registry.registerSpeechAdapter('minimax',minimaxAdapter);}
 async initialize(){this.config=await this.settings.read();}
 private diagnose=(meta:EventMeta)=>{logEvent(line=>{this.events.push(JSON.parse(line));if(this.events.length>60)this.events.shift();},meta);};
 private problem=(error:unknown)=>{this.lastError=error instanceof Error&&/^[a-zA-Z0-9_.-]{1,80}$/.test(error.message)?error.message:'operation_failed';this.diagnose({event:'operation.error',code:this.lastError});};
 async state(){return {installed:!!process.env.ROUND_EYES_APP_PATH,login_start:await loginStartEnabled(),settings:this.config,connected:!!this.connection,device:this.connection?.info??null,pairing:this.pairing,lastReply:this.lastReply,lastError:this.lastError,events:this.events,capabilities:{asr:await this.registry.capabilities(this.config.speech.asr,new AbortController().signal),tts:await this.registry.capabilities(this.config.speech.tts,new AbortController().signal)}};}
 private needDevice(id?:string){if(!this.connection||(id&&id!==this.connection.info.device_id))throw new Error('device_offline');return this.connection;}
 private async buildPipeline(){const epoch=this.epoch;const connection=this.needDevice();const key=await this.secrets.get('provider/deepseek');if(!key)throw new Error('credential_missing');if(epoch!==this.epoch||connection!==this.connection)throw new Error('stale');const speech=this.registry.resolve(this.config.speech,this.secrets);
  this.pipeline=new VoicePipeline({brain:new DeepSeekBrain({key,model:this.config.deepseek_model,diagnose:this.diagnose}),device:connection,...speech,output:this.config.output==='mac'?new MacOutput():new DeviceOutput(connection),diagnose:this.diagnose,onReply:text=>this.lastReply=text});return this.pipeline;
 }
 private async makePipeline(){if(this.pipeline)return this.pipeline;if(this.pipelinePromise)return this.pipelinePromise;const promise=this.buildPipeline();this.pipelinePromise=promise;try{return await promise;}finally{if(this.pipelinePromise===promise)this.pipelinePromise=undefined;}}
 private async cancelWork(cancelCapture:boolean){
  this.epoch++;this.pipelinePromise=undefined;this.voice?.buffer.cancel();this.voice=undefined;
  const tasks:Promise<unknown>[]=[];if(this.pipeline)tasks.push(this.pipeline.interrupt());
  if(cancelCapture&&this.connection)tasks.push(this.connection.cancel(this.connection.currentTurn));await Promise.allSettled(tasks);
 }
 async resetServices(){const pending=this.cancelWork(true);this.pipeline=undefined;await pending;}
 async disconnect(){this.desired=undefined;this.connectionGeneration++;this.retry?.stop();this.retry=undefined;this.attempt?.abort();this.attempt=undefined;const pending=this.cancelWork(true);const old=this.connection;this.connection=undefined;this.pipeline=undefined;this.manualUntil=0;await pending;try{await old?.release();}catch{old?.close();}}
 private agentBusy(){return !!this.voice||this.activeVoice>0||!!this.pipelinePromise||performance.now()<this.manualUntil;}
 private attachDevice(c:DeviceConnection,record:PairingRecord){this.connection=c;
    c.on('disconnected',()=>{if(this.connection===c){this.connection=undefined;void this.resetServices();this.manualUntil=0;if(this.desired===record.device_id)this.scheduleReconnect(record);}});
    c.on('event',msg=>{if(msg.type==='utterance.start'){void this.cancelWork(false);this.voice={turn:msg.turn_seq,buffer:new UtteranceBuffer()};}
     if(msg.type==='utterance.end'&&this.voice&&this.voice.turn===msg.turn_seq){const voice=this.voice;this.voice=undefined;const epoch=this.epoch;this.activeVoice++;void (async()=>{const pcm=voice.buffer.finish();const p=await this.makePipeline();if(epoch!==this.epoch)throw new Error('cancelled');await p.audio(pcm,voice.turn);})().catch(this.problem).finally(()=>this.activeVoice--);}
     if(msg.type==='error'&&!msg.command_id){void this.cancelWork(true);this.problem(new Error(msg.code));}
     if(msg.type==='playback.started')this.diagnose({event:'playback.started',turn:msg.turn_seq});
    });
    c.on('audio',frame=>{try{if(this.voice&&frame.turn_seq===this.voice.turn)this.voice.buffer.push(frame);}catch(error){void this.cancelWork(true);this.problem(error);}});
 }
 private scheduleReconnect(record:PairingRecord){this.retry?.stop();const generation=this.connectionGeneration;
  const retry=new ReconnectLoop(async signal=>{let host=record.host;try{const found=await discover(signal,1000);host=found.find(d=>d.device_id===record.device_id)?.host??host;}catch{signal.throwIfAborted();}
   return this.connector({...record,host},this.secrets,AbortSignal.any([signal,AbortSignal.timeout(8000)]));
  },c=>{if(this.desired!==record.device_id||generation!==this.connectionGeneration){c.close();return;}this.lastError='';this.attachDevice(c,record);this.diagnose({event:'device.reconnected'});});this.retry=retry;void retry.start();
 }
 async action(name:string,input:any):Promise<any>{
  if(!['status','device-status','list-devices'].includes(name))this.lastError='';
  if(name==='status')return this.state();
  if(name==='login-start'){if(typeof input.enabled!=='boolean')throw new Error('login_input');await setLoginStart(process.env.ROUND_EYES_APP_PATH??'',input.enabled);return {enabled:input.enabled};}
  if(name==='device-status'){const record=this.config.devices.find(d=>d.device_id===input.device_id);if(!record)throw new Error('device_unknown');return this.connection?.info.device_id===record.device_id?this.connection.info:{device_id:record.device_id,connected:false};}
  if(name==='list-devices')return this.config.devices.map(d=>({device_id:d.device_id,connected:this.connection?.info.device_id===d.device_id}));
  if(name==='discover')return discover(AbortSignal.timeout(4000));
  if(name==='settings'){if(this.busy)throw new Error('busy');this.busy=true;try{await this.resetServices();this.config=await this.settings.update(input);return {ok:true};}finally{this.busy=false;}}
  if(name==='pair'){
   if(this.pairing==='waiting'||this.pairing==='starting')throw new Error('pairing_busy');if(typeof input.path!=='string'||typeof input.host!=='string')throw new Error('pairing_format');
   this.pairing='starting';void pairUsb(input.path,input.host,this.secrets,AbortSignal.timeout(40000),()=>this.pairing='waiting').then(async record=>{const devices=this.config.devices.filter(d=>d.device_id!==record.device_id);devices.push(record);this.config=await this.settings.update({...this.config,devices,selected:record.device_id});this.pairing='complete';}).catch(error=>{this.pairing='failed';this.problem(error);});return {started:true};
  }
  if(name==='connect'){
   if(this.busy)throw new Error('busy');this.busy=true;try{await this.disconnect();const record=this.config.devices.find(d=>d.device_id===(input.device_id??this.config.selected));if(!record)throw new Error('device_unknown');
    this.desired=record.device_id;const generation=this.connectionGeneration;const attempt=new AbortController();this.attempt=attempt;const c=await this.connector(record,this.secrets,AbortSignal.any([attempt.signal,AbortSignal.timeout(8000)]));if(attempt.signal.aborted||generation!==this.connectionGeneration){c.close();throw new Error('cancelled');}this.attempt=undefined;this.connection=c;
    this.attachDevice(c,record);
    if(input.activate===true)await c.mode('companion');return {connected:true};
   }finally{this.busy=false;}
  }
  if(name==='disconnect'){await this.disconnect();return {ok:true};}
  if(name==='mode'){const c=this.needDevice(input.device_id);if(!['companion','xiaozhi'].includes(input.mode))throw new Error('mode');await this.cancelWork(true);await c.mode(input.mode);return {ok:true};}
  if(name==='interrupt'){await this.cancelWork(true);return {ok:true};}
  if(name==='clear-history'){this.pipeline?.clearHistory();this.lastReply='';return {ok:true};}
  if(name==='text'){
   if(this.busy)throw new Error('busy');if(input.source!==undefined&&!['voice','agent'].includes(input.source))throw new Error('scope');
   const c=this.needDevice(input.device_id);if(c.info.mode!=='companion')throw new Error('mode');if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw new Error('text_size');
   const agent=input.source==='agent';if(agent&&this.agentBusy())throw new Error('busy');if(!agent)await this.cancelWork(true);const epoch=this.epoch;this.activeVoice++;
   try{const p=await this.makePipeline();if(epoch!==this.epoch)throw new Error('cancelled');const text=await p.text(input.text,{turn:c.currentTurn+1,speak:input.speak===true,source:input.source??'voice'});return {reply:text};}finally{this.activeVoice--; }
  }
  if(name==='react'){
   const c=this.needDevice(input.device_id);const reaction=parseReaction({emotion:input.emotion,hold_ms:input.hold_ms});if(!['agent','manual'].includes(input.source??'manual'))throw new Error('scope');
   const source=input.source??'manual';if(c.info.mode!=='companion')throw new Error('mode');if(source==='agent'){if(this.agentBusy())throw new Error('busy');return c.react(reaction,{id:c.currentTurn,signal:AbortSignal.timeout(3000)},'agent');}
   await this.cancelWork(true);const applied=await c.react(reaction,{id:c.currentTurn+1,signal:AbortSignal.timeout(3000)},'manual');this.manualUntil=performance.now()+reaction.hold_ms;return applied;
  }
  if(name==='revoke-controller'){const c=this.needDevice();const record=this.config.devices.find(d=>d.device_id===c.info.device_id)!;const id=input.controller_id??record.controller_id;await c.revokeController(id);if(id===record.controller_id){this.desired=undefined;this.retry?.stop();this.retry=undefined;c.close();await this.secrets.delete(`device/${record.device_id}/${id}`);this.config=await this.settings.update({...this.config,devices:this.config.devices.filter(d=>d.device_id!==record.device_id),selected:null});}return {revoked:true};}
  if(name==='release'){await this.disconnect();return {ok:true};}
  throw new Error('unknown_action');
 }
}
