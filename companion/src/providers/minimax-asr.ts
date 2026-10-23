import type {Asr,Secrets} from '../contracts.js';import type {SpeechProfile} from './config.js';import {request,type Fetch} from './http.js';
export class MiniMaxAsr implements Asr {
 constructor(private profile:SpeechProfile,private secrets:Secrets,private fetcher:Fetch=fetch){}
 async transcribe(wav:Uint8Array,signal:AbortSignal):Promise<string>{
  if(wav.length<44||wav.length>960044||Buffer.from(wav.subarray(0,4)).toString()!=='RIFF')throw new Error('audio_format');
  const key=await this.secrets.get(this.profile.credential_ref);if(!key)throw new Error('credential_missing');
  const body=new FormData();body.set('model',this.profile.model);body.set('response_format','json');body.set('file',new Blob([new Uint8Array(wav)],{type:'audio/wav'}),'utterance.wav');
  const response=await request(this.fetcher,this.profile.endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`},body},signal,15000);
  const data=await response.json() as any;if(typeof data.text!=='string'||data.text.length>4000)throw new Error('asr_format');return data.text.trim();
 }
}
