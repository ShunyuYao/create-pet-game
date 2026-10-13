#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHtml } from './validate-game.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node build-game.mjs project-directory output.html');
  const root=path.resolve(input),read=name=>fs.readFileSync(path.join(root,name),'utf8');
  const config=JSON.parse(read('game.json'));
  if(typeof config.title!=='string'||!config.title.trim()||config.title.length>120||typeof config.description!=='string'||config.description.length>1000)throw Error('Invalid game title/description');
  const sdk={version:2,permissions:config.permissions||['character:read','sessions:connect'],network:[],interaction:{players:2,transport:'lan',protocol:config.protocol}};
  const js=s=>s.replace(/<\/script/gi,'<\\/script');
  const replacements={'__PET_SDK__':JSON.stringify(sdk).replace(/</g,'\\u003c'),'__TITLE__':escape(config.title),'__DESCRIPTION__':escape(config.description),'__STYLE__':read('style.css').replace(/<\/style/gi,'<\\/style'),'__PET_BRIDGE__':js(read('pet-bridge.js')),'__GAME_CODE__':js(read('game.js'))};
  let html=read('index.template.html');
  for(const [marker,value]of Object.entries(replacements)){
    if(['__PET_SDK__','__PET_BRIDGE__','__GAME_CODE__'].includes(marker)&&!html.includes(marker))throw Error('Missing required template marker '+marker);
    html=html.replaceAll(marker,()=>value);
  }
  const license=fs.readFileSync(fileURLToPath(new URL('../LICENSE',import.meta.url)),'utf8');
  const extra=fs.existsSync(path.join(root,'THIRD_PARTY_NOTICES.txt'))?read('THIRD_PARTY_NOTICES.txt'):'';
  html+='\n<!-- Bundled bridge/starter license; not an ownership claim over your original game.\n'+(license+'\n'+extra).replace(/--/g,'- -')+'\n-->\n';
  const {scripts,...report}=inspectHtml(html);if(!report.ok)throw Error(report.errors.join('\n'));
  const file=path.resolve(output);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);
  fs.writeFileSync(file+'.checks.json',JSON.stringify({...report,scope:'static compatibility only; gameplay and real host not proven'},null,2)+'\n');
  console.log(JSON.stringify({file,byteLength:report.byteLength,sha256:report.sha256,warnings:report.warnings},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
