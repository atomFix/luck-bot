import {readFile,writeFile,lstat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
// Local owner-only browser session survives service updates. Network scope is unchanged.
export async function localSession(dir:string):Promise<string>{
 const path=join(dir,'management-session');
 try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.())throw Error('session_ownership');const value=(await readFile(path,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(value))throw Error('session_format');await chmod(path,0o600);return value;}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const value=randomBytes(32).toString('hex');await writeFile(path,value,{mode:0o600,flag:'wx'});return value;
}
export const MANAGEMENT_PORT=4382;
