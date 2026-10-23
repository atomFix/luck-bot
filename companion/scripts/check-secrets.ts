import {readFile,readdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {KeychainSecrets} from '../src/secrets.js';
const store=new KeychainSecrets(process.argv[2]);const needles:Buffer[]=[];for(const provider of ['deepseek','minimax','dashscope']){const key=await store.get('provider/'+provider);if(key)needles.push(Buffer.from(key));}
const leaks:string[]=[];let scanned=0;
async function walk(path:string){for(const entry of await readdir(path,{withFileTypes:true})){if(['node_modules','.git'].includes(entry.name))continue;const file=join(path,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&!entry.name.endsWith('.zip')){const bytes=await readFile(file);scanned++;if(needles.some(n=>bytes.includes(n)))leaks.push(file);}}}
for(const dir of ['companion','docs/superpowers','hardware/esp32-bringup/companion','output/round-eyes-companion'])await walk(resolve(dir));
console.log(JSON.stringify({providers_checked:needles.length,files_scanned:scanned,leak_paths:leaks}));if(leaks.length)process.exitCode=1;
