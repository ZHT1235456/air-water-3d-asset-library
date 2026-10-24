import { clamp, duration, finite, positive, wrap, type USVProfile, type Vec3 } from './profiles';

export interface WaterConditions { current: [number, number]; wind: [number, number] }
export const calmWater = (): WaterConditions => ({ current: [0, 0], wind: [0, 0] });
export interface USVState {
  time: number; position: [number, number]; yaw: number;
  /** Absolute body velocities: forward +Z, port +X, yaw about +Y (port turn). */
  velocity: Vec3; propellerSpeed: number[]; propellerPhase: number[]; thrust: number[]; steering: number;
}
export interface USVCommand {
  /** Signed shaft speed / maximum shaft speed. Twin order: -X (starboard), +X (port). */
  throttle: number[];
  /** Single stern thruster azimuth about +Y; ignored by fixed twin thrusters. */
  steering?: number;
}

/** Fossen planar equations with diagonal added mass. Integrates absolute body velocity;
 * water-relative velocity is used for added-mass Coriolis terms and damping.
 * Current is uniform and steady during each step. Positive yaw turns +Z toward +X. */
export class USVDynamics {
  readonly state: USVState;
  readonly profile: USVProfile;
  constructor(profile: USVProfile, position: [number, number] = [0, 0], yaw = 0) {
    positive([profile.mass, profile.inertia, profile.arm, profile.length, profile.beam, profile.maxThrust, profile.motorTimeConstant, profile.maxPropellerSpeed, profile.maxSteering, profile.steeringRate, profile.reverseRatio]);
    finite([...profile.addedMass, ...profile.linearDrag, ...profile.quadraticDrag, ...profile.windArea, ...position, yaw]);
    if ([...profile.addedMass, ...profile.linearDrag, ...profile.quadraticDrag, ...profile.windArea].some(x => x < 0) || profile.reverseRatio > 1) throw new RangeError('附加质量、阻尼及迎风面积须非负，倒车系数须 ≤ 1');
    this.profile = structuredClone(profile);
    const count = profile.propulsion === 'single-azimuth' ? 1 : 2;
    this.state = { time: 0, position: [...position], yaw, velocity: [0, 0, 0], propellerSpeed: Array(count).fill(0), propellerPhase: Array(count).fill(0), thrust: Array(count).fill(0), steering: 0 };
  }
  get worldVelocity(): [number, number] { const [u, v] = this.state.velocity, a = this.state.yaw; return [Math.sin(a) * u + Math.cos(a) * v, Math.cos(a) * u - Math.sin(a) * v]; }
  get kineticEnergy() { const p = this.profile, [u, v, r] = this.state.velocity; return .5 * ((p.mass + p.addedMass[0]) * u * u + (p.mass + p.addedMass[1]) * v * v + (p.inertia + p.addedMass[2]) * r * r); }
  snapshot(): USVState { return structuredClone(this.state); }
  step(dt: number, command: USVCommand, conditions = calmWater()) {
    duration(dt); finite([...command.throttle, command.steering ?? 0, ...conditions.current, ...conditions.wind]);
    if (command.throttle.length !== this.state.thrust.length) throw new RangeError('推进器指令数量不匹配');
    const n = Math.ceil(dt / .01), h = dt / n, p = this.profile, s = this.state;
    for (let k = 0; k < n; k++) {
      s.steering = p.propulsion === 'single-azimuth'
        ? s.steering + clamp(clamp(command.steering ?? 0, -p.maxSteering, p.maxSteering) - s.steering, -p.steeringRate * h, p.steeringRate * h)
        : 0;
      s.propellerSpeed.forEach((omega, i) => {
        s.propellerSpeed[i] += (clamp(command.throttle[i], -1, 1) * p.maxPropellerSpeed - omega) * (1 - Math.exp(-h / p.motorTimeConstant));
        const ratio = s.propellerSpeed[i] / p.maxPropellerSpeed;
        s.thrust[i] = p.maxThrust * ratio * Math.abs(ratio) * (ratio < 0 ? p.reverseRatio : 1);
        s.propellerPhase[i] = (s.propellerPhase[i] + s.propellerSpeed[i] * h) % (2 * Math.PI);
      });
      const f = p.propulsion === 'twin' ? [s.thrust[0] + s.thrust[1], 0, p.arm * (s.thrust[0] - s.thrust[1])] : [s.thrust[0] * Math.cos(s.steering), s.thrust[0] * Math.sin(s.steering), -p.arm * s.thrust[0] * Math.sin(s.steering)];
      // Explicit midpoint for the coupled hydrodynamics, with held actuator force.
      const y = [...s.position, s.yaw, ...s.velocity], a = this.derivative(y, f, conditions);
      const b = this.derivative(y.map((v, i) => v + a[i] * h / 2), f, conditions);
      finite(b);
      if (Math.hypot(y[3] + b[3] * h, y[4] + b[4] * h) > 50 || Math.abs(y[5] + b[5] * h) > 20) throw new RangeError('动力学积分超出适用范围，请降低推力、恢复质量或减小步长');
      s.position = [y[0] + b[0] * h, y[1] + b[1] * h]; s.yaw = wrap(y[2] + b[2] * h);
      s.velocity = [y[3] + b[3] * h, y[4] + b[4] * h, y[5] + b[5] * h]; s.time += h;
    }
  }
  private derivative(y: number[], force: number[], env: WaterConditions) {
    const p = this.profile, a = y[2], [u, v, r] = y.slice(3), sn = Math.sin(a), cs = Math.cos(a);
    const uc = sn * env.current[0] + cs * env.current[1], vc = cs * env.current[0] - sn * env.current[1], ur = u - uc, vr = v - vc;
    const wu = sn * env.wind[0] + cs * env.wind[1] - u, wv = cs * env.wind[0] - sn * env.wind[1] - v;
    const windX = .6125 * p.windArea[0] * wu * Math.abs(wu), windY = .6125 * p.windArea[1] * wv * Math.abs(wv);
    const drag = [ur, vr, r].map((x, i) => (p.linearDrag[i] + p.quadraticDrag[i] * Math.abs(x)) * x), [au, av, ar] = p.addedMass;
    return [sn * u + cs * v, cs * u - sn * v, r,
      (force[0] + windX - drag[0] + p.mass * v * r + av * vr * r + au * r * vc) / (p.mass + au),
      (force[1] + windY - drag[1] - p.mass * u * r - au * ur * r - av * r * uc) / (p.mass + av),
      (force[2] + p.length * .05 * windY - drag[2] + (au - av) * ur * vr) / (p.inertia + ar)];
  }
}

