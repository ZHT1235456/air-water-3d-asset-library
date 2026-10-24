import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironment, defineEnvironment, checkPlacement } from '../src/environments';
import { environmentLibrary } from '../src/scenes/environment-library';
import { jiuzhouConfig } from '../src/environments/jiuzhou/config';
import { toJiuzhouWorld } from '../src/environments/jiuzhou/scene';

test('display registry retains deepwater while adding separately labelled real sites',()=>{
 assert.deepEqual(environmentLibrary.map(e=>e.variant),['deepwater','qingzhou','jiuzhou','hornsea','ninepin','westlake','kallang','waalhaven']);
 assert.equal(new Set(environmentLibrary.map(e=>e.source)).size,8);
 assert.equal(environmentLibrary[0].category,'原创工程示范');
 assert.notDeepEqual(environmentLibrary[1].cameras,environmentLibrary[2].cameras);
});
test('Jiuzhou layout preserves published spans, rotated water clearance and independent lifetimes',()=>{
 assert.equal(jiuzhouConfig.spans.reduce((a,b)=>a+b,0),693);
 const e=createEnvironment({variant:'jiuzhou'}),other=createEnvironment({variant:'jiuzhou'});
 assert.deepEqual(e.spatial,defineEnvironment('jiuzhou').spatial);
 const deck=e.spatial.obstacles.find(o=>o.id==='jiuzhou-main-deck')!;
 assert.ok(Math.abs(Math.hypot(deck.outer[1][0]-deck.outer[0][0],deck.outer[1][1]-deck.outer[0][1])-693)<1e-8);
 const bounds={min:[-.5,-.3,-.5],max:[.5,1,.5]} as const;
 const pose=(x:number,y:number,z:number)=>{const p=toJiuzhouWorld([x,z]);return {id:'test',kind:'usv' as const,position:[p[0],y,p[1]] as [number,number,number],yaw:0,bounds:{min:[...bounds.min] as [number,number,number],max:[...bounds.max] as [number,number,number]}};};
 assert.deepEqual(checkPlacement(e.spatial,pose(0,0,0)),[]);
 assert.ok(checkPlacement(e.spatial,{...pose(0,44,0),kind:'quadrotor'}).some(i=>i.otherId==='jiuzhou-main-deck'));
 assert.ok(checkPlacement(e.spatial,pose(134,0,0)).some(i=>i.code==='obstacle'));
 assert.ok(e.spatial.obstacles.some(o=>o.id.startsWith('sail-rib')));
 assert.ok(!e.spatial.obstacles.some(o=>o.id.startsWith('knot')));
 let released=0;const w=e.root.getObjectByName('water-0') as any;w.getRenderTarget().addEventListener('dispose',()=>released++);e.dispose();e.dispose();assert.equal(released,1);
 other.update(.25);assert.ok((other.root.getObjectByName('water-0') as any).material.uniforms.time.value>0);other.dispose();
});
