import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{execFileSync}from'node:child_process';import{runInNewContext}from'node:vm';import{fileURLToPath}from'node:url';import{EMOTIONS}from'../src/contracts.js';
test('shipped eye previews match current native firmware contours and all callable emotion keys',async()=>{
 const base=fileURLToPath(new URL('../',import.meta.url));execFileSync(process.execPath,[base+'scripts/generate-emotion-previews.mjs','--check'],{cwd:base});
 const context:any={window:{}};runInNewContext(await readFile(base+'ui/emotion-catalog.js','utf8'),context);const c=JSON.parse(JSON.stringify(context.window.RoundEyesEmotionCatalog));
 assert.deepEqual(c.items.map((x:any)=>x.key),[...EMOTIONS]);assert.equal(c.pose_count,49);
 for(const item of c.items){assert.match(item.zh,/[\u4e00-\u9fff]/);assert(item.poses.length>=1);for(const pose of item.poses){assert.equal(pose.paths.length,2);for(const path of pose.paths){assert(!/NaN|Infinity/.test(path));assert.equal((path.match(/L/g)??[]).length,47);assert(path.startsWith('M')&&path.endsWith('Z'));}}}
});
