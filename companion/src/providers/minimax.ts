import {MiniMaxAsr} from './minimax-asr.js';import {MiniMaxTts} from './minimax-tts.js';import type {SpeechAdapter} from './registry.js';
export const minimaxAdapter:SpeechAdapter={
 async capabilities(profile){return {asr:profile.endpoint==='https://api.minimax.cn/v1/speech_to_text',tts:profile.endpoint==='wss://api.minimax.cn/ws/v1/t2a_v2',state:'unverified'};},
 createAsr(profile,secrets){if(profile.endpoint!=='https://api.minimax.cn/v1/speech_to_text')throw new Error('provider_endpoint');return new MiniMaxAsr(profile,secrets);},
 createTts(profile,secrets){if(profile.endpoint!=='wss://api.minimax.cn/ws/v1/t2a_v2')throw new Error('provider_endpoint');return new MiniMaxTts(profile,secrets);}
};
