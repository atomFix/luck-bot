import {Bonjour} from 'bonjour-service';
export type DeviceAdvertisement={device_id:string;host:string;port:number;protocol:1};
export async function discover(signal:AbortSignal,duration=3000):Promise<DeviceAdvertisement[]>{
 signal.throwIfAborted();const bonjour=new Bonjour();const found=new Map<string,DeviceAdvertisement>();
 return new Promise((resolve)=>{let timer:ReturnType<typeof setTimeout>;const browser=bonjour.find({type:'roundeyes'},service=>{
  const id=String(service.txt?.device_id??'');const host=service.addresses?.find(a=>/^\d+\.\d+\.\d+\.\d+$/.test(a))??service.host;
  if(/^roundeyes-[a-f0-9]{12}$/.test(id)&&host)found.set(id,{device_id:id,host,port:service.port,protocol:1});
 });const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);browser.stop();bonjour.destroy();resolve([...found.values()]);};timer=setTimeout(stop,duration);signal.addEventListener('abort',stop,{once:true});
 });
}
