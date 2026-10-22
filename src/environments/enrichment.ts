import type { EnvironmentVariant, Obstacle, Point2 } from './types';
/** Additional engineering structures share the same definition used for collision and rendering. */
export function enrichEnvironment(variant: EnvironmentVariant, obstacles: Obstacle[], random: () => number) {
  const box = (id: string, x: number, z: number, w: number, d: number, lo: number, hi: number, kind: Obstacle['kind'] = 'facility', color = '#8b9690') => {
    const outer: Point2[] = [[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
    obstacles.push({id: `detail-${id}`, name: id, outer, holes: [], minY:lo,maxY:hi,kind,color});
  };
  if (variant === 'lake') {
    for (let i=0;i<7;i++) box(`湖岸服务建筑-${i}`, -100+i*27, 219, 18, 17, 3, 9+random()*5, 'building','#b9b6a2');
    for(let i=0;i<4;i++) box(`观测栈桥-${i}`, 10+i*9, 156, 2, 22, -2, 1.5,'pier','#9b937c');
    box('湖岸道路',0,238,380,7,3,3.15,'facility','#727c76');
  }
  if (variant === 'river' || variant === 'bridge') {
    for(const side of [-1,1]) {
      box(`沿岸道路-${side}`,0,side*171,590,8,3,3.15,'facility','#717c77');
      for(let i=0;i<9;i++) box(`沿岸聚落-${side}-${i}`,-264+i*63,side*(126+random()*12),24+random()*10,22,3,11+random()*15,'building',i%2?'#a8b3ad':'#c5c0aa');
      for(let i=0;i<12;i++) box(`岸边石笼-${side}-${i}`,-275+i*48,side*78,13,5,0,4,'rock','#88938a');
    }
  }
  if (variant === 'harbor') {
    for(const x of [-135,0,135]) {
      for(const dx of [-5,5]) box(`装卸门架柱-${x}-${dx}`,x+dx,97,1,3,3,24,'facility','#bbc8c5');
      box(`装卸横梁-${x}`,x,97,14,3,23,25,'facility','#ce965e');
      box(`装卸吊臂-${x}`,x,83,2,38,24,26,'facility','#d3d7ca');
    }
    for(let i=0;i<12;i++) box(`堆场箱组-${i}`,-180+i*32,184,24,7,3,8+(i%3)*2.6,'building',['#7b8f8d','#ad785b','#697f8b'][i%3]);
    for(const x of [-212,212]) for(let i=0;i<6;i++) box(`港区储罐房-${x}-${i}`,x,-90+i*39,20,23,3,12+random()*7,'building','#b9c0b6');
  }
  if (variant === 'islands') {
    box('灯塔基座',220,-150,10,10,11,16,'building','#c6b99c');
    box('灯塔塔身',220,-150,4,4,16,35,'facility','#d5d5bd');
    box('灯塔灯室',220,-150,6,6,35,38,'facility','#557a80');
    box('海岛观测站',-165,-65,20,13,5,14,'building','#c2bba4');
    box('岛岸栈桥',-165,-9,6,28,-3,2,'pier','#aaa18b');
  }
  if (variant === 'bridge') {
    for(const side of [-1,1]) {
      box(`主桥桥塔-${side}`,side*8,43,2.4,6,19,58,'facility','#c1c8bf');
      box(`桥塔横撑-${side}`,0,43,18,2,48,50,'facility','#c1c8bf');
      for(let i=0;i<14;i++) box(`桥侧立柱-${side}-${i}`,side*9,-104+i*16,.35,.35,19,20.2,'facility','#899a99');
    }
  }
  if (variant === 'waterfront') {
    box('城市主干道',-208,0,14,490,3,3.2,'facility','#697777');
    for(let i=0;i<5;i++) {
      box(`街区横路-${i}`,-207,-244+i*95,175,6,3,3.2,'facility','#7c8580');
      for(let j=0;j<3;j++) box(`滨水商业-${i}-${j}`,-141-j*18,-221+i*95,12,16,3,8+random()*4,'building','#c4bcaa');
      box(`步道花池-${i}`,-120,-211+i*95,10,5,3.2,3.9,'facility','#789078');
    }
  }
}
