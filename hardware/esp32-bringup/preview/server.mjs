import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const model=spawn(fileURLToPath(new URL('../build-host/model_host',import.meta.url)),[],{stdio:['pipe','pipe','inherit']});
let frame='{}',buffer='';
model.stdout.on('data',chunk=>{buffer+=chunk;let p;while((p=buffer.indexOf('\n'))>=0){frame=buffer.slice(0,p);buffer=buffer.slice(p+1);}});
const valid=s=>/^pose (?:auto|[0-9]|1[0-9]|2[0-4])$/.test(s)||/^emotion [a-z_]{1,32}$/.test(s)||/^behavior (?:idle|waking|listening|waiting|speaking|reconnecting)$/.test(s)||(/^energy (?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(s));
const page=await readFile(new URL('./index.html',import.meta.url));
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page);}
 if(req.method==='GET'&&req.url==='/frame'){res.setHeader('Content-Type','application/json');return res.end(frame);}
 if(req.method==='POST'&&req.url==='/control'){
  if(req.headers.origin&&!/^http:\/\/127\.0\.0\.1:4382$/.test(req.headers.origin)){res.writeHead(403);return res.end();}
  let body='';for await(const c of req){body+=c;if(body.length>128){res.writeHead(413);return res.end();}}
  if(!valid(body)){res.writeHead(400);return res.end('invalid control');}model.stdin.write(body+'\n');return res.end('ok');
 }
 res.writeHead(404);res.end();
});
server.listen(4382,'127.0.0.1',()=>console.log('Round eyes preview http://127.0.0.1:4382'));
model.on('exit',()=>server.close());
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{model.kill();server.close();});
