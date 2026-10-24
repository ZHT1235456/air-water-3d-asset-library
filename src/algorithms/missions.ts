import type { Point2 } from '../environments/types';
import type { USVDynamics } from '../dynamics';
import { distance, NavigationDomain, pathLength, pointSegmentDistance } from './navigation';
import { GridPlanner } from './pathfinding';
import type { Checkpoint, ExperimentConfig, ExperimentPlan, MissionFrame, MissionId, MissionOptions, VesselState } from './types';

export const missionIds: MissionId[] = ['los', 'patrol', 'sampling', 'search', 'tracking', 'station', 'docking', 'avoidance'];
export const isMission = (id: string): id is MissionId => missionIds.includes(id as MissionId);
export const singleVessel = (id: string) => ['astar', 'dijkstra', 'los', 'docking'].includes(id);
export const usesArea = (id: string) => ['coverage', 'patrol', 'sampling', 'search', 'tracking', 'avoidance'].includes(id);
export const usesGoal = (id: string) => ['astar', 'dijkstra', 'leader', 'los', 'docking'].includes(id);
/** A convenient initial centre; planning still validates every individual route and berth. */
export function suggestMissionCentre(domain: NavigationDomain, near: Point2, width: number, height: number, radius: number): Point2 | undefined {
  for (const range of [0, 40, 80, 120, 180, 260, 400, 600]) for (let j = 0; j < (range ? 24 : 1); j++) {
    const c: Point2 = [near[0] + range * Math.cos(j * Math.PI / 12), near[1] + range * Math.sin(j * Math.PI / 12)];
    const corners: Point2[] = [[c[0] - width / 2, c[1] - height / 2], [c[0] + width / 2, c[1] - height / 2], [c[0] + width / 2, c[1] + height / 2], [c[0] - width / 2, c[1] + height / 2]];
    if (corners.every((p, i) => domain.segmentClear(p, corners[(i + 1) % 4], radius + 5)) && domain.segmentClear(corners[0], corners[2], radius + 5) && domain.segmentClear(corners[1], corners[3], radius + 5)) return c;
  }
}
export function missionOptions(c: ExperimentConfig): MissionOptions {
  return { lookahead: 8, dwellTime: 4, laps: 2, duration: 60, targetSpeed: .8, ...c.mission };
}
const copy = (p: Point2): Point2 => [...p];
const offset = (p: Point2, x: number, z: number): Point2 => [p[0] + x, p[1] + z];
export const capVelocity = (v: Point2, speed: number): Point2 => { const k = Math.min(1, speed / Math.max(1e-9, Math.hypot(...v))); return [v[0] * k, v[1] * k]; };

