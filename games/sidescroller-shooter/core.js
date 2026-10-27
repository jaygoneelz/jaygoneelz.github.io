export const STEP=1/60;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const overlaps=(a,b)=>a.x-a.hw<b.x+b.hw && a.x+a.hw>b.x-b.hw && a.y-a.hh<b.y+b.hh && a.y+a.hh>b.y-b.hh;
export const kinds=['rapid','shield','repair'];
export class Events {
  #listeners=new Map();
  on(name,fn){if(!this.#listeners.has(name))this.#listeners.set(name,new Set());this.#listeners.get(name).add(fn);return()=>this.#listeners.get(name)?.delete(fn);}
  emit(name,data){for(const fn of [...(this.#listeners.get(name)||[])])fn(data);}
  get count(){return [...this.#listeners.values()].reduce((n,s)=>n+s.size,0);}
}
export function validateWorld(c){
  const positive=x=>Number.isFinite(x)&&x>0;
  if(!c||!Number.isInteger(c.width)||c.width<1120||c.width>1920||!Number.isInteger(c.height)||c.height<720||c.height>1080||
    !positive(c.playerSpeed)||c.playerSpeed>600||!positive(c.bulletSpeed)||c.bulletSpeed>1200||!Number.isInteger(c.lives)||c.lives<1||c.lives>9||
    !positive(c.powerUpInterval)||c.powerUpInterval<1||!positive(c.powerUpDuration)||!positive(c.invulnerabilitySeconds)||
    !Number.isFinite(c.playerX)||c.playerX<60||c.playerX>c.width-60||!Number.isFinite(c.playerY)||c.playerY<160||c.playerY>c.height-60||
    !Array.isArray(c.levels)||!c.levels.length)throw new Error('Invalid game configuration');
  for(const l of c.levels){
    if(!l||typeof l.name!=='string'||!l.name.trim()||!positive(l.duration)||l.duration<5||!positive(l.spawnInterval)||l.spawnInterval<.25||!positive(l.enemySpeed)||l.enemySpeed>450||
      !Array.isArray(l.pattern)||!l.pattern.length||l.pattern.some(t=>!['scout','weaver','hunter'].includes(t))||!Array.isArray(l.initialEnemies)||
      l.initialEnemies.some(e=>!e||!['scout','weaver','hunter'].includes(e.type)||!Number.isFinite(e.x)||e.x<c.width/2||e.x>c.width+200||!Number.isFinite(e.y)||e.y<160||e.y>c.height-60))throw new Error('Invalid sector configuration');
  }return c;
}
export function normalizeScores(entries){
  if(!Array.isArray(entries))return [];
  return entries.filter(e=>e&&typeof e.name==='string'&&/^[A-Z0-9 ]{1,12}$/.test(e.name)&&Number.isSafeInteger(e.score)&&e.score>=0&&Number.isInteger(e.level)&&e.level>=1&&Number.isFinite(Date.parse(e.date)))
    .sort((a,b)=>b.score-a.score||Date.parse(a.date)-Date.parse(b.date)).slice(0,10);
}
export function addScore(entries,name,score,level,date=new Date().toISOString()){
  name=String(name||'PILOT').toUpperCase().replace(/[^A-Z0-9 ]/g,'').trim().slice(0,12)||'PILOT';
  return normalizeScores([...normalizeScores(entries),{name,score,level,date}]);
}
export class EnemyBrain {
  constructor(kind,speed,x,y){Object.assign(this,{kind,speed,x,y,state:'enter',time:0,vx:-speed*.5,vy:0});}
  change(state,target){
    this.state=state;this.time=0;this.vy=0;
    if(state==='patrol')this.vx=-this.speed;
    if(state==='charge'){
      let dx=this.kind==='scout'?-1:target.x-this.x,dy=this.kind==='scout'?0:target.y-this.y;
      const length=Math.hypot(dx,dy)||1;this.vx=dx/length*this.speed*1.6;this.vy=dy/length*this.speed*1.6;
    }
    if(state==='retreat')this.vx=-this.speed*1.2;
  }
  update(dt,target){
    this.time+=dt;
    if(this.state==='enter'&&this.time>=.5)this.change('patrol',target);
    else if(this.state==='patrol'){
      this.vx=-this.speed;this.vy=this.kind==='weaver'?Math.cos(this.time*3)*100:0;
      if(this.time>=(this.kind==='hunter'?1.2:2.5))this.change('charge',target);
    }else if(this.state==='charge'&&this.time>=1)this.change('retreat',target);
    this.x+=this.vx*dt;this.y+=this.vy*dt;
  }
}
export class Game {
  constructor(config,sizes={}){
    this.config=validateWorld(config);this.sizes={player:{hw:24.4,hh:32.2},enemy:{hw:31.9,hh:31.9},bullet:{hw:23,hh:3},...sizes};
    this.events=new Events();this.destroyed=new Set();this.score=0;this.levelIndex=0;this.time=0;this.nextId=1;this.seed=(config.seed>>>0)||379;this.pickupIndex=0;
    this.state='playing';this.paused=false;this.particles=[];
    this.player={x:config.playerX,y:config.playerY,...this.sizes.player,lives:config.lives,rapid:0,shield:0,hurt:0,cooldown:0};
    this.disposeScore=this.events.on('enemyDestroyed',e=>{if(!this.destroyed.has(e.id)){this.destroyed.add(e.id);this.score+=e.points;}});
    this.beginLevel();
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  get level(){return this.config.levels[this.levelIndex];}
  beginLevel(){this.time=0;this.spawnTime=0;this.powerTime=0;this.pattern=0;this.enemies=[];this.bullets=[];this.pickups=[];for(const e of this.level.initialEnemies)this.spawnEnemy(e.type,e.x,e.y);}
  spawnEnemy(kind,x,y){const brain=new EnemyBrain(kind,this.level.enemySpeed,x,y);this.enemies.push({id:this.nextId++,kind,brain,x,y,...this.sizes.enemy,alive:true,points:kind==='hunter'?200:kind==='weaver'?150:100});}
  effect(kind){if(kind==='rapid')this.player.rapid=this.config.powerUpDuration;if(kind==='shield')this.player.shield=this.config.powerUpDuration;if(kind==='repair')this.player.lives=Math.min(this.config.lives,this.player.lives+1);this.events.emit('pickup',kind);}
  hit(){const p=this.player;if(p.hurt>0||p.shield>0||p.lives<=0)return;p.lives--;p.hurt=this.config.invulnerabilitySeconds;this.events.emit('damage');}
  explode(x,y,color){for(let i=0;i<12;i++){const angle=this.random()*Math.PI*2,speed=40+this.random()*130;this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.45,color});}}
  update(dt,input={}){
    if(this.state!=='playing'||this.paused)return;
    if(!Number.isFinite(dt)||dt<=0||dt>.1)throw new Error('Use simulation steps no larger than 0.1 seconds');
    const p=this.player,c=this.config;
    this.time+=dt;p.hurt=Math.max(0,p.hurt-dt);p.rapid=Math.max(0,p.rapid-dt);p.shield=Math.max(0,p.shield-dt);p.cooldown-=dt;
    let dx=Number(input.x)||0,dy=Number(input.y)||0,length=Math.max(1,Math.hypot(dx,dy));
    p.x=clamp(p.x+dx/length*c.playerSpeed*dt,p.hw,c.width-p.hw);p.y=clamp(p.y+dy/length*c.playerSpeed*dt,100+p.hh,c.height-p.hh);
    if(input.fire&&p.cooldown<=0){this.bullets.push({id:this.nextId++,x:p.x+p.hw+8,y:p.y,...this.sizes.bullet,alive:true});p.cooldown=p.rapid>0?.1:.28;this.events.emit('shoot');}
    this.spawnTime+=dt;this.powerTime+=dt;
    while(this.spawnTime>=this.level.spawnInterval){this.spawnTime-=this.level.spawnInterval;if(this.enemies.length<40)this.spawnEnemy(this.level.pattern[this.pattern++%this.level.pattern.length],c.width+60,165+this.random()*(c.height-230));}
    while(this.powerTime>=c.powerUpInterval){this.powerTime-=c.powerUpInterval;this.pickups.push({x:c.width+30,y:170+this.random()*(c.height-240),hw:16,hh:16,kind:kinds[this.pickupIndex++%3],alive:true,time:0});}
    for(const e of this.enemies){e.brain.update(dt,p);e.x=e.brain.x;e.y=e.brain.y;if(e.x+e.hw<0||e.y+e.hh<95||e.y-e.hh>c.height)e.alive=false;}
    for(const b of this.bullets){b.x+=c.bulletSpeed*dt;if(b.x-b.hw>c.width)b.alive=false;}
    for(const u of this.pickups){u.x-=110*dt;u.time+=dt;if(u.x+u.hw<0)u.alive=false;}
    const contacts=[];this.checks=0;
    for(const b of this.bullets)for(const e of this.enemies)if(b.alive&&e.alive){this.checks++;if(overlaps(b,e))contacts.push(['bullet',b,e]);}
    for(const e of this.enemies)if(e.alive){this.checks++;if(overlaps(e,p))contacts.push(['player',e,p]);}
    for(const u of this.pickups)if(u.alive){this.checks++;if(overlaps(u,p))contacts.push(['pickup',u,p]);}
    this.respond(contacts);
    this.bullets=this.bullets.filter(b=>b.alive);this.enemies=this.enemies.filter(e=>e.alive);this.pickups=this.pickups.filter(u=>u.alive);
    for(const f of this.particles){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;}this.particles=this.particles.filter(f=>f.life>0);
    if(p.lives<=0){this.state='defeat';this.events.emit('end',this.state);}
    else if(this.time>=this.level.duration){if(this.levelIndex+1===c.levels.length){this.state='victory';this.events.emit('end',this.state);}else{this.levelIndex++;this.beginLevel();this.events.emit('sector',this.levelIndex);}}
  }
  respond(contacts){for(const [kind,a,b]of contacts){if(!a.alive||b.alive===false)continue;
    if(kind==='bullet'){a.alive=b.alive=false;this.events.emit('enemyDestroyed',{id:b.id,points:b.points});this.events.emit('explosion');this.explode(b.x,b.y,b.kind==='hunter'?'#bc8aff':'#ffb76b');}
    if(kind==='player'){a.alive=false;this.hit();this.explode(a.x,a.y,'#ffb76b');}
    if(kind==='pickup'){a.alive=false;this.effect(a.kind);}
  }}
  dispose(){this.disposeScore();}
}
