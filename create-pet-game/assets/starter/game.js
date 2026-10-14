/* Technical example, not a whitelist of game genres. Replace its rules/UI. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const protocol = JSON.parse($('pet-sdk').textContent).interaction.protocol;
  let mode = 'preview', role = 'host', me = 0, connection = 'idle', portrait, shared = false;
  let state = { round: 0, phase: 'lobby', scores: [0,0], ready: [false,false], seen: [0,0], winner: null };
  let localCount = 0, localReady = false, selfImage=null, peerImage=null, loadingCharacter=false;
  function showError(error) {
    const messages={host_sdk_unsupported:'当前桌宠不支持作品联机，请使用兼容版本。',permission_not_granted:'未获得授权，可从作品权限菜单允许后重新打开。',protocol_mismatch:'双方版本不同，请重新发送同一份游戏。',peer_not_connected:'还没有连上朋友，请稍后再试。'};
    $('error').hidden=false;$('error').textContent=messages[error.message]||'暂时遇到问题，请重新打开作品。';console.error(error);
  }
  function publish() { if(role==='host'&&connection==='connected') link.latest('state','game.state',state); }
  function begin() {
    state={round:state.round+1,phase:'playing',scores:[0,0],ready:[false,false],seen:[0,0],winner:null};localCount=0;localReady=false;publish();render();
  }
  function input(player, data) {
    if(!data||data.round!==state.round||!Number.isSafeInteger(data.count)||data.count<0||data.count>100000||typeof data.ready!=='boolean')return;
    if(state.phase!=='playing'){
      state.ready[player]=data.ready;
      if(state.ready.every(Boolean))begin();else{publish();render();}return;
    }
    const delta=Math.max(0,Math.min(5,data.count-state.seen[player]));
    state.seen[player]=Math.max(state.seen[player],data.count);state.scores[player]+=delta;
    if(state.scores[player]>=5){state.phase='ended';state.winner=player;state.ready=[false,false];localReady=false;}
    publish();render();
  }
  function submitInput() {
    if(mode==='preview')return;
    const data={round:state.round,count:localCount,ready:localReady};
    if(role==='host')input(0,data);else link.latest('input','game.input',data);
  }
  const link=PetGameBridge.create({protocol,
    onStatus(s){mode=s.mode;role=s.role;me=role==='host'?0:1;connection=s.status;
      $('connection').textContent=({preview:'本地预览 · 尚未建立联机',waiting:'等待好友进入',connected:'已连接 · 双方准备后开始',reconnecting:'连接中断，正在恢复…',closed:'对局已关闭，请重新发送邀请',error:'连接不可用'})[s.status]||'正在连接…';
      $('peer-name').textContent=s.peer?.displayName||'本地预览玩家';render();
      if(connection==='connected'&&portrait&&!shared){shared=true;void link.shareCharacter(portrait).catch(error=>{shared=false;showError(error);});}
    },
    onMessage(message){
      if(role==='host'&&message.type==='game.input')input(1,message.payload);
      if(role==='guest'&&message.type==='game.state'){
        const next=message.payload;
        if(!next||!Number.isSafeInteger(next.round)||next.round<state.round||!['lobby','playing','ended'].includes(next.phase)||!Array.isArray(next.scores)||next.scores.length!==2||next.scores.some(n=>!Number.isFinite(n)||n<0)||!Array.isArray(next.ready)||next.ready.length!==2)throw Error('invalid_game_state');
        if(next.round!==state.round){localCount=0;localReady=false;}
        if(next.phase==='ended'&&state.phase!=='ended')localReady=false;
        state=next;render();
      }
    },onResync(){publish();if(role==='guest')submitInput();},
    onCharacter(character){$('peer-name').textContent=character.name;},
    onPortrait(dataUrl){$('portrait-peer').src=dataUrl;$('portrait-peer').hidden=false;const im=new Image();im.onload=()=>{peerImage=im;render();};im.src=dataUrl;},onError:showError,
  });
  function render(){
    const ctx=$('game').getContext('2d');ctx.clearRect(0,0,800,400);ctx.fillStyle='#edf4ec';ctx.fillRect(0,0,800,400);
    for(let i=0;i<2;i++){ctx.fillStyle=i?'#dfae68':'#4b8c70';ctx.beginPath();ctx.arc(230+i*340,175,62+state.scores[i]*3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#203e34';ctx.font='bold 34px system-ui';ctx.textAlign='center';ctx.fillText(String(state.scores[i]),230+i*340,188);ctx.font='18px system-ui';ctx.fillText('玩家 '+(i+1),230+i*340,330);const petImage=i===me?selfImage:peerImage;if(petImage)ctx.drawImage(petImage,150+i*340,76,160,160);}
    const available=!loadingCharacter&&(connection==='preview'||connection==='connected'&&!!selfImage&&!!peerImage);$('retry-character').disabled=loadingCharacter||state.phase==='playing';
    $('ready').disabled=!available||state.phase==='playing'||localReady;
    $('ready').textContent=localReady?'已准备，等对方':state.phase==='ended'?'再来一局':'我准备好了';
    $('action').disabled=!available||state.phase!=='playing';
    $('preview-peer').hidden=mode!=='preview';$('preview-peer').disabled=state.phase!=='playing';
    $('preview-help').hidden=mode!=='preview';
    $('status').textContent=state.phase==='ended'?'玩家 '+(state.winner+1)+' 获胜':state.phase==='playing'?'第 '+state.round+' 局 · 先到 5 分获胜':localReady?'等对方准备…':'双方准备后开局';
  }
  function action(player=me){
    if(state.phase!=='playing'||(mode==='session'&&connection!=='connected'))return;
    if(mode==='preview')input(player,{round:state.round,count:state.seen[player]+1,ready:false});else{localCount++;submitInput();}
  }
  $('ready').addEventListener('click',()=>{if(mode==='preview')begin();else{localReady=true;submitInput();render();}});
  $('action').addEventListener('click',()=>action());$('preview-peer').addEventListener('click',()=>action(1));
  $('leave').addEventListener('click',async()=>{try{await link.leave();}catch(error){showError(error);}window.desktopGame?.exit();});
  $('game').addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='Space'){event.preventDefault();action();}if(event.code==='Enter'&&mode==='preview'){event.preventDefault();action(1);}});
  const heartbeat=setInterval(()=>{if(mode==='session'&&connection==='connected'){if(role==='guest')submitInput();else publish();}},350);
  window.addEventListener('pagehide',()=>{clearInterval(heartbeat);link.dispose();});
  // Read-only diagnostic state for integration tests, never a state-mutation hook.
  window.petGameDebug=()=>JSON.parse(JSON.stringify({mode,role,connection,state}));
  async function refreshCharacter(){
    if(loadingCharacter||state.phase==='playing')return;loadingCharacter=true;render();
    try{const value=await link.readCharacter();portrait=value?await PetCharacter.normalize(value):null;shared=false;
      if(portrait){$('self-name').textContent=portrait.name;$('portrait-self').src=portrait.poses[0].dataUrl;$('portrait-self').hidden=false;selfImage=new Image();selfImage.src=portrait.poses[0].dataUrl;await selfImage.decode();$('portrait-note').textContent='已读取当前桌宠，游戏中使用完整形象。'+value.warnings.join(' ');if(connection==='connected'){await link.shareCharacter(portrait);shared=true;}}
      else $('portrait-note').textContent='浏览器预览无法读取桌宠；请在桌宠作品播放器中打开后授权。当前色块仅用于本地玩法演示。';
    }catch(error){selfImage=null;portrait=null;$('portrait-note').textContent=PetCharacter.explain(error);}
    finally{loadingCharacter=false;render();}
  }
  $('retry-character').addEventListener('click',()=>void refreshCharacter());
  void link.connect().catch(showError);void refreshCharacter();
  render();
})();
