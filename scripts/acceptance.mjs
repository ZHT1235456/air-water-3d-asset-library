import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const report = { checks: [], memory: [], errors };
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__modelWorkbench?.renderer.info.render.triangles > 1000);
  const entries = await page.evaluate(() => window.__modelWorkbench.entries.map(e => ({ id: e.id, code: e.code })));
  for (const entry of entries) {
    await page.locator(`[data-model="${entry.id}"]`).click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => window.__modelWorkbench.renderer.info.render.triangles > 1000));
    await page.screenshot({ path: `artifacts/screenshots/${entry.code}-perspective.png` });
    await page.locator('[data-view="top"]').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `artifacts/screenshots/${entry.code}-top.png` });
    if (entry.id.startsWith('usv')) {
      await page.locator('[data-view="bottom"]').click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `artifacts/screenshots/${entry.code}-bottom.png` });
      await page.locator('[data-view="side"]').click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `artifacts/screenshots/${entry.code}-side.png` });
    }
    const metrics = await page.evaluate(() => {
      const w = window.__modelWorkbench;
      return { geometries: w.renderer.info.memory.geometries, textures: w.renderer.info.memory.textures, triangles: w.renderer.info.render.triangles, calls: w.renderer.info.render.calls };
    });
    report.checks.push({ model: entry.id, ...metrics });
  }
  await page.locator('[data-model="quadrotor-inspection"]').click();
  await page.locator('#primary').fill('#cc5533');
  assert.equal(await page.locator('#primary-hex').textContent(), '#CC5533');
  await page.locator('#restore-colors').click();
  assert.equal(await page.locator('#primary-hex').textContent(), '#E7ECEF');
  await page.locator('#scale').fill('1.5');
  assert.equal(await page.locator('#scale-value').textContent(), '1.50 ×');
  assert.equal(await page.evaluate(() => window.__modelWorkbench.handle.root.scale.x), 1.5);
  await page.locator('#scale').fill('1');
  await page.locator('#wireframe').check();
  assert.ok(await page.evaluate(() => { let good = true; window.__modelWorkbench.handle.root.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.wireframe) good = false; }); return good; }));
  await page.locator('#wireframe').uncheck();
  await page.locator('#axes').check();
  await page.locator('#animate').check();
  const before = await page.evaluate(() => window.__modelWorkbench.handle.parts['rotor-front-left'].rotation.y);
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => window.__modelWorkbench.handle.parts['rotor-front-left'].rotation.y);
  assert.notEqual(before, after);
  await page.locator('#animate').uncheck();
  await page.locator('#axes').uncheck();
  // Real pointer orbit, wheel zoom and secondary-button pan.
  const viewport = await page.locator('#viewport').boundingBox();
  const centre = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  const pose = await page.evaluate(() => window.__modelWorkbench.camera.position.toArray());
  await page.mouse.move(centre.x, centre.y); await page.mouse.down(); await page.mouse.move(centre.x + 90, centre.y + 30, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(250);
  assert.notDeepEqual(await page.evaluate(() => window.__modelWorkbench.camera.position.toArray()), pose);
  await page.mouse.wheel(0, 120); await page.mouse.down({ button: 'right' }); await page.mouse.move(centre.x + 40, centre.y, { steps: 5 }); await page.mouse.up({ button: 'right' });
  await page.locator('#reset').click();
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const entry of entries) { await page.evaluate(id => window.__modelWorkbench.selectModel(id), entry.id); await page.waitForTimeout(60); }
    await page.evaluate(() => window.__modelWorkbench.selectModel('quadrotor-inspection'));
    await page.waitForTimeout(100);
    report.memory.push(await page.evaluate(() => ({ geometries: window.__modelWorkbench.renderer.info.memory.geometries, textures: window.__modelWorkbench.renderer.info.memory.textures })));
  }
  assert.deepEqual(report.memory[0], report.memory.at(-1));
  const downloadEvent = page.waitForEvent('download'); await page.locator('#screenshot').click(); const download = await downloadEvent; assert.match(download.suggestedFilename(), /Q-01-perspective\.png/);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/screenshots/workbench-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  // Fold both panels, then unfold settings and verify mobile layout.
  await page.locator('.library summary').click();
  await page.locator('.inspector summary').click();
  await page.screenshot({ path: 'artifacts/screenshots/workbench-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.inspector summary').click();
  await page.locator('#axes').check();
  await page.screenshot({ path: 'artifacts/screenshots/workbench-mobile-settings.png', fullPage: true });
  assert.equal(errors.length, 0, errors.join('\n'));
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error); throw error; }
finally { await writeFile('artifacts/acceptance.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
