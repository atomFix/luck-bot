import type {LocalAsr,LocalTranscript} from '../voice/local-asr.js';
import type {AudioFrame} from '../contracts.js';import type {DeviceConnection} from '../device/client.js';import type {TurnJournal} from '../ledger/journal.js';import {SpeechEndpoint,type SpeechScorer} from '../voice/endpoint.js';import {AmbientSegmenter} from './segmenter.js';
export type ListeningSettings={enabled:boolean;speaker_filter?:boolean;wait_seconds:number;silence_ms:number;threshold:number;margin:number};
type Person={id:string;name:string;enabled:boolean};type Match={id:string;name:string;score:number};
type Options={now?:()=>number;settings:()=>ListeningSettings;saveSettings:(patch:Partial<ListeningSettings>)=>Promise<unknown>;device:()=>DeviceConnection|undefined;profiles:{list():Promise<Person[]>;match(v:number[],threshold?:number,margin?:number):Promise<Match|null>;add(name:string,samples:number[][]):Promise<{id:string}>;remove(id:string):Promise<void>;setEnabled(id:string,value:boolean):Promise<void>};extractor:{ready():Promise<void>;embed(pcm:Uint8Array,signal:AbortSignal):Promise<number[]>;status:{ready:boolean;error:string;model:string}};journal?:TurnJournal;canProcess:()=>boolean;expression:(pcm:Uint8Array,person:Match,signal:AbortSignal,transcript?:LocalTranscript,segment?:{continued:boolean})=>Promise<unknown>;localAsr?:Pick<LocalAsr,'ready'|'start'|'push'|'finish'|'cancel'>;useLocalAsr?:()=>boolean;segmenter?:()=>AmbientSegmenter;enrollmentScorer?:()=>SpeechScorer};
export const AMBIENT_MIN_INTERVAL_MS=500;
export const AMBIENT_MAX_PER_MINUTE=60;
export const AMBIENT_INPUT_TIMEOUT_MS=8000;
type Candidate={continued?:boolean;poseVersion:number;asr?:{result:Promise<LocalTranscript>;cancel:()=>void};pcm:Uint8Array;voiced_ms:number;record?:Promise<string>;generation:number};
type Enrollment={name:string;vectors:number[][];state:string;until:number;enableAfter:boolean;error:string;pcm:Uint8Array[];bytes:number;endpoint:SpeechEndpoint;abort:AbortController;timer?:ReturnType<typeof setTimeout>};
export class SpeakerController {
 private watchdog?:ReturnType<typeof setTimeout>;private streamRequestedAt=0;private recoveryAttempts=0;private recoveries=0;private lastTurnError='';
 private errorCode(error:unknown){return error instanceof Error&&/^[a-zA-Z0-9_.-]{1,80}$/.test(error.message)?error.message:'speaker_failed';}
 private watchInput(){
  clearTimeout(this.watchdog);const generation=this.generation;
  this.watchdog=setTimeout(()=>{
   if(generation!==this.generation||this.enrolling||!this.options.settings().enabled)return;
   if(this.inputNow()-(this.inputAt??this.streamRequestedAt)>=AMBIENT_INPUT_TIMEOUT_MS){this.fault(new Error('ambient_input_timeout'));return;}
   this.watchInput();
  },2000);this.watchdog.unref?.();
 }
 private turnFailed(error:unknown){
  const code=this.errorCode(error);
  if(code==='cancelled'||code==='stale')return;
  // A model/recognition failure belongs to one utterance, not to the PCM stream.
  if(code==='storage_unavailable'||code==='turn_unknown'){this.fault(error);return;}
  this.lastTurnError=code;this.eventCode=code;
 }
 private localCapture?:{id:number;abort:AbortController};private localStreams=new Map<number,AbortController>();
 private dropLocal(id:number){this.localStreams.get(id)?.abort();this.localStreams.delete(id);this.options.localAsr?.cancel(id);}
 private inputFrames=0;private inputAt:number|null=null;private inputRms=0;private inputPeak=0;private workStage='idle';
 private inputNow(){return this.options.now?.()??performance.now();}
 private resetInput(){this.inputFrames=0;this.inputAt=null;this.inputRms=0;this.inputPeak=0;}
 private observeInput(pcm:Uint8Array){if(pcm.length!==640)return;this.inputFrames++;this.inputAt=this.inputNow();let power=0,peak=0;const b=Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength);for(let i=0;i<b.length;i+=2){const value=b.readInt16LE(i);power+=value*value;peak=Math.max(peak,Math.abs(value));}this.inputRms=Math.round(Math.sqrt(power/(b.length/2)));this.inputPeak=peak;}
 private poseVersion=0;
 private listening=false;private quietWaiters=new Set<()=>void>();
 async waitForQuiet(signal:AbortSignal){signal.throwIfAborted();while(this.listening){if(this.quietWaiters.size>=2)throw new Error('speaker_busy');await new Promise<void>((resolve,reject)=>{const done=()=>{this.quietWaiters.delete(done);signal.removeEventListener('abort',abort);resolve();};const abort=()=>{this.quietWaiters.delete(done);signal.removeEventListener('abort',abort);reject(new Error('cancelled'));};this.quietWaiters.add(done);signal.addEventListener('abort',abort,{once:true});});signal.throwIfAborted();}}
 private signalQuiet(){for(const done of [...this.quietWaiters])done();}
 private nextFrame=0;private generation=0;private stream=-1;private phase='disabled';private error='';private count=0;private segmenter:AmbientSegmenter;private audioWork:Promise<void>=Promise.resolve();private pendingFrames=0;private captureRecord?:Promise<string>;private candidate?:Candidate;private processing?:Promise<void>;private taskAbort?:AbortController;private resumeTimer?:ReturnType<typeof setTimeout>;private enrollment?:Enrollment;private lastCloud=-Infinity;private cloudTimes:number[]=[];private eventCode='';private utterances=0;
 constructor(private options:Options){this.segmenter=this.makeSegmenter();}
 private makeSegmenter(){return this.options.segmenter?.()??new AmbientSegmenter(undefined,this.options.settings().silence_ms,this.options.device()?.info.capabilities?.includes('animation_v1')?4000:0);}
 get enrolling(){return !!this.enrollment&&!['complete','failed'].includes(this.enrollment.state);}
 get busy(){return !!this.captureRecord||!!this.processing||this.enrolling;}
 get status(){return {last_turn_error:this.lastTurnError,recovery_count:this.recoveries,input:{received_frames:this.inputFrames,audio_ms:this.inputFrames*20,last_frame_age_ms:this.inputAt===null?null:Math.max(0,Math.round(this.inputNow()-this.inputAt)),rms:this.inputRms,peak:this.inputPeak,...this.segmenter.stats},work_stage:this.listening?'listening':this.workStage,state:this.phase,error:this.error,enabled:this.options.settings().enabled,speaker_filter:this.options.settings().speaker_filter===true,streaming:this.stream>=0,profile_count:this.count,model:this.options.extractor.status,last_event:this.eventCode,local_utterances:this.utterances,enrollment:this.enrollment?{state:this.enrollment.state,samples:this.enrollment.state==='complete'?3:this.enrollment.vectors.length,until:this.enrollment.until,error:this.enrollment.error}:null};}
 private device(){const c=this.options.device();if(!c)throw new Error('device_offline');if(c.info.mode!=='companion')throw new Error('mode');if(!c.info.capabilities?.includes('ambient_v1'))throw new Error('firmware_update_required');return c;}
 async list(){const profiles=await this.options.profiles.list();this.count=profiles.filter(p=>p.enabled).length;return {...this.status,profiles};}
 async resume(delay=0){clearTimeout(this.resumeTimer);if(delay){const generation=this.generation;this.resumeTimer=setTimeout(()=>{if(generation===this.generation)void this.resume().then(()=>{if(generation===this.generation&&this.phase==='recovering'&&this.options.settings().enabled)void this.resume(1000);}).catch(e=>{if(generation===this.generation)this.fault(e);});},delay);return;}if(!this.options.settings().enabled||this.enrolling||!this.options.canProcess())return;if(this.stream>=0)return;const generation=this.generation;if(this.options.settings().speaker_filter===true){const people=await this.options.profiles.list();if(generation!==this.generation)return;this.count=people.filter(p=>p.enabled).length;if(!this.count){this.phase='no_profiles';return;}await this.options.extractor.ready();}if(this.options.useLocalAsr?.()){if(!this.options.localAsr)throw new Error('local_asr_unavailable');await this.options.localAsr.ready();}if(generation!==this.generation||!this.options.settings().enabled||this.enrolling||!this.options.canProcess())return;const c=this.device();this.error='';this.phase='starting';this.streamRequestedAt=this.inputNow();await c.listen(true,'ambient');if(generation===this.generation)this.watchInput();}
 async pause(stopBoard=true,keepEnrollment=false){this.generation++;clearTimeout(this.resumeTimer);clearTimeout(this.watchdog);this.taskAbort?.abort();for(const id of [...this.localStreams.keys()])this.dropLocal(id);this.localCapture=undefined;this.listening=false;this.signalQuiet();this.stream=-1;this.segmenter.reset();const record=this.captureRecord;this.captureRecord=undefined;const candidate=this.candidate;this.candidate=undefined;const work:Promise<unknown>[]=[];if(record)work.push(record.then(id=>this.options.journal?.finish(id,'cancelled')));if(candidate?.record)work.push(candidate.record.then(id=>this.options.journal?.finish(id,'cancelled')));if(!keepEnrollment&&this.enrollment){clearTimeout(this.enrollment.timer);this.enrollment.abort.abort();this.enrollment.pcm=[];this.enrollment=undefined;}this.resetInput();this.workStage='idle';this.phase=this.options.settings().enabled?'paused':'disabled';const c=this.options.device();if(stopBoard&&c?.info.capabilities?.includes('ambient_v1'))work.push(c.listen(false));if(c?.info.capabilities?.includes('ambient_v1'))work.push(c.listenPose(false));await Promise.allSettled(work);}
 private fault(error:unknown){
  const code=this.errorCode(error);this.error=code;this.eventCode=code;
  const recoverable=!this.enrolling&&['audio_gap','audio_stream','overflow','ambient_input_timeout','local_asr_unavailable','local_asr_timeout','local_asr_format','asr_overflow','asr_busy','device_timeout'].includes(code);
  const paused=this.pause();const generation=this.generation;
  void paused.then(()=>{
   if(generation!==this.generation)return;
   this.error=code;this.phase=recoverable?'recovering':'fault';
   if(recoverable&&this.options.settings().enabled&&!this.enrolling){
    this.recoveries++;const delay=Math.min(30000,1000*2**Math.min(this.recoveryAttempts++,5));
    void this.resume(delay).catch(e=>this.fault(e));
   }
  });
 }
 event(msg:any){if(msg.type==='ambient.start'){if(msg.stream_id===this.stream&&this.stream>=0)return;if(this.stream>=0||this.localStreams.size||this.captureRecord||this.candidate||this.processing){void this.pause(false,true);if(this.enrollment?.state==='recording'){this.enrollment.pcm=[];this.enrollment.bytes=0;this.enrollment.endpoint=new SpeechEndpoint(this.options.enrollmentScorer?.(),{continuous:true,silenceMs:100000});}}if(!Number.isInteger(msg.stream_id)||msg.stream_id<1){this.fault(new Error('audio_stream'));return;}this.stream=msg.stream_id;this.error='';this.resetInput();this.streamRequestedAt=this.inputNow();this.watchInput();this.eventCode='listening_started';this.nextFrame=0;this.segmenter=this.makeSegmenter();this.segmenter.start(msg.stream_id);if(this.enrollment?.state==='recording'){const e=this.enrollment;clearTimeout(e.timer);e.until=Date.now()+6000;e.timer=setTimeout(()=>void this.finishSample(e),6000);this.phase='enrolling';}else this.phase='listening';}
 if(msg.type==='ambient.stopped'){if(msg.code==='restart'){void this.pause(false,true);return;}this.stream=-1;if(msg.code==='wake')this.phase='paused';else if(!['disabled','released','restart'].includes(msg.code))this.fault(new Error(msg.code==='critical'?'device_critical':msg.code));}}
 async consume(frame:AudioFrame){if(frame.turn_seq!==0||frame.stream_id!==this.stream||this.stream<0)return;const generation=this.generation;this.observeInput(frame.pcm);this.recoveryAttempts=0;if(++this.pendingFrames>50){this.pendingFrames--;this.fault(new Error('overflow'));return;}const work=this.audioWork.then(async()=>{if(generation!==this.generation)return;const enrollment=this.enrollment;if(enrollment&&enrollment.state!=='complete'){if(enrollment.state!=='recording')return;if(frame.frame_seq!==this.nextFrame++||frame.sample_rate_khz!==16||frame.pcm.length!==640||frame.end)throw new Error('audio_gap');enrollment.bytes+=frame.pcm.length;if(enrollment.bytes>256000)throw new Error('enrollment_audio_size');enrollment.pcm.push(frame.pcm.slice());await enrollment.endpoint.push(frame.pcm);return;}
 const event=await this.segmenter.push(frame);if(generation!==this.generation)return;if(this.localCapture&&event?.type!=='start'&&event?.type!=='ignored')await this.options.localAsr!.push(this.localCapture.id,frame.pcm,this.localCapture.abort.signal);if(generation!==this.generation)return;if(event?.type==='start'){this.poseVersion++;this.listening=true;this.utterances++;const c=this.options.device();this.captureRecord=this.options.journal?.create({mode:'ambient',device_id:c?.info.device_id,boot_id:c?.info.boot_id,session_id:(c?.info as any)?.session_id});void this.captureRecord?.catch(e=>this.fault(e));void this.pose(true,generation);if(this.options.useLocalAsr?.()){const abort=new AbortController();const id=await this.options.localAsr!.start(abort.signal);if(generation!==this.generation){this.options.localAsr!.cancel(id);return;}this.localStreams.set(id,abort);this.localCapture={id,abort};await this.options.localAsr!.push(id,event.pcm,abort.signal);}}
 if(event?.type==='ignored'){if(this.localCapture)this.dropLocal(this.localCapture.id);this.localCapture=undefined;const record=this.captureRecord;this.captureRecord=undefined;this.listening=false;this.eventCode=event.code;if(record)await this.options.journal?.finish(await record,'ignored',new Error(event.code));void this.pose(false,generation);this.signalQuiet();}
 if(event?.type==='end'){let asr:Candidate['asr'];if(this.localCapture){const {id,abort}=this.localCapture;const result=this.options.localAsr!.finish(id,abort.signal).finally(()=>this.localStreams.delete(id));void result.catch(()=>{});asr={result,cancel:()=>this.dropLocal(id)};this.localCapture=undefined;}const candidate:Candidate={...event,poseVersion:this.poseVersion,asr,record:this.captureRecord,generation};void candidate.record?.then(id=>{this.options.journal?.event({event:'capture.ended',code:event.continued?'story_window':'utterance_end',duration_ms:Math.round(event.pcm.length/32)},id);this.options.journal?.recordAudio(event.pcm,id);}).catch(e=>this.fault(e));this.captureRecord=undefined;this.listening=false;await this.pose(false,generation,true);this.signalQuiet();this.offer(candidate);}});this.audioWork=work.catch(e=>{if(generation===this.generation)this.fault(e);}).finally(()=>{this.pendingFrames--;});return this.audioWork;}
 private async pose(listening:boolean,generation:number,thinking=false){const c=this.options.device();if(generation!==this.generation||!c)return;try{if(thinking&&this.options.canProcess())await c.processingPose(true);if(generation!==this.generation)return;await c.listenPose(listening);}catch(e){if(generation===this.generation)this.fault(e);}}
 private offer(candidate:Candidate){if(this.processing){const old=this.candidate;this.candidate=candidate;old?.asr?.cancel();if(old?.record)void old.record.then(id=>this.options.journal?.finish(id,'ignored',new Error('candidate_superseded'))).catch(e=>this.fault(e));return;}const work=this.process(candidate).catch(e=>{if(candidate.generation===this.generation)this.turnFailed(e);}).finally(()=>{if(this.processing===work)this.processing=undefined;const pending=this.candidate;this.candidate=undefined;if(pending&&pending.generation===this.generation)this.offer(pending);});this.processing=work;}
 private async process(candidate:Candidate){
  const abort=new AbortController();this.taskAbort=abort;this.workStage='checking';const id=await candidate.record;let handled=false;
  const ignored=async(code:string)=>{this.eventCode=code;if(id)await this.options.journal?.finish(id,'ignored',new Error(code));};
  const run=async()=>{
   if(candidate.generation!==this.generation)throw new Error('cancelled');
   const minimumVoiced=192;
   this.options.journal?.event({event:'speech.checked',voiced_ms:candidate.voiced_ms,pcm_ms:Math.round(candidate.pcm.length/32),required_voiced_ms:minimumVoiced});
   if(candidate.voiced_ms<minimumVoiced||candidate.pcm.length<16000){await ignored('speaker_audio_short');return;}
   if(!this.options.canProcess()){await ignored('owner_busy');return;}
   let person:Match={id:'unfiltered',name:'未启用声纹筛选',score:0};
   if(this.options.settings().speaker_filter===true){
    const started=performance.now();const vector=await this.options.extractor.embed(candidate.pcm,abort.signal);abort.signal.throwIfAborted();
    if(candidate.generation!==this.generation)throw new Error('cancelled');
    const matched=await this.options.profiles.match(vector,this.options.settings().threshold,this.options.settings().margin);abort.signal.throwIfAborted();
    if(candidate.generation!==this.generation)throw new Error('cancelled');
    this.options.journal?.event({event:'speaker.checked',duration_ms:Math.round(performance.now()-started)});
    if(!matched){await ignored('speaker_unknown');return;}
    person=matched;this.options.journal?.patch({speaker_id:person.id,speaker_name:person.name});this.eventCode='speaker_matched';
   }else{this.eventCode='speaker_filter_off';this.options.journal?.event({event:'speaker.filter.skipped',code:'speaker_filter_off'});}
   const time=this.options.now?.()??performance.now();this.cloudTimes=this.cloudTimes.filter(t=>time-t<60000);
   if(time-this.lastCloud<AMBIENT_MIN_INTERVAL_MS||this.cloudTimes.length>=AMBIENT_MAX_PER_MINUTE){await ignored('ambient_rate_limited');return;}
   if(!this.options.canProcess()){await ignored('owner_busy');return;}
   this.workStage='recognizing';const transcript=candidate.asr?await candidate.asr.result:undefined;abort.signal.throwIfAborted();
   if(candidate.generation!==this.generation)throw new Error('cancelled');
   if(transcript&&!/[\p{L}\p{N}]/u.test(transcript.text)){await ignored('no_speech');return;}
   this.lastCloud=time;this.cloudTimes.push(time);
   this.workStage='responding';await this.options.expression(candidate.pcm,person,abort.signal,transcript,{continued:candidate.continued===true});handled=true;
  };
  try{if(id&&this.options.journal)await this.options.journal.runExisting(id,run);else await run();}finally{if(this.taskAbort===abort)this.workStage='idle';candidate.asr?.cancel();if(!handled&&candidate.generation===this.generation&&candidate.poseVersion===this.poseVersion&&!this.listening&&this.options.canProcess()){await this.options.device()?.processingPose(false);}}
 }

 async drain(){await this.audioWork;while(this.processing){const work=this.processing;await work;if(this.processing===work)break;}}
 async verifyVoice(pcm:Uint8Array,signal:AbortSignal){signal.throwIfAborted();if(this.options.settings().speaker_filter!==true){this.eventCode="speaker_filter_off";return true;}const people=await this.options.profiles.list();this.count=people.filter(p=>p.enabled).length;if(!this.count)return false;const vector=await this.options.extractor.embed(pcm,signal);signal.throwIfAborted();const match=await this.options.profiles.match(vector,this.options.settings().threshold,this.options.settings().margin);if(match)this.options.journal?.patch({speaker_id:match.id,speaker_name:match.name});this.eventCode=match?'speaker_matched':'speaker_unknown';return !!match;}
 async configure(patch:Partial<ListeningSettings>){
  const next={...this.options.settings(),...patch};
  if(next.speaker_filter===true){await this.options.extractor.ready();const people=await this.options.profiles.list();if(!people.some(p=>p.enabled))throw new Error('speaker_enroll_first');}
  if(next.enabled)this.device();
  await this.pause();await this.options.saveSettings(patch);this.segmenter=this.makeSegmenter();await this.resume();return this.status;
 }

 async startEnrollment(name:string,enableAfter=false){if(typeof name!=='string'||!name.trim()||name.length>60)throw new Error('speaker_name');this.device();await this.pause();await this.options.extractor.ready();if((await this.options.profiles.list()).length>=10)throw new Error('speaker_limit');this.enrollment={name:name.trim(),vectors:[],state:'next_sample',until:0,enableAfter,error:'',pcm:[],bytes:0,endpoint:new SpeechEndpoint(this.options.enrollmentScorer?.(),{continuous:true,silenceMs:100000}),abort:new AbortController()};return this.nextSample();}
 async nextSample(){const e=this.enrollment;if(!e||!['next_sample','failed'].includes(e.state)||e.vectors.length>=3)throw new Error('enrollment_state');await this.pause(true,true);e.state='recording';e.error='';e.pcm=[];e.bytes=0;e.abort=new AbortController();e.endpoint=new SpeechEndpoint(this.options.enrollmentScorer?.(),{continuous:true,silenceMs:100000});e.until=Date.now()+8000;e.timer=setTimeout(()=>{if(e.state==='recording')this.fault(new Error('enrollment_stream_timeout'));},8000);await this.device().listen(true,'enroll');return this.status;}
 private async finishSample(e:Enrollment){if(this.enrollment!==e||e.state!=='recording')return;e.state='analyzing';clearTimeout(e.timer);try{await this.audioWork;await this.device().listen(false);const pcm=Buffer.concat(e.pcm);e.pcm=[];if(pcm.length<160000||e.endpoint.stats.voiced_ms<1200)throw new Error('enrollment_speak_longer');let sum=0,clipped=0;for(let n=0;n<pcm.length;n+=2){const v=pcm.readInt16LE(n);sum+=v*v;if(Math.abs(v)>=32760)clipped++;}if(Math.sqrt(sum/(pcm.length/2))<50)throw new Error('enrollment_too_quiet');if(clipped/(pcm.length/2)>.02)throw new Error('enrollment_clipped');const vector=await this.options.extractor.embed(pcm,e.abort.signal);e.abort.signal.throwIfAborted();if(this.enrollment!==e)return;e.vectors.push(vector);if(e.vectors.length===3){await this.options.profiles.add(e.name,e.vectors);e.vectors=[];e.state='complete';if(e.enableAfter)await this.options.saveSettings({enabled:true});await this.list();await this.resume(750);}else e.state='next_sample';}catch(error){if(this.enrollment===e){e.pcm=[];e.error=error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'enrollment_failed';e.state='failed';if(e.vectors.length>=3)e.vectors=[];}}}
 async cancelEnrollment(){await this.pause();await this.resume(750);return this.status;}
 async remove(id:string){await this.pause();await this.options.profiles.remove(id);await this.list();await this.resume();}
 async enableProfile(id:string,enabled:boolean){await this.pause();await this.options.profiles.setEnabled(id,enabled);await this.list();await this.resume();}
}
