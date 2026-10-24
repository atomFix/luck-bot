import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
async function geometry(){const ctx:any={window:{}};for(const name of ['emotion-catalog','eye-geometry'])runInNewContext(await readFile(new URL('../ui/'+name+'.js',import.meta.url),'utf8'),ctx);return {catalog:ctx.window.RoundEyesEmotionCatalog,geometry:ctx.window.RoundEyesGeometry};}
test('directional preview uses the native projected capsule silhouettes at rest',async()=>{
 const {catalog,geometry:g}=await geometry();
 for(const item of catalog.items)for(const pose of item.poses){
  const projected=g.project(pose,{},0,false);
  for(let eye=0;eye<2;eye++){const native=pose.paths[eye].match(/-?\d+(?:\.\d+)?/g).map(Number);assert.equal(projected[eye].length,native.length);for(let i=0;i<native.length;i++)assert(Math.abs(projected[eye][i]-native[i])<.08,`${item.key} pose ${pose.id} point ${i}`);}
 }
});
test('looking around changes the face perspective, with a narrower far eye and bounded geometry',async()=>{
 const {catalog,geometry:g}=await geometry(),pose=catalog.items[0].poses[0];
 const center=(frame:number[][])=>frame.flatMap(p=>p.filter((_,i)=>i%2===0)).reduce((n,v)=>n+v,0)/96;
 const left=g.project(pose,{look_x:-1}),right=g.project(pose,{look_x:1});assert(center(right)-center(left)>40);
 const width=(p:number[])=>Math.max(...p.filter((_,i)=>i%2===0))-Math.min(...p.filter((_,i)=>i%2===0));assert(width(right[0])>width(right[1])*1.3);
 for(const item of catalog.items)for(const p of item.poses)for(const d of g.directions){const frame=g.project(p,{look_x:d.x,look_y:d.y,scale:1.2,shake:1},330,true);for(const eye of frame)for(let i=0;i<eye.length;i+=2){const x=eye[i],y=eye[i+1];assert(Number.isFinite(x)&&Number.isFinite(y));assert(y>=42&&y<=198);assert(Math.hypot(x-120,y-120)<112);}}
});
