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
test('giant eye previews have the same screen-filling and asymmetric scale as firmware',async()=>{
 const {catalog,geometry:g}=await geometry();
 const area=(p:number[])=>Math.abs(p.reduce((sum,v,i)=>i%2?sum:sum+v*p[(i+3)%p.length]!-p[(i+2)%p.length]!*p[i+1]!,0))/2;
 const span=(p:number[],axis:number)=>{const a=p.filter((_,i)=>i%2===axis);return Math.max(...a)-Math.min(...a);};
 for(const key of ['giant_left','giant_right']){
  const f=g.project(catalog.items.find((x:any)=>x.key===key).poses[0]),big=key==='giant_left'?0:1;
  assert(span(f[big],0)>200&&span(f[big],1)>200);assert(area(f[big])>30000);assert(area(f[big])/area(f[1-big])>80);
 }
 const f=g.project(catalog.items.find((x:any)=>x.key==='mega_eyes').poses[0]);assert(area(f[0])+area(f[1])>26000);
});
test('looking around changes the face perspective, with a narrower far eye and bounded geometry',async()=>{
 const {catalog,geometry:g}=await geometry(),pose=catalog.items[0].poses[0];
 const center=(frame:number[][])=>frame.flatMap(p=>p.filter((_,i)=>i%2===0)).reduce((n,v)=>n+v,0)/96;
 const left=g.project(pose,{look_x:-1}),right=g.project(pose,{look_x:1});assert(center(right)-center(left)>40);
 const width=(p:number[])=>Math.max(...p.filter((_,i)=>i%2===0))-Math.min(...p.filter((_,i)=>i%2===0));assert(width(right[0])>width(right[1])*1.3);
 for(const item of catalog.items)for(const p of item.poses)for(const d of g.directions){const frame=g.project(p,{look_x:d.x,look_y:d.y,scale:1.2,shake:1},330,true);for(const eye of frame)for(let i=0;i<eye.length;i+=2){const x=eye[i],y=eye[i+1];assert(Number.isFinite(x)&&Number.isFinite(y));assert(y>=2&&y<=238);assert(Math.hypot(x-120,y-120)<118);}}
});
