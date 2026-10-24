import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnvironmentDefinition, EnvironmentHandle, Obstacle, Point2, Polygon } from '../types';
import { pointInPolygon } from '../spatial';
import { createMarineWater } from '../marine/water';
import { marineConfig } from '../marine/config';
import { siteSurveys, usvSiteConfigs } from './config';
import type { USVSiteVariant } from './types';

const copyPolygon = (p: Polygon): Polygon => ({ outer: p.outer.map(p => [...p]), holes: p.holes.map(r => r.map(p => [...p])) });
function shape(p: Polygon) {
  const s = new T.Shape(p.outer.map(([x,z]) => new T.Vector2(x,-z)));
  s.holes = p.holes.map(r => new T.Path(r.map(([x,z]) => new T.Vector2(x,-z))));
  return s;
}
function prism(p: Polygon, bottom: number, top: number) {
  const g = new T.ExtrudeGeometry(shape(p), { depth: top-bottom, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0,bottom,0); g.clearGroups();
  return g;
}

export function defineUSVSite(variant: USVSiteVariant, seed = usvSiteConfigs[variant].seed): EnvironmentDefinition {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed 无效');
  const d = siteSurveys[variant], c = usvSiteConfigs[variant];
  const obstacles: Obstacle[] = d.land.map((p,i) => ({ ...copyPolygon(p), id:`${variant}-land-${i}`, name:'实景岸线',
    kind:'land', color:c.groundColor, minY:-5, maxY:d.bankHeight }));
  for (const f of d.buildings) obstacles.push({ ...copyPolygon(f.polygon), id:`${variant}-${f.id}`, name:f.name || '岸上建筑',
    kind:'building', color:c.buildingColors[0], minY:d.bankHeight, maxY:d.bankHeight+f.height });
  for (const f of d.structures) obstacles.push({ ...copyPolygon(f.polygon), id:`${variant}-${f.id}`, kind:f.kind,
    name:f.kind === 'bridge' ? `${f.name || '桥位'}（净空未核实，保守禁入）` : (f.name || '码头'),
    color:'#b8b4a6', minY:-5, maxY:f.height+1 });
  const spawnPoints: EnvironmentDefinition['spatial']['spawnPoints'] = [];
  for (const kind of ['usv','quadrotor'] as const) for (let i=0;i<12;i++) spawnPoints.push({
    id:`${kind}-${i}`, kind, position:[c.spawn[0]+i%4*14, kind === 'usv' ? 0 : 12, c.spawn[1]+Math.floor(i/4)*14], yaw:c.yaw,
  });
  return { variant, seed, spatial:{ units:'metres', waterLevel:0,
    bounds:{ minX:-d.width/2, maxX:d.width/2, minZ:-d.depth/2, maxZ:d.depth/2 },
    water:d.water.map(copyPolygon), obstacles, flight:{ minY:0, maxY:250 }, spawnPoints } };
}

function surfaceMaterial(building = false) {
  const material = new T.MeshStandardMaterial({ vertexColors:true, roughness:building ? .72 : .92, metalness:building ? .08 : 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 sitePosition; varying vec3 siteNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsitePosition=position;siteNormal=normal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 sitePosition; varying vec3 siteNormal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Fade subpixel surface grain instead of producing striped moire in aerial views.
        float grain=sin(sitePosition.x*1.17)*sin(sitePosition.z*.87);
        float grainVisibility=1.-smoothstep(.3,1.5,max(fwidth(sitePosition.x),fwidth(sitePosition.z)));
        diffuseColor.rgb*=.98+.02*grain*grainVisibility;
        ${building ? `
          float face=1.-smoothstep(.05,.3,abs(siteNormal.y));
          float axis=abs(siteNormal.x)>.5?sitePosition.z:sitePosition.x;
          vec2 cell=fract(vec2(axis/4.,sitePosition.y/3.2));
          float visible=1.-smoothstep(1.5,4.,max(fwidth(axis),fwidth(sitePosition.y)));
          float windowMask=step(.23,cell.x)*step(cell.x,.76)*step(.3,cell.y)*step(cell.y,.8)*face*visible;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.24,.26),windowMask*.55);
        ` : ''}`);
  };
  material.customProgramCacheKey = () => `mapped-site-${building ? 'facades' : 'ground'}-v1`;
  return material;
}

/** Mapped footprints and shore topology; display heights are deliberately not a DEM. */
export function createUSVSite(variant: USVSiteVariant, seed = usvSiteConfigs[variant].seed): EnvironmentHandle {
  const definition = defineUSVSite(variant,seed), d = siteSurveys[variant], c = usvSiteConfigs[variant];
  const root = new T.Group(), solids = new T.Group(); root.name=`environment-${variant}`; root.add(solids);
  root.userData = { seed, georeference:{...d.origin}, heightAccuracy:'OSM height where available; otherwise display estimate',
    routes:structuredClone(c.routes), source:`/assets/${variant}/sources.json` };
  const terrain = surfaceMaterial(), buildings = surfaceMaterial(true);
  const batches = new Map<T.Material,T.BufferGeometry[]>();
  const add = (g:T.BufferGeometry, color:string, m:T.Material=terrain) => {
    const colors:number[] = [], base = new T.Color(color), normals = g.getAttribute('normal');
    for(let i=0;i<g.getAttribute('position').count;i++) {
      const shade = normals.getY(i) > .7 ? 1.04 : .84;
      colors.push(base.r*shade,base.g*shade,base.b*shade);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(g);
  };
  for(const p of d.land) add(prism(p,-5,d.bankHeight),c.groundColor);
  for(const f of d.green) add(prism(f.polygon,d.bankHeight+.015,d.bankHeight+.06),'#73855a');
  for(const f of d.roads) add(prism(f.polygon,d.bankHeight+.07,d.bankHeight+.10),f.pedestrian?'#c2bda7':'#697270');
  for(const [i,f] of d.buildings.entries()) add(prism(f.polygon,d.bankHeight+.12,d.bankHeight+f.height),c.buildingColors[i%3],buildings);
  for(const f of d.structures) {
    // No invented bridge piers or verified under-bridge passages. The footprint
    // is conservatively excluded by spatial data; deck height is visual only.
    add(prism(f.polygon,f.kind==='pier'?-.5:f.height-.8,f.height),f.kind==='pier'?'#9e9482':'#c2c6bf');
  }
  for(const [material,geometries] of batches) {
    const geometry=mergeGeometries(geometries,false)!; geometries.forEach(g=>g.dispose());
    const mesh=new T.Mesh(geometry,material); mesh.name=material===buildings?'mapped-buildings':'mapped-shores-and-roads';
    mesh.castShadow=true;mesh.receiveShadow=true;solids.add(mesh);
  }

  // Decorative trees only inside mapped green areas, clear of mapped buildings and roads.
  let state=seed>>>0; const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const boxes=(features:{polygon:Polygon}[])=>features.map(f=>({p:f.polygon,
    x0:Math.min(...f.polygon.outer.map(p=>p[0])), x1:Math.max(...f.polygon.outer.map(p=>p[0])),
    z0:Math.min(...f.polygon.outer.map(p=>p[1])), z1:Math.max(...f.polygon.outer.map(p=>p[1]))}));
  const greens=boxes(d.green), exclusions=boxes([...d.buildings,...d.roads,...d.structures]);
  const inside=(p:Point2,areas:ReturnType<typeof boxes>)=>areas.some(b=>p[0]>=b.x0&&p[0]<=b.x1&&p[1]>=b.z0&&p[1]<=b.z1&&pointInPolygon(p,b.p));
  const treeMatrices:T.Matrix4[]=[], trunkMatrices:T.Matrix4[]=[];
  const matrix = new T.Matrix4(), q=new T.Quaternion();
  for(let x=-d.width/2+8;x<d.width/2-8;x+=18)for(let z=-d.depth/2+8;z<d.depth/2-8;z+=18){
    const p:Point2=[x+(random()-.5)*10,z+(random()-.5)*10];
    if(!inside(p,greens)||inside(p,exclusions))continue;
    const r=2.2+random()*2.2, h=4+random()*3;
    if(![[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dz])=>inside([p[0]+dx,p[1]+dz],greens)&&!inside([p[0]+dx,p[1]+dz],exclusions)))continue;
    treeMatrices.push(matrix.compose(new T.Vector3(p[0],d.bankHeight+h,p[1]),q,new T.Vector3(r,h*.55,r)).clone());
    trunkMatrices.push(matrix.compose(new T.Vector3(p[0],d.bankHeight+h*.4,p[1]),q,new T.Vector3(.23,h*.8,.23)).clone());
  }
  const trees=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:'#466944',roughness:1}),treeMatrices.length);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,5),new T.MeshStandardMaterial({color:'#71664f',roughness:1}),trunkMatrices.length);
  trees.name='decorative-vegetation';trunks.name='decorative-trunks';
  treeMatrices.forEach((m,i)=>trees.setMatrixAt(i,m));trunkMatrices.forEach((m,i)=>trunks.setMatrixAt(i,m));
  trees.castShadow=true; trees.receiveShadow=true;trees.computeBoundingSphere();trunks.computeBoundingSphere();solids.add(trees,trunks);
  const water=createMarineWater(new T.ShapeGeometry(d.water.map(shape)));root.add(water.root);
  const wm=water.root.material as T.ShaderMaterial;
  wm.uniforms.waterColor.value.set(c.waterColor);wm.uniforms.waveStrength.value=.45;wm.uniforms.surfaceRoughness.value=.12;
  let disposed=false;
  return { root, spatial:definition.spatial, presentation:{ background:'#c3d1d1',fog:[2200,10000],sunPosition:[-500,900,300],
    cameraPosition:[...c.cameras.establishing.position],target:[...c.cameras.establishing.target],backgroundAsset:marineConfig.sky.url,cameraFar:18000 },
    setVessels:water.setVessels,setSun:water.setSun,setSky:water.setSky,invalidateReflection:water.invalidateReflection,
    setHorizon(color){wm.uniforms.horizonColor.value.copy(color);},
    update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('时间差无效');if(!disposed)water.update(dt);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();water.root.removeFromParent();water.dispose();
      const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
      solids.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));if(o instanceof T.InstancedMesh)o.dispose();}});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    },
  };
}
