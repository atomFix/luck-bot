import type {Asr,Tts,Secrets} from '../contracts.js';import {ProfileSchema,type SpeechProfile,type SpeechConfig} from './config.js';
export type SpeechCapability={asr:boolean;tts:boolean;state:'unverified'|'available'|'unsupported'|'not-implemented'};
export interface SpeechAdapter {capabilities(profile:SpeechProfile,signal:AbortSignal):Promise<SpeechCapability>;createAsr(profile:SpeechProfile,secrets:Secrets):Asr;createTts(profile:SpeechProfile,secrets:Secrets):Tts}
export class SpeechRegistry {
 private adapters=new Map<string,SpeechAdapter>();
 registerSpeechAdapter(name:SpeechProfile['provider'],adapter:SpeechAdapter){this.adapters.set(name,adapter);}
 private validate(p:SpeechProfile){ProfileSchema.parse(p);if(p.credential_ref!==`provider/${p.provider}`)throw new Error('credential_provider');const url=new URL(p.endpoint);if(!['https:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('provider_endpoint');}
 async capabilities(p:SpeechProfile,signal:AbortSignal):Promise<SpeechCapability>{this.validate(p);return this.adapters.get(p.provider)?.capabilities(p,signal)??{asr:false,tts:false,state:'not-implemented'};}
 resolve(c:SpeechConfig,secrets:Secrets):{asr:Asr;tts:Tts}{this.validate(c.asr);this.validate(c.tts);const registry=this;return {asr:{async transcribe(wav,signal){const adapter=registry.adapters.get(c.asr.provider);if(!adapter)throw new Error('provider_not_implemented');return adapter.createAsr(c.asr,secrets).transcribe(wav,signal);}},tts:{async *synthesize(text,signal){const adapter=registry.adapters.get(c.tts.provider);if(!adapter)throw new Error('provider_not_implemented');yield* adapter.createTts(c.tts,secrets).synthesize(text,signal);}}};}
}
