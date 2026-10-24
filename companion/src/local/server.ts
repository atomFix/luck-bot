import {wav16k} from '../voice/utterance.js';
import {createServer,type IncomingMessage} from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {randomBytes,timingSafeEqual} from 'node:crypto';import type {Secrets} from '../contracts.js';
const safeEqual=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function startLocalServer(options:{secretStore:Secrets;actions:(name:string,input:any)=>Promise<any>;state?:()=>Promise<object>;credentialsChanged?:()=>Promise<void>;uiDir?:string;speaker?:(op:string,input:any)=>Promise<any>;audio?:(id:string)=>Promise<{pcm:Uint8Array}|null>;admin?:(op:string,input:any)=>Promise<any>}) {
 const bootstrap=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');const tokens=new Map([[bootstrap,Date.now()+60000]]);let url='';
 async function body(req:IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const b of req){size+=b.length;if(size>8192)throw new Error('body_size');chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const reply=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(req.headers.host!==new URL(url).host||(req.headers.origin!==undefined&&req.headers.origin!==url)){reply(403,{error:'forbidden'});return;}
  try{
   const path=new URL(req.url??'/',url).pathname;
   if(req.method==='POST'&&path==='/api/bootstrap'){
    const b=await body(req);if(typeof b.token!=='string'||![...tokens].some(([token,until])=>until>Date.now()&&safeEqual(token,b.token))){reply(403,{error:'forbidden'});return;}tokens.delete(b.token);res.setHeader('Set-Cookie',`re_session=${session}; HttpOnly; SameSite=Strict; Path=/`);reply(200,{csrf});return;
   }
   if(path.startsWith('/api/')){
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('re_session='))?.slice(11)??'';
    if(!safeEqual(cookie,session)){reply(403,{error:'forbidden'});return;}
    if(req.method==='GET'&&path==='/api/audio'){
     const id=new URL(req.url??'/',url).searchParams.get('turn_id');if(!id||! /^[a-zA-Z0-9_.:-]{1,160}$/.test(id)){reply(400,{error:'audio_id'});return;}
     const clip=await options.audio?.(id);if(!clip){reply(404,{error:'audio_not_found'});return;}
     const wav=Buffer.from(wav16k(clip.pcm));res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');
     let start=0,end=wav.length-1;const range=req.headers.range;
     if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){res.statusCode=416;res.setHeader('Content-Range',`bytes */${wav.length}`);res.end();return;}
      if(!match[1])start=Math.max(0,wav.length-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=wav.length){res.statusCode=416;res.setHeader('Content-Range',`bytes */${wav.length}`);res.end();return;}
      res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${wav.length}`);
     }
     res.setHeader('Content-Length',end-start+1);res.end(wav.subarray(start,end+1));return;
    }
    if(req.method==='GET'&&path==='/api/session'){reply(200,{csrf});return;}
    if(req.method==='GET'&&path==='/api/state'){
     const credentials:Record<string,boolean>={};for(const name of ['deepseek','minimax','dashscope'])credentials[name]=options.secretStore.has ? await options.secretStore.has(`provider/${name}`) : !!await options.secretStore.get(`provider/${name}`);
     reply(200,{...(await options.state?.()??{}),credentials});return;
    }
    if(req.method!=='POST'||req.headers.origin!==url||req.headers['x-csrf-token']!==csrf||!req.headers['content-type']?.startsWith('application/json')){reply(403,{error:'forbidden'});return;}
    const b=await body(req);
    if(path==='/api/speaker'){
     if(!options.speaker||!['list','enroll-start','enroll-next','enroll-cancel','profile-remove','profile-enable','settings'].includes(b.op)||!b.input||typeof b.input!=='object'||Array.isArray(b.input))throw new Error('speaker_operation');reply(200,await options.speaker(b.op,b.input));return;
    }
    if(path==='/api/admin'){
     if(!options.admin||!['list','detail','summary','prices','savePrice','privacy','clear'].includes(b.op)||!b.input||typeof b.input!=='object'||Array.isArray(b.input))throw new Error('admin_operation');reply(200,await options.admin(b.op,b.input));return;
    }
    if(path==='/api/credentials/reveal'){
     if(!['deepseek','minimax','dashscope'].includes(b.provider))throw new Error('credential_format');await options.admin?.('audit',{event:'credential.revealed',provider:b.provider});const value=await options.secretStore.get('provider/'+b.provider);reply(200,{value});return;
    }
    if(path==='/api/credentials'){
     if(!['deepseek','minimax','dashscope'].includes(b.provider)||(b.remove!==true&&(typeof b.value!=='string'||!b.value.trim()||b.value.length>4096)))throw new Error('credential_format');
     if(b.remove===true)await options.secretStore.delete('provider/'+b.provider);else await options.secretStore.set('provider/'+b.provider,b.value);
     await options.admin?.('audit',{event:'credential.changed',provider:b.provider});await options.credentialsChanged?.();reply(200,{configured:b.remove!==true});return;
    }
    const action=path.slice(5);if(!/^[a-z-]{1,40}$/.test(action)){reply(404,{error:'unknown_action'});return;}
    const result=await options.actions(action,b);if(action==='settings')await options.admin?.('audit',{event:'configuration.changed'});reply(200,result);return;
   }
   if(req.method!=='GET'){reply(405,{error:'method'});return;}
   const files:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/admin.js':['admin.js','text/javascript; charset=utf-8'],'/emotion-catalog.js':['emotion-catalog.js','text/javascript; charset=utf-8'],'/emotions.js':['emotions.js','text/javascript; charset=utf-8']};
   const asset=files[path];if(!asset){reply(404,{error:'not_found'});return;}
   const data=await readFile((options.uiDir??fileURLToPath(new URL('../../ui/',import.meta.url)))+'/'+asset[0]);res.setHeader('Content-Type',asset[1]);res.end(data);
  }catch(error){const code=error instanceof Error&&/^[a-z_0-9]+$/.test(error.message)?error.message:'operation_failed';reply(400,{error:code});}
 });
 server.requestTimeout=15000;server.headersTimeout=5000;server.maxHeadersCount=32;
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('listen');url=`http://127.0.0.1:${address.port}`;
 return {url,bootstrap,issueBootstrap:()=>{for(const [key,until] of tokens)if(until<=Date.now())tokens.delete(key);const token=randomBytes(32).toString('hex');tokens.set(token,Date.now()+60000);while(tokens.size>8)tokens.delete(tokens.keys().next().value!);return url+'/#'+token;},close:()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
