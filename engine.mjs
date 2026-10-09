import { randomUUID } from 'node:crypto';

export const W=1200,H=760,R=18,DT=.05;
export const COLORS=['#50f4df','#ff6c96','#b38aff','#ffd166','#65b7ff','#ffa45b'];
export const BLOCKS=[{x:260,y:165,w:155,h:50},{x:785,y:165,w:155,h:50},{x:260,y:545,w:155,h:50},{x:785,y:545,w:155,h:50},{x:535,y:305,w:130,h:150}];
export const rooms=new Map(),sessions=new Map();

export function spawn(p,room,now=Date.now()){
  let best={x:80,y:80},score=-1;
  for(let i=0;i<40;i++){
    const s={x:50+Math.random()*(W-100),y:50+Math.random()*(H-100)};
    if(BLOCKS.some(b=>s.x>b.x-R&&s.x<b.x+b.w+R&&s.y>b.y-R&&s.y<b.y+b.h+R))continue;
    const d=Math.min(1000,...[...room.players.values()].filter(q=>q!==p&&q.hp>0).map(q=>Math.hypot(s.x-q.x,s.y-q.y)));
    if(d>score){score=d;best=s;}
  }
  Object.assign(p,{x:best.x,y:best.y,hp:100,deadUntil:0,shield:now+1200,fireAt:0,dashAt:0,input:{x:0,y:0,a:0,fire:false,dash:false}});
}
export function player(room,name,bot=false){
  const used=new Set([...room.players.values()].map(p=>p.color));
  const p={id:randomUUID(),name,bot,color:COLORS.find(c=>!used.has(c))||COLORS[0],kills:0,deaths:0,lastSeen:Date.now()};
  room.players.set(p.id,p);spawn(p,room);return p;
}
export function move(p,dx,dy){
  const free=(x,y)=>!BLOCKS.some(b=>x>b.x-R&&x<b.x+b.w+R&&y>b.y-R&&y<b.y+b.h+R);
  const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8)||1;
  for(let i=0;i<steps;i++){
    const x=Math.max(R,Math.min(W-R,p.x+dx/steps));if(free(x,p.y))p.x=x;
    const y=Math.max(R,Math.min(H-R,p.y+dy/steps));if(free(p.x,y))p.y=y;
  }
}
export function remove(token){
  const s=sessions.get(token);if(!s)return;
  s.stream?.end();s.room.players.delete(s.p.id);sessions.delete(token);
  s.room.bullets=s.room.bullets.filter(b=>b.owner!==s.p.id);
  if(![...s.room.players.values()].some(p=>!p.bot))rooms.delete(s.room.code);
}
export function tick(room,now){
  const players=[...room.players.values()];
  if(players.length<2){room.phase='lobby';room.until=0;room.bullets=[];}
  else if(room.phase==='lobby'){room.phase='countdown';room.until=now+3000;}
  else if(room.phase==='countdown'&&now>=room.until){
    room.phase='playing';room.until=now+180000;room.bullets=[];room.feed=[];room.winner='';
    for(const p of players){p.kills=0;p.deaths=0;spawn(p,room,now);}
  }else if(room.phase==='over'&&now>=room.until){room.phase='lobby';}
  for(const p of players){
    if(p.hp<=0){if(room.phase==='playing'&&now>=p.deadUntil)spawn(p,room,now);else continue;}
    if(p.bot){
      const target=players.filter(q=>q.id!==p.id&&q.hp>0).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y))[0];
      if(target){
        const a=Math.atan2(target.y-p.y,target.x-p.x),d=Math.hypot(target.x-p.x,target.y-p.y);
        const strafe=Math.sin(now/1200+p.x*.01)>0?1:-1;
        p.input={x:Math.cos(a)*(d>300?1:-.3)+Math.cos(a+Math.PI/2)*strafe*.6,y:Math.sin(a)*(d>300?1:-.3)+Math.sin(a+Math.PI/2)*strafe*.6,a:a+Math.sin(now/180+p.y)*.13,fire:Math.random()<.35,dash:Math.random()<.008};
      }
    }
    if(room.phase==='over'||room.phase==='countdown')continue;
    const input=p.input,len=Math.hypot(input.x,input.y);let speed=240;
    if(input.dash&&len>0&&now>=p.dashAt){speed=1450;p.dashAt=now+2200;}
    if(len>0)move(p,input.x/Math.max(1,len)*speed*DT,input.y/Math.max(1,len)*speed*DT);
    p.a=input.a;
    if(input.fire&&room.phase==='playing'&&now>=p.fireAt){
      p.shield=0;p.fireAt=now+220;
      const vx=Math.cos(p.a),vy=Math.sin(p.a);
      room.bullets.push({x:p.x+vx*25,y:p.y+vy*25,vx:vx*730,vy:vy*730,owner:p.id,color:p.color,life:1.5});
    }
  }
  const next=[];
  for(const b of room.bullets){
    let hit=false;b.life-=DT;
    for(let i=0;i<4&&!hit;i++){
      b.x+=b.vx*DT/4;b.y+=b.vy*DT/4;
      if(b.x<0||b.x>W||b.y<0||b.y>H||BLOCKS.some(o=>b.x>o.x&&b.x<o.x+o.w&&b.y>o.y&&b.y<o.y+o.h)){hit=true;break;}
      for(const p of players){
        if(p.id===b.owner||p.hp<=0||p.shield>now)continue;
        if(Math.hypot(p.x-b.x,p.y-b.y)<R+3){
          p.hp=Math.max(0,p.hp-25);hit=true;
          if(p.hp===0){
            p.deaths++;p.deadUntil=now+2000;
            const killer=room.players.get(b.owner);
            if(killer){killer.kills++;room.feed.unshift({killer:killer.name,victim:p.name});room.feed=room.feed.slice(0,4);}
          }
          break;
        }
      }
    }
    if(!hit&&b.life>0)next.push(b);
  }
  room.bullets=next;
  if(room.phase==='playing'&&(now>=room.until||players.some(p=>p.kills>=20))){
    room.phase='over';room.until=now+10000;room.bullets=[];
    const top=Math.max(...players.map(p=>p.kills));
    room.winner=players.filter(p=>p.kills===top).map(p=>p.name).join('、');
  }
}
export function snapshot(room,now){
  return {code:room.code,training:room.training,phase:room.phase,seconds:Math.max(0,Math.ceil((room.until-now)/1000)),winner:room.winner,feed:room.feed,bullets:room.bullets.map(({x,y,color})=>({x,y,color})),players:[...room.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,color:p.color,x:p.x,y:p.y,a:p.a||0,hp:p.hp,kills:p.kills,deaths:p.deaths,shield:p.shield>now,dash:Math.max(0,(p.dashAt-now)/2200),respawn:Math.max(0,Math.ceil((p.deadUntil-now)/1000))}))};
}
