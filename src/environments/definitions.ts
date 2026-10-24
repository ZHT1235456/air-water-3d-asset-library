import type { EnvironmentDefinition, EnvironmentVariant, Obstacle, Point2, Polygon } from './types';
import { pointInPolygon, ringInsidePolygon, checkPlacement } from './spatial';
import { enrichEnvironment } from './enrichment';
import { defineNinepin } from './ninepin/scene';
import { defineHornsea } from './hornsea/scene';
import { defineJiuzhou } from './jiuzhou/scene';
import { defineQingzhou } from './qingzhou/scene';
import { defineDeepwater } from './marine/definition';
import { defineUSVSite } from './usv-sites/scene';
import { isUSVSite, usvSiteConfigs } from './usv-sites/config';

export const environmentPresets = {
  westlake: usvSiteConfigs.westlake,
  kallang: usvSiteConfigs.kallang,
  waalhaven: usvSiteConfigs.waalhaven,
  ninepin: { name: '香港果洲群岛', code: 'R-04', width: 5000, depth: 4000, description: '23 个岛屿与岩礁 · 公开岸线与实测地形数据', seed: 5104 },
  hornsea: { name: '北海 Hornsea 2', code: 'R-03', width: 8000, depth: 7000, description: 'G33 周边 12 台真实机位 · 海上风电巡检', seed: 5103 },
  jiuzhou: { name: '九洲航道桥', code: 'R-02', width: 1200, depth: 1000, description: '港珠澳大桥 · 风帆双塔 · 实景校核版', seed: 5102 },
  qingzhou: { name: '青州航道桥', code: 'R-01', width: 1700, depth: 1200, description: '港珠澳大桥 · 实景校核版 · 部分细节待核实', seed: 5101 },
  deepwater: { name: '深水港示范', code: 'E-07', width: 2400, depth: 1800, description: '连续岸桥 · 远洋巨轮 · 海空协同巡检', seed: 4101 },
  lake: { name: '开阔湖面', code: 'E-01', width: 500, depth: 500, description: '环湖缓坡 · 林地岸线 · 开阔水面', seed: 2101 },
  river: { name: '曲折河道', code: 'E-02', width: 600, depth: 400, description: '连续弯道 · 河岸植被 · 狭窄航段', seed: 2102 },
  harbor: { name: '港池码头', code: 'E-03', width: 500, depth: 400, description: '防波堤 · 货运栈桥 · 仓储设施', seed: 2103 },
  islands: { name: '岛礁水域', code: 'E-04', width: 800, depth: 600, description: '岛间水道 · 岩礁障碍 · 外围水域', seed: 2104 },
  bridge: { name: '跨河桥区', code: 'E-05', width: 600, depth: 400, description: '桥下净空 · 独立桥墩 · 两岸引桥', seed: 2105 },
  waterfront: { name: '城市滨水', code: 'E-06', width: 600, depth: 500, description: '滨水街区 · 阶梯岸线 · 停靠平台', seed: 2106 },
} as const;
export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const rectangle = (x: number, z: number, w: number, d: number): Point2[] => [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
const ellipse = (x: number, z: number, rx: number, rz: number, n = 40): Point2[] => Array.from({ length: n }, (_, i) => { const a = i * Math.PI * 2 / n; const k = 1 + 0.055 * Math.sin(a * 5); return [x + Math.cos(a) * rx * k, z + Math.sin(a) * rz * k]; });

export function defineEnvironment(variant: EnvironmentVariant, seed: number = environmentPresets[variant]?.seed): EnvironmentDefinition {
  if (!Object.hasOwn(environmentPresets, variant)) throw new RangeError('未知环境类型');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed 须为 0 至 4294967295 的整数');
  if (isUSVSite(variant)) return defineUSVSite(variant, seed);
  if (variant === 'ninepin') return defineNinepin(seed);
  if (variant === 'hornsea') return defineHornsea(seed);
  if (variant === 'jiuzhou') return defineJiuzhou(seed);
  if (variant === 'qingzhou') return defineQingzhou(seed);
  if (variant === 'deepwater') return defineDeepwater(seed);
  const preset = environmentPresets[variant], W = preset.width, D = preset.depth, random = randomGenerator(seed);
  const boundary = rectangle(0, 0, W, D);
  const obstacles: Obstacle[] = [], water: Polygon[] = [];
  const add = (id: string, name: string, outer: Point2[], minY: number, maxY: number, kind: Obstacle['kind'], color: string, holes: Point2[][] = []) => obstacles.push({ id, name, outer, holes, minY, maxY, kind, color });
  const block = (id: string, name: string, x: number, z: number, w: number, d: number, lo: number, hi: number, kind: Obstacle['kind'] = 'facility', color = '#bdc6c1') => add(id, name, rectangle(x, z, w, d), lo, hi, kind, color);
  const land = (outer: Point2[], holes: Point2[][] = [], id = 'shore', height = 3) => add(id, '岸线地形', outer, -10, height, 'land', '#91a58a', holes);
  if (variant === 'lake') {
    const shore = ellipse(0, 0, 191, 176);
    water.push({ outer: shore, holes: [] }); land(boundary, [ellipse(0, 0, 205, 190)]);
    // A shoreline shelf creates a visible sloping/beach transition without changing water topology.
    add('beach', '湖岸缓坡', ellipse(0, 0, 205, 190), -10, 2, 'land', '#c9c1a6', [shore]);
    block('lake-pier', '湖边码头', 0, 166, 10, 42, -3, 2, 'pier', '#b7a389');
    block('lake-station', '观测站', 35, 205, 18, 15, 3, 11, 'building', '#e4ded0');
  } else if (variant === 'river' || variant === 'bridge') {
    const north: Point2[] = [], south: Point2[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = -W / 2 + W * i / 40, center = variant === 'bridge' ? 0 : Math.sin(x / 88) * 46;
      const halfWidth = variant === 'bridge' ? 65 : 40 + 12 * Math.cos(x / 55);
      north.push([x, center - halfWidth]); south.push([x, center + halfWidth]);
    }
    water.push({ outer: [...north, ...south.slice().reverse()], holes: [] });
    land([[-W / 2, -D / 2], [W / 2, -D / 2], ...north.slice().reverse()], [], 'north-bank');
    land([...south, [W / 2, D / 2], [-W / 2, D / 2]], [], 'south-bank');
    if (variant === 'river') {
      block('river-pier', '河岸浮台', -140, -27, 24, 8, -2, 1.2, 'pier', '#b7a389');
      block('river-station', '监测房', 190, 140, 16, 12, 3, 10, 'building');
    } else {
      block('bridge-deck', '桥面', 0, 0, 20, 146, 16, 19, 'bridge', '#d7dad5');
      for (const z of [-43, 43]) block(`bridge-pier-${z}`, '桥墩', 0, z, 7, 10, -7, 16, 'pier', '#a7b4b3');
      for (const sign of [-1, 1]) {
        block(`approach-${sign}`, '引桥', 0, sign * 116, 20, 86, 3, 19, 'bridge', '#b2b7b0');
        block(`bridge-rail-${sign}`, '桥侧护栏', sign * 9, 0, 0.5, 220, 19, 20.2, 'bridge', '#8e9c9e');
      }
    }
  } else if (variant === 'harbor') {
    const area = rectangle(0, -35, 410, 310);
    water.push({ outer: area, holes: [] }); land(boundary, [area]);
    for (const x of [-135, 0, 135]) block(`jetty-${x}`, '货运栈桥', x, 67, 15, 106, -6, 3, 'pier', '#b7bdb7');
    block('breakwater-west', '西防波堤', -115, -136, 170, 12, -8, 4, 'pier', '#8d9c98');
    block('breakwater-east', '东防波堤', 144, -136, 112, 12, -8, 4, 'pier', '#8d9c98');
    for (const x of [-155, -60, 65, 155]) {
      block(`warehouse-${x}`, '仓库', x, 157, 52, 30, 3, 18, 'building', '#d3d1c5');
      for (let i = 0; i < 3; i++) block(`container-${x}-${i}`, '集装箱', x + i * 12 - 12, 131, 10, 6, 3, 8, 'facility', ['#4f7b86', '#c78b67', '#a4ad95'][i]);
    }
  } else if (variant === 'islands') {
    const islands: Point2[][] = [];
    for (const [i, x, z, rx, rz] of [[0, -165, -65, 72, 55], [1, 95, 85, 92, 60], [2, 220, -150, 46, 48], [3, -220, 175, 48, 33]]) {
      const ring = ellipse(x, z, rx, rz); islands.push(ring); land(ring, [], `island-${i}`, 5 + i * 2);
    }
    for (let i = 0; i < 9; i++) {
      const x = -90 + i * 19, z = -125 - random() * 25, ring = ellipse(x, z, 4 + random() * 4, 4 + random() * 3, 9);
      islands.push(ring); add(`reef-${i}`, '露出水面的礁石', ring, -7, 1.5 + random() * 4, 'rock', '#9caa9f');
    }
    water.push({ outer: boundary, holes: islands });
  } else {
    const shore: Point2[] = [[-300, -250], [-90, -250], [-80, -120], [-110, 10], [-70, 140], [-80, 250], [-300, 250]];
    land(shore);
    const waterArea: Point2[] = [[-90, -250], [300, -250], [300, 250], [-80, 250], [-70, 140], [-110, 10], [-80, -120]];
    water.push({ outer: waterArea, holes: [] });
    for (let i = 0; i < 5; i++) {
      const z = -200 + i * 95;
      block(`promenade-${i}`, '滨水步道', -122, z, 18, 86, 2.5, 3.2, 'facility', '#d2cbb7');
      for (let j = 0; j < 2; j++) block(`city-${i}-${j}`, '滨水建筑', -170 - j * 75, z, 38, 44, 3, 17 + random() * 42, 'building', j ? '#b9c5c7' : '#d9d9ce');
    }
    for (let i = 0; i < 4; i++) block(`steps-${i}`, '岸边阶梯', -100 + i * 3, 60, 3, 28, -2, 3 - i * 0.7, 'pier', '#c6c4b6');
    block('city-pier', '停靠平台', -60, -65, 80, 9, -5, 2, 'pier', '#b29e83');
  }
  enrichEnvironment(variant, obstacles, random);
  // Relief masses are conservative obstacles generated only on existing dry land.
  if (['lake','river','islands'].includes(variant)) {
    const lands=obstacles.filter(o=>o.kind==='land' && o.id!=='beach');
    for(let attempt=0,count=0;attempt<1200 && count<24;attempt++) {
      const x=(random()-.5)*(W-24), z=(random()-.5)*(D-24), radius=12+random()*20;
      const footprint=ellipse(x,z,radius,radius*.75,20);
      const ground=lands.find(o=>ringInsidePolygon(footprint,o));
      if(!ground || obstacles.some(o=>o.kind!=='land' && pointInPolygon([x,z],o)))continue;
      add(`hill-${count++}`,'地形丘陵',footprint,ground.maxY-.2,ground.maxY+12+random()*30,'rock','#728571');
    }
  }
  // Trees share an instanced visual mesh; every tree still has a conservative spatial prism.
  const terrain = obstacles.filter(o => o.kind === 'land');
  for (let i = 0, accepted = 0; i < 1800 && accepted < (variant === 'harbor' ? 16 : variant === 'waterfront' ? 65 : 260); i++) {
    const x = (random() - 0.5) * (W - 16), z = (random() - 0.5) * (D - 16);
    const ground = terrain.find(p => pointInPolygon([x, z], p));
    if (!ground || water.some(p => pointInPolygon([x, z], p)) || obstacles.some(o => o.kind !== 'land' && pointInPolygon([x, z], o))) continue;
    const radius = 2.8 + random() * 2.2, top = ground.maxY + 7 + random() * 6;
    add(`tree-${accepted++}`, '树木', rectangle(x, z, radius * 2, radius * 2), ground.maxY, top, 'tree', '#526f57');
  }
  const spatial: EnvironmentDefinition['spatial'] = { units: 'metres', waterLevel: 0, bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, water, obstacles, flight: { minY: 0, maxY: 120 }, spawnPoints: [] };
  // Fixed scan order produces safe starts even when seeded props change.
  for (const kind of ['quadrotor', 'usv'] as const) {
    for (let z = 0, row = 0; row < 40 && spatial.spawnPoints.filter(s => s.kind === kind).length < 12; row++, z = (row % 2 ? 1 : -1) * Math.ceil(row / 2) * 12) {
      for (let column = 0; column < 40; column++) {
        const x = column === 0 ? 0 : (column % 2 ? 1 : -1) * Math.ceil(column / 2) * 12;
        if (!water.some(p => pointInPolygon([x, z], p))) continue;
        const position: [number, number, number] = [x, kind === 'usv' ? 0 : 10, z];
        if (checkPlacement(spatial, { id: '', kind, position, yaw: 0, bounds: { min: [-2, -1, -3], max: [2, 3, 3] } }).length) continue;
        spatial.spawnPoints.push({ id: `${kind}-${spatial.spawnPoints.filter(s => s.kind === kind).length}`, kind, position, yaw: 0 });
        if (spatial.spawnPoints.filter(s => s.kind === kind).length >= 12) break;
      }
    }
  }
  return { variant, seed, spatial };
}
