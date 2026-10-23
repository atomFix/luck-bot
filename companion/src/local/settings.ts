import {z} from 'zod';import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';import {join} from 'node:path';import {homedir} from 'node:os';import {ProfileSchema,DEFAULT_SPEECH} from '../providers/config.js';
const PairingSchema=z.object({device_id:z.string().regex(/^roundeyes-[a-f0-9]{12}$/),host:z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),port:z.number().int().min(1).max(65535),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),certificate:z.string().min(100).max(4096),controller_id:z.string().regex(/^[a-f0-9]{16}$/)}).strict();
const Schema=z.object({version:z.literal(1),devices:z.array(PairingSchema).max(16),selected:z.string().max(64).nullable(),output:z.enum(['device','mac']),speech:z.object({asr:ProfileSchema,tts:ProfileSchema}).strict(),deepseek_model:z.string().min(1).max(100)}).strict();
export type Settings=z.infer<typeof Schema>;
export const DATA_DIR=join(homedir(),'Library/Application Support/Round Eyes Companion');
export class SettingsStore {
 constructor(readonly dir=DATA_DIR){}
 async read():Promise<Settings>{try{return Schema.parse(JSON.parse(await readFile(join(this.dir,'settings.json'),'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,devices:[],selected:null,output:'device',speech:structuredClone(DEFAULT_SPEECH),deepseek_model:'deepseek-flash'};throw new Error('settings_invalid');}}
 async update(input:unknown):Promise<Settings>{const config=Schema.parse(input);if(new Set(config.devices.map(d=>d.device_id)).size!==config.devices.length)throw new Error('device_duplicate');if(config.selected&&!config.devices.some(d=>d.device_id===config.selected))throw new Error('device_unknown');
  for(const p of [config.speech.asr,config.speech.tts]){if(p.credential_ref!==`provider/${p.provider}`)throw new Error('credential_provider');const url=new URL(p.endpoint);if(!['https:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('provider_endpoint');}
  await mkdir(this.dir,{recursive:true,mode:0o700});const tmp=join(this.dir,`settings.${crypto.randomUUID()}.tmp`);await writeFile(tmp,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});await rename(tmp,join(this.dir,'settings.json'));return config;
 }
}
