import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {join} from 'node:path';
let recognizer;
let decodes=0;
const streams=new Map();
const offline=workerData.engine==='sensevoice';
try {
  const {OnlineRecognizer,OfflineRecognizer}=createRequire(import.meta.url)('sherpa-onnx-node');
  const modelConfig={tokens:join(workerData.base,workerData.tokens),numThreads:offline?2:1,provider:'cpu',debug:false};
  recognizer=offline
    ? new OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{...modelConfig,senseVoice:{model:join(workerData.base,workerData.model),language:'zh',useInverseTextNormalization:1}}})
    : new OnlineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{...modelConfig,zipformer2Ctc:{model:join(workerData.base,workerData.model)}},decodingMethod:'greedy_search',enableEndpoint:false});
  parentPort.postMessage({ready:true});
} catch {parentPort.postMessage({error:'local_asr_unavailable'});}
parentPort.on('message',async m=>{
  try {
    if(m.op==='cancel'){streams.delete(m.stream);return;}
    if(!recognizer)throw Error('local_asr_unavailable');
    if(m.op==='start'){
      if(streams.size>=2)throw Error('asr_busy');
      streams.set(m.stream,{stream:recognizer.createStream(),bytes:0,cpu_ms:0,ending:false,sum:0,squared:0,samples:0});
    } else {
      const entry=streams.get(m.stream);
      if(!entry||entry.ending)throw Error('cancelled');
      const t=performance.now();
      if(m.op==='push'){
        const b=Buffer.from(m.pcm);entry.bytes+=b.length;
        if(b.length%2||entry.bytes>960000)throw Error('audio_size');
        const samples=new Float32Array(b.length/2);
        for(let n=0;n<samples.length;n++){
          const raw=b.readInt16LE(n*2);samples[n]=raw/32768;
          entry.sum+=raw;entry.squared+=raw*raw;entry.samples++;
        }
        entry.stream.acceptWaveform({sampleRate:16000,samples});
      } else if(m.op==='finish'){
        entry.ending=true;
        if(offline){
          // SenseVoice can hallucinate words from digital silence or constant DC.
          // A conservative AC RMS floor leaves quiet speech intact; VAD handles noise.
          const variance=entry.samples?entry.squared/entry.samples-(entry.sum/entry.samples)**2:0;
          if(variance<25){streams.delete(m.stream);parentPort.postMessage({request:m.request,text:'',cpu_ms:Math.round(entry.cpu_ms)});return;}
          if(decodes>=2)throw Error('asr_busy');
          decodes++;
          let result;
          try {result=await recognizer.decodeAsync(entry.stream);} finally {decodes--;}
          // A cancelled native decode may finish later; never revive its stream.
          if(streams.get(m.stream)!==entry)return;
          streams.delete(m.stream);
          parentPort.postMessage({request:m.request,text:result.text,cpu_ms:Math.round(entry.cpu_ms+performance.now()-t)});
          return;
        }
        entry.stream.acceptWaveform({sampleRate:16000,samples:new Float32Array(10667)});
        entry.stream.inputFinished();
      } else throw Error('asr_operation');
      if(!offline){
        let steps=0;
        while(recognizer.isReady(entry.stream)){
          if(++steps>2000)throw Error('asr_decode_limit');
          recognizer.decode(entry.stream);
        }
      }
      entry.cpu_ms+=performance.now()-t;
      if(m.op==='finish'){
        const text=recognizer.getResult(entry.stream).text;streams.delete(m.stream);
        parentPort.postMessage({request:m.request,text,cpu_ms:Math.round(entry.cpu_ms)});return;
      }
    }
    parentPort.postMessage({request:m.request});
  } catch(e){
    streams.delete(m.stream);
    parentPort.postMessage({request:m.request,error:e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'local_asr_failed'});
  }
});
