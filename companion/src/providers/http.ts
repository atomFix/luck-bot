import { randomUUID } from "node:crypto";
import {
  beginAttempt,
  meterResponse,
  type MeterMeta,
} from "../ledger/journal.js";
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export function providerError(status: number): Error {
  return new Error(
    status === 401 || status === 403
      ? "provider_auth"
      : status === 402
        ? "provider_balance"
        : status === 429
          ? "provider_rate"
          : "provider_http_" + status,
  );
}
export async function request(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  budget = 15000,
  meta?: MeterMeta,
): Promise<Response> {
  const logical_id = randomUUID();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(budget)]);
  for (let attempt = 0; ; attempt++) {
    bounded.throwIfAborted();
    const meter = meta
      ? await beginAttempt({ ...meta, logical_id })
      : undefined;
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        signal: bounded,
        redirect: "error",
      });
    } catch {
      await meter?.finish(bounded.aborted ? "cancelled" : "failed", {
        error: bounded.aborted ? "cancelled" : "provider_network",
      });
      bounded.throwIfAborted();
      if (attempt === 0) continue;
      throw new Error("provider_network");
    }
    if (response.ok) {
      if (meter) meterResponse(response, meter);
      return response;
    }
    let response_data:unknown;
    if(meta?.request_data!==undefined){
      try{const raw=await readModelBody(response);let data;try{data=JSON.parse(raw.text);}catch{data=raw.text;}response_data={http_status:response.status,body:data,truncated:raw.truncated};}
      catch{response_data={http_status:response.status,unavailable:"body_unreadable"};}
    }
    await meter?.finish("failed", {
      error: providerError(response.status).message,
      response_data,
    });
    await response.body?.cancel();
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(t);
          reject(new Error("cancelled"));
        };
        const t = setTimeout(() => {
          bounded.removeEventListener("abort", abort);
          resolve();
        }, 250);
        bounded.addEventListener("abort", abort, { once: true });
      });
      continue;
    }
    throw providerError(response.status);
  }
}
export async function* sse(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<any> {
  if (!response.body) throw new Error("provider_empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) throw new Error("provider_stream_incomplete");
      bytes += value.length;
      if (bytes > 262144) throw new Error("provider_size");
      rest += decoder.decode(value, { stream: true });
      let end;
      while ((end = rest.indexOf("\n")) >= 0) {
        const line = rest.slice(0, end).trimEnd();
        rest = rest.slice(end + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        if (data) yield JSON.parse(data);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readModelBody(response:Response):Promise<{text:string;truncated:boolean}>{
 if(!response.body)return {text:'',truncated:false};
 const reader=response.body.getReader();const decoder=new TextDecoder();let text='',bytes=0,truncated=false;
 try{while(true){const chunk=await reader.read();if(chunk.done){text+=decoder.decode();break;}const remaining=131072-bytes;const part=chunk.value.subarray(0,Math.max(0,remaining));bytes+=part.length;text+=decoder.decode(part,{stream:true});if(chunk.value.length>remaining){truncated=true;break;}}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return {text,truncated};
}
