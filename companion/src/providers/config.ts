import {z} from 'zod';
export const ProfileSchema=z.object({provider:z.enum(['minimax','dashscope']),endpoint:z.string().url().max(512),model:z.string().max(100),voice_id:z.string().max(150).optional(),region:z.string().max(50).optional(),credential_ref:z.string().max(80)}).strict();
export type SpeechProfile=z.infer<typeof ProfileSchema>;
export type SpeechConfig={asr:SpeechProfile;tts:SpeechProfile};
export const DASH_SCOPE_ENDPOINT='https://your-deployment.example.com/api/v1';
export const DEFAULT_SPEECH:SpeechConfig={asr:{provider:'minimax',endpoint:'https://api.minimax.cn/v1/speech_to_text',model:'asr-1.0',credential_ref:'provider/minimax'},tts:{provider:'minimax',endpoint:'wss://api.minimax.cn/ws/v1/t2a_v2',model:'speech-2.8-turbo',voice_id:'Chinese (Mandarin)_Lyrical_Voice',credential_ref:'provider/minimax'}};
