import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createQuadrotor, createUSV, quadrotorPresets, usvPresets } from '../src/models';
import { createHullGeometry } from '../src/models/hull';
import { createIndependentScene } from '../examples/independent';

test('eighteen models have finite geometry, outward hulls and correct rotor counts', () => {
  assert.equal(Object.keys(quadrotorPresets).length, 8);
  assert.equal(Object.keys(usvPresets).length, 10);
  for (const variant of Object.keys(quadrotorPresets) as (keyof typeof quadrotorPresets)[]) {
    const h = createQuadrotor({ variant });
    assert.equal(Object.keys(h.parts).filter(n => n.startsWith('rotor-')).length, 4);
    const centres = Object.entries(h.parts).filter(([k]) => k.startsWith('rotor-')).map(([, o]) => o.getWorldPosition(new T.Vector3()));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(centres[i].distanceTo(centres[j]) > quadrotorPresets[variant].radius * 2.04, `${variant}: no overlap between swept rotor discs`);
    validate(h.root); h.dispose();
  }
  for (const variant of Object.keys(usvPresets) as (keyof typeof usvPresets)[]) {
    const h = createUSV({ variant }); validate(h.root);
    assert.equal(Object.keys(h.parts).filter(n => n.startsWith('propeller-')).length, variant === 'inspection' ? 1 : 2);
    h.dispose();
  }
});
test('new variants expose their distinct equipment and keep four rotors / one bow', () => {
  const cases = [
    [createQuadrotor({ variant: 'protected' }), ['guard-front-left', 'guard-front-right', 'guard-rear-left', 'guard-rear-right']],
    [createQuadrotor({ variant: 'rescue' }), ['searchlights', 'speaker']],
    [createQuadrotor({ variant: 'cargo' }), ['cargo-pod', 'batteries']],
    [createUSV({ variant: 'rescue' }), ['lifebuoys', 'recovery-ramp']],
    [createUSV({ variant: 'sampling' }), ['sample-carousel', 'sample-bottle-6', 'sampling-probe']],
    [createUSV({ variant: 'endurance' }), ['solar-panel-left', 'solar-panel-right', 'weather-station']],
    [createQuadrotor({ variant: 'multispectral' }), ['multispectral-array', 'spectral-camera-4', 'irradiance-sensor']],
    [createQuadrotor({ variant: 'relay' }), ['radio-pod', 'relay-antennas']],
    [createUSV({ variant: 'multibeam' }), ['multibeam-transducer', 'stern-a-frame']],
    [createUSV({ variant: 'relay' }), ['communication-radome', 'directional-antennas', 'communication-rack']],
    [createUSV({ variant: 'debris' }), ['collection-conveyor', 'collection-basket', 'work-beacon']],
    [createUSV({ variant: 'patrol' }), ['observation-tower', 'patrol-radar', 'patrol-camera']],
  ] as const;
  for (const [handle, names] of cases) {
    for (const name of names) { assert.ok(handle.parts[name], name); assert.equal(handle.parts[name], handle.root.getObjectByName(name)); }
    handle.dispose();
  }
});
function validate(root: T.Object3D) {
  const bounds = new T.Box3().setFromObject(root), size = bounds.getSize(new T.Vector3());
  assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
  root.traverse(node => {
    if (node instanceof T.Mesh) {
      assert.ok(Array.from(node.geometry.getAttribute('position').array).every(Number.isFinite));
      assert.ok(Array.from(node.geometry.getAttribute('normal').array).every(Number.isFinite));
    }
  });
}
test('boat hulls are closed two-manifolds, outward wound, with exactly one bow vertex', () => {
  for (const p of Object.values(usvPresets)) {
    const g = createHullGeometry(p.length, p.width, p.depth, p.deck), pos = g.getAttribute('position'), ix = g.index!;
    const maxZ = g.boundingBox!.max.z;
    const tips = Array.from({ length: pos.count }, (_, i) => i).filter(i => Math.abs(pos.getZ(i) - maxZ) < 1e-6);
    assert.equal(tips.length, 1); assert.equal(pos.getX(tips[0]), 0);
    const edges = new Map<string, { n: number; direction: number }>();
    let volume = 0;
    for (let i = 0; i < ix.count; i += 3) {
      const ids = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)];
      const [a, b, c] = ids.map(id => new T.Vector3().fromBufferAttribute(pos, id));
      const cross = b.clone().sub(a).cross(c.clone().sub(a)); assert.ok(cross.length() > 1e-10, 'no zero-area triangles');
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const u = ids[j], v = ids[(j + 1) % 3], key = `${Math.min(u, v)}:${Math.max(u, v)}`;
        const edge = edges.get(key) ?? { n: 0, direction: 0 }; edge.n++; edge.direction += u < v ? 1 : -1; edges.set(key, edge);
      }
    }
    assert.ok(volume > 0, 'outward winding');
    for (const edge of edges.values()) { assert.equal(edge.n, 2); assert.equal(edge.direction, 0); }
    g.dispose();
  }
});
test('scale, animation and resource ownership are independent of a renderer or DOM', () => {
  const a = createQuadrotor(), b = createQuadrotor({ colors: { primary: '#ff0000' }, scale: 2 });
  const sizeA = new T.Box3().setFromObject(a.root).getSize(new T.Vector3());
  const sizeB = new T.Box3().setFromObject(b.root).getSize(new T.Vector3());
  assert.ok(sizeB.distanceTo(sizeA.multiplyScalar(2)) < 1e-6);
  const ar = a.parts['rotor-front-left'], br = b.parts['rotor-front-left'];
  const beforeA = ar.rotation.y, beforeB = br.rotation.y;
  a.update(0.1, { rotorSpeed: 5 }); assert.ok(Math.abs(ar.rotation.y - beforeA + 0.5) < 1e-10); assert.equal(br.rotation.y, beforeB);
  a.update(0.1); assert.ok(Math.abs(ar.rotation.y - beforeA + 0.5) < 1e-10);
  const am = a.root.getObjectsByProperty('type', 'Mesh') as T.Mesh[], bm = b.root.getObjectsByProperty('type', 'Mesh') as T.Mesh[];
  assert.notEqual(am[0].geometry, bm[0].geometry); assert.notEqual(am[0].material, bm[0].material);
  let disposedA = 0, disposedB = 0;
  am[0].geometry.addEventListener('dispose', () => disposedA++); bm[0].geometry.addEventListener('dispose', () => disposedB++);
  const scene = new T.Scene(); scene.add(a.root, b.root); a.dispose(); a.dispose(); assert.equal(disposedA, 1); assert.equal(disposedB, 0); assert.equal(scene.children.length, 1);
  b.update(0.2, { rotorSpeed: 3 }); validate(b.root); b.dispose(); assert.equal(disposedB, 1);
  const boat = createUSV(); const rotor = boat.parts['propeller-center']; boat.update(0.5, { rotorSpeed: 2 }); assert.equal(rotor.rotation.z, 1); boat.dispose();
});
test('rejects invalid parameters without creating unusable models', () => {
  for (const scale of [0, -1, NaN, Infinity]) { assert.throws(() => createQuadrotor({ scale }), RangeError); assert.throws(() => createUSV({ scale }), RangeError); }
  // @ts-expect-error Runtime validation of untyped callers.
  assert.throws(() => createUSV({ variant: 'catamaran' }), RangeError);
  const h = createQuadrotor(); assert.throws(() => h.update(-1), RangeError); assert.throws(() => h.update(1, { rotorSpeed: Infinity }), RangeError); h.dispose();
});
test('the standalone two-model example runs without the workbench', () => {
  const example = createIndependentScene(); assert.equal(example.scene.children.length, 2);
  example.update(1 / 60); validate(example.drone.root); validate(example.boat.root);
  example.drone.dispose(); assert.equal(example.scene.children.length, 1);
  example.boat.update(1 / 60, { rotorSpeed: 10 }); example.dispose(); assert.equal(example.scene.children.length, 0);
});
