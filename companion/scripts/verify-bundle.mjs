import {readFileSync,lstatSync} from 'node:fs';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]);const list=JSON.parse(readFileSync(join(root,'Contents/Resources/manifest.json'),'utf8'));
for(const [relative,hash] of Object.entries(list)){if(relative.includes('..')||relative.startsWith('/'))throw Error('manifest_path');const file=join(root,relative);if(!lstatSync(file).isFile()||createHash('sha256').update(readFileSync(file)).digest('hex')!==hash)throw Error('manifest_mismatch');}
if(!lstatSync(join(root,'Contents/MacOS/RoundEyesCompanion')).isFile()||!list['Contents/Resources/node']||!list['Contents/Resources/app/dist/src/main.js'])throw Error('manifest_incomplete');
console.log('Bundle manifest verified');
