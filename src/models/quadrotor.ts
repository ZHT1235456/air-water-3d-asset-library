import * as T from 'three';
import { box, bolts, cable, cylinder, finish, lens, makeMaterials, mesh, propeller, rod } from './common';
import { quadrotorPresets } from './presets';
import type { ModelOptions, QuadrotorVariant } from './types';

export function createQuadrotor(options: ModelOptions<QuadrotorVariant> = {}) {
  const variant = options.variant ?? 'inspection';
  if (!Object.hasOwn(quadrotorPresets, variant)) throw new RangeError('未知无人机款式');
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale 必须为有限正数');
  const p = quadrotorPresets[variant];
  const m = makeMaterials({ primary: options.colors?.primary ?? p.primary, secondary: options.colors?.secondary ?? p.secondary, accent: options.colors?.accent ?? p.accent });
  const root = new T.Group(); root.name = `quadrotor-${variant}`;
  const parts: Record<string, T.Object3D> = {};
  const bind = <O extends T.Object3D>(name: string, obj: O) => { obj.name = name; parts[name] = obj; return obj; };
  const [w, h, l] = p.body;
  const heavy = variant === 'heavy' || variant === 'cargo', survey = ['survey', 'rescue', 'multispectral', 'relay'].includes(variant);
  const body = bind('body', new T.Group()); root.add(body);
  box(body, [w * 1.05, h * 0.35, l], [0, -h * 0.2, 0], m.secondary, 0.025);
  box(body, [w, h * 0.8, l * 0.96], [0, h * 0.15, 0], m.primary, 0.035);
  box(body, [w * 0.91, h * 0.06, l * 0.86], [0, h * 0.575, 0], m.secondary, 0.009);
  box(body, [w * 0.84, h * 0.035, l * 0.78], [0, h * 0.61, 0], m.primary, 0.01);
  // A painted spine and recessed cooling slots make the top readable at oblique angles.
  box(body, [w * 0.16, 0.003, l * 0.45], [-w * 0.24, h * 0.635, 0.015], m.accent, 0.001);
  for (let i = 0; i < 7; i++) box(body, [w * 0.24, 0.003, 0.005], [w * 0.18, h * 0.637, -l * 0.22 + i * 0.011], m.rubber, 0.001);
  bolts(body, [-w * 0.37, w * 0.37], [-l * 0.35, l * 0.35], h * 0.64, m.metal);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(body, [0.003, h * 0.23, 0.006], [side * w * 0.502, h * 0.1, -l * 0.20 + i * 0.013], m.rubber, 0.001);
    box(body, [0.025, 0.008, 0.028], [side * w * 0.38, h * 0.61, l * 0.30], side < 0 ? m.red : m.green, 0.003);
  }
  const animated: { node: T.Object3D; axis: 'y'; sign: number }[] = [];
  let index = 0;
  for (const zSign of [1, -1]) for (const xSign of [-1, 1]) {
    const name = `${zSign > 0 ? 'front' : 'rear'}-${xSign < 0 ? 'left' : 'right'}`;
    const x = xSign * p.armX, z = zSign * p.armZ;
    const arm = bind(`arm-${name}`, new T.Group()); root.add(arm);
    rod(arm, [xSign * w * 0.30, -0.008, zSign * l * 0.24], [x, 0, z], heavy ? 0.025 : survey ? 0.018 : 0.014, m.carbon);
    // Metal arm roots, ESC enclosure and visible routed cabling.
    const a = new T.Vector3(xSign * w * 0.4, 0, zSign * l * 0.28), b = new T.Vector3(x, 0, z);
    const joint = box(arm, [heavy ? 0.075 : 0.052, 0.05, 0.07], [a.x, 0, a.z], m.secondary, 0.009);
    joint.rotation.y = Math.atan2(x - a.x, z - a.z);
    bolts(joint, [-0.016, 0.016], [-0.018, 0.018], 0.027, m.metal, 0.003);
    const mid = a.clone().lerp(b, 0.70);
    const esc = box(arm, [0.037, 0.016, heavy ? 0.11 : 0.068], [mid.x, 0.022, mid.z], m.secondary, 0.004);
    esc.rotation.y = joint.rotation.y;
    for (let k = 0; k < 4; k++) box(esc, [0.03, 0.004, 0.003], [0, 0.009, -0.02 + k * 0.012], m.metal, 0.001);
    cable(arm, [[a.x, 0.028, a.z], [mid.x, 0.038, mid.z], [x, 0.018, z]], 0.003, m.rubber);
    const motor = bind(`motor-${name}`, new T.Group()); motor.position.set(x, 0.015, z); root.add(motor);
    const r = heavy ? 0.046 : survey ? 0.034 : 0.025;
    cylinder(motor, r * 1.12, 0.014, [0, 0, 0], m.metal);
    cylinder(motor, r, r * 1.15, [0, r * 0.55, 0], m.secondary);
    cylinder(motor, r * 1.03, 0.009, [0, r * 1.15, 0], m.accent);
    for (let j = 0; j < 12; j++) {
      const theta = j * Math.PI / 6;
      const vent = box(motor, [r * 0.24, r * 0.55, 0.002], [Math.sin(theta) * r, r * 0.6, Math.cos(theta) * r], m.rubber, 0.001);
      vent.rotation.y = theta;
    }
    const rotor = bind(`rotor-${name}`, new T.Group()); rotor.position.set(0, r * 1.4, 0); motor.add(rotor);
    rotor.rotation.y = (index++ % 2 ? 0.3 : -0.3) + Math.PI / 8;
    propeller(rotor, p.radius, m);
    animated.push({ node: rotor, axis: 'y', sign: xSign * zSign });
    if (variant === 'protected') {
      const guard = bind(`guard-${name}`, new T.Group()); motor.add(guard);
      const guardRadius = p.radius + 0.024;
      const ring = mesh(guard, new T.TorusGeometry(guardRadius, 0.007, 10, 64), m.secondary, [0, r * 1.6, 0]);
      ring.rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) {
        const theta = k * Math.PI / 2;
        const gx = Math.cos(theta) * guardRadius, gz = Math.sin(theta) * guardRadius;
        rod(guard, [0, -0.008, 0], [gx, -0.008, gz], 0.003, m.secondary);
        rod(guard, [gx, -0.008, gz], [gx, r * 1.6, gz], 0.004, m.accent);
      }
    }
    cylinder(motor, r * 0.5, 0.005, [0, -0.012, 0], zSign > 0 ? m.green : m.red);
  }
  const gear = bind('landing-gear', new T.Group()); root.add(gear);
  const footX = w * (heavy ? 0.84 : 0.72), footY = -p.leg;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      rod(gear, [side * w * 0.35, -h * 0.3, end * l * 0.27], [side * footX, footY, end * l * 0.43], heavy ? 0.012 : 0.008, m.carbon);
      cylinder(gear, 0.014, 0.014, [side * footX, footY, end * l * 0.43], m.rubber);
    }
    rod(gear, [side * footX, footY, -l * 0.65], [side * footX, footY, l * 0.65], 0.009, m.secondary);
    for (const z of [-l * 0.54, l * 0.54]) box(gear, [0.028, 0.015, 0.05], [side * footX, footY - 0.006, z], m.rubber, 0.005);
  }
  if (heavy) {
    const batteries = bind('batteries', new T.Group()); root.add(batteries);
    for (const side of [-1, 1]) {
      box(batteries, [w * 0.34, 0.075, l * 0.67], [side * w * 0.24, h * 0.77, -0.02], m.secondary, 0.012);
      for (const z of [-0.105, 0.075]) box(batteries, [w * 0.36, 0.008, 0.025], [side * w * 0.24, h * 0.77 + 0.04, z], m.rubber, 0.002);
      box(batteries, [0.05, 0.003, 0.07], [side * w * 0.24, h * 0.77 + 0.04, -0.015], m.accent, 0.003);
      cable(batteries, [[side * w * 0.24, 0.13, -l * 0.4], [side * w * 0.22, 0.12, -l * 0.55], [side * w * 0.2, 0, -l * 0.4]], 0.004, m.rubber);
    }
    const platform = bind('payload-platform', new T.Group()); root.add(platform);
    for (const x of [-0.12, 0.12]) for (const z of [-0.12, 0.12]) rod(platform, [x, -0.07, z], [x, -0.22, z], 0.006, m.metal);
    box(platform, [0.31, 0.018, 0.31], [0, -0.23, 0], m.carbon, 0.012);
    box(platform, [0.21, 0.085, 0.23], [0, -0.18, 0], m.primary, 0.015);
    for (let i = 0; i < 3; i++) box(platform, [0.21, 0.006, 0.018], [0, -0.134, -0.06 + i * 0.06], m.secondary, 0.002);
    bolts(platform, [-0.135, 0.135], [-0.135, 0.135], -0.218, m.metal);
  } else {
    const gimbal = bind('gimbal', new T.Group()); root.add(gimbal);
    const gy = survey ? -0.17 : -0.073, gz = survey ? 0.03 : l * 0.44;
    cylinder(gimbal, 0.024, 0.025, [0, -h * 0.55, gz], m.secondary);
    for (const side of [-1, 1]) {
      rod(gimbal, [side * 0.045, -h * 0.55, gz], [side * 0.045, gy, gz], 0.007, m.metal);
      const bearing = cylinder(gimbal, 0.014, 0.013, [side * 0.048, gy, gz], m.secondary); bearing.rotation.z = Math.PI / 2;
    }
    const camera = bind('camera', box(gimbal, [0.07, 0.057, 0.065], [0, gy, gz], m.secondary, 0.012));
    lens(camera, [0, 0, 0.038], 0.025, m);
    if (variant === 'survey') {
      const scanner = bind('scanner', cylinder(root, 0.052, 0.035, [0, -0.13, -0.085], m.accent));
      cylinder(scanner, 0.043, 0.018, [0, -0.026, 0], m.glass);
    }
  }
  if (variant === 'rescue') {
    const lights = bind('searchlights', new T.Group()); root.add(lights);
    for (const side of [-1, 1]) {
      rod(lights, [side * 0.09, -0.06, 0.09], [side * 0.13, -0.14, 0.09], 0.008, m.metal);
      const lamp = cylinder(lights, 0.044, 0.065, [side * 0.13, -0.14, 0.11], m.accent); lamp.rotation.x = Math.PI / 2;
      mesh(lights, new T.CircleGeometry(0.036, 32), m.metal, [side * 0.13, -0.14, 0.144]);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        mesh(lights, new T.CircleGeometry(0.008, 16), m.primary, [side * 0.13 + Math.cos(angle) * 0.021, -0.14 + Math.sin(angle) * 0.021, 0.145]);
      }
    }
    const speaker = bind('speaker', new T.Group()); root.add(speaker); speaker.position.set(0, -0.19, -0.10);
    const horn = mesh(speaker, new T.CylinderGeometry(0.052, 0.022, 0.07, 32, 1, true), m.secondary);
    horn.rotation.x = Math.PI / 2;
    mesh(speaker, new T.CircleGeometry(0.022, 24), m.rubber, [0, 0, -0.035]);
    rod(root, [0, -0.05, -0.10], [0, -0.19, -0.10], 0.012, m.metal);
  }
  if (variant === 'cargo') {
    const cargo = bind('cargo-pod', new T.Group()); root.add(cargo);
    box(cargo, [0.29, 0.19, 0.33], [0, -0.34, 0], m.primary, 0.025);
    box(cargo, [0.30, 0.018, 0.34], [0, -0.255, 0], m.secondary, 0.012);
    for (const side of [-1, 1]) {
      box(cargo, [0.015, 0.20, 0.34], [side * 0.10, -0.34, 0], m.rubber, 0.004);
      box(cargo, [0.044, 0.045, 0.012], [side * 0.10, -0.29, 0.177], m.metal, 0.004);
    }
    box(cargo, [0.11, 0.07, 0.003], [0, -0.35, 0.168], m.accent, 0.005);
    bolts(cargo, [-0.12, 0.12], [-0.14, 0.14], -0.244, m.metal);
  }
  if (variant === 'multispectral') {
    const array = bind('multispectral-array', new T.Group()); root.add(array);
    box(array, [0.16, 0.055, 0.13], [0, -0.19, -0.10], m.primary, 0.01);
    for (let i = 0; i < 4; i++) {
      const camera = bind(`spectral-camera-${i + 1}`, lens(array, [(i % 2 - 0.5) * 0.073, -0.222, -0.10 + (Math.floor(i / 2) - 0.5) * 0.058], 0.022, m));
      camera.rotation.x = Math.PI / 2;
    }
    const sensor = bind('irradiance-sensor', new T.Group()); root.add(sensor);
    cylinder(sensor, 0.034, 0.016, [0, h * 0.65 + 0.02, 0.09], m.secondary);
    mesh(sensor, new T.SphereGeometry(0.029, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.primary, [0, h * 0.65 + 0.028, 0.09]).scale.y = 0.45;
  }
  if (variant === 'relay') {
    const radio = bind('radio-pod', new T.Group()); root.add(radio);
    box(radio, [0.19, 0.09, 0.15], [0, -0.14, -0.10], m.secondary, 0.012);
    for (let i = 0; i < 6; i++) box(radio, [0.20, 0.008, 0.008], [0, -0.11, -0.16 + i * 0.024], m.metal, 0.002);
    const antennas = bind('relay-antennas', new T.Group()); root.add(antennas);
    for (const side of [-1, 1]) {
      rod(antennas, [side * 0.11, -0.10, -0.09], [side * 0.16, -0.21, -0.09], 0.006, m.metal);
      box(antennas, [0.025, 0.12, 0.11], [side * 0.17, -0.21, -0.09], m.primary, 0.008);
      rod(antennas, [side * 0.095, 0.08, -0.14], [side * 0.12, 0.28, -0.15], 0.003, m.rubber);
      cylinder(antennas, 0.012, 0.022, [side * 0.095, 0.08, -0.14], m.accent);
    }
  }
  if (survey || heavy) {
    const antenna = bind('gnss-antenna', new T.Group()); root.add(antenna);
    const z = heavy ? -0.18 : -0.10, y = heavy ? 0.24 : 0.18;
    rod(antenna, [0, h * 0.5, z], [0, y, z], 0.005, m.metal);
    cylinder(antenna, 0.033, 0.015, [0, y, z], m.primary, 0.028);
    mesh(antenna, new T.SphereGeometry(0.026, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.primary, [0, y + 0.006, z]).scale.y = 0.25;
  }
  root.userData = { kind: 'quadrotor', variant, units: 'metres', preset: p.code, demoDimensions: true };
  return finish(root, parts, animated, scale);
}
