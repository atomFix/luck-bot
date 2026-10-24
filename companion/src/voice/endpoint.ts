import * as ort from 'onnxruntime-node';
import {createRequire} from 'node:module';
export interface SpeechScorer {score(frame:Float32Array):Promise<number>}
let session:Promise<ort.InferenceSession>|undefined;
function loadModel(){return session??=ort.InferenceSession.create(createRequire(import.meta.url).resolve('@ricky0123/vad-node/dist/silero_vad.onnx'),{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,logSeverityLevel:4});}
export class SileroScorer implements SpeechScorer {
 private h:ort.Tensor=new ort.Tensor('float32',new Float32Array(128),[2,1,64]);
 private c:ort.Tensor=new ort.Tensor('float32',new Float32Array(128),[2,1,64]);
 async score(frame:Float32Array):Promise<number>{
  if(frame.length!==1536)throw new Error('vad_frame_size');
  try{const result=await (await loadModel()).run({input:new ort.Tensor('float32',frame,[1,1536]),sr:new ort.Tensor('int64',BigInt64Array.from([16000n]),[1]),h:this.h,c:this.c});
   this.h=result.hn!;this.c=result.cn!;const probability=Number(result.output!.data[0]);if(!Number.isFinite(probability))throw new Error();return probability;
  }catch{throw new Error('vad_unavailable');}
 }
}
export class SpeechEndpoint {
 private frame=new Float32Array(1536);private offset=0;private samples=0;private positive=0;private quiet=0;private heard=false;private ended=false;
 constructor(private scorer:SpeechScorer=new SileroScorer()){}
 async push(pcm:Uint8Array):Promise<boolean>{
  if(this.ended)return true;if(pcm.length%2)throw new Error('audio_size');const bytes=Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength);
  for(let i=0;i<bytes.length;i+=2){this.frame[this.offset++]=bytes.readInt16LE(i)/32768;this.samples++;
   if(this.offset===1536){this.offset=0;const p=await this.scorer.score(this.frame);
    this.positive=p>=0.6?this.positive+1:0;if(this.positive>=3)this.heard=true;
    if(this.heard){this.quiet=p<0.35?this.quiet+1:0;if(this.quiet>=8){this.ended=true;return true;}}
   }
   if(!this.heard&&this.samples>=160000)throw new Error('no_speech');if(this.samples>=480000)throw new Error('utterance_too_long');
  }return false;
 }
}
