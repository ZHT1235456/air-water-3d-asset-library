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

/** Closed-loop manual helm for the model's actual single or twin propulsion layout.
 * A hull already turning at speed needs to brake before its finite yaw authority can
 * overcome the added-mass coupling. Commands never modify the integrated state. */
export function manualUSVCommand(body: USVDynamics, throttle: number, turn: number, conditions = calmWater()): USVCommand {
  finite([throttle, turn, ...conditions.current, ...conditions.wind]);
  throttle = clamp(throttle, -1, 1); turn = clamp(turn, -1, 1);
  const p = body.profile, s = body.state;
  const [u, v, r] = s.velocity, sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
  const ur = u - sn * conditions.current[0] - cs * conditions.current[1], vr = v - cs * conditions.current[0] + sn * conditions.current[1];
  const relativeWind = cs * conditions.wind[0] - sn * conditions.wind[1] - v;
  const windMoment = p.length * .05 * .6125 * p.windArea[1] * relativeWind * Math.abs(relativeWind);
  const forwardLimit = p.maxThrust, reverseLimit = p.maxThrust * p.reverseRatio;
  const yawAuthority = p.propulsion === 'twin' ? 2 * p.arm * reverseLimit : p.arm * forwardLimit * Math.sin(p.maxSteering);
  const dampingRoot = p.linearDrag[2] + Math.sqrt(p.linearDrag[2] ** 2 + 4 * p.quadraticDrag[2] * yawAuthority * .7);
  const rateLimit = dampingRoot > 0 ? Math.min(.65, 2 * yawAuthority * .7 / dampingRoot) : .65;
  // Right helm is negative yaw. The reference respects this hull's thrust/drag envelope.
  const desiredR = -turn * rateLimit;
  const moment = (p.inertia + p.addedMass[2]) * 4 * (desiredR - r)
    + (p.linearDrag[2] + p.quadraticDrag[2] * Math.abs(r)) * r
    - (p.addedMass[0] - p.addedMass[1]) * ur * vr - windMoment;
  const nominalForce = p.maxThrust * throttle * Math.abs(throttle) * (throttle < 0 ? p.reverseRatio : 1);
  const countersteering = desiredR * r < -.005, yawLimited = Math.abs(moment) > .85 * yawAuthority;
  const slowing = (countersteering || yawLimited) && Math.abs(u) > .25;
  const shaft = (force: number) => Math.sign(force) * Math.sqrt(clamp(Math.abs(force) / (force < 0 ? reverseLimit : forwardLimit), 0, 1));
  if (p.propulsion === 'single-azimuth') {
    // No independent pivot torque: azimuth and thrust share the same physical actuator.
    // Reduce forward power during countersteering; reversing it would also reverse the
    // yaw moment before the slew-limited pod has reached its opposite angle.
    const force = nominalForce * (slowing ? .2 : 1), actual = Math.abs(s.thrust[0]) > .1 ? s.thrust[0] : force;
    const steering = Math.abs(actual) > .01 ? Math.asin(clamp(-moment / (p.arm * actual), -Math.sin(p.maxSteering), Math.sin(p.maxSteering))) : 0;
    return { throttle: [shaft(force)], steering };
  }
  let surge = 2 * nominalForce;
  if (slowing) surge = -Math.sign(u) * Math.min(2 * reverseLimit * .6, (p.mass + p.addedMass[0]) * Math.abs(u) * 1.4);
  const forces = [surge / 2 + moment / (2 * p.arm), surge / 2 - moment / (2 * p.arm)];
  // Scale the whole wrench at actuator saturation, preserving braking direction instead
  // of adding forward thrust just to satisfy an infeasible differential request.
  const scale = Math.min(1, ...forces.map(f => f > forwardLimit ? forwardLimit / f : f < -reverseLimit ? -reverseLimit / f : 1));
  return { throttle: forces.map(f => shaft(f * scale)) };
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
