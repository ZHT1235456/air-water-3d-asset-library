import type { Point3 } from '../types';
/** Sources and uncertainty are recorded in public/assets/jiuzhou/sources.json. */
export const jiuzhouConfig = {
  origin:{latitude:22.22046655,longitude:113.5964636,datum:'WGS84'},
  rotation:Math.atan2((22.2211556-22.2197775)*111320,(113.5975318-113.5953954)*111320*Math.cos(22.22046655*Math.PI/180)),
  spans:[85,127.5,268,127.5,85], length:693, towerTop:120,
  deckY:45, deckDepth:3.5, deckWidth:35.6,
  cameras:{
    establishing:{label:'风帆双塔',position:[450,175,640] as Point3,target:[0,48,0] as Point3,fov:44},
    waterline:{label:'航道水面',position:[10,3.4,20] as Point3,target:[0,26,-100] as Point3,fov:48},
    aerial:{label:'风帆塔近景',position:[30,110,280] as Point3,target:[-110,70,76] as Point3,fov:44},
    context:{label:'设备与大桥',position:[4,2.4,6] as Point3,target:[0,1,-1] as Point3,fov:48},
  },
};
