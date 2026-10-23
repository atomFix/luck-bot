import {mkdir,writeFile,rename,unlink,access} from 'node:fs/promises';import {homedir} from 'node:os';import {join} from 'node:path';
const DEFAULT=join(homedir(),'Library/LaunchAgents');
export async function loginStartEnabled(dir=DEFAULT){try{await access(join(dir,'com.roundeyes.companion.plist'));return true;}catch{return false;}}
export async function setLoginStart(app:string,enabled:boolean,dir=DEFAULT):Promise<string>{
 if(!app.startsWith('/')||!app.endsWith('/Round Eyes Companion.app')||app.includes('\0'))throw new Error('install_required');const path=join(dir,'com.roundeyes.companion.plist');
 if(!enabled){await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});return path;}
 const escaped=(app+'/Contents/MacOS/RoundEyesCompanion').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.roundeyes.companion</string><key>ProgramArguments</key><array><string>${escaped}</string><string>--background</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/></dict></plist>`;
 await mkdir(dir,{recursive:true,mode:0o700});const tmp=path+'.'+crypto.randomUUID()+'.tmp';await writeFile(tmp,plist,{mode:0o600,flag:'wx'});await rename(tmp,path);return path;
}
