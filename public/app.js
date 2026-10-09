const $=id=>document.getElementById(id),canvas=$('arena'),ctx=canvas.getContext('2d');
let token='',myId='',state=null,stream=null,joining=false,sending=false;
const keys={},touch={},aim={x:600,y:380},smooth=new Map();
let firing=false,lastFrame=performance.now();
$('code').value=new URLSearchParams(location.search).get('room')||'';
function notice(s){$('notice').textContent=s;}
async function api(path,data){
  const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('服务器暂时无法连接，请稍后重试');
  const result=await r.json();if(!r.ok)throw Error(result.error||'请求失败');return result;
}
async function join(mode){
  if(joining||token)return;joining=true;
  document.querySelectorAll('.start').forEach(b=>b.disabled=true);
  try{
    const result=await api(mode==='join'?'join':'create',{name:$('name').value,code:$('code').value,training:mode==='training'});
    token=result.token;myId=result.id;
    stream=new EventSource('/events?t='+encodeURIComponent(token));
    const connection=stream;
    stream.onmessage=e=>{
      if(stream!==connection)return;
      state=JSON.parse(e.data);$('lobby').hidden=true;$('leave').hidden=false;$('copy').hidden=false;
      $('room').textContent=(state.training?'练习房 ':'房间 ')+state.code;
      const sec=state.seconds;
      $('clock').textContent=state.phase==='playing'?Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'):state.phase==='countdown'?'准备 '+sec:state.phase==='over'?'下一局 '+sec:'等待加入';
      $('network').textContent='已连接';$('network').style.color='#50f4df';
      const me=state.players.find(p=>p.id===myId);
      $('health').textContent=me?me.hp+' / 100':'—';
      $('dash').textContent=me&&me.dash>0?(me.dash*2.2).toFixed(1)+' 秒':'就绪';
      const board=$('board');board.replaceChildren();
      [...state.players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths).forEach((p,i)=>{
        const row=document.createElement('div');row.className='row';
        const name=document.createElement('span');name.textContent=(i+1)+'. '+p.name+(p.bot?' · AI':p.id===myId?' · 你':'');name.style.color=p.color;
        const score=document.createElement('b');score.textContent=p.kills+' / '+p.deaths;row.append(name,score);board.append(row);
      });
      $('feed').textContent=state.feed.map(f=>f.killer+' 击败 '+f.victim).join('\n');
      const ids=new Set(state.players.map(p=>p.id));
      for(const id of smooth.keys())if(!ids.has(id))smooth.delete(id);
    };
    stream.onerror=()=>{
      if(stream!==connection)return;
      $('network').textContent='连接中断';$('network').style.color='#ffd166';clearInput();
      if(connection.readyState===EventSource.CLOSED)reset('连接已断开，请重新加入房间。');
    };
    notice('');
  }catch(e){notice(e.name==='TimeoutError'?'连接超时，请稍后重试':e.message);}
  finally{joining=false;document.querySelectorAll('.start').forEach(b=>b.disabled=false);}
}
function clearInput(){
  for(const k of Object.keys(keys))delete keys[k];
  for(const k of Object.keys(touch))delete touch[k];firing=false;
}
function reset(message){
  stream?.close();stream=null;token='';state=null;myId='';smooth.clear();clearInput();
  $('lobby').hidden=false;$('copy').hidden=true;$('leave').hidden=true;
  $('room').textContent='尚未加入';$('clock').textContent='03:00';$('network').textContent='未连接';
  $('board').replaceChildren();$('feed').textContent='';$('health').textContent='—';$('dash').textContent='就绪';notice(message||'');
}
$('create').onclick=()=>join('create');$('join').onclick=()=>join('join');$('training').onclick=()=>join('training');
$('leave').onclick=async()=>{try{await api('leave',{});}catch{}reset();};
$('copy').onclick=async()=>{
  if(!state)return;
  const url=new URL(location.href);url.search='?room='+state.code;
  try{await navigator.clipboard.writeText(url.href);$('copy').textContent='已复制';setTimeout(()=>$('copy').textContent='邀请朋友',1500);}
  catch{prompt('将链接发给朋友：',url.href);}
};
window.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)||!token)return;
  const k=e.key.toLowerCase();keys[k]=true;
  if([' ','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k))e.preventDefault();
});
window.addEventListener('keyup',e=>{delete keys[e.key.toLowerCase()];});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
canvas.addEventListener('pointermove',e=>{
  const rect=canvas.getBoundingClientRect();aim.x=(e.clientX-rect.left)/rect.width*1200;aim.y=(e.clientY-rect.top)/rect.height*760;
});
canvas.addEventListener('pointerdown',e=>{if(e.button===0&&token){canvas.focus({preventScroll:true});firing=true;canvas.setPointerCapture(e.pointerId);}});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,()=>firing=false));
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelectorAll('[data-key]').forEach(button=>{
  const key=button.dataset.key;
  button.addEventListener('pointerdown',e=>{e.preventDefault();touch[key]=true;button.setPointerCapture(e.pointerId);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,()=>touch[key]=false));
});
setInterval(async()=>{
  if(!token||!state||sending||document.hidden)return;
  const me=state.players.find(p=>p.id===myId);if(!me)return;
  const down=k=>!!keys[k]||!!touch[k];
  let a=Math.atan2(aim.y-me.y,aim.x-me.x);
  if(matchMedia('(pointer:coarse)').matches){
    const target=state.players.filter(p=>p.id!==myId&&p.hp>0).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];
    if(target)a=Math.atan2(target.y-me.y,target.x-me.x);
  }
  const sentToken=token;sending=true;
  try{await api('input',{x:Number(down('d')||down('arrowright'))-Number(down('a')||down('arrowleft')),y:Number(down('s')||down('arrowdown'))-Number(down('w')||down('arrowup')),a,fire:firing||down(' ')||down('fire'),dash:down('shift')||down('dash')});}
  catch(e){if(token===sentToken)reset(e.name==='TimeoutError'?'连接超时，请重新加入':e.message);}
  finally{sending=false;}
},60);
function label(text,y,size=30,color='#eef6ff'){
  ctx.fillStyle=color;ctx.textAlign='center';ctx.font='700 '+size+'px system-ui';ctx.fillText(text,600,y);
}
function draw(t){
  const dt=Math.min(.1,(t-lastFrame)/1000);lastFrame=t;
  ctx.clearRect(0,0,1200,760);ctx.fillStyle='#080f20';ctx.fillRect(0,0,1200,760);
  ctx.lineWidth=1;ctx.strokeStyle='#14213a';
  for(let x=0;x<=1200;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,760);ctx.stroke();}
  for(let y=0;y<=760;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
  ctx.strokeStyle='#2b4f65';ctx.lineWidth=3;ctx.strokeRect(2,2,1196,756);
  const blocks=[{x:260,y:165,w:155,h:50},{x:785,y:165,w:155,h:50},{x:260,y:545,w:155,h:50},{x:785,y:545,w:155,h:50},{x:535,y:305,w:130,h:150}];
  for(const b of blocks){
    ctx.fillStyle='#172740';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#36546d';ctx.lineWidth=2;ctx.strokeRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#50f4df';ctx.fillRect(b.x,b.y,20,3);ctx.fillRect(b.x+b.w-20,b.y+b.h-3,20,3);
  }
  ctx.save();ctx.globalAlpha=.24;label('NEON ARENA',400,42,'#50778e');ctx.restore();
  if(state){
    for(const b of state.bullets){
      ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;
    }
    for(const p of state.players){
      if(p.hp<=0)continue;
      let s=smooth.get(p.id);
      if(!s||Math.hypot(s.x-p.x,s.y-p.y)>150){s={x:p.x,y:p.y};smooth.set(p.id,s);}
      const alpha=1-Math.exp(-dt*22);s.x+=(p.x-s.x)*alpha;s.y+=(p.y-s.y)*alpha;
      ctx.save();ctx.translate(s.x,s.y);
      if(p.shield){ctx.beginPath();ctx.arc(0,0,27,0,Math.PI*2);ctx.strokeStyle=p.color;ctx.globalAlpha=.55;ctx.stroke();ctx.globalAlpha=1;}
      ctx.rotate(p.a);ctx.beginPath();ctx.moveTo(23,0);ctx.lineTo(-13,-16);ctx.lineTo(-6,0);ctx.lineTo(-13,16);ctx.closePath();
      ctx.fillStyle=p.color;ctx.shadowBlur=p.id===myId?20:8;ctx.shadowColor=p.color;ctx.fill();ctx.shadowBlur=0;ctx.rotate(-p.a);
      ctx.fillStyle='#eef6ff';ctx.textAlign='center';ctx.font='14px system-ui';ctx.fillText(p.name+(p.id===myId?' · 你':''),0,-36);
      ctx.fillStyle='#24364d';ctx.fillRect(-22,30,44,4);ctx.fillStyle=p.color;ctx.fillRect(-22,30,44*p.hp/100,4);
      ctx.restore();
    }
    const me=state.players.find(p=>p.id===myId);
    if(state.phase==='lobby'){label('等待朋友加入',90,26);label('分享房间号 '+state.code+'，两人即可开战',125,17,'#9bb1c7');}
    else if(state.phase==='countdown'){label('准备开战',340,30);label(String(state.seconds),415,70,'#50f4df');}
    else if(state.phase==='over'){ctx.fillStyle='#060e20dd';ctx.fillRect(0,240,1200,230);label('本局胜者',300,24,'#9bb1c7');label(state.winner,365,38,'#50f4df');label(state.seconds+' 秒后开始下一局',425,20);}
    else if(me&&me.hp<=0){label('战机被击毁',340,30);label(me.respawn+' 秒后重生',390,24,'#ff6c96');}
    if(!matchMedia('(pointer:coarse)').matches){
      ctx.strokeStyle='#50f4df99';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(aim.x,aim.y,9,0,Math.PI*2);ctx.moveTo(aim.x-15,aim.y);ctx.lineTo(aim.x-5,aim.y);ctx.moveTo(aim.x+5,aim.y);ctx.lineTo(aim.x+15,aim.y);ctx.moveTo(aim.x,aim.y-15);ctx.lineTo(aim.x,aim.y-5);ctx.moveTo(aim.x,aim.y+5);ctx.lineTo(aim.x,aim.y+15);ctx.stroke();
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
