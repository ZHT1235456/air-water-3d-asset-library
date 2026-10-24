import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExperiment, distance, ExperimentSimulation, GridPlanner, NavigationDomain, sweptSeparation, trajectoryCSV } from '../src/algorithms';
import type { ExperimentConfig } from '../src/algorithms';
import type { Point2, SpatialData } from '../src/environments/types';
import { defineEnvironment } from '../src/environments/definitions';
import { createUSV, usvPresets } from '../src/models';
import { conservativeBounds } from '../src/scenes/config';
import { checkPlacement } from '../src/environments/spatial';

const rectangle = (a: number, b: number, c: number, d: number): Point2[] => [[a, b], [c, b], [c, d], [a, d]];
const openWater = (): SpatialData => ({ units: 'metres', waterLevel: 0, bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, water: [{ outer: rectangle(-200, -200, 200, 200), holes: [] }], obstacles: [], flight: { minY: 0, maxY: 100 }, spawnPoints: [] });
const config = (override: Partial<ExperimentConfig> = {}): ExperimentConfig => ({ algorithm: 'astar', start: [-80, 0], goal: [80, 0], fleetSize: 5, speed: 10, spacing: 12, gain: 0.5, gridSize: 10, radius: 2, minY: -1, maxY: 2, formation: 'wedge', coverageWidth: 90, coverageHeight: 60, laneSpacing: 15, ...override });
const run = (spatial: SpatialData, c: ExperimentConfig, steps = 10000) => {
  const plan = buildExperiment(spatial, c), sim = new ExperimentSimulation(plan, new NavigationDomain(spatial, c));
  for (let i = 0; i < steps && !['complete', 'blocked', 'timeout'].includes(sim.status); i++) sim.step();
  return sim;
};

