import { Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, duration, finite, gravity, positive, type QuadrotorProfile, type Quat, type Vec3 } from './profiles';

/** Order matches geometry: front-left, front-right, rear-left, rear-right. */
export const rotorSpin = [-1, 1, 1, -1] as const;
export interface QuadrotorState { time: number; position: Vec3; velocity: Vec3; quaternion: Quat; angularVelocity: Vec3; rotorSpeed: number[]; rotorPhase: number[]; thrust: number[]; acceleration: Vec3; grounded: boolean }
export interface AirConditions { wind: Vec3; /** Flat ground height; null disables contact. */ ground: number | null }
export const calmAir = (): AirConditions => ({ wind: [0, 0, 0], ground: 0 });
export class QuadrotorDynamics {
  readonly profile: QuadrotorProfile;
  readonly state: QuadrotorState;
  constructor(profile: QuadrotorProfile, position: Vec3 = [0, profile.groundClearance, 0]) {
    positive([profile.mass, ...profile.inertia, profile.armX, profile.armZ, profile.maxRotorSpeed, profile.thrustCoefficient, profile.torqueRatio, profile.motorTimeConstant, profile.groundClearance]);
    finite([...profile.linearDrag, ...profile.quadraticDrag, ...profile.angularDrag, ...position]);
    if ([...profile.linearDrag, ...profile.quadraticDrag, ...profile.angularDrag].some(x => x < 0)) throw new RangeError('阻尼系数须非负');
    this.profile = structuredClone(profile);
    this.state = { time: 0, position: [...position], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1], angularVelocity: [0, 0, 0], rotorSpeed: [0, 0, 0, 0], rotorPhase: [0, 0, 0, 0], thrust: [0, 0, 0, 0], acceleration: [0, -gravity, 0], grounded: false };
  }
  snapshot(): QuadrotorState { return structuredClone(this.state); }
  get maxRotorThrust() { return this.profile.thrustCoefficient * this.profile.maxRotorSpeed ** 2; }
  step(dt: number, targetRotorSpeed: number[], env = calmAir()) {
    duration(dt); finite([...targetRotorSpeed, ...env.wind, ...(env.ground === null ? [] : [env.ground])]);
    if (targetRotorSpeed.length !== 4) throw new RangeError('四旋翼需要四个电机转速指令');
    const n = Math.ceil(dt / .005), h = dt / n, p = this.profile, s = this.state;
    for (let k = 0; k < n; k++) {
      s.rotorSpeed.forEach((omega, i) => {
        s.rotorSpeed[i] += (clamp(targetRotorSpeed[i], 0, p.maxRotorSpeed) - omega) * (1 - Math.exp(-h / p.motorTimeConstant));
        s.thrust[i] = p.thrustCoefficient * s.rotorSpeed[i] ** 2;
        s.rotorPhase[i] = (s.rotorPhase[i] + rotorSpin[i] * s.rotorSpeed[i] * h) % (2 * Math.PI);
      });
      const torque = new Vector3();
      s.thrust.forEach((f, i) => { torque.x -= (i < 2 ? p.armZ : -p.armZ) * f; torque.z += (i % 2 === 0 ? -p.armX : p.armX) * f; torque.y -= rotorSpin[i] * p.torqueRatio * f; });
      const omega = new Vector3(...s.angularVelocity), inertia = new Vector3(...p.inertia), q = new Quaternion(...s.quaternion);
      const angularAcceleration = (w: Vector3) => torque.clone().sub(w.clone().cross(w.clone().multiply(inertia))).sub(w.clone().multiply(new Vector3(...p.angularDrag))).divide(inertia);
      const midOmega = omega.clone().addScaledVector(angularAcceleration(omega), h / 2), nextOmega = omega.clone().addScaledVector(angularAcceleration(midOmega), h);
      const rotation = (step: number) => new Quaternion().setFromAxisAngle(midOmega.clone().normalize(), midOmega.length() * step);
      const midQ = q.clone().multiply(rotation(h / 2)).normalize();
      // Drag in body axes, based on air-relative velocity. Lift is always along body +Y.
      const relative = new Vector3(...s.velocity).sub(new Vector3(...env.wind)).applyQuaternion(midQ.clone().conjugate());
      const drag = relative.toArray().map((v, i) => -(p.linearDrag[i] + p.quadraticDrag[i] * Math.abs(v)) * v);
      const acceleration = new Vector3(...drag).add(new Vector3(0, s.thrust.reduce((a, b) => a + b, 0), 0)).applyQuaternion(midQ).divideScalar(p.mass).add(new Vector3(0, -gravity, 0));
      finite([...acceleration.toArray(), ...nextOmega.toArray()]);
      if (nextOmega.length() > 200 || new Vector3(...s.velocity).addScaledVector(acceleration, h).length() > 200) throw new RangeError('动力学积分超出适用范围，请恢复参数或减小步长');
      s.position = new Vector3(...s.position).addScaledVector(new Vector3(...s.velocity), h).addScaledVector(acceleration, .5 * h * h).toArray();
      s.velocity = new Vector3(...s.velocity).addScaledVector(acceleration, h).toArray(); s.acceleration = acceleration.toArray();
      s.quaternion = q.multiply(rotation(h)).normalize().toArray(); s.angularVelocity = nextOmega.toArray(); s.grounded = false;
      if (env.ground !== null && s.position[1] < env.ground + p.groundClearance) {
        // Flat, non-bouncing landing-gear contact; this is a contact approximation, not a crash model.
        s.position[1] = env.ground + p.groundClearance; s.velocity[1] = Math.max(0, s.velocity[1]);
        s.velocity[0] *= Math.exp(-8 * h); s.velocity[2] *= Math.exp(-8 * h);
        s.angularVelocity = s.angularVelocity.map(v => v * Math.exp(-12 * h)) as Vec3; s.grounded = true;
      }
      s.time += h;
    }
  }
}

