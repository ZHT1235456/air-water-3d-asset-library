import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFileSync } from 'node:fs';
import { createEnvironment, defineEnvironment, checkPlacement } from '../src/environments';
import { hornseaSurvey } from '../src/environments/hornsea/survey';
import { hornseaConfig } from '../src/environments/hornsea/config';
import type { Placement } from '../src/environments/types';

test('Hornsea positions trace to the retained OSM snapshot with no invented regular grid',()=>{
  const raw=readFileSync('public/assets/hornsea/site.osm','utf8');
  assert.equal(hornseaSurvey.turbines.length,12);
  assert.deepEqual(JSON.parse(readFileSync('public/assets/hornsea/turbines.json','utf8')),hornseaSurvey);
  for(const t of hornseaSurvey.turbines){
    const node=raw.match(new RegExp(`<node id="${t.osmId}"[^>]+>`))?.[0];assert.ok(node);
    assert.ok(node.includes(`lat="${t.latitude.toFixed(7)}"`));assert.ok(node.includes(`lon="${t.longitude.toFixed(7)}"`));
    const x=(t.longitude-hornseaSurvey.origin.longitude)*Math.PI/180*6378137*Math.cos(hornseaSurvey.origin.latitude*Math.PI/180);
    const z=-(t.latitude-hornseaSurvey.origin.latitude)*Math.PI/180*6378137;
    assert.ok(Math.abs(t.x-x)<.001);assert.ok(Math.abs(t.z-z)<.001);
  }
  assert.equal(hornseaSurvey.turbines[0].ref,'G33');
  assert.equal(hornseaConfig.rotorDiameter,167);
});

test('Hornsea separates low water access from tower and complete high rotor envelope',()=>{
  const e=createEnvironment({variant:'hornsea'}),other=createEnvironment({variant:'hornsea'});
  const spatial=e.spatial;assert.deepEqual(spatial,defineEnvironment('hornsea').spatial);
  const pose=(x:number,y:number,z:number,kind:Placement['kind']='usv'):Placement=>({id:'p',kind,position:[x,y,z],yaw:0,bounds:{min:[-.5,-.3,-1],max:[.5,1,1]}});
  assert.deepEqual(checkPlacement(spatial,pose(45,0,6)),[]);
  assert.ok(checkPlacement(spatial,pose(45,116.5,6,'quadrotor')).some(i=>i.otherId==='hornsea-G33-叶轮扫掠包围体'));
  assert.ok(checkPlacement(spatial,pose(0,0,0)).some(i=>i.code==='obstacle'));
  assert.deepEqual(checkPlacement(spatial,pose(45,220,6,'quadrotor')),[]);
  const blades=e.root.getObjectByName('hornsea-blades') as T.InstancedMesh;
  assert.equal(blades.count,36);
  blades.geometry.computeBoundingBox();assert.equal(blades.geometry.boundingBox!.max.y,83.5);
  const position=blades.geometry.getAttribute('position'),normal=blades.geometry.getAttribute('normal');
  assert.ok(normal.getX(16*16)>0,'airfoil outside normal must point outward');
  assert.ok(Array.from(position.array).every(Number.isFinite));
  const before=JSON.stringify(spatial);e.update(2);assert.equal(JSON.stringify(spatial),before);
  const resources=new Set<T.BufferGeometry|T.Material>();e.root.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>resources.add(m));}});
  const counts=new Map<object,number>();resources.forEach(r=>{counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)!+1));});
  e.dispose();e.dispose();counts.forEach(n=>assert.equal(n,1));
  other.update(.5);assert.ok((other.root.getObjectByName('water-0') as any).material.uniforms.time.value>0);other.dispose();
});
