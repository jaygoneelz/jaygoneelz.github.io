export const STEP=1/60;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const pingpong=t=>1-Math.abs((t%2+2)%2-1);
export function validate(c){
  if(!c||!Number.isInteger(c.layers)||c.layers<4||c.layers>30||!Number.isFinite(c.radius)||c.radius<5||c.radius>12||
    !Number.isFinite(c.heightStep)||c.heightStep<.5||c.heightStep>1.6||!Number.isFinite(c.platformSize)||c.platformSize<4||c.platformSize>7||
    !Number.isFinite(c.gravity)||c.gravity<=0||!Number.isFinite(c.jumpSpeed)||c.jumpSpeed<=0||c.jumpSpeed*c.jumpSpeed/(2*c.gravity)<c.heightStep+.15||
    !Number.isFinite(c.moveSpeed)||c.moveSpeed<=0||c.moveSpeed>12||!Number.isFinite(c.playerRadius)||c.playerRadius<=0||c.playerRadius>1||
    !Number.isInteger(c.enemyCount)||c.enemyCount<0||c.enemyCount>40||!Number.isFinite(c.survivalSeconds)||c.survivalSeconds<5||
    !Number.isFinite(c.maxHealth)||c.maxHealth<=0||!Number.isFinite(c.boostSeconds)||c.boostSeconds<=0||!Number.isInteger(c.checkpointEvery)||c.checkpointEvery<1)
    throw new Error('Invalid world configuration: check movement, platforms and survival settings.');
  return c;
}
export function generatePlatforms(c){
  const platforms=[];
  for(let i=0;i<c.layers;i++){
    const angle=i*Math.PI/4,x=c.radius*Math.cos(angle),z=c.radius*Math.sin(angle),y=i*c.heightStep;
    platforms.push({id:'p'+i,index:i,x,y,z,hx:c.platformSize/2,hy:.15,hz:c.platformSize/2,moving:false});
    // Movers sit on outer side routes so they cannot obstruct the main jump arc.
    const outerX=x+Math.cos(angle)*6,outerZ=z+Math.sin(angle)*6;
    if(i>0&&i%3===0)platforms.push({id:'h'+i,index:null,x:outerX,y:y+1.5,z:outerZ,hx:c.platformSize*.4,hy:.15,hz:c.platformSize*.4,moving:true,axis:'x',start:outerX,end:outerX+2,speed:1});
    if(i>0&&i%4===0)platforms.push({id:'v'+i,index:null,x:outerX,y,z:outerZ,hx:c.platformSize*.35,hy:.15,hz:c.platformSize*.35,moving:true,axis:'y',start:y,end:y+3,speed:.5});
  }return platforms;
}
export function normalizeRecords(entries){
  if(!Array.isArray(entries))return [];
  return entries.filter(e=>e&&typeof e.name==='string'&&/^[A-Z0-9 ]{1,12}$/.test(e.name)&&Number.isSafeInteger(e.score)&&e.score>=0&&Number.isFinite(e.time)&&e.time>=0&&Number.isInteger(e.platform)&&e.platform>=0&&typeof e.won==='boolean')
    .sort((a,b)=>b.score-a.score||a.time-b.time).slice(0,10);
}
export function recordRun(entries,name,g){return normalizeRecords([...normalizeRecords(entries),{name:String(name||'PLAYER').toUpperCase().replace(/[^A-Z0-9 ]/g,'').trim().slice(0,12)||'PLAYER',score:g.score,time:Number(g.elapsed.toFixed(2)),platform:g.highest+1,won:g.state==='victory'}]);}
export class Game{
  constructor(config){
    this.c=validate(config);this.platforms=generatePlatforms(config);this.elapsed=0;this.state='playing';this.paused=false;this.highest=0;this.collected=0;this.seed=config.seed>>>0||710;this.jumpHeld=false;this.jumpBuffer=0;this.coyote=.1;this.events=[];this.combo=0;this.comboTimer=0;this.lastPickup=null;
    const first=this.platforms[0];this.checkpoint={x:first.x,y:first.y+first.hy+config.playerRadius+.03,z:first.z,index:0};
    this.player={x:first.x,y:first.y+first.hy+config.playerRadius,z:first.z,vx:0,vy:0,vz:0,health:config.maxHealth,boost:0,hurt:0,grounded:'p0'};
    this.enemies=[];
    for(let i=0;i<config.enemyCount;i++){
      const angle=this.random()*Math.PI*2,radius=14+this.random()*23,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
      this.enemies.push({x,y:.6,z,originX:x,originZ:z,targetX:x+2,targetZ:z,state:'patrol',timer:0,cooldown:0,alert:0,kind:['scout','hunter','guard'][i%3]});
    }
    this.pickups=[{id:'heal0',x:first.x+1.1,y:first.y+.85,z:first.z+.5,kind:'heal',alive:true}];
    for(let i=1;i<config.layers;i++)if(i%2===1||i%3===0){const p=this.platforms.find(p=>p.index===i);this.pickups.push({id:'u'+i,x:p.x,y:p.y+.85,z:p.z,kind:i%3===0?'heal':'boost',alive:true});}
  }
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  get score(){return Math.floor(this.elapsed)*10+this.collected*50+this.combo*100+this.highest*100+(this.state==='victory'?500:0);}
  damage(amount){const p=this.player;if(p.hurt>0||this.state!=='playing')return;p.health=Math.max(0,p.health-amount);p.hurt=.9;this.events.push('damage');}
  respawn(){const p=this.player;p.health=Math.max(0,p.health-25);Object.assign(p,{x:this.checkpoint.x,y:this.checkpoint.y,z:this.checkpoint.z,vx:0,vy:0,vz:0,grounded:null,hurt:1});this.events.push('respawn');}
  updateEnemies(dt){
    const p=this.player;
    for(const e of this.enemies){
      e.timer+=dt;e.alert=(e.alert||0)+dt;e.cooldown=Math.max(0,e.cooldown-dt);
      const distance=Math.hypot(p.x-e.x,p.z-e.z),nearHeight=Math.abs(p.y-e.y)<1.8;
      const detection=e.kind==='scout'?14:9,speed=e.kind==='hunter'?3.6:2.5;
      const change=state=>{if(e.state!==state){e.state=state;e.timer=0;}};
      // Recovery is a real vulnerability window; range checks cannot cancel it.
      if(e.state==='recover'){if(e.timer>=.65)change('chase');continue;}
      if(e.state==='patrol'&&e.alert>=12){e.alert=0;change('investigate');}
      if(distance<1.7&&nearHeight)change('attack');
      else if(distance<detection&&nearHeight)change('chase');
      else if(e.state==='attack'||(e.state==='chase'&&!nearHeight))change('investigate');
      if(e.state==='attack'){
        if(e.cooldown<=0){this.damage(e.kind==='guard'?15:10);e.cooldown=1.2;change('recover');}
        continue;
      }
      if(e.state==='patrol'&&(e.timer>4||Math.hypot(e.targetX-e.x,e.targetZ-e.z)<.4)){
        const a=this.random()*Math.PI*2;e.targetX=clamp(e.originX+Math.cos(a)*3,-43,43);e.targetZ=clamp(e.originZ+Math.sin(a)*3,-43,43);e.timer=0;
      }
      const pursuing=e.state==='chase'||e.state==='investigate';
      const x=(pursuing?p.x:e.targetX)-e.x,z=(pursuing?p.z:e.targetZ)-e.z,length=Math.hypot(x,z);
      const step=Math.min(length,(e.state==='chase'?speed:e.state==='investigate'?speed*.75:1.5)*dt);
      if(length>.001){e.x+=x/length*step;e.z+=z/length*step;}
      if(e.state==='investigate'&&e.timer>=8)change('patrol');
    }
  }
  update(dt,input={}){
    if(this.state!=='playing'||this.paused)return;
    if(!Number.isFinite(dt)||dt<=0||dt>.1)throw new Error('Use a simulation step no larger than 0.1 seconds.');
    this.events=[];this.elapsed+=dt;this.comboTimer=Math.max(0,this.comboTimer-dt);const p=this.player,c=this.c,r=c.playerRadius;
    p.boost=Math.max(0,p.boost-dt);p.hurt=Math.max(0,p.hurt-dt);
    for(const box of this.platforms)if(box.moving){const before={x:box.x,y:box.y,z:box.z};box[box.axis]=box.start+(box.end-box.start)*pingpong(this.elapsed*box.speed);if(p.grounded===box.id){p.x+=box.x-before.x;p.y+=box.y-before.y;p.z+=box.z-before.z;}}
    this.coyote=p.grounded?.1:Math.max(0,this.coyote-dt);
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);if(input.jump&&!this.jumpHeld)this.jumpBuffer=.12;this.jumpHeld=!!input.jump;
    if(this.jumpBuffer>0&&this.coyote>0){p.vy=c.jumpSpeed*(p.boost>0?1.5:1);p.grounded=null;this.coyote=0;this.jumpBuffer=0;this.events.push('jump');}
    let dx=Number(input.x)||0,dz=Number(input.z)||0,length=Math.max(1,Math.hypot(dx,dz));p.vx=dx/length*c.moveSpeed;p.vz=dz/length*c.moveSpeed;
    const oldBottom=p.y-r;p.x=clamp(p.x+p.vx*dt,-48,48);p.z=clamp(p.z+p.vz*dt,-48,48);p.vy-=c.gravity*dt;p.y+=p.vy*dt;p.grounded=null;
    // Sweep the sphere's feet across tops to avoid tunnelling through platforms on descent.
    const landings=[];
    for(const box of this.platforms){const top=box.y+box.hy;if(p.vy<=0&&oldBottom>=top-.04&&p.y-r<=top&&Math.abs(p.x-box.x)<box.hx+r*.7&&Math.abs(p.z-box.z)<box.hz+r*.7)landings.push(box);}
    if(p.vy<=0&&oldBottom>=-.04&&p.y-r<=0&&Math.abs(p.x)<45&&Math.abs(p.z)<45)landings.push({id:'ground',x:0,y:0,z:0,hy:0,index:null});
    if(landings.length){const surface=landings.sort((a,b)=>(b.y+b.hy)-(a.y+a.hy))[0];p.y=surface.y+surface.hy+r;p.vy=0;p.grounded=surface.id;
      if(surface.index!==null&&surface.index>this.highest){this.highest=surface.index;this.events.push('platform');if(surface.index%c.checkpointEvery===0){this.checkpoint={x:surface.x,y:p.y+.03,z:surface.z,index:surface.index};this.events.push('checkpoint');}}
    }
    // Resolve sphere vs box sides and undersides after top landing.
    for(const box of this.platforms){
      if(p.grounded===box.id)continue;
      const qx=clamp(p.x,box.x-box.hx,box.x+box.hx),qy=clamp(p.y,box.y-box.hy,box.y+box.hy),qz=clamp(p.z,box.z-box.hz,box.z+box.hz);
      const x=p.x-qx,y=p.y-qy,z=p.z-qz,d=Math.hypot(x,y,z);
      if(d>0&&d<r){const depth=r-d;p.x+=x/d*depth;p.y+=y/d*depth;p.z+=z/d*depth;if(y<0&&p.vy>0)p.vy=0;}
    }
    if(p.y<-10)this.respawn();
    for(const u of this.pickups)if(u.alive&&Math.hypot(p.x-u.x,p.y-u.y,p.z-u.z)<1.15){u.alive=false;this.collected++;if(this.comboTimer>0&&this.lastPickup!==u.kind){this.combo++;this.events.push('combo');}this.lastPickup=u.kind;this.comboTimer=8;if(u.kind==='heal')p.health=Math.min(c.maxHealth,p.health+20);else p.boost=c.boostSeconds;this.events.push(u.kind);}
    this.updateEnemies(dt);
    const goal=this.platforms.find(box=>box.index===c.layers-1);
    if(p.health<=0){this.state='defeat';this.events.push('defeat');}
    else if((Math.hypot(p.x-goal.x,p.z-goal.z)<1.4&&Math.abs(p.y-(goal.y+goal.hy+r))<.7)||this.elapsed>=c.survivalSeconds){this.state='victory';this.events.push('victory');}
  }
}
