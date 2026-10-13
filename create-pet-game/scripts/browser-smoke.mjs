#!/usr/bin/env node
// Isolated Chrome + a static local server. No desktop-pet repository or SDK mock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { inspectHtml, contentSecurityPolicy } from './validate-game.mjs';
const args=process.argv.slice(2),file=args[0];
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const candidates=[option('--browser',process.env.CHROME_PATH),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',...(process.env.PROGRAMFILES?[path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe')]:[])];
let server,child,profile,ws;const errors=[],pending=new Map();let serial=0;
const report={ok:false,scope:'headless browser preview only; no real desktop-pet SDK/LAN',errors};
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
  await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!document.body'))break;await sleep(100);}
  await evaluate('document.fonts.ready');await sleep(300);
  report.page=await evaluate('({title:document.title,textLength:document.body.innerText.trim().length,canvases:document.querySelectorAll("canvas").length,graphics:document.querySelectorAll("svg,img").length,buttons:document.querySelectorAll("button").length})');
  if(!report.page.textLength&&!report.page.canvases&&!report.page.graphics)throw Error('Blank document');
  if(args.includes('--exercise-starter')){
    await activate('#ready');await evaluate('document.querySelector("#game").focus()');
    for(let n=0;n<5;n++)for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});
    report.starter=await evaluate('petGameDebug()');
    if(report.starter.state.phase!=='ended'||report.starter.state.winner!==0)throw Error('Starter preview did not reach victory through real input');
    await activate('#ready');const reset=await evaluate('petGameDebug().state');if(reset.round!==2||reset.scores.some(x=>x!==0))throw Error('Starter rematch did not reset');
  }
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'preview.png'),Buffer.from(screenshot.data,'base64'));
  report.ok=errors.length===0;
}catch(error){errors.push(error.message);process.exitCode=1;}
finally{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('browser closed'));}pending.clear();ws?.close();
  if(child?.pid){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else{try{process.kill(-child.pid,'SIGTERM');}catch{}}await sleep(300);}
  server?.closeAllConnections();server?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}
