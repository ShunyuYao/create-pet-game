import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[],actors=[],queues=[[],[]];let connected=true,closed=false;
const manifest={interaction:{protocol:{id:'pet-tictactoe',version:1}}};
function element(id=''){return {id,textContent:'',hidden:false,disabled:false,dataset:{},listeners:{},classList:{toggle(){}},addEventListener(n,f){this.listeners[n]=f;},setAttribute(){},append(e){this.elements.set(e.id,e);}};}
function setup(index){
 const elements=new Map();for(const id of ['pet-sdk','connection','error','portrait-note','status','detail','preview-help','board','leave',...Array.from({length:2},(_,p)=>['portrait-'+p,'fallback-'+p,'name-'+p,'player-'+p,'ready-'+p,'mark-'+p]).flat()]){const e=element(id);e.elements=elements;elements.set(id,e);}
 elements.get('pet-sdk').textContent=JSON.stringify(manifest);
 const timeouts=new Set(),intervals=new Set();
 const pet={capabilities:{request:async()=>({status:'granted'})},character:{getCurrent:async()=>null},sessions:{getContext:async()=>({protocol:manifest.interaction.protocol,role:index===0?'host':'guest',peer:{displayName:index===0?'Guest':'Host'}}),join:async()=>({status:'connected',epoch:1}),send:async m=>{if(connected&&!closed)queues[1-index].push({type:'message',message:structuredClone(m)});return {status:'peer_received'};},poll:async({cursor})=>{await sleep(30);const events=connected?queues[index].splice(0):[];return {cursor:cursor+events.length,events,transportState:closed?'closed':connected?'connected':'reconnecting',epoch:connected?1:2};},leave:async()=>{closed=true;return {released:true};}}};
 const root={pet,TextEncoder,crypto:webcrypto,console,setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);timeouts.add(t);return t;},clearTimeout,setInterval:(fn,ms)=>{const t=setInterval(fn,ms);intervals.add(t);return t;},clearInterval,document:{getElementById:id=>elements.get(id),createElement:()=>element()},addEventListener(){}};root.window=root;
 vm.createContext(root);vm.runInContext(fs.readFileSync('examples/tictactoe/pet-character.js','utf8'),root);vm.runInContext(fs.readFileSync('examples/tictactoe/pet-bridge.js','utf8'),root);vm.runInContext(fs.readFileSync('examples/tictactoe/game.js','utf8'),root);
 return {root,elements,get:()=>JSON.parse(JSON.stringify(root.petGameDebug())),click:id=>{const e=elements.get(id);if(!e.disabled&&!e.hidden)e.listeners.click();},stop:()=>{for(const t of timeouts)clearTimeout(t);for(const t of intervals)clearInterval(t);}};
}
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await sleep(40);}throw Error('timeout');}
function check(name,fn){assert(fn(),name);checks.push(name);}
try{
 actors.push(setup(0),setup(1));const [a,b]=actors;
 await until(()=>a.get().connection==='connected'&&b.get().connection==='connected');
 a.click('ready-0');b.click('ready-1');await until(()=>b.get().state.phase==='playing');
 check('two SDK peers agree on initial state',()=>JSON.stringify(a.get().state)===JSON.stringify(b.get().state));
 b.click('cell-4');check('guest cannot move out of turn',()=>b.get().state.board[4]===null);
 a.click('cell-0');await until(()=>b.get().state.board[0]===0);
 b.click('cell-3');await until(()=>a.get().state.board[3]===1&&!b.get().pending);
 const old=structuredClone(a.get().state),seq=old.ack[1];
 queues[0].push({type:'message',message:{type:'game.action',payload:{seq,round:1,kind:'move',cell:4}}});await sleep(150);
 check('duplicate action does not mutate board',()=>a.get().state.board[4]===null&&a.get().state.rev===old.rev);
 // Invalid snapshot followed by authoritative snapshot in one poll batch.
 queues[1].push({type:'message',message:{type:'game.state',payload:{bad:true}}},{type:'message',message:{type:'game.state',payload:a.get().state}});await sleep(200);
 check('malformed event does not block later events',()=>b.get().state.board[3]===1);
 connected=false;await until(()=>a.get().connection==='reconnecting'&&b.get().connection==='reconnecting');
 a.click('cell-1');check('disconnect freezes legal move',()=>a.get().state.board[1]===null);
 connected=true;await until(()=>a.get().connection==='connected'&&b.get().connection==='connected');await sleep(200);
 check('reconnect restores matching snapshot',()=>JSON.stringify(a.get().state)===JSON.stringify(b.get().state));
 for(const [actor,n] of [[a,1],[b,4],[a,2]]){actor.click('cell-'+n);await until(()=>a.get().state.board[n]!==null&&b.get().state.board[n]!==null&&!b.get().pending);}
 check('host-authoritative winner equal on both peers',()=>a.get().state.winner===0&&b.get().state.winner===0);
 b.click('ready-1');await until(()=>a.get().state.ready[1]);check('single peer rematch waits',()=>a.get().state.phase==='ended');
 a.click('ready-0');await until(()=>b.get().state.round===2);
 check('both peers reset with rotated first player',()=>a.get().state.turn===1&&b.get().state.board.every(v=>v===null));
 const before=a.get().state.rev;
 queues[0].push({type:'message',message:{type:'game.action',payload:{seq:a.get().state.ack[1]+1,round:1,kind:'move',cell:8}}});await until(()=>a.get().state.rev>before);
 check('late previous-round move rejected',()=>a.get().state.board[8]===null);
 await a.elements.get('leave').listeners.click();await until(()=>b.get().connection==='closed');
 check('host leave closes peer and locks board',()=>b.elements.get('cell-0').disabled);
 fs.mkdirSync('evidence/final-protocol',{recursive:true});fs.writeFileSync('evidence/final-protocol/report.json',JSON.stringify({ok:true,scope:'In-process simulated SDK, not real host or LAN; avatars not tested',checks},null,2));console.log(JSON.stringify({ok:true,checks},null,2));
}finally{for(const a of actors)a.stop();}
