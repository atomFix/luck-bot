import {request} from 'node:http';import {join} from 'node:path';import {DATA_DIR} from '../local/settings.js';
export async function daemonCall(name:string,input:unknown={},dir=DATA_DIR,timeout=90000):Promise<any>{return new Promise((resolve,reject)=>{
 const data=JSON.stringify({name,input});if(Buffer.byteLength(data)>8192){reject(new Error('body_size'));return;}
 const req=request({socketPath:join(dir,'control.sock'),path:'/action',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
  let body='';res.on('data',chunk=>{body+=chunk;if(body.length>65536)req.destroy(new Error('response_size'));});res.on('end',()=>{try{const parsed=JSON.parse(body);res.statusCode===200?resolve(parsed):reject(new Error(parsed.error??'daemon_error'));}catch{reject(new Error('daemon_protocol'));}});
 });req.setTimeout(timeout,()=>req.destroy(new Error('daemon_timeout')));req.on('error',()=>reject(new Error('daemon_unavailable')));req.end(data);
 });}
