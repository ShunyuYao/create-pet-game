#!/usr/bin/env node
// Isolated Chrome + a static local server. No desktop-pet repository or SDK mock.
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
  for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!document.body?.innerText.trim()'))break;await sleep(100);}
  await evaluate('document.fonts.ready');await sleep(300);
  report.page=await evaluate('({title:document.title,textLength:document.body.innerText.trim().length,canvases:document.querySelectorAll("canvas").length,buttons:document.querySelectorAll("button").length})');
  if(!report.page.textLength)throw Error('Blank document');
  report.checks=[];
  async function check(name,expression){if(!await evaluate(expression))throw Error(name);report.checks.push(name);}
  async function click(selector){const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(r.width<=0||r.height<=0||r.top<0||r.bottom>innerHeight||!(hit===e||e.contains(hit)))throw Error('not hittable');return {x,y};})()`);for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...r});}
  await check('preview explicitly labeled',`petGameDebug().connection==='preview'&&document.querySelector('#connection').textContent.includes('尚未联机')`);
  await click('#ready-0');await check('one ready does not start',`petGameDebug().state.phase==='lobby'&&petGameDebug().state.ready[0]`);
  await click('#cell-0');await check('board locked before both ready',`petGameDebug().state.board.every(x=>x===null)`);
  await click('#ready-1');await check('both ready starts round',`petGameDebug().state.phase==='playing'&&petGameDebug().state.round===1`);
  await click('#cell-0');await click('#cell-0');await check('occupied square cannot be overwritten',`petGameDebug().state.board[0]===0&&petGameDebug().state.turn===1`);
  for(const n of [3,1,4,2])await click('#cell-'+n);
  await check('X wins with highlighted line',`petGameDebug().state.winner===0&&document.querySelectorAll('.win').length===3&&document.querySelector('#status').textContent.includes('获胜')`);
  await click('#cell-8');await check('moves locked after win',`petGameDebug().state.board[8]===null`);
  await click('#ready-0');await check('one rematch approval does not reset',`petGameDebug().state.phase==='ended'`);
  await click('#ready-1');await check('two approvals reset and rotate starter',`petGameDebug().state.round===2&&petGameDebug().state.turn===1&&petGameDebug().state.board.every(x=>x===null)`);
  for(const n of [0,1,2,4,3,5,7,6,8])await click('#cell-'+n);
  await check('draw detected',`petGameDebug().state.winner==='draw'&&document.querySelector('#status').textContent.includes('平局')`);
  await activate('#ready-0');await activate('#ready-1');
  for(const n of [0,3,1,4,8,5])await click('#cell-'+n);
  await check('O wins',`petGameDebug().state.winner===1&&petGameDebug().state.round===3`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
  await check('375px viewport no horizontal overflow',`document.documentElement.scrollWidth<=innerWidth`);
  await click('#ready-0');await click('#ready-1');await click('#cell-4');
  await check('small viewport board playable',`petGameDebug().state.board[4]===1`);
  const boardShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'mobile.png'),Buffer.from(boardShot.data,'base64'));
  await click('#leave');await check('leave closes preview and locks board',`petGameDebug().connection==='closed'&&Array.from(document.querySelectorAll('.cell')).every(b=>b.disabled)`);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'preview.png'),Buffer.from(screenshot.data,'base64'));
  report.ok=errors.length===0;
}catch(error){errors.push(error.message);process.exitCode=1;}
finally{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('browser closed'));}pending.clear();ws?.close();
  if(child?.pid){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else{try{process.kill(-child.pid,'SIGTERM');}catch{}}await sleep(300);}
  server?.closeAllConnections();server?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}
