import {homedir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
if(!process.argv.includes('--play-test-sentences')){console.log('Usage: node scripts/acoustic-soak.mjs --play-test-sentences [report.json]\nRequires an already connected installed app, Mac output, and explicit permission to play speech. Runs at most 10 acoustic turns over 10 minutes; stops on first error. Paid ASR/model/TTS calls occur. Never changes volume/output route.');process.exit(0);}
const app=process.env.ROUND_EYES_APP_PATH??join(homedir(),'Applications','Round Eyes Companion.app');
const {daemonCall}=await import(pathToFileURL(join(app,'Contents/Resources/app/dist/src/integrations/daemon-client.js')).href);
import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
const report={date:new Date().toISOString(),status:'running',method:'Mac say Tingting -> physical board mic -> installed Companion -> Mac output; no volume or route changes',rounds:[],duration_ms:0};
const path=resolve(process.argv.find((arg,index)=>index>1&&!arg.startsWith('--'))??'acoustic-soak.json'),started=performance.now();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=()=>{report.duration_ms=Math.round(performance.now()-started);writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});};
const say=text=>new Promise((resolve,reject)=>{const c=spawn('/usr/bin/say',['-v','Tingting','-r','165',text],{stdio:'ignore'});c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(new Error('say_failed')));});
// Report contains numeric metadata and safe error identifiers only, never audio or recognized text.
let boot,session,baseTurn;
const safeStatus=async()=>{const s=await daemonCall('status');if(!s.connected)throw new Error('device_disconnected');if(s.device.boot_id!==boot)throw new Error('device_rebooted');if(s.device.session_id!==session)throw new Error('device_reconnected');return s;};
const prompts=['我今天很开心，请只回答太好了。','我有一点难过，请用一句话安慰我。','我有点困了，请只说晚安。','今天终于连上了，我很惊喜，请简短回答。','刚才说困了，现在精神好多了，请简短回答。','我没有不开心，请简短回答。','我在开玩笑，今天挺顺利的，请简短回答。','谢谢你陪着我，请只回答不客气。','我有点疑惑，请说我在听。','测试结束了，我很满意，请只回答再见。'];
try{
 const initial=await daemonCall('status');if(!initial.connected||initial.settings.output!=='mac'||initial.device.capture_active)throw new Error('preflight_failed');boot=initial.device.boot_id;session=initial.device.session_id;baseTurn=initial.device.turn_seq??0;report.boot_id=boot;save();
 for(let i=0;i<10;i++){
  const scheduled=started+i*57000;while(performance.now()<scheduled){await sleep(Math.min(1000,scheduled-performance.now()));await safeStatus();}
  const round={index:i+1,status:'running',events:[]};report.rounds.push(round);save();
  const wakeAt=performance.now();const wake=say('你好小智');let turn;
  while(performance.now()-wakeAt<10000){const s=await safeStatus();const e=s.events.find(e=>e.event==='capture.started'&&e.turn>baseTurn);if(e){turn=e.turn;break;}await sleep(100);}
  await wake;if(!turn)throw new Error('wake_not_detected');baseTurn=turn;round.turn=turn;round.wake_ms=Math.round(performance.now()-wakeAt);await say(prompts[i]);
  const waitAt=performance.now();let done=false;
  while(performance.now()-waitAt<45000){const s=await safeStatus();round.events=s.events.filter(e=>e.turn===turn);if(s.lastError)throw new Error(/^[a-zA-Z0-9_.-]+$/.test(s.lastError)?s.lastError:'voice_failed');if(s.device.turn_seq>turn)throw new Error('unexpected_new_turn');if(round.events.some(e=>e.event==='reply.completed')){if(!round.events.some(e=>e.event==='playback.started'))throw new Error('playback_unobserved');done=true;break;}await sleep(200);}
  if(!done)throw new Error('reply_timeout');round.status='passed';save();process.stdout.write(JSON.stringify({round:i+1,status:'passed',events:round.events})+'\n');
 }
 while(performance.now()-started<600000){await sleep(1000);await safeStatus();}
 report.status='passed';
}catch(e){report.status='failed';report.code=/^[a-zA-Z0-9_.-]+$/.test(e.message)?e.message:'test_failed';const last=report.rounds.at(-1);if(last?.status==='running')last.status='failed';try{await daemonCall('interrupt');}catch{}process.stdout.write(JSON.stringify({status:'failed',code:report.code})+'\n');}
finally{save();}
