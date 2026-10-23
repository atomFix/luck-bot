import {z} from 'zod';import {EMOTIONS} from '../contracts.js';
const id=z.string().regex(/^roundeyes-[a-f0-9]{12}$/);
export const TOOL_SCHEMAS={list_devices:z.object({}).strict(),get_status:z.object({device_id:id}).strict(),set_reaction:z.object({device_id:id,emotion:z.enum(EMOTIONS),hold_ms:z.number().int().min(300).max(3000)}).strict(),semantic_input:z.object({device_id:id,text:z.string().trim().min(1).max(4000)}).strict()};
export function toolAction(name:string,input:unknown):{name:string;input:any}{
 if(!(name in TOOL_SCHEMAS))throw new Error('unknown_tool');const parsed=TOOL_SCHEMAS[name as keyof typeof TOOL_SCHEMAS].parse(input);
 switch(name){case 'list_devices':return {name:'list-devices',input:parsed};case 'get_status':return {name:'device-status',input:parsed};case 'set_reaction':return {name:'react',input:{...parsed,source:'agent'}};default:return {name:'text',input:{...parsed,speak:false,source:'agent'}};}
}
