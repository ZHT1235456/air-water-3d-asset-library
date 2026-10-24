import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts/ui', { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 5174, strictPort: true } });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { errors: [], methods: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:5174/');
  await page.locator('#mode-algorithms').click();
  for (const algorithm of ['astar', 'dijkstra', 'leader', 'consensus', 'coverage']) {
    await page.locator(`[data-algorithm="${algorithm}"]`).click();
    await page.waitForFunction(() => document.querySelector('#algo-state')?.textContent === '就绪');
    assert.equal(await page.locator('.algo-vessel-label').count(), ['astar', 'dijkstra'].includes(algorithm) ? 1 : 6);
    await page.locator('#algo-step').click(); assert.match(await page.locator('#algo-time').innerText(), /0.1/);
    await page.locator('#algo-camera').selectOption('fleet');
    if (algorithm === 'leader') {
      await page.locator('#algo-pick-mode').selectOption('start');
      await page.locator('#algo-camera').selectOption('fleet');
      assert.equal(await page.locator('#algo-pick-mode').inputValue(), '');
      await page.locator('#algo-run').click();
      await page.waitForFunction(() => document.querySelector('#algo-time')?.textContent !== '0.1 s');
      await page.locator('#algo-run').click(); assert.match(await page.locator('#algo-message').innerText(), /已暂停/);
    }
    assert.ok(await page.evaluate(() => {
      const canvas = document.querySelector('#algo-viewport canvas'), gl = canvas.getContext('webgl2');
      return canvas.width > 300 && canvas.height > 250 && !!gl && gl.getError() === gl.NO_ERROR;
    }));
    report.methods.push(algorithm);
  }
  await page.locator('#algo-current-x').evaluate(el => { el.value = ''; el.dispatchEvent(new Event('change')); });
  await page.locator('#algo-motion').selectOption('kinematic'); await page.locator('#algo-run').click();
  await page.waitForFunction(() => document.querySelector('#algo-state')?.textContent === '就绪');
  assert.equal(await page.locator('#algo-physics-fields').isHidden(), true);
  report.kinematicBaseline = 'hidden physics inputs isolated';
  await page.locator('#algo-open-scene').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-instance]').length === 6);
  await page.locator('#env-camera').selectOption('context');
  assert.equal(await page.locator('#mode-environments').getAttribute('aria-pressed'), 'true');
  await page.locator('#mode-dynamics').click();
  await page.waitForFunction(() => document.querySelector('#dyn-run') && !document.querySelector('#dyn-run').disabled);
  await page.locator('#dyn-model').selectOption('quadrotor-survey');
  assert.equal(await page.locator('#dyn-defaults').isDisabled(), true);
  await page.locator('#dyn-mass').fill('7'); await page.locator('#dyn-mass').blur();
  await page.locator('#dyn-defaults').click(); assert.equal(await page.locator('#dyn-mass').inputValue(), '4.8');
  await page.locator('#dyn-experiment').selectOption('waypoint'); await page.locator('#dyn-step').click(); assert.match(await page.locator('#dyn-time').innerText(), /0.02/);
  await page.locator('#dyn-rate').selectOption('8'); await page.locator('#dyn-run').click();
  await page.waitForFunction(() => parseFloat(document.querySelector('#dyn-time').textContent) > 3);
  await page.locator('#dyn-run').click(); assert.ok(parseFloat(await page.locator('#dyn-altitude').innerText()) > 1);
  await page.locator('#dyn-replay').fill('5'); assert.match(await page.locator('#dyn-replay-time').innerText(), /0.5/);
  assert.ok(await page.evaluate(() => { const canvas = document.querySelector('#dyn-viewport canvas'), gl = canvas.getContext('webgl2'); return canvas.width > 300 && !!gl && gl.getError() === gl.NO_ERROR; }));
  await page.locator('#dyn-model').selectOption('usv-survey'); await page.locator('#dyn-step').click(); assert.match(await page.locator('#dyn-time').innerText(), /0.02/);
  report.dynamics = 'quadrotor 6-DOF / USV 3-DOF / replay / WebGL passed';
  await page.locator('#mode-algorithms').click();
  for (const algorithm of ['los', 'patrol', 'sampling', 'search', 'tracking', 'station', 'docking', 'avoidance']) {
    await page.locator(`[data-algorithm="${algorithm}"]`).click();
    await page.waitForFunction(() => document.querySelector('#algo-state')?.textContent === '就绪');
    assert.equal(await page.locator('#algo-motion').inputValue(), 'dynamics'); assert.equal(await page.locator('#algo-motion').isDisabled(), true);
    await page.locator('#algo-step').click(); assert.match(await page.locator('#algo-time').innerText(), /0.1/);
    assert.match(await page.locator('#algo-physical-readout').innerText(), /推力/);
    assert.equal(await page.locator('#algo-task-progress').isVisible(), true); report.methods.push(algorithm);
  }
  assert.deepEqual(report.errors, []); report.result = 'passed';
} finally { await writeFile('artifacts/ui/production.json', JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
console.log(JSON.stringify(report));
