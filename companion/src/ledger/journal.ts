import {AsyncLocalStorage} from 'node:async_hooks';import {randomUUID} from 'node:crypto';import type {Ledger} from './repository.js';import type {EventMeta} from '../contracts.js';
type Context={journal:TurnJournal;id:string;began:number;pending:Promise<unknown>[];failure?:Error;reply:string};const scope=new AsyncLocalStorage<Context>();
export class TurnJournal {
 private active=new Map<string,Context>();private failure='';
 constructor(readonly ledger:Ledger){}
 get health(){return {...this.ledger.health,error:this.failure||this.ledger.health.error,ok:!this.failure&&this.ledger.health.ok};}
 async create(meta:Record<string,any>){if(!this.health.ok)throw new Error('storage_unavailable');const id=randomUUID(),began=performance.now();await this.ledger.call('beginTurn',{...meta,id,started_at:Date.now()});this.active.set(id,{journal:this,id,began,pending:[],reply:''});return id;}
 async run<T>(meta:Record<string,any>,fn:()=>Promise<T>){const id=await this.create(meta);return {id,value:await this.runExisting(id,fn)};}
 async runExisting<T>(id:string,fn:()=>Promise<T>){const context=this.active.get(id);if(!context)throw new Error('turn_unknown');return scope.run(context,async()=>{try{const result=await fn();await this.finish(id,'completed');return result;}catch(e){await this.finish(id,e instanceof Error&&/cancel|abort|stale/i.test(e.name+' '+e.message)?'cancelled':'failed',e).catch(()=>{});throw e;}});}
 private write(context:Context,op:string,data:Record<string,any>){const work=this.ledger.call(op,data).catch(e=>{context.failure=e;this.failure='storage_unavailable';});context.pending.push(work);}
 event(meta:EventMeta,id=scope.getStore()?.id){if(!id)return;const c=this.active.get(id);if(!c)return;this.write(c,'span',{...meta,turn_id:id,at_ms:Math.round(performance.now()-c.began)});}
 patch(data:Record<string,any>,id=scope.getStore()?.id){if(!id)return;const c=this.active.get(id);if(c)this.write(c,'patchTurn',{...data,id});}
 partial(token:string){const c=scope.getStore();if(c?.journal!==this)return;c.reply+=token;if(c.reply.length>8000)c.reply=c.reply.slice(0,8000);}
 async finish(id:string,status:string,error?:unknown){const c=this.active.get(id);if(!c)return;await Promise.all(c.pending);if(c.failure)throw c.failure;const code=error instanceof Error&&/^[a-zA-Z0-9_.-]{1,80}$/.test(error.message)?error.message:error?'operation_failed':null;await this.ledger.call('patchTurn',{id,status,ended_at:Date.now(),duration_ms:Math.round(performance.now()-c.began),...(c.reply?{reply_text:c.reply}:{}),error:code});this.active.delete(id);}
 async close(){for(const id of [...this.active.keys()])await this.finish(id,'interrupted');}
}
export function currentJournal(){return scope.getStore()?.journal;}
export type MeterMeta={kind:string;provider:string;model:string;logical_id?:string};
export async function beginAttempt(meta:MeterMeta){const context=scope.getStore();const id=randomUUID(),began=performance.now();let finished=false;
 if(context){await Promise.all(context.pending);if(context.failure)throw context.failure;await context.journal.ledger.call('beginAttempt',{...meta,id,logical_id:meta.logical_id??id,turn_id:context.id,started_at:Date.now()});}
 return {async finish(status:string,extra:Record<string,any>={}){if(finished)return;finished=true;if(context)await context.journal.ledger.call('finishAttempt',{...extra,id,status,duration_ms:Math.round(performance.now()-began)});}};
}
export type Attempt=Awaited<ReturnType<typeof beginAttempt>>;const responses=new WeakMap<Response,Attempt>();
export function meterResponse(response:Response,attempt:Attempt){responses.set(response,attempt);}
export async function finishResponse(response:Response,status='completed',extra:Record<string,any>={}){await responses.get(response)?.finish(status,extra);}
export function usageFrom(data:any){const usage:Record<string,number>={};for(const [from,to] of [['prompt_tokens','input_tokens'],['completion_tokens','output_tokens'],['total_tokens','total_tokens'],['prompt_cache_hit_tokens','cache_hit_tokens'],['prompt_cache_miss_tokens','cache_miss_tokens']]){const v=data?.[from!];if(Number.isSafeInteger(v)&&v>=0)usage[to!]=v;}return usage;}
