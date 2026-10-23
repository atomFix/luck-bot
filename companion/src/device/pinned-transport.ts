import {createHash,X509Certificate} from 'node:crypto';import {checkServerIdentity} from 'node:tls';
import WebSocket from 'ws';import {Agent} from 'node:https';
export type PairingRecord={device_id:string;host:string;port:number;fingerprint:string;certificate:string;controller_id:string};
export function validatePairing(p:PairingRecord):void {
 if(!/^roundeyes-[a-f0-9]{12}$/.test(p.device_id)||!p.host||/[\s/@?#]/.test(p.host)||!Number.isInteger(p.port)||p.port<1||p.port>65535)throw new Error('pairing_format');
 const cert=new X509Certificate(p.certificate);
 if(createHash('sha256').update(cert.raw).digest('hex')!==p.fingerprint.toLowerCase())throw new Error('identity_mismatch');
}
export function pinnedSocket(p:PairingRecord):WebSocket {
 validatePairing(p);const host=p.host.includes(':')?'['+p.host+']':p.host;
 const agent=new Agent({ca:p.certificate,rejectUnauthorized:true,servername:p.device_id,
  checkServerIdentity:(_hostname,cert)=>{
   const error=checkServerIdentity(p.device_id,cert);if(error)return error;
   return createHash('sha256').update(cert.raw).digest('hex')===p.fingerprint.toLowerCase()?undefined:new Error('identity_mismatch');
  }
 });
 return new WebSocket(`wss://${host}:${p.port}/v1/session`,{agent,handshakeTimeout:5000,maxPayload:2048,followRedirects:false});
}
