import * as T from 'three';
import { defineEnvironment, environmentPresets } from './definitions';
import type { EnvironmentHandle, EnvironmentVariant, Polygon, SpatialData } from './types';
import { createMarineWater } from './marine/water';
import { marineConfig } from './marine/config';
import { pointInPolygon } from './spatial';
import { createNinepin } from './ninepin/scene';
import { createHornsea } from './hornsea/scene';
import { createJiuzhou } from './jiuzhou/scene';
import { createQingzhou } from './qingzhou/scene';
import { createDeepwater } from './marine/harbor';

export function polygonShape(p: Polygon) {
  const shape = new T.Shape(p.outer.map(([x, z]) => new T.Vector2(x, -z)));
  shape.holes = p.holes.map(ring => new T.Path(ring.map(([x, z]) => new T.Vector2(x, -z))));
  return shape;
}
export function prismGeometry(p: Polygon, height: number) {
  const g = new T.ExtrudeGeometry(polygonShape(p), { depth: height, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); return g;
}
function release(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
  root.traverse(o => {
    if (o instanceof T.Mesh || o instanceof T.Line) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
      if (o instanceof T.InstancedMesh) o.dispose();
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
export function createEnvironment({ variant = 'lake', seed }: { variant?: EnvironmentVariant; seed?: number } = {}): EnvironmentHandle {
  if (variant === 'ninepin') return createNinepin(seed);
  if (variant === 'hornsea') return createHornsea(seed);
  if (variant === 'jiuzhou') return createJiuzhou(seed);
  if (variant === 'qingzhou') return createQingzhou(seed);
  if (variant === 'deepwater') return createDeepwater(seed);
  const definition = defineEnvironment(variant, seed), spatial = definition.spatial;
  const root = new T.Group(); root.name = `environment-${variant}`; root.userData.seed = definition.seed;
  const materialCache = new Map<string, T.MeshStandardMaterial>();
  const material = (color: string) => {
    if (!materialCache.has(color)) materialCache.set(color, new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }));
    return materialCache.get(color)!;
  };
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const boxes: { color: string; obstacleId: string; pos: T.Vector3; scale: T.Vector3 }[] = [];
  let obstacleId = '';
  const detail = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => boxes.push({ color, obstacleId, pos: new T.Vector3(x, y, z), scale: new T.Vector3(w, h, d) });
  const b = spatial.bounds;
  const base = new T.Mesh(boxGeometry, material('#4f7772'));
  base.position.set(0, -10.5, 0); base.scale.set(b.maxX - b.minX, 1, b.maxZ - b.minZ); root.add(base);
  // Tessellated relief stays within land prisms; shoreline and collider footprints agree.
  for (const o of spatial.obstacles.filter(o => o.kind === 'land' || o.kind === 'rock')) {
    if(o.id === 'beach') continue;
    const xs=o.outer.map(p=>p[0]),zs=o.outer.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const step=o.kind==='rock'?2:5, vertices:number[]=[], colors:number[]=[];
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    const height=(x:number,z:number)=> {
      const edge=Math.min(...o.outer.map((a,i)=>{const b=o.outer[(i+1)%o.outer.length],dx=b[0]-a[0],dz=b[1]-a[1];const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}));
      if(o.id.startsWith('hill-')) {
        const r=Math.min(1,Math.hypot((x-cx)/((maxX-minX)/2),(z-cz)/((maxZ-minZ)/2)));
        return o.minY + (o.maxY-o.minY)*Math.pow(Math.max(0,1-r*r),1.6)*(.78+.13*Math.sin(x*.17)*Math.cos(z*.14));
      }
      return o.maxY-.03 - Math.min(o.maxY-.15, (1-Math.min(edge/18,1))*(o.maxY-.15)) + Math.min(edge/18,1)*Math.sin(x*.13)*Math.cos(z*.17)*.025;
    };
    for(let x=minX;x<maxX-step;x+=step)for(let z=minZ;z<maxZ-step;z+=step){
      const points:[[number,number],[number,number],[number,number],[number,number]]=[[x,z],[x+step,z],[x,z+step],[x+step,z+step]];
      if(!points.every(p=>pointInPolygon(p,o)))continue;
      for(const i of [0,2,1,1,2,3]){const [u,v]=points[i];vertices.push(u,height(u,v),v);const c=new T.Color(o.color).multiplyScalar(.82+.16*Math.sin(u*.047)*Math.cos(v*.061));colors.push(c.r,c.g,c.b);}
    }
    if(vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();const m=new T.MeshStandardMaterial({vertexColors:true,roughness:1});const mesh=new T.Mesh(g,m);mesh.name=`relief-${o.id}`;mesh.receiveShadow=true;root.add(mesh);}
  }
  for (const o of spatial.obstacles) {
    if (o.kind === 'tree') continue;
    obstacleId = o.id;
    // Reserve the top of each spatial prism for its visible roof, bollards or road surface.
    const detailHeight = o.kind === 'building' ? 1.8
      : o.kind === 'pier' && !o.id.includes('bridge') ? 0.6
      : o.id.startsWith('container') ? 0.08
      : o.kind === 'bridge' && !o.id.includes('rail') ? 0.06 : 0;
    const top = (o.kind === 'land' && o.id !== 'beach') || o.kind === 'rock' ? Math.max(o.minY+.02, Math.min(.1, o.maxY)) : o.maxY - detailHeight;
    const geo = prismGeometry(o, top - o.minY);
    if (o.id === 'beach') {
      // Slope only the top vertices from the waterline toward the higher terrain.
      const attr = geo.getAttribute('position');
      for (let i = 0; i < attr.count; i++) if (attr.getY(i) > 0) {
        const x = attr.getX(i), z = attr.getZ(i);
        const isInner = o.holes[0].some(([u, v]) => Math.hypot(x - u, z - v) < 0.01);
        if (isInner) attr.setY(i, -o.minY + 0.12);
      }
      geo.computeVertexNormals();
    }
    const node = new T.Mesh(geo, material(o.color)); node.position.y = o.minY;
    node.name = o.id; node.castShadow = true; node.receiveShadow = true; root.add(node);
    const xs = o.outer.map(p => p[0]), zs = o.outer.map(p => p[1]);
    const x = (Math.max(...xs) + Math.min(...xs)) / 2, z = (Math.max(...zs) + Math.min(...zs)) / 2;
    const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
    if (o.kind === 'building') {
      // Inset the wall so facade panels remain inside the footprint without coplanar faces.
      geo.translate(-x, 0, -z).scale((w - 0.16) / w, 1, (d - 0.16) / d).translate(x, 0, z);
      detail('#b1b9b5', x, top + 0.3, z, w * 0.98, 0.6, d * 0.98);
      detail('#6d7b7b', x + w * 0.22, top + 1, z, w * 0.16, 1.5, d * 0.2);
      for (let floor = o.minY + 3; floor < top - 1; floor += 4) for (let u = -w / 2 + 3; u < w / 2 - 1; u += 5) {
        detail('#547c88', x + u, floor, z + d / 2 - 0.03, 2, 1.9, 0.04);
        detail('#547c88', x + u, floor, z - d / 2 + 0.03, 2, 1.9, 0.04);
      }
    }
    if (o.kind === 'pier' && !o.id.includes('bridge')) {
      for (let t = -d / 2 + 2; t < d / 2 - 1; t += 3) detail('#c9bd9e', x, top + 0.025, z + t, w * 0.94, 0.05, 0.10);
      for (const side of [-1, 1]) detail('#e8dfb5', x + side * w * 0.3, top + 0.3, z, 0.4, 0.6, 0.4);
    }
    if (o.id.startsWith('container')) {
      for (let u = -w / 2 + 1; u < w / 2; u += 1.2) detail('#899b9d', x + u, top + 0.04, z, 0.08, 0.08, d * 0.95);
    }
    if (o.kind === 'bridge' && !o.id.includes('rail')) {
      detail('#6e7779', x, top + 0.02, z, w * 0.8, 0.04, d);
      for (let v = -d / 2 + 4; v + 2 <= d / 2; v += 8) detail('#e6dfc0', x, top + 0.05, z + v, 0.22, 0.02, 4);
    }
  }
  for (const color of new Set(boxes.map(b => b.color))) {
    const items = boxes.filter(b => b.color === color), instanced = new T.InstancedMesh(boxGeometry, material(color), items.length);
    const matrix = new T.Matrix4(), q = new T.Quaternion();
    items.forEach((b, i) => instanced.setMatrixAt(i, matrix.compose(b.pos, q, b.scale)));
    instanced.userData.obstacleIds = items.map(b => b.obstacleId);
    instanced.castShadow = true; instanced.receiveShadow = true; root.add(instanced);
  }
  const trees = spatial.obstacles.filter(o => o.kind === 'tree');
  if (trees.length) {
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(0.5, 1), material('#52755d'), trees.length);
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.35, 0.55, 1, 6), material('#7b7563'), trees.length);
    const mat = new T.Matrix4(), q = new T.Quaternion();
    trees.forEach((o, i) => {
      const x = (o.outer[0][0] + o.outer[2][0]) / 2, z = (o.outer[0][1] + o.outer[2][1]) / 2, height = o.maxY - o.minY, r = (o.outer[2][0] - o.outer[0][0]) / 2;
      trunks.setMatrixAt(i, mat.compose(new T.Vector3(x, o.minY + height * 0.3, z), q, new T.Vector3(1, height * 0.6, 1)));
      crowns.setMatrixAt(i, mat.compose(new T.Vector3(x, o.minY + height * 0.65, z), q, new T.Vector3(r * 1.9, height * 0.7, r * 1.9)));
    });
    crowns.castShadow = true; trunks.castShadow = true; root.add(crowns, trunks);
  }
  const water = createMarineWater(new T.ShapeGeometry(polygonShape(spatial.water[0])));
  root.add(water.root);
  let disposed = false;
  const extent = Math.max(environmentPresets[variant].width, environmentPresets[variant].depth);
  return {
    root, spatial,
    presentation: { backgroundAsset: marineConfig.sky.url, background: '#dbe7ea', fog: [extent * 1.6, extent * 4], sunPosition: [160, 320, 180], cameraPosition: [extent * 0.70, extent * 0.75, extent * 0.90], target: [0, 0, 0] },
    setVessels: water.setVessels, setSun: water.setSun, setSky: water.setSky,
    invalidateReflection: water.invalidateReflection,
    setHorizon(color) { (water.root.material as T.ShaderMaterial).uniforms.horizonColor.value.copy(color); },
    update(dt: number) { if (disposed) return; if (!Number.isFinite(dt) || dt < 0) throw new RangeError('时间差须为非负有限数'); water.update(dt); },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); water.root.removeFromParent(); water.dispose(); release(root); },
  };
}
export function createSpatialOverlays(spatial: SpatialData) {
  const root = new T.Group(), water = new T.Group(), obstacles = new T.Group(), spawns = new T.Group();
  root.add(water, obstacles, spawns);
  const lineMaterial = new T.LineBasicMaterial({ color: '#d5f9e9', depthTest: false, transparent: true, opacity: 0.95 });
  spatial.water.forEach(p => [p.outer, ...p.holes].forEach(r => {
    const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(r.map(([x, z]) => new T.Vector3(x, 0.2, z))), lineMaterial);
    line.renderOrder = 100; water.add(line);
  }));
  const obstacleMaterial = new T.LineBasicMaterial({ color: '#dc784d', transparent: true, opacity: 0.5, depthTest: false });
  spatial.obstacles.forEach(o => {
    const solid = prismGeometry(o, o.maxY - o.minY), edges = new T.EdgesGeometry(solid, 12); solid.dispose();
    const node = new T.LineSegments(edges, obstacleMaterial); node.position.y = o.minY; node.renderOrder = 99; obstacles.add(node);
  });
  const sphere = new T.SphereGeometry(1.5, 12, 8);
  const air = new T.MeshBasicMaterial({ color: '#f6b560' }), sea = new T.MeshBasicMaterial({ color: '#71e5d1' });
  spatial.spawnPoints.forEach(p => { const node = new T.Mesh(sphere, p.kind === 'usv' ? sea : air); node.position.set(...p.position); spawns.add(node); });
  water.visible = obstacles.visible = spawns.visible = false;
  return { root, water, obstacles, spawns, dispose() { root.removeFromParent(); release(root); } };
}
