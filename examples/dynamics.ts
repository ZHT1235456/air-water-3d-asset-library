import { QuadrotorController, QuadrotorDynamics, quadrotorProfile, steerUSV, USVDynamics, usvProfile } from '../src/dynamics';

/** Use the resulting poses and individual rotor phases in any renderer. SI units. */
export function runHover(seconds = 10) {
  const vehicle = new QuadrotorDynamics(quadrotorProfile('survey')), controller = new QuadrotorController();
  const environment = { wind: [4, 0, 0] as [number, number, number], ground: 0 };
  for (let step = 0; step < Math.round(seconds / .005); step++) vehicle.step(.005, controller.command(vehicle, [0, 3, 0], 0, .005), environment);
  return vehicle.snapshot();
}

export function runCruise(seconds = 10) {
  const vehicle = new USVDynamics(usvProfile('survey'));
  const environment = { current: [.3, 0] as [number, number], wind: [2, 0] as [number, number] };
  for (let step = 0; step < Math.round(seconds / .01); step++) vehicle.step(.01, steerUSV(vehicle, [0, 2], environment), environment);
  return vehicle.snapshot();
}
