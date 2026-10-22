import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createEnvironment, defineEnvironment, checkPlacement } from '../src/environments';
import { ninepinSurvey } from '../src/environments/ninepin/survey';
import { islandGeometry } from '../src/environments/ninepin/scene';
import { pointInRing } from '../src/environments/spatial';
import type { Placement, Point2 } from '../src/environments/types';

test('Ninepin retains 23 mapped shores and measured elevations without random island layouts',()=>{
  assert.equal(ninepinSurvey.islands.length,23);assert.equal(ninepinSurvey.sourceGrid,5);assert.equal(ninepinSurvey.missingSamples,0);
  assert.deepEqual(JSON.parse(readFileSync('public/assets/ninepin/terrain.json','utf8')),ninepinSurvey);
  const xml=readFileSync('public/assets/ninepin/site.osm','utf8');
  for(const i of ninepinSurvey.islands){
    const way=xml.match(new RegExp(`<way id="${i.osmId}"[\\s\\S]*?</way>`))?.[0];assert.ok(way);
    assert.equal([...way.matchAll(/<nd ref=/g)].length-1,i.coast.length);
    assert.ok(i.maxHeight>.5);assert.ok(i.maxHeight<130);
  }
  assert.deepEqual(defineEnvironment('ninepin',5).spatial,defineEnvironment('ninepin',6).spatial);
  const s=defineEnvironment('ninepin').spatial;assert.equal(s.water[0].holes.length,23);
  const bounds:Placement['bounds']={min:[-.1,-.1,-.1],max:[.1,.2,.1]};
  for(const island of ninepinSurvey.islands){
    const p=island.indices.slice(0,3).map(i=>island.positions.slice(i*3,i*3+3));
    const x=p.reduce((n,p)=>n+p[0],0)/3,z=p.reduce((n,p)=>n+p[2],0)/3;
    assert.ok(pointInRing([x,z],island.coast as Point2[]));
    const pose:Placement={id:'check',kind:'usv',position:[x,0,z],yaw:0,bounds};
    const issues=checkPlacement(s,pose);assert.ok(issues.some(e=>e.code==='water'));assert.ok(issues.some(e=>e.otherId===`ninepin-island-${island.osmId}`));
    assert.deepEqual(checkPlacement(s,{...pose,kind:'quadrotor',position:[x,180,z]}),[]);
  }
  assert.deepEqual(checkPlacement(s,{id:'channel',kind:'usv',position:[-200,0,240],yaw:0,bounds}),[]);
});

test('Ninepin terrain is closed and outward with reusable independent resources',()=>{
  for(const island of ninepinSurvey.islands){
    const g=islandGeometry(island),idx=g.index!,p=g.getAttribute('position');
    const edgeCounts=new Map<string,number>();let volume=0;
    for(let j=0;j<idx.count;j+=3){
      const ids=[idx.getX(j),idx.getX(j+1),idx.getX(j+2)];
      for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=`${Math.min(a,b)}:${Math.max(a,b)}`;edgeCounts.set(key,(edgeCounts.get(key)??0)+1);}
      const a=new T.Vector3().fromBufferAttribute(p,ids[0]),b=new T.Vector3().fromBufferAttribute(p,ids[1]),c=new T.Vector3().fromBufferAttribute(p,ids[2]);volume+=a.dot(b.cross(c))/6;
    }
    assert.ok([...edgeCounts.values()].every(n=>n===2),`${island.name}: closed two-manifold`);assert.ok(volume>0,`${island.name}: outward winding`);g.dispose();
  }
  const a=createEnvironment({variant:'ninepin'}),b=createEnvironment({variant:'ninepin'});
  const before=JSON.stringify(a.spatial);a.update(.5);assert.equal(before,JSON.stringify(a.spatial));
  assert.equal((a.root.getObjectByName('ninepin-shore-wash') as T.Mesh<T.BufferGeometry,T.ShaderMaterial>).material.uniforms.time.value,.5);
  assert.equal((b.root.getObjectByName('ninepin-shore-wash') as T.Mesh<T.BufferGeometry,T.ShaderMaterial>).material.uniforms.time.value,0);
  const resources=new Set<T.BufferGeometry|T.Material>();a.root.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>resources.add(m));}});
  const counts=new Map<object,number>();resources.forEach(r=>{counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)!+1));});
  a.dispose();a.dispose();counts.forEach(n=>assert.equal(n,1));b.update(.25);b.dispose();
});
