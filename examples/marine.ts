import * as T from 'three';
import { createEnvironment } from '../src/environments';
import { createMarineBackground } from '../src/environments/marine/background';
import { marineConfig } from '../src/environments/marine/config';
import { createQuadrotor, createUSV } from '../src/models';

/** Consumer owns the renderer and animation loop. Copy public/assets/environment with the module. */
export function createMarineExample(renderer: T.WebGLRenderer) {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(44, 1, .03, 60000);
  const environment = createEnvironment({ variant: 'deepwater' });
  const drone = createQuadrotor(), boat = createUSV(); drone.root.position.y = 10;
  scene.add(environment.root, drone.root, boat.root);
  scene.fog = new T.Fog(marineConfig.fog.color, marineConfig.fog.near, marineConfig.fog.far);
  scene.background = new T.Color(marineConfig.fog.color);
  const sun = new T.DirectionalLight('#fff5df', 2.2); sun.position.set(-500, 500, -800);
  scene.add(sun, new T.HemisphereLight('#e5f3ff', '#667b66', .45));
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = marineConfig.sky.exposure;
  const background = createMarineBackground(renderer, scene, (direction, horizon, sky) => {
    sun.position.copy(direction).multiplyScalar(2400); environment.setSun?.(direction); environment.setHorizon?.(horizon);
    environment.setSky?.(sky);
    (scene.fog as T.Fog).color.copy(horizon);
  }, () => { /* Optional: present a local-asset error to your user. */ });
  camera.position.set(...marineConfig.cameras.establishing.position); camera.lookAt(...marineConfig.cameras.establishing.target);
  return {
    scene, camera, drone, boat, environment, ready: background.ready,
    update(dt: number) {
      environment.setVessels?.([{ id: 'boat', position: boat.root.position.toArray() as [number, number, number], yaw: boat.root.rotation.y, length: 1.8 }]);
      environment.update(dt);
    },
    dispose() { background.dispose(); environment.dispose(); drone.dispose(); boat.dispose(); scene.clear(); },
  };
}
