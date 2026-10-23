import type {Message} from '../contracts.js';
export class History {
 private messages:Message[]=[];
 snapshot(){return this.messages.map(m=>({...m}));}
 add(user:string,assistant:string){if(!assistant)return;this.messages.push({role:'user',content:user},{role:'assistant',content:assistant});while(this.messages.length>16||this.messages.reduce((n,m)=>n+m.content.length,0)>12000)this.messages.splice(0,2);}
 clear(){this.messages=[];}
}
