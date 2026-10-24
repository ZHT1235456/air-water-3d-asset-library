import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder = 'artifacts/ui'; await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const report = { checks: [], errors: [], layouts: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
const check = name => { report.checks.push(name); console.log('PASS', name); };
const ready = async () => {
  await page.waitForFunction(() => window.__algorithmWorkbench && !window.__algorithmWorkbench.busy);
  assert.ok(await page.evaluate(() => !!window.__algorithmWorkbench.plan), await page.locator('#algo-message').innerText());
};
const sky = () => page.waitForFunction(() => document.querySelector('#env-sky-status')?.textContent.includes('HDR'));
const change = async (id, value) => { await page.locator(id).fill(value); await page.locator(id).blur(); };
const download = async (id, name) => { const event = page.waitForEvent('download'); await page.locator(id).click(); const file = await event; await file.saveAs(`${folder}/${name}`); return file.suggestedFilename(); };
const assertPoses = () => page.evaluate(() => {
  const { view, simulation } = window.__algorithmWorkbench;
  return view.models.every((m, i) => Math.abs(m.root.position.x - simulation.vessels[i].position[0]) < 1e-7 && Math.abs(m.root.position.z - simulation.vessels[i].position[1]) < 1e-7 && Math.abs(m.root.rotation.y - simulation.vessels[i].yaw) < 1e-7 && m.root.scale.x === 1);
});
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.locator('#model-search').fill('S-07'); assert.equal(await page.locator('[data-model]:visible').count(), 1);
  await page.locator('[data-model="usv-multibeam"]').click();
  assert.equal(await page.locator('#model-title').innerText(), '多波束测深');
  await page.locator('#model-search').fill('不存在的型号'); assert.ok(await page.locator('#model-search-empty').isVisible());
  await page.locator('#model-search').fill('无人机'); assert.equal(await page.locator('[data-model]:visible').count(), 8);
  await page.locator('#model-search').fill(''); assert.equal(await page.locator('[data-model]:visible').count(), 18);
  const catalog = await page.evaluate(() => {
    const list = document.querySelector('.model-sections'); list.scrollTop = list.scrollHeight;
    const search = document.querySelector('#model-search').getBoundingClientRect();
    return { scrolls: list.scrollHeight > list.clientHeight, searchTop: search.top, searchBottom: search.bottom };
  });
  assert.ok(catalog.scrolls && catalog.searchTop > 78 && catalog.searchBottom < 350, 'Search remains visible when the catalog scrolls');
  assert.ok(await page.locator('#restore-colors').isDisabled());
  await page.locator('#primary').fill('#aabbcc'); assert.ok(await page.locator('#restore-colors').isEnabled());
  await page.locator('#restore-colors').click(); assert.ok(await page.locator('#restore-colors').isDisabled());
  const poses = [];
  for (const mode of ['front', 'side', 'top', 'bottom', 'perspective']) {
    await page.locator(`[data-view="${mode}"]`).click();
    assert.equal(await page.locator(`[data-view="${mode}"]`).getAttribute('aria-pressed'), 'true');
    poses.push(await page.evaluate(() => window.__modelWorkbench.camera.position.toArray()));
  }
  assert.equal(new Set(poses.map(JSON.stringify)).size, 5);
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement);
  assert.match(await page.locator('#fullscreen').innerText(), /退出/);
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement);
  assert.match(await download('#screenshot', 'model-export.png'), /S-07.*\.png/);
  await page.screenshot({ path: `${folder}/models-desktop.png` });
  check('Model search, empty feedback, distinct views, conditional restore, fullscreen and PNG export');

  await page.locator('#mode-environments').click(); await sky();
  for (const variant of ['deepwater', 'qingzhou', 'jiuzhou', 'hornsea', 'ninepin', 'westlake', 'kallang', 'waalhaven']) {
    await page.locator(`[data-env="${variant}"]`).click(); await sky();
    assert.equal(await page.evaluate(() => window.__environmentWorkbench.snapshot().environment.variant), variant);
    assert.ok(await page.locator('#env-seed-controls').isHidden());
  }
  await page.locator('#env-camera').selectOption('establishing');
  assert.ok(await page.locator('#env-focus').isDisabled()); assert.ok(await page.locator('#env-selection-fields').isHidden());
  const cameras = [];
  for (const view of ['establishing', 'top', 'aerial', 'waterline', 'context']) {
    await page.locator('#env-camera').selectOption(view);
    cameras.push(await page.evaluate(() => window.__environmentWorkbench.camera.position.toArray()));
  }
  assert.equal(new Set(cameras.map(JSON.stringify)).size, 5);
  await page.locator('#env-rotate').click(); assert.equal(await page.evaluate(() => window.__environmentWorkbench.transform.mode), 'rotate');
  await page.locator('#env-translate').click(); assert.equal(await page.evaluate(() => window.__environmentWorkbench.transform.mode), 'translate');
  await change('#env-yaw', '31'); assert.ok(Math.abs(await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.find(v => v.config.id === window.__environmentWorkbench.snapshot().view.selectedId).config.yaw) - 31 * Math.PI / 180) < 1e-9);
  await page.locator('#env-color-accent').fill('#ee8844');
  assert.equal(await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.find(v => v.config.id === window.__environmentWorkbench.snapshot().view.selectedId).config.colors.accent), '#ee8844');
  await page.locator('#env-focus').click();
  for (const flag of ['labels', 'waterBoundary', 'obstacles', 'spawns', 'waterAnimation', 'rotorAnimation']) {
    const initial = await page.locator(`#env-flag-${flag}`).isChecked();
    await page.locator(`#env-flag-${flag}`).setChecked(!initial);
    assert.equal(await page.evaluate(flag => window.__environmentWorkbench.snapshot().view[flag], flag), !initial);
    await page.locator(`#env-flag-${flag}`).setChecked(initial);
  }
  const count = await page.locator('[data-instance]').count();
  await page.locator('#env-model-add').selectOption('usv-relay'); await page.locator('#env-add').click();
  assert.equal(await page.locator('[data-instance]').count(), count + 1);
  await page.locator('#env-delete').click(); assert.equal(await page.locator('[data-instance]').count(), count);
  const saved = await page.evaluate(() => window.__environmentWorkbench.snapshot());
  await download('#env-export', 'scene.json');
  assert.deepEqual(JSON.parse(await readFile(`${folder}/scene.json`, 'utf8')), saved);
  await page.locator('#env-delete').click();
  const chooser = page.waitForEvent('filechooser'); await page.locator('#env-import').click(); await (await chooser).setFiles(`${folder}/scene.json`);
  await page.waitForFunction(count => window.__environmentWorkbench.snapshot().vehicles.length === count, count); await sky();
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), saved.vehicles);
  await page.locator('#env-camera').selectOption('establishing');
  await page.locator('#env-immersive').click();
  assert.ok(await page.locator('.env-library').isHidden());
  assert.ok((await page.locator('.env-stage').boundingBox()).width > 1500);
  await page.locator('#env-immersive').click(); assert.ok(await page.locator('.env-library').isVisible());
  assert.match(await download('#env-shot', 'environment-export.png'), /waalhaven-view\.png/);
  await page.screenshot({ path: `${folder}/environment-desktop.png` });
  check('All 8 environments, all 5 cameras, selection, transforms, colors, 6 layers, add/remove, import/export, immersive and image export');

  await page.locator('#mode-algorithms').click(); await ready();
  assert.equal(await page.locator('#algo-reset').isDisabled(), true);
  assert.equal(await page.locator('#algo-count-label').isHidden(), true);
  await page.locator('[data-algorithm="leader"]').click(); await ready();
  assert.equal(await page.locator('.algo-vessel-label').count(), 6);
  assert.ok(await assertPoses());
  await page.locator('#algo-camera').selectOption('mission');
  await page.waitForTimeout(160);
  const overlaps = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.algo-vessel-label:not([hidden]),.algo-endpoint:not([hidden])')].map(e => e.getBoundingClientRect());
    return labels.flatMap((a, i) => labels.slice(i + 1).filter(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)).length;
  });
  assert.equal(overlaps, 0);
  await page.screenshot({ path: `${folder}/algorithms-desktop.png` });
  const algoCameras = [];
  for (const mode of ['mission', 'fleet', 'top']) {
    await page.locator('#algo-camera').selectOption(mode); algoCameras.push(await page.evaluate(() => window.__algorithmWorkbench.view.camera.position.toArray()));
  }
  assert.equal(new Set(algoCameras.map(JSON.stringify)).size, 3);
  await page.locator('#algo-camera').selectOption('fleet');
  await page.getByRole('button', { name: '聚焦 2 号艇', exact: true }).click();
  assert.match(await page.locator('#algo-follow').innerText(), /02/);
  await page.locator('#algo-follow').click();
  const offset = await page.evaluate(() => window.__algorithmWorkbench.view.camera.position.clone().sub(window.__algorithmWorkbench.view.models[1].root.position).toArray());
  await page.locator('#algo-run').click(); await page.waitForFunction(() => window.__algorithmWorkbench.simulation.time > 4);
  assert.ok(await page.locator('#algo-step').isDisabled());
  await page.locator('#algo-run').click();
  const time = await page.evaluate(() => window.__algorithmWorkbench.simulation.time);
  await page.waitForTimeout(200); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.simulation.time), time);
  assert.ok(await assertPoses());
  const after = await page.evaluate(() => window.__algorithmWorkbench.view.camera.position.clone().sub(window.__algorithmWorkbench.view.models[1].root.position).toArray());
  assert.ok(offset.every((v, i) => Math.abs(v - after[i]) < 1e-5), 'Camera follows the actual selected boat');
  await page.locator('#algo-step').click(); assert.ok(Math.abs(await page.evaluate(() => window.__algorithmWorkbench.simulation.time) - time - .1) < 1e-7);
  await page.locator('#algo-replay').fill('2');
  assert.ok(await page.evaluate(() => {
    const { view, simulation } = window.__algorithmWorkbench;
    return view.frame.time === simulation.frames[2].time && view.models.every((m, i) => m.root.position.x === simulation.frames[2].vessels[i].position[0]);
  }));
  await page.locator('#algo-camera').selectOption('fleet');
  await page.screenshot({ path: `${folder}/algorithms-fleet.png` });
  await page.locator('#algo-follow').click(); await page.screenshot({ path: `${folder}/algorithms-follow.png` });
  const exportName = await download('#algo-json', 'experiment.json'); assert.match(exportName, /leader/);
  await download('#algo-csv', 'trajectory.csv');
  const experiment = JSON.parse(await readFile(`${folder}/experiment.json`, 'utf8'));
  assert.equal(experiment.scene.vehicles.length, 6); assert.equal(experiment.scene.vehicles[1].position[0], experiment.frames[2].vessels[1].position[0]);
  assert.ok((await readFile(`${folder}/trajectory.csv`, 'utf8')).includes('time_s,vessel_id'));
  await page.locator('#algo-open-scene').click();
  await page.waitForFunction(() => window.__environmentWorkbench.snapshot().vehicles[0]?.id === 'algo-1');
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), experiment.scene.vehicles);
  await page.locator('#mode-algorithms').click();
  await page.locator('#algo-reset').click(); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.simulation.time), 0);
  assert.ok(await page.locator('#algo-reset').isDisabled());
  check('Live metre-scale models, nonoverlapping labels, 3 views, per-boat focus/follow, pause/step/replay, exports, edit snapshot and reset');

  await page.locator('#algo-pick-mode').selectOption('goal');
  assert.equal(await page.locator('#algo-camera').inputValue(), 'top');
  const point = await page.evaluate(async () => {
    const { Vector3 } = await import('/node_modules/three/build/three.module.js');
    const p = new Vector3(-790, 0, -150).project(window.__algorithmWorkbench.view.camera), rect = document.querySelector('#algo-viewport').getBoundingClientRect();
    return { x: rect.x + (p.x * .5 + .5) * rect.width, y: rect.y + (-p.y * .5 + .5) * rect.height };
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.locator('#algo-pick-mode').inputValue(), '');
  assert.equal(await page.locator('#algo-run').innerText(), '生成方案'); assert.ok(await page.locator('#algo-json').isDisabled());
  assert.ok(Math.abs(Number(await page.locator('#algo-goal-x').inputValue()) + 790) < 1);
  await page.locator('#algo-run').click(); await ready();
  await page.locator('#algo-pick-mode').selectOption('start'); await page.locator('#algo-viewport canvas').press('Escape');
  assert.equal(await page.locator('#algo-pick-mode').inputValue(), '');
  await page.locator('#algo-model').selectOption('multibeam'); assert.equal(await page.locator('#algo-run').innerText(), '生成方案');
  await page.locator('#algo-run').click(); await ready();
  assert.equal(await page.evaluate(() => window.__algorithmWorkbench.view.models[0].root.name), 'usv-multibeam');
  await page.locator('#algo-count').fill('12'); await page.locator('#algo-count').blur(); await page.locator('#algo-run').click(); await ready();
  assert.equal(await page.evaluate(() => window.__algorithmWorkbench.view.models.length), 12);
  await page.locator('#algo-camera').selectOption('fleet');
  await page.screenshot({ path: `${folder}/twelve-vessels.png` });
  report.twelveVesselFrames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let last;
    const next = now => { if (last) samples.push(now - last); last = now; if (samples.length < 60) requestAnimationFrame(next); else { samples.sort((a, b) => a - b); resolve({ medianMs: samples[30], p95Ms: samples[57] }); } }; requestAnimationFrame(next);
  }));
  await page.locator('#algo-run').click(); await page.waitForFunction(() => window.__algorithmWorkbench.simulation.time > 1);
  await page.locator('#mode-models').click(); const hiddenTime = await page.evaluate(() => window.__algorithmWorkbench.simulation.time);
  await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.simulation.time), hiddenTime);
  await page.locator('#mode-algorithms').click(); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.running), false);
  check('3D ray picking, Escape, invalidation, selected model, 12-vessel rendering and pause on tab switch');

  // Hidden parameters must not invalidate another method's configuration.
  await page.locator('[data-algorithm="astar"]').click(); await ready();
  await page.locator('#algo-width').evaluate(el => { el.value = '0'; });
  await change('#algo-speed', '3'); await page.locator('#algo-run').click(); await ready();
  await change('#algo-speed', '0'); await page.locator('#algo-run').click();
  await page.waitForFunction(() => !window.__algorithmWorkbench.busy);
  assert.match(await page.locator('#algo-message').innerText(), /speed/); assert.equal(await page.locator('#algo-run').innerText(), '生成方案');
  await change('#algo-speed', '4'); await page.locator('#algo-run').click(); await ready();
  await page.locator('#algo-follow').click(); await page.locator('#algo-viewport canvas').press('Home');
  assert.equal(await page.locator('#algo-camera').inputValue(), 'mission');
  assert.equal(await page.locator('#algo-follow').getAttribute('aria-pressed'), 'false');
  const memories = [];
  for (let i = 0; i < 3; i++) {
    await page.locator('#algo-environment').selectOption('waalhaven'); await ready();
    await page.locator('#algo-environment').selectOption('westlake'); await ready();
    await page.waitForFunction(() => document.querySelector('#algo-sky-status').textContent.includes('实景'));
    await page.waitForTimeout(80);
    memories.push(await page.evaluate(() => ({ ...window.__algorithmWorkbench.view.renderer.info.memory })));
  }
  assert.deepEqual(memories[0], memories[2], 'Repeated scene swaps dispose geometry and texture resources'); report.sceneMemory = memories;
  check('Only relevant parameters are validated, invalid input gives recovery feedback');

  for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    await page.setViewportSize(size);
    for (const mode of ['models', 'environments', 'algorithms']) {
      await page.locator(`#mode-${mode}`).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode} ${size.width}: no overflow`);
      const box = await page.locator(mode === 'algorithms' ? '#algo-viewport' : mode === 'environments' ? '#env-canvas' : '#viewport').boundingBox();
      assert.ok(box.width > 250 && box.height > 250);
      report.layouts.push({ mode, width: size.width, canvas: [box.width, box.height] });
      if (size.width === 390) await page.screenshot({ path: `${folder}/${mode}-mobile.png`, fullPage: true });
    }
  }
  assert.equal(await page.locator('.algo-settings-details').getAttribute('open'), null);
  await page.locator('.algo-settings-details>summary').click(); assert.ok(await page.locator('#algo-environment').isVisible());
  await page.locator('.algo-settings-details>summary').click();
  await page.locator('#mode-models').click(); await page.locator('.library summary').click(); assert.ok(await page.locator('#model-search').isVisible());
  await page.locator('.library summary').click();
  await page.locator('#mode-environments').click(); await page.locator('.env-library summary').click(); assert.ok(await page.locator('[data-env="deepwater"]').isVisible());
  await page.locator('.env-library summary').click();
  check('All 3 pages at 1366, 390 and 360 px; mobile panel disclosures');
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (e) { report.result = 'failed'; report.failure = String(e); await page.screenshot({ path: `${folder}/failure.png`, fullPage: true }); throw e; }
finally { await writeFile(`${folder}/acceptance.json`, JSON.stringify(report, null, 2)); await browser.close(); }
