#!/usr/bin/env node
// Prepare portable, pinned inputs. Host registration remains an explicit local operation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {inspectHtml} from './validate-game.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(file,limit){
  const fd=fs.openSync(file,'r');
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||!stat.size||stat.size>limit)throw Error('Invalid or oversized input');
    const bytes=Buffer.alloc(stat.size+1);let size=0,n;
    while(size<bytes.length&&(n=fs.readSync(fd,bytes,size,bytes.length-size,size)))size+=n;
    if(size!==stat.size||fs.fstatSync(fd).size!==stat.size)throw Error('Input changed during read');
    return bytes.subarray(0,size);
  }finally{fs.closeSync(fd);}
}
function imageExtension(bytes){
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return '.webp';
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return '.jpg';
  throw Error('Poster must be PNG, WebP or JPEG; decode it in a browser before import');
}
export function prepareVibeImport({html,poster,output,id,title,description=''}){
  if(!html||!poster||!output||typeof id!=='string'||! /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>120||typeof description!=='string'||description.length>1000)throw Error('Invalid import options');
  const content=read(html,10*1024*1024),cover=read(poster,8*1024*1024);
  if(content.includes(0))throw Error('HTML contains NUL bytes');
  const report=inspectHtml(new TextDecoder('utf-8',{fatal:true}).decode(content));
  if(!report.ok)throw Error(report.errors.join('\n'));
  const extension=imageExtension(cover),supplied=path.extname(poster).toLowerCase().replace('.jpeg','.jpg');
  if(supplied!==extension)throw Error('Poster extension does not match its bytes');
  const entry={id,title:title.trim(),category:'games',description,kind:'game',file:id+'.html',poster:id+extension,sha256:hash(content),posterSha256:hash(cover),source:id+'.html',posterSource:id+extension};
  const receipt={schemaVersion:1,scope:'prepared inputs only; product registration and real host not proven',files:[{name:entry.file,sha256:entry.sha256,bytes:content.length},{name:entry.poster,sha256:entry.posterSha256,bytes:cover.length}],warnings:report.warnings};
  const destination=path.resolve(output);fs.mkdirSync(path.dirname(destination),{recursive:true});
  // Exclusive directory creation prevents overwriting an earlier delivery or source input.
  fs.mkdirSync(destination);
  try{
    for(const [name,bytes] of [[entry.file,content],[entry.poster,cover],['catalog-entry.json',JSON.stringify(entry,null,2)+'\n'],['receipt.json',JSON.stringify(receipt,null,2)+'\n']])fs.writeFileSync(path.join(destination,name),bytes,{flag:'wx'});
  }catch(error){fs.rmSync(destination,{recursive:true,force:true});throw error;}
  return {entry,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href){
  try{
    const args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!['html','poster','output','id','title','description'].includes(key)||args[i+1]===undefined||Object.hasOwn(options,key))throw Error('Usage: prepare-vibe-import.mjs --html game.html --poster cover.webp --output new-directory --id my-game --title "我的游戏" [--description "简介"]');options[key]=args[i+1];}
    console.log(JSON.stringify(prepareVibeImport(options),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
