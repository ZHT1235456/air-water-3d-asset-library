import { Quaternion, Vector3 } from 'three';
import type { QuadrotorVariant, USVVariant } from '../models';
import { clamp, duration, finite, quadrotorProfile, usvProfile, type Quat, type Vec3 } from './profiles';
import { QuadrotorController, QuadrotorDynamics } from './quadrotor';
import { steerUSV, USVDynamics, type USVCommand } from './usv';

export interface PhysicalOverrides { mass: number; maxThrust: number; motorTimeConstant: number; dragScale: number }
export interface LabInput { powered: boolean; mode: 'manual' | 'position'; throttle: number; turn: number; target: Vec3; yaw: number; cruise: number; wind: Vec3; current: [number, number] }
export interface DynamicsFrame {
  time: number; kind: 'usv' | 'quadrotor'; position: Vec3; velocity: Vec3; quaternion: Quat; angularVelocity: Vec3;
  rotorSpeed: number[]; rotorAngles: number[]; thrust: number[]; steering: number; grounded: boolean; saturated: boolean;
  input: LabInput; actuatorCommand: number[];
}
export class VehicleExperiment {
  readonly boat?: USVDynamics;
  readonly air?: QuadrotorDynamics;
  private controller = new QuadrotorController();
  private command: number[] = [];
  readonly frames: DynamicsFrame[] = [];
  input: LabInput;
  constructor(readonly kind: 'usv' | 'quadrotor', readonly variant: USVVariant | QuadrotorVariant, overrides: PhysicalOverrides, input: LabInput) {
    finite(Object.values(overrides)); if (overrides.dragScale < 0) throw new RangeError('阻力倍率须非负');
    this.input = structuredClone(input);
    if (kind === 'usv') {
      const p = usvProfile(variant as USVVariant), ratio = overrides.mass / p.mass;
      // Added mass belongs to the fixed immersed hull/fluid, not to the payload mass.
      p.mass = overrides.mass; p.inertia *= ratio;
      p.linearDrag = p.linearDrag.map(x => x * overrides.dragScale) as Vec3; p.quadraticDrag = p.quadraticDrag.map(x => x * overrides.dragScale) as Vec3;
      p.maxThrust = overrides.maxThrust; p.motorTimeConstant = overrides.motorTimeConstant; this.boat = new USVDynamics(p);
    } else {
      const p = quadrotorProfile(variant as QuadrotorVariant), ratio = overrides.mass / p.mass;
      p.mass = overrides.mass; p.inertia = p.inertia.map(x => x * ratio) as Vec3;
      p.linearDrag = p.linearDrag.map(x => x * overrides.dragScale) as Vec3; p.quadraticDrag = p.quadraticDrag.map(x => x * overrides.dragScale) as Vec3;
      p.thrustCoefficient = overrides.maxThrust / p.maxRotorSpeed ** 2; p.motorTimeConstant = overrides.motorTimeConstant; this.air = new QuadrotorDynamics(p);
    }
    this.frames.push(this.snapshot());
  }
  get time() { return (this.boat?.state ?? this.air!.state).time; }
  get profile() { return this.boat?.profile ?? this.air!.profile; }
  snapshot(): DynamicsFrame {
    const base = { time: this.time, kind: this.kind, input: structuredClone(this.input), actuatorCommand: [...this.command] };
    if (this.boat) {
      const s = this.boat.state, v = this.boat.worldVelocity;
      return { ...base, position: [s.position[0], 0, s.position[1]], velocity: [v[0], 0, v[1]], quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), s.yaw).toArray(), angularVelocity: [0, s.velocity[2], 0], rotorSpeed: [...s.propellerSpeed], rotorAngles: s.propellerPhase.map((x, i) => x * (i ? -1 : 1)), thrust: [...s.thrust], steering: s.steering, grounded: false, saturated: this.command.some(x => Math.abs(x) >= .999) };
    }
    const s = this.air!.snapshot();
    return { ...base, position: s.position, velocity: s.velocity, quaternion: s.quaternion, angularVelocity: s.angularVelocity, rotorSpeed: s.rotorSpeed, rotorAngles: s.rotorPhase, thrust: s.thrust, steering: 0, grounded: s.grounded, saturated: this.controller.saturated };
  }
  step(dt = .02) {
    duration(dt); const i = this.input; finite([...i.target, i.yaw, i.throttle, i.turn, i.cruise, ...i.wind, ...i.current]);
    const h = dt / Math.ceil(dt / .005);
    for (let k = 0; k < Math.ceil(dt / .005); k++) {
      if (this.boat) {
        const b = this.boat, env = { current: i.current, wind: [i.wind[0], i.wind[2]] as [number, number] };
        // With +Z bow and +Y up, starboard is -X: a right helm needs negative yaw.
        // Keep the bow-turn request consistent astern; actuator slew/lag still applies.
        const shaftDirection = Math.sign(b.state.propellerSpeed[0]) || Math.sign(i.throttle) || 1;
        let c: USVCommand = b.profile.propulsion === 'single-azimuth'
          ? { throttle: [i.throttle], steering: i.turn * b.profile.maxSteering * shaftDirection }
          : { throttle: [clamp(i.throttle - i.turn * .5, -1, 1), clamp(i.throttle + i.turn * .5, -1, 1)] };
        if (i.mode === 'position') {
          const delta: [number, number] = [i.target[0] - b.state.position[0], i.target[2] - b.state.position[1]], scale = Math.min(.6, i.cruise / Math.max(.001, Math.hypot(...delta)));
          c = steerUSV(b, [delta[0] * scale, delta[1] * scale], env);
        }
        if (!i.powered) c.throttle.fill(0);
        this.command = [...c.throttle]; b.step(h, c, env);
      } else {
        this.command = i.powered ? this.controller.command(this.air!, i.target, i.yaw, h) : [0, 0, 0, 0];
        this.air!.step(h, this.command, { wind: i.wind, ground: 0 });
      }
    }
    if (this.time - this.frames.at(-1)!.time >= .1 - 1e-7) this.frames.push(this.snapshot());
  }
  resultFrames() { const frames = this.frames.slice(); if (this.time - frames.at(-1)!.time > 1e-7) frames.push(this.snapshot()); else frames[frames.length - 1] = this.snapshot(); return frames; }
}
export function dynamicsCSV(frames: DynamicsFrame[]) {
  const header = 'time_s,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s,qx,qy,qz,qw,wx_rad_s,wy_rad_s,wz_rad_s,rpm_1,rpm_2,rpm_3,rpm_4,thrust_1_N,thrust_2_N,thrust_3_N,thrust_4_N,steering_rad,wind_x_m_s,wind_z_m_s,current_x_m_s,current_z_m_s,target_x_m,target_y_m,target_z_m,powered';
  return [header, ...frames.map(f => [f.time, ...f.position, ...f.velocity, ...f.quaternion, ...f.angularVelocity, ...Array.from({ length: 4 }, (_, i) => f.rotorSpeed[i] === undefined ? '' : f.rotorSpeed[i] * 30 / Math.PI), ...Array.from({ length: 4 }, (_, i) => f.thrust[i] ?? ''), f.steering, f.input.wind[0], f.input.wind[2], ...f.input.current, ...f.input.target, Number(f.input.powered)].map(x => typeof x === 'number' ? x.toFixed(6) : x).join(','))].join('\n');
}
