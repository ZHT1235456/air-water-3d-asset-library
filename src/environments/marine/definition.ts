import type { EnvironmentDefinition, Obstacle } from '../types';
import { rect } from './geometry';
import { marineConfig } from './config';

export const quay = { x: 0, z: -570, width: 2160, depth: 660, height: 6 };
export const cranes = Array.from({ length: 14 }, (_, i) => ({ id: `sts-${i}`, x: -910 + i * 140, z: -280 }));
export const ships = [{ id: 'ocean-carrier', x: -460, z: -200, length: 366, width: 49 }, { id: 'pacific-carrier', x: 360, z: -200, length: 302, width: 43 }];
export const stacks = Array.from({ length: 11 }, (_, i) => Array.from({ length: 5 }, (_, j) => ({ id: `yard-${i}-${j}`, x: -950 + i * 180, z: -380 - j * 70, columns: 10, rows: 7 }))).flat();
export const buoyPositions = [[-850, 120], [-450, 100], [0, 120], [450, 100], [850, 120]] as const;
export function defineDeepwater(seed: number): EnvironmentDefinition {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed 须为 uint32');
  const obstacles: Obstacle[] = [];
  const add = (id: string, name: string, x: number, z: number, w: number, d: number, minY: number, maxY: number, kind: Obstacle['kind'] = 'facility', color = '#7d9196') =>
    obstacles.push({ id, name, outer: rect(x, z, w, d), holes: [], minY, maxY, kind, color });
  add('deepwater-quay', '港区岸壁及陆域', quay.x, quay.z, quay.width, quay.depth, -18, 7, 'land');
  for (const c of cranes) {
    for (const dx of [-16, 16]) for (const dz of [-20, 20]) add(`${c.id}-leg-${dx}-${dz}`, '岸桥支腿', c.x + dx, c.z + dz, 5, 6, 6, 58);
    add(`${c.id}-beam`, '岸桥门架及斜撑', c.x, c.z, 36, 48, 6, 61);
    add(`${c.id}-boom`, '岸桥起重臂及塔架', c.x, c.z + 5, 18, 176, 61, 110);
  }
  for (const s of ships) add(s.id, '停泊集装箱船', s.x, s.z, s.length, s.width, -14, 52, 'facility', '#1e343f');
  for (const s of stacks) add(s.id, '集装箱堆场', s.x, s.z, 128, 23, 6, 18, 'facility', '#94745e');
  for (const [i, [x, z]] of buoyPositions.entries()) add(`fairway-buoy-${i}`, '航标浮筒', x, z, 3.2, 3.2, -2, 5.5);
  add('inspection-pontoon', '巡检停靠浮台', -45, -20, 30, 7, -2, 1.2, 'pier');
  add('offshore-breakwater', '防波堤及消浪构件', 1080, 180, 38, 650, -20, 7, 'pier');
  for (let x = -850; x <= 850; x += 340) add(`warehouse-${x}`, '港区仓库', x, -820, 244, 74, 6, 27, 'building', '#b9b9a9');
  const spatial: EnvironmentDefinition['spatial'] = {
    units: 'metres', waterLevel: 0,
    bounds: { minX: -1200, maxX: 1200, minZ: -900, maxZ: 900 },
    water: [{ outer: rect(0, 330, 2400, 1140), holes: [] }],
    obstacles, flight: { minY: 0, maxY: 160 },
    spawnPoints: (['quadrotor', 'usv'] as const).flatMap(kind => Array.from({ length: 12 }, (_, i) => ({
      id: `${kind}-${i}`, kind, position: [i % 2 ? -Math.ceil(i / 2) * 12 : i / 2 * 12, kind === 'usv' ? 0 : 10, 0] as [number, number, number], yaw: 0,
    }))),
  };
  return { variant: 'deepwater', seed, spatial };
}
export const defaultMarineSeed = marineConfig.seed;
