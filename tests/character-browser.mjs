#!/usr/bin/env node
// Isolated Chrome + a static local server. Synthetic SDK data, real browser rendering; no real host/LAN.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { inspectHtml, contentSecurityPolicy } from '../create-pet-game/scripts/validate-game.mjs';
const args=process.argv.slice(2),file=args[0];
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const candidates=[option('--browser',process.env.CHROME_PATH),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',...(process.env.PROGRAMFILES?[path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe')]:[])];
let server,child,profile,ws;const errors=[],pending=new Map();let serial=0;
const report={ok:false,scope:'real Chrome/WebGL and keyboard UI with synthetic SDK/appearance data; not real host/LAN',errors};
const out=path.resolve(option('--out','browser-evidence'));
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
async function activate(selector){
  const hit=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'center'});e.focus();const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&(h===e||e.contains(h));})()`);
  if(!hit)throw Error('Control is not visible/hittable: '+selector);
  for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
}
try{
  if(!file)throw Error('Usage: node browser-smoke.mjs game.html --out evidence [--browser executable] [--exercise-starter]');
  if(typeof WebSocket!=='function')throw Error('Node.js 22+ is required');
  const html=fs.readFileSync(file,'utf8'),inspection=inspectHtml(html);
  if(!inspection.ok)throw Error(inspection.errors.join('; '));report.sha256=inspection.sha256;
  const executable=candidates.find(p=>p&&fs.existsSync(p));if(!executable)throw Error('Chrome/Chromium not found; set CHROME_PATH or --browser. Browser check NOT run.');
  fs.mkdirSync(out,{recursive:true});profile=fs.mkdtempSync(path.join(os.tmpdir(),'pet-game-browser-'));
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}if(req.url!=='/'){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':contentSecurityPolicy(html)});res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn(executable,['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--mute-audio','about:blank'],{stdio:'ignore',detached:process.platform!=='win32'});
  child.on('error',error=>errors.push(error.message));
  const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++){if(child.exitCode!==null)throw Error('Chrome exited before debugging was ready');await sleep(100);}if(!fs.existsSync(active))throw Error('Chrome startup timeout');
  const port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description||'').join(' '));
  };
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1000,height:820,deviceScaleFactor:1,mobile:false});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(new URL('./fixtures/character-sdk.js',import.meta.url),'utf8')});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!document.body'))break;await sleep(100);}
  await evaluate('document.fonts.ready');await sleep(300);
  report.page=await evaluate('({title:document.title,textLength:document.body.innerText.trim().length,canvases:document.querySelectorAll("canvas").length,graphics:document.querySelectorAll("svg,img").length,buttons:document.querySelectorAll("button").length})');
  if(!report.page.textLength&&!report.page.canvases&&!report.page.graphics)throw Error('Blank document');
  report.checks=[];
  async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout: '+expression);}
  function check(label){report.checks.push(label);}
  await until('window.petGameDebug?.().appearance.self===true');
  const cropped=await evaluate(`(()=>{const img=document.getElementById('pet-preview');const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,256,256).data;let first=256,last=0;for(let y=0;y<256;y++)for(let col=0;col<256;col++)if(d[(y*256+col)*4+3]>8){first=Math.min(first,y);last=Math.max(last,y);}return last-first;})()`);
  if(!await evaluate('PetCharacter.read().then(PetCharacter.normalize).then(async c=>(await PetCharacter.normalize(c)).poses[0].dataUrl===c.poses[0].dataUrl)'))throw Error('Normalization changes an already prepared sprite');check('prepared sprite normalization is idempotent before peer transfer');
  if(cropped<225)throw Error('Transparent padding still shrinks the character');check('transparent 512px source cropped to a recognizable full body');
  await activate('#ready');await until('petGameDebug().appearance.rendered[0]');check('2D body actually drawn in shooting arena');
  // Reload creates a new real game; fixture mutation only controls the SDK response.
  await cdp('Page.reload');await until('window.petGameDebug?.().appearance.self===true');
  await evaluate('characterFixture.allowed=false');await activate('#retry-character');
  await until('document.getElementById("pet-note").textContent.includes("尚未允许")');
  if(await evaluate('petGameDebug().appearance.self'))throw Error('Denied read kept stale character');check('denial clears stale character and shows actionable permission error');
  await evaluate('characterFixture.allowed=true');await activate('#retry-character');await until('petGameDebug().appearance.self');check('real retry button recovers after authorization');
  await evaluate('characterFixture.mode="3d"');await activate('#retry-character');
  await until('petGameDebug().appearance.source==="realtime"');
  const png=await evaluate('document.getElementById("pet-preview").src');
  if(png.length<5000)throw Error('3D rendered output unexpectedly empty');
  check('rat-doll v2 assets render through real WebGL to a full-body PNG');
  const shape=await evaluate(`(()=>{const im=document.getElementById('pet-preview');const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,256,256).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;})()`);
  if(shape<3000||shape>60000)throw Error('3D silhouette not visible/transparent');
  await activate('#ready');await until('petGameDebug().appearance.rendered[0]');check('rendered 3D appearance used as actual game character');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(s=>fs.writeFileSync(path.join(out,'3d-playing.png'),Buffer.from(s.data,'base64')));
  await cdp('Page.reload');await until('window.petGameDebug?.().appearance.self===true');
  await evaluate('characterFixture.mode="3d";characterFixture.person="female"');await activate('#retry-character');await until('petGameDebug().appearance.source==="realtime"');check('female v2 appearance renders on a subsequent read without stale resources');
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
  if(!await evaluate('document.documentElement.scrollWidth<=innerWidth'))throw Error('narrow view overflows');check('375px layout remains within viewport');
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'preview.png'),Buffer.from(screenshot.data,'base64'));
  report.ok=errors.length===0;
}catch(error){errors.push(error.message);process.exitCode=1;}
finally{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('browser closed'));}pending.clear();ws?.close();
  if(child?.pid){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else{try{process.kill(-child.pid,'SIGTERM');}catch{}}await sleep(300);}
  server?.closeAllConnections();server?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}
