import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { quadrotorPresets, usvPresets } from '../src/models';
import { gravity, quadrotorProfile, QuadrotorDynamics, QuadrotorController, usvProfile, USVDynamics, steerUSV } from '../src/dynamics';
import { VehicleExperiment } from '../src/dynamics/experiment';

test('marine Coriolis coupling preserves energy; water drag dissipates it', () => {
  const p = usvProfile(); p.linearDrag = p.quadraticDrag = [0, 0, 0]; p.windArea = [0, 0];
  const free = new USVDynamics(p); free.state.velocity = [1, .2, .3]; const initial = free.kineticEnergy;
  for (let i = 0; i < 2000; i++) free.step(.01, { throttle: [0, 0] });
  assert.ok(Math.abs(free.kineticEnergy / initial - 1) < .001);
  const damped = new USVDynamics(usvProfile()); damped.state.velocity = [3, 1, .5]; let previous = damped.kineticEnergy;
  for (let i = 0; i < 1000; i++) { damped.step(.01, { throttle: [0, 0] }); assert.ok(damped.kineticEnergy < previous); previous = damped.kineticEnergy; }
  assert.ok(Math.hypot(...damped.state.velocity) < .5);
});

test('all ten hulls accelerate gradually, coast, and respond to their real actuator layout', () => {
  for (const variant of Object.keys(usvPresets) as (keyof typeof usvPresets)[]) {
    const body = new USVDynamics(usvProfile(variant)), command = { throttle: body.state.thrust.map(() => .8) };
    body.step(.1, command); assert.ok(body.state.velocity[0] > 0 && body.state.velocity[0] < .1, variant);
    for (let i = 0; i < 400; i++) body.step(.02, command);
    const speed = body.state.velocity[0]; body.step(.1, { throttle: command.throttle.map(() => 0) });
    assert.ok(body.state.velocity[0] > speed * .9, 'cutting power must not cancel momentum');
    const turning = { throttle: command.throttle.length === 1 ? [.8] : [.8, -.4], steering: -.3 };
    for (let i = 0; i < 200; i++) body.step(.02, turning);
    assert.ok(body.state.velocity[2] > .02 && Number.isFinite(body.state.yaw), variant);
  }
});

test('uniform current advects a matching vessel without artificial drag, crosswind causes drift', () => {
  const body = new USVDynamics(usvProfile()); body.state.velocity = [1, .4, 0];
  for (let i = 0; i < 1000; i++) body.step(.01, { throttle: [0, 0] }, { current: [.4, 1], wind: [.4, 1] });
  assert.ok(Math.abs(body.state.position[0] - 4) < 1e-8); assert.ok(Math.abs(body.state.position[1] - 10) < 1e-8);
  const blown = new USVDynamics(usvProfile());
  for (let i = 0; i < 500; i++) blown.step(.01, { throttle: [0, 0] }, { current: [0, 0], wind: [8, 0] });
  assert.ok(blown.state.position[0] > .2);
});

test('marine velocity controller reaches target speed without setting velocity or yaw directly', () => {
  const body = new USVDynamics(usvProfile());
  for (let i = 0; i < 2000; i++) body.step(.01, steerUSV(body, [1.5, 2]));
  const v = body.worldVelocity; assert.ok(Math.hypot(v[0] - 1.5, v[1] - 2) < .2);
});

test('quadrotor hover balances gravity, free fall and tilted thrust obey Newton equations', () => {
  const p = quadrotorProfile(); p.linearDrag = p.quadraticDrag = [0, 0, 0];
  const hover = new QuadrotorDynamics(p, [0, 10, 0]), rotor = Math.sqrt(p.mass * gravity / (4 * p.thrustCoefficient));
  hover.state.rotorSpeed.fill(rotor);
  for (let i = 0; i < 1000; i++) hover.step(.005, [rotor, rotor, rotor, rotor], { wind: [0, 0, 0], ground: null });
  assert.ok(Math.abs(hover.state.position[1] - 10) < 1e-9); assert.ok(Math.hypot(...hover.state.angularVelocity) < 1e-10);
  const falling = new QuadrotorDynamics(p, [0, 10, 0]);
  for (let i = 0; i < 100; i++) falling.step(.01, [0, 0, 0, 0], { wind: [0, 0, 0], ground: null });
  assert.ok(Math.abs(falling.state.position[1] - (10 - gravity / 2)) < 1e-8);
  const tilted = new QuadrotorDynamics(p, [0, 10, 0]); tilted.state.quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -.2).toArray(); tilted.state.rotorSpeed.fill(rotor);
  tilted.step(.01, [rotor, rotor, rotor, rotor], { wind: [0, 0, 0], ground: null });
  assert.ok(Math.abs(tilted.state.acceleration[0] - gravity * Math.sin(.2)) < 1e-8);
});

