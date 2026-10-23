import {z} from 'zod';import {EMOTIONS} from '../contracts.js';
export const ReactionSchema=z.object({emotion:z.enum(EMOTIONS),hold_ms:z.number().int().min(300).max(3000)}).strict();
export const parseReaction=(input:unknown)=>ReactionSchema.parse(input);
const id=z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/);const u32=z.number().int().min(0).max(0xffffffff);
const base={v:z.literal(1),device_id:id,boot_id:id,session_id:id,seq:u32,turn_seq:u32,command_id:id,deadline_ms:u32};
export const ControlSchema=z.discriminatedUnion('type',[
 z.object({...base,type:z.literal('reaction'),payload:ReactionSchema.extend({source:z.enum(['voice','manual','agent'])})}).strict(),
 z.object({...base,type:z.enum(['status','heartbeat','release','cancel']),payload:z.object({}).strict()}).strict(),
 z.object({...base,type:z.literal('mode'),payload:z.object({mode:z.enum(['xiaozhi','companion'])}).strict()}).strict(),
 z.object({...base,type:z.literal('revoke'),payload:z.object({controller_id:id}).strict()}).strict(),
]);
export type Control=z.infer<typeof ControlSchema>;
export function parseControl(input:unknown):Control {
 if(Buffer.byteLength(JSON.stringify(input)??'')>2048)throw new Error('format');
 return ControlSchema.parse(input);
}
