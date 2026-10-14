import {build} from 'esbuild';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../create-pet-game/assets/character/',import.meta.url);
await build({entryPoints:[fileURLToPath(new URL('sprite.mjs',root))],outfile:fileURLToPath(new URL('pet-doll-sprite.js',root)),bundle:true,minify:true,format:'iife',globalName:'PetDollSprite',target:'chrome120',legalComments:'none'});
const names=['vendor/LICENSE.pet-ragdoll-renderer','vendor/vendor/LICENSE.three','vendor/upstream/LICENSE.cannon-es'];
fs.writeFileSync(new URL('LICENSES.txt',root),names.map(n=>n+'\n'+fs.readFileSync(new URL(n,root),'utf8')).join('\n\n'));