/** Deterministic mission planning. Every transit is checked against the same full vessel envelope. */
export function buildMission(plan: ExperimentPlan, domain: NavigationDomain, planner: GridPlanner) {
  const c = plan.config, kind = c.algorithm as MissionId, options = missionOptions(c);
  const m = plan.mission = { kind, options, checkpoints: [] } as NonNullable<ExperimentPlan['mission']>;
  if (c.motion === 'kinematic') throw new Error('任务演示必须使用水动力学，无法选择运动学基线');
  for (const [key, min, max] of [['lookahead', 1, 40], ['dwellTime', 1, 60], ['laps', 1, 5], ['duration', 10, 300], ['targetSpeed', .1, 2]] as const) {
    if (!Number.isFinite(options[key]) || options[key] < min || options[key] > max || (key === 'laps' && !Number.isInteger(options[key]))) throw new Error(`${key} 应在 ${min}–${max} 之间${key === 'laps' ? '，且为整数' : ''}`);
  }
  const connect = (a: Point2, b: Point2): Point2[] => {
    if (domain.segmentClear(a, b, c.radius + 1)) return [copy(a), copy(b)];
    const result = planner.search(a, b); plan.expanded += result.expanded; plan.gridCost += result.gridCost; return result.path;
  };
  const append = (boat: number, point: Point2, label?: string, dwell = 0) => {
    const route = plan.routes[boat]; route.push(...connect(route.at(-1)!, point).slice(1));
    if (label) m.checkpoints.push({ point: copy(point), boat, routeIndex: route.length - 1, dwell, label });
  };
  const launch = (p: Point2) => { plan.initial.push(copy(p)); plan.routes.push([copy(p)]); };
  if (kind === 'los' || kind === 'docking') {
    launch(c.start);
    if (kind === 'docking') {
      const d = distance(c.start, c.goal), approach = Math.max(15, c.radius * 7);
      if (d < approach * 1.5) throw new Error(`靠泊起点距离不足，请预留至少 ${(approach * 1.5).toFixed(0)} m 进场距离`);
      const dx = (c.goal[0] - c.start[0]) / d, dz = (c.goal[1] - c.start[1]) / d;
      const staging = offset(c.goal, -dx * approach, -dz * approach);
      if (!domain.segmentClear(staging, c.goal, c.radius + 1)) throw new Error('靠泊最后进场航段受阻，请将泊位移到有直线进场空间的水面');
      append(0, staging, '进场点'); append(0, c.goal, '靠泊确认', options.dwellTime); m.dockYaw = Math.atan2(dx, dz);
    } else append(0, c.goal, '航道终点');
  } else if (kind === 'station') {
    for (let i = 0; i < c.fleetSize; i++) {
      const target = offset(c.start, (i - (c.fleetSize - 1) / 2) * c.spacing, 0);
      launch(offset(target, 0, -3)); append(i, target, '驻留点', options.duration);
    }
  } else if (kind === 'tracking') {
    const rx = c.coverageWidth * .22, rz = c.coverageHeight * .22;
    m.area = { centre: copy(c.start), width: c.coverageWidth, height: c.coverageHeight };
    m.target = { centre: copy(c.start), radii: [rx, rz], omega: options.targetSpeed / Math.max(rx, rz), offsets: [] };
    for (let i = 0; i < c.fleetSize; i++) {
      const o: Point2 = [(i - (c.fleetSize - 1) / 2) * c.spacing, -Math.max(12, c.spacing)]; m.target.offsets.push(o);
      const samples = Array.from({ length: 49 }, (_, j) => offset(c.start, rx * Math.cos(j * Math.PI / 24) + o[0], rz * Math.sin(j * Math.PI / 24) + o[1]));
      if (samples.some((p, j) => !domain.segmentClear(p, samples[(j + 1) % samples.length], c.radius + 3))) throw new Error('伴随轨迹及艇群偏移靠近岸线，请移动任务中心、缩小区域或减少艇数');
      launch(samples[0]); plan.routes[i] = samples; plan.targets.push(copy(samples[0]));
    }
  } else if (kind === 'avoidance') {
    if (c.fleetSize < 2 || c.fleetSize > 6) throw new Error('交汇避碰任务需要 2–6 艘艇');
    const r = Math.min(c.coverageWidth, c.coverageHeight) * .4;
    m.area = { centre: copy(c.start), width: c.coverageWidth, height: c.coverageHeight };
    for (let i = 0; i < c.fleetSize; i++) {
      const a = 2 * Math.PI * i / c.fleetSize, p = offset(c.start, r * Math.cos(a), r * Math.sin(a));
      launch(p); append(i, offset(c.start, -r * Math.cos(a), -r * Math.sin(a)), '交汇出口');
    }
  } else {
    const stripe = c.coverageWidth / c.fleetSize, margin = Math.max(5, c.radius * 2);
    if (stripe < 2 * margin + 8) throw new Error('任务分区过窄，请增大区域宽度或减少艇数');
    m.area = { centre: copy(c.start), width: c.coverageWidth, height: c.coverageHeight };
    for (let boat = 0; boat < c.fleetSize; boat++) {
      const centre = offset(c.start, -c.coverageWidth / 2 + stripe * (boat + .5), 0), rx = stripe / 2 - margin, rz = c.coverageHeight / 2 - margin;
      if (rz < 5) throw new Error('任务区域高度过小');
      if (kind === 'patrol') {
        const corners = [offset(centre, -rx, -rz), offset(centre, -rx, rz), offset(centre, rx, rz), offset(centre, rx, -rz)];
        launch(corners[0]);
        for (let lap = 0; lap < options.laps; lap++) for (let j = 1; j <= 4; j++) append(boat, corners[j % 4], `巡逻 ${lap + 1} 圈 / ${j} 号检查点`);
      } else if (kind === 'sampling') {
        const base = offset(centre, 0, -rz); launch(base);
        const pending: Point2[] = [];
        for (const x of [-rx, rx]) for (const z of [-rz * .55, 0, rz * .8]) {
          const p = offset(centre, x, z);
          if (domain.contains(p, c.radius + 1)) pending.push(p); else plan.excludedSamples++;
        }
        if (!pending.length) throw new Error(`第 ${boat + 1} 个分区没有可达采样站`);
        // Partition by launch sector, then nearest-neighbour ordering within each sector.
        while (pending.length) {
          const here = plan.routes[boat].at(-1)!; pending.sort((a, b) => distance(here, a) - distance(here, b));
          append(boat, pending.shift()!, `采样 ${m.checkpoints.filter(p => p.boat === boat).length + 1}`, options.dwellTime);
        }
        append(boat, base); // Return to the actual launch berth after collecting every assigned sample.
      } else {
        launch(centre);
        for (let ring = 1; ring <= 3; ring++) for (const [x, z] of [[rx, -rz], [rx, rz], [-rx, rz], [-rx, -rz]]) {
          const p = offset(centre, x * ring / 3, z * ring / 3);
          if (domain.contains(p, c.radius + 1)) append(boat, p, `搜索环 ${ring}`); else plan.excludedSamples++;
        }
        if (plan.routes[boat].length < 2) throw new Error('没有可达搜索航段，请移动任务中心');
      }
    }
  }
  if (!plan.targets.length) plan.targets = plan.routes.map(r => copy(r.at(-1)!));
  plan.routeLength = plan.routes.reduce((s, r) => s + pathLength(r), 0);
}

