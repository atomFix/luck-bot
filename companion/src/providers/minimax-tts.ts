import {beginAttempt} from '../ledger/journal.js';
import WebSocket from 'ws';import type {Tts,Secrets} from '../contracts.js';import type {SpeechProfile} from './config.js';
export class MiniMaxTts implements Tts {
 constructor(private profile:SpeechProfile,private secrets:Secrets,private socket:(url:string,key:string)=>WebSocket=(url,key)=>new WebSocket(url,{headers:{Authorization:`Bearer ${key}`},handshakeTimeout:5000,maxPayload:262144,followRedirects:false})){}
 async *synthesize(text:string,signal:AbortSignal):AsyncIterable<Uint8Array>{
  signal.throwIfAborted();if(!text.trim()||text.length>500)throw new Error('tts_text_size');const key=await this.secrets.get(this.profile.credential_ref);if(!key)throw new Error('credential_missing');
  const meter=await beginAttempt({kind:'tts',provider:this.profile.provider,model:this.profile.model});let ws:WebSocket;try{ws=this.socket(this.profile.endpoint,key);}catch(e){await meter.finish('failed',{error:'tts_connection'});throw e;}let queue:Uint8Array[]=[],buffered=0,total=0,done=false,failure:Error|undefined,wake:(()=>void)|undefined;let started=false;
  const fail=(code:string)=>{failure=new Error(code);done=true;wake?.();};const abort=()=>fail('cancelled');const timeout=setTimeout(()=>fail('tts_timeout'),30000);
  signal.addEventListener('abort',abort,{once:true});
  ws.on('open',()=>ws.send(JSON.stringify({event:'task_start',model:this.profile.model,voice_setting:{voice_id:this.profile.voice_id,speed:1,vol:1,pitch:0},audio_setting:{sample_rate:24000,format:'pcm',channel:1}})));
  ws.on('error',()=>fail('tts_connection'));ws.on('close',()=>{if(!done)fail('tts_disconnected');});
  ws.on('message',raw=>{try{const m=JSON.parse(raw.toString());if(m.base_resp?.status_code&&m.base_resp.status_code!==0){fail('tts_provider_'+Number(m.base_resp.status_code));return;}
   if(m.event==='task_failed'){fail('tts_failed');return;}
   if(m.event==='task_started'){if(started)throw new Error();started=true;ws.send(JSON.stringify({event:'task_continue',text}));ws.send(JSON.stringify({event:'task_finish'}));}
   if(m.data?.audio){if(!started||typeof m.data.audio!=='string'||!/^(?:[a-fA-F0-9]{4})*$/.test(m.data.audio))throw new Error();const pcm=Buffer.from(m.data.audio,'hex');total+=pcm.length;buffered+=pcm.length;if(buffered>192000||total>2880000){fail('tts_overflow');return;}queue.push(pcm);wake?.();}
   if(m.event==='task_finished'){done=true;wake?.();}
  }catch{fail('tts_format');}});
  try{while(true){signal.throwIfAborted();if(failure)throw failure;const value=queue.shift();if(value){buffered-=value.length;yield value;continue;}if(done)break;await new Promise<void>(resolve=>wake=resolve);wake=undefined;}}finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);queue=[];ws.close();await meter.finish(failure?'failed':signal.aborted?'cancelled':done?'completed':'interrupted',{...(failure?{error:failure.message}:{}),usage:{measured_input_characters:Array.from(text).length,measured_output_pcm_bytes:total}});}
 }
}
