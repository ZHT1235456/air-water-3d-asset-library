import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EnvironmentDefinition, EnvironmentHandle, Obstacle, Point2, Point3 } from '../types';
import { industrialBuilder, rect } from '../marine/geometry';
import { createMarineWater } from '../marine/water';
import { marineConfig } from '../marine/config';
import { hornseaConfig as c } from './config';
import { hornseaSurvey } from './survey';

function obstacles(): Obstacle[] {
  const result: Obstacle[] = [];
  for (const t of hornseaSurvey.turbines) {
    const prism = (part: string, w: number, d: number, z: number, minY: number, maxY: number) => result.push({
      id: `hornsea-${t.ref}-${part}`, name: `${t.ref} ${part}`, kind: 'facility', color: '#d9bd54',
      outer: rect(t.x,t.z+z,w,d), holes: [], minY,maxY,
    });
    prism('单桩与登乘梯',10,12,1,-15,20);
    prism('检修平台',14,14,0,16,19.5);
    prism('塔筒',7,7,0,20,c.hubHeight+1);
    prism('机舱',10,20,-3,c.hubHeight-5,c.hubHeight+8);
    // Stable conservative swept envelope, independent of the parked blade angles.
    prism('叶轮扫掠包围体',c.rotorDiameter+2,12,c.rotorOffset,c.hubHeight-c.rotorDiameter/2-1,c.hubHeight+c.rotorDiameter/2+1);
  }
  return result;
}

export function defineHornsea(seed=5103): EnvironmentDefinition {
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff) throw new RangeError('seed 无效');
  const boundary = rect(0,0,c.width,c.depth);
  const spawnPoints: EnvironmentDefinition['spatial']['spawnPoints'] = [];
  for(const kind of ['quadrotor','usv'] as const) for(let i=0;i<12;i++) spawnPoints.push({
    id:`${kind}-${i}`,kind,position:[50+(i%6)*16,kind==='usv'?0:10,240+Math.floor(i/6)*20],yaw:0,
  });
  return {variant:'hornsea',seed,spatial:{units:'metres',waterLevel:0,bounds:{minX:-c.width/2,maxX:c.width/2,minZ:-c.depth/2,maxZ:c.depth/2},water:[{outer:boundary,holes:[]}],obstacles:obstacles(),flight:{minY:0,maxY:250},spawnPoints}};
}

