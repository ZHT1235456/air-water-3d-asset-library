import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExperiment, ExperimentSimulation, NavigationDomain } from '../src/algorithms';
import { missionIds } from '../src/algorithms/missions';
import type { ExperimentConfig, MissionId } from '../src/algorithms/types';
import type { SpatialData } from '../src/environments/types';
import { usvPresets } from '../src/models';

const water: SpatialData = { units: 'metres', waterLevel: 0, bounds: { minX: -250, maxX: 250, minZ: -250, maxZ: 250 }, water: [{ outer: [[-250, -250], [250, -250], [250, 250], [-250, 250]], holes: [] }], obstacles: [], flight: { minY: 0, maxY: 100 }, spawnPoints: [] };
const config = (algorithm: MissionId, overrides: Partial<ExperimentConfig> = {}): ExperimentConfig => ({ algorithm, motion: 'dynamics', vehicle: 'survey', start: [0, 0], goal: [70, 55], fleetSize: 3, speed: 2, spacing: 12, gain: .35, gridSize: 10, radius: 2.2, minY: -.5, maxY: 2, formation: 'wedge', coverageWidth: 120, coverageHeight: 72, laneSpacing: 15, mission: { duration: 30, dwellTime: 2, laps: 1, targetSpeed: .65 }, ...overrides });
const run = (c: ExperimentConfig, limit = 12000) => {
  const domain = new NavigationDomain(water, c), plan = buildExperiment(water, c), s = new ExperimentSimulation(plan, domain);
  for (let i = 0; i < limit && !['complete', 'blocked', 'timeout'].includes(s.status); i++) s.step();
  return s;
};

for (const algorithm of missionIds) test(`${algorithm}: completes a physical mission with finite thrust, replay and safe vessel separation`, () => {
  const s = run(config(algorithm, ['los', 'docking'].includes(algorithm) ? { start: [-70, -50] } : algorithm === 'station' ? { current: [.15, .05], wind: [2, -1] } : {}));
  assert.equal(s.status, 'complete', `${algorithm}: ${s.status}, ${s.stopReason}, t=${s.time}, ${JSON.stringify(s.currentFrame().mission)}, ${JSON.stringify(s.vessels)}`);
  assert.ok(s.time > 5 && s.distance > 0);
  assert.ok(s.minSeparation >= 2 * s.plan.config.radius);
  assert.ok(s.bodies.every(b => b.state.thrust.every(Number.isFinite)));
  assert.ok(s.frames[1].vessels[0].dynamics);
  assert.equal(s.currentFrame().mission!.progress, 1);
  if (algorithm === 'tracking') assert.ok(s.currentFrame().mission!.rmsError < 2);
  else assert.ok(s.bodies.every(b => Math.hypot(...b.worldVelocity) < .18 && Math.abs(b.state.velocity[2]) < .12), 'a completed physical task must also have stable terminal motion');
  if (algorithm === 'avoidance') assert.ok(s.currentFrame().mission!.avoidanceCount > 0);
  const frame = structuredClone(s.frames[1]); s.mission!.completed.clear(); assert.deepEqual(s.frames[1], frame);
});

test('sampling logs only continuous low-speed dwell, visits all stations and returns to launch berths', () => {
  const c = config('sampling', { fleetSize: 2 }), domain = new NavigationDomain(water, c), plan = buildExperiment(water, c), s = new ExperimentSimulation(plan, domain);
  for (let k = 0; k < 12000 && s.status !== 'complete'; k++) {
    const before = new Set(s.mission!.completed); s.step();
    for (const id of s.mission!.completed) if (!before.has(id)) {
      const cp = plan.mission!.checkpoints[id];
      assert.ok(s.time >= cp.dwell); assert.ok(Math.hypot(...s.bodies[cp.boat].worldVelocity) < .26); assert.ok(Math.abs(s.bodies[cp.boat].state.velocity[2]) < .12);
      assert.ok(Math.hypot(s.vessels[cp.boat].position[0] - cp.point[0], s.vessels[cp.boat].position[1] - cp.point[1]) < .7);
    }
  }
  assert.equal(s.status, 'complete'); assert.equal(s.mission!.completed.size, 12);
  s.vessels.forEach((v, i) => assert.ok(Math.hypot(v.position[0] - plan.initial[i][0], v.position[1] - plan.initial[i][1]) < .65));
});

test('mission modes reject kinematic shortcuts, invalid task inputs and unavailable docking approaches', () => {
  assert.throws(() => buildExperiment(water, config('sampling', { motion: 'kinematic' })), /水动力学/);
  assert.throws(() => buildExperiment(water, config('patrol', { mission: { laps: 1.5 } })), /laps/);
  assert.throws(() => buildExperiment(water, config('docking', { goal: [2, 0] })), /进场距离/);
  assert.throws(() => buildExperiment(water, config('avoidance', { fleetSize: 1 })), /2–6/);
});

test('leaving a sampling station, excessive speed or excessive yaw resets continuous dwell', () => {
  const c = config('sampling', { fleetSize: 1 }), plan = buildExperiment(water, c), s = new ExperimentSimulation(plan, new NavigationDomain(water)), cp = plan.mission!.checkpoints[0];
  s.vessels[0].position = [...cp.point]; s.vessels[0].waypoint = cp.routeIndex; s.bodies[0].state.position = [...cp.point];
  const tick = () => s.mission!.update(s.vessels, s.bodies, 0, .1);
  for (let i = 0; i < 10; i++) tick(); assert.ok(s.mission!.dwell[0] > .9 && !s.mission!.completed.has(0));
  s.vessels[0].position[0] += 1; tick(); assert.equal(s.mission!.dwell[0], 0);
  s.vessels[0].position = [...cp.point]; s.bodies[0].state.velocity = [.4, 0, 0]; tick(); assert.equal(s.mission!.dwell[0], 0);
  s.bodies[0].state.velocity = [0, 0, .2]; tick(); assert.equal(s.mission!.dwell[0], 0);
  s.bodies[0].state.velocity = [0, 0, 0]; for (let i = 0; i < 21; i++) tick(); assert.ok(s.mission!.completed.has(0));
});

test('all ten actual propulsion profiles can follow a channel and settle at its endpoint', () => {
  for (const vehicle of Object.keys(usvPresets) as (keyof typeof usvPresets)[]) {
    const s = run(config('los', { vehicle, start: [-30, -20], goal: [40, 30] }), 3000);
    assert.equal(s.status, 'complete', `${vehicle}: ${s.status}, ${s.time}, ${JSON.stringify(s.vessels)}`);
    assert.ok(Math.hypot(...s.bodies[0].worldVelocity) < .18 && Math.abs(s.bodies[0].state.velocity[2]) < .12);
  }
});
