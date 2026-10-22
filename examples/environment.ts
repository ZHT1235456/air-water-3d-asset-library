import { Scene } from 'three';
import { createEnvironment, checkPlacement } from '../src/environments';
import { createQuadrotor, createUSV } from '../src/models';
import { conservativeBounds } from '../src/scenes/config';

/** Standalone composition; consumer supplies renderer, lights and camera. */
export function createEnvironmentExample() {
  const scene = new Scene(), environment = createEnvironment({ variant: 'bridge' });
  const drone = createQuadrotor(), boat = createUSV();
  const droneBounds = conservativeBounds(drone, 'quadrotor-inspection'), boatBounds = conservativeBounds(boat, 'usv-inspection');
  const air = environment.spatial.spawnPoints.find(p => p.kind === 'quadrotor')!;
  const water = environment.spatial.spawnPoints.find(p => p.kind === 'usv')!;
  drone.root.position.set(...air.position); boat.root.position.set(...water.position);
  scene.add(environment.root, drone.root, boat.root);
  return {
    scene, environment, drone, boat,
    issues: [
      ...checkPlacement(environment.spatial, { id: 'drone', kind: 'quadrotor', position: air.position, yaw: 0, bounds: droneBounds }),
      ...checkPlacement(environment.spatial, { id: 'boat', kind: 'usv', position: water.position, yaw: 0, bounds: boatBounds }),
    ],
    update(dt: number) { environment.update(dt); drone.update(dt, { rotorSpeed: 12 }); boat.update(dt, { rotorSpeed: 4 }); },
    dispose() { environment.dispose(); drone.dispose(); boat.dispose(); },
  };
}
