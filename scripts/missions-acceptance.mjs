import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder = 'artifacts/missions'; await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1080 }, deviceScaleFactor: 1 });
const report = { errors: [], missions: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
const ready = async () => {
  await page.waitForFunction(() => window.__algorithmWorkbench && !window.__algorithmWorkbench.busy);
  assert.ok(await page.evaluate(() => !!window.__algorithmWorkbench.plan), await page.locator('#algo-message').innerText());
};
const replay = async end => page.locator('#algo-replay').evaluate((el, end) => {
  const n = window.__algorithmWorkbench.simulation.frames.length - 1;
  el.max = String(n); el.value = String(end ? n : Math.floor(n / 2)); el.dispatchEvent(new Event('input'));
}, end);
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' }); await page.locator('#mode-algorithms').click(); await ready();
  assert.equal(await page.locator('[data-algorithm]').count(), 13);
  for (const id of ['los', 'patrol', 'sampling', 'search', 'tracking', 'station', 'docking', 'avoidance']) {
    await page.locator(`[data-algorithm="${id}"]`).click(); await ready();
    assert.equal(await page.locator('#algo-motion').inputValue(), 'dynamics'); assert.equal(await page.locator('#algo-motion').isDisabled(), true);
    const result = await page.evaluate(() => {
      const { simulation: s, plan } = window.__algorithmWorkbench;
      for (let i = 0; i < 12000 && !['complete', 'blocked', 'timeout'].includes(s.status); i++) s.step();
      return { id: plan.config.algorithm, status: s.status, reason: s.stopReason, time: s.time, boats: s.vessels.length, radius: plan.config.radius, distance: s.distance, separation: Number.isFinite(s.minSeparation) ? s.minSeparation : null, maxTerminalSpeed: Math.max(...s.bodies.map(b => Math.hypot(...b.worldVelocity))), maxTerminalYawRate: Math.max(...s.bodies.map(b => Math.abs(b.state.velocity[2]))), ...s.currentFrame().mission };
    });
    assert.equal(result.status, 'complete', JSON.stringify(result)); assert.ok(result.separation === null || result.separation >= result.radius * 2);
    if (id !== 'tracking') assert.ok(result.maxTerminalSpeed < .18 && result.maxTerminalYawRate < .12, 'terminal motion must be stable');
    await replay(true);
    const rendered = await page.evaluate(() => {
      const e = window.__algorithmWorkbench, f = e.view.frame;
      return { physical: f.vessels.every(v => !!v.dynamics), consistent: e.view.models.every((m, i) => Math.hypot(m.root.position.x - f.vessels[i].position[0], m.root.position.z - f.vessels[i].position[1]) < 1e-6), checkpoints: e.view.scene.children.flatMap(o => o.children).filter(o => o.name.startsWith('task-checkpoint')).length, target: e.view.scene.getObjectByName('task-reference')?.position.toArray() };
    });
    assert.ok(rendered.physical && rendered.consistent); assert.match(await page.locator('#algo-physical-readout').innerText(), /推力/);
    if (id === 'tracking') assert.ok(rendered.target?.every(Number.isFinite)); else assert.ok(rendered.checkpoints > 0);
    await page.screenshot({ path: `${folder}/${id}-complete.png`, fullPage: true });
    await replay(false);
    const historic = await page.evaluate(() => { const e = window.__algorithmWorkbench; return { time: e.view.frame.time, target: e.view.scene.getObjectByName('task-reference')?.position.toArray(), recorded: e.view.frame.mission?.target, phase: e.view.frame.mission?.phases[0] }; });
    assert.ok(historic.time < result.time);
    assert.ok((await page.locator('#algo-task-stage').innerText()).includes(historic.phase), 'task phase must also replay the recorded moment');
    if (historic.target) assert.deepEqual([historic.target[0], historic.target[2]], historic.recorded);
    if (id === 'sampling') {
      const json = page.waitForEvent('download'); await page.locator('#algo-json').click(); await (await json).saveAs(`${folder}/sampling.json`);
      const csv = page.waitForEvent('download'); await page.locator('#algo-csv').click(); await (await csv).saveAs(`${folder}/sampling.csv`);
      const exported = JSON.parse(await readFile(`${folder}/sampling.json`, 'utf8')); assert.ok(exported.result.mission.completed.length > 0); assert.ok(exported.frames.every(f => f.mission));
      assert.match(await readFile(`${folder}/sampling.csv`, 'utf8'), /task_progress,dwell_s,rms_error_m/);
    }
    report.missions.push(result); console.log(`${id}: ${result.status}, ${result.time.toFixed(1)} s`);
  }
  await page.locator('#algo-catalog-filter').selectOption('mission'); assert.equal(await page.locator('[data-algorithm]:visible').count(), 8);
  await page.locator('#algo-catalog-filter').selectOption('baseline'); await ready(); assert.equal(await page.locator('[data-algorithm]:visible').count(), 5); assert.equal(await page.locator('#algo-motion').isEnabled(), true);
  await page.locator('#algo-catalog-filter').selectOption('all'); await page.locator('[data-algorithm="sampling"]').click(); await ready();
  await page.locator('#algo-dwell').fill(''); await page.locator('#algo-dwell').blur();
  await page.locator('[data-algorithm="station"]').click(); await ready();
  assert.equal(await page.locator('#algo-dwell-label').isHidden(), true);
  await page.locator('[data-algorithm="sampling"]').click(); await page.locator('#algo-dwell').fill('4'); await page.locator('#algo-dwell').blur(); await page.locator('#algo-run').click(); await ready();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `${folder}/mobile-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  }
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error); await page.screenshot({ path: `${folder}/failure.png`, fullPage: true }); throw error; }
finally { await writeFile(`${folder}/acceptance.json`, JSON.stringify(report, null, 2)); await browser.close(); }
