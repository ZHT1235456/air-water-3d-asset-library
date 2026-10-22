import type { Point3 } from '../types';

/** Original, engineering-inspired demonstration; not a survey of Yangshan. */
export const marineConfig = {
  id: 'deepwater',
  name: '深水港 · 海空协同',
  width: 2400,
  depth: 1800,
  seed: 4101,
  sky: {
    url: '/assets/environment/kloppenheim_06_puresky_2k.hdr',
    source: 'https://polyhaven.com/a/kloppenheim_06_puresky',
    license: 'CC0-1.0',
    rotation: 0,
    exposure: 0.85,
  },
  fog: { color: '#c1cbcd', near: 1400, far: 11000 },
  cameras: {
    establishing: { label: '港区航拍', position: [1400, 440, 1500] as Point3, target: [-100, 30, -350] as Point3, fov: 44 },
    waterline: { label: '贴水视角', position: [16, 3.4, 24] as Point3, target: [0, 1.2, -3] as Point3, fov: 42 },
    aerial: { label: '空中作业', position: [2, 11.1, 3.5] as Point3, target: [0, 10.2, 0] as Point3, fov: 40 },
    context: { label: '设备与港口', position: [3.6, 2.2, 5.5] as Point3, target: [0, 1.0, -1] as Point3, fov: 48 },
  },
};