export function movingReference(plan: ExperimentPlan, time: number): { position: Point2; velocity: Point2 } | undefined {
  const t = plan.mission?.target; if (!t) return;
  const a = time * t.omega;
  return { position: offset(t.centre, t.radii[0] * Math.cos(a), t.radii[1] * Math.sin(a)), velocity: [-t.radii[0] * t.omega * Math.sin(a), t.radii[1] * t.omega * Math.cos(a)] };
}

/** State machine driven only by the integrated physical state, including continuous low-speed dwell. */
export class MissionRuntime {
  readonly completed = new Set<number>();
  readonly dwell: number[];
  readonly phases: string[];
  private errorIntegral = 0;
  private errorTime = 0;
  maxError = 0;
  work = 0;
  avoidanceCount = 0;
  holdingTime = 0;
  constructor(readonly plan: ExperimentPlan) {
    this.dwell = plan.initial.map(() => 0); this.phases = plan.initial.map(() => '航行');
  }
  private activeCheckpoint(i: number, waypoint: number): Checkpoint | undefined {
    return this.plan.mission!.checkpoints.find((p, j) => p.boat === i && p.routeIndex === waypoint && !this.completed.has(j));
  }
  guidance(vessels: VesselState[], bodies: USVDynamics[], time: number, domain: NavigationDomain): Point2[] {
    const c = this.plan.config, m = this.plan.mission!, reference = movingReference(this.plan, time);
    return vessels.map((v, i) => {
      if (reference) {
        this.phases[i] = '目标伴随'; const o = m.target!.offsets[i];
        return capVelocity([reference.velocity[0] + .6 * (reference.position[0] + o[0] - v.position[0]), reference.velocity[1] + .6 * (reference.position[1] + o[1] - v.position[1])], c.speed);
      }
      const route = this.plan.routes[i];
      while (v.waypoint < route.length - 1 && distance(v.position, route[v.waypoint]) < .65 && !this.activeCheckpoint(i, v.waypoint)) v.waypoint++;
      const end = route[v.waypoint], start = route[Math.max(0, v.waypoint - 1)], dist = distance(v.position, end), cp = this.activeCheckpoint(i, v.waypoint);
      const docking = m.kind === 'docking' && v.waypoint === route.length - 1;
      this.phases[i] = this.dwell[i] > 0 ? (m.kind === 'sampling' ? '低速采样' : m.kind === 'station' ? '抗扰驻留' : '靠泊确认') : docking ? '低速进场' : m.kind === 'sampling' && !cp && v.waypoint === route.length - 1 ? '返航' : '航行';
      const dx = end[0] - start[0], dz = end[1] - start[1], length = Math.hypot(dx, dz), along = length ? Math.max(0, Math.min(length, ((v.position[0] - start[0]) * dx + (v.position[1] - start[1]) * dz) / length)) : 0;
      let look = Math.min(length, along + m.options.lookahead), target: Point2 = length ? offset(start, dx * look / length, dz * look / length) : end;
      // Shorten LOS when its direct chord would cut an inflated bank or obstacle.
      for (let k = 0; k < 6 && !domain.segmentClear(v.position, target, c.radius); k++) { look = (look + along) / 2; target = length ? offset(start, dx * look / length, dz * look / length) : end; }
      if (dist < m.options.lookahead || m.kind === 'station') target = end;
      return capVelocity([.65 * (target[0] - v.position[0]), .65 * (target[1] - v.position[1])], Math.min(c.speed, docking ? .55 : Infinity, Math.max(.08, dist * .65)));
    });
  }
  update(vessels: VesselState[], bodies: USVDynamics[], time: number, dt: number) {
    const m = this.plan.mission!, ref = movingReference(this.plan, time);
    let errors = 0;
    vessels.forEach((v, i) => {
      const speed = Math.hypot(...bodies[i].worldVelocity), route = this.plan.routes[i], end = route[v.waypoint];
      const error = ref ? distance(v.position, offset(ref.position, ...m.target!.offsets[i])) : m.kind === 'station' ? distance(v.position, this.plan.targets[i]) : pointSegmentDistance(v.position, route[Math.max(0, v.waypoint - 1)], end);
      errors += error * error; this.maxError = Math.max(this.maxError, error);
      const body = bodies[i], [u, sway, r] = body.state.velocity, t = body.state.thrust, p = body.profile;
      // Absolute thrust work at the actual mounting points, including yaw motion; not battery energy.
      this.work += (p.propulsion === 'twin'
        ? Math.abs(t[0] * (u + p.arm * r)) + Math.abs(t[1] * (u - p.arm * r))
        : Math.abs(t[0] * (Math.cos(body.state.steering) * u + Math.sin(body.state.steering) * (sway - p.arm * r)))) * dt;
      const cp = this.activeCheckpoint(i, v.waypoint);
      if (!cp) {
        this.dwell[i] = 0;
        if (v.waypoint === route.length - 1 && distance(v.position, this.plan.targets[i]) < .65 && speed < .18 && Math.abs(bodies[i].state.velocity[2]) < .12) this.phases[i] = '任务完成';
        return;
      }
      const headingError = m.dockYaw === undefined ? 0 : Math.abs(Math.atan2(Math.sin(bodies[i].state.yaw - m.dockYaw), Math.cos(bodies[i].state.yaw - m.dockYaw)));
      const valid = distance(v.position, cp.point) < (m.kind === 'station' ? 1.2 : .65) && (!cp.dwell || (speed < (m.kind === 'docking' ? .12 : .25) && Math.abs(bodies[i].state.velocity[2]) < .12)) && headingError < Math.PI / 18;
      this.dwell[i] = valid ? this.dwell[i] + dt : 0;
      if (valid && this.dwell[i] + 1e-8 >= cp.dwell) {
        this.completed.add(m.checkpoints.indexOf(cp)); this.dwell[i] = 0;
        if (v.waypoint < route.length - 1) v.waypoint++;
        else this.phases[i] = '任务完成';
      }
    });
    this.errorIntegral += errors / vessels.length * dt; this.errorTime += dt;
    if (m.kind === 'tracking') this.holdingTime = time;
    else if (m.kind === 'station') this.holdingTime = Math.min(...this.dwell.map((d, i) => this.completed.has(i) ? m.options.duration : d));
  }
  finished(vessels: VesselState[], bodies: USVDynamics[], time: number) {
    const m = this.plan.mission!;
    if (m.kind === 'tracking') return time >= m.options.duration;
    return this.completed.size === m.checkpoints.length && vessels.every((v, i) => distance(v.position, this.plan.targets[i]) < .65 && Math.hypot(...bodies[i].worldVelocity) < .18 && Math.abs(bodies[i].state.velocity[2]) < .12);
  }
  snapshot(time: number): MissionFrame {
    const m = this.plan.mission!;
    return { completed: [...this.completed], dwell: [...this.dwell], phases: [...this.phases], target: movingReference(this.plan, time)?.position,
      progress: m.kind === 'tracking' ? Math.min(1, time / m.options.duration) : m.checkpoints.length ? this.completed.size / m.checkpoints.length : 0,
      rmsError: Math.sqrt(this.errorIntegral / Math.max(1e-9, this.errorTime)), maxError: this.maxError, work: this.work, avoidanceCount: this.avoidanceCount, holdingTime: this.holdingTime };
  }
}
