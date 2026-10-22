import type { Point3 } from '../types';
/** Published design dimensions; remaining detail assumptions are listed in docs/qingzhou.md. */
export const qingzhouConfig = {
  origin: { latitude: 22.283037, longitude: 113.7316087, datum: 'WGS84' },
  rotation: Math.atan2((22.2830457-22.2830283)*111320, (113.7338591-113.7293583)*111320*Math.cos(22.283037*Math.PI/180)),
  spans: [110,236,458,236,110], length:1150, towerHeight:163, towerBase:7.8,
  deckWidth:41.8, deckY:47.5, deckDepth:4.5,
  cameras: {
    establishing:{label:'主桥全景',position:[720,240,850] as Point3,target:[0,60,0] as Point3,fov:44},
    waterline:{label:'桥下水面',position:[12,3,22] as Point3,target:[-45,36,-100] as Point3,fov:48},
    aerial:{label:'桥塔巡检',position:[-100,115,220] as Point3,target:[-229,105,0] as Point3,fov:44},
    context:{label:'设备与大桥',position:[4,2.4,6] as Point3,target:[0,1,-1] as Point3,fov:48},
  },
};
