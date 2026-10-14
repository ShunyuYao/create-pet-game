import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Character=require('../create-pet-game/assets/starter/pet-character.js'),Bridge=require('../create-pet-game/assets/starter/pet-bridge.js');
const image='data:image/png;base64,AAAA';
const value=(id='idle',key='actual-pet')=>({key,name:'当前桌宠',signature:'sig-'+id,poses:[{id,dataUrl:image}]});
const sdk=()=>({capabilities:{query:async()=>({status:'available'}),request:async()=>({status:'granted'})},character:{getCurrent:async({states})=>value(states[0]),getRealtime:async()=>null}});
test('character is independently readable when LAN API is missing',async()=>{
 const s=sdk(),b=Bridge.create({sdk:s});await assert.rejects(b.connect(),/host_sdk_unsupported/);
 const c=await b.readCharacter();assert.equal(c.key,'actual-pet');assert.deepEqual(c.poses.map(p=>p.id),['idle','walk','greet']);b.dispose();
});
test('missing optional pose is omitted; changed character and unavailable idle are not hidden',async()=>{
 const s=sdk();s.character.getCurrent=async({states:[id]})=>{if(id==='walk')throw Error('CHARACTER_STATE_UNAVAILABLE');return value(id);};
 assert.deepEqual((await Character.read({sdk:s})).poses.map(p=>p.id),['idle','greet']);
 s.character.getCurrent=async({states:[id]})=>value(id,id==='idle'?'a':'b');await assert.rejects(Character.read({sdk:s}),/changed_during_read/);
 s.character.getCurrent=async()=>{throw Error('CHARACTER_IMAGE_UNAVAILABLE');};await assert.rejects(Character.read({sdk:s}),/CHARACTER_IMAGE_UNAVAILABLE/);
});
test('revoked character authorization is re-requested; refusal exposes an actionable error',async()=>{
 const s=sdk();let requests=0;s.capabilities.query=async()=>({status:'revoked'});s.capabilities.request=async()=>{requests++;return {status:'unknown'};};
 await assert.rejects(Character.read({sdk:s}),/character_permission_denied/);assert.equal(requests,1);assert.match(Character.explain(Error('character_permission_denied')),/重新读取/);
});
test('3D appearance uses current realtime bytes and never silently returns an unrelated idle proxy',async()=>{
 const s=sdk();const rt={key:'actual-pet',signature:'outfit-2',renderer:'rat-doll-renderer',dataVersion:2,data:{},assets:{}};s.character.getRealtime=async()=>rt;
 await assert.rejects(Character.read({sdk:s}),/character_renderer_missing/);
 let received;const c=await Character.read({sdk:s,renderRealtime:async x=>{received=x;return value('walk').poses;}});
 assert.equal(received,rt);assert.equal(c.source,'realtime');assert.equal(c.poses[0].id,'walk');assert.match(c.signature,/outfit-2/);
 rt.key='different';await assert.rejects(Character.read({sdk:s,renderRealtime:async()=>value().poses}),/changed_during_read/);
});
test('concurrent LAN/character permission requests share one prompt',async()=>{
 const s=sdk();let authorized=false,requests=0,release;
 s.capabilities.query=async()=>({status:authorized?'available':'not_authorized'});
 s.capabilities.request=()=>{requests++;return new Promise(r=>{release=()=>{authorized=true;r({status:'granted'});};});};
 s.sessions={getContext:async()=>null,join(){},poll(){},send(){}};
 const b=Bridge.create({sdk:s}),connected=b.connect(),character=b.readCharacter();
 await new Promise(r=>setImmediate(r));assert.equal(requests,1);release();await connected;assert.equal((await character).key,'actual-pet');b.dispose();
});
