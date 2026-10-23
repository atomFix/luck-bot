import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import type {Secrets} from '../contracts.js';import {validatePairing,type PairingRecord} from './pinned-transport.js';
export class PairingDecoder {
 private rest='';
 feed(chunk:string):any[]{this.rest+=chunk;if(this.rest.length>4096)throw new Error('serial_size');const lines=this.rest.split(/\r?\n/);this.rest=lines.pop()??'';const result=[];for(const line of lines){try{const text=line.startsWith('REYE/1 ')?line.slice(7):line;if(!text.startsWith('{'))continue;const obj=JSON.parse(text);if(obj.type==='pairing.pending'||obj.type==='pairing.complete'||obj.type==='error')result.push(obj);}catch{}}return result;}
}
export async function pairUsb(path:string,host:string,secrets:Secrets,signal:AbortSignal,onPending:()=>void,helper=fileURLToPath(new URL('../../build/native/serial-pair',import.meta.url))):Promise<PairingRecord>{
 if(!/^\/dev\/cu\.usb[a-zA-Z0-9_.-]+$/.test(path))throw new Error('serial_path');signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const child=spawn(helper,[path],{stdio:['ignore','pipe','ignore']});const decoder=new PairingDecoder();let saved=false;const abort=()=>{child.kill();reject(new Error('cancelled'));};signal.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',async chunk=>{try{for(const msg of decoder.feed(chunk.toString())){if(msg.type==='pairing.pending')onPending();if(msg.type==='pairing.complete'){
   if(saved)continue;saved=true;const p:PairingRecord={device_id:msg.device_id,fingerprint:msg.fingerprint,certificate:msg.certificate,controller_id:msg.controller_id,host:msg.host??host,port:8443};validatePairing(p);
   if(typeof msg.token!=='string'||!/^[a-f0-9]{64}$/.test(msg.token))throw new Error('pairing_format');await secrets.set(`device/${p.device_id}/${p.controller_id}`,msg.token);signal.removeEventListener('abort',abort);resolve(p);
  }if(msg.type==='error')throw new Error('pairing_device');}}catch{child.kill();reject(new Error('pairing_failed'));}});
  child.on('error',()=>{signal.removeEventListener('abort',abort);reject(new Error('serial_helper'));});child.on('close',()=>{signal.removeEventListener('abort',abort);if(!saved)reject(new Error('pairing_timeout'));});
 });
}
