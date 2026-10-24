import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createEnvironment, defineEnvironment, checkPlacement } from '../src/environments';
import { siteSurveys, usvSiteConfigs } from '../src/environments/usv-sites/config';
import { parseSceneConfig, serializeSceneConfig } from '../src/scenes/config';
import { placementVolume, ringInsidePolygon, polygonsOverlap } from '../src/environments/spatial';
import type { Placement } from '../src/environments';

for (const variant of ['westlake','kallang','waalhaven'] as const) {
  test(`${variant}: source-backed layout, safe fleet, static corridors and configuration reuse`,()=>{
    const d=siteSurveys[variant], c=usvSiteConfigs[variant], spatial=defineEnvironment(variant).spatial;
    assert.deepEqual(d,JSON.parse(readFileSync(`public/assets/${variant}/layout.json`,'utf8')));
    const source=readFileSync(`public/assets/${variant}/site.osm`,'utf8');
    for(const f of [...d.buildings,...d.structures]) assert.ok(source.includes(`<${f.osmType} id="${f.osmId}"`),f.id);
    const initial=parseSceneConfig(readFileSync(`public/assets/${variant}/fleet-scene.json`,'utf8'));
    assert.equal(initial.vehicles.length,12);assert.deepEqual(parseSceneConfig(serializeSceneConfig(initial)),initial);
    const bounds:Placement['bounds']={min:[-.8,-.4,-2],max:[.8,3,2]};
    const fleet=initial.vehicles.map(v=>({id:v.id,kind:'usv' as const,position:v.position,yaw:v.yaw,bounds}));
    for(const boat of fleet)assert.deepEqual(checkPlacement(spatial,boat,fleet),[]);
    const nav=JSON.parse(readFileSync(`public/assets/${variant}/navigation.json`,'utf8'));
    assert.deepEqual(nav.routes,c.routes);
    // Sample a conservative boat hull through every segment. The GIS validator
    // additionally checks the entire continuous corridor including endpoints.
    for(const route of c.routes) for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5);
      for(let k=0;k<=steps;k++){
        const x=a[0]+(b[0]-a[0])*k/steps,z=a[1]+(b[1]-a[1])*k/steps;
        const footprint=placementVolume({id:'route',kind:'usv',position:[x,0,z],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),bounds});
        assert.ok(spatial.water.some(p=>ringInsidePolygon(footprint.outer,p)),route.id);
        assert.ok(!spatial.obstacles.filter(o=>o.minY<=0).some(o=>polygonsOverlap(footprint,o)),route.id);
      }
    }
    assert.ok(d.structures.some(f=>f.kind==='pier'||f.kind==='bridge'));
    assert.deepEqual(spatial,defineEnvironment(variant,c.seed+1).spatial,'seed must not randomize real geography');
  });
}

test('new mapped scenes own their resources and water animation never moves collision data',()=>{
  const a=createEnvironment({variant:'kallang'}),b=createEnvironment({variant:'kallang'});
  const before=JSON.stringify(a.spatial),resources=new Set<T.BufferGeometry|T.Material>();
  a.root.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>resources.add(m));}});
  const counts=new Map<object,number>();resources.forEach(r=>{counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)!+1));});
  a.update(.5);assert.equal(JSON.stringify(a.spatial),before);a.dispose();a.dispose();counts.forEach(n=>assert.equal(n,1));
  b.update(.25);assert.equal((b.root.getObjectByName('water-0') as T.Mesh<T.BufferGeometry,T.ShaderMaterial>).material.uniforms.time.value,.25);b.dispose();
});
