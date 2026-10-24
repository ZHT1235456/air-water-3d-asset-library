import { steerUSV, type USVCommand, type USVDynamics, type WaterConditions } from '../dynamics';
import { clamp, wrap } from '../dynamics/profiles';
import type { Point2 } from '../environments/types';

/** Low-speed force control for holding and final approach. Position PD plus water/air drag
 * compensation sets a force vector; the actual underactuated hull must turn to realise it. */
export function holdUSV(body: USVDynamics, target: Point2, env: WaterConditions, fixedHeading?: number, speedLimit = .6): USVCommand {
  const p = body.profile, s = body.state, [u, v, r] = s.velocity, [vx, vz] = body.worldVelocity, sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
  const scale = Math.min(1, speedLimit / Math.max(1e-9, .12 / .9 * Math.hypot(target[0] - s.position[0], target[1] - s.position[1])));
  const ax = .12 * scale * (target[0] - s.position[0]) - .9 * vx, az = .12 * scale * (target[1] - s.position[1]) - .9 * vz;
  const uc = sn * env.current[0] + cs * env.current[1], vc = cs * env.current[0] - sn * env.current[1];
  const wu = sn * env.wind[0] + cs * env.wind[1] - u, wv = cs * env.wind[0] - sn * env.wind[1] - v;
  const drag = (value: number, index: number) => (p.linearDrag[index] + p.quadraticDrag[index] * Math.abs(value)) * value;
  const forward = (p.mass + p.addedMass[0]) * (sn * ax + cs * az) + drag(u - uc, 0) + (p.addedMass[0] - p.addedMass[1]) * (v - vc) * r - .6125 * p.windArea[0] * wu * Math.abs(wu);
  const port = (p.mass + p.addedMass[1]) * (cs * ax - sn * az) + drag(v - vc, 1) + (p.addedMass[0] - p.addedMass[1]) * (u - uc) * r - .6125 * p.windArea[1] * wv * Math.abs(wv);
  // A small-force deadband prevents a nearly stationary hull from chasing a noisy force angle.
  let heading = fixedHeading ?? (Math.hypot(forward, port) > 2 ? s.yaw + Math.atan2(port, forward) : s.yaw);
  if (fixedHeading === undefined && Math.abs(wrap(heading - s.yaw)) > Math.PI / 2) heading += Math.PI;
  // Low-speed operations use a 0.08 rad/s yaw-rate reference, below the hold acceptance limit.
  const desiredR = clamp(1.3 * wrap(heading - s.yaw), -.08, .08);
  const moment = (p.inertia + p.addedMass[2]) * 3 * (desiredR - r) + drag(r, 2) - (p.addedMass[0] - p.addedMass[1]) * (u - uc) * (v - vc) - p.length * .05 * .6125 * p.windArea[1] * wv * Math.abs(wv);
  const throttle = (force: number) => Math.sign(force) * Math.sqrt(clamp(Math.abs(force) / (p.maxThrust * (force < 0 ? p.reverseRatio : 1)), 0, 1));
  if (p.propulsion === 'twin') {
    const differential = clamp(moment / (2 * p.arm), -p.maxThrust * .6, p.maxThrust * .6);
    const common = clamp(forward / 2, -p.maxThrust * p.reverseRatio + Math.abs(differential), p.maxThrust - Math.abs(differential));
    return { throttle: [throttle(common + differential), throttle(common - differential)] };
  }
  // One azimuth thruster cannot create independent force and yaw moment at zero thrust.
  if (Math.abs(forward) < 1 && Math.abs(moment) > 1) return steerUSV(body, [sn * .2, cs * .2], env);
  const steering = Math.abs(forward) > .01 ? clamp(Math.atan(-moment / (p.arm * forward)), -p.maxSteering, p.maxSteering) : 0;
  return { throttle: [throttle(forward / Math.cos(steering))], steering };
}
