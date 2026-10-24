import type {Message} from '../contracts.js';
export class History {
 constructor(private maxMessages=16,private maxCharacters=12000){}
 private messages:Message[]=[];
 snapshot(){return this.messages.map(m=>({...m}));}
 add(user:string,assistant:string){if(!assistant)return;this.messages.push({role:'user',content:user},{role:'assistant',content:assistant});while(this.messages.length>this.maxMessages||this.messages.reduce((n,m)=>n+m.content.length,0)>this.maxCharacters)this.messages.splice(0,2);}
 clear(){this.messages=[];}
}
