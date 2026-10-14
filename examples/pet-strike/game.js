(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const walls=[{x:210,y:90,w:70,h:150},{x:210,y:320,w:70,h:150},{x:680,y:90,w:70,h:150},{x:680,y:320,w:70,h:150},{x:410,y:200,w:140,h:50},{x:410,y:310,w:140,h:50}];
let mode='preview',role='host',me=0,connection='idle',localReady=false,reloadCount=0,lastNet=0,lastStateAt=0,shared=false,portrait,appearanceBusy=false;
const sprites=[{},{}];let renderedPets=[false,false];
let state={round:0,phase:'lobby',scores:[0,0],ready:[false,false],players:[],bullets:[],time:45,winner:null};
const keys=new Set(),images=[null,null];let aim=0,fire=false;
let inputs=[empty(),empty()];function empty(){return {x:0,y:0,aim:0,fire:false,reload:0,ready:false,round:0};}
function clear(){keys.clear();fire=false;inputs[me]=empty();}function err(e){$('error').hidden=false;$('error').textContent='连接或角色读取出现问题：'+e.message;}
function publish(){if(role==='host'&&connection==='connected')link.latest('state','game.state',state);}
function spawn(){state.players=[{x:100,y:280,hp:100,ammo:12,reload:0,cool:0,seen:0,angle:0},{x:860,y:280,hp:100,ammo:12,reload:0,cool:0,seen:0,angle:Math.PI}];state.bullets=[];state.time=45;state.phase='playing';state.round++;state.ready=[false,false];inputs=[empty(),empty()];localReady=false;reloadCount=0;clear();publish();}
function accept(i,d){if(!d||d.round!==state.round||!Number.isFinite(d.x)||!Number.isFinite(d.y)||!Number.isFinite(d.aim)||!Number.isSafeInteger(d.reload)||d.reload<0||d.reload>100000||typeof d.ready!=='boolean')return;if(i===1)lastNet=performance.now();inputs[i]={...d,x:Math.max(-1,Math.min(1,d.x)),y:Math.max(-1,Math.min(1,d.y)),fire:d.fire===true};if(state.phase!=='playing'){state.ready[i]=d.ready;if(state.ready.every(Boolean)){if(state.phase==='ended')state.scores=[0,0];spawn();}}}
function submit(){const d={round:state.round,x:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y:Number(keys.has('KeyS'))-Number(keys.has('KeyW')),aim,fire,reload:reloadCount,ready:localReady};if(role==='host')accept(0,d);else link.latest('input','game.input',d);}
const link=PetGameBridge.create({protocol:JSON.parse($('pet-sdk').textContent).interaction.protocol,onStatus(s){mode=s.mode;const oldMe=me;role=s.role;me=role==='guest'?1:0;if(oldMe!==me){[sprites[0],sprites[1]]=[sprites[1],sprites[0]];[images[0],images[1]]=[images[1],images[0]];}connection=s.status;clear();$('connection').textContent=({preview:'本地训练 · 电脑对手',connected:'已连接 · '+(s.peer?.displayName||'好友'),waiting:'等待好友进入',reconnecting:'断线暂停 · 正在恢复',closed:'对局已关闭',error:'连接失败'})[connection]||'正在连接';if(connection==='connected')void share();if(role==='host')publish();},onMessage(m){if(role==='host'&&m.type==='game.input')accept(1,m.payload);if(role==='guest'&&m.type==='game.state'){const n=m.payload;if(!n||!Number.isSafeInteger(n.round)||n.round<state.round||!['lobby','playing','between','ended'].includes(n.phase)||!Array.isArray(n.players)||!Array.isArray(n.scores))return;if(n.round!==state.round||(n.phase!==state.phase&&n.phase!=='playing')){localReady=false;reloadCount=0;clear();}state=n;lastStateAt=performance.now();}},onResync(){clear();inputs=[empty(),empty()];publish();},async onCharacter(c){await loadCharacter(1-me,c);$('peer-name').textContent=c.name;},onPortrait(u){if(!images[1-me])return loadImage(1-me,u);},onError:err});
async function loadImage(i,u){const img=new Image();img.src=u;await img.decode();images[i]=img;return img;}
async function loadCharacter(i,c){
  const loaded={};for(const p of c.poses){const img=new Image();img.src=p.dataUrl;await img.decode();loaded[p.id]=img;}
  sprites[i]=loaded;images[i]=loaded.idle||Object.values(loaded)[0];
  const preview=$(i===me?'pet-preview':'peer-preview');preview.src=images[i].src;preview.hidden=false;
  $(i===me?'self-placeholder':'peer-placeholder').hidden=true;
}
async function share(){if(!portrait||shared||connection!=='connected')return;shared=true;try{await link.shareCharacter(portrait);}catch(e){shared=false;err(e);}}
async function refreshCharacter(){
  if(appearanceBusy||state.phase==='playing')return;appearanceBusy=true;portrait=null;images[me]=null;sprites[me]={};shared=false;
  $('pet-note').textContent='正在读取当前桌宠…';$('retry-character').disabled=true;
  try{
    const value=await link.readCharacter();
    if(!value){$('pet-note').textContent='浏览器训练读不到桌宠。可上传自己的透明图片预览，导入桌宠后会读取真实形象。';$('self-name').textContent='训练玩家';return;}
    portrait=await PetCharacter.normalize(value);await loadCharacter(me,portrait);
    $('self-name').textContent=portrait.name;$('pet-note').textContent=(value.source==='realtime'?'已读取当前 3D 换装外观':'已读取当前桌宠形象')+' · '+portrait.poses.length+' 个姿势。'+value.warnings.join(' ');
    $('error').hidden=true;await share();
  }catch(e){$('pet-note').textContent=PetCharacter.explain(e);$('pet-preview').hidden=true;$('self-placeholder').hidden=false;}
  finally{appearanceBusy=false;$('retry-character').disabled=false;}
}
$('retry-character').addEventListener('click',()=>void refreshCharacter());
$('upload-character').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f||state.phase==='playing')return;
  if(!['image/png','image/webp'].includes(f.type)||f.size>8*1024*1024){$('pet-note').textContent='请选择小于 8 MB 的透明 PNG 或 WebP。';return;}
  try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});
    portrait=await PetCharacter.normalize({key:'user-upload',name:f.name.replace(/\.[^.]+$/,''),signature:'upload',poses:[{id:'idle',dataUrl}]});
    await loadCharacter(me,portrait);shared=false;$('self-name').textContent=portrait.name;$('pet-note').textContent='使用你选择的图片；可重新读取切回桌宠。';await share();
  }catch(e){$('pet-note').textContent=PetCharacter.explain(e);}
});
function blocked(x,y,r=15){return x<r||x>960-r||y<r||y>560-r||walls.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h);}
function finish(w){state.winner=w;if(w!==null)state.scores[w]++;state.phase=state.scores.some(n=>n>=5)?'ended':'between';state.ready=[false,false];localReady=false;fire=false;publish();}
function step(dt){if(state.phase!=='playing')return;if(mode==='session'&&connection!=='connected')return;if(mode==='session'&&performance.now()-lastNet>800)inputs[1]=empty();state.time-=dt;
if(mode==='preview'){const a=state.players[1],b=state.players[0],dist=Math.hypot(b.x-a.x,b.y-a.y);inputs[1]={...empty(),round:state.round,aim:Math.atan2(b.y-a.y,b.x-a.x)+Math.sin(performance.now()/650)*.12,fire:true,x:dist>290?-1:0,y:Math.sin(performance.now()/1700)>.1?1:-1,reload:a.ammo===0?a.seen+1:a.seen};}
state.players.forEach((p,i)=>{const d=inputs[i],length=Math.hypot(d.x,d.y)||1,v=180*dt;let nx=p.x+d.x/length*v,ny=p.y+d.y/length*v;if(!blocked(nx,p.y))p.x=nx;if(!blocked(p.x,ny))p.y=ny;p.walking=!!(d.x||d.y);p.angle=d.aim;p.cool=Math.max(0,p.cool-dt);if(d.reload>p.seen){p.seen=d.reload;if(p.ammo<12&&p.reload<=0)p.reload=1.3;}if(p.reload>0){p.reload-=dt;if(p.reload<=0)p.ammo=12;}if(d.fire&&p.cool===0&&p.reload<=0&&p.ammo>0){p.ammo--;p.cool=.19;state.bullets.push({x:p.x+Math.cos(p.angle)*22,y:p.y+Math.sin(p.angle)*22,vx:Math.cos(p.angle)*720,vy:Math.sin(p.angle)*720,owner:i,life:1.5});}});
state.bullets=state.bullets.filter(b=>{b.life-=dt;const slices=4;for(let j=0;j<slices;j++){b.x+=b.vx*dt/slices;b.y+=b.vy*dt/slices;if(blocked(b.x,b.y,2))return false;const p=state.players[1-b.owner];if(Math.hypot(p.x-b.x,p.y-b.y)<17){p.hp=Math.max(0,p.hp-25);return false;}}return b.life>0;});if(state.players.some(p=>p.hp<=0))finish(state.players[0].hp===state.players[1].hp?null:state.players[0].hp>state.players[1].hp?0:1);else if(state.time<=0)finish(state.players[0].hp===state.players[1].hp?null:state.players[0].hp>state.players[1].hp?0:1);}
function draw(){ctx.fillStyle='#eee7d5';ctx.fillRect(0,0,960,560);ctx.strokeStyle='#ddd4bf';ctx.lineWidth=1;for(let x=0;x<960;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,560);ctx.stroke();}for(let y=0;y<560;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}ctx.fillStyle='#dae1c9';ctx.fillRect(20,230,120,100);ctx.fillStyle='#ecd6bf';ctx.fillRect(820,230,120,100);walls.forEach(w=>{ctx.fillStyle='#c5baa4';ctx.fillRect(w.x+6,w.y+8,w.w,w.h);ctx.fillStyle='#c5ac81';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#e6d6b7';ctx.fillRect(w.x,w.y,w.w,4);});state.bullets.forEach(b=>{ctx.fillStyle='#bc6844';ctx.beginPath();ctx.arc(b.x,b.y,3,0,7);ctx.fill();});renderedPets=[false,false];state.players.forEach((p,i)=>{
  const moving=p.walking===true,body=(moving&&sprites[i].walk)||sprites[i].idle||images[i];
  ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#5b514a24';ctx.beginPath();ctx.ellipse(0,22,26,7,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=i?'#c67950':'#748768';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,21,27,8,0,0,Math.PI*2);ctx.stroke();
  if(body){ctx.drawImage(body,-44,-59,88,88);renderedPets[i]=true;}
  else{ctx.fillStyle=i?'#c67950':'#748768';ctx.font='bold 30px system-ui';ctx.textAlign='center';ctx.fillText(i===me?'你':'练',0,10);}
  ctx.rotate(p.angle);ctx.fillStyle='#b27a45';ctx.fillRect(14,-4,22,8);ctx.fillStyle='#dec39b';ctx.fillRect(32,-5,5,10);ctx.restore();
  ctx.fillStyle='#d4c8b3';ctx.fillRect(p.x-22,p.y-65,44,4);ctx.fillStyle=i?'#c67950':'#748768';ctx.fillRect(p.x-22,p.y-65,44*p.hp/100,4);
});
const paused=mode==='session'&&(connection!=='connected'||(role==='guest'&&performance.now()-lastStateAt>1800));if(state.phase!=='playing'||paused){ctx.fillStyle='#f8f2e6ed';ctx.fillRect(0,0,960,560);ctx.textAlign='center';ctx.fillStyle='#3c4637';ctx.font='bold 32px system-ui';ctx.fillText(paused?'连接恢复中 · 对局暂停':state.phase==='lobby'?'进入竞技场':state.phase==='ended'?'玩家 '+(state.scores[0]>=5?1:2)+' 赢得比赛':state.winner===null?'本回合平局':'玩家 '+(state.winner+1)+' 赢得回合',480,258);ctx.fillStyle='#748768';ctx.font='16px system-ui';ctx.fillText(localReady?'你已准备 · 等待对方':'点击下方按钮准备',480,296);}
$('score').textContent=state.scores.join(' : ');$('status').textContent=state.phase==='playing'?'第 '+state.round+' 回合 · '+Math.max(0,Math.ceil(state.time))+' 秒':'先赢 5 回合 · 双方准备开局';const p=state.players[me];$('hud').textContent=p?p.hp+' HP · '+(p.reload>0?'换弹中':p.ammo+' / 12'): '100 HP · 12 / 12';$('ready').disabled=state.phase==='playing'||localReady||appearanceBusy||!['preview','connected'].includes(connection)||(mode==='session'&&(!portrait||!images[1-me]));$('retry-character').disabled=appearanceBusy||state.phase==='playing';$('upload-character').disabled=state.phase==='playing';$('ready').textContent=localReady?'已准备':mode==='preview'?(state.phase==='lobby'?'开始训练':state.phase==='ended'?'再来一场':'下一回合'):'我准备好了';}
$('ready').addEventListener('click',()=>{if(mode==='preview'){if(state.phase==='ended')state.scores=[0,0];spawn();}else{localReady=true;submit();}canvas.focus();});function reload(){if(state.phase==='playing')reloadCount++;}$('reload').addEventListener('click',reload);$('leave').addEventListener('click',async()=>{clear();state.phase='lobby';await link.leave();window.desktopGame?.exit();});
window.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','KeyR'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='KeyR'&&!e.repeat)reload();}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect(),p=state.players[me];if(p)aim=Math.atan2((e.clientY-r.top)*560/r.height-p.y,(e.clientX-r.left)*960/r.width-p.x);});canvas.addEventListener('mousedown',e=>{if(e.button===0){fire=true;canvas.focus();}});window.addEventListener('mouseup',()=>fire=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
const timer=setInterval(()=>{if(role==='host'||connection==='connected')submit();publish();},100);let previous=performance.now();function frame(now){const dt=Math.min(.035,(now-previous)/1000);previous=now;if(role==='host')step(dt);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
// Read-only inspection for gameplay verification.
window.petGameDebug=()=>JSON.parse(JSON.stringify({mode,role,connection,state,appearance:{self:!!portrait,peer:!!images[1-me],source:portrait?.source||null,poses:portrait?.poses.map(p=>p.id)||[],rendered:renderedPets}}));
void link.connect().catch(err);void refreshCharacter();window.addEventListener('pagehide',()=>{clearInterval(timer);link.dispose();});
})();