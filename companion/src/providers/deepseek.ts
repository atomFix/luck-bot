import type {Brain,Reaction,Message} from '../contracts.js';import {parseReaction} from '../protocol/schema.js';
import {request,sse,type Fetch} from './http.js';import {REACTION_PROMPT,REPLY_PROMPT} from './prompts.js';
export class DeepSeekBrain implements Brain {
 private fetcher:Fetch;constructor(private options:{key:string;fetch?:Fetch;model?:string;diagnose?:(meta:any)=>void}){this.fetcher=options.fetch??fetch;}
 private call(text:string,history:Message[],signal:AbortSignal,reaction:boolean){
  return request(this.fetcher,'https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${this.options.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:this.options.model??'deepseek-flash',thinking:{type:'disabled'},stream:!reaction,max_tokens:reaction?128:512,messages:[{role:'system',content:reaction?REACTION_PROMPT:REPLY_PROMPT},...history,{role:'user',content:text}],...(reaction?{response_format:{type:'json_object'}}:{})})},signal,reaction?8000:20000);
 }
 async reaction(text:string,history:Message[],signal:AbortSignal):Promise<Reaction>{
  const response=await this.call(text,history,signal,true);const body=await response.json() as any;
  this.options.diagnose?.({event:'brain.reaction',model:this.options.model??'deepseek-flash',input_tokens:body.usage?.prompt_tokens,output_tokens:body.usage?.completion_tokens});
  try{return parseReaction(JSON.parse(body.choices?.[0]?.message?.content));}catch{return {emotion:'neutral',hold_ms:1200};}
 }
 async *reply(text:string,history:Message[],signal:AbortSignal):AsyncIterable<string>{
  const response=await this.call(text,history,signal,false);
  for await(const part of sse(response,signal)){const content=part.choices?.[0]?.delta?.content;if(typeof content==='string'&&content)yield content;}
 }
}
