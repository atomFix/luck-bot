export const EMOTIONS = ['neutral','happy','laughing','funny','sad','angry','crying','loving','embarrassed','surprised','shocked','thinking','winking','cool','relaxed','delicious','kissy','confident','sleepy','silly','confused'] as const;
export type Emotion = typeof EMOTIONS[number];
export type Reaction = {emotion: Emotion; hold_ms: number};
export type Turn = {id:number; signal:AbortSignal};
export type Message = {role:'user'|'assistant'; content:string};
export type Applied = {command_id:string; applied_uptime_ms:number};
export type DeviceStatus = {device_id:string; boot_id:string; mode:'companion'|'xiaozhi'; lease:'free'|'ours'|'busy'; uptime_ms:number; capabilities?:string[];background_active?:boolean;critical?:boolean};
export type AudioFrame = {stream_id:number; frame_seq:number; turn_seq:number; end:boolean; sample_rate_khz:16|24; pcm:Uint8Array};
export interface Secrets {has?(name:string):Promise<boolean>;get(name:string):Promise<string|null>;set(name:string,value:string):Promise<void>;delete(name:string):Promise<void>}
export interface DeviceClient {
 animate?(value:import('./voice/animation.js').AnimationPlan,turn:Turn):Promise<Applied>;
 status(signal:AbortSignal):Promise<DeviceStatus>;
 react(value:Reaction,turn:Turn,source:'voice'|'manual'|'agent'):Promise<Applied>;
 play(frame:AudioFrame,turn:Turn):Promise<void>;
 cancel(turn:number):Promise<void>;release():Promise<void>;
}
export interface Brain {animation?(text:string,history:Message[],signal:AbortSignal):Promise<import('./voice/animation.js').AnimationPlan>;reaction(text:string,history:Message[],signal:AbortSignal):Promise<Reaction>;reply(text:string,history:Message[],signal:AbortSignal):AsyncIterable<string>}
export interface Asr {transcribe(wav:Uint8Array,signal:AbortSignal):Promise<string>}
export interface Tts {synthesize(text:string,signal:AbortSignal):AsyncIterable<Uint8Array>}
export interface AudioOutput {finish?(turn:Turn):Promise<void>;play(pcm:Uint8Array,turn:Turn):Promise<void>;cancel(turn:number):Promise<void>}
export type EventMeta = {voiced_ms?:number;pcm_ms?:number;required_voiced_ms?:number;event:string;turn?:number;duration_ms?:number;bytes?:number;code?:string;model?:string;requests?:number;input_tokens?:number;output_tokens?:number};
