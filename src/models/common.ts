import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModelColors, ModelHandle } from './types';

/** No DOM, renderer, image loaders or global resources are used in this module. */
export function makeMaterials(colors: Required<ModelColors>) {
  const data = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const weave = ((x >> 2) + (y >> 2)) % 2;
    const value = 36 + (weave ? x % 4 : y % 4) * 8;
    const i = (y * 32 + x) * 4;
    data.set([value, value + 4, value + 7, 255], i);
  }
  const texture = new T.DataTexture(data, 32, 32);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(5, 2); texture.colorSpace = T.SRGBColorSpace; texture.needsUpdate = true;
  return {
    primary: new T.MeshStandardMaterial({ color: colors.primary, metalness: 0.28, roughness: 0.32 }),
    secondary: new T.MeshStandardMaterial({ color: colors.secondary, metalness: 0.45, roughness: 0.36 }),
    accent: new T.MeshStandardMaterial({ color: colors.accent, metalness: 0.2, roughness: 0.32 }),
    carbon: new T.MeshStandardMaterial({ color: '#adb6bb', map: texture, metalness: 0.45, roughness: 0.37 }),
    metal: new T.MeshStandardMaterial({ color: '#a9b7c1', metalness: 0.86, roughness: 0.24 }),
    rubber: new T.MeshStandardMaterial({ color: '#172127', roughness: 0.83 }),
    glass: new T.MeshPhysicalMaterial({ color: '#143a52', metalness: 0.48, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
    red: new T.MeshStandardMaterial({ color: '#e25236', emissive: '#a42c16', emissiveIntensity: 0.5 }),
    green: new T.MeshStandardMaterial({ color: '#4fbda3', emissive: '#15735c', emissiveIntensity: 0.45 }),
  };
}
export type Materials = ReturnType<typeof makeMaterials>;
type XYZ = readonly [number, number, number];
export function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material | T.Material[], position: XYZ = [0, 0, 0], name = '') {
  const node = new T.Mesh(geometry, material);
  node.position.set(...position); node.name = name;
  node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
}
export function box(parent: T.Object3D, size: XYZ, pos: XYZ, mat: T.Material, radius = 0.008, name = '') {
  return mesh(parent, new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(v => v / 2))), mat, pos, name);
}
export function cylinder(parent: T.Object3D, radius: number, height: number, pos: XYZ, mat: T.Material, top = radius, name = '') {
  return mesh(parent, new T.CylinderGeometry(top, radius, height, 32), mat, pos, name);
}
export function rod(parent: T.Object3D, a: XYZ, b: XYZ, radius: number, mat: T.Material, name = '') {
  const start = new T.Vector3(...a), end = new T.Vector3(...b), d = end.clone().sub(start);
  const node = cylinder(parent, radius, d.length(), [0, 0, 0], mat, radius, name);
  node.position.copy(start.add(end).multiplyScalar(0.5));
  node.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return node;
}
export function cable(parent: T.Object3D, points: XYZ[], radius: number, mat: T.Material) {
  return mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 24, radius, 6, false), mat);
}
export function bolts(parent: T.Object3D, xs: number[], zs: number[], y: number, mat: T.Material, radius = 0.004) {
  for (const x of xs) for (const z of zs) {
    mesh(parent, new T.CylinderGeometry(radius, radius, radius * 0.5, 6), mat, [x, y, z]);
    box(parent, [radius * 1.2, radius * 0.08, radius * 0.17], [x, y + radius * 0.28, z], new T.MeshStandardMaterial({ color: '#34414a' }), radius * 0.03);
  }
}
export function lens(parent: T.Object3D, position: XYZ, radius: number, mats: Materials) {
  const g = new T.Group(); parent.add(g); g.position.set(...position);
  const housing = cylinder(g, radius, radius * 0.7, [0, 0, 0], mats.rubber); housing.rotation.x = Math.PI / 2;
  const rim = mesh(g, new T.TorusGeometry(radius * 0.82, radius * 0.085, 10, 32), mats.metal, [0, 0, radius * 0.38]);
  mesh(g, new T.CircleGeometry(radius * 0.72, 32), mats.glass, [0, 0, radius * 0.4]);
  mesh(g, new T.CircleGeometry(radius * 0.27, 24), mats.secondary, [0, 0, radius * 0.405]);
  rim.name = 'lens-ring'; return g;
}
export function propeller(parent: T.Object3D, radius: number, mats: Materials) {
  // Two swept, tapered, gently pitched solid blades. Opposite blades share a hub.
  const shape = new T.Shape();
  shape.moveTo(radius * 0.07, -radius * 0.035);
  shape.bezierCurveTo(radius * 0.28, -radius * 0.12, radius * 0.8, -radius * 0.095, radius, -radius * 0.025);
  shape.quadraticCurveTo(radius * 1.015, radius * 0.035, radius * 0.92, radius * 0.055);
  shape.bezierCurveTo(radius * 0.55, radius * 0.12, radius * 0.25, radius * 0.07, radius * 0.07, radius * 0.035);
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: radius * 0.018, bevelEnabled: true, bevelThickness: radius * 0.006, bevelSize: radius * 0.006, bevelSegments: 2, steps: 1, curveSegments: 16 });
  geometry.rotateX(-Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    const blade = mesh(parent, geometry, mats.carbon); blade.rotation.y = i * Math.PI; blade.rotation.x = 0.055;
    const tip = box(blade, [radius * 0.065, radius * 0.018, radius * 0.07], [radius * 0.92, radius * 0.025, 0], mats.accent, radius * 0.005); tip.name = `blade-tip-${i}`;
  }
  cylinder(parent, radius * 0.105, radius * 0.10, [0, radius * 0.025, 0], mats.metal);
  cylinder(parent, radius * 0.06, radius * 0.055, [0, radius * 0.1, 0], mats.secondary);
}
export function finish(root: T.Group, parts: Record<string, T.Object3D>, animated: { node: T.Object3D; axis: 'y' | 'z'; sign: number }[], scale: number): ModelHandle {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale 必须为有限正数');
  root.scale.setScalar(scale);
  let disposed = false;
  return {
    root, parts,
    update(dt, state = {}) {
      if (disposed) return;
      const speed = state.rotorSpeed ?? 0;
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(speed)) throw new RangeError('时间须为非负有限数，转速须为有限数');
      for (const values of [state.rotorSpeeds, state.rotorAngles]) if (values && (values.length !== animated.length || !values.every(Number.isFinite))) throw new RangeError('各旋翼的转速或角度必须为有限数且与旋翼数量一致');
      animated.forEach(({ node, axis, sign }, i) => { node.rotation[axis] = state.rotorAngles?.[i] ?? (node.rotation[axis] + dt * (state.rotorSpeeds?.[i] ?? speed) * sign) % (Math.PI * 2); });
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      const gs = new Set<T.BufferGeometry>(), ms = new Set<T.Material>(), ts = new Set<T.Texture>();
      root.traverse(obj => { if (obj instanceof T.Mesh) { gs.add(obj.geometry); for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) ms.add(m); } });
      for (const m of ms) for (const v of Object.values(m)) if (v instanceof T.Texture) ts.add(v);
      gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); ts.forEach(t => t.dispose());
    },
  };
}
