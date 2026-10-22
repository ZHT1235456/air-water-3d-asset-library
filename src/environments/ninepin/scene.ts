import * as T from 'three';
import type { EnvironmentDefinition, EnvironmentHandle, Point2 } from '../types';
import { rect } from '../marine/geometry';
import { createMarineWater } from '../marine/water';
import { marineConfig } from '../marine/config';
import { ringInsidePolygon } from '../spatial';
import { ninepinSurvey } from './survey';
import { ninepinConfig as c } from './config';

type Island = typeof ninepinSurvey.islands[number];
export function defineNinepin(seed=5104):EnvironmentDefinition {
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('seed 无效');
  const spawnPoints:EnvironmentDefinition['spatial']['spawnPoints']=[];
  for(const kind of ['quadrotor','usv'] as const)for(let i=0;i<12;i++)spawnPoints.push({id:`${kind}-${i}`,kind,position:[-200+(i%6)*16,kind==='usv'?0:10,240+Math.floor(i/6)*20],yaw:0});
  const coastlines=ninepinSurvey.islands.map(i=>i.coast.map(p=>[p[0],p[1]] as Point2));
  return {variant:'ninepin',seed,spatial:{units:'metres',waterLevel:0,bounds:{minX:-2500,maxX:2500,minZ:-2000,maxZ:2000},
    water:[{outer:rect(0,0,c.width,c.depth),holes:coastlines.map(r=>r.map(p=>[...p] as Point2))}],
    obstacles:ninepinSurvey.islands.map((i,n)=>({id:`ninepin-island-${i.osmId}`,name:i.name,kind:'land',color:'#908971',outer:coastlines[n],holes:[],minY:-8,maxY:i.maxHeight+2})),flight:{minY:0,maxY:250},spawnPoints}};
}

/** One continuous measured top surface, closed with skirts and an underwater cap. */
export function islandGeometry(i:Island) {
  const positions=[...i.positions],indices=[...i.indices],count=positions.length/3;
  const edges=new Map<string,{a:number;b:number;n:number}>();
  for(let k=0;k<i.indices.length;k+=3)for(let e=0;e<3;e++){
    const a=i.indices[k+e],b=i.indices[k+(e+1)%3],key=`${Math.min(a,b)}:${Math.max(a,b)}`;
    const old=edges.get(key);if(old)old.n++;else edges.set(key,{a,b,n:1});
  }
  for(let v=0;v<count;v++)positions.push(positions[v*3],-8,positions[v*3+2]);
  for(let k=0;k<i.indices.length;k+=3)indices.push(i.indices[k]+count,i.indices[k+2]+count,i.indices[k+1]+count);
  for(const {a,b,n} of edges.values())if(n===1)indices.push(b,a,a+count,b,a+count,b+count);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  g.userData={osmId:i.osmId,topVertexCount:count,topIndexCount:i.indices.length};return g;
}

