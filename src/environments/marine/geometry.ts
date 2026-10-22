import * as T from 'three';
import type { Obstacle, Point2, Point3 } from '../types';

export function rect(x: number, z: number, w: number, d: number): Point2[] {
  return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
}
/** Batch by material; retain collision primitives from the exact world-space transforms. */
export function industrialBuilder(root: T.Group, obstacles: Obstacle[]) {
  const cube = new T.BoxGeometry(), column = new T.CylinderGeometry(1, 1, 1, 12);
  const batches = new Map<string, { geometry: T.BufferGeometry; color: string; matrices: T.Matrix4[] }>();
  const materials: T.Material[] = [];
  const q = new T.Quaternion(), matrix = new T.Matrix4();
  const add = (color: string, p: T.Vector3, s: T.Vector3, rotation = q, round = false) => {
    const key = color + (round ? '-round' : '') + (s.y < .3 ? '-surface' : '');
    if (!batches.has(key)) batches.set(key, { geometry: round ? column : cube, color, matrices: [] });
    batches.get(key)!.matrices.push(matrix.compose(p, rotation, s).clone());
  };
  function box(color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    add(color, new T.Vector3(x, y, z), new T.Vector3(w, h, d));
  }
  function beam(color: string, a: Point3, b: Point3, width: number, round = false) {
    const p = new T.Vector3(...a), v = new T.Vector3(...b).sub(p), len = v.length();
    const rotation = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize());
    add(color, p.addScaledVector(v, 0.5), new T.Vector3(width, len, width), rotation, round);
  }
  function obstacle(id: string, name: string, x: number, z: number, w: number, d: number, minY: number, maxY: number, kind: Obstacle['kind'] = 'facility', color = '#536470') {
    obstacles.push({ id, name, outer: rect(x, z, w, d), holes: [], minY, maxY, kind, color });
  }
  function flush() {
    for (const [name, b] of batches) {
      const material = new T.MeshStandardMaterial({ color: b.color, roughness: 0.66, metalness: 0.18, polygonOffset: name.endsWith('-surface'), polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      materials.push(material);
      const mesh = new T.InstancedMesh(b.geometry, material, b.matrices.length); mesh.name = `industrial-${name}`;
      b.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); root.add(mesh);
    }
  }
  return { box, beam, obstacle, flush };
}

export function cargoHull(length: number, width: number) {
  const vertices: number[] = [], indices: number[] = [];
  const stations = [[-0.5, 0.70], [-0.46, 0.94], [-0.36, 1], [0.28, 1], [0.40, 0.70], [0.48, 0.22], [0.5, 0.015]];
  for (const [u, breadth] of stations) {
    for (const [y, v] of [[18, -1], [1, -0.98], [-12, -0.65], [-14, 0], [-12, 0.65], [1, 0.98], [18, 1]]) vertices.push(u * length, y, v * breadth * width / 2);
  }
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < 7; j++) {
    const a = i * 7 + j, b = i * 7 + (j + 1) % 7, c = a + 7, d = b + 7;
    indices.push(a, c, b, b, c, d);
  }
  for (let j = 1; j < 6; j++) { indices.push(0, j, j + 1); const k = 42; indices.push(k, k + j + 1, k + j); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}

export function mountainRange(seed: number) {
  const group = new T.Group(); group.name = 'distant-three-dimensional-coast';
  const hash = (x: number, z: number) => { const a = Math.sin(x * 127.1 + z * 311.7 + seed) * 43758.5453; return a - Math.floor(a); };
  const noise = (x: number, z: number) => {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return T.MathUtils.lerp(T.MathUtils.lerp(hash(i, j), hash(i + 1, j), a), T.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b);
  };
  // Several separated terrain masses, not an image card: orbiting retains parallax.
  for (let ridge = 0; ridge < 3; ridge++) {
    const g = new T.PlaneGeometry(12000, 1800, 360, 80); g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), t = (z + 900) / 1800;
      const envelope = Math.pow(Math.sin(Math.PI * t), 1.5);
      const major = .30 + noise(x * .0011 + ridge * 8, z * .0008) * .9;
      const detail = noise(x * .012, z * .012) * 36 + noise(x * .035, z * .035) * 12;
      const h = Math.max(-20, envelope * (major * (310 + ridge * 100) + detail) - 18);
      p.setY(i, h);
      const c = new T.Color('#3a4f45').lerp(new T.Color('#817e6b'), Math.min(0.8, h / 640 + noise(x * .03, z * .03) * .16));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vTerrain;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrain=position;');
      shader.fragmentShader = `varying vec3 vTerrain;
        float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.,1.)),f.x),f.y);}
      ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float grain=terrainNoise(vTerrain.xz*.3);
        float erosion=terrainNoise(vTerrain.xz*.04+vTerrain.y*.03);
        diffuseColor.rgb*=.68+grain*.12+erosion*.35;`);
    };
    const mesh = new T.Mesh(g, material);
    mesh.position.set((ridge - 1) * 1300, 0, -3300 - ridge * 1550); mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
