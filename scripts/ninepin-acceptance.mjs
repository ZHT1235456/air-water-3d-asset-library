import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/ninepin',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const report={errors:[],entries:[],memory:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const sky=()=>page.waitForFunction(()=>document.querySelector('#env-sky-status')?.textContent==='360° HDR · CC0');
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});await page.locator('#mode-environments').click();await sky();
 assert.deepEqual(await page.locator('[data-env]').evaluateAll(nodes=>nodes.map(n=>n.dataset.env)),['deepwater','qingzhou','jiuzhou','hornsea','ninepin','westlake','kallang','waalhaven']);
 for(const variant of ['deepwater','qingzhou','jiuzhou','hornsea','ninepin']){
  await page.locator(`[data-env="${variant}"]`).click();await sky();
  const entry=await page.evaluate(()=>{const e=window.__environmentWorkbench;return {variant:e.snapshot().environment.variant,source:document.querySelector('#env-source').getAttribute('href'),vehicles:e.snapshot().vehicles,issues:e.runtime.vehicles.flatMap(v=>v.issues)};});
  assert.equal(entry.variant,variant);assert.deepEqual(entry.issues,[]);assert.ok((await page.request.get(new URL(entry.source, page.url()).href)).ok());report.entries.push({variant,source:entry.source});
  await page.locator('#env-add').click();assert.equal(await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles.length),3);
 }
 await page.locator('[data-env="deepwater"]').click();await sky();assert.equal(await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles.length),3);
 await page.screenshot({path:'artifacts/ninepin/deepwater-restored.png'});
 await page.locator('[data-env="ninepin"]').click();await sky();
 assert.equal(await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles.length),3);
 await page.locator('#env-immersive').click();
 for(const shot of ['establishing','waterline','aerial','context']){await page.locator('#env-camera').selectOption(shot);await page.waitForTimeout(300);if(shot==='waterline'){const height=await page.evaluate(()=>window.__environmentWorkbench.camera.position.y);assert.ok(Math.abs(height-4)<.01,'waterline camera stays at 4 m instead of being clamped above its target');report.waterlineCameraY=height;}await page.screenshot({path:`artifacts/ninepin/ninepin-${shot}.png`});}
 await page.mouse.move(900,400);await page.mouse.down();await page.mouse.move(1200,480,{steps:30});await page.mouse.up();await page.waitForTimeout(500);await page.screenshot({path:'artifacts/ninepin/orbit.png'});
 await page.locator('#env-camera').selectOption('top');await page.waitForTimeout(250);await page.screenshot({path:'artifacts/ninepin/ninepin-top.png'});
 await page.locator('#env-immersive').click();
 const times=()=>page.evaluate(()=>['water-0','ninepin-shore-wash'].map(name=>window.__environmentWorkbench.runtime.environment.root.getObjectByName(name).material.uniforms.time.value));
 await page.locator('#env-flag-waterAnimation').uncheck();const t=await times();await page.waitForTimeout(150);assert.deepEqual(await times(),t);
 await page.locator('#env-flag-waterAnimation').check();
 await page.evaluate(()=>{const e=window.__environmentWorkbench;e.select(e.snapshot().vehicles.find(v=>v.modelId.startsWith('usv')).id);});
 for(const [id,value] of [['env-pos-x','-180'],['env-pos-z','255'],['env-yaw','37']]){await page.locator(`#${id}`).fill(value);await page.locator(`#${id}`).dispatchEvent('change');}
 await page.locator('#env-color-primary').fill('#338899');await page.locator('#env-color-primary').dispatchEvent('change');
 const boat=await page.evaluate(()=>window.__environmentWorkbench.snapshot().vehicles.find(v=>v.modelId.startsWith('usv')));assert.deepEqual(boat.position,[-180,0,255]);assert.ok(Math.abs(boat.yaw-37*Math.PI/180)<1e-8);assert.equal(boat.colors.primary,'#338899');
 const roundtrip=await page.evaluate(()=>{const e=window.__environmentWorkbench,c=e.snapshot();e.importText(JSON.stringify(c));return JSON.stringify(c.vehicles)===JSON.stringify(e.snapshot().vehicles);});assert.ok(roundtrip);await sky();
 report.invalidImportProtected=await page.evaluate(()=>{const e=window.__environmentWorkbench,before=e.snapshot(),unknown=structuredClone(before);unknown.vehicles[0].modelId='missing';const invalidNumber=structuredClone(before);invalidNumber.vehicles[0].position[0]=null;return ['{',JSON.stringify(unknown),JSON.stringify(invalidNumber)].every(text=>{let rejected=false;try{e.importText(text);}catch{rejected=true;}return rejected&&JSON.stringify(before.vehicles)===JSON.stringify(e.snapshot().vehicles)&&e.snapshot().environment.variant==='ninepin';});});assert.ok(report.invalidImportProtected);
 for(let i=0;i<3;i++){await page.locator('[data-env="qingzhou"]').click();await sky();await page.locator('[data-env="ninepin"]').click();await sky();await page.waitForTimeout(150);report.memory.push(await page.evaluate(()=>({...window.__environmentWorkbench.renderer.info.memory})));}assert.deepEqual(report.memory[0],report.memory[2]);
 await page.locator('#env-immersive').click();await page.locator('#env-camera').selectOption('establishing');
 report.performance=await page.evaluate(async()=>{const e=window.__environmentWorkbench;while(e.runtime.vehicles.length<12)e.addVehicle(e.runtime.vehicles.length%2?'usv-survey':'quadrotor-survey');const ts=[];let last;for(let i=0;i<130;i++){const t=await new Promise(requestAnimationFrame);if(i>10)ts.push(t-last);last=t;}const mean=ts.reduce((a,b)=>a+b,0)/ts.length;const gl=e.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {vehicles:12,meanMs:mean,fps:1000/mean,p95Ms:ts.sort((a,b)=>a-b)[Math.floor(ts.length*.95)],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),canvas:[e.renderer.domElement.width,e.renderer.domElement.height],calls:e.renderer.info.render.calls};});
 report.performanceOrbit=await page.evaluate(async()=>{const e=window.__environmentWorkbench,start=e.camera.position.clone(),target=e.snapshot().view.target,dx=start.x-target[0],dz=start.z-target[2],ts=[];let last;for(let i=0;i<130;i++){const angle=i*.004;e.camera.position.set(target[0]+dx*Math.cos(angle)-dz*Math.sin(angle),start.y,target[2]+dx*Math.sin(angle)+dz*Math.cos(angle));const t=await new Promise(requestAnimationFrame);if(i>10)ts.push(t-last);last=t;}const mean=ts.reduce((a,b)=>a+b,0)/ts.length;return {mode:'camera orbit, planar reflections refreshed',meanMs:mean,fps:1000/mean,p95Ms:ts.sort((a,b)=>a-b)[Math.floor(ts.length*.95)]};});
 await page.setViewportSize({width:390,height:844});await page.locator('#env-camera').selectOption('establishing');await page.screenshot({path:'artifacts/ninepin/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(e){report.result='failed';report.failure=String(e);throw e;}finally{await writeFile('artifacts/ninepin/acceptance.json',JSON.stringify(report,null,2));await browser.close();}console.log(report);
