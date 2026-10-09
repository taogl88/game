import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('HTTP room lifecycle, authenticated SSE, input validation and capacity',{timeout:30000},async t=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{
    if(child.exitCode!==null)return;
    await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
  });
  let errors='';
  child.stderr.on('data',chunk=>errors+=chunk);
  const port=await new Promise((resolve,reject)=>{
    let log='';
    const timeout=setTimeout(()=>reject(Error('Server did not start: '+errors)),10000);
    child.once('error',e=>{clearTimeout(timeout);reject(e);});
    child.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code+': '+errors));});
    child.stdout.on('data',chunk=>{
      log+=chunk;const match=log.match(/localhost:(\d+)/);
      if(match){clearTimeout(timeout);resolve(Number(match[1]));}
    });
  });
  const origin='http://127.0.0.1:'+port;
  const post=async(path,data,token='',extra={})=>{
    const r=await fetch(origin+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':token,...extra},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});
    return {status:r.status,data:await r.json()};
  };
  assert.equal((await fetch(origin+'/healthz')).status,200);
  for(const path of ['/','/app.js','/style.css'])assert.equal((await fetch(origin+path)).status,200);
  assert.equal((await post('input',{x:1,y:0,a:0})).status,401);
  assert.equal((await post('create',{name:'bad'},'',{Origin:'https://other.example'})).status,403);

  const first=await post('create',{name:'甲'});
  assert.equal(first.status,200);assert.match(first.data.code,/^\d{6}$/);
  const second=await post('join',{name:'乙',code:first.data.code});
  assert.equal(second.status,200);assert.notEqual(first.data.token,second.data.token);
  assert.equal((await post('input',{x:'bad',y:0,a:0},first.data.token)).status,400);
  assert.equal((await post('input',{x:999,y:0,a:0,fire:true},first.data.token)).status,200);

  const readState=async token=>{
    const stream=await fetch(origin+'/events?t='+encodeURIComponent(token),{signal:AbortSignal.timeout(5000)});
    assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
    const reader=stream.body.getReader(),decoder=new TextDecoder();let raw='';
    try{
      while(!raw.includes('\n\n')){
        const {done,value}=await reader.read();if(done)throw Error('SSE ended without a snapshot');
        raw+=decoder.decode(value,{stream:true});
      }
      return JSON.parse(raw.split('\n\n')[0].slice(6));
    }finally{await reader.cancel();}
  };
  const state=await readState(first.data.token);
  assert.equal(state.players.length,2);
  assert.ok(state.players.some(p=>p.name==='甲'));assert.ok(state.players.some(p=>p.name==='乙'));
  assert.ok(!JSON.stringify(state).includes(first.data.token));
  for(let i=0;i<4;i++)assert.equal((await post('join',{name:'P'+i,code:first.data.code})).status,200);
  assert.equal((await post('join',{name:'overflow',code:first.data.code})).status,409);
  assert.equal((await post('leave',{},second.data.token)).status,200);
  assert.equal((await post('input',{x:0,y:0,a:0},second.data.token)).status,401);
  assert.equal((await post('join',{name:'replacement',code:first.data.code})).status,200);
  const training=await post('create',{name:'练习者',training:true});
  assert.equal(training.status,200);
  assert.equal((await readState(training.data.token)).players.length,4);
  assert.equal((await post('join',{name:'outsider',code:training.data.code})).status,403);
});
