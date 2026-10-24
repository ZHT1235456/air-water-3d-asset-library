import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/environments', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const report = { scenes: [], memory: [], errors };
async function verifyLabels() {
  const result = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('.env-vehicle-label')).filter(n => !n.hidden).map(n => n.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
    }
    return { visible: rects.length, overlaps };
  });
  assert.equal(result.visible, 12); assert.equal(result.overlaps, 0);
  return result;
}
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.locator('#mode-environments').click();
  await page.waitForFunction(() => window.__environmentWorkbench?.renderer.info.render.triangles > 1000);
  const variants = ['lake', 'river', 'harbor', 'islands', 'bridge', 'waterfront'];
  for (const variant of variants) {
    await page.evaluate(variant => window.__environmentWorkbench.switchEnvironment(variant), variant); await page.waitForTimeout(250);
    await page.locator('#env-camera').selectOption('establishing'); await page.waitForTimeout(120);
    await page.screenshot({ path: `artifacts/environments/${variant}-overview.png` });
    await page.locator('#env-camera').selectOption('top'); await page.waitForTimeout(120);
    await page.screenshot({ path: `artifacts/environments/${variant}-top.png` });
    report.scenes.push(await page.evaluate(() => {
      const e = window.__environmentWorkbench;
      return { variant: e.runtime.config.environment.variant, vehicles: e.runtime.vehicles.length, issues: e.runtime.vehicles.flatMap(v => v.issues), geometries: e.renderer.info.memory.geometries, calls: e.renderer.info.render.calls };
    }));
    assert.deepEqual(report.scenes.at(-1).issues, []);
  }
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('bridge'));
  await page.locator('[data-instance="v2"]').click();
  await page.locator('#env-focus').click(); await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/environments/bridge-boat-close.png' });
  assert.equal(await page.locator('#env-pos-y').isDisabled(), true);
  // The boat can pass under the deck, but not through a pier.
  await page.locator('#env-pos-x').fill('0'); await page.locator('#env-pos-x').press('Tab');
  await page.locator('#env-pos-z').fill('0'); await page.locator('#env-pos-z').press('Tab');
  assert.equal(await page.locator('#env-issues').getAttribute('class'), '');
  await page.locator('#env-pos-z').fill('43'); await page.locator('#env-pos-z').press('Tab');
  assert.match(await page.locator('#env-issues').textContent(), /桥墩/);
  await page.locator('#env-pos-z').fill('0'); await page.locator('#env-pos-z').press('Tab');
  await page.locator('[data-instance="v1"]').click();
  await page.locator('#env-pos-x').fill('0'); await page.locator('#env-pos-x').press('Tab');
  await page.locator('#env-pos-y').fill('17'); await page.locator('#env-pos-y').press('Tab');
  await page.locator('#env-pos-z').fill('0'); await page.locator('#env-pos-z').press('Tab');
  assert.match(await page.locator('#env-issues').textContent(), /桥面/);
  await page.locator('#env-flag-obstacles').check();
  await page.locator('#env-camera').selectOption('establishing'); await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/environments/bridge-clearance-data.png' });
  await page.locator('#env-flag-obstacles').uncheck();
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('lake'));
  await page.locator('#env-model-add').selectOption('quadrotor-protected'); await page.locator('#env-add').click();
  assert.equal(await page.locator('[data-instance]').count(), 3);
  await page.locator('#env-pos-x').fill('35'); await page.locator('#env-pos-x').press('Tab');
  await page.locator('#env-pos-y').fill('14'); await page.locator('#env-pos-y').press('Tab');
  await page.locator('#env-yaw').fill('45'); await page.locator('#env-yaw').press('Tab');
  await page.locator('#env-color-accent').fill('#3366aa');
  await page.locator('#env-focus').click(); await page.waitForTimeout(180);
  await page.screenshot({ path: 'artifacts/environments/lake-drone-close.png' });
  assert.equal(await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.at(-1).config.colors.accent), '#3366aa');
  // Exercise the actual TransformControls translation gizmo in screen space.
  const beforeDrag = await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.at(-1).config.position);
  const gizmoScreen = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const e = window.__environmentWorkbench, object = e.transform.object, rect = e.renderer.domElement.getBoundingClientRect();
    const center = object.position.clone(), distance = e.camera.position.distanceTo(center);
    const offset = distance * Math.min(1.9 * Math.tan(Math.PI * e.camera.fov / 360) / e.camera.zoom, 7) * e.transform.size / 4;
    const p = center.add(new T.Vector3(offset * 0.5, 0, 0)).project(e.camera);
    return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height };
  });
  await page.mouse.move(gizmoScreen.x, gizmoScreen.y);
  report.gizmoHover = await page.evaluate(() => window.__environmentWorkbench.transform.axis);
  await page.mouse.down();
  report.gizmoDragging = await page.evaluate(() => window.__environmentWorkbench.transform.dragging);
  await page.mouse.move(gizmoScreen.x + 35, gizmoScreen.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(150);
  const afterDrag = await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.at(-1).config.position);
  report.gizmoDragChangedPosition = JSON.stringify(beforeDrag) !== JSON.stringify(afterDrag);
  assert.ok(report.gizmoDragChangedPosition, 'translation gizmo must move the selected object');
  await page.locator('#env-rotate').click();
  assert.equal(await page.evaluate(() => window.__environmentWorkbench.transform.showY), true);
  assert.equal(await page.evaluate(() => window.__environmentWorkbench.transform.showX), false);
  await page.locator('#env-translate').click();
  await page.locator('#env-flag-waterAnimation').uncheck();
  const waterTime = () => page.evaluate(() => window.__environmentWorkbench.runtime.environment.root.getObjectByName('water-0').material.uniforms.time.value);
  const t0 = await waterTime(); await page.waitForTimeout(220); assert.equal(await waterTime(), t0);
  await page.locator('#env-flag-waterAnimation').check(); await page.waitForTimeout(180); assert.ok(await waterTime() > t0);
  const original = await page.evaluate(() => window.__environmentWorkbench.snapshot());
  const downloadEvent = page.waitForEvent('download'); await page.locator('#env-export').click(); const download = await downloadEvent;
  await download.saveAs('artifacts/environments/scene-roundtrip.json');
  await page.locator('#env-delete').click(); assert.equal(await page.locator('[data-instance]').count(), 2);
  await page.locator('#env-file').setInputFiles('artifacts/environments/scene-roundtrip.json'); await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), original.vehicles);
  const bad = Buffer.from(JSON.stringify({ ...original, version: 99 }));
  await page.locator('#env-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: bad });
  await page.waitForTimeout(100); assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), original.vehicles);
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('river')); await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('lake'));
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), original.vehicles);
  await page.locator('#mode-models').click(); assert.equal(await page.locator('[data-model]').count(), 18);
  await page.locator('[data-model="usv-rescue"]').click();
  await page.locator('#mode-environments').click(); assert.equal(await page.locator('[data-instance]').count(), 3);
  // Warm-up overlays then compare resources in exactly the same scene/view state.
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('waterfront'));
  await page.locator('#env-flag-obstacles').check(); await page.waitForTimeout(100); await page.locator('#env-flag-obstacles').uncheck();
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const variant of variants) { await page.evaluate(v => window.__environmentWorkbench.switchEnvironment(v), variant); await page.waitForTimeout(60); }
    await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('waterfront')); await page.waitForTimeout(120);
    report.memory.push(await page.evaluate(() => ({ ...window.__environmentWorkbench.renderer.info.memory })));
  }
  assert.deepEqual(report.memory[0], report.memory.at(-1));
  // Twelve real-size vehicles from the original model set.
  await page.evaluate(() => window.__environmentWorkbench.switchEnvironment('islands'));
  const models = ['quadrotor-survey','quadrotor-heavy','quadrotor-protected','quadrotor-rescue','quadrotor-cargo','usv-survey','usv-utility','usv-rescue','usv-sampling','usv-endurance'];
  for (const id of models) await page.evaluate(id => window.__environmentWorkbench.addVehicle(id), id);
  assert.equal(await page.locator('[data-instance]').count(), 12);
  await page.locator('#env-camera').selectOption('establishing'); await page.waitForTimeout(200);
  report.performance = await page.evaluate(async () => {
    const intervals = []; let previous = performance.now();
    for (let i = 0; i < 90; i++) { const time = await new Promise(requestAnimationFrame); if (i > 5) intervals.push(time - previous); previous = time; }
    const avg = intervals.reduce((a,b) => a+b,0)/intervals.length, sorted = [...intervals].sort((a,b)=>a-b);
    const r = window.__environmentWorkbench.renderer;
    return { vehicles: 12, frameMsMean: avg, frameMsP95: sorted[Math.floor(sorted.length*.95)], approximateFps: 1000/avg, calls: r.info.render.calls, triangles: r.info.render.triangles, memory: r.info.memory, userAgent: navigator.userAgent, note: 'Local headless Edge, 1440×1000 CSS viewport, measured requestAnimationFrame intervals; not a device-independent guarantee.' };
  });
  await page.screenshot({ path: 'artifacts/environments/twelve-vehicles.png' });
  report.desktopLabels = await verifyLabels();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.env-library details').evaluate(el => { el.open = false; }); await page.locator('.env-inspector summary').click();
  await page.locator('#env-camera').selectOption('establishing'); await page.waitForTimeout(180);
  await page.screenshot({ path: 'artifacts/environments/mobile.png', fullPage: true });
  report.mobileLabels = await verifyLabels();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(errors.length, 0, errors.join('\n'));
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = String(error);
  await page.screenshot({ path: 'artifacts/environments/failure.png', fullPage: true }); throw error;
} finally { await writeFile('artifacts/environments/acceptance.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