/** Closed tapered airfoil, 81 m from the 2.5 m root radius to the 83.5 m tip. */
function bladeGeometry() {
  const vertices:number[]=[],indices:number[]=[],rings=32,sides=16;
  for(let i=0;i<=rings;i++) {
    const u=i/rings,y=2.5+81*u;
    const chord=u<.13 ? T.MathUtils.lerp(2.8,5,u/.13) : T.MathUtils.lerp(5,.06,Math.pow((u-.13)/.87,.82));
    const thickness=T.MathUtils.lerp(.9,.015,Math.pow(u,.6)),twist=(1-u)**2*.38;
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2,x=Math.cos(a)*chord/2,z=Math.sin(a)*thickness;
      vertices.push(x*Math.cos(twist)-z*Math.sin(twist)-u*u*2.5,y,x*Math.sin(twist)+z*Math.cos(twist)+u*u*1.4);
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);}
  for(let j=1;j<sides-1;j++){indices.push(0,j,j+1);const k=rings*sides;indices.push(k,k+j+1,k+j);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function createHornsea(seed=5103): EnvironmentHandle {
  const definition=defineHornsea(seed),root=new T.Group(),structures=new T.Group();root.add(structures);
  root.name='environment-hornsea';root.userData={seed,georeference:c.origin,turbines:hornseaSurvey.turbines.map(t=>({...t})),accuracy:'OSM 机位 / 局部工程参考模型'};
  const white=new T.MeshStandardMaterial({color:'#e6e9e3',roughness:.46,metalness:.12});
  const yellow=new T.MeshStandardMaterial({color:'#dcb63b',roughness:.65,metalness:.18});
  const steel=new T.MeshStandardMaterial({color:'#aab5b5',roughness:.65,metalness:.35});
  const refs=hornseaSurvey.turbines.map(t=>t.ref);
  const instances=(name:string,geometry:T.BufferGeometry,material:T.Material,perTurbine:number,transform:(index:number,part:number)=>T.Matrix4)=>{
    const mesh=new T.InstancedMesh(geometry,material,refs.length*perTurbine);mesh.name=name;mesh.userData.turbineRefs=[...refs];
    for(let i=0;i<refs.length;i++)for(let j=0;j<perTurbine;j++)mesh.setMatrixAt(i*perTurbine+j,transform(i,j));
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();structures.add(mesh);return mesh;
  };
  const pose=(i:number,y:number,z=0,rotation=0)=>new T.Matrix4().compose(new T.Vector3(hornseaSurvey.turbines[i].x,y,hornseaSurvey.turbines[i].z+z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),rotation),new T.Vector3(1,1,1));
  instances('hornsea-monopiles',new T.CylinderGeometry(3.6,4,35,24),yellow,1,i=>pose(i,2.5));
  instances('hornsea-towers',new T.CylinderGeometry(2.05,3.3,c.hubHeight-20,32),white,1,i=>pose(i,(c.hubHeight+20)/2));
  instances('hornsea-platforms',new T.CylinderGeometry(6.5,6.5,.65,32),steel,1,i=>pose(i,17));
  instances('hornsea-nacelles',new RoundedBoxGeometry(6.2,5.8,13,3,1.1),white,1,i=>pose(i,c.hubHeight,-3));
  const hub=new T.SphereGeometry(3.1,24,16);hub.scale(1,1,1.4);
  instances('hornsea-hubs',hub,white,1,i=>pose(i,c.hubHeight,c.rotorOffset));
  instances('hornsea-blades',bladeGeometry(),white,3,(i,j)=>pose(i,c.hubHeight,c.rotorOffset,j*Math.PI*2/3+(i%3)*.17));
  const b=industrialBuilder(structures,[]);
  for(const t of hornseaSurvey.turbines) {
    const {x,z}=t;
    const beam=(color:string,a:Point3,d:Point3,r:number)=>b.beam(color,[x+a[0],a[1],z+a[2]],[x+d[0],d[1],z+d[2]],r,true);
    for(let i=0;i<24;i++) {
      const a=i/24*Math.PI*2,next=(i+1)/24*Math.PI*2;
      const p:Point2=[Math.cos(a)*6.15,Math.sin(a)*6.15],q:Point2=[Math.cos(next)*6.15,Math.sin(next)*6.15];
      beam('#bac2ba',[p[0],17.4,p[1]],[p[0],18.6,p[1]],.055);
      for(const y of [18,18.6])beam('#bac2ba',[p[0],y,p[1]],[q[0],y,q[1]],.045);
    }
    // Paired boat-landing fenders, ladder and gate, based on common monopile access fittings.
    for(const side of [-1,1]) {
      beam('#3e4e4c',[side*1.4,-1,4.8],[side*1.4,8,4.8],.22);
      beam('#d8b73f',[side*.45,.5,4.3],[side*.45,18.5,4.3],.055);
      b.box('#b5bfba',x+side*.75,2.5,z+4.1,1.4,.25,.45);
    }
    for(let y=.6;y<18;y+=.35)beam('#9da8a5',[-.45,y,4.3],[.45,y,4.3],.04);
    b.box('#63706c',x,20.9,z+3.26,1.1,1.8,.12);
    b.box('#cead40',x,c.hubHeight+3,z-6.3,5,.18,5.3);
    for(const side of [-1,1]) {
      beam('#b94f3e',[side*2.6,c.hubHeight+3.1,-9],[side*2.6,c.hubHeight+4,-9],.05);
      beam('#b94f3e',[side*2.6,c.hubHeight+4,-9],[side*2.6,c.hubHeight+4,-3.7],.06);
    }
    beam('#bac2ba',[0,c.hubHeight+3,-1],[0,c.hubHeight+6,-1],.07);
    beam('#b94f3e',[-.6,c.hubHeight+5.5,-1],[.6,c.hubHeight+5.5,-1],.06);
  }
  b.flush();
  const water=createMarineWater();root.add(water.root);
  (water.root.material as T.ShaderMaterial).uniforms.waterColor.value.set('#123b48');
  (water.root.material as T.ShaderMaterial).uniforms.surfaceRoughness.value=.78;
  (water.root.material as T.ShaderMaterial).uniforms.waveStrength.value=1.7;
  let disposed=false;
  return {root,spatial:definition.spatial,presentation:{background:'#becbd0',fog:[1400,11000],sunPosition:[-500,700,300],cameraPosition:c.cameras.establishing.position,target:c.cameras.establishing.target,backgroundAsset:marineConfig.sky.url,cameraFar:60000},setVessels:water.setVessels,setSun:water.setSun,setSky:water.setSky,invalidateReflection:water.invalidateReflection,
    setHorizon(color){(water.root.material as T.ShaderMaterial).uniforms.horizonColor.value.copy(color);},
    update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('时间差无效');if(!disposed)water.update(dt);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();water.root.removeFromParent();water.dispose();const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();structures.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));if(o instanceof T.InstancedMesh)o.dispose();}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
  };
}
