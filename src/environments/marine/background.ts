import * as T from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { marineConfig } from './config';

/** View-owned HDR resources: cancellable application, local asset, shared lighting orientation. */
export function createMarineBackground(renderer: T.WebGLRenderer, scene: T.Scene, onReady: (sun: T.Vector3, horizon: T.Color, sky: T.DataTexture) => void, onError: () => void, settings = marineConfig.sky) {
  let disposed = false, sky: T.DataTexture | undefined, filtered: T.WebGLRenderTarget | undefined;
  const ready = new HDRLoader().setDataType(T.FloatType).loadAsync(settings.url).then(texture => {
    if (disposed) { texture.dispose(); return; }
    sky = texture; sky.mapping = T.EquirectangularReflectionMapping;
    const image = sky.image as { data: Float32Array; width: number; height: number };
    // Use the panorama's brightest upper-hemisphere pixel to align the directional sun.
    let brightest = -1, sx = image.width / 2, sy = image.height * .35;
    for (let y = Math.floor(image.height * .03); y < image.height * .48; y++) for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4, value = image.data[i] * .2126 + image.data[i + 1] * .7152 + image.data[i + 2] * .0722;
      if (value > brightest) { brightest = value; sx = x; sy = y; }
    }
    const longitude = (sx / image.width - .5) * 2 * Math.PI, latitude = (.5 - sy / image.height) * Math.PI;
    const sun = new T.Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)).applyAxisAngle(new T.Vector3(0, 1, 0), settings.rotation);
    const generator = new T.PMREMGenerator(renderer); filtered = generator.fromEquirectangular(sky); generator.dispose();
    scene.background = sky; scene.environment = filtered.texture;
    scene.backgroundRotation.set(0, settings.rotation, 0); scene.environmentRotation.copy(scene.backgroundRotation);
    scene.backgroundIntensity = .75; scene.environmentIntensity = .65;
    const horizon = new T.Color(0, 0, 0);
    for (let x = 0; x < image.width; x++) {
      const i = (Math.floor(image.height * .49) * image.width + x) * 4;
      horizon.r += image.data[i]; horizon.g += image.data[i + 1]; horizon.b += image.data[i + 2];
    }
    horizon.multiplyScalar(.75 / image.width);
    sky.userData.backgroundRotation = settings.rotation;
    onReady(sun, horizon, sky);
  }).catch(() => { if (!disposed) onError(); });
  return { ready, dispose() { disposed = true; sky?.dispose(); filtered?.dispose(); } };
}
