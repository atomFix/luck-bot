import {setTimeout as sleep} from 'node:timers/promises';
export class ReconnectLoop<C extends {close():void}> {
 private controller?:AbortController;
 constructor(private factory:(signal:AbortSignal)=>Promise<C>,private ready:(connection:C)=>void,private delay:(ms:number,signal:AbortSignal)=>Promise<void>=(ms,signal)=>sleep(ms,undefined,{signal})){}
 stop(){this.controller?.abort();this.controller=undefined;}
 async start(){this.stop();const controller=new AbortController();this.controller=controller;let wait=250;
  try{while(!controller.signal.aborted){try{await this.delay(wait,controller.signal);}catch{return;}if(controller.signal.aborted)return;
   try{const c=await this.factory(controller.signal);if(controller.signal.aborted){c.close();return;}this.ready(c);return;}catch{if(controller.signal.aborted)return;wait=Math.min(10000,wait*2);}
  }}finally{if(this.controller===controller)this.controller=undefined;}
 }
}
