import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__modelWorkbench?.renderer.info.memory.geometries > 50);
  assert.equal(await page.locator('#animate').isChecked(), false);
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  report.fullscreen = 'passed';
  await page.locator('#viewport').focus();
  const before = await page.evaluate(() => window.__modelWorkbench.camera.position.toArray());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  assert.notDeepEqual(await page.evaluate(() => window.__modelWorkbench.camera.position.toArray()), before);
  await page.keyboard.press('Home');
  report.keyboard = 'passed'; report.reducedMotionDefault = 'passed';
  const unavailable = await browser.newPage();
  await unavailable.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await unavailable.goto('http://127.0.0.1:5173/');
  await unavailable.locator('#error').waitFor({ state: 'visible' });
  assert.match(await unavailable.locator('#error').textContent(), /WebGL 2/);
  report.webglUnavailable = 'passed';
  await page.evaluate(() => window.__modelWorkbench.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#error').textContent(), /上下文已中断/);
  report.contextLoss = 'passed';
  console.log(JSON.stringify(report, null, 2));
  await writeFile('artifacts/environment-check.json', JSON.stringify(report, null, 2));
} finally { await browser.close(); }
