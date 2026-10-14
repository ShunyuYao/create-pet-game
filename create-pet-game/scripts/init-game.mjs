#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2),destination=args[0];
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
try{
  if(!destination)throw Error('Usage: node init-game.mjs new-directory --id my-game --title "My Game"');
  const id=option('--id','my-pet-game'),title=option('--title','我的桌宠游戏');
  if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)||!title?.trim())throw Error('Invalid id/title');
  const dir=path.resolve(destination),starter=fileURLToPath(new URL('../assets/starter/',import.meta.url));
  if(fs.existsSync(dir)&&fs.readdirSync(dir).length)throw Error('Destination must be new or empty; existing work is not overwritten');
  fs.mkdirSync(dir,{recursive:true});
  for(const name of ['index.template.html','style.css','game.js','pet-bridge.js','pet-character.js'])fs.copyFileSync(path.join(starter,name),path.join(dir,name));
  fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify({title,character3d:true,description:'按你的玩法改造这份联机起点。',protocol:{id,version:1},permissions:['character:read','sessions:connect']},null,2)+'\n');
  console.log('Created '+dir+'; replace the technical example with the requested game before delivery.');
}catch(error){console.error(error.message);process.exitCode=1;}
