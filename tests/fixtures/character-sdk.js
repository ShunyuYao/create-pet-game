(function(){
 const f=window.characterFixture={mode:'2d',allowed:true,requests:0,reads:0,person:'male'};
 function png(kind,color='#b35f43'){
  const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
  if(kind==='head'){x.fillStyle=color;x.beginPath();x.ellipse(256,256,150,190,0,0,Math.PI*2);x.fill();x.fillStyle='#332e28';x.fillRect(198,220,20,20);x.fillRect(294,220,20,20);x.fillRect(226,300,60,12);}
  else if(kind==='pet'){x.fillStyle=color;x.fillRect(230,204,52,104);}
  else{x.fillStyle=color;x.fillRect(0,0,512,512);}
  return c.toDataURL('image/png');
 }
 const base=png('pet');
 const asset=url=>({contentType:'image/png',dataBase64:url.split(',')[1]});
 const shape={outline:[[0,0],[1,0],[1,1],[0,1]],distance:{size:8,pixels:Array(64).fill(255)}};
 const assets={head:asset(png('head')),top:asset(png('print','#8b9b6b')),bottom:asset(png('print','#576e90')),bump:asset(png('print','#808080')),shape:{contentType:'application/json',dataBase64:btoa(JSON.stringify(shape))}};
 const garment=(kind,name)=>({kind,assets:{front:name,back:name,frontBump:'bump',backBump:'bump',shape:'shape'}});
 const realtime=()=>({key:'fixture',name:'合成布偶',signature:'wardrobe-v2',renderer:'rat-doll-renderer',dataVersion:2,data:{person:f.person,headScale:1,garments:{top:garment('tee','top'),bottom:garment('shorts','bottom')}},assets});
 window.pet={capabilities:{query:async()=>({status:f.allowed?'available':'revoked'}),request:async()=>{f.requests++;return {status:f.allowed?'granted':'unknown'};}},character:{getCurrent:async({states:[id]})=>{f.reads++;if(!f.allowed)throw Error('permission_denied');if(id==='greet')throw Error('CHARACTER_STATE_UNAVAILABLE');return {key:'fixture',name:'透明边距测试角色',signature:'fixture-'+id,poses:[{id,dataUrl:base}]};},getRealtime:async()=>f.mode==='3d'?realtime():null},sessions:{getContext:async()=>null,join(){},poll(){},send(){}}};
})();
