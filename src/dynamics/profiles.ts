import { quadrotorPresets, usvPresets } from '../models/presets';
import type { QuadrotorVariant, USVVariant } from '../models/types';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export const gravity = 9.80665;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
export function finite(values: readonly number[]) { if (!values.every(Number.isFinite)) throw new RangeError('动力学参数必须为有限数'); }
export function positive(values: readonly number[]) { finite(values); if (values.some(x => x <= 0)) throw new RangeError('质量、惯量和执行器参数必须大于零'); }
export function duration(dt: number) { if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('时间步长须为 (0, 0.1] 秒'); }
export const parameterBasis = 'engineering-estimate-v1';

export interface USVProfile {
  variant: USVVariant; mass: number; inertia: number; length: number; beam: number;
  addedMass: Vec3; linearDrag: Vec3; quadraticDrag: Vec3;
  propulsion: 'single-azimuth' | 'twin'; arm: number; maxThrust: number; reverseRatio: number;
  motorTimeConstant: number; maxPropellerSpeed: number; maxSteering: number; steeringRate: number;
  windArea: [number, number];
}
const boatMass: Record<USVVariant, number> = { inspection: 35, survey: 85, utility: 180, rescue: 75, sampling: 125, endurance: 190, multibeam: 230, relay: 140, debris: 210, patrol: 280 };
/** Original demonstration hulls: estimates, NOT manufacturer or identified coefficients. */
export function usvProfile(variant: USVVariant = 'survey'): USVProfile {
  if (!Object.hasOwn(usvPresets, variant)) throw new RangeError('未知无人艇动力学配置');
  const p = usvPresets[variant], mass = boatMass[variant], inertia = mass * (p.length ** 2 + p.width ** 2) / 12;
  const single = variant === 'inspection';
  return { variant, mass, inertia, length: p.length, beam: p.width,
    addedMass: [mass * .08, mass * .65, inertia * .35], linearDrag: [mass * .12, mass * .9, inertia * .35], quadraticDrag: [mass * .045, mass * 1.5, inertia * 1.2],
    propulsion: single ? 'single-azimuth' : 'twin', arm: single ? p.length / 2 + .07 : p.width * .24,
    maxThrust: mass * 1.8 / (single ? 1 : 2), reverseRatio: .65, motorTimeConstant: .25, maxPropellerSpeed: 180,
    maxSteering: Math.PI / 5, steeringRate: Math.PI / 4, windArea: [p.width * .5, p.length * .45] };
}
export interface QuadrotorProfile {
  variant: QuadrotorVariant; mass: number; inertia: Vec3; armX: number; armZ: number;
  maxRotorSpeed: number; thrustCoefficient: number; torqueRatio: number; motorTimeConstant: number;
  linearDrag: Vec3; quadraticDrag: Vec3; angularDrag: Vec3; groundClearance: number;
}
const airMass: Record<QuadrotorVariant, number> = { inspection: 2, survey: 4.8, heavy: 14, protected: 1.6, rescue: 6, cargo: 20, multispectral: 5.8, relay: 7 };
export function quadrotorProfile(variant: QuadrotorVariant = 'inspection'): QuadrotorProfile {
  if (!Object.hasOwn(quadrotorPresets, variant)) throw new RangeError('未知无人机动力学配置');
  const p = quadrotorPresets[variant], mass = airMass[variant], maxRotorSpeed = 110 / p.radius;
  return { variant, mass, armX: p.armX, armZ: p.armZ,
    inertia: [mass * (.4 * p.armZ ** 2 + p.body[1] ** 2 / 12), mass * .4 * (p.armX ** 2 + p.armZ ** 2), mass * (.4 * p.armX ** 2 + p.body[1] ** 2 / 12)],
    maxRotorSpeed, thrustCoefficient: mass * gravity * 2.2 / (4 * maxRotorSpeed ** 2), torqueRatio: .045 * p.radius, motorTimeConstant: .055,
    linearDrag: [mass * .09, mass * .12, mass * .09], quadraticDrag: [mass * .018, mass * .028, mass * .018], angularDrag: [mass * .002, mass * .003, mass * .002], groundClearance: p.leg + .025 };
}
