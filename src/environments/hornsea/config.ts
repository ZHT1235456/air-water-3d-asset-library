import type { Point3 } from '../types';
import { hornseaSurvey } from './survey';

/** Published rotor diameter; hub height and small fittings are provisional, see sources.json. */
export const hornseaConfig = {
  origin: { ...hornseaSurvey.origin, datum: 'WGS84', axes: '+X east, -Z north' },
  rotorDiameter: 167, hubHeight: 116.5, rotorOffset: 6,
  width: 8000, depth: 7000,
  cameras: {
    establishing: { label: '北海风场', position: [240,140,430] as Point3, target: [0,90,0] as Point3, fov: 46 },
    waterline: { label: '单桩水面巡检', position: [0,4,30] as Point3, target: [-50,72,-240] as Point3, fov: 48 },
    aerial: { label: '真实机位鸟瞰', position: [2100,1450,3000] as Point3, target: [0,50,0] as Point3, fov: 48 },
    context: { label: '设备与风场', position: [4,2.4,7] as Point3, target: [0,1,-1] as Point3, fov: 48 },
  },
};
