(function(){
'use strict';
const $=id=>document.getElementById(id), protocol=JSON.parse($('pet-sdk').textContent).interaction.protocol;
let mode='preview',role='host',me=0,connection='idle',pending=null,sequence=0,portrait=null,shared=false;
let state={round:0,rev:0,phase:'lobby',board:Array(9).fill(null),turn:0,winner:null,line:[],ready:[false,false],ack:[0,0]};
const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const names=['玩家一','玩家二'];
function error(e){$('error').hidden=false;$('error').textContent=({host_sdk_unsupported:'当前桌宠不支持作品联机，请升级到兼容客户端。',permission_not_granted:'未获授权，请允许作品权限后重新打开。',protocol_mismatch:'游戏版本不一致，请重新发送同一份 HTML。'})[e.message]||'操作暂未完成：'+e.message;}
function publish(){if(mode==='session'&&role==='host'&&connection==='connected')link.latest('state','game.state',state);}
function apply(player,d){
 if(!d||!Number.isSafeInteger(d.seq)||d.seq<1||d.seq<=state.ack[player]){publish();return;}
 state.ack[player]=d.seq;state.rev++;
 if(d.round===state.round){
  if(d.kind==='ready'&&state.phase!=='playing'){
   state.ready[player]=true;
   if(state.ready.every(Boolean))state={...state,round:state.round+1,phase:'playing',board:Array(9).fill(null),turn:state.round%2,winner:null,line:[],ready:[false,false]};
  }else if(d.kind==='move'&&state.phase==='playing'&&state.turn===player&&Number.isInteger(d.cell)&&d.cell>=0&&d.cell<9&&state.board[d.cell]===null){
   state.board[d.cell]=player;const line=lines.find(l=>l.every(i=>state.board[i]===player));
   if(line){state.phase='ended';state.winner=player;state.line=line;}
   else if(state.board.every(n=>n!==null)){state.phase='ended';state.winner='draw';}
   else state.turn=1-player;
  }
 }
 publish();render();
}
function submit(kind,cell,player=me){
 if(!['preview','connected'].includes(connection)||pending)return;
 const d={seq:mode==='preview'?state.ack[player]+1:++sequence,round:state.round,kind,cell};
 if(mode==='preview'||role==='host')apply(player,d);
 else{pending={data:d,id:crypto.randomUUID()};sendPending();render();}
}
function sendPending(){if(pending&&connection==='connected')void link.reliable('game.action',pending.data,pending.id).catch(error);}
function valid(s){return s&&Number.isSafeInteger(s.round)&&Number.isSafeInteger(s.rev)&&['lobby','playing','ended'].includes(s.phase)&&Array.isArray(s.board)&&s.board.length===9&&s.board.every(n=>n===null||n===0||n===1)&&[0,1].includes(s.turn)&&[null,0,1,'draw'].includes(s.winner)&&Array.isArray(s.line)&&s.line.every(n=>Number.isInteger(n)&&n>=0&&n<9)&&Array.isArray(s.ready)&&s.ready.length===2&&s.ready.every(n=>typeof n==='boolean')&&Array.isArray(s.ack)&&s.ack.length===2&&s.ack.every(Number.isSafeInteger);}
const link=PetGameBridge.create({protocol,
 onStatus(s){mode=s.mode;role=s.role;me=role==='host'?0:1;connection=s.status;
  $('connection').textContent=({preview:'本地预览 · 同屏轮流试玩，尚未联机',waiting:'等待好友接受邀请…',connected:'局域网会话已连接',reconnecting:'连接中断 · 暂停落子，正在恢复…',closed:'对局已关闭 · 请重新发送邀请',error:'连接不可用'})[connection]||'正在连接…';
  if(mode==='session'){names[me]='我的桌宠';names[1-me]=s.peer?.displayName||'好友';}
  render();if(connection==='connected'){publish();sendPending();share();}
 },
 onMessage(m){if(role==='host'&&m.type==='game.action')apply(1,m.payload);
  if(role==='guest'&&m.type==='game.state'){if(!valid(m.payload))throw Error('invalid_game_state');if(m.payload.rev<state.rev)return;state=m.payload;if(pending&&state.ack[me]>=pending.data.seq)pending=null;sequence=Math.max(sequence,state.ack[me]);render();}
 },
 onResync(){publish();sendPending();},
 onPortrait(url){$('portrait-'+(1-me)).src=url;$('portrait-'+(1-me)).hidden=false;$('fallback-'+(1-me)).hidden=true;},onError:error
});
function share(){if(portrait&&connection==='connected'&&!shared){shared=true;void link.sharePortrait(portrait).catch(e=>{shared=false;error(e);});}}
function render(){
 const available=['preview','connected'].includes(connection);
 for(let p=0;p<2;p++){
  $('name-'+p).textContent=names[p];$('player-'+p).classList.toggle('active',state.phase==='playing'&&state.turn===p);
  const b=$('ready-'+p);b.hidden=mode==='session'&&p!==me;b.disabled=!available||!!pending||state.phase==='playing'||state.ready[p];b.textContent=state.ready[p]?'已准备 · 等对方':state.phase==='ended'?'再来一局':'准备开始';
  $('mark-'+p).textContent=(p===0?'×':'○')+(mode==='session'&&p===me?' · 你':'');
 }
 for(let i=0;i<9;i++){const b=$('cell-'+i),v=state.board[i];b.textContent=v===null?'':v===0?'×':'○';b.dataset.player=v===null?'':v;b.classList.toggle('win',state.line.includes(i));b.disabled=!available||!!pending||state.phase!=='playing'||v!==null||(mode==='session'&&state.turn!==me);b.setAttribute('aria-label',`第 ${Math.floor(i/3)+1} 行第 ${i%3+1} 列，${v===null?'空位':v===0?'叉':'圆'}`);}
 $('status').textContent=state.phase==='lobby'?'双方准备，开始第一局':state.phase==='ended'?(state.winner==='draw'?'平局！势均力敌':names[state.winner]+' 获胜！'):`第 ${state.round} 局 · 轮到${names[state.turn]} ${state.turn===0?'×':'○'}`;
 $('detail').textContent=pending?'正在等待房主确认…':state.phase==='ended'?'双方点击「再来一局」后重开，轮换先手。':state.phase==='lobby'?'双方各自点击准备。浏览器中可代双方操作。':'横、竖、斜任意三个相同棋子连线即获胜。';
 $('preview-help').hidden=mode!=='preview';
}
for(let i=0;i<9;i++){const b=document.createElement('button');b.id='cell-'+i;b.className='cell';b.addEventListener('click',()=>submit('move',i,mode==='preview'?state.turn:me));$('board').append(b);}
for(let p=0;p<2;p++)$('ready-'+p).addEventListener('click',()=>submit('ready',null,p));
$('leave').addEventListener('click',async()=>{try{await link.leave();window.desktopGame?.exit();}catch(e){error(e);}});
const heartbeat=setInterval(()=>{if(connection==='connected'){publish();sendPending();}},1000);
window.addEventListener('pagehide',()=>{clearInterval(heartbeat);link.dispose();});
window.petGameDebug=()=>JSON.parse(JSON.stringify({mode,role,connection,state,pending}));
void link.connect().then(async()=>{try{portrait=await link.readCharacter();if(!portrait?.poses?.[0]?.dataUrl){$('portrait-note').textContent='未读取到桌宠头像，使用棋子头像。';return;}names[me]=portrait.name||'我的桌宠';$('portrait-'+me).src=portrait.poses[0].dataUrl;$('portrait-'+me).hidden=false;$('fallback-'+me).hidden=true;share();render();}catch(e){$('portrait-note').textContent='桌宠头像不可用，使用棋子头像。';}}).catch(error);
render();
})();
