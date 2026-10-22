import * as T from 'three';
import type { EnvironmentDefinition, EnvironmentHandle, Obstacle, Point2, Point3 } from '../types';
import { industrialBuilder } from '../marine/geometry';
import { createMarineWater } from '../marine/water';
import { marineConfig } from '../marine/config';
import { jiuzhouConfig as c } from './config';

type Part={id:string;color:string;a:Point3;b?:Point3;size:Point3;round?:boolean;collision:boolean};
export const toJiuzhouWorld=([x,z]:Point2):Point2=>[x*Math.cos(c.rotation)+z*Math.sin(c.rotation),-x*Math.sin(c.rotation)+z*Math.cos(c.rotation)];
function layout(){
  const parts:Part[]=[], obstacles:Obstacle[]=[];
  const prism=(id:string,x:number,z:number,w:number,d:number,lo:number,hi:number)=>obstacles.push({id,name:id,kind:'bridge',color:'#bcc4c1',holes:[],outer:([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]] as Point2[]).map(toJiuzhouWorld),minY:lo,maxY:hi});
  const box=(id:string,color:string,x:number,y:number,z:number,w:number,h:number,d:number,collision=true)=>{parts.push({id,color,a:[x,y,z],size:[w,h,d],collision});if(collision)prism(id,x,z,w,d,y-h/2,y+h/2);};
  const beam=(id:string,color:string,a:Point3,b:Point3,width:number,round=false)=>{
    parts.push({id,color,a,b,size:[width,width,width],round,collision:true});
    const start=new T.Vector3(...a),end=new T.Vector3(...b),n=Math.ceil(start.distanceTo(end)/12);
    for(let i=0;i<n;i++){const p=start.clone().lerp(end,i/n),q=start.clone().lerp(end,(i+1)/n);prism(`${id}-${i}`,(p.x+q.x)/2,(p.z+q.z)/2,Math.abs(p.x-q.x)+width*2,Math.abs(p.z-q.z)+width*2,Math.min(p.y,q.y)-width,Math.max(p.y,q.y)+width);}
  };
  const L=c.length/2,Y=c.deckY;
  box('jiuzhou-main-deck','#a5b3b1',0,Y-c.deckDepth/2,0,c.length,c.deckDepth,c.deckWidth);
  box('jiuzhou-asphalt','#435255',0,Y+.05,0,c.length-.2,.1,32.6,false);
  // Central stays differ from Qingzhou's wide spatial cable planes.
  for(const side of [-1,1]){
    box(`median-${side}`,'#bbc2b6',0,Y+.65,side*2.1,c.length,1.3,.45);
    box(`barrier-${side}`,'#b7c2ba',0,Y+.55,side*17.2,c.length,1.1,.5);
    beam(`rail-${side}`,'#c4d0ca',[-L,Y+1.5,side*17.6],[L,Y+1.5,side*17.6],.11,true);
    for(let x=-340;x<=340;x+=5)box(`post-${side}-${x}`,'#c4d0ca',x,Y+.75,side*17.6,.13,1.5,.13,false);
    for(const lane of [6,9.7,13.4])for(let x=-340;x<340;x+=12)box(`road-mark-${side}-${lane}-${x}`,'#dfdfc5',x,Y+.12,side*lane,6,.025,.14,false);
    for(let x=-325;x<=325;x+=50){beam(`lamp-${side}-${x}`,'#8b9c9f',[x,Y,side*16],[x,Y+8,side*16],.15,true);box(`lamp-cap-${side}-${x}`,'#d4ddd3',x,Y+8,side*15.5,.4,.18,1.4,false);}
  }
  for(const x of [-L,-261.5,261.5,L]){
    box(`approach-foundation-${x}`,'#9ea89b',x,1,0,12,4,24);
    beam(`approach-column-${x}`,'#b8c2bb',[x,3,0],[x,Y-4,0],4.6);
    beam(`approach-fork-a-${x}`,'#c2c9bf',[x,Y-13,0],[x,Y-4,-12],2.2);
    beam(`approach-fork-b-${x}`,'#c2c9bf',[x,Y-13,0],[x,Y-4,12],2.2);
    box(`approach-cap-${x}`,'#bdc6be',x,Y-4,0,6,2,29);
  }
  for(const x of [-134,134]){
    const out=Math.sign(x);
    box(`sail-foundation-${x}`,'#a5ac9c',x,1,0,22,5,23);
    beam(`sail-spine-${x}`,'#cbd3cb',[x,3,0],[x,120,0],4.4);
    // Longitudinal curved frame and open eye beneath the deck, traced from the referenced photograph.
    const curve=new T.CubicBezierCurve3(new T.Vector3(x,4,0),new T.Vector3(x+out*29,40,0),new T.Vector3(x+out*22,88,0),new T.Vector3(x,119,0));
    const points=curve.getPoints(32);
    for(let i=0;i<32;i++)beam(`sail-rib-${x}-${i}`,'#c3cfc8',points[i].toArray() as Point3,points[i+1].toArray() as Point3,2.8);
    // Harp-like central double stays; exact anchorage schedule awaits as-built drawings.
    for(const side of [-1,1])for(const dir of [-1,1])for(let i=0;i<12;i++){
      const distance=22+i*9.6,height=59+i*4.65;
      beam(`jiuzhou-stay-${x}-${side}-${dir}-${i}`,'#93a8aa',[x,height,side*1.45],[x+dir*distance,Y+.8,side*1.45],.15,true);
      box(`anchor-${x}-${side}-${dir}-${i}`,'#819593',x+dir*distance,Y+.55,side*1.45,1.1,1.1,.55,false);
    }
  }
  return {parts,obstacles};
}
export function defineJiuzhou(seed=5102):EnvironmentDefinition{
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('seed 无效');
  const {obstacles}=layout();const spawnPoints:EnvironmentDefinition['spatial']['spawnPoints']=[];
  for(const kind of ['quadrotor','usv'] as const)for(let i=0;i<12;i++)spawnPoints.push({id:`${kind}-${i}`,kind,position:[-50+i%6*16,kind==='usv'?0:10,135+Math.floor(i/6)*18],yaw:0});
  return {variant:'jiuzhou',seed,spatial:{units:'metres',waterLevel:0,bounds:{minX:-600,maxX:600,minZ:-500,maxZ:500},water:[{outer:[[-600,-500],[600,-500],[600,500],[-600,500]],holes:[]}],obstacles,flight:{minY:0,maxY:160},spawnPoints}};
}
export function createJiuzhou(seed=5102):EnvironmentHandle{
  const definition=defineJiuzhou(seed),data=layout(),root=new T.Group(),structures=new T.Group();
  root.name='environment-jiuzhou';root.userData.seed=seed;root.userData.georeference=c.origin;root.add(structures);structures.rotation.y=c.rotation;
  const builder=industrialBuilder(structures,[]);
  for(const p of data.parts){if(p.b)builder.beam(p.color,p.a,p.b,p.size[0],p.round);else builder.box(p.color,...p.a,...p.size);}builder.flush();
  const water=createMarineWater();root.add(water.root);let disposed=false;
  return {root,spatial:definition.spatial,presentation:{background:'#becbd0',fog:[1600,10000],sunPosition:[-500,700,300],cameraPosition:c.cameras.establishing.position,target:c.cameras.establishing.target,backgroundAsset:marineConfig.sky.url,cameraFar:60000},setVessels:water.setVessels,setSun:water.setSun,setSky:water.setSky,invalidateReflection:water.invalidateReflection,
    setHorizon(color){(water.root.material as T.ShaderMaterial).uniforms.horizonColor.value.copy(color);},
    update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('时间差无效');if(!disposed)water.update(dt);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();water.root.removeFromParent();water.dispose();const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();structures.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));if(o instanceof T.InstancedMesh)o.dispose();}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
  };
}
