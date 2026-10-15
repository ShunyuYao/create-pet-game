import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareVibeImport} from '../create-pet-game/scripts/prepare-vibe-import.mjs';
const skill=fileURLToPath(new URL('../create-pet-game/',import.meta.url));
const html=fs.readFileSync(new URL('../examples/pet-tictactoe.html',import.meta.url));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3FoAAAAASUVORK5CYII=','base64');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'pet-vibe-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const input=path.join(root,'input');fs.mkdirSync(input);fs.writeFileSync(path.join(input,'game.html'),html);fs.writeFileSync(path.join(input,'poster.png'),png);return {root,options:{html:path.join(input,'game.html'),poster:path.join(input,'poster.png'),output:path.join(root,'delivery'),id:'my-game',title:'新游戏',description:'一起玩'}};}
test('relocated copied skill prepares exact bytes and portable catalog metadata via its CLI',t=>{
  const f=fixture(t),copy=path.join(f.root,'skill');fs.cpSync(skill,copy,{recursive:true});
  const args=Object.entries(f.options).flatMap(([key,value])=>['--'+key,value]);
  execFileSync(process.execPath,[path.join(copy,'scripts/prepare-vibe-import.mjs'),...args],{cwd:f.root});
  const entry=JSON.parse(fs.readFileSync(path.join(f.options.output,'catalog-entry.json'))),receipt=JSON.parse(fs.readFileSync(path.join(f.options.output,'receipt.json')));
  assert.deepEqual(fs.readFileSync(path.join(f.options.output,entry.file)),html);assert.deepEqual(fs.readFileSync(path.join(f.options.output,entry.poster)),png);
  assert.equal(entry.category,'games');assert.equal(entry.kind,'game');assert.equal(entry.sha256,createHash('sha256').update(html).digest('hex'));
  assert.deepEqual(receipt.files.map(x=>x.bytes),[html.length,png.length]);assert.equal(entry.source,'my-game.html');assert(!JSON.stringify({entry,receipt}).includes(f.root));
  assert.deepEqual(fs.readdirSync(f.options.output).sort(),['catalog-entry.json','my-game.html','my-game.png','receipt.json']);
});
test('existing output and source inputs cannot be overwritten',t=>{
  const f=fixture(t);fs.mkdirSync(f.options.output);fs.writeFileSync(path.join(f.options.output,'draft'),'keep');
  assert.throws(()=>prepareVibeImport(f.options),/EEXIST/);assert.equal(fs.readFileSync(path.join(f.options.output,'draft'),'utf8'),'keep');
  assert.throws(()=>prepareVibeImport({...f.options,output:path.dirname(f.options.html)}),/EEXIST/);assert.deepEqual(fs.readFileSync(f.options.html),html);
});
test('invalid SDK, local paths, traversal ids and non-image/mismatched posters publish no packet',t=>{
  const f=fixture(t);for(const bad of ['../escape','a.b','',undefined,123])assert.throws(()=>prepareVibeImport({...f.options,id:bad}),/Invalid import/);
  fs.writeFileSync(f.options.html,html.toString().replace('"players":2','"players":4'));assert.throws(()=>prepareVibeImport(f.options),/two-player/);
  fs.writeFileSync(f.options.html,html.toString().replace('</head>','<img src="file:///private/image.png"></head>'));assert.throws(()=>prepareVibeImport(f.options),/path|asset/);
  fs.writeFileSync(f.options.html,html);fs.writeFileSync(f.options.poster,'<svg/>');assert.throws(()=>prepareVibeImport(f.options),/PNG/);
  fs.writeFileSync(f.options.poster,png);const disguised=path.join(f.root,'cover.webp');fs.writeFileSync(disguised,png);assert.throws(()=>prepareVibeImport({...f.options,poster:disguised}),/extension/);assert(!fs.existsSync(f.options.output));
});
test('size limits and malformed UTF-8 reject before creating the output',t=>{
  const f=fixture(t);const fd=fs.openSync(f.options.poster,'w');fs.ftruncateSync(fd,8*1024*1024+1);fs.closeSync(fd);assert.throws(()=>prepareVibeImport(f.options),/oversized/);
  fs.writeFileSync(f.options.poster,png);fs.writeFileSync(f.options.html,Buffer.from([255,254]));assert.throws(()=>prepareVibeImport(f.options));assert(!fs.existsSync(f.options.output));
});
