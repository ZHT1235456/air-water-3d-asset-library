/** A minimal consumer: no imports from the workbench, DOM access or renderer required. */
import { Scene } from 'three';
import { createQuadrotor, createUSV } from '../src/models';

export function createIndependentScene() {
  const scene = new Scene();
  const drone = createQuadrotor({ variant: 'survey', colors: { accent: '#267ca0' } });
  const boat = createUSV({ variant: 'inspection', scale: 1 });
  drone.root.position.set(-1.5, 1.1, 0);
  boat.root.position.set(1, 0, 0);
  scene.add(drone.root, boat.root);
  return {
    scene, drone, boat,
    update(dt: number) { drone.update(dt, { rotorSpeed: 20 }); boat.update(dt, { rotorSpeed: 5 }); },
    dispose() { drone.dispose(); boat.dispose(); },
  };
}
