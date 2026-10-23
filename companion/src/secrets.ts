import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {Secrets} from './contracts.js';
export class KeychainSecrets implements Secrets {
 constructor(private helper=fileURLToPath(new URL('../build/native/credentials', import.meta.url))){}
 private request(op:'get'|'has'|'set'|'delete',name:string,value?:string):Promise<any>{
  if(!/^(provider\/[a-zA-Z0-9_.-]+|device\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/.test(name))return Promise.reject(new Error('credential_name'));
  const data=Buffer.from(JSON.stringify({op,name,value}));if(data.length>8192)return Promise.reject(new Error('credential_size'));
  return new Promise((resolve,reject)=>{
   const child=spawn(this.helper,[],{stdio:['pipe','pipe','pipe']});const chunks:Buffer[]=[];let size=0;
   const timeout=setTimeout(()=>{child.kill();reject(new Error('credential_timeout'));},15000);
   child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>8196){child.kill();reject(new Error('credential_size'));}else chunks.push(b);});
   child.stderr.resume();child.on('error',()=>{clearTimeout(timeout);reject(new Error('credential_helper'));});
   child.stdin.on('error',()=>{});
   child.on('close',code=>{clearTimeout(timeout);if(code!==0){reject(new Error('credential_operation_failed'));return;}
    const b=Buffer.concat(chunks);try{if(b.length<4 || b.readUInt32BE(0)!==b.length-4)throw new Error();resolve(JSON.parse(b.subarray(4).toString()));}catch{reject(new Error('credential_protocol'));}
   });
   const header=Buffer.alloc(4);header.writeUInt32BE(data.length);child.stdin.end(Buffer.concat([header,data]));
  });
 }
 async has(name:string):Promise<boolean>{return (await this.request('has',name)).exists;}
 async get(name:string):Promise<string|null>{return (await this.request('get',name)).value;}
 async set(name:string,value:string):Promise<void>{await this.request('set',name,value);}
 async delete(name:string):Promise<void>{await this.request('delete',name);}
}
