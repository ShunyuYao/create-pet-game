#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const usage='node install.mjs [--to <Codex skills directory>]';
try {
  const args=process.argv.slice(2);
  if(args.includes('--help')){console.log(usage);process.exit(0);}
  if(args.length && (args.length!==2||args[0]!=='--to'||!args[1]))throw Error(usage);
  const base=path.resolve(args[1]||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'skills'));
  const source=fileURLToPath(new URL('./create-pet-game/',import.meta.url)),dest=path.join(base,'create-pet-game');
  if(!fs.existsSync(path.join(source,'SKILL.md')))throw Error('Missing create-pet-game/SKILL.md; extract the complete ZIP first.');
  fs.mkdirSync(base,{recursive:true});
  // Exclusive creation protects any existing skill, including local edits.
  try{fs.mkdirSync(dest);}catch(error){if(error.code==='EEXIST')throw Error('Target already exists. Back it up and move it aside before updating: '+dest);throw error;}
  try{fs.cpSync(source,dest,{recursive:true,errorOnExist:true,force:false});}
  catch(error){fs.rmSync(dest,{recursive:true,force:true});throw error;}
  console.log('Installed: '+dest+'\nOpen a new Codex session and invoke $create-pet-game.');
}catch(error){console.error(error.message);process.exitCode=1;}
