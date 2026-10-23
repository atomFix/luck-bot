export const isExpired=(now:number,deadline:number):boolean=>((now-deadline)|0)>=0;
export function toDeviceDeadline(hostNow:number,sample:{host_ms:number;device_ms:number;rtt_ms:number},ttl:number):number {
 if(!Number.isFinite(ttl)||ttl<=0||ttl>15000||sample.rtt_ms<0||sample.rtt_ms>3000||hostNow<sample.host_ms||hostNow-sample.host_ms>15000)throw new Error('clock');
 return (Math.floor(sample.device_ms+hostNow-sample.host_ms+sample.rtt_ms/2+ttl))>>>0;
}
