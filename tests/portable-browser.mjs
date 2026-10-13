import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pet-skill-portable-browser-'));
const source=fileURLToPath(new URL('../create-pet-game/',import.meta.url)),copy=path.join(root,'skill');
fs.cpSync(source,copy,{recursive:true});
for(const args of [
 ['init-game.mjs','project','--id','portable-counter','--title','独立技能预览'],
 ['build-game.mjs','project','relocated/game.html'],
 ['validate-game.mjs','relocated/game.html'],
 ['browser-smoke.mjs','relocated/game.html','--out','evidence','--exercise-starter'],
])execFileSync(process.execPath,[path.join(copy,'scripts',args[0]),...args.slice(1)],{cwd:root,stdio:'inherit'});
console.log('Standalone evidence: '+path.join(root,'evidence'));
