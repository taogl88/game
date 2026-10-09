import http from 'node:http';
import { randomUUID,randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rooms,sessions,player,remove,tick,snapshot } from './engine.mjs';

const assets=new Map([
  ['/',{type:'text/html; charset=utf-8',body:readFileSync(new URL('./public/index.html',import.meta.url))}],
  ['/app.js',{type:'text/javascript; charset=utf-8',body:readFileSync(new URL('./public/app.js',import.meta.url))}],
  ['/style.css',{type:'text/css; charset=utf-8',body:readFileSync(new URL('./public/style.css',import.meta.url))}]
]);
const limits=new Map();
function json(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function body(req){
  req.setEncoding('utf8');let raw='';
  for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw Error('请求过大');}
  try{return JSON.parse(raw||'{}');}catch{throw Error('请求格式错误');}
}
function attach(room,p){
  const token=randomUUID();sessions.set(token,{room,p,stream:null,lastInput:Date.now()});
  return {token,id:p.id,code:room.code};
}
function rate(ip){
  const now=Date.now();let r=limits.get(ip);
  if(!r||now>r.until){r={count:0,until:now+60000};limits.set(ip,r);}
  if(++r.count>12)throw Error('操作过于频繁，请一分钟后重试');
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{ok:true});
    if(req.method==='GET'&&assets.has(url.pathname)){
      const asset=assets.get(url.pathname);
      res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"});
      res.end(asset.body);return;
    }
    if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(req.method==='GET'&&url.pathname==='/events'){
      const s=sessions.get(url.searchParams.get('t'));
      if(!s)return json(res,401,{error:'房间连接已过期，请重新加入'});
      s.stream?.end();
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer'});
      res.setTimeout(0);res.flushHeaders();s.stream=res;s.p.lastSeen=Date.now();
      res.write('data: '+JSON.stringify(snapshot(s.room,Date.now()))+'\n\n');
      res.on('close',()=>{if(s.stream===res)s.stream=null;});return;
    }
    if(req.method!=='POST'||!url.pathname.startsWith('/api/'))return json(res,404,{error:'页面不存在'});
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'请求来源无效'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'请求格式错误'});
    const data=await body(req);
    if(!data||typeof data!=='object'||Array.isArray(data))return json(res,400,{error:'请求格式错误'});
    if(url.pathname==='/api/create'||url.pathname==='/api/join'){
      rate(req.socket.remoteAddress);
      const name=typeof data.name==='string'?data.name.trim().slice(0,12)||'玩家':'玩家';
      if(url.pathname==='/api/create'){
        if(rooms.size>=100)return json(res,503,{error:'房间已满，请稍后再试'});
        let code;do{code=String(randomInt(100000,1000000));}while(rooms.has(code));
        const room={code,training:data.training===true,phase:'lobby',until:0,players:new Map(),bullets:[],feed:[],winner:''};
        rooms.set(code,room);const p=player(room,name),session=attach(room,p);
        if(room.training)for(let i=0;i<3;i++)player(room,'AI-'+(i+1),true);
        return json(res,200,session);
      }
      const code=typeof data.code==='string'?data.code.trim():'',room=rooms.get(code);
      if(!room)return json(res,404,{error:'房间不存在，请检查六位房间号'});
      if(room.training)return json(res,403,{error:'练习房仅供单人使用，请创建好友房'});
      if(room.players.size>=6)return json(res,409,{error:'房间已满（最多 6 人）'});
      return json(res,200,attach(room,player(room,name)));
    }
    const token=req.headers['x-player-token'],s=sessions.get(token);
    if(!s)return json(res,401,{error:'连接已过期，请重新加入房间'});
    if(url.pathname==='/api/leave'){remove(token);return json(res,200,{ok:true});}
    if(url.pathname==='/api/input'){
      if(![data.x,data.y,data.a].every(v=>typeof v==='number'&&Number.isFinite(v)))return json(res,400,{error:'操作数据无效'});
      s.p.input={x:Math.max(-1,Math.min(1,data.x)),y:Math.max(-1,Math.min(1,data.y)),a:data.a%(Math.PI*2),fire:data.fire===true,dash:data.dash===true};
      s.p.lastSeen=Date.now();s.lastInput=s.p.lastSeen;return json(res,200,{ok:true});
    }
    return json(res,404,{error:'接口不存在'});
  }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.end();}
});
server.keepAliveTimeout=65000;
const timer=setInterval(()=>{
  const now=Date.now();
  for(const [token,s] of sessions){
    if(now-s.p.lastSeen>45000){remove(token);continue;}
    if(now-s.lastInput>500)s.p.input={x:0,y:0,a:s.p.a||0,fire:false,dash:false};
  }
  const packets=new Map();
  for(const room of rooms.values()){tick(room,now);packets.set(room,'data: '+JSON.stringify(snapshot(room,now))+'\n\n');}
  for(const s of sessions.values())if(s.stream&&!s.stream.destroyed){
    if(!s.stream.write(packets.get(s.room)))s.stream.destroy();
  }
  for(const [ip,r] of limits)if(now>r.until)limits.delete(ip);
},50);
const port=Number(process.env.PORT||3000);
server.listen(port,'0.0.0.0',()=>console.log('霓虹竞技场已启动：http://localhost:'+server.address().port));
function shutdown(){
  clearInterval(timer);
  for(const s of sessions.values())s.stream?.end();
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
