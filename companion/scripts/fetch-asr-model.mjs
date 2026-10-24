import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const base=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(join(base,'config/asr-model.json')));
const dir=join(base,'models');mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const matches=(p,f)=>{if(!existsSync(p))return false;const b=readFileSync(p);return b.length===f.size&&hash(b)===f.sha256;};
for(const f of manifest.files)if(!/^[a-zA-Z0-9_.-]+$/.test(f.name))throw Error('model_path');
if(manifest.files.some(f=>!matches(join(dir,f.name),f))){
  if(manifest.engine==='sensevoice'){
    for(const f of manifest.files){
      const target=join(dir,f.name);if(matches(target,f))continue;
      const tmp=target+'.part';let ok=false;
      for(const url of [f.url,f.mirror_url].filter(Boolean)){
        if(!url.startsWith('https://'))throw Error('model_url');
        const r=spawnSync('/usr/bin/curl',['--fail','--location','--connect-timeout','10','--max-time','600','--output',tmp,url],{stdio:'inherit'});
        if(r.status===0&&matches(tmp,f)){renameSync(tmp,target);ok=true;break;}
        if(existsSync(tmp))unlinkSync(tmp);
      }
      if(!ok)throw Error('asr_file_hash_mismatch');
    }
  }else{
    const archive=join(dir,'asr-model.archive.part');let bytes=existsSync(archive)?readFileSync(archive):null;
    if(!bytes||bytes.length!==manifest.archive_size||hash(bytes)!==manifest.archive_sha256){
      const r=spawnSync('/usr/bin/curl',['--fail','--location','--continue-at','-','--connect-timeout','15','--max-time','900','--output',archive,manifest.url],{stdio:'inherit'});
      if(r.status!==0)throw Error('asr_model_download_failed');bytes=readFileSync(archive);
    }
    if(bytes.length!==manifest.archive_size||hash(bytes)!==manifest.archive_sha256)throw Error('asr_model_hash_mismatch');
    for(const f of manifest.files){
      if(f.archive_path.includes('..')||f.archive_path.startsWith('/'))throw Error('model_path');
      const r=spawnSync('/usr/bin/tar',['-xOf',archive,'./'+f.archive_path],{maxBuffer:40*1024*1024});
      if(r.status!==0||r.stdout.length!==f.size||hash(r.stdout)!==f.sha256)throw Error('asr_file_hash_mismatch');
      const tmp=join(dir,f.name+'.part');writeFileSync(tmp,r.stdout);renameSync(tmp,join(dir,f.name));
    }
  }
}
if(!manifest.files.every(f=>matches(join(dir,f.name),f)))throw Error('asr_model_hash_mismatch');
console.log('Pinned local ASR model and public probe waveform hashes verified');
