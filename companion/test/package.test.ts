import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
test('real bundle installs upgrades with rollback and uninstalls only the chosen app',async()=>{const dir=await mkdtemp(join(tmpdir(),'re-install-'));try{
 const source=fileURLToPath(new URL('../../output/round-eyes-companion/Round Eyes Companion.app',import.meta.url));const dest=join(dir,'Round Eyes Companion.app');
 execFileSync('bash',[fileURLToPath(new URL('../scripts/install.sh',import.meta.url)),source,dest],{stdio:'pipe'});assert((await stat(join(dest,'Contents/MacOS/RoundEyesCompanion'))).isFile());
 assert(JSON.parse(execFileSync(join(dest,'Contents/MacOS/round-eyes'),['--help'],{encoding:'utf8'})).usage.length>0);
 const info=await readFile(join(dest,'Contents/Info.plist'),'utf8');assert(info.includes('com.roundeyes.companion'));
 execFileSync('bash',[fileURLToPath(new URL('../scripts/install.sh',import.meta.url)),source,dest],{stdio:'pipe'});assert((await stat(dest+'.previous')).isDirectory());
 execFileSync('bash',[fileURLToPath(new URL('../scripts/uninstall.sh',import.meta.url)),dest],{stdio:'pipe'});await assert.rejects(stat(dest));assert((await stat(dest+'.previous')).isDirectory());
}finally{await rm(dir,{recursive:true,force:true});}});
