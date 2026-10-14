/* MIT — create-pet-game contributors. Host character read independent of LAN. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PetCharacter=api;})(globalThis,function(root){
  'use strict';
  async function authorize(sdk){
    if(!sdk?.character?.getCurrent||!sdk.capabilities?.request)throw Error('character_api_unavailable');
    const query=()=>sdk.capabilities.query?.('character.getCurrent');
    let status=await query();if(status?.status==='available')return;
    if(status&&!['not_authorized','revoked'].includes(status.status))throw Error('character_api_unavailable');
    const grant=await sdk.capabilities.request({});
    status=await query();if(status?status.status!=='available':grant.status!=='granted')throw Error('character_permission_denied');
  }
  function validate(value){
    if(!value||typeof value.key!=='string'||typeof value.name!=='string'||typeof value.signature!=='string'||!Array.isArray(value.poses)||!value.poses.length)throw Error('character_invalid');
    for(const p of value.poses)if(typeof p.id!=='string'||!/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.dataUrl)||p.dataUrl.length>12*1024*1024)throw Error('character_image_invalid');
    return value;
  }
  async function read({sdk=root.pet,renderRealtime=root.PetDollSprite?.render}={}){
    if(!sdk){if(root.desktopGame)throw Error('character_api_unavailable');return null;}
    await authorize(sdk);
    let current=validate(await sdk.character.getCurrent({states:['idle']}));
    const warnings=[];let realtime=null;
    if(sdk.character.getRealtime){
      const cap=await sdk.capabilities.query?.('character.getRealtime');
      if(!cap||cap.status==='available')realtime=await sdk.character.getRealtime();
      else if(['not_authorized','revoked'].includes(cap.status))throw Error('character_permission_denied');
      else warnings.push('实时外观接口不可用，使用已读取的 2D 形象。');
    }
    if(realtime){
      if(realtime.key!==current.key)throw Error('character_changed_during_read');
      if(!renderRealtime)throw Error('character_renderer_missing');
      const poses=await renderRealtime(realtime);
      return validate({...current,poses,signature:current.signature+':'+realtime.signature,source:'realtime',warnings});
    }
    for(const state of ['walk','greet']){
      try{
        const extra=validate(await sdk.character.getCurrent({states:[state]}));
        if(extra.key!==current.key)throw Error('character_changed_during_read');
        current={...current,poses:[...current.poses,...extra.poses],signature:current.signature+':'+extra.signature};
      }catch(error){if(!String(error.message).includes('CHARACTER_STATE_UNAVAILABLE'))throw error;}
    }
    return {...current,source:'2d',warnings};
  }
  async function normalize(character){
    validate(character);if(character.imageFormat==='pet-game-256-v1')return character;const images=[];let bounds={x:Infinity,y:Infinity,right:0,bottom:0};let width=0,height=0;
    for(const p of character.poses.slice(0,3)){
      const image=new Image();image.src=p.dataUrl;await image.decode();
      if(!image.naturalWidth||image.naturalWidth>4096||image.naturalHeight>4096)throw Error('character_image_size');
      // Normalize each pose's source size before a shared crop, retaining pose offsets.
      const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
      const scale=Math.min(512/image.naturalWidth,512/image.naturalHeight);
      x.drawImage(image,(512-image.naturalWidth*scale)/2,(512-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
      const rgba=x.getImageData(0,0,512,512).data;
      for(let y=0;y<512;y++)for(let col=0;col<512;col++)if(rgba[(y*512+col)*4+3]>8){bounds.x=Math.min(bounds.x,col);bounds.y=Math.min(bounds.y,y);bounds.right=Math.max(bounds.right,col+1);bounds.bottom=Math.max(bounds.bottom,y+1);}
      images.push({p,c});
    }
    if(!Number.isFinite(bounds.x))throw Error('character_image_empty');
    width=bounds.right-bounds.x;height=bounds.bottom-bounds.y;
    const poses=images.map(({p,c})=>{const out=document.createElement('canvas');out.width=out.height=256;const scale=232/Math.max(width,height);out.getContext('2d').drawImage(c,bounds.x,bounds.y,width,height,(256-width*scale)/2,(256-height*scale)/2,width*scale,height*scale);return {...p,dataUrl:out.toDataURL('image/png')};});
    return {...character,poses,imageFormat:'pet-game-256-v1'};
  }
  const errors={character_api_unavailable:'当前打开方式不提供角色接口，请在兼容桌宠的作品播放器中打开。',character_permission_denied:'尚未允许读取桌宠，请授权后点“重新读取”。',character_renderer_missing:'当前作品未包含这只 3D 桌宠的渲染组件，请更新作品。',character_renderer_unsupported:'当前作品暂不支持这类 3D 外观，请选择 2D 形象后重试。',character_changed_during_read:'读取期间桌宠形象发生变化，请重新读取。',character_image_empty:'角色图像没有可见像素，请重新应用形象后重试。'};
  return {read,normalize,explain:error=>errors[error?.message]||('角色读取失败：'+error.message+'。请重新应用形象或检查授权后重试。')};
});
