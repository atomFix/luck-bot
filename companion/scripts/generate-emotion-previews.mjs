import {mkdtemp,readFile,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';
const base=fileURLToPath(new URL('../',import.meta.url)),hardware=resolve(base,'../hardware/esp32-bringup'),temp=await mkdtemp(join(tmpdir(),'eyes-catalog-'));
try{
 const binary=join(temp,'export-emotions');execFileSync('c++',['-std=c++17','-O2','-I'+hardware,join(hardware,'preview/export_emotions.cc'),join(hardware,'character/eyes_model.cc'),join(hardware,'character/eye_poses.cc'),'-o',binary]);
 const catalog=JSON.parse(execFileSync(binary,{encoding:'utf8'}));const labels=JSON.parse(await readFile(join(base,'config/emotion-labels.json'),'utf8'));
 if(catalog.items.length!==Object.keys(labels).length||catalog.items.some(e=>!labels[e.key]))throw Error('emotion_labels_mismatch');
 for(const e of catalog.items)e.zh=labels[e.key];
 const output='// Generated from firmware EyesModel and eye_poses.cc; run scripts/generate-emotion-previews.mjs.\nwindow.RoundEyesEmotionCatalog = '+JSON.stringify(catalog)+';\n';
 if(process.argv.includes('--check')){if(await readFile(join(base,'ui/emotion-catalog.js'),'utf8')!==output)throw Error('emotion_catalog_stale');}
 else await writeFile(join(base,'ui/emotion-catalog.js'),output);
 console.log(`${catalog.items.length} emotions, ${catalog.pose_count} base poses exported from firmware.`);
}finally{await rm(temp,{recursive:true,force:true});}