test('A* and Dijkstra agree on optimal graph cost and route around an impassable wall', () => {
  const spatial = openWater(); spatial.obstacles.push({ id: 'wall', name: 'wall', kind: 'pier', color: '#000000', minY: -1, maxY: 4, outer: rectangle(-5, -90, 5, 90), holes: [] });
  const domain = new NavigationDomain(spatial), p = new GridPlanner(domain, 10, 3), start: Point2 = [-80, 0], goal: Point2 = [80, 0];
  assert.equal(domain.segmentClear(start, goal, 3), false);
  const a = p.search(start, goal), d = p.search(start, goal, 'dijkstra');
  assert.ok(Math.abs(a.gridCost - d.gridCost) < 1e-7); assert.ok(a.expanded < d.expanded);
  for (const result of [a, d]) {
    assert.deepEqual(result.path[0], start); assert.deepEqual(result.path.at(-1), goal);
    assert.ok(result.length > distance(start, goal));
    result.path.slice(1).forEach((point, i) => assert.ok(domain.segmentClear(result.path[i], point, 3)));
  }
});
test('water holes, banks, elevated obstacles and swept crossings respect the full envelope', () => {
  const spatial = openWater(); spatial.water[0].holes = [rectangle(-10, -10, 10, 10)];
  spatial.obstacles.push({ id: 'bridge', name: 'bridge', kind: 'bridge', color: '#000000', minY: 1.2, maxY: 2, outer: rectangle(40, -10, 60, 10), holes: [] });
  const domain = new NavigationDomain(spatial, { minY: -1, maxY: 1.5 });
  assert.ok(!domain.contains([0, 0], 2)); assert.ok(!domain.contains([12, 0], 2)); assert.ok(!domain.contains([198, 0], 2));
  assert.ok(!domain.contains([50, 0], 2)); assert.ok(new NavigationDomain(spatial, { minY: -1, maxY: 1 }).contains([50, 0], 2));
  assert.ok(!domain.segmentClear([-20, 0], [20, 0], 2));
  assert.equal(sweptSeparation([-10, 0], [10, 0], [10, 0], [-10, 0]), 0);
});
test('unreachable water components, invalid endpoints and oversized grids fail explicitly', () => {
  const spatial = openWater(); spatial.water = [{ outer: rectangle(-180, -180, -10, 180), holes: [] }, { outer: rectangle(10, -180, 180, 180), holes: [] }];
  const planner = new GridPlanner(new NavigationDomain(spatial), 10, 2);
  assert.throws(() => planner.search([-80, 0], [80, 0]), /未找到/);
  assert.throws(() => planner.search([0, 0], [80, 0]), /起点/);
  assert.throws(() => new GridPlanner(new NavigationDomain(spatial), 0.01, 2), /100,000/);
  assert.throws(() => buildExperiment(spatial, config({ speed: NaN })), /speed/);
});
test('consensus contracts the offset disagreement and preserves non-overlap', () => {
  const c = config({ algorithm: 'consensus', start: [0, 0], fleetSize: 6 });
  const plan = buildExperiment(openWater(), c), sim = new ExperimentSimulation(plan, new NavigationDomain(openWater()));
  const initial = sim.formationError;
  for (let i = 0; i < 2000 && sim.status !== 'complete'; i++) sim.step();
  assert.equal(sim.status, 'complete'); assert.ok(sim.formationError < 0.15); assert.ok(initial > 5);
  assert.ok(sim.minSeparation >= c.radius * 2); assert.ok(sim.time > 0);
  const centre = sim.vessels.reduce((s, v) => [s[0] + v.position[0] / 6, s[1] + v.position[1] / 6], [0, 0]);
  assert.ok(Math.hypot(...centre) < 1e-7, 'common speed scaling preserves centroid');
  for (let i = 1; i < sim.frames.length; i++) sim.frames[i].vessels.forEach((v, j) => assert.ok(distance(v.position, sim.frames[i - 1].vessels[j].position) <= c.speed * (sim.frames[i].time - sim.frames[i - 1].time) + 1e-7));
});
test('leader-follower and coverage finish real routes; coverage counts discrete samples', () => {
  const leader = run(openWater(), config({ algorithm: 'leader', start: [0, 50], goal: [0, -80] }));
  assert.equal(leader.status, 'complete'); assert.ok(leader.formationError < 0.05); assert.ok(leader.distance > 600);
  const coverage = run(openWater(), config({ algorithm: 'coverage', start: [0, 0], fleetSize: 3 }));
  assert.equal(coverage.status, 'complete'); assert.equal(coverage.coverage, 1); assert.ok(coverage.plan.samples.length > 20);
  assert.ok(coverage.minSeparation >= 4); assert.ok(coverage.frames.length > 2);
  const csv = trajectoryCSV(coverage.frames); assert.equal(csv.split('\n').length, coverage.frames.length * 3 + 1); assert.ok(!csv.includes('NaN'));
});
test('continuous collision gate stops exchanging vessels without tunnelling or false completion', () => {
  const c = config({ algorithm: 'coverage', fleetSize: 2, radius: 2, speed: 10 });
  const plan = buildExperiment(openWater(), c);
  plan.initial = [[-10, 0], [10, 0]]; plan.routes = [[[-10, 0], [10, 0]], [[10, 0], [-10, 0]]]; plan.targets = [[10, 0], [-10, 0]]; plan.samples = [];
  const sim = new ExperimentSimulation(plan, new NavigationDomain(openWater()));
  for (let i = 0; i < 500; i++) sim.step();
  assert.equal(sim.status, 'blocked'); assert.ok(sim.minSeparation >= 4); assert.ok(sim.blockedSteps > 0);
  assert.ok(sim.vessels[0].position[0] < sim.vessels[1].position[0]);
});
test('the three real water sites support A* routes and all 10 USV envelopes', () => {
  for (const [variant, goal] of [['westlake', [170, -400]], ['kallang', [-380, 790]], ['waalhaven', [100, -600]]] as const) {
    const spatial = defineEnvironment(variant).spatial, spawn = spatial.spawnPoints.find(p => p.kind === 'usv')!, start: Point2 = [spawn.position[0], spawn.position[2]];
    const c = config({ start, goal: [...goal], radius: 3, gridSize: 25 });
    const plan = buildExperiment(spatial, c); assert.ok(plan.routes[0].length >= 2);
    for (const v of Object.keys(usvPresets) as (keyof typeof usvPresets)[]) {
      const h = createUSV({ variant: v }), bounds = conservativeBounds(h, `usv-${v}`); h.dispose();
      const p = { id: 'boat', kind: 'usv' as const, position: [start[0], 0, start[1]] as [number, number, number], yaw: 0, bounds };
      assert.deepEqual(checkPlacement(spatial, p), [], `${variant}/${v}`);
    }
  }
});
