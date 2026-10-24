import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder = 'artifacts/algorithms'; await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const report = { errors: [], models: [], algorithms: [], scenes: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
const ready = async () => {
  await page.waitForFunction(() => window.__algorithmWorkbench && !window.__algorithmWorkbench.busy);
  assert.ok(await page.evaluate(() => !!window.__algorithmWorkbench.plan), await page.locator('#algo-message').innerText());
};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-model]').count(), 18);
  for (const model of ['quadrotor-multispectral', 'quadrotor-relay', 'usv-multibeam', 'usv-relay', 'usv-debris', 'usv-patrol']) {
    await page.locator(`[data-model="${model}"]`).click();
    assert.equal(await page.evaluate(() => window.__modelWorkbench.handle.root.name), model);
    await page.screenshot({ path: `${folder}/${model}.png` }); report.models.push(model);
  }
  await page.locator('#mode-algorithms').click(); await ready();
  assert.match(await page.locator('#algo-attribution').innerText(), /OpenStreetMap/);
  assert.ok((await page.request.get(new URL(await page.locator('#algo-attribution').getAttribute('href'), page.url()).href)).ok());
  assert.equal(await page.locator('[data-algorithm]').count(), 13);
  assert.equal(await page.locator('#algo-count').inputValue(), '1');
  await page.screenshot({ path: `${folder}/astar-desktop.png` });
  for (const algorithm of ['astar', 'dijkstra', 'leader', 'consensus', 'coverage']) {
    await page.locator(`[data-algorithm="${algorithm}"]`).click(); await ready();
    await page.locator('#algo-run').click(); await page.waitForFunction(() => window.__algorithmWorkbench.simulation.time > 0.5);
    await page.locator('#algo-run').click();
    const paused = await page.evaluate(() => window.__algorithmWorkbench.simulation.time);
    await page.waitForTimeout(150); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.simulation.time), paused);
    await page.locator('#algo-step').click(); assert.ok(await page.evaluate(() => window.__algorithmWorkbench.simulation.time) > paused);
    const result = await page.evaluate(() => {
      const e = window.__algorithmWorkbench, s = e.simulation;
      for (let i = 0; i < 18001 && !['complete', 'blocked', 'timeout'].includes(s.status); i++) s.step();
      return { algorithm: e.plan.config.algorithm, status: s.status, time: s.time, distance: s.distance, separation: s.minSeparation, coverage: s.coverage, error: s.formationError, expanded: e.plan.expanded, gridCost: e.plan.gridCost, radius: e.plan.config.radius, frames: s.frames.length };
    });
    assert.equal(result.status, 'complete', `${algorithm} should complete its default demonstration`);
    if (result.separation !== Infinity) assert.ok(result.separation >= 2 * result.radius);
    if (algorithm === 'coverage') assert.equal(result.coverage, 1);
    report.algorithms.push(result);
    await page.locator('#algo-step').click();
    await page.screenshot({ path: `${folder}/${algorithm}-complete.png` });
  }
  assert.ok(Math.abs(report.algorithms[0].gridCost - report.algorithms[1].gridCost) < 1e-7);
  assert.ok(report.algorithms[0].expanded < report.algorithms[1].expanded);
  await page.locator('#algo-replay').fill('4');
  assert.ok((await page.locator('#algo-replay-time').innerText()).includes('2.0'));
  const resultJSON = page.waitForEvent('download'); await page.locator('#algo-json').click(); await (await resultJSON).saveAs(`${folder}/experiment.json`);
  const csv = page.waitForEvent('download'); await page.locator('#algo-csv').click(); await (await csv).saveAs(`${folder}/trajectory.csv`);
  const exported = JSON.parse(await readFile(`${folder}/experiment.json`, 'utf8'));
  assert.equal(exported.plan.config.algorithm, 'coverage'); assert.equal(exported.frames.length, report.algorithms.at(-1).frames);
  assert.equal((await readFile(`${folder}/trajectory.csv`, 'utf8')).trim().split('\n').length, exported.frames.length * 6 + 1);
  const pose = await page.evaluate(() => window.__algorithmWorkbench.sceneConfig());
  await page.locator('#algo-open-scene').click();
  await page.waitForFunction(() => window.__environmentWorkbench?.snapshot().vehicles[0]?.id === 'algo-1');
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.snapshot().vehicles), pose.vehicles);
  assert.deepEqual(await page.evaluate(() => window.__environmentWorkbench.runtime.vehicles.flatMap(v => v.issues)), []);
  await page.screenshot({ path: `${folder}/coverage-in-3d.png` });
  await page.locator('#mode-algorithms').click();
  await page.locator('[data-algorithm="astar"]').click(); await ready();
  for (const environment of ['kallang', 'waalhaven', 'deepwater', 'qingzhou', 'jiuzhou', 'hornsea', 'ninepin']) {
    await page.locator('#algo-environment').selectOption(environment); await ready();
    const routePoints = await page.evaluate(() => window.__algorithmWorkbench.plan.routes[0].length);
    assert.ok(routePoints >= 2, `${environment}: a nonzero demonstration route`);
    report.scenes.push({ environment, routePoints });
  }
  await page.locator('#algo-environment').selectOption('westlake'); await ready();
  await page.locator('#algo-model').selectOption('patrol');
  assert.equal(await page.locator('#algo-run').innerText(), '生成方案'); await page.locator('#algo-run').click(); await ready();
  await page.locator('#algo-run').click(); await page.waitForFunction(() => window.__algorithmWorkbench.simulation.time > 0.5);
  await page.locator('#mode-models').click(); const hiddenTime = await page.evaluate(() => window.__algorithmWorkbench.simulation.time);
  await page.waitForTimeout(200); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.simulation.time), hiddenTime);
  await page.locator('#mode-algorithms').click(); assert.equal(await page.evaluate(() => window.__algorithmWorkbench.running), false);
  await page.locator('#algo-speed').fill('0'); await page.locator('#algo-speed').blur(); await page.locator('#algo-run').click();
  await page.waitForFunction(() => !window.__algorithmWorkbench.busy); assert.equal(await page.locator('#algo-run').innerText(), '生成方案'); assert.match(await page.locator('#algo-message').innerText(), /speed/);
  await page.locator('#algo-speed').fill('4'); await page.locator('#algo-speed').blur(); await page.locator('#algo-run').click(); await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${folder}/mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error); await page.screenshot({ path: `${folder}/failure.png`, fullPage: true }); throw error; }
finally { await writeFile(`${folder}/acceptance.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