test('all eight quadrotors track a 3D target through motor lag and recover from crosswind', () => {
  for (const variant of Object.keys(quadrotorPresets) as (keyof typeof quadrotorPresets)[]) {
    const body = new QuadrotorDynamics(quadrotorProfile(variant)), control = new QuadrotorController();
    for (let i = 0; i < 5000; i++) body.step(.005, control.command(body, [4, 3, 5], .6, .005), { wind: [i > 2000 ? 4 : 0, 0, 0], ground: 0 });
    assert.ok(Math.hypot(body.state.position[0] - 4, body.state.position[1] - 3, body.state.position[2] - 5) < .15, `${variant}: ${body.state.position}`);
    assert.ok(Math.abs(Math.hypot(...body.state.quaternion) - 1) < 1e-10);
    assert.ok(body.state.rotorSpeed.every(x => x > 0 && x <= body.profile.maxRotorSpeed));
  }
});

test('motor lag, differential rotor torque, landing contact and input rejection', () => {
  const body = new QuadrotorDynamics(quadrotorProfile());
  body.step(.005, [500, 0, 0, 0]); assert.ok(body.state.rotorSpeed[0] > 0 && body.state.rotorSpeed[0] < 100);
  assert.ok(body.state.angularVelocity[0] < 0 && body.state.angularVelocity[2] < 0 && body.state.angularVelocity[1] > 0);
  for (let i = 0; i < 200; i++) body.step(.01, [0, 0, 0, 0]);
  assert.equal(body.state.grounded, true); assert.ok(body.state.position[1] >= body.profile.groundClearance);
  assert.throws(() => body.step(NaN, [0, 0, 0, 0])); assert.throws(() => body.step(.01, [0, 0, 0]));
  assert.throws(() => new QuadrotorDynamics({ ...quadrotorProfile(), mass: 0 }));
  assert.throws(() => new USVDynamics({ ...usvProfile(), linearDrag: [-1, 0, 0] }));
});

test('substepping is deterministic and converges under finer integration', () => {
  const a = new USVDynamics(usvProfile()), b = new USVDynamics(usvProfile()), c = new USVDynamics(usvProfile()), command = { throttle: [.7, .5] };
  for (let i = 0; i < 100; i++) a.step(.1, command);
  for (let i = 0; i < 1000; i++) b.step(.01, command);
  for (let i = 0; i < 2000; i++) c.step(.005, command);
  assert.ok(Math.hypot(a.state.position[0] - b.state.position[0], a.state.position[1] - b.state.position[1]) < 1e-9);
  assert.ok(Math.hypot(a.state.position[0] - c.state.position[0], a.state.position[1] - c.state.position[1]) < .03);
});

test('unphysical parameter combinations fail explicitly before publishing non-finite poses', () => {
  const experiment = new VehicleExperiment('usv', 'patrol', { mass: .1, maxThrust: 5000, motorTimeConstant: .01, dragScale: 0 }, { powered: true, mode: 'manual', throttle: 1, turn: 1, target: [0, 0, 0], yaw: 0, cruise: 3, wind: [0, 0, 0], current: [0, 0] });
  assert.deepEqual(experiment.boat!.profile.addedMass, usvProfile('patrol').addedMass, 'payload changes do not change added fluid mass at fixed immersion');
  assert.throws(() => { for (let i = 0; i < 100; i++) experiment.step(); }, /适用范围|有限/);
  assert.ok([...experiment.snapshot().position, ...experiment.snapshot().quaternion].every(Number.isFinite));
});
