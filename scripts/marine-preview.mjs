import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>console.log('ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
try {
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });await page.locator('#mode-environments').click();await page.waitForTimeout(3500);await page.locator('#env-immersive').click();await page.waitForTimeout(600);
await page.screenshot({path:'artifacts/marine/first-overview.png'});
for(const shot of ['context','waterline','aerial']){await page.locator(`[data-shot="${shot}"]`).click();await page.waitForTimeout(400);await page.screenshot({path:`artifacts/marine/first-${shot}.png`});}
console.log(await page.evaluate(()=>({status:document.querySelector('#env-sky-status').textContent,render:window.__environmentWorkbench.renderer.info.render,issues:window.__environmentWorkbench.runtime.vehicles.map(v=>v.issues)})));
} finally { await browser.close(); }