/** Velocity-to-thrust controller. No direct changes to vehicle position or heading. */
export function steerUSV(body: USVDynamics, desiredVelocity: [number, number], conditions = calmWater(), options: { allowReverse?: boolean } = {}): USVCommand {
  finite(desiredVelocity);
  const p = body.profile, s = body.state, [u, , r] = s.velocity, speed = Math.hypot(...desiredVelocity);
  let heading = speed > .015 ? Math.atan2(desiredVelocity[0], desiredVelocity[1]) : s.yaw, sign = 1;
  // Reversible propulsion avoids an artificial 180° heading jump near a station-keeping target.
  if (options.allowReverse !== false && Math.abs(wrap(heading - s.yaw)) > Math.PI / 2) { heading = wrap(heading + Math.PI); sign = -1; }
  const error = wrap(heading - s.yaw), desiredU = sign * speed * Math.max(0, Math.cos(error)) ** 2;
  const relativeU = u - Math.sin(s.yaw) * conditions.current[0] - Math.cos(s.yaw) * conditions.current[1];
  let x = (p.mass + p.addedMass[0]) * 1.1 * (desiredU - u) + (p.linearDrag[0] + p.quadraticDrag[0] * Math.abs(relativeU)) * relativeU;
  const desiredR = clamp(1.5 * error, -.65, .65), moment = (p.inertia + p.addedMass[2]) * 3 * (desiredR - r) + (p.linearDrag[2] + p.quadraticDrag[2] * Math.abs(r)) * r;
  const throttle = (f: number) => Math.sign(f) * Math.sqrt(clamp(Math.abs(f) / (p.maxThrust * (f < 0 ? p.reverseRatio : 1)), 0, 1));
  if (p.propulsion === 'twin') {
    // Reserve yaw authority by reducing surge before saturating the individual shafts.
    const differential = clamp(moment / (2 * p.arm), -p.maxThrust * .75, p.maxThrust * .75);
    const common = clamp(x / 2, -p.maxThrust * p.reverseRatio + Math.abs(differential), p.maxThrust - Math.abs(differential));
    return { throttle: [throttle(common + differential), throttle(common - differential)] };
  }
  // The inspection hull has one steerable stern thruster; it cannot pivot in place.
  if (speed > .015 && Math.abs(error) > .15) x = sign * Math.max(Math.abs(x), p.maxThrust * .22);
  const steering = Math.abs(x) > .01 ? clamp(Math.atan(-moment / (p.arm * x)), -p.maxSteering, p.maxSteering) : 0;
  return { throttle: [throttle(x / Math.cos(steering))], steering };
}
