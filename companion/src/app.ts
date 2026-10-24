import {SpeakerController} from './speaker/controller.js';
import type {SpeakerProfiles} from './speaker/profiles.js';
import type {SpeakerExtractor} from './speaker/extractor.js';
import {AmbientSchema} from './local/settings.js';
import {TurnJournal} from './ledger/journal.js';
import {SpeechEndpoint} from './voice/endpoint.js';
type VoiceCapture={turn:number;buffer:UtteranceBuffer;endpoint:{push(pcm:Uint8Array):Promise<boolean>;readonly hasSpeech?:boolean};work:Promise<void>;pending:number;began:number;record?:Promise<string>};
import {ReconnectLoop} from './device/reconnect.js';import type {PairingRecord} from './device/pinned-transport.js';import {setLoginStart,loginStartEnabled} from './local/login.js';import type {Secrets,EventMeta} from './contracts.js';import {SettingsStore,type Settings} from './local/settings.js';import {connect,DeviceConnection} from './device/client.js';import {discover} from './device/discovery.js';import {pairUsb} from './device/usb-pair.js';import {DeepSeekBrain} from './providers/deepseek.js';import {SpeechRegistry} from './providers/registry.js';import {minimaxAdapter} from './providers/minimax.js';import {VoicePipeline} from './voice/pipeline.js';import {DeviceOutput} from './voice/output.js';import {MacOutput} from './voice/mac-output.js';import {UtteranceBuffer} from './voice/utterance.js';import {parseReaction} from './protocol/schema.js';import {logEvent} from './diagnostics.js';
export class Companion {
 private speaker?:SpeakerController;
 private config!:Settings;private connection?:DeviceConnection;private pipeline?:VoicePipeline;private pipelinePromise?:Promise<VoicePipeline>;private epoch=0;private registry=new SpeechRegistry();private events:EventMeta[]=[];private pairing='idle';private lastReply='';private lastError='';private voice?:VoiceCapture;private busy=false;private activeVoice=0;private manualUntil=0;private desired?:string;private retry?:ReconnectLoop<DeviceConnection>;private attempt?:AbortController;private connectionGeneration=0;
 constructor(private settings:SettingsStore,private secrets:Secrets,private connector:typeof connect=connect,private endpointFactory?:()=>{push(pcm:Uint8Array):Promise<boolean>;readonly hasSpeech?:boolean},private journal?:TurnJournal,private speakerServices?:{profiles:SpeakerProfiles;extractor:SpeakerExtractor}){this.registry.registerSpeechAdapter('minimax',minimaxAdapter);}
 async initialize(){this.config=await this.settings.read();if(this.speakerServices){const services=this.speakerServices;this.speaker=new SpeakerController({settings:()=>this.config.ambient,saveSettings:async patch=>{this.config=await this.settings.update({...this.config,ambient:{...this.config.ambient,...patch}});},device:()=>this.connection,profiles:services.profiles,extractor:services.extractor,journal:this.journal,canProcess:()=>!this.busy&&!this.voice&&this.activeVoice===0&&performance.now()>=this.manualUntil,expression:async(pcm,person,signal)=>{signal.throwIfAborted();const epoch=this.epoch;const c=this.needDevice();this.activeVoice++;const cancel=()=>{void this.pipeline?.interrupt();};signal.addEventListener('abort',cancel,{once:true});try{const p=await this.makePipeline();signal.throwIfAborted();if(epoch!==this.epoch)throw new Error('cancelled');return await p.expression(pcm,c.currentTurn+1,person.id,signal=>this.speaker!.waitForQuiet(signal));}finally{signal.removeEventListener('abort',cancel);this.activeVoice--;}}});}}
 async speakerAction(op:string,input:any){if(!this.speaker)throw new Error('speaker_unavailable');if(op==='list')return this.speaker.list();if(op==='enroll-start'){if(typeof input.enable_after!=='boolean')throw new Error('speaker_input');await this.cancelWork(true);return this.speaker.startEnrollment(input.name,input.enable_after);}if(op==='enroll-next')return this.speaker.nextSample();if(op==='enroll-cancel')return this.speaker.cancelEnrollment();if(op==='profile-remove'||op==='profile-enable'){if(typeof input.id!=='string'||input.id.length>64)throw new Error('speaker_input');if(op==='profile-remove')await this.speaker.remove(input.id);else{if(typeof input.enabled!=='boolean')throw new Error('speaker_input');await this.speaker.enableProfile(input.id,input.enabled);}this.pipeline?.clearSpeaker(input.id);return this.speaker.list();}if(op==='settings')return this.speaker.configure(AmbientSchema.partial().parse(input));throw new Error('speaker_operation');}
 private resumeBackground(delay=750){void this.speaker?.resume(delay).catch(this.problem);}
 async close(){await this.disconnect();await this.speakerServices?.extractor.close();}
 private diagnose=(meta:EventMeta)=>{this.journal?.event(meta);logEvent(line=>{this.events.push(JSON.parse(line));if(this.events.length>60)this.events.shift();},meta);};
 private problem=(error:unknown)=>{this.lastError=error instanceof Error&&/^[a-zA-Z0-9_.-]{1,80}$/.test(error.message)?error.message:'operation_failed';this.diagnose({event:'operation.error',code:this.lastError});};
 async state(){return {speaker:this.speaker?.status??{state:'unavailable',enrollment:null},recording:this.journal?.health??null,installed:!!process.env.ROUND_EYES_APP_PATH,login_start:await loginStartEnabled(),settings:this.config,connected:!!this.connection,device:this.connection?.info??null,pairing:this.pairing,lastReply:this.lastReply,lastError:this.lastError,events:this.events,capabilities:{asr:await this.registry.capabilities(this.config.speech.asr,new AbortController().signal),tts:await this.registry.capabilities(this.config.speech.tts,new AbortController().signal)}};}
 private needDevice(id?:string){if(!this.connection||(id&&id!==this.connection.info.device_id))throw new Error('device_offline');return this.connection;}
 private async buildPipeline(){const epoch=this.epoch;const connection=this.needDevice();const key=await this.secrets.get('provider/deepseek');if(!key)throw new Error('credential_missing');if(epoch!==this.epoch||connection!==this.connection)throw new Error('stale');const speech=this.registry.resolve(this.config.speech,this.secrets);
  this.pipeline=new VoicePipeline({brain:new DeepSeekBrain({key,model:this.config.deepseek_model,diagnose:this.diagnose}),device:connection,...speech,output:this.config.output==='mac'?new MacOutput(undefined,this.diagnose):new DeviceOutput(connection),diagnose:this.diagnose,onReply:text=>this.lastReply=text});return this.pipeline;
 }
 private async makePipeline(){if(this.pipeline)return this.pipeline;if(this.pipelinePromise)return this.pipelinePromise;const promise=this.buildPipeline();this.pipelinePromise=promise;try{return await promise;}finally{if(this.pipelinePromise===promise)this.pipelinePromise=undefined;}}
 private async cancelWork(cancelCapture:boolean){
  this.epoch++;this.pipelinePromise=undefined;const voice=this.voice;voice?.buffer.cancel();this.voice=undefined;
  const tasks:Promise<unknown>[]=[];if(this.speaker)tasks.push(this.speaker.pause(cancelCapture));if(voice?.record)tasks.push(voice.record.then(id=>this.journal?.finish(id,'cancelled')));if(this.pipeline)tasks.push(this.pipeline.interrupt());
  if(cancelCapture&&this.connection)tasks.push(this.connection.cancel(this.connection.currentTurn));await Promise.allSettled(tasks);
 }
 async resetServices(){const pending=this.cancelWork(true);this.pipeline=undefined;await pending;this.resumeBackground();}
 async disconnect(){this.desired=undefined;this.connectionGeneration++;this.retry?.stop();this.retry=undefined;this.attempt?.abort();this.attempt=undefined;const pending=this.cancelWork(true);const old=this.connection;this.connection=undefined;this.pipeline=undefined;this.manualUntil=0;await pending;try{await old?.release();}catch{old?.close();}}
 private agentBusy(){return !!this.speaker?.busy||!!this.voice||this.activeVoice>0||!!this.pipelinePromise||performance.now()<this.manualUntil;}
 private attachDevice(c:DeviceConnection,record:PairingRecord){this.connection=c;
    c.on('disconnected',()=>{if(this.connection===c){this.connection=undefined;void this.resetServices();this.manualUntil=0;if(this.desired===record.device_id)this.scheduleReconnect(record);}});
    c.on('event',msg=>{this.speaker?.event(msg);if(msg.type==='utterance.start'){if(this.speaker?.enrolling){void this.cancelWork(true);this.problem(new Error('enrollment_interrupted_by_wake'));return;}this.lastError='';this.diagnose({event:'capture.started',turn:msg.turn_seq});void this.cancelWork(false);this.voice={turn:msg.turn_seq,buffer:new UtteranceBuffer(),endpoint:this.endpointFactory?.()??new SpeechEndpoint(undefined,{noSpeechTimeoutMs:this.config.ambient.wait_seconds*1000,silenceMs:this.config.ambient.silence_ms,maxSpeechMs:29500}),work:Promise.resolve(),pending:0,began:performance.now(),record:this.journal?.create({mode:'voice',device_id:c.info.device_id,boot_id:c.info.boot_id,session_id:(c.info as any).session_id,device_turn:msg.turn_seq})};const voice=this.voice;void voice.record?.then(id=>this.journal?.event({event:'capture.started',turn:voice.turn},id)).catch(error=>this.captureProblem(voice,error));}
     if(msg.type==='utterance.end'&&this.voice&&this.voice.turn===msg.turn_seq){const voice=this.voice;voice.work=voice.work.then(()=>this.finishVoice(voice,c,false)).catch(error=>this.captureProblem(voice,error));}
     if(msg.type==='error'&&!msg.command_id){void this.cancelWork(true);this.problem(new Error(msg.code));}
     if(msg.type==='playback.started')this.diagnose({event:'playback.started',turn:msg.turn_seq});
    });
    c.on('audio',frame=>{if(frame.turn_seq===0){void this.speaker?.consume(frame);return;}const voice=this.voice;if(!voice||frame.turn_seq!==voice.turn)return;
     try{if(++voice.pending>50)throw new Error('overflow');
      voice.work=voice.work.then(async()=>{if(this.voice!==voice||this.connection!==c)return;
       voice.buffer.push(frame);const wasSpeaking=voice.endpoint.hasSpeech;const ended=await voice.endpoint.push(frame.pcm);if(!wasSpeaking&&voice.endpoint.hasSpeech&&c.info.capabilities?.includes('ambient_v1'))await c.listenPose(true);if(voice.endpoint.hasSpeech===false)voice.buffer.retainTail(16000);if(ended&&this.voice===voice)await this.finishVoice(voice,c,true);
      }).catch(error=>this.captureProblem(voice,error)).finally(()=>{voice.pending--;});
     }catch(error){this.captureProblem(voice,error);}
    });
 }
 private captureProblem(voice:VoiceCapture,error:unknown){if(this.voice!==voice)return;this.voice=undefined;voice.buffer.cancel();void voice.record?.then(id=>this.journal?.finish(id,'failed',error)).catch(()=>this.problem(new Error('storage_unavailable')));void this.cancelWork(true).finally(()=>this.resumeBackground());this.problem(error);}
 private async finishVoice(voice:VoiceCapture,c:DeviceConnection,local:boolean){
  if(this.voice!==voice||this.connection!==c)return;this.voice=undefined;const epoch=this.epoch;this.activeVoice++;
  try{const run=async()=>{const pcm=local?voice.buffer.finishAtEndpoint():voice.buffer.finish();await c.cancel(voice.turn);if(c.info.capabilities?.includes('ambient_v1'))await c.listenPose(false);
   if(epoch!==this.epoch||this.connection!==c)throw new Error('cancelled');this.diagnose({event:'utterance.ended',turn:voice.turn,bytes:pcm.length,duration_ms:Math.round(performance.now()-voice.began)});
   if(this.speaker&&!await this.speaker.verifyVoice(pcm,AbortSignal.timeout(10000))){if(voice.record)await this.journal?.finish(await voice.record,'ignored',new Error('speaker_unknown'));return;}if(epoch!==this.epoch||this.connection!==c)throw new Error('cancelled');const p=await this.makePipeline();if(epoch!==this.epoch||this.connection!==c)throw new Error('cancelled');await p.audio(pcm,voice.turn);};if(voice.record)await this.journal!.runExisting(await voice.record,run);else await run();
  }catch(error){if(epoch===this.epoch)this.problem(error);}finally{this.activeVoice--;this.resumeBackground();}
 }
 private scheduleReconnect(record:PairingRecord){this.retry?.stop();const generation=this.connectionGeneration;
  const retry=new ReconnectLoop(async signal=>{let host=record.host;try{const found=await discover(signal,1000);host=found.find(d=>d.device_id===record.device_id)?.host??host;}catch{signal.throwIfAborted();}
   return this.connector({...record,host},this.secrets,AbortSignal.any([signal,AbortSignal.timeout(8000)]));
  },c=>{if(this.desired!==record.device_id||generation!==this.connectionGeneration){c.close();return;}this.lastError='';this.attachDevice(c,record);this.diagnose({event:'device.reconnected'});this.resumeBackground();});this.retry=retry;void retry.start();
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
    if(input.activate===true)await c.mode('companion');this.resumeBackground();return {connected:true};
   }finally{this.busy=false;}
  }
  if(name==='disconnect'){await this.disconnect();return {ok:true};}
  if(name==='mode'){const c=this.needDevice(input.device_id);if(!['companion','xiaozhi'].includes(input.mode))throw new Error('mode');await this.cancelWork(true);await c.mode(input.mode);if(input.mode==='companion')this.resumeBackground();return {ok:true};}
  if(name==='interrupt'){await this.cancelWork(true);this.resumeBackground();return {ok:true};}
  if(name==='clear-history'){this.pipeline?.clearHistory();this.lastReply='';return {ok:true};}
  if(name==='text'){
   if(this.busy)throw new Error('busy');if(input.source!==undefined&&!['voice','agent'].includes(input.source))throw new Error('scope');
   const c=this.needDevice(input.device_id);if(c.info.mode!=='companion')throw new Error('mode');if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw new Error('text_size');
   const agent=input.source==='agent';if(agent&&this.agentBusy())throw new Error('busy');if(!agent)await this.cancelWork(true);else if(input.speak===true)await this.speaker?.pause();const epoch=this.epoch;this.activeVoice++;
   try{const run=async()=>{const p=await this.makePipeline();if(epoch!==this.epoch)throw new Error('cancelled');const text=await p.text(input.text,{turn:c.currentTurn+1,speak:input.speak===true,source:input.source??'voice'});return {reply:text};};return this.journal?(await this.journal.run({mode:'text',device_id:c.info.device_id,boot_id:c.info.boot_id,session_id:(c.info as any).session_id,user_text:input.text},run)).value:await run();}finally{this.activeVoice--;this.resumeBackground(); }
  }
  if(name==='react'){
   const c=this.needDevice(input.device_id);const reaction=parseReaction({emotion:input.emotion,hold_ms:input.hold_ms});if(!['agent','manual'].includes(input.source??'manual'))throw new Error('scope');
   const source=input.source??'manual';if(c.info.mode!=='companion')throw new Error('mode');if(source==='agent'){if(this.agentBusy())throw new Error('busy');return c.react(reaction,{id:c.currentTurn,signal:AbortSignal.timeout(3000)},'agent');}
   await this.cancelWork(true);const applied=await c.react(reaction,{id:c.currentTurn+1,signal:AbortSignal.timeout(3000)},'manual');this.manualUntil=performance.now()+reaction.hold_ms;this.resumeBackground(reaction.hold_ms+750);return applied;
  }
  if(name==='revoke-controller'){const c=this.needDevice();const record=this.config.devices.find(d=>d.device_id===c.info.device_id)!;const id=input.controller_id??record.controller_id;await c.revokeController(id);if(id===record.controller_id){this.desired=undefined;this.retry?.stop();this.retry=undefined;c.close();await this.secrets.delete(`device/${record.device_id}/${id}`);this.config=await this.settings.update({...this.config,devices:this.config.devices.filter(d=>d.device_id!==record.device_id),selected:null});}return {revoked:true};}
  if(name==='release'){await this.disconnect();return {ok:true};}
  throw new Error('unknown_action');
 }
}
