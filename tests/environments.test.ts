import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createEnvironment, defineEnvironment, environmentPresets, checkPlacement, surfaceObstacles } from '../src/environments';
import type { EnvironmentVariant, Placement } from '../src/environments';
import { pointInPolygon, ringInsidePolygon } from '../src/environments/spatial';
import { createQuadrotor, createUSV } from '../src/models';
import { conservativeBounds, modelCatalog, parseSceneConfig, serializeSceneConfig } from '../src/scenes/config';
import type { SceneConfig } from '../src/scenes/config';
import { createEnvironmentExample } from '../examples/environment';

const variants = Object.keys(environmentPresets) as EnvironmentVariant[];
const small = { min: [-0.8, -0.4, -1.5], max: [0.8, 2, 1.5] } satisfies Placement['bounds'];
test('all environments generate deterministic, finite geometry and safe spawn points', () => {
  for (const variant of variants) {
    const a = defineEnvironment(variant), b = defineEnvironment(variant);
    assert.deepEqual(a, b); assert.equal(a.spatial.waterLevel, 0);
    assert.equal(a.spatial.spawnPoints.length, 24);
    assert.equal(new Set(a.spatial.obstacles.map(o => o.id)).size, a.spatial.obstacles.length);
    for (const p of a.spatial.spawnPoints) assert.deepEqual(checkPlacement(a.spatial, { ...p, bounds: small }), [], `${variant} ${p.id}`);
    const env = createEnvironment({ variant }), before = JSON.stringify(env.spatial);
    env.root.traverse(node => {
      if (node instanceof T.InstancedMesh && node.userData.obstacleIds) {
        const matrix = new T.Matrix4();
        for (let i = 0; i < node.count; i++) {
          const obstacle = env.spatial.obstacles.find(o => o.id === node.userData.obstacleIds[i])!;
          node.getMatrixAt(i, matrix);
          for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
            const p = new T.Vector3(x, y, z).applyMatrix4(matrix);
            assert.ok(p.y >= obstacle.minY - 1e-5 && p.y <= obstacle.maxY + 1e-5, `${obstacle.id}: detail height`);
            assert.ok(pointInPolygon([p.x, p.z], obstacle), `${obstacle.id}: detail footprint`);
          }
        }
      }
      if (node instanceof T.Mesh) for (const key of ['position', 'normal']) {
        const attr = node.geometry.getAttribute(key);
        if (attr) assert.ok(Array.from(attr.array).every(Number.isFinite), `${variant}: ${key}`);
      }
    });
    env.update(2); assert.equal(JSON.stringify(env.spatial), before);
    assert.ok(new T.Box3().setFromObject(env.root).getSize(new T.Vector3()).x > 100);
    env.dispose();
  }
});
test('deepwater keeps collision data aligned, has motion-driven wakes and releases its reflection target', () => {
  const env = createEnvironment({ variant: 'deepwater' });
  assert.deepEqual(env.spatial, defineEnvironment('deepwater').spatial);
  const water = env.root.getObjectByName('water-0') as T.Mesh<T.BufferGeometry, T.ShaderMaterial> & { getRenderTarget(): T.WebGLRenderTarget };
  const before = JSON.stringify(env.spatial); let disposed = 0;
  water.getRenderTarget().addEventListener('dispose', () => disposed++);
  env.setVessels!([{ id: 'test', position: [0, 0, 0], yaw: 0, length: 2 }]); env.update(.1);
  assert.equal(water.material.uniforms.wakes.value[0].w, 0);
  env.setVessels!([{ id: 'test', position: [0, 0, .1], yaw: 0, length: 2 }]); env.update(.1);
  const moving = water.material.uniforms.wakes.value[0].w; assert.ok(moving > 0);
  env.update(2); assert.ok(water.material.uniforms.wakes.value[0].w < moving);
  assert.equal(JSON.stringify(env.spatial), before);
  assert.ok(checkPlacement(env.spatial, { id: 'q', kind: 'quadrotor', position: [-910, 70, -280], yaw: 0, bounds: small }).some(i => i.code === 'obstacle'));
  env.dispose(); env.dispose(); assert.equal(disposed, 1);
});
test('seed changes details but preserves deterministic water topology', () => {
  const a = defineEnvironment('waterfront', 42), b = defineEnvironment('waterfront', 43);
  assert.deepEqual(a.spatial.water, b.spatial.water); assert.notDeepEqual(a.spatial.obstacles, b.spatial.obstacles);
  assert.throws(() => createEnvironment({ seed: -1 }), RangeError);
  assert.throws(() => createEnvironment({ seed: NaN }), RangeError);
});
test('navigation differentiates shores, island holes, bridge piers and bridge clearance', () => {
  const bridge = defineEnvironment('bridge').spatial;
  const boat: Placement = { id: 'boat', kind: 'usv', position: [0, 0, 0], yaw: 0, bounds: small };
  assert.deepEqual(checkPlacement(bridge, boat), [], 'under bridge is open');
  assert.ok(checkPlacement(bridge, { ...boat, position: [0, 0, 43] }).some(i => i.otherId === 'bridge-pier-43'));
  assert.ok(checkPlacement(bridge, { ...boat, kind: 'quadrotor', position: [0, 17, 0] }).some(i => i.otherId === 'bridge-deck'));
  assert.deepEqual(checkPlacement(bridge, { ...boat, kind: 'quadrotor', position: [0, 24, 0] }), []);
  assert.ok(!surfaceObstacles(bridge).some(o => o.id === 'bridge-deck'));
  assert.ok(checkPlacement(bridge, { ...boat, position: [20, 0, 65] }).some(i => i.code === 'water'));
  assert.ok(checkPlacement(bridge, { ...boat, position: [301, 0, 0] }).some(i => i.code === 'bounds'));
  const islands = defineEnvironment('islands').spatial;
  assert.ok(checkPlacement(islands, { ...boat, position: [-165, 0, -65] }).some(i => i.code === 'water'));
  // A polygon that encloses an entire island must fail even if all corners are in water.
  const area = { outer: [[-10, -10], [10, -10], [10, 10], [-10, 10]], holes: [[[-1, -1], [1, -1], [1, 1], [-1, 1]]] } as Parameters<typeof pointInPolygon>[1];
  assert.equal(ringInsidePolygon([[-2, -2], [2, -2], [2, 2], [-2, 2]], area), false);
  const harbor = defineEnvironment('harbor').spatial;
  assert.deepEqual(checkPlacement(harbor, { ...boat, position: [25, 0, -136] }), [], 'harbor entry gap');
  assert.ok(checkPlacement(harbor, { ...boat, position: [-25, 0, -136], bounds: { min: [-10, -1, -3], max: [10, 2, 3] } }).some(i => i.code === 'obstacle'), 'wide hull intersects breakwater');
  assert.ok(checkPlacement(bridge, boat, [{ ...boat, id: 'other' }]).some(i => i.code === 'vehicle'));
});
test('all twelve model envelopes fit the default spawn sites and rotor envelope is stable', () => {
  const spatial = defineEnvironment('lake').spatial;
  for (const model of modelCatalog) {
    const handle = model.kind === 'quadrotor' ? createQuadrotor({ variant: model.variant as any }) : createUSV({ variant: model.variant as any });
    const bounds = conservativeBounds(handle, model.id), spawn = spatial.spawnPoints.find(s => s.kind === model.kind)!;
    assert.deepEqual(checkPlacement(spatial, { ...spawn, bounds }), []);
    if (model.kind === 'quadrotor') {
      handle.update(0.2, { rotorSpeed: 15 });
      assert.deepEqual(conservativeBounds(handle, model.id), bounds);
    }
    handle.dispose();
  }
});
test('configuration round-trip preserves invalid placements, colors, pose and view while rejecting malformed data', () => {
  const config: SceneConfig = { version: 1, environment: { variant: 'lake', seed: 10 }, vehicles: [
    { id: 'v1', modelId: 'quadrotor-rescue', position: [999, 11, -33], yaw: 0.72, scale: 1, colors: { primary: '#ffaa00', secondary: '#223344', accent: '#0099aa' } },
    { id: 'v2', modelId: 'usv-endurance', position: [40, 0, 11], yaw: -0.2, scale: 1, colors: { primary: '#ffffff', secondary: '#223344', accent: '#0099aa' } },
  ], view: { selectedId: 'v2', cameraPosition: [500, 400, 200], target: [0, 0, 0], labels: true, obstacles: false, spawns: true, waterBoundary: false, waterAnimation: false, rotorAnimation: true } };
  assert.deepEqual(parseSceneConfig(serializeSceneConfig(config)), config);
  for (const mutate of [
    (c: any) => { c.version = 9; }, (c: any) => { c.environment.variant = 'unknown'; },
    (c: any) => { c.vehicles[0].modelId = 'missing'; }, (c: any) => { c.vehicles[0].position[0] = null; },
    (c: any) => { c.vehicles[1].id = 'v1'; }, (c: any) => { c.vehicles[0].colors.primary = 'url(x)'; },
    (c: any) => { c.vehicles[1].position[1] = 6; }, (c: any) => { c.view.cameraPosition = [0, 0, 0]; },
  ]) { const copy = structuredClone(config); mutate(copy); assert.throws(() => parseSceneConfig(JSON.stringify(copy))); }
  assert.throws(() => parseSceneConfig('{')); assert.throws(() => parseSceneConfig('{"version":1,"environment":{"seed":1e999}}'));
});
test('environments have independent lifetimes and standalone composition works', () => {
  const a = createEnvironment(), b = createEnvironment();
  let disposed = 0;
  const first = a.root.children.find(n => n instanceof T.Mesh) as T.Mesh;
  first.geometry.addEventListener('dispose', () => disposed++);
  a.dispose(); a.dispose(); assert.equal(disposed, 1); b.update(0.1); b.dispose();
  const example = createEnvironmentExample(); assert.deepEqual(example.issues, []); assert.equal(example.scene.children.length, 3);
  example.update(0.1); example.dispose(); assert.equal(example.scene.children.length, 0);
});

test('Qingzhou design spans, georeference and under-deck clearance stay consistent', () => {
  const e=createEnvironment({variant:'qingzhou'});
  const deck=e.spatial.obstacles.find(o=>o.id==='main-deck')!;
  const a=deck.outer[0], b=deck.outer[1];
  assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-1150)<1e-6);
  assert.equal(e.root.userData.georeference.datum,'WGS84');
  assert.deepEqual(checkPlacement(e.spatial,{id:'boat',kind:'usv',position:[0,0,0],yaw:0,bounds:small}),[]);
  assert.ok(checkPlacement(e.spatial,{id:'air',kind:'quadrotor',position:[0,46,0],yaw:0,bounds:small}).some(i=>i.otherId==='main-deck'));
  assert.equal(e.spatial.obstacles.filter(o=>o.id.startsWith('tower-base-')).length,2);
  let releases=0;const water=e.root.getObjectByName('water-0') as any;water.getRenderTarget().addEventListener('dispose',()=>releases++);
  e.dispose();e.dispose();assert.equal(releases,1);
});
