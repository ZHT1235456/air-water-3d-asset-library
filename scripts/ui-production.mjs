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
  await page.locator('#algo-open-scene').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-instance]').length === 6);
  await page.locator('#env-camera').selectOption('context');
  assert.equal(await page.locator('#mode-environments').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(report.errors, []); report.result = 'passed';
} finally { await writeFile('artifacts/ui/production.json', JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
console.log(JSON.stringify(report));
