const LIMIT = 32768;
const privateFields = new Set(['key','apikey','authorization','password','secret','token','accesstoken','refreshtoken','cookie']);
export function capturePayload(value) {
  // JSON bodies only: never store HTTP headers, URLs, audio or transport credentials.
  let serialized;
  try {
    serialized = JSON.stringify(value, (key, data) => {
      if (privateFields.has(key.toLowerCase().replace(/[_-]/g, ''))) return '[REDACTED]';
      if (typeof data === 'string') return data.replace(/\bsk-[A-Za-z0-9_.-]{12,}/g, '[REDACTED]').replace(/\bBearer\s+[^\s"\\]+/gi, 'Bearer [REDACTED]');
      return data;
    });
  } catch { return {data:null,truncated:false,unavailable:'serialization_failed'}; }
  if (serialized === undefined) return null;
  if (serialized.length > LIMIT) return {data:null,preview:serialized.slice(0,LIMIT),truncated:true};
  return {data:JSON.parse(serialized),truncated:false};
}
export class StreamPayload {
  events=[];truncated=false;size=0;
  push(event) {
    const length=JSON.stringify(event).length;
    if(this.truncated||this.size+length>LIMIT){this.truncated=true;return;}
    this.size+=length;this.events.push(event);
  }
  snapshot(complete){return {format:'sse',events:this.events,complete,truncated:this.truncated};}
}
