import type { Point2, SpatialData } from '../environments/types';
import { distance, NavigationDomain, pathLength, sweptSeparation } from './navigation';
import { GridPlanner } from './pathfinding';
import type { ExperimentConfig, ExperimentPlan, Formation, Frame, RunStatus, VesselState } from './types';

export function formationOffsets(n: number, spacing: number, formation: Formation, yaw = 0): Point2[] {
  return Array.from({ length: n }, (_, i) => {
    const rank = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
    const x = formation === 'column' ? 0 : side * rank * spacing;
    const z = formation === 'wedge' ? -rank * spacing : formation === 'column' ? -i * spacing : 0;
    return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  });
}
function centroid(points: Point2[]): Point2 { return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]; }
const add = (a: Point2, b: Point2): Point2 => [a[0] + b[0], a[1] + b[1]];
const clone = (p: Point2): Point2 => [...p];
function validate(c: ExperimentConfig) {
  if (!['astar', 'dijkstra', 'leader', 'consensus', 'coverage'].includes(c.algorithm)) throw new Error('未知算法');
  if (!['wedge', 'column', 'line'].includes(c.formation)) throw new Error('未知队形');
  if (![c.start, c.goal].every(p => p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 1e6))) throw new Error('起终点坐标无效');
  if (!Number.isInteger(c.fleetSize) || c.fleetSize < 1 || c.fleetSize > 12) throw new Error('艇数应为 1–12');
  for (const [key, min, max] of [['speed', 0.1, 15], ['spacing', 2, 100], ['gain', 0.01, 2], ['gridSize', 1, 1000], ['radius', 0.1, 30], ['coverageWidth', 10, 2000], ['coverageHeight', 10, 2000], ['laneSpacing', 2, 200]] as const) {
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 应在 ${min}–${max} 之间`);
  }
  if (!Number.isFinite(c.minY) || !Number.isFinite(c.maxY) || c.minY > c.maxY) throw new Error('载具高度包络无效');
  if (c.fleetSize > 1 && c.spacing <= c.radius * 2 + 0.1) throw new Error('编队间距须大于两个安全包络半径');
}
export function buildExperiment(spatial: SpatialData, input: ExperimentConfig): ExperimentPlan {
  validate(input);
  const c = structuredClone(input);
  if (c.algorithm === 'astar' || c.algorithm === 'dijkstra') c.fleetSize = 1;
  const domain = new NavigationDomain(spatial, c), planner = new GridPlanner(domain, c.gridSize, c.radius);
  const plan: ExperimentPlan = { config: c, initial: [], routes: [], offsets: [], targets: [], samples: [], excludedSamples: 0, expanded: 0, gridCost: 0, routeLength: 0 };
  const record = (a: Point2, b: Point2, p = planner) => {
    const result = p.search(a, b, c.algorithm === 'dijkstra' ? 'dijkstra' : 'astar');
    plan.expanded += result.expanded; plan.gridCost += result.gridCost;
    return result.path;
  };
  if (c.algorithm === 'astar' || c.algorithm === 'dijkstra') {
    plan.initial = [clone(c.start)]; plan.routes = [record(c.start, c.goal)]; plan.targets = [clone(c.goal)];
  } else if (c.algorithm === 'leader') {
    const yaw = Math.atan2(c.goal[0] - c.start[0], c.goal[1] - c.start[1]);
    plan.offsets = formationOffsets(c.fleetSize, c.spacing, c.formation, yaw);
    // A fixed-heading formation fits inside this circle throughout each straight segment.
    const envelope = c.radius + Math.max(...plan.offsets.map(p => Math.hypot(...p))) * 1.08;
    const route = record(c.start, c.goal, new GridPlanner(domain, c.gridSize, envelope));
    // An 8% initial expansion makes the controller's error correction observable.
    plan.initial = plan.offsets.map(p => add(c.start, [p[0] * 1.08, p[1] * 1.08]));
    plan.routes = plan.offsets.map((p, i) => i === 0 ? route.map(clone) : [clone(plan.initial[i]), ...route.map(q => add(q, p))]);
    plan.targets = plan.offsets.map(p => add(c.goal, p));
  } else if (c.algorithm === 'consensus') {
    const offsets = formationOffsets(c.fleetSize, c.spacing, c.formation), centre = centroid(offsets);
    plan.offsets = offsets.map(p => [p[0] - centre[0], p[1] - centre[1]]);
    plan.targets = plan.offsets.map(p => add(c.start, p));
    plan.initial = plan.offsets.map(p => add(c.start, [p[0] * 1.5, p[1] * 1.5]));
    plan.routes = plan.initial.map((p, i) => [clone(p), clone(plan.targets[i])]);
    if (plan.routes.some(r => !domain.segmentClear(r[0], r[1], c.radius))) throw new Error('一致性编队的初始或目标位置受阻，请移到开阔水域或减小编队间距');
  } else {
    const stripeWidth = c.coverageWidth / c.fleetSize;
    if (stripeWidth <= 2 * c.radius + 1) throw new Error('覆盖分区过窄，请增大覆盖宽度或减少艇数');
    const cols = Math.max(1, Math.ceil(stripeWidth / c.laneSpacing)), rows = Math.max(2, Math.ceil(c.coverageHeight / c.laneSpacing) + 1);
    if (cols * rows * c.fleetSize > 1500) throw new Error('覆盖采样点超过 1,500 个，请增大航线间距或缩小覆盖区');
    for (let boat = 0; boat < c.fleetSize; boat++) {
      const samples: Point2[] = [];
      for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) {
        const point: Point2 = [c.start[0] - c.coverageWidth / 2 + boat * stripeWidth + (col + 0.5) * stripeWidth / cols,
          c.start[1] - c.coverageHeight / 2 + (col % 2 ? rows - row - 1 : row) * c.coverageHeight / (rows - 1)];
        if (domain.contains(point, c.radius)) { samples.push(point); plan.samples.push({ point, boat }); } else plan.excludedSamples++;
      }
      if (!samples.length) throw new Error(`第 ${boat + 1} 个覆盖分区没有可通航采样点，请移动中心或缩小覆盖区`);
      const route = [clone(samples[0])];
      for (const point of samples.slice(1)) {
        const last = route[route.length - 1];
        if (domain.segmentClear(last, point, c.radius)) route.push(clone(point));
        else route.push(...record(last, point).slice(1));
      }
      plan.initial.push(clone(samples[0])); plan.routes.push(route); plan.targets.push(clone(route[route.length - 1]));
    }
  }
  for (let i = 0; i < plan.initial.length; i++) {
    if (!domain.contains(plan.initial[i], c.radius)) throw new Error(`第 ${i + 1} 艘艇初始位置不可通航`);
    for (let j = 0; j < i; j++) if (distance(plan.initial[i], plan.initial[j]) <= c.radius * 2) throw new Error('初始艇间距不足，请增大间距或覆盖宽度');
  }
  plan.routeLength = plan.routes.reduce((sum, route) => sum + pathLength(route), 0);
  return plan;
}

export class ExperimentSimulation {
  readonly vessels: VesselState[];
  readonly frames: Frame[] = [];
  readonly visited = new Set<number>();
  status: RunStatus = 'ready';
  time = 0;
  minSeparation = Infinity;
  blockedSteps = 0;
  private stationaryTime = 0;
  private nextSampleTime = 0.5;
  constructor(readonly plan: ExperimentPlan, readonly domain: NavigationDomain) {
    this.vessels = plan.initial.map((p, i) => ({ id: `usv-${String(i + 1).padStart(2, '0')}`, position: clone(p), yaw: 0, distance: 0, waypoint: plan.routes[i].length > 1 ? 1 : 0 }));
    this.measure(); this.capture();
  }
  get formationError() {
    if (!['leader', 'consensus'].includes(this.plan.config.algorithm)) return 0;
    const q = this.vessels.map((v, i) => [v.position[0] - this.plan.offsets[i][0], v.position[1] - this.plan.offsets[i][1]] as Point2);
    const reference = this.plan.config.algorithm === 'leader' ? q[0] : centroid(q);
    return Math.sqrt(q.reduce((s, p) => s + distance(p, reference) ** 2, 0) / q.length);
  }
  get distance() { return this.vessels.reduce((sum, v) => sum + v.distance, 0); }
  get coverage() { return this.plan.samples.length ? this.visited.size / this.plan.samples.length : 0; }
  private measure() {
    for (let i = 0; i < this.vessels.length; i++) for (let j = 0; j < i; j++) this.minSeparation = Math.min(this.minSeparation, distance(this.vessels[i].position, this.vessels[j].position));
    this.plan.samples.forEach(({ point, boat }, i) => { if (distance(this.vessels[boat].position, point) < 0.6) this.visited.add(i); });
  }
  private capture() { this.frames.push({ time: this.time, vessels: this.vessels.map(v => ({ position: clone(v.position), yaw: v.yaw })) }); }
  /** Fixed-step integration; callers schedule wall time separately. No renderer or DOM required. */
  step(dt = 0.1) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('积分步长须为 (0, 0.1] 秒');
    if (['complete', 'blocked', 'timeout'].includes(this.status)) return;
    this.status = 'running';
    const c = this.plan.config, old = this.vessels.map(v => clone(v.position));
    const limit = (dx: number, dz: number, speed = c.speed): Point2 => { const norm = Math.hypot(dx, dz), k = norm ? Math.min(1, speed * dt / norm) : 0; return [dx * k, dz * k]; };
    const routeMove = (i: number, speed = c.speed): Point2 => {
      const v = this.vessels[i], route = this.plan.routes[i];
      while (v.waypoint < route.length - 1 && distance(v.position, route[v.waypoint]) < 1e-6) v.waypoint++;
      const target = route[v.waypoint];
      return limit(target[0] - v.position[0], target[1] - v.position[1], speed);
    };
    let moves: Point2[];
    if (c.algorithm === 'consensus') {
      const q = old.map((p, i) => [p[0] - this.plan.offsets[i][0], p[1] - this.plan.offsets[i][1]] as Point2), mean = centroid(q);
      const raw = q.map(p => [c.gain * (mean[0] - p[0]) * dt, c.gain * (mean[1] - p[1]) * dt] as Point2);
      const scale = Math.min(1, c.speed * dt / Math.max(1e-12, ...raw.map(p => Math.hypot(...p))));
      // Common scaling preserves the mean of q while enforcing every speed bound.
      moves = raw.map(p => [p[0] * scale, p[1] * scale]);
    } else if (c.algorithm === 'leader') {
      // Reserve speed headroom for followers to remove tracking error.
      const leader = routeMove(0, c.speed * 0.75);
      moves = old.map((p, i) => i === 0 ? leader : limit(leader[0] + c.gain * (old[0][0] + this.plan.offsets[i][0] - p[0]) * dt,
        leader[1] + c.gain * (old[0][1] + this.plan.offsets[i][1] - p[1]) * dt));
    } else moves = old.map((_, i) => routeMove(i));
    const next = old.map((p, i) => add(p, moves[i]));
    const stopped = new Set<number>();
    for (let i = 0; i < next.length; i++) if (!this.domain.segmentClear(old[i], next[i], c.radius)) { next[i] = clone(old[i]); stopped.add(i); }
    // Stopping one vessel can conflict with another proposed move; iterate until stable.
    for (let pass = 0; pass < next.length; pass++) {
      let changed = false;
      for (let i = 0; i < next.length; i++) for (let j = 0; j < i; j++) {
        if (sweptSeparation(old[i], next[i], old[j], next[j]) < 2 * c.radius + 1e-7) {
          for (const k of [i, j]) if (!stopped.has(k)) { next[k] = clone(old[k]); stopped.add(k); changed = true; }
        }
      }
      if (!changed) break;
    }
    let moved = 0;
    for (let i = 0; i < next.length; i++) {
      const v = this.vessels[i], d = distance(old[i], next[i]); moved += d; v.distance += d;
      if (d > 1e-8) v.yaw = Math.atan2(next[i][0] - old[i][0], next[i][1] - old[i][1]);
      v.position = next[i];
      for (let j = 0; j < i; j++) this.minSeparation = Math.min(this.minSeparation, sweptSeparation(old[i], next[i], old[j], next[j]));
    }
    this.time += dt; this.measure();
    if (stopped.size) this.blockedSteps++;
    const done = c.algorithm === 'consensus' ? this.formationError < 0.15 : this.vessels.every((v, i) => distance(v.position, this.plan.targets[i]) < 0.05);
    if (done && (c.algorithm !== 'coverage' || this.visited.size === this.plan.samples.length)) this.status = 'complete';
    this.stationaryTime = moved < 1e-5 ? this.stationaryTime + dt : 0;
    if (this.status !== 'complete' && this.stationaryTime >= 10) this.status = 'blocked';
    if (this.status === 'running' && this.time >= 1800) this.status = 'timeout';
    if (this.time + 1e-7 >= this.nextSampleTime || this.status !== 'running') { this.capture(); this.nextSampleTime = this.time + 0.5; }
  }
}

export function trajectoryCSV(frames: Frame[]) {
  const rows = ['time_s,vessel_id,x_m,z_m,yaw_rad'];
  for (const frame of frames) frame.vessels.forEach((v, i) => rows.push([frame.time.toFixed(3), `usv-${String(i + 1).padStart(2, '0')}`, ...v.position.map(n => n.toFixed(4)), v.yaw.toFixed(6)].join(',')));
  return rows.join('\n');
}
