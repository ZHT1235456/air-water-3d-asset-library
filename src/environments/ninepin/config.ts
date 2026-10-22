import type { Point3 } from '../types';
import { ninepinSurvey } from './survey';
export const ninepinConfig = {
  origin:ninepinSurvey.origin,width:5000,depth:4000,
  cameras:{
    establishing:{label:'果洲群岛全景',position:[1800,800,2200] as Point3,target:[0,25,0] as Point3,fov:46},
    waterline:{label:'岛间水道',position:[40,4,65] as Point3,target:[-650,30,-350] as Point3,fov:48},
    aerial:{label:'群岛地形鸟瞰',position:[500,2300,1700] as Point3,target:[0,0,0] as Point3,fov:48},
    context:{label:'设备与海岛',position:[4,2.4,7] as Point3,target:[0,1,-1] as Point3,fov:48},
  },
};
