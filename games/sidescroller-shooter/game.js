import {Game,STEP,normalizeScores,addScore} from './core.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const images={},keys=new Set(),touch=new Set();let config,game=null,screen='menu',last=0,accumulator=0,clock=0,debug=false,scoreSaved=false,lastStatus=-1;
const embedded=window.self!==window.top;let muted=true,storageError=false;
const sound={theme:new Audio('./assets/orbit_theme.wav'),shoot:new Audio('./assets/Laser_shoot_sound.ogg'),hit:new Audio('./assets/damage_sound.ogg')};
sound.theme.loop=true;sound.theme.volume=.14;sound.shoot.volume=.15;sound.hit.volume=.25;
const STORAGE='jay.orbit379.records.v1';
function readScores(){try{return normalizeScores(JSON.parse(localStorage.getItem(STORAGE)||'[]'));}catch{storageError=true;return [];}}
function playEffect(name){if(muted)return;const clip=sound[name].cloneNode();clip.volume=sound[name].volume;clip.play().catch(()=>{});}
function audioState(){sound.theme.pause();if(!muted&&game?.state==='playing'&&!game.paused&&!document.hidden)sound.theme.play().catch(()=>{$('flight-status').textContent='Audio unavailable · Flight controls still work';});$('sound').textContent=muted?'Sound off':'Sound on';$('sound').setAttribute('aria-pressed',String(!muted));}
function toggleSound(){muted=!muted;audioState();}
function show(next){screen=next;for(const id of ['menu','pause-screen','results','records-screen','help-screen'])$(id).hidden=id!==next;$('overlay').hidden=next==='playing';$('pause').disabled=!game||game.state!=='playing';$('pause').textContent=game?.paused?'Resume':'Pause';audioState();}
function focusGame(){canvas.focus({preventScroll:true});keys.clear();touch.clear();}
function end(){keys.clear();touch.clear();scoreSaved=false;$('score-form').hidden=false;$('pilot').value='';$('save-status').textContent='';$('result-label').textContent=game.state==='victory'?'ALL SECTORS CLEARED':'FLIGHT ENDED';$('result-title').textContent=game.state==='victory'?'Mission complete':'Mission ended';$('result-score').textContent=`${game.score.toLocaleString()} points · Sector ${game.levelIndex+1}`;show('results');}
function start(){if(!config)return;game?.dispose();const sizes={player:{hw:images.player.height*.65/2,hh:images.player.width*.65/2},enemy:{hw:images.enemy.height*.7/2,hh:images.enemy.width*.7/2},bullet:{hw:images.bullet.height*.85/2,hh:images.bullet.width*.85/2}};game=new Game(config,sizes);game.events.on('shoot',()=>playEffect('shoot'));game.events.on('explosion',()=>playEffect('hit'));game.events.on('damage',()=>playEffect('hit'));game.events.on('end',end);accumulator=0;lastStatus=-1;show('playing');focusGame();}
function pause(){if(!game||game.state!=='playing')return;game.paused=!game.paused;keys.clear();touch.clear();show(game.paused?'pause-screen':'playing');if(!game.paused)focusGame();}
function menu(){game?.dispose();game=null;keys.clear();touch.clear();show('menu');$('start').focus({preventScroll:true});$('flight-status').textContent='Browser edition · Ready for launch';}
function records(){const entries=readScores();const body=$('score-rows');body.replaceChildren();if(!entries.length){const row=body.insertRow();const cell=row.insertCell();cell.colSpan=4;cell.textContent='No flights recorded yet.';}entries.forEach((e,i)=>{const row=body.insertRow();for(const value of [String(i+1).padStart(2,'0'),e.name,e.score.toLocaleString(),e.level])row.insertCell().textContent=value;});$('records-status').textContent=storageError?'Browser storage is unavailable. Scores cannot persist here.':'';show('records-screen');}
function saveScore(event){event.preventDefault();if(scoreSaved||!game)return;const entries=addScore(readScores(),$('pilot').value,game.score,game.levelIndex+1);try{localStorage.setItem(STORAGE,JSON.stringify(entries));scoreSaved=true;$('score-form').hidden=true;$('save-status').textContent='Score saved on this browser.';}catch{$('save-status').textContent='Storage is unavailable. This score could not be saved.';}}
for(const id of ['start','retry'])$(id).addEventListener('click',start);
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',pause);$('sound').addEventListener('click',toggleSound);
$('records').addEventListener('click',records);$('help').addEventListener('click',()=>show('help-screen'));
document.querySelectorAll('[data-menu]').forEach(el=>el.addEventListener('click',menu));document.querySelectorAll('[data-records]').forEach(el=>el.addEventListener('click',records));$('score-form').addEventListener('submit',saveScore);
$('expand').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('flight-status').textContent='Fullscreen is unavailable here. Use the standalone game link.';}});
function codeFor(e){return e.code||({' ':'Space',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight'}[e.key])||`Key${e.key.toUpperCase()}`;}
window.addEventListener('keydown',e=>{if(e.target.matches('input'))return;const code=codeFor(e);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)&&screen==='playing')e.preventDefault();if(e.repeat){if(screen==='playing')keys.add(code);return;}
  if(code==='KeyM'){toggleSound();return;}if(code==='F3'){e.preventDefault();debug=!debug;return;}
  if(code==='Escape'){e.preventDefault();if(screen==='playing'||screen==='pause-screen')pause();else menu();return;}
  if(code==='KeyP'&&(screen==='playing'||screen==='pause-screen')){pause();return;}if(screen==='playing')keys.add(code);
});window.addEventListener('keyup',e=>keys.delete(codeFor(e)));
function loseFocus(){keys.clear();touch.clear();document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));if(game?.state==='playing'&&!game.paused){game.paused=true;show('pause-screen');}}
window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();audioState();});
for(const button of document.querySelectorAll('[data-key]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();if(screen!=='playing')return;button.setPointerCapture(e.pointerId);touch.add(button.dataset.key);button.classList.add('held');});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{touch.delete(button.dataset.key);button.classList.remove('held');});
}
const held=key=>keys.has(key)||touch.has(key);
const input=()=>({x:Number(held('ArrowRight')||held('KeyD'))-Number(held('ArrowLeft')||held('KeyA')),y:Number(held('ArrowDown')||held('KeyS'))-Number(held('ArrowUp')||held('KeyW')),fire:held('Space')});
function sprite(img,x,y,scale,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();}
const tints={};function enemyImage(kind){if(kind==='scout')return images.enemy;if(!tints[kind]){const c=document.createElement('canvas');c.width=images.enemy.width;c.height=images.enemy.height;const x=c.getContext('2d');x.drawImage(images.enemy,0,0);x.globalCompositeOperation='source-atop';x.fillStyle=kind==='hunter'?'#9153c6':'#ed9a33';x.globalAlpha=.65;x.fillRect(0,0,c.width,c.height);tints[kind]=c;}return tints[kind];}
function text(value,x,y,size=18,color='#e6f4f6'){ctx.fillStyle=color;ctx.font=`${size}px ui-monospace,Consolas,monospace`;ctx.fillText(value,x,y);}
function box(e,color){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(e.x-e.hw,e.y-e.hh,e.hw*2,e.hh*2);}
function draw(){
  const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#080e1c';ctx.fillRect(0,0,W,H);
  if(images.background){const bg=images.background;ctx.globalAlpha=.36;for(let x=-clock*22%bg.width;x<W;x+=bg.width)for(let y=0;y<H;y+=bg.height)ctx.drawImage(bg,x,y);ctx.globalAlpha=1;}
  if(!game)return;
  const p=game.player;
  for(const e of game.enemies){sprite(enemyImage(e.kind),e.x,e.y,.7,-Math.PI/2);ctx.fillStyle=Math.floor(clock*8)%2?'#ff7777':'#fff';ctx.fillRect(e.x-3,e.y-3,6,6);if(debug){box(e,'#ff6b85');text(e.brain.state,e.x-30,e.y-42,12);}}
  for(const b of game.bullets){sprite(images.bullet,b.x,b.y,.85,Math.PI/2);if(debug)box(b,'#ffdc68');}
  for(const u of game.pickups){const pulse=.8+.08*Math.sin(u.time*6);sprite(images.pickup,u.x,u.y,pulse);text(u.kind==='rapid'?'R':u.kind==='shield'?'S':'+',u.x-7,u.y+34,20,u.kind==='repair'?'#9dffb1':u.kind==='shield'?'#bc8aff':'#65e5e8');if(debug)box(u,'#9dffb1');}
  for(const f of game.particles){ctx.globalAlpha=Math.max(0,f.life/.45);ctx.fillStyle=f.color;ctx.fillRect(f.x,f.y,3,3);}ctx.globalAlpha=1;
  const frame=Math.floor(clock*12)%4,flame=18+frame*4;ctx.fillStyle='#55dcec';ctx.beginPath();ctx.moveTo(p.x-p.hw,p.y-7);ctx.lineTo(p.x-p.hw-flame,p.y);ctx.lineTo(p.x-p.hw,p.y+7);ctx.fill();ctx.fillStyle='#c7ffff';ctx.fillRect(p.x-p.hw-10,p.y-2,12,4);
  ctx.globalAlpha=p.hurt>0&&Math.floor(p.hurt*12)%2===0?.3:1;sprite(images.player,p.x,p.y,.65,Math.PI/2);ctx.globalAlpha=1;
  if(p.shield>0){ctx.strokeStyle='#65e5e8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,p.hw+9,p.hh+9,0,0,Math.PI*2);ctx.stroke();}if(debug)box(p,'#65e5e8');
  ctx.fillStyle='#071322f5';ctx.fillRect(0,0,W,99);ctx.strokeStyle='#264255';ctx.strokeRect(0,0,W,99);
  text(game.level.name,22,32,20,'#65e5e8');text(`SCORE ${game.score.toLocaleString()}   LIVES ${p.lives}   LEFT ${Math.max(0,game.level.duration-game.time).toFixed(1)}s`,22,70,19);
  text(`R ${p.rapid.toFixed(1)}s  S ${p.shield.toFixed(1)}s`,W-335,32,17,'#b4c6cf');text('SPACE fire  P pause  M sound',W-335,70,15,'#93abb7');
  if(game.time<3){ctx.textAlign='center';text(game.level.name,W/2,152,26,'#65e5e8');ctx.textAlign='left';}
  if(debug){ctx.fillStyle='#071322eb';ctx.fillRect(10,H-50,W-20,40);text(`Checks ${game.checks||0} | enemies ${game.enemies.length} | bullets ${game.bullets.length} | fixed 60 Hz`,22,H-25,15,'#9dffb1');}
}
function loop(now){const elapsed=Math.min(.1,Math.max(0,(now-last)/1000));last=now;clock+=elapsed;accumulator+=elapsed;while(accumulator>=STEP){if(screen==='playing')game?.update(STEP,input());accumulator-=STEP;}draw();
  if(game&&Math.floor(now/1000)!==lastStatus){lastStatus=Math.floor(now/1000);$('flight-status').textContent=`Sector ${game.levelIndex+1}/3 · Score ${game.score} · Lives ${game.player.lives} · ${game.state==='victory'?'Mission complete':game.state==='defeat'?'Flight ended':game.paused?'Paused':Math.ceil(Math.max(0,game.level.duration-game.time))+'s remaining'}`;}
  requestAnimationFrame(loop);
}
async function boot(){
  try{
    const response=await fetch('./assets/world.json');if(!response.ok)throw new Error('Configuration not found');config=await response.json();
    for(const [key,file]of Object.entries({player:'playerShip1_blue.png',enemy:'ufoRed.png',bullet:'laserBlue01.png',pickup:'powerupBlue_bolt.png',background:'spaceBackground.png'})){
      const image=new Image();image.src='./assets/'+file;await image.decode();images[key]=image;
    }
    canvas.width=config.width;canvas.height=config.height;$('start').disabled=false;$('start').textContent='Start mission';$('load-status').textContent='No download. No sign-in. Just fly.';
    if(!embedded)$('start').focus({preventScroll:true});
  }catch(error){$('load-status').textContent='Could not load the game. Check your connection and reload.';$('start').textContent='Assets unavailable';console.error(error);}
  last=performance.now();requestAnimationFrame(loop);
}
boot();
