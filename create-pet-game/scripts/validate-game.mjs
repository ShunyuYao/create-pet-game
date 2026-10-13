#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function inspectHtml(html) {
  const errors=[], warnings=[], scripts=[]; let manifest=null, declarations=0;
  const fail=message=>errors.push(message);
  const byteLength=Buffer.byteLength(html);
  if(!byteLength||byteLength>10*1024*1024)fail('HTML must be 1 byte–10 MiB');
  if(/__PET_SDK__|__PET_BRIDGE__|__GAME_CODE__|__STYLE__|__TITLE__|__DESCRIPTION__/.test(html))fail('Unexpanded build marker');
  if(/\bsk-[A-Za-z0-9_-]{16,}\b/.test(html))fail('Possible API credential literal; remove it');
  if(/file:\/\/|\/Users\/[^/\s]+\/|[A-Z]:\\Users\\/.test(html))fail('Machine-local path found in artifact');
  const attrs=text=>{
    const out={};let match;
    const re=/([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+)))?/g;
    while((match=re.exec(text))){const k=match[1].toLowerCase();if(Object.hasOwn(out,k))fail('Duplicate HTML attribute: '+k);out[k]=match[2]??match[3]??match[4]??'';}
    return out;
  };
  const tags=/<!--[\s\S]*?(?:-->|$)|<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let match;
  while((match=tags.exec(html))){
    if(!match[1])continue;
    const tag=match[1].toLowerCase(),a=attrs(match[2]);
    if(Object.keys(a).some(k=>/^on[a-z]+$/.test(k)))fail('Inline HTML event handler is blocked by host CSP');
    if(['iframe','object','embed','base'].includes(tag))fail('Unsupported embedded/navigation element: '+tag);
    for(const key of ['src','poster'])if(a[key]&&!/^(data:|blob:|#)/i.test(a[key]))fail('External or relative asset: '+tag+'['+key+']');
    if(tag==='link'&&/stylesheet/i.test(a.rel||''))fail('Stylesheets must be inline');
    if(!['script','style','textarea','title'].includes(tag))continue;
    const end=new RegExp('</'+tag+'\\s*>','gi');end.lastIndex=tags.lastIndex;const close=end.exec(html);
    if(!close){fail('Unclosed '+tag);break;}
    const body=html.slice(tags.lastIndex,close.index);tags.lastIndex=end.lastIndex;
    if(tag==='style'&&(/@import\b/i.test(body)||/url\(\s*["']?(?!data:|blob:|#)[^\s)'"#]/i.test(body)))fail('CSS imports/URLs must be embedded');
    if(tag!=='script')continue;
    if(Object.hasOwn(a,'src'))fail('All executable scripts must be inline');
    if(a.id==='pet-sdk'){
      declarations++;if(a.type?.toLowerCase()!=='application/json'||Buffer.byteLength(body)>8192)fail('pet-sdk must be bounded inline application/json');
      try{manifest=JSON.parse(body);}catch{fail('Invalid pet-sdk JSON');}continue;
    }
    if(a.type==='module'){fail('Bundle module scripts to an inline IIFE');continue;}
    if(a.type&&!['text/javascript','application/javascript'].includes(a.type.toLowerCase()))continue;
    scripts.push(body);
    try{new vm.Script(body);}catch(error){fail('JavaScript syntax: '+error.message);}
    if(/\beval\s*\(|\bnew\s+Function\s*\(/.test(body))fail('Dynamic code evaluation is blocked by host CSP');
    if(/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/.test(body))warnings.push('Direct networking found; host network grants/CSP may block it. Prefer pet.sessions.');
  }
  if(declarations!==1)fail('Exactly one pet-sdk declaration is required');
  if(!scripts.length)fail('No executable inline script');
  if(manifest){
    const keys=Object.keys(manifest);
    if(manifest.version!==2||keys.some(k=>!['version','permissions','network','interaction'].includes(k)))fail('Expected SDK declaration version 2 and supported fields');
    const supported=new Set(['character:read','character:watch','storage:read','storage:write','sessions:connect']);
    if(!Array.isArray(manifest.permissions)||!manifest.permissions.includes('sessions:connect')||manifest.permissions.some(p=>!supported.has(p))||new Set(manifest.permissions).size!==manifest.permissions.length)fail('Unsupported/duplicate permissions or missing sessions:connect');
    if(!Array.isArray(manifest.network)||manifest.network.length)fail('Portable profile requires network:[]; embed resources and use sessions');
    const i=manifest.interaction,p=i?.protocol;
    if(!i||i.players!==2||i.transport!=='lan'||Object.keys(i).some(k=>!['players','transport','protocol'].includes(k)))fail('This portable profile requires a two-player LAN interaction');
    if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(p.id)||!Number.isSafeInteger(p.version)||p.version<1||Object.keys(p).some(k=>!['id','version'].includes(k)))fail('Invalid protocol id/version');
  }
  return {ok:errors.length===0,byteLength,sha256:createHash('sha256').update(html).digest('hex'),errors,warnings:[...new Set(warnings)],manifest,scripts};
}
export function contentSecurityPolicy(html){
  const {scripts}=inspectHtml(html.replace(/\r\n?/g,'\n'));
  const hashes=scripts.map(s=>"'sha256-"+createHash('sha256').update(s).digest('base64')+"'");
  return `default-src 'none'; script-src ${hashes.join(' ')||"'none'"}; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const file=process.argv[2];if(!file)throw Error('Usage: node validate-game.mjs game.html');
    const {scripts,...report}=inspectHtml(fs.readFileSync(file,'utf8'));console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