function terrainMaterial() {
  const m=new T.MeshStandardMaterial({color:'#ffffff',roughness:.92,metalness:0});
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainPosition; varying vec3 vTerrainNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainPosition=position;vTerrainNormal=normal;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vTerrainPosition; varying vec3 vTerrainNormal;
      float terrainHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float terrainNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(terrainHash(i),terrainHash(i+vec3(1,0,0)),f.x),mix(terrainHash(i+vec3(0,1,0)),terrainHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(terrainHash(i+vec3(0,0,1)),terrainHash(i+vec3(1,0,1)),f.x),mix(terrainHash(i+vec3(0,1,1)),terrainHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec3 tp=vTerrainPosition;float slope=normalize(vTerrainNormal).y;
      float broad=terrainNoise(tp*.035),grain=terrainNoise(tp*.65),fine=terrainNoise(tp*2.5);
      float plants=smoothstep(.5,.82,slope)*smoothstep(2.,12.,tp.y)*smoothstep(.18,.52,broad);
      vec3 rock=mix(vec3(.095,.075,.055),vec3(.21,.15,.095),broad);
      // Photo-guided surface finish only; these seams are not surveyed volcanic columns.
      float seams=smoothstep(.86,.99,abs(sin(tp.x*1.8+terrainNoise(tp*.12)*2.)))*(.25+.75*(1.-slope));
      rock*=.72+.4*grain+.18*fine;rock*=1.-seams*.22;
      vec3 scrub=mix(vec3(.055,.085,.025),vec3(.18,.23,.065),grain);
      diffuseColor.rgb=mix(rock,scrub,plants*.9);
      diffuseColor.rgb*=mix(.52,1.,smoothstep(.3,3.,tp.y));
    `);
  };
  m.customProgramCacheKey=()=> 'ninepin-measured-terrain-v1';return m;
}

function shoreline() {
  const vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(const island of ninepinSurvey.islands){
    const ring=island.coast,n=ring.length,base=vertices.length/3;
    let area=0;for(let j=0;j<n;j++)area+=ring[j][0]*ring[(j+1)%n][1]-ring[(j+1)%n][0]*ring[j][1];
    let distance=0;
    for(let j=0;j<=n;j++){
      const p=ring[j%n],prev=ring[(j+n-1)%n],next=ring[(j+1)%n];
      if(j)distance+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);
      const edge=new T.Vector2(next[0]-prev[0],next[1]-prev[1]).normalize();
      const normal=new T.Vector2(edge.y,-edge.x).multiplyScalar(Math.sign(area));
      vertices.push(p[0],.06,p[1],p[0]+normal.x*5,.06,p[1]+normal.y*5);uvs.push(distance,0,distance,1);
      if(j<n){const a=base+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0}},
    vertexShader:`#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 coastUv;void main(){coastUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader:`#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float time;varying vec2 coastUv;void main(){
      #include <logdepthbuf_fragment>
      float band=exp(-pow((coastUv.y-.22-.13*sin(time*.7+coastUv.x*.04))/.17,2.));
      float breakup=.55+.45*sin(coastUv.x*1.8+sin(coastUv.x*.39)+time*.8);
      float alpha=band*breakup*.24*(1.-smoothstep(.5,1.,coastUv.y));
      gl_FragColor=vec4(.51,.67,.63,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const mesh=new T.Mesh(g,material);mesh.name='ninepin-shore-wash';return mesh;
}

export function createNinepin(seed=5104):EnvironmentHandle {
  const definition=defineNinepin(seed),root=new T.Group(),land=new T.Group();root.add(land);
  root.name='environment-ninepin';root.userData={seed,georeference:c.origin,islandCount:ninepinSurvey.islands.length,sourceGrid:5};
  const material=terrainMaterial(),shrubGeometry=new T.IcosahedronGeometry(1,0),shrubMaterial=new T.MeshStandardMaterial({color:'#505d36',roughness:1});
  const shrubs:T.Matrix4[]=[];let rng=seed>>>0;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  for(const island of ninepinSurvey.islands){
    const geometry=islandGeometry(island),mesh=new T.Mesh(geometry,material);mesh.name=`ninepin-island-${island.osmId}`;mesh.userData.name=island.name;mesh.castShadow=true;mesh.receiveShadow=true;land.add(mesh);
    const normals=geometry.getAttribute('normal');
    for(let j=0;j<island.positions.length;j+=15){
      const x=island.positions[j],y=island.positions[j+1],z=island.positions[j+2];
      if(y<8||normals.getY(j/3)<.82||random()>.6)continue;
      const r=.5+random()*.8;
      if(!ringInsidePolygon(rect(x,z,r*2,r*2),{outer:island.coast as Point2[],holes:[]}))continue;
      shrubs.push(new T.Matrix4().compose(new T.Vector3(x,y+.3,z),new T.Quaternion(),new T.Vector3(r,.35+random()*.6,r)));
    }
  }
  const vegetation=new T.InstancedMesh(shrubGeometry,shrubMaterial,shrubs.length);shrubs.forEach((m,i)=>vegetation.setMatrixAt(i,m));vegetation.name='ninepin-scrub';vegetation.receiveShadow=true;vegetation.computeBoundingSphere();land.add(vegetation);
  const wash=shoreline();land.add(wash);
  const water=createMarineWater();root.add(water.root);const wm=water.root.material as T.ShaderMaterial;
  wm.uniforms.waterColor.value.set('#164f55');wm.uniforms.surfaceRoughness.value=.45;wm.uniforms.waveStrength.value=1.25;
  let disposed=false;
  return {root,spatial:definition.spatial,presentation:{background:'#becbd0',fog:[1400,11000],sunPosition:[-500,700,300],cameraPosition:c.cameras.establishing.position,target:c.cameras.establishing.target,backgroundAsset:marineConfig.sky.url,cameraFar:60000},setVessels:water.setVessels,setSun:water.setSun,setSky:water.setSky,invalidateReflection:water.invalidateReflection,
    setHorizon(color){wm.uniforms.horizonColor.value.copy(color);},
    update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('时间差无效');if(!disposed){water.update(dt);wash.material.uniforms.time.value=(wash.material.uniforms.time.value+dt)%10000;}},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();water.root.removeFromParent();water.dispose();const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();land.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));if(o instanceof T.InstancedMesh)o.dispose();}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
  };
}
