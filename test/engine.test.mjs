import test from 'node:test';
import assert from 'node:assert/strict';
import {player,tick,move,snapshot} from '../engine.mjs';

function room(){return {code:'123456',training:false,phase:'lobby',until:0,players:new Map(),bullets:[],feed:[],winner:''};}
test('round countdown, damage, kill score and respawn',()=>{
  const r=room(),a=player(r,'A'),b=player(r,'B'),now=1000000;
  tick(r,now);assert.equal(r.phase,'countdown');
  tick(r,now+3100);assert.equal(r.phase,'playing');
  Object.assign(a,{x:100,y:100,shield:0});Object.assign(b,{x:200,y:100,shield:0});
  a.input={x:0,y:0,a:0,fire:true,dash:false};
  for(let i=0;i<26;i++)tick(r,now+3200+i*50);
  assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.equal(b.hp,0);
  a.input.fire=false;tick(r,now+10000);
  assert.equal(b.hp,100);assert.ok(b.shield>now+10000);
});
test('dash cannot cross obstacles or world boundaries',()=>{
  const r=room(),p=player(r,'A');
  Object.assign(p,{x:240,y:180});move(p,100,0);assert.ok(p.x<=242);
  Object.assign(p,{x:100,y:100});move(p,-1000,-1000);
  assert.equal(p.x,18);assert.equal(p.y,18);
});
test('movement normalizes diagonals and applies dash cooldown',()=>{
  const r=room(),a=player(r,'A');player(r,'B');
  r.phase='playing';r.until=2000000;
  Object.assign(a,{x:100,y:100,shield:0});
  a.input={x:1,y:1,a:0,fire:false,dash:false};
  tick(r,1000000);assert.ok(Math.abs(Math.hypot(a.x-100,a.y-100)-12)<.001);
  Object.assign(a,{x:100,y:100});a.input={x:1,y:0,a:0,fire:false,dash:true};
  tick(r,1000100);assert.equal(a.dashAt,1002300);assert.ok(a.x>170);
  const x=a.x;tick(r,1000150);assert.equal(a.x-x,12);
});
test('twenty kills end a round and the next round clears scores',()=>{
  const r=room(),a=player(r,'A');player(r,'B');
  r.phase='playing';r.until=2000000;a.kills=20;
  tick(r,1000000);assert.equal(r.phase,'over');assert.equal(r.winner,'A');assert.equal(r.bullets.length,0);
  tick(r,1010100);assert.equal(r.phase,'lobby');
  tick(r,1010200);tick(r,1013300);
  assert.equal(r.phase,'playing');assert.equal(a.kills,0);
});
test('time limit permits shared winners and snapshots exclude private state',()=>{
  const r=room(),a=player(r,'A'),b=player(r,'B');
  a.kills=b.kills=3;r.phase='playing';r.until=1000000;
  tick(r,1000001);assert.equal(r.phase,'over');assert.equal(r.winner,'A、B');
  const state=snapshot(r,1000001);
  assert.equal(state.players.length,2);assert.equal(state.players[0].input,undefined);
  assert.equal(state.players[0].lastSeen,undefined);assert.equal(state.players[0].token,undefined);
});
