import * as T from 'three';
import type { EnvironmentDefinition, EnvironmentHandle, Obstacle, Point2, Point3 } from '../types';
import { industrialBuilder } from '../marine/geometry';
import { createMarineWater } from '../marine/water';
import { marineConfig } from '../marine/config';
import { qingzhouConfig as c } from './config';

type Box = { id:string; color:string; x:number;y:number;z:number;w:number;h:number;d:number };
type Beam = { id:string;color:string;a:Point3;b:Point3;width:number;round:boolean };
const rotate = ([x,z]:Point2):Point2 => [x*Math.cos(c.rotation)+z*Math.sin(c.rotation),-x*Math.sin(c.rotation)+z*Math.cos(c.rotation)];
/** One source definition supplies rendering and bounded-height obstacles. */
function layout() {
  const boxes:Box[]=[],beams:Beam[]=[],obstacles:Obstacle[]=[];
  const obstacle=(id:string,x:number,z:number,w:number,d:number,lo:number,hi:number)=>obstacles.push({id,name:id,kind:'bridge',color:'#c2c8c5',holes:[],outer:([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]] as Point2[]).map(rotate),minY:lo,maxY:hi});
  const box=(id:string,color:string,x:number,y:number,z:number,w:number,h:number,d:number,collision=true)=>{boxes.push({id,color,x,y,z,w,h,d});if(collision)obstacle(id,x,z,w,d,y-h/2,y+h/2);};
  const beam=(id:string,color:string,a:Point3,b:Point3,width:number,round=false)=>{
    beams.push({id,color,a,b,width,round});
    // Short prisms preserve clearance under inclined stays instead of filling a huge solid box.
    const n=Math.ceil(new T.Vector3(...a).distanceTo(new T.Vector3(...b))/18);
    for(let i=0;i<n;i++){const p=new T.Vector3(...a).lerp(new T.Vector3(...b),i/n),q=new T.Vector3(...a).lerp(new T.Vector3(...b),(i+1)/n);obstacle(`${id}-${i}`,(p.x+q.x)/2,(p.z+q.z)/2,Math.abs(p.x-q.x)+width*2,Math.abs(p.z-q.z)+width*2,Math.min(p.y,q.y)-width,Math.max(p.y,q.y)+width);}
  };
  box('main-deck','#aab4b2',0,c.deckY-c.deckDepth/2,0,1150,c.deckDepth,c.deckWidth);
  box('asphalt','#414b4e',0,c.deckY+.06,0,1149,.12,34,false);
  box('median','#bfc4b8',0,c.deckY+.7,0,1150,1.4,.65);
  for(const side of [-1,1]) {
    box(`barrier-${side}`,'#b5c1bd',0,c.deckY+.65,side*19.1,1150,1.3,.55);
    beam(`rail-${side}`,'#c7d0cc',[-575,c.deckY+1.8,side*20.2],[575,c.deckY+1.8,side*20.2],.12,true);
    for(let x=-570;x<575;x+=5)box(`rail-post-${side}-${x}`,'#c7d0cc',x,c.deckY+.9,side*20.2,.12,1.8,.12,false);
    for(const lane of [5,9,13])for(let x=-570;x<570;x+=12)box(`mark-${side}-${lane}-${x}`,'#dddcc2',x,c.deckY+.13,side*lane,6,.02,.15,false);
    for(let x=-550;x<=550;x+=50){beam(`lamp-${side}-${x}`,'#81939a',[x,c.deckY,side*18],[x,c.deckY+10,side*18],.16,true);box(`lamp-head-${side}-${x}`,'#d5dfd5',x,c.deckY+10,side*17.3,.4,.18,1.7,false);}
  }
  for(const x of [-575,-465,465,575]) {
    box(`pier-cap-${x}`,'#a4aaa1',x,2,0,16,6,35);
    for(const z of [-11,11])box(`pier-${x}-${z}`,'#b6c0ba',x,24,z,6,38,7);
    box(`pier-head-${x}`,'#bdc5be',x,42,0,9,3,38);
  }
  for(const x of [-229,229]) {
    box(`tower-base-${x}`,'#969f94',x,2,0,34,11.6,62);
    for(const side of [-1,1]) {
      beam(`tower-lower-${x}-${side}`,'#c9ccc3',[x,7.8,side*23],[x,55,side*18],5.8);
      beam(`tower-upper-${x}-${side}`,'#d1d2c9',[x,55,side*18],[x,170.8,side*10],4.6);
      // Chinese-knot bracing: a crossed, interlaced pair of rounded ribbons; section details are provisional.
      for(const flip of [-1,1]) {
        const pts:Point3[]=[[x+flip*1.8,126,side*15],[x+flip*1.8,139,-side*7],[x+flip*1.8,152,side*10],[x+flip*1.8,160,-side*10]];
        for(let j=0;j<pts.length-1;j++)beam(`knot-${x}-${side}-${flip}-${j}`,'#d1d2c9',pts[j],pts[j+1],2.1);
      }
      for(const dir of [-1,1])for(let i=0;i<14;i++) {
        const end=x+dir*(35+i*14.3), top=116+i*3.6;
        beam(`stay-${x}-${side}-${dir}-${i}`,'#a7b5b4',[x,top,side*(18-(top-55)/115.8*8)],[end,c.deckY+.8,side*18.8],.17,true);
        box(`anchor-${x}-${side}-${dir}-${i}`,'#849492',end,c.deckY+.7,side*18.8,1.2,1.4,.7,false);
      }
    }
    beam(`tower-cross-${x}`,'#c9ccc3',[x,54,-18],[x,54,18],4.6);
  }
  return {boxes,beams,obstacles};
}
export function defineQingzhou(seed=5101):EnvironmentDefinition {
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('seed 无效');
  const {obstacles}=layout();
  const spawnPoints:EnvironmentDefinition['spatial']['spawnPoints']=[];
  for(const kind of ['quadrotor','usv'] as const)for(let i=0;i<12;i++)spawnPoints.push({id:`${kind}-${i}`,kind,position:[-80+(i%6)*16,kind==='usv'?0:10,100+Math.floor(i/6)*20],yaw:0});
  return {variant:'qingzhou',seed,spatial:{units:'metres',waterLevel:0,bounds:{minX:-850,maxX:850,minZ:-600,maxZ:600},water:[{outer:[[-850,-600],[850,-600],[850,600],[-850,600]],holes:[]}],obstacles,flight:{minY:0,maxY:200},spawnPoints}};
}
export function createQingzhou(seed=5101):EnvironmentHandle {
  const definition=defineQingzhou(seed),root=new T.Group(),structures=new T.Group();root.name='environment-qingzhou';root.userData.seed=seed;root.userData.georeference=c.origin;root.add(structures);
  structures.rotation.y=c.rotation;
  const data=layout(), builder=industrialBuilder(structures,[]);
  for(const b of data.boxes)builder.box(b.color,b.x,b.y,b.z,b.w,b.h,b.d);
  for(const b of data.beams)builder.beam(b.color,b.a,b.b,b.width,b.round);
  builder.flush();
  const water=createMarineWater();root.add(water.root);
  let disposed=false;
  return {root,spatial:definition.spatial,presentation:{background:'#becbd0',fog:[1600,10000],sunPosition:[-500,700,300],cameraPosition:c.cameras.establishing.position,target:c.cameras.establishing.target,backgroundAsset:marineConfig.sky.url,cameraFar:60000},
    setVessels:water.setVessels,setSun:water.setSun,setSky:water.setSky,invalidateReflection:water.invalidateReflection,
    setHorizon(color){(water.root.material as T.ShaderMaterial).uniforms.horizonColor.value.copy(color);},
    update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('时间差无效');if(!disposed)water.update(dt);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();water.root.removeFromParent();water.dispose();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();structures.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));if(o instanceof T.InstancedMesh)o.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  };
}
