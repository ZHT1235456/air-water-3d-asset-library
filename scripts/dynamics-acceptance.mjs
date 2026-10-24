import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder = 'artifacts/dynamics'; await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const report = { errors: [], models: [], steering: [] };
page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
const advance = async steps => page.evaluate(count => { const s = window.__dynamicsLab.simulation; for (let i = 0; i < count; i++) s.step(); return s.snapshot(); }, steps);
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.locator('#model-dynamics').click();
  await page.waitForFunction(() => !!window.__dynamicsLab?.simulation);
  assert.equal(await page.locator('#dyn-run').isEnabled(), true, await page.locator('#dyn-message').innerText());
  await page.locator('#dyn-step').click(); assert.match(await page.locator('#dyn-time').innerText(), /0.02/);
  await page.locator('#dyn-rate').selectOption('8'); await page.locator('#dyn-run').click();
  await page.waitForFunction(() => window.__dynamicsLab.simulation.time > 2);
  await page.locator('#dyn-run').click(); const paused = await page.evaluate(() => window.__dynamicsLab.simulation.time);
  await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.__dynamicsLab.simulation.time), paused);
  const models = await page.locator('#dyn-model option').evaluateAll(options => options.map(o => o.value)); assert.equal(models.length, 18);
  for (const id of models) {
    report.currentModel = id; await page.locator('#dyn-model').selectOption(id);
    assert.equal(await page.locator('#dyn-run').isEnabled(), true, `${id}: ${await page.locator('#dyn-message').innerText()}`);
    const f = await advance(1000);
    assert.ok([...f.position, ...f.velocity, ...f.quaternion, ...f.thrust].every(Number.isFinite));
    assert.ok(Math.hypot(...f.quaternion) > .999999);
    if (id.startsWith('quadrotor')) assert.ok(Math.abs(f.position[1] - 3) < .05, `${id}: hover ${f.position[1]}`);
    else assert.ok(f.position[2] > 20 && Math.abs(f.position[0]) < .01);
    await page.locator('#dyn-replay').evaluate(el => { el.max = String(window.__dynamicsLab.simulation.frames.length - 1); el.value = el.max; el.dispatchEvent(new Event('input')); });
    const pose = await page.evaluate(() => { const lab = window.__dynamicsLab; return { p: lab.view.model.root.position.toArray(), q: lab.view.model.root.quaternion.toArray(), canvas: lab.view.renderer.domElement.width }; });
    assert.ok(Math.hypot(...pose.p.map((x, i) => x - f.position[i])) < .03); assert.ok(pose.canvas > 300);
    report.models.push({ id, time: f.time, position: f.position, speed: Math.hypot(...f.velocity) });
  }
  await page.locator('#dyn-model').selectOption('quadrotor-survey'); await page.locator('#dyn-experiment').selectOption('waypoint');
  const moving = await advance(75);
  assert.ok(moving.position[0] > 1);
  assert.ok(await page.evaluate(() => window.__dynamicsLab.simulation.frames.some(f => Math.hypot(f.quaternion[0], f.quaternion[2]) > .1)), 'translation must require an earlier thrust tilt, even if attitude levels at this instant');
  await advance(1300);
  await page.locator('#dyn-wind-x').fill('4'); const windy = await advance(1000);
  assert.ok(Math.hypot(windy.position[0] - 8, windy.position[1] - 5, windy.position[2] - 12) < .15);
  await page.locator('#dyn-replay').fill('10'); const historical = await page.evaluate(() => window.__dynamicsLab.simulation.frames[10]);
  const historicalPose = await page.evaluate(() => window.__dynamicsLab.view.model.root.position.toArray()); assert.deepEqual(historicalPose, historical.position);
  const historicalRotor = await page.evaluate(() => window.__dynamicsLab.view.model.parts['rotor-front-left'].rotation.y); assert.equal(historicalRotor, historical.rotorAngles[0]);
  const jsonDownload = page.waitForEvent('download'); await page.locator('#dyn-json').click(); await (await jsonDownload).saveAs(`${folder}/flight.json`);
  const csvDownload = page.waitForEvent('download'); await page.locator('#dyn-csv').click(); await (await csvDownload).saveAs(`${folder}/flight.csv`);
  const exported = JSON.parse(await readFile(`${folder}/flight.json`, 'utf8')); assert.equal(exported.profile.mass, 4.8); assert.ok(exported.frames.at(-1).time > 40); assert.equal(exported.frames.at(-1).rotorSpeed.length, 4);
  assert.equal((await readFile(`${folder}/flight.csv`, 'utf8')).trim().split('\n').length, exported.frames.length + 1);
  await page.locator('#dyn-replay').fill(String(exported.frames.length - 1)); await page.screenshot({ path: `${folder}/flight-desktop.png`, fullPage: true });
  await page.locator('#dyn-power').uncheck(); const before = await page.evaluate(() => window.__dynamicsLab.simulation.snapshot()), cut = await advance(5);
  assert.ok(cut.rotorSpeed[0] > 0 && cut.rotorSpeed[0] < before.rotorSpeed[0]); assert.ok(cut.velocity[1] < before.velocity[1]);
  await advance(700); assert.equal(await page.evaluate(() => window.__dynamicsLab.simulation.air.state.grounded), true);
  await page.locator('#dyn-mass').fill('0'); await page.locator('#dyn-mass').blur(); assert.equal(await page.locator('#dyn-run').isDisabled(), true);
  await page.locator('#dyn-defaults').click(); assert.equal(await page.locator('#dyn-mass').inputValue(), '4.8'); assert.equal(await page.locator('#dyn-run').isEnabled(), true);
  await page.locator('#dyn-thrust').fill(''); await page.locator('#dyn-thrust').blur(); assert.equal(await page.locator('#dyn-json').isDisabled(), true);
  await page.locator('#dyn-defaults').click(); assert.equal(await page.locator('#dyn-json').isEnabled(), true);
  for (const id of ['usv-survey', 'usv-inspection']) for (const throttle of [-.65, .65]) for (const turn of [-.35, .35]) {
    await page.locator('#dyn-model').selectOption(id);
    assert.deepEqual(await page.locator('#dyn-motors .dyn-motor > span').allTextContents(), id === 'usv-survey' ? ['右桨', '左桨'] : ['单桨']);
    await page.locator('#dyn-throttle').fill(String(throttle)); await page.locator('#dyn-turn').fill(String(turn));
    assert.match(await page.locator('#dyn-turn-value').innerText(), turn > 0 ? /右转/ : /左转/);
    const frame = await advance(100);
    await page.locator('#dyn-replay').evaluate(el => { el.max = String(window.__dynamicsLab.simulation.frames.length - 1); el.value = el.max; el.dispatchEvent(new Event('input')); });
    const rendered = await page.evaluate(() => {
      const lab = window.__dynamicsLab, view = lab.view, root = view.model.root, length = lab.simulation.boat.profile.length;
      // Inspect the rendered bow from an upright camera behind the starting heading.
      view.controls.enableDamping = false; view.controls.target.copy(root.position);
      view.camera.position.copy(root.position).add(root.position.clone().set(0, length * 1.5, -length * 3)); view.controls.update();
      view.render(lab.simulation.snapshot(), lab.simulation.frames, true, true);
      const bow = root.localToWorld(root.position.clone().set(0, 0, length / 2)).project(view.camera);
      const stern = root.localToWorld(root.position.clone().set(0, 0, -length / 2)).project(view.camera);
      const thrust = root.parent.getObjectByName('thrust-vector'), direction = root.position.clone().set(0, 1, 0).applyQuaternion(thrust.quaternion);
      const expected = (view.model.parts['thruster-center'] ?? root).getWorldDirection(root.position.clone());
      if (lab.simulation.snapshot().thrust.reduce((sum, force) => sum + force, 0) < 0) expected.negate();
      return { bowScreenOffset: bow.x - stern.x, thrustAlignment: direction.dot(expected) };
    });
    assert.ok(rendered.bowScreenOffset * Math.sign(turn) > .01, `${id}: rendered bow must turn ${turn > 0 ? 'right' : 'left'} at throttle ${throttle}`);
    assert.ok(rendered.thrustAlignment > .999999, `${id}: arrow must match the actual thruster axis`);
    if (id === 'usv-survey') assert.equal(frame.steering, 0);
    report.steering.push({ id, throttle, turn, ...rendered });
  }
  await page.screenshot({ path: `${folder}/boat-desktop.png`, fullPage: true });
  for (const camera of ['overview', 'top', 'follow']) await page.locator('#dyn-camera').selectOption(camera);
  await page.locator('#dyn-vectors').uncheck(); await page.locator('#dyn-trail').uncheck(); await page.locator('#dyn-vectors').check(); await page.locator('#dyn-trail').check();
  await page.locator('#dyn-run').click(); await page.locator('#mode-models').click(); const hidden = await page.evaluate(() => window.__dynamicsLab.simulation.time);
  await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.__dynamicsLab.simulation.time), hidden);
  await page.locator('#mode-dynamics').click(); assert.equal(await page.evaluate(() => window.__dynamicsLab.running), false);
  await page.locator('#dyn-model').selectOption('usv-patrol');
  for (const [id, value] of [['mass', '0.1'], ['thrust', '5000'], ['lag', '0.01'], ['drag', '0']]) { await page.locator(`#dyn-${id}`).fill(value); await page.locator(`#dyn-${id}`).blur(); }
  await page.locator('#dyn-turn').fill('1'); await page.locator('#dyn-throttle').fill('1'); await page.locator('#dyn-run').click();
  await page.waitForFunction(() => /积分超出|有限数/.test(document.querySelector('#dyn-message').textContent));
  assert.equal(await page.locator('#dyn-run').isDisabled(), true);
  assert.ok(await page.evaluate(() => window.__dynamicsLab.view.model.root.position.toArray().every(Number.isFinite)));
  await page.locator('#dyn-defaults').click();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `${folder}/mobile-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    await page.locator('#dyn-setup > summary').click(); assert.equal(await page.locator('#dyn-model').isVisible(), true); await page.locator('#dyn-setup > summary').click();
    await page.locator('#dyn-parameters-details summary').click(); assert.equal(await page.locator('#dyn-mass').isVisible(), true); await page.locator('#dyn-parameters-details summary').click();
  }
  assert.deepEqual(report.errors, []); delete report.currentModel; report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error); await page.screenshot({ path: `${folder}/failure.png`, fullPage: true }); throw error; }
finally { await writeFile(`${folder}/acceptance.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
