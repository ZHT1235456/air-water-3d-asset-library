import * as T from 'three';
import type { EnvironmentHandle } from '../types';
import { marineConfig } from './config';
import { defineDeepwater, quay, cranes, ships, stacks, buoyPositions } from './definition';
import { industrialBuilder, cargoHull, mountainRange } from './geometry';
import { createMarineWater } from './water';

export function createDeepwater(seed = marineConfig.seed): EnvironmentHandle {
  const { spatial } = defineDeepwater(seed), root = new T.Group(); root.name = 'environment-deepwater'; root.userData.seed = seed;
  const solid = new T.Group(); solid.name = 'harbor-structures'; root.add(solid);
  const { box, beam, flush } = industrialBuilder(solid, spatial.obstacles);
  const colors = ['#a94f39', '#30616c', '#b6b7a6', '#687b65', '#c19052', '#48545f'];
  let state = seed >>> 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 >>> 0; return state / 4294967296; };
  const container = (x: number, y: number, z: number) => {
    const color = colors[Math.floor(random() * colors.length)];
    box(color, x, y, z, 12.19, 2.59, 2.44);
    // Narrow light roof edges and dark corner posts remain instanced.
    box('#36474b', x - 6.03, y, z + 1.23, .12, 2.65, .08);
    box('#b3b6ac', x, y + 1.31, z, 12.07, .08, 2.35);
  };
  box('#9a9a88', quay.x, -6, quay.z, quay.width, 24, quay.depth);
  box('#606f70', 0, 1, -240.4, 2160, 10, 1);
  // Quay coping, rail tracks, road lanes and mooring hardware.
  box('#c8c3aa', 0, 6.12, -242, 2160, .24, 3);
  for (const z of [-260, -300]) box('#535b5b', 0, 6.1, z, 2120, .2, .3);
  for (let x = -1050; x <= 1050; x += 20) {
    box('#c6bd98', x, 6.04, -325, 10, .08, .2);
    box('#222f32', x, 2.8, -239.8, 2.6, 3.4, .7);
    box('#515d60', x, 6.5, -245, .7, 1, .7);
  }
  for (const z of [-420, -490, -560, -630, -700]) {
    box('#737d77', 0, 6.03, z, 2120, .06, 10);
    for (let x = -1040; x < 1050; x += 24) box('#c6bd98', x, 6.08, z, 9, .06, .17);
  }
  for (const s of stacks) for (let col = 0; col < s.columns; col++) for (let row = 0; row < s.rows; row++) {
    const levels = 2 + Math.floor(random() * 3);
    for (let h = 0; h < levels; h++) container(s.x + (col - 4.5) * 12.8, 7.34 + h * 2.68, s.z + (row - 3) * 3);
  }
  for (const c of cranes) {
    const x = c.x, z = c.z, steel = '#cbd5d1', red = '#bc604a';
    for (const dx of [-16, 16]) for (const dz of [-20, 20]) {
      box('#434f52', x + dx, 7.5, z + dz, 4, 3, 5);
      beam(steel, [x + dx, 9, z + dz], [x + dx * .76, 57, z + dz * .9], 2.4);
    }
    for (const dx of [-13, 13]) {
      beam(steel, [x + dx, 55, z - 22], [x + dx, 55, z + 22], 3.2);
      beam(steel, [x + dx, 55, z - 20], [x + dx, 15, z + 20], .75);
    }
    for (const dz of [-20, 20]) beam(steel, [x - 16, 56, z + dz], [x + 16, 56, z + dz], 3);
    for (const dx of [-5.5, 5.5]) {
      beam(steel, [x + dx, 57, z - 20], [x + dx, 106, z - 14], 1.8);
      beam(red, [x + dx, 68, z - 80], [x + dx, 68, z + 90], 2);
      beam(steel, [x + dx, 74, z - 80], [x + dx, 74, z + 90], 1);
      for (let t = -80; t < 90; t += 10) {
        beam(steel, [x + dx, 68, z + t], [x + dx, 74, z + t + 10], .45);
        beam(steel, [x + dx, 74, z + t], [x + dx, 68, z + t + 10], .45);
      }
      for (const end of [-78, 85]) beam('#526469', [x + dx, 106, z - 14], [x + dx, 74, z + end], .17, true);
    }
    beam(steel, [x - 6, 106, z - 14], [x + 6, 106, z - 14], 1.8);
    box('#d1d2bf', x, 65, z - 57, 12, 8, 21); // machinery counterweight
    box('#b95941', x, 70, z + 56, 13, 2, 5);
    box('#bfd4d3', x + 7, 66, z + 55, 3, 3, 4); // operator cab
    for (const dx of [-4, 4]) for (const dz of [-1.8, 1.8]) beam('#35464c', [x + dx, 69, z + 56 + dz], [x + dx, 44, z + 56 + dz], .07, true);
    box('#d0a555', x, 43, z + 56, 12.5, 1.2, 3);
  }
  for (const s of ships) {
    const hull = new T.Mesh(cargoHull(s.length, s.width), new T.MeshStandardMaterial({ color: '#193342', roughness: .54, metalness: .23, side: T.DoubleSide }));
    hull.name = s.id; hull.position.set(s.x, 0, s.z); hull.castShadow = hull.receiveShadow = true; solid.add(hull);
    box('#a9765e', s.x - 12, 18.05, s.z, s.length * .82, .3, s.width * .94);
    box('#d0cfc2', s.x - s.length * .38, 30, s.z, 23, 24, s.width * .79);
    box('#d9ded2', s.x - s.length * .38, 43, s.z, 27, 3, s.width * .88);
    box('#2f4d59', s.x - s.length * .38 + 13.6, 43.2, s.z, .2, 1.6, s.width * .84);
    box('#36454c', s.x - s.length * .43, 47, s.z, 8, 8, 7);
    beam('#c9d0c7', [s.x - s.length * .38, 44, s.z], [s.x - s.length * .38, 51, s.z], .28);
    for (let bay = 0; bay < Math.floor(s.length / 14) - 7; bay++) for (let row = 0; row < 12; row++) {
      const levels = 5 + ((bay + row) % 3);
      for (let h = 0; h < levels; h++) container(s.x - s.length * .27 + bay * 13.3, 19.5 + h * 2.68, s.z + (row - 5.5) * 2.6);
    }
    // White load-line stripe and rails do not alter the equipment models.
    for (const sign of [-1, 1]) {
      box('#ccd0bd', s.x - 12, 3, s.z + sign * s.width * .495, s.length * .65, .25, .2);
      beam('#bcc5bb', [s.x - s.length * .43, 19.2, s.z + sign * s.width * .46], [s.x + s.length * .29, 19.2, s.z + sign * s.width * .46], .10);
    }
  }
  // Floating service pontoon and fairway markers give human-scale references.
  box('#5d6b68', -45, .25, -20, 30, 1.5, 7);
  for (let x = -58; x < -30; x += 1.2) box('#b2ac8e', x, 1.03, -20, .08, .08, 6.8);
  for (const [i, [x, z]] of buoyPositions.entries()) {
    const c = i % 2 ? '#af443b' : '#527e54';
    beam(c, [x, -.5, z], [x, .7, z], 1.5, true);
    beam(c, [x, .7, z], [x, 4, z], .38, true);
    box('#e0c47c', x, 4.5, z, .4, .8, .4);
  }
  box('#777d71', 1080, -5, 180, 18, 24, 650);
  for (let z = -130; z < 500; z += 8) {
    for (const side of [-1, 1]) {
      beam('#92998b', [1080 + side * 10, -1, z], [1080 + side * 17, 3, z + 3], 2.6);
      beam('#a6aa9a', [1080 + side * 12, 4, z], [1080 + side * 16, 0, z + 5], 2);
    }
  }
  // Far service warehouses / light masts; behind the operational yard.
  for (let x = -850; x <= 850; x += 340) {
    box('#b9b9a9', x, 16, -820, 240, 20, 70);
    box('#d7d4be', x, 26.4, -820, 244, .8, 74);
  }
  flush();
  root.add(mountainRange(seed));
  const water = createMarineWater(); root.add(water.root);
  let disposed = false;
  return {
    root, spatial,
    presentation: {
      background: marineConfig.fog.color, fog: [marineConfig.fog.near, marineConfig.fog.far],
      sunPosition: [-500, 500, -800], cameraPosition: marineConfig.cameras.establishing.position, target: marineConfig.cameras.establishing.target,
      backgroundAsset: marineConfig.sky.url, cameraFar: 60000,
    },
    setVessels: water.setVessels, setSun: water.setSun,
    setSky: water.setSky,
    invalidateReflection: water.invalidateReflection,
    setHorizon(color) { (water.root.material as T.ShaderMaterial).uniforms.horizonColor.value.copy(color); },
    update(dt) { if (!Number.isFinite(dt) || dt < 0) throw new RangeError('时间差须为非负有限数'); if (!disposed) water.update(dt); },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      water.root.removeFromParent(); water.dispose();
      const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
      root.traverse(o => { if (o instanceof T.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); if (o instanceof T.InstancedMesh) o.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
