import type { Point2, Point3 } from '../types';
import type { SiteRoute, USVSiteVariant } from './types';
import { survey as westlake } from './data/westlake';
import { survey as kallang } from './data/kallang';
import { survey as waalhaven } from './data/waalhaven';

export const siteSurveys = { westlake, kallang, waalhaven };
export const isUSVSite = (variant: string): variant is USVSiteVariant => Object.hasOwn(siteSurveys, variant);
const camera = (label: string, position: Point3, target: Point3, fov = 48) => ({ label, position, target, fov });
export const usvSiteConfigs = {
  westlake: {
    name: '杭州西湖 · 三岛水域', code: 'R-05', width: westlake.width, depth: westlake.depth, seed: 5105,
    description: '真实岛岸与苏堤 · 12 艇编队 · 分流绕岛与协同巡测',
    spawn: [-60, 150] as Point2, yaw: Math.PI,
    waterColor: '#325e50', groundColor: '#a2a58b', buildingColors: ['#d7d3c3', '#c8c3b4', '#e1dac8'],
    cameras: {
      establishing: camera('西湖三岛全景', [1550, 1200, 1750], [-100, 0, -150]),
      aerial: camera('岛岸与通道', [0, 2300, 500], [-100, 0, -150]),
      waterline: camera('贴水看岛岸', [0, 3.5, 25], [-500, 8, -250]),
      context: camera('12 艇编队', [65, 48, 75], [21, 0, 14]),
    },
    routes: [
      { id: 'island-east', name: '东侧巡测', points: [[-60,150],[150,50],[170,-400],[-200,-650]], corridorRadius: 12 },
      { id: 'island-west', name: '西侧绕岛', points: [[-60,150],[-250,300],[-650,200],[-850,-200],[-850,-600],[-500,-700]], corridorRadius: 12 },
    ] as SiteRoute[],
  },
  kallang: {
    name: '新加坡 · 加冷盆地', code: 'R-06', width: kallang.width, depth: kallang.depth, seed: 5106,
    description: '真实城市河湾 · 12 艇编队 · 河口汇合与分区覆盖',
    spawn: [-80, 370] as Point2, yaw: Math.PI,
    waterColor: '#235b60', groundColor: '#a4ada0', buildingColors: ['#d5d8d3', '#c0c9cb', '#e0ddd3'],
    cameras: {
      establishing: camera('河湾与支流', [1250, 1120, 1500], [0, 0, 80]),
      aerial: camera('合流区鸟瞰', [0, 2000, 600], [0, 0, 50]),
      waterline: camera('盆地水面', [0, 3.5, 25], [300, 15, -100]),
      context: camera('12 艇编队', [65, 48, 75], [21, 0, 14]),
    },
    routes: [
      { id: 'basin-west', name: '西侧水域覆盖', points: [[-80,370],[-180,450],[-300,580],[-380,790]], corridorRadius: 12 },
      { id: 'basin-east', name: '东侧水域覆盖', points: [[-80,370],[180,300],[340,420]], corridorRadius: 12 },
      { id: 'river-merge', name: '桥北支流汇合', points: [[120,-460],[105,-360],[30,-230],[-65,-155]], corridorRadius: 8 },
    ] as SiteRoute[],
  },
  waalhaven: {
    name: '鹿特丹 · 瓦尔港', code: 'R-07', width: waalhaven.width, depth: waalhaven.depth, seed: 5107,
    description: '真实港池与突堤 · 12 艇编队 · 支港分流与沿岸巡检',
    spawn: [50, -250] as Point2, yaw: Math.PI,
    waterColor: '#36585d', groundColor: '#9da4a1', buildingColors: ['#bdc5c7', '#c9cdca', '#8e9fa5'],
    cameras: {
      establishing: camera('瓦尔港全景', [1550, 1450, 1900], [0, 0, -500]),
      aerial: camera('港池与突堤', [0, 2700, 550], [0, 0, -450]),
      waterline: camera('突堤水面', [0, 3.5, 25], [650, 12, -200]),
      context: camera('12 艇编队', [65, 48, 75], [21, 0, 14]),
    },
    routes: [
      { id: 'harbor-north', name: '主港池纵向编队', points: [[50,-250],[100,-600],[0,-900],[100,-1200]], corridorRadius: 15 },
      { id: 'harbor-east', name: '东侧支港巡检', points: [[50,-250],[300,-250],[650,-180],[850,-200]], corridorRadius: 15 },
      { id: 'harbor-south', name: '南侧岸线巡检', points: [[50,-250],[0,0],[100,200],[350,200]], corridorRadius: 15 },
    ] as SiteRoute[],
  },
};
