import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {inspectHtml} from '../create-pet-game/scripts/validate-game.mjs';
const require=createRequire(import.meta.url),Bridge=require('../create-pet-game/assets/starter/pet-bridge.js');
const skill=fileURLToPath(new URL('../create-pet-game/',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await sleep(20);}assert.fail('wait timed out');};
function pair(){
 const queues=[[],[]],states=['connected','connected'],epochs=[1,1],sent=[[],[]];let cursor=0;
 const sdk=[0,1].map(i=>({capabilities:{request:async()=>({status:'granted'})},sessions:{
  getContext:async()=>({role:i?'guest':'host',protocol:{id:'test',version:1},peer:{displayName:'peer'}}),join:async()=>({status:states[i],epoch:epochs[i]}),
  send:async m=>{sent[i].push(m);queues[1-i].push({type:'message',message:m});return {status:'queued',seq:sent[i].length};},
  poll:async()=>{await sleep(5);return {cursor:++cursor,events:queues[i].splice(0),epoch:epochs[i],transportState:states[i]};},
  leave:async()=>{states[0]=states[1]='closed';return {released:true,peerAcknowledged:true};}
 }}));return {sdk,queues,states,epochs,sent};
}
test('package builds from a copied skill in an empty directory without repository imports',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pet-skill-offline-'));
 try{
  const copy=path.join(root,'skill');fs.cpSync(skill,copy,{recursive:true});
  execFileSync(process.execPath,[path.join(copy,'scripts/init-game.mjs'),'project','--id','new-game','--title','A < B'],{cwd:root});
  execFileSync(process.execPath,[path.join(copy,'scripts/build-game.mjs'),'project','dist/game.html'],{cwd:root});
  const html=fs.readFileSync(path.join(root,'dist/game.html'),'utf8');assert(inspectHtml(html).ok);assert(html.includes('<title>A &lt; B</title>'));
  assert(!html.includes(skill));assert(!html.includes('/Users/'));assert(!html.includes('pet-hide-duel'));
  assert.throws(()=>execFileSync(process.execPath,[path.join(copy,'scripts/init-game.mjs'),'project'],{cwd:root,stdio:'pipe'}));
  const mutations=[html.replace('</head>','<script src="https://example.com/a.js"></script></head>'),html.replace('<button id="ready">','<button id="ready" onclick="alert(1)">'),html.replace('"transport":"lan"','"transport":"internet"'),html.replace('"players":2','"players":8'),html.replace('</head>',html.match(/<script id="pet-sdk"[\s\S]*?<\/script>/)[0]+'</head>')];
  for(const changed of mutations)assert.equal(inspectHtml(changed).ok,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('no SDK is explicitly a preview; a denied capability cannot silently join',async()=>{
 const local=Bridge.create();assert.equal((await local.connect()).mode,'preview');await local.leave();
 let joined=false;const errors=[];const denied=Bridge.create({sdk:{capabilities:{request:async()=>({status:'unknown'})},sessions:{getContext(){},join(){joined=true;},poll(){},send(){}}},onError:e=>errors.push(e.message)});
 await assert.rejects(denied.connect(),/permission_not_granted/);assert.equal(joined,false);assert(errors.length);denied.dispose();
});
test('latest coalesces; callback failure does not poison the event queue; resync and close propagate',async()=>{
 const p=pair(),received=[],errors=[],resync=[0,0];
 const links=p.sdk.map((sdk,i)=>Bridge.create({sdk,protocol:{id:'test',version:1},onError:e=>errors.push(e.message),onResync:()=>resync[i]++,onMessage:m=>{if(m.type==='broken')throw Error('fixture error');received.push(m);}}));
 try{
  await Promise.all(links.map(l=>l.connect()));
  for(let n=0;n<100;n++)links[1].latest('input','input',{n});
  await until(()=>received.some(m=>m.type==='input'&&m.payload.n===99));assert(p.sent[1].filter(m=>m.type==='input').length<5);
  await links[1].reliable('broken',{});await links[1].reliable('good',{ok:true});await until(()=>received.some(m=>m.type==='good'));assert(errors.includes('fixture error'));
  p.states[0]='reconnecting';await until(()=>links[0].snapshot().status==='reconnecting');p.states[0]='connected';p.epochs[0]++;const previous=resync[0];await until(()=>resync[0]>previous);
  await links[1].leave();await until(()=>links[0].snapshot().status==='closed');
 }finally{links.forEach(l=>l.dispose());}
});
test('protocol mismatch and oversize messages fail explicitly',async()=>{
 const p=pair(),bad=Bridge.create({sdk:p.sdk[0],protocol:{id:'wrong',version:1}});await assert.rejects(bad.connect(),/protocol_mismatch/);bad.dispose();
 const link=Bridge.create({sdk:p.sdk[0]});await link.connect();try{assert.throws(()=>link.latest('state','state',{text:'x'.repeat(60000)}),/too_large/);await assert.rejects(link.reliable('control',{text:'x'.repeat(9000)}),/too_large/);}finally{link.dispose();}
});
test('closing during authorization cannot resurrect or join the session',async()=>{
 const p=pair();let release,joins=0;p.sdk[0].capabilities.request=()=>new Promise(r=>release=r);p.sdk[0].sessions.join=async()=>{joins++;return {status:'connected',epoch:1};};
 const link=Bridge.create({sdk:p.sdk[0]});const connecting=link.connect();link.dispose();release({status:'granted'});
 await assert.rejects(connecting,/session_closed/);assert.equal(joins,0);assert.equal(link.snapshot().status,'closed');
});
