import * as T from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, bolts, cable, cylinder, finish, lens, makeMaterials, mesh, propeller, rod } from './common';
import { createHullGeometry, hullProfile } from './hull';
import { usvPresets } from './presets';
import type { ModelOptions, USVVariant } from './types';

export function createUSV(options: ModelOptions<USVVariant> = {}) {
  const variant = options.variant ?? 'inspection';
  if (!Object.hasOwn(usvPresets, variant)) throw new RangeError('未知无人艇款式');
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale 必须为有限正数');
  const p = usvPresets[variant], { length: l, width: w, depth: d, deck: y } = p;
  const m = makeMaterials({ primary: options.colors?.primary ?? p.primary, secondary: options.colors?.secondary ?? p.secondary, accent: options.colors?.accent ?? p.accent });
  const root = new T.Group(); root.name = `usv-${variant}`;
  const parts: Record<string, T.Object3D> = {};
  const bind = <O extends T.Object3D>(name: string, obj: O) => { obj.name = name; parts[name] = obj; return obj; };
  const hullGeometry = createHullGeometry(l, w, d, y);
  const shadedHull = toCreasedNormals(hullGeometry, Math.PI / 5);
  hullGeometry.dispose();
  bind('hull', mesh(root, shadedHull, [m.primary, m.secondary, m.secondary]));
  // Gunwale follows the actual hull section on both sides and meets at the single tip.
  for (const side of [-1, 1]) {
    const points: T.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, profile = hullProfile(t, w, y);
      points.push(new T.Vector3(side * profile.halfWidth, profile.top - 0.018, (t - 0.5) * l));
    }
    const path = new T.CatmullRomCurve3(points);
    bind(`gunwale-${side < 0 ? 'left' : 'right'}`, mesh(root, new T.TubeGeometry(path, 96, 0.012, 8, false), m.rubber));
    const stripePoints = points.map(v => new T.Vector3(v.x * 0.996, v.y - 0.035, v.z));
    mesh(root, new T.TubeGeometry(new T.CatmullRomCurve3(stripePoints), 96, 0.009, 6, false), m.accent);
  }
  rod(root, [-w * 0.415, y - 0.018, -l / 2], [w * 0.415, y - 0.018, -l / 2], 0.012, m.rubber);
  const survey = variant === 'survey', utility = variant === 'utility';
  const aftEquipment = ['rescue', 'sampling', 'endurance', 'multibeam', 'relay', 'debris', 'patrol'].includes(variant);
  const cabin = bind('equipment-cabin', new T.Group()); root.add(cabin);
  const cw = w * (utility || aftEquipment ? 0.49 : 0.55), cl = l * (aftEquipment ? 0.22 : utility ? 0.25 : 0.36), ch = utility ? 0.32 : survey ? 0.21 : 0.16;
  const cz = aftEquipment ? l * 0.17 : utility ? l * 0.10 : -l * 0.02;
  box(cabin, [cw * 1.06, 0.025, cl * 1.04], [0, y + 0.018, cz], m.rubber, 0.025);
  box(cabin, [cw, ch, cl], [0, y + ch * 0.5 + 0.03, cz], m.primary, 0.055);
  box(cabin, [cw * 0.86, 0.018, cl * 0.84], [0, y + ch + 0.034, cz], m.primary, 0.03);
  box(cabin, [cw * 0.18, 0.004, cl * 0.74], [-cw * 0.25, y + ch + 0.045, cz], m.accent, 0.006);
  bolts(cabin, [-cw * 0.35, cw * 0.35], [cz - cl * 0.32, cz + cl * 0.32], y + ch + 0.047, m.metal, 0.006);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) box(cabin, [0.003, ch * 0.27, 0.012], [side * cw * 0.50, y + ch * 0.56, cz - cl * 0.27 + i * cl * 0.06], m.rubber, 0.002);
    box(cabin, [0.01, 0.024, cl * 0.24], [side * cw * 0.5, y + ch * 0.4, cz + cl * 0.28], m.accent, 0.003);
  }
  // Hatches, hinges and flush deck hardware.
  const hatchZ = -l * (utility ? 0.30 : 0.34);
  const hatch = bind('service-hatch', box(root, [w * 0.46, 0.018, l * 0.16], [0, y + 0.014, hatchZ], m.rubber, 0.018));
  box(hatch, [w * 0.43, 0.012, l * 0.145], [0, 0.012, 0], m.primary, 0.012);
  for (const side of [-1, 1]) {
    box(hatch, [0.04, 0.014, 0.018], [side * w * 0.13, 0.024, -l * 0.065], m.metal, 0.003);
    box(hatch, [0.012, 0.008, 0.04], [side * w * 0.17, 0.023, l * 0.04], m.secondary, 0.003);
  }
  bolts(hatch, [-w * 0.19, w * 0.19], [-l * 0.06, l * 0.06], 0.021, m.metal, 0.004);
  for (const side of [-1, 1]) for (const t of [0.12, 0.67]) {
    const { halfWidth, top } = hullProfile(t, w, y), z = (t - 0.5) * l;
    const x = side * halfWidth * 0.84;
    box(root, [0.055, 0.009, 0.08], [x, top + 0.008, z], m.metal, 0.005);
    for (const dz of [-0.02, 0.02]) rod(root, [x, top, z + dz], [x, top + 0.035, z + dz], 0.007, m.metal);
    rod(root, [x, top + 0.036, z - 0.045], [x, top + 0.036, z + 0.045], 0.008, m.metal);
  }
  const mast = bind('sensor-mast', new T.Group()); root.add(mast);
  const mastZ = cz - cl * 0.20, baseY = y + ch + 0.05, mastH = utility ? 0.48 : survey ? 0.43 : 0.20;
  cylinder(mast, 0.045, 0.015, [0, baseY, mastZ], m.secondary);
  rod(mast, [0, baseY, mastZ], [0, baseY + mastH, mastZ], utility ? 0.017 : 0.012, m.metal);
  rod(mast, [-cw * 0.48, baseY + mastH * 0.70, mastZ], [cw * 0.48, baseY + mastH * 0.70, mastZ], 0.012, m.secondary);
  for (const side of [-1, 1]) {
    cylinder(mast, 0.024, 0.03, [side * cw * 0.45, baseY + mastH * 0.73, mastZ], side < 0 ? m.red : m.green);
    rod(mast, [side * cw * 0.35, baseY + mastH * 0.72, mastZ], [side * cw * 0.35, baseY + mastH * 0.72 + 0.18, mastZ], 0.003, m.rubber);
  }
  const gnss = bind('gnss-antenna', cylinder(mast, 0.042, 0.025, [0, baseY + mastH, mastZ], m.primary, 0.036));
  gnss.userData.role = 'positioning';
  const camera = bind('camera', new T.Group()); root.add(camera);
  camera.position.set(0, baseY + 0.04, cz + cl * 0.28);
  cylinder(camera, 0.025, 0.05, [0, 0, 0], m.secondary);
  box(camera, [0.085, 0.065, 0.08], [0, 0.047, 0.01], m.primary, 0.016);
  lens(camera, [0, 0.047, 0.057], 0.027, m);
  cable(root, [[0.015, baseY, mastZ], [0.028, baseY + 0.06, mastZ + 0.04], [0.028, baseY, mastZ + 0.11]], 0.004, m.rubber);
  if (survey) {
    const probe = bind('water-probe', new T.Group()); root.add(probe);
    rod(probe, [w * 0.25, y + 0.08, 0], [w * 0.58, y + 0.08, 0], 0.018, m.metal);
    rod(probe, [w * 0.56, y + 0.08, 0], [w * 0.56, -d * 1.1, 0], 0.013, m.metal);
    cylinder(probe, 0.032, 0.09, [w * 0.56, -d * 1.05, 0], m.accent);
    cylinder(probe, 0.027, 0.025, [w * 0.56, -d * 1.05 - 0.055, 0], m.secondary);
    box(root, [0.22, 0.12, 0.23], [-w * 0.25, y + 0.07, -l * 0.24], m.primary, 0.018);
    cable(root, [[w * 0.21, y + 0.10, 0.02], [w * 0.5, y + 0.13, 0.02], [w * 0.58, -0.10, 0.02]], 0.005, m.rubber);
  }
  if (utility) {
    const platform = bind('work-platform', box(root, [w * 0.62, 0.035, l * 0.24], [0, y + 0.04, -l * 0.22], m.secondary, 0.018));
    for (let i = 0; i < 12; i++) box(platform, [w * 0.58, 0.003, 0.008], [0, 0.019, -l * 0.10 + i * l * 0.018], m.metal, 0.001);
    const railing = bind('railing', new T.Group()); root.add(railing);
    for (const side of [-1, 1]) {
      const rails: [number, number, number][] = [];
      for (const t of [0.10, 0.29, 0.48, 0.67, 0.78]) {
        const p = hullProfile(t, w, y), x = side * p.halfWidth * 0.92, z = (t - 0.5) * l;
        cylinder(railing, 0.022, 0.012, [x, p.top + 0.008, z], m.metal);
        rod(railing, [x, p.top, z], [x, p.top + 0.20, z], 0.007, m.metal);
        rails.push([x, p.top + 0.20, z]);
      }
      cable(railing, rails, 0.008, m.metal);
      cable(railing, rails.map(([x, y, z]) => [x, y - 0.10, z]), 0.004, m.metal);
      for (const z of [-l * 0.30, 0, l * 0.20]) {
        const t = z / l + 0.5, profile = hullProfile(t, w, y);
        const f = cylinder(root, 0.035, 0.18, [side * (profile.halfWidth + 0.015), y * 0.35, z], m.rubber);
        f.rotation.z = side * 0.12;
      }
    }
    box(root, [w * 0.43, 0.075, l * 0.13], [0, y + 0.06, l * 0.29], m.primary, 0.025);
  }
  if (variant === 'rescue') {
    const lifesaving = bind('lifebuoys', new T.Group()); root.add(lifesaving);
    for (const side of [-1, 1]) {
      const x = side * w * 0.22, z = -l * 0.15;
      const ring = mesh(lifesaving, new T.TorusGeometry(0.13, 0.038, 16, 48), m.accent, [x, y + 0.065, z]); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const band = mesh(ring, new T.TorusGeometry(0.13, 0.039, 12, 8, 0.25), m.primary); band.rotation.z = i * Math.PI / 2;
      }
      rod(lifesaving, [x - 0.10, y + 0.015, z - 0.17], [x - 0.10, y + 0.015, z + 0.17], 0.008, m.metal);
      rod(lifesaving, [x + 0.10, y + 0.015, z - 0.17], [x + 0.10, y + 0.015, z + 0.17], 0.008, m.metal);
    }
    const ramp = bind('recovery-ramp', new T.Group()); root.add(ramp); ramp.position.set(0, y + 0.03, -l * 0.40);
    box(ramp, [w * 0.54, 0.035, l * 0.16], [0, 0, 0], m.secondary, 0.012);
    for (let i = 0; i < 6; i++) rod(ramp, [-w * 0.23, 0.026, -l * 0.06 + i * l * 0.024], [w * 0.23, 0.026, -l * 0.06 + i * l * 0.024], 0.012, m.metal);
    const beacon = bind('rescue-beacon', cylinder(root, 0.025, 0.045, [cw * 0.30, baseY + 0.015, cz], m.accent));
    cylinder(beacon, 0.028, 0.008, [0, -0.025, 0], m.secondary);
  }
  if (variant === 'sampling') {
    const sampler = bind('sample-carousel', new T.Group()); root.add(sampler); sampler.position.set(0, y + 0.04, -l * 0.18);
    cylinder(sampler, 0.24, 0.045, [0, 0, 0], m.secondary);
    cylinder(sampler, 0.055, 0.25, [0, 0.13, 0], m.metal);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, x = Math.cos(angle) * 0.17, z = Math.sin(angle) * 0.17;
      const bottle = bind(`sample-bottle-${i + 1}`, new T.Group()); sampler.add(bottle);
      cylinder(bottle, 0.043, 0.19, [x, 0.12, z], m.primary);
      cylinder(bottle, 0.035, 0.025, [x, 0.227, z], m.accent);
      cylinder(bottle, 0.046, 0.015, [x, 0.05, z], m.metal);
    }
    const davit = bind('sampling-davit', new T.Group()); root.add(davit);
    const dx = w * 0.34, dz = -l * 0.34;
    cylinder(davit, 0.055, 0.025, [dx, y + 0.02, dz], m.secondary);
    rod(davit, [dx, y, dz], [dx, y + 0.52, dz], 0.017, m.metal);
    rod(davit, [dx, y + 0.52, dz], [w * 0.62, y + 0.52, dz], 0.016, m.metal);
    rod(davit, [dx, y + 0.30, dz], [w * 0.56, y + 0.52, dz], 0.009, m.secondary);
    rod(davit, [w * 0.60, y + 0.52, dz], [w * 0.60, -0.12, dz], 0.003, m.rubber);
    const probe = bind('sampling-probe', cylinder(davit, 0.035, 0.12, [w * 0.60, -0.15, dz], m.accent));
    cylinder(probe, 0.03, 0.018, [0, -0.07, 0], m.metal);
  }
  if (variant === 'endurance') {
    const panels = bind('solar-panels', new T.Group()); root.add(panels);
    const cellMaterial = new T.MeshPhysicalMaterial({ color: '#12304c', metalness: 0.5, roughness: 0.25, clearcoat: 0.8 });
    for (const side of [-1, 1]) {
      const panel = bind(`solar-panel-${side < 0 ? 'left' : 'right'}`, new T.Group()); panels.add(panel);
      const x = side * w * 0.205, z = -l * 0.20;
      for (const end of [-1, 1]) rod(panel, [x, y, z + end * l * 0.13], [x, y + 0.09, z + end * l * 0.13], 0.01, m.metal);
      box(panel, [w * 0.37, 0.022, l * 0.35], [x, y + 0.10, z], m.metal, 0.006);
      for (let row = 0; row < 10; row++) for (let col = 0; col < 3; col++) {
        box(panel, [w * 0.108, 0.004, l * 0.031], [x + (col - 1) * w * 0.117, y + 0.113, z + (row - 4.5) * l * 0.033], cellMaterial, 0.002);
      }
    }
    const weather = bind('weather-station', new T.Group()); mast.add(weather);
    const wy = baseY + mastH + 0.18;
    rod(weather, [0, baseY + mastH, mastZ], [0, wy, mastZ], 0.005, m.metal);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3, x = Math.cos(angle) * 0.07, z = Math.sin(angle) * 0.07;
      rod(weather, [0, wy, mastZ], [x, wy, mastZ + z], 0.003, m.metal);
      mesh(weather, new T.SphereGeometry(0.018, 16, 12), m.secondary, [x, wy, mastZ + z]);
    }
    for (let i = 0; i < 5; i++) cylinder(weather, 0.035, 0.008, [0.075, baseY + mastH * 0.45 + i * 0.014, mastZ], m.primary);
    rod(weather, [0, baseY + mastH * 0.45, mastZ], [0.075, baseY + mastH * 0.45, mastZ], 0.005, m.metal);
  }
  if (variant === 'multibeam') {
    const sonar = bind('multibeam-transducer', new T.Group()); root.add(sonar);
    rod(sonar, [w * 0.25, y + 0.08, 0], [w * 0.61, y + 0.08, 0], 0.025, m.metal);
    rod(sonar, [w * 0.61, y + 0.08, 0], [w * 0.61, -d - 0.20, 0], 0.022, m.metal);
    box(sonar, [0.10, 0.07, 0.38], [w * 0.61, -d - 0.20, 0], m.accent, 0.02);
    for (let i = 0; i < 8; i++) box(sonar, [0.08, 0.006, 0.033], [w * 0.61, -d - 0.238, (i - 3.5) * 0.044], m.rubber, 0.002);
    const frame = bind('stern-a-frame', new T.Group()); root.add(frame);
    for (const side of [-1, 1]) {
      rod(frame, [side * w * 0.33, y, -l * 0.35], [side * w * 0.24, y + 0.65, -l * 0.34], 0.022, m.accent);
      rod(frame, [side * w * 0.33, y, -l * 0.15], [side * w * 0.24, y + 0.65, -l * 0.34], 0.016, m.metal);
      cylinder(root, 0.055, 0.03, [side * w * 0.30, baseY + 0.10, cz], m.primary);
    }
    rod(frame, [-w * 0.24, y + 0.65, -l * 0.34], [w * 0.24, y + 0.65, -l * 0.34], 0.025, m.accent);
    const winch = cylinder(frame, 0.09, 0.22, [0, y + 0.16, -l * 0.32], m.secondary); winch.rotation.z = Math.PI / 2;
    rod(frame, [0, y + 0.16, -l * 0.32], [0, y + 0.61, -l * 0.34], 0.004, m.rubber);
  }
  if (variant === 'relay') {
    const radome = bind('communication-radome', new T.Group()); root.add(radome);
    cylinder(radome, 0.16, 0.09, [0, y + 0.16, -l * 0.27], m.secondary);
    mesh(radome, new T.SphereGeometry(0.23, 32, 24), m.primary, [0, y + 0.40, -l * 0.27]);
    const radio = bind('communication-rack', box(root, [0.37, 0.23, 0.33], [0, y + 0.12, -l * 0.04], m.secondary, 0.02));
    for (let i = 0; i < 5; i++) box(radio, [0.30, 0.012, 0.004], [0, -0.07 + i * 0.034, 0.169], m.metal, 0.001);
    const antennas = bind('directional-antennas', new T.Group()); root.add(antennas);
    for (const side of [-1, 1]) {
      rod(antennas, [side * 0.28, y, l * 0.15], [side * 0.28, y + 0.85, l * 0.15], 0.012, m.metal);
      box(antennas, [0.045, 0.22, 0.13], [side * 0.28, y + 0.64, l * 0.15], m.primary, 0.012);
      rod(antennas, [side * 0.28, y + 0.85, l * 0.15], [side * 0.28, y + 1.08, l * 0.15], 0.004, m.rubber);
    }
  }
  if (variant === 'debris') {
    const belt = bind('collection-conveyor', new T.Group()); root.add(belt);
    belt.position.set(w * 0.53, y + 0.07, -l * 0.04); belt.rotation.x = 0.27;
    box(belt, [0.26, 0.045, 1.35], [0, 0, 0], m.rubber, 0.01);
    for (const side of [-1, 1]) box(belt, [0.025, 0.09, 1.39], [side * 0.15, 0.025, 0], m.accent, 0.006);
    for (let i = 0; i < 15; i++) box(belt, [0.27, 0.038, 0.016], [0, 0.037, (i - 7) * 0.085], m.metal, 0.003);
    const basket = bind('collection-basket', new T.Group()); root.add(basket);
    const z0 = -l * 0.29, bw = w * 0.65, bl = l * 0.25;
    box(basket, [bw, 0.025, bl], [0, y + 0.025, z0], m.secondary, 0.008);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) rod(basket, [side * bw / 2, y + 0.03, z0 - bl / 2 + i * bl / 8], [side * bw / 2, y + 0.39, z0 - bl / 2 + i * bl / 8], 0.005, m.metal);
      rod(basket, [side * bw / 2, y + 0.39, z0 - bl / 2], [side * bw / 2, y + 0.39, z0 + bl / 2], 0.014, m.accent);
      for (let i = 0; i < 9; i++) rod(basket, [-bw / 2 + i * bw / 8, y + 0.03, z0 + side * bl / 2], [-bw / 2 + i * bw / 8, y + 0.39, z0 + side * bl / 2], 0.005, m.metal);
      rod(basket, [-bw / 2, y + 0.39, z0 + side * bl / 2], [bw / 2, y + 0.39, z0 + side * bl / 2], 0.014, m.accent);
    }
    bind('work-beacon', cylinder(root, 0.037, 0.06, [0, baseY + mastH + 0.08, mastZ], m.accent));
  }
  if (variant === 'patrol') {
    const tower = bind('observation-tower', new T.Group()); root.add(tower);
    for (const side of [-1, 1]) rod(tower, [side * w * 0.20, y, -l * 0.08], [side * w * 0.12, y + 0.93, -l * 0.08], 0.025, m.secondary);
    box(tower, [w * 0.36, 0.04, 0.22], [0, y + 0.94, -l * 0.08], m.primary, 0.012);
    bind('patrol-radar', box(tower, [0.66, 0.085, 0.12], [0, y + 1.05, -l * 0.08], m.primary, 0.02));
    const camera = bind('patrol-camera', new T.Group()); root.add(camera);
    cylinder(camera, 0.075, 0.07, [0, baseY + mastH + 0.05, mastZ], m.secondary);
    mesh(camera, new T.SphereGeometry(0.085, 24, 16), m.primary, [0, baseY + mastH + 0.12, mastZ]);
    lens(camera, [0, baseY + mastH + 0.12, mastZ + 0.065], 0.037, m);
    const fenders = bind('patrol-fenders', new T.Group()); root.add(fenders);
    for (const side of [-1, 1]) for (const z of [-l * 0.30, 0, l * 0.20]) {
      const profile = hullProfile(z / l + 0.5, w, y);
      cylinder(fenders, 0.045, 0.24, [side * (profile.halfWidth + 0.018), y * 0.38, z], m.rubber);
    }
  }
  const animated: { node: T.Object3D; axis: 'z'; sign: number }[] = [];
  const xs = variant === 'inspection' ? [0] : [-w * 0.24, w * 0.24];
  xs.forEach((x, i) => {
    const name = xs.length === 1 ? 'center' : i === 0 ? 'left' : 'right';
    const thruster = bind(`thruster-${name}`, new T.Group()); root.add(thruster);
    thruster.position.set(x, -d * 0.55, -l / 2 - 0.07);
    rod(thruster, [0, 0.02, 0.04], [0, d * 0.5, 0.1], 0.018, m.metal);
    const radius = w * 0.105;
    const duct = mesh(thruster, new T.TorusGeometry(radius, 0.012, 12, 48), m.secondary, [0, 0, -0.045]);
    duct.scale.z = 2.8;
    const motor = cylinder(thruster, radius * 0.35, 0.12, [0, 0, 0], m.secondary); motor.rotation.x = Math.PI / 2;
    const rotor = bind(`propeller-${name}`, new T.Group()); thruster.add(rotor); rotor.position.z = -0.055;
    const bladeGroup = new T.Group(); rotor.add(bladeGroup); bladeGroup.rotation.x = Math.PI / 2;
    propeller(bladeGroup, radius * 0.83, m);
    animated.push({ node: rotor, axis: 'z', sign: i ? -1 : 1 });
    for (const sign of [-1, 1]) rod(thruster, [sign * radius * 0.36, 0, 0.01], [sign * radius, 0, -0.04], 0.006, m.metal);
  });
  root.userData = { kind: 'usv', variant, units: 'metres', preset: p.code, demoDimensions: true, bow: 'single-point', hullLength: l, hullWidth: w };
  return finish(root, parts, animated, scale);
}
