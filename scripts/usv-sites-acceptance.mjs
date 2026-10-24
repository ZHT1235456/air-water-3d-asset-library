import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const folder='artifacts/usv-sites';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const report={errors:[],sites:[],memory:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const sky=()=>page.waitForFunction(()=>document.querySelector('#env-sky-status')?.textContent==='360° HDR · CC0');
try {
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.locator('#mode-environments').click();await sky();
  assert.deepEqual(await page.locator('[data-env]').evaluateAll(ns=>ns.map(n=>n.dataset.env)),
    ['deepwater','qingzhou','jiuzhou','hornsea','ninepin','westlake','kallang','waalhaven']);
  for(const variant of ['westlake','kallang','waalhaven']) {
    await page.locator(`[data-env="${variant}"]`).click();await sky();
    const state=await page.evaluate(()=>{const e=window.__environmentWorkbench;return {variant:e.snapshot().environment.variant,
      vehicles:e.snapshot().vehicles,issues:e.runtime.vehicles.flatMap(v=>v.issues),routes:e.runtime.environment.root.userData.routes.length};});
    assert.equal(state.variant,variant);assert.equal(state.vehicles.length,12);assert.ok(state.vehicles.every(v=>v.modelId==='usv-survey'));
    assert.deepEqual(state.issues,[]);assert.ok(await page.locator('#env-site-mission').isVisible());
    for(const file of ['sources.json','layout.json','navigation.json','fleet-scene.json','map.svg'])assert.ok((await page.request.get(`http://127.0.0.1:5173/assets/${variant}/${file}`)).ok());
    await page.screenshot({path:`${folder}/${variant}-workbench.png`});
    await page.locator('#env-immersive').click();
    for(const shot of ['establishing','aerial','waterline','context']){
      await page.locator('#env-camera').selectOption(shot);await page.waitForTimeout(250);
      await page.screenshot({path:`${folder}/${variant}-${shot}.png`});
    }
    const performance=await page.evaluate(async()=>{
      const e=window.__environmentWorkbench,intervals=[];let last;
      for(let i=0;i<70;i++){const t=await new Promise(requestAnimationFrame);if(i>10)intervals.push(t-last);last=t;}
      return {fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),p95Ms:intervals.sort((a,b)=>a-b)[Math.floor(intervals.length*.95)],
        calls:e.renderer.info.render.calls,triangles:e.renderer.info.render.triangles,visibleBoats:e.runtime.vehicles.filter(v=>v.handle.root.visible).length};
    });
    assert.equal(performance.visibleBoats,12);
    await page.locator('#env-immersive').click();
    const before=await page.evaluate(()=>window.__environmentWorkbench.snapshot());
    const exported=page.waitForEvent('download');await page.locator('#env-export').click();await (await exported).saveAs(`${folder}/${variant}-export.json`);
    await page.locator('#env-file').setInputFiles(`${folder}/${variant}-export.json`);await sky();
    assert.deepEqual(await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles),before.vehicles);
    const waterTime=()=>page.evaluate(()=>window.__environmentWorkbench.runtime.environment.root.getObjectByName('water-0').material.uniforms.time.value);
    await page.locator('#env-flag-waterAnimation').uncheck();const paused=await waterTime();await page.waitForTimeout(150);assert.equal(await waterTime(),paused);
    await page.locator('#env-flag-waterAnimation').check();await page.waitForTimeout(150);assert.ok(await waterTime()>paused);
    // A saved example is accepted through the same importer as the user's files.
    await page.locator('#env-file').setInputFiles(`public/assets/${variant}/fleet-scene.json`);await sky();
    assert.equal(await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles.length),12);
    report.sites.push({variant,routes:state.routes,boats:12,issues:state.issues,performance});
  }
  for(let i=0;i<3;i++){
    await page.locator('[data-env="qingzhou"]').click();await sky();assert.ok(await page.locator('#env-site-mission').isHidden());
    await page.locator('[data-env="waalhaven"]').click();await sky();await page.locator('#env-camera').selectOption('context');await page.waitForTimeout(150);
    report.memory.push(await page.evaluate(()=>({...window.__environmentWorkbench.renderer.info.memory})));
  }
  assert.deepEqual(report.memory[0],report.memory[2]);
  await page.setViewportSize({width:390,height:844});await page.locator('#env-camera').selectOption('establishing');
  await page.screenshot({path:`${folder}/mobile.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(report.errors,[]);report.result='passed';
} catch(error) { report.result='failed';report.failure=String(error);throw error; }
finally { await writeFile(`${folder}/acceptance.json`,JSON.stringify(report,null,2));await browser.close(); }
console.log(JSON.stringify(report,null,2));
