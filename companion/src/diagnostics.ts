import type {EventMeta} from './contracts.js';
const identifier=/^[a-zA-Z0-9_.-]{1,80}$/;
export function logEvent(write:(line:string)=>void, meta:EventMeta):void {
 const out:Record<string,string|number>={event:identifier.test(meta.event)?meta.event:'invalid'};
 for (const key of ['turn','duration_ms','bytes','requests','input_tokens','output_tokens'] as const) {
  const value=meta[key];if(typeof value==='number' && Number.isFinite(value) && value>=0)out[key]=value;
 }
 for(const key of ['code','model'] as const){const value=meta[key];if(typeof value==='string' && identifier.test(value))out[key]=value;}
 write(JSON.stringify(out));
}