/** Cascaded position → velocity → quaternion attitude → body-rate control.
 * Simple PI velocity loop with bounded integral and saturation/ground freeze. */
export class QuadrotorController {
  private integral = new Vector3();
  saturated = false;
  command(body: QuadrotorDynamics, target: Vec3, yaw: number, dt: number): number[] {
    duration(dt); finite([...target, yaw]);
    const p = body.profile, s = body.state, q = new Quaternion(...s.quaternion);
    const desiredVelocity = new Vector3(...target).sub(new Vector3(...s.position)).multiplyScalar(.9);
    const horizontal = Math.hypot(desiredVelocity.x, desiredVelocity.z);
    if (horizontal > 6) { desiredVelocity.x *= 6 / horizontal; desiredVelocity.z *= 6 / horizontal; }
    desiredVelocity.y = clamp(desiredVelocity.y, -2, 3);
    const error = desiredVelocity.sub(new Vector3(...s.velocity));
    if (!s.grounded && !this.saturated) this.integral.addScaledVector(error, .4 * dt).clampScalar(-2, 2);
    if (s.grounded) this.integral.set(0, 0, 0);
    const acceleration = error.multiplyScalar(2).add(this.integral), vertical = clamp(acceleration.y, -4, 5) + gravity;
    const maxHorizontal = vertical * Math.tan(35 * Math.PI / 180), length = Math.hypot(acceleration.x, acceleration.z);
    this.saturated = length > maxHorizontal || Math.abs(acceleration.y - (vertical - gravity)) > 1e-6;
    if (length > maxHorizontal) { acceleration.x *= maxHorizontal / length; acceleration.z *= maxHorizontal / length; }
    acceleration.y = vertical;
    const up = acceleration.clone().normalize(), forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = up.clone().cross(forward).normalize(), actualForward = right.clone().cross(up).normalize();
    const desiredQ = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, actualForward));
    const errorQ = q.clone().conjugate().multiply(desiredQ), direction = errorQ.w < 0 ? -1 : 1;
    const rate = new Vector3(errorQ.x, errorQ.y, errorQ.z).multiplyScalar(10 * direction).clampLength(0, 3);
    const omega = new Vector3(...s.angularVelocity), inertia = new Vector3(...p.inertia);
    const moment = rate.sub(omega).multiplyScalar(12).multiply(inertia).add(omega.clone().cross(omega.clone().multiply(inertia)));
    const max = body.maxRotorThrust, requestedCollective = p.mass * acceleration.dot(new Vector3(0, 1, 0).applyQuaternion(q));
    const collective = clamp(requestedCollective / 4, 0, max), corrections = rotorSpin.map((spin, i) => -(i < 2 ? 1 : -1) * moment.x / (4 * p.armZ) + (i % 2 ? 1 : -1) * moment.z / (4 * p.armX) - spin * moment.y / (4 * p.torqueRatio));
    let scale = 1;
    corrections.forEach(c => { if (c > 0) scale = Math.min(scale, (max - collective) / c); if (c < 0) scale = Math.min(scale, -collective / c); });
    this.saturated ||= scale < .999 || Math.abs(collective * 4 - requestedCollective) > 1e-6;
    return corrections.map(c => Math.sqrt(clamp(collective + c * scale, 0, max) / p.thrustCoefficient));
  }
}
