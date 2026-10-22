import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/qingzhou',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[],report={errors,memory:[]};page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});await page.locator('#mode-environments').click();
await page.waitForFunction(()=>window.__environmentWorkbench?.runtime.config.environment.variant==='qingzhou');
await page.waitForFunction(()=>document.querySelector('#env-sky-status').textContent.includes('CC0'));
assert.equal(await page.locator('[data-env]').count(),5);
assert.ok(await page.evaluate(()=>window.__environmentWorkbench.renderer.capabilities.logarithmicDepthBuffer));
await page.locator('#env-immersive').click();
for(const name of ['establishing','waterline','aerial','context']){await page.locator(`[data-shot="${name}"]`).click();await page.waitForTimeout(400);await page.screenshot({path:`artifacts/qingzhou/${name}.png`});}
await page.locator('[data-shot="establishing"]').click();
report.performance=await page.evaluate(async()=>{const e=window.__environmentWorkbench;for(const id of ['quadrotor-survey','quadrotor-heavy','quadrotor-protected','quadrotor-rescue','quadrotor-cargo','usv-survey','usv-utility','usv-rescue','usv-sampling','usv-endurance'])e.addVehicle(id);let prev;const times=[];for(let i=0;i<100;i++){const t=await new Promise(requestAnimationFrame);if(i>10)times.push(t-prev);prev=t;}const mean=times.reduce((a,b)=>a+b,0)/times.length;return {vehicles:e.runtime.vehicles.length,meanMs:mean,fps:1000/mean,canvas:[e.renderer.domElement.width,e.renderer.domElement.height],drawCalls:e.renderer.info.render.calls};});
const roundtrip=await page.evaluate(()=>{const e=window.__environmentWorkbench,c=e.snapshot();e.importText(JSON.stringify(c));return JSON.stringify(c.vehicles)===JSON.stringify(e.snapshot().vehicles);});assert.ok(roundtrip);
report.orbit=await page.evaluate(async()=>{const e=window.__environmentWorkbench;const samples=[];for(let i=0;i<90;i++){const a=i/90*Math.PI*2;e.camera.position.set(Math.cos(a)*1000,180,Math.sin(a)*1000);e.camera.lookAt(0,70,0);await new Promise(requestAnimationFrame);samples.push(e.renderer.info.render.triangles);}return {frames:samples.length,minTriangles:Math.min(...samples),maxTriangles:Math.max(...samples)};});
for(let i=0;i<3;i++) {await page.evaluate(()=>{const e=window.__environmentWorkbench;e.importText(JSON.stringify(e.snapshot()));});await page.waitForFunction(()=>document.querySelector('#env-sky-status').textContent.includes('CC0'));await page.waitForTimeout(150);report.memory.push(await page.evaluate(()=>({...window.__environmentWorkbench.renderer.info.memory})));}
assert.deepEqual(report.memory[0],report.memory[2]);
// Legacy harbor remains reachable for regression, not a real-site library entry.
await page.evaluate(()=>window.__environmentWorkbench.switchEnvironment('deepwater'));await page.waitForFunction(()=>document.querySelector('#env-sky-status').textContent.includes('CC0'));
for(let i=0;i<4;i++){await page.evaluate(i=>{const e=window.__environmentWorkbench;e.camera.position.set(Math.cos(i*Math.PI/2)*1500,220,Math.sin(i*Math.PI/2)*1500);e.camera.lookAt(0,0,-400);},i);await page.waitForTimeout(200);await page.screenshot({path:`artifacts/qingzhou/harbor-depth-${i}.png`});}
await page.evaluate(()=>window.__environmentWorkbench.switchEnvironment('qingzhou'));await page.waitForFunction(()=>document.querySelector('#env-sky-status').textContent.includes('CC0'));
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/qingzhou/mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);report.result='passed';
}finally{await writeFile('artifacts/qingzhou/acceptance.json',JSON.stringify(report,null,2));await browser.close();}console.log(report);
