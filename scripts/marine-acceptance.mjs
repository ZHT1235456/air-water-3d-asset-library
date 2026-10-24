import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/marine', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const report = { date: new Date().toISOString(), errors: [], memory: [], cameras: [], remoteRequests: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('request', r => { if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:5173')) report.remoteRequests.push(r.url()); });
async function skyReady() { await page.waitForFunction(() => document.querySelector('#env-sky-status')?.textContent === '360° HDR · CC0'); }
async function saveScene(name) {
  await page.waitForTimeout(180);
  const image = await page.evaluate(() => window.__environmentWorkbench.renderer.domElement.toDataURL('image/png'));
  await writeFile(`artifacts/marine/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
}
async function measure(moving = false) {
  return page.evaluate(async moving => {
    const frames = []; let last;
    for (let i = 0; i < 130; i++) { if (moving) window.__environmentWorkbench.camera.position.x += .1; const t = await new Promise(requestAnimationFrame); if (i > 10) frames.push(t - last); last = t; }
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length, sorted = frames.toSorted((a, b) => a - b);
    const r = window.__environmentWorkbench.renderer, gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { vehicles: window.__environmentWorkbench.runtime.vehicles.length, meanMs: mean, p95Ms: sorted[Math.floor(sorted.length * .95)], fps: 1000 / mean,
      drawCallsIncludingReflection: r.info.render.calls, trianglesIncludingReflection: r.info.render.triangles, memory: { ...r.info.memory },
      movingCamera: moving, viewport: [r.domElement.width, r.domElement.height], gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), browser: navigator.userAgent };
  }, moving);
}
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#mode-environments').click(); await skyReady();
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('deepwater')); await skyReady();
  assert.equal(await page.locator('[data-env]').count(), 5);
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.flatMap(v => v.issues)), []);
  await page.locator('#env-immersive').click();
  for (const shot of ['establishing', 'context', 'waterline', 'aerial']) {
    await page.locator('#env-camera').selectOption(shot); await saveScene(shot);
    report.cameras.push(await page.evaluate(() => { const e = window.__environmentWorkbench; return { position: e.camera.position.toArray(), fov: e.camera.fov }; }));
  }
  await page.locator('#env-camera').selectOption('establishing');
  await page.screenshot({ path: 'artifacts/marine/workbench.png' });
  report.twoVehicles = await measure();
  // Full orbit has a real panorama and 3D coast; no limited-angle photograph is used.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(i => { const e = window.__environmentWorkbench, a = i * Math.PI / 2; e.camera.position.set(Math.sin(a) * 1250, 140, Math.cos(a) * 1250); e.camera.lookAt(-100, 30, -350); }, i);
    await saveScene(`orbit-${i}`);
  }
  await page.locator('#env-immersive').click();
  await page.locator('[data-instance="v2"]').click();
  assert.ok(await page.locator('#env-pos-y').isDisabled());
  await page.locator('#env-pos-x').fill('20'); await page.locator('#env-pos-x').press('Tab');
  await page.locator('#env-yaw').fill('135'); await page.locator('#env-yaw').press('Tab');
  await page.locator('#env-color-accent').fill('#cf723a');
  await page.locator('#env-camera').selectOption('context');
  const original = await page.evaluate(() => window.__environmentWorkbench.snapshot());
  await page.evaluate(c => window.__environmentWorkbench.importText(JSON.stringify(c)), original); await skyReady();
  const after = await page.evaluate(() => window.__environmentWorkbench.snapshot());
  assert.deepEqual(after.vehicles, original.vehicles); assert.equal(after.view.fov, original.view.fov);
  const unchanged = await page.evaluate(() => {
    const e = window.__environmentWorkbench, text = JSON.stringify(e.snapshot());
    try { const c = e.snapshot(); c.vehicles[0].modelId = 'missing'; e.importText(JSON.stringify(c)); } catch { /* expected */ }
    return text === JSON.stringify(e.snapshot());
  }); assert.ok(unchanged);
  await page.locator('#env-flag-waterAnimation').uncheck();
  const waterTime = () => page.evaluate(() => window.__environmentWorkbench.runtime.environment.root.getObjectByName('water-0').material.uniforms.time.value);
  const t = await waterTime(); await page.waitForTimeout(220); assert.equal(await waterTime(), t);
  await page.locator('#env-flag-waterAnimation').check();
  await page.locator('[data-instance="v1"]').click(); await page.locator('#env-rotate').click();
  // TransformControls writes a quaternion; yaw > 90 degrees must not flip when converted to Euler angles.
  const yaw = await page.evaluate(() => {
    const e = window.__environmentWorkbench, root = e.transform.object;
    root.quaternion.set(0, Math.sin(3 * Math.PI / 8), 0, Math.cos(3 * Math.PI / 8)); e.transform.dispatchEvent({ type: 'objectChange' });
    return root.rotation.y;
  }); assert.ok(Math.abs(yaw - 3 * Math.PI / 4) < 1e-6);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('lake')); await page.waitForTimeout(100);
    await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('deepwater')); await skyReady(); await page.waitForTimeout(220);
    report.memory.push(await page.evaluate(() => ({ ...window.__environmentWorkbench.renderer.info.memory })));
  }
  assert.deepEqual(report.memory[0], report.memory[2]);
  const ids = ['quadrotor-survey','quadrotor-heavy','quadrotor-protected','quadrotor-rescue','quadrotor-cargo','usv-survey','usv-utility','usv-rescue','usv-sampling','usv-endurance'];
  for (const id of ids) await page.evaluate(id => window.__environmentWorkbench.addVehicle(id), id);
  await page.locator('#env-immersive').click(); await page.locator('#env-camera').selectOption('establishing');
  report.twelveVehicles = await measure(); await saveScene('twelve-vehicles');
  report.twelveVehiclesMovingCamera = await measure(true);
  await page.locator('#env-camera').selectOption('context'); report.twelveVehicleCloseup = await measure();
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#env-camera').selectOption('context'); await page.waitForTimeout(220);
  await page.screenshot({ path: 'artifacts/marine/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(report.remoteRequests, []); assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (e) { report.result = 'failed'; report.failure = String(e); throw e; }
finally { await writeFile('artifacts/marine/acceptance.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
