// MIT — create-pet-game contributors. Render authorized realtime data locally.
import * as THREE from './vendor/vendor/three.module.js';
import * as CANNON from './vendor/vendor/cannon-es.js';
import {createAppearance} from './vendor/appearance.mjs';
import {pose} from './vendor/pose.mjs';
import {validateShape} from './vendor/data-contract.mjs';
function decode(snapshot){
  if(snapshot?.renderer!=='rat-doll-renderer'||snapshot.dataVersion!==2)throw Error('character_renderer_unsupported');
  const {data,assets}=snapshot;
  if(!data||!assets||!['female','male'].includes(data.person))throw Error('character_realtime_invalid');
  let total=0;
  function asset(id){
    if(typeof id!=='string'||!Object.hasOwn(assets,id))throw Error('character_asset_missing');
    const v=assets[id];if(!v||typeof v.dataBase64!=='string'||v.dataBase64.length>16*1024*1024||!v.dataBase64.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.dataBase64))throw Error('character_asset_invalid');
    total+=v.dataBase64.length;if(total>24*1024*1024)throw Error('character_assets_too_large');return v;
  }
  function image(id){const v=asset(id);if(!['image/png','image/jpeg','image/webp'].includes(v.contentType))throw Error('character_asset_type');return `data:${v.contentType};base64,${v.dataBase64}`;}
  function contour(id){const v=asset(id);if(v.contentType!=='application/json'||v.dataBase64.length>500000)throw Error('character_contour_invalid');return validateShape(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.dataBase64),c=>c.charCodeAt(0)))));}
  const garments={};
  for(const slot of ['top','bottom']){
    const g=data.garments?.[slot],allowed=slot==='top'?['sweater','tee','shirt']:['denim','shorts','jeans'];
    if(!g||!allowed.includes(g.kind))throw Error('character_garment_invalid');
    garments[slot]={kind:g.kind,assets:{}};
    for(const field of ['front','back','frontBump','backBump'])garments[slot].assets[field]=image(g.assets?.[field]);
    garments[slot].assets.shape=contour(g.assets?.shape);
  }
  const headScale=data.headScale??1;if(!Number.isFinite(headScale)||headScale<.75||headScale>2)throw Error('character_head_scale');
  return {person:data.person,headScale,headUrl:image('head'),garments};
}
export async function render(snapshot){
  const input=decode(snapshot),canvas=document.createElement('canvas');
  const scene=new THREE.Scene();let renderer;
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setSize(384,512,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-3,-5,7);scene.add(light);
    const doll=await createAppearance(input,scene,new CANNON.World(),[]);
    pose(doll,'idle',0);
    const bounds=new THREE.Box3();scene.updateMatrixWorld(true);
    for(const body of doll.bodies)bounds.expandByObject(body.visual);
    for(const garment of doll.garments.items)bounds.expandByObject(garment.mesh);
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const height=Math.max(size.z,size.x/(384/512))*1.16,half=height/2;
    const camera=new THREE.OrthographicCamera(-half*.75,half*.75,half,-half,.1,50);
    camera.up.set(0,0,1);camera.position.set(center.x,center.y-12,center.z);camera.lookAt(center);
    const poses=[];
    for(const [id,frame] of [['idle',0],['walk',6]]){
      pose(doll,id,frame);scene.updateMatrixWorld(true);renderer.render(scene,camera);
      poses.push({id,label:({idle:'站立',walk:'行走',greet:'招手'})[id],dataUrl:canvas.toDataURL('image/png')});
    }
    return poses;
  } finally {
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)o.skeleton.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});
    for(const m of materials){for(const v of Object.values(m))if(v?.isTexture&&v.image?.src)textures.add(v);m.dispose();}
    for(const g of geometries)g.dispose();for(const t of textures)t.dispose();renderer?.dispose();renderer?.forceContextLoss();
  }
}
