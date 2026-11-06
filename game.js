(() => {
  'use strict';
  const W = 1200, H = 680;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    overlay: $('overlay'), title: $('overlayTitle'), text: $('overlayText'), start: $('startButton'),
    heat: $('heatFill'), heatStatus: $('heatStatus'), breath: $('breathFill'), breathStatus: $('breathStatus'),
    score: $('scoreReadout'), time: $('timeReadout'), best: $('bestScore'), pitch: $('pitchReadout'),
    chant: $('chantButton'), mobileChant: $('mobileChant'), sound: $('soundToggle'), soundLabel: $('soundLabel'),
    toast: $('toast'), frame: document.querySelector('.game-frame'),
  };

  let dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  const bestKey = 'frostfolk-best-v1';
  let best = Number(localStorage.getItem(bestKey) || 0) || 0;
  ui.best.textContent = String(best).padStart(4, '0');

  let audioCtx = null, audioGain = null, source = null, audioBuffer = null, soundOn = true;
  async function startAudio() {
    if (!soundOn) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioGain = audioCtx.createGain();
        audioGain.gain.value = 0.24;
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 16;
        compressor.ratio.value = 3;
        audioGain.connect(compressor);
        compressor.connect(audioCtx.destination);
        const response = await fetch('assets/kargyraa.wav');
        if (!response.ok) throw new Error('Could not load the throat-singing sample');
        audioBuffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
      }
      await audioCtx.resume();
      if (!source) {
        source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;
        source.playbackRate.value = 1;
        source.connect(audioGain);
        source.start();
      }
      audioGain.gain.setTargetAtTime(0.24, audioCtx.currentTime, 0.08);
    } catch (err) {
      console.warn('Audio unavailable; game still plays.', err);
      showToast('VOICE SAMPLE UNAVAILABLE — YOU MAY CHANT SILENTLY');
    }
  }
  function setAudioLevel() {
    if (!audioCtx || !source) return;
    const semitones = 16 * (cold / 100);
    source.playbackRate.value = Math.pow(2, semitones / 12);
    const target = soundOn && state === 'playing' ? (chanting ? 0.32 : 0.23) : 0;
    audioGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.1);
  }
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.soundLabel.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    ui.sound.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Turn sound on');
    if (soundOn && state === 'playing') startAudio();
    if (audioCtx && audioGain) audioGain.gain.setTargetAtTime(soundOn && state === 'playing' ? 0.24 : 0, audioCtx.currentTime, 0.08);
  });

  const keys = new Set();
  let state = 'ready', elapsed = 0, cold = 0, breath = 100, score = 0, distance = 0;
  let player = {x:260,y:455,vx:0,vy:0,blink:0}, objects = [], particles = [], snow = [], spawnIce = 0, spawnTea = 0, chanting = false, invulnerable = 0, criticalAnnounced = false;
  let last = performance.now(), shake = 0, toastTimer = 0, gameTime = 60;
  for (let i = 0; i < 95; i++) snow.push({x:Math.random()*W,y:Math.random()*H,r:.5+Math.random()*1.9,s:.25+Math.random()*1.1,phase:Math.random()*9});

  function reset() {
    elapsed = 0; cold = 10; breath = 100; score = 0; distance = 0; gameTime = 60;
    player = {x:260,y:455,vx:0,vy:0,blink:0};
    objects = []; particles = []; spawnIce = 1.7; spawnTea = 2.6; invulnerable = 0; shake = 0; criticalAnnounced = false;
    ui.score.textContent = '0000'; ui.time.textContent = '01:00'; ui.heat.style.width = '90%';
    ui.breath.style.width = '100%'; ui.heatStatus.textContent = 'TOASTY'; ui.breathStatus.textContent = 'READY';
    ui.pitch.textContent = 'NATURAL'; ui.frame.classList.remove('shivering');
    ui.overlay.classList.add('hidden');
    state = 'playing';
    startAudio();
    last = performance.now();
  }

  function showEnd(win) {
    state = 'over'; chanting = false; keys.clear(); updateChantButtons();
    if (score > best) {
      best = score;
      localStorage.setItem(bestKey, String(best));
      ui.best.textContent = String(best).padStart(4, '0');
    }
    ui.title.innerHTML = win ? 'COLD<br><i>LEGEND.</i>' : 'THE ICE<br><i>WON.</i>';
    ui.text.textContent = win
      ? `You lasted the full minute and scored ${score} points. Somewhere, an old Mongolian overtone singer nods approvingly.`
      : `You scored ${score} points before the cold claimed your bravado. The hot-tea hut is right there. It has always been right there.`;
    ui.start.querySelector('span').textContent = 'DIVE AGAIN';
    ui.overlay.classList.remove('hidden');
    setAudioLevel();
  }
  function startGame() {
    if (state === 'playing') return;
    ui.start.querySelector('span').textContent = 'TAKE THE PLUNGE';
    reset();
  }
  ui.start.addEventListener('click', startGame);

  let toastTimeout;
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => ui.toast.classList.remove('show'), 1300);
  }

  function updateChantButtons() {
    ui.chant.classList.toggle('active', chanting);
    ui.mobileChant.classList.toggle('active', chanting);
  }
  function setChant(value) {
    chanting = Boolean(value && state === 'playing' && breath > 0.5);
    updateChantButtons();
  }
  function attachHold(button) {
    button.addEventListener('pointerdown', (e) => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); setChant(true); });
    button.addEventListener('pointerup', () => setChant(false));
    button.addEventListener('pointercancel', () => setChant(false));
    button.addEventListener('lostpointercapture', () => setChant(false));
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  attachHold(ui.chant); attachHold(ui.mobileChant);

  const direction = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  document.querySelectorAll('[data-dir]').forEach(button => {
    const k = direction[button.dataset.dir];
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); keys.add(k); });
    const release = () => keys.delete(k);
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  window.addEventListener('pointerup', () => { if (!keys.size) return; keys.clear(); });
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyR') { startGame(); return; }
    if (e.code === 'Space') { if (state !== 'playing') startGame(); else setChant(true); return; }
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) keys.add(e.code);
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'Space') setChant(false);
  });
  window.addEventListener('blur', () => { keys.clear(); setChant(false); });

  function spawn(kind) {
    const y = 340 + Math.random()*260;
    if (kind === 'ice') {
      const size = 27 + Math.random()*27;
      objects.push({kind,x:W+50,y,size,phase:Math.random()*8,variant:Math.random(),speed:260+elapsed*1.65});
    } else {
      objects.push({kind:'tea',x:W+45,y,size:26,phase:Math.random()*8,speed:245+elapsed*1.5});
    }
  }
  function burst(x,y,color,count=13) {
    for(let i=0;i<count;i++) {
      const a=Math.random()*Math.PI*2, sp=35+Math.random()*145;
      particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.35+Math.random()*.55,age:0,size:2+Math.random()*4,color});
    }
  }
  function update(dt) {
    for (const s of snow) { s.x -= s.s*12*dt; s.y += s.s*18*dt; if(s.x<0){s.x=W;s.y=Math.random()*H} if(s.y>H){s.y=-4;s.x=Math.random()*W} }
    if (state !== 'playing') return;
    elapsed += dt; distance += dt*(chanting?4.2:5.5);
    const left = keys.has('KeyA') || keys.has('ArrowLeft'), right = keys.has('KeyD') || keys.has('ArrowRight');
    const up = keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
    let dx = (right?1:0)-(left?1:0), dy=(down?1:0)-(up?1:0);
    const magnitude=Math.hypot(dx,dy)||1; dx/=magnitude; dy/=magnitude;
    const speed=315;
    player.x += dx*speed*dt; player.y += dy*speed*dt;
    player.x=Math.max(130,Math.min(600,player.x)); player.y=Math.max(318,Math.min(612,player.y));
    player.blink += dt*9;
    invulnerable=Math.max(0,invulnerable-dt);

    const chillRate = 1.38 + elapsed/60*.5;
    cold += chillRate*dt;
    if (chanting && breath>0) { cold -= 3.15*dt; breath -= 34*dt; }
    else { breath += 21*dt; }
    breath=Math.max(0,Math.min(100,breath)); cold=Math.max(0,Math.min(100,cold));
    if (breath<=0) { chanting=false; updateChantButtons(); }

    spawnIce-=dt; spawnTea-=dt;
    if(spawnIce<=0){spawn('ice');spawnIce=1.62+Math.random()*.85-Math.min(.45,elapsed/160)}
    if(spawnTea<=0){spawn('tea');spawnTea=5.6+Math.random()*1.8}
    const objSpeed=1;
    for(const o of objects){o.x-=o.speed*dt*objSpeed;o.phase+=dt*2;}
    for(let i=objects.length-1;i>=0;i--){
      const o=objects[i];
      if(o.x<-90){objects.splice(i,1);continue;}
      const dx=o.x-player.x, dy=o.y-player.y, hitRadius=o.kind==='tea'?36:o.size*.72+19;
      if(dx*dx+dy*dy<hitRadius*hitRadius){
        if(o.kind==='tea'){
          cold=Math.max(0,cold-19); breath=Math.min(100,breath+27); score+=125; burst(o.x,o.y,'#d7ff8c',19); showToast('HOT TEA! +125 / WARM BONES');
        } else if(invulnerable<=0){
          cold=Math.min(100,cold+15); score=Math.max(0,score-35); invulnerable=1.1; shake=.22; burst(o.x,o.y,'#94eafa',12); showToast('ICE FLOE! YOUR ANCESTORS ARE DISAPPOINTED');
        }
        objects.splice(i,1);
      }
    }
    score += dt*8;
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=85*dt;p.vx*=.985;if(p.age>=p.life)particles.splice(i,1);}
    shake=Math.max(0,shake-dt);
    const remain=Math.max(0,gameTime-elapsed);
    ui.score.textContent=String(Math.floor(score)).padStart(4,'0');
    const timerSeconds = Math.ceil(remain);
    ui.time.textContent=`${String(Math.floor(timerSeconds/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`;
    const heat=100-cold;
    ui.heat.style.width=`${heat}%`;
    ui.breath.style.width=`${breath}%`;
    ui.heatStatus.textContent=cold<25?'TOASTY':cold<52?'BRISK':cold<76?'NUTS GETTING NERVOUS':cold<93?'ICICLE ZONE':'SEND HELP';
    ui.heatStatus.style.color=cold>68?'#ff9f88':'';
    ui.breathStatus.textContent=breath<20?'GASPING':chanting?'SUSTAINING':breath>85?'READY':'RECOVERING';
    const semitones=16*(cold/100);
    ui.pitch.textContent=cold<13?'NATURAL':`↑ +${semitones.toFixed(1)} ST`;
    if(cold>=90&&!criticalAnnounced){criticalAnnounced=true;showToast('CRITICAL CHILL — VOICE PITCH GOING UP!')}
    ui.frame.classList.toggle('shivering',cold>75);
    setAudioLevel();
    if(cold>=100){showEnd(false);}
    else if(remain<=0){score+=300;ui.score.textContent=String(Math.floor(score)).padStart(4,'0');showEnd(true);}
  }

  function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function drawMountain(c, pts, fill){c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.lineTo(W,330);c.lineTo(0,330);c.closePath();c.fillStyle=fill;c.fill();}
  function drawBackground(c,t){
    const sky=c.createLinearGradient(0,0,0,350);sky.addColorStop(0,'#091b2a');sky.addColorStop(.58,'#163544');sky.addColorStop(1,'#5e9b9b');c.fillStyle=sky;c.fillRect(0,0,W,H);
    // Aurora curtains drift behind the ridge.
    c.save();c.globalCompositeOperation='screen';
    for(let j=0;j<3;j++){
      c.beginPath();const base=86+j*39;
      for(let x=-20;x<=W+20;x+=18){const y=base+Math.sin(x*.006+t*.22+j*1.7)*25+Math.sin(x*.014-t*.13)*10;if(x===-20)c.moveTo(x,y);else c.lineTo(x,y);}
      c.lineTo(W,base+105);c.lineTo(0,base+94);c.closePath();
      const g=c.createLinearGradient(0,base-30,0,base+100);g.addColorStop(0,'rgba(119,255,200,0)');g.addColorStop(.4,j===1?'rgba(102,255,183,.09)':'rgba(105,215,226,.11)');g.addColorStop(1,'rgba(113,255,207,0)');c.fillStyle=g;c.fill();
    }c.restore();
    // Moon and little stars.
    c.save();c.globalAlpha=.9;c.fillStyle='#d7eee0';c.shadowColor='#d8fff1';c.shadowBlur=23;c.beginPath();c.arc(1000,110,34,0,Math.PI*2);c.fill();c.shadowBlur=0;c.globalCompositeOperation='destination-out';c.fillStyle='#183645';c.beginPath();c.arc(1014,100,31,0,Math.PI*2);c.fill();c.restore();
    c.fillStyle='rgba(226,255,249,.58)';for(let i=0;i<48;i++){let x=(i*173.1+31)%W,y=(i*91.7+18)%205,r=(i%5===0)?1.7:.8;c.globalAlpha=.3+.5*(.5+.5*Math.sin(t*1.7+i));c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}c.globalAlpha=1;
    drawMountain(c,[[0,264],[100,176],[158,220],[272,123],[354,207],[456,150],[544,233],[673,109],[763,220],[862,138],[955,219],[1070,128],[1200,219]],'#18313a');
    drawMountain(c,[[0,276],[123,218],[214,254],[332,173],[440,263],[559,189],[668,263],[787,177],[886,255],[1007,186],[1100,245],[1200,201]],'#25434a');
    // snow-cut ridges
    c.strokeStyle='rgba(207,245,226,.36)';c.lineWidth=2;c.beginPath();c.moveTo(272,123);c.lineTo(299,170);c.lineTo(324,154);c.lineTo(354,207);c.moveTo(673,109);c.lineTo(702,164);c.lineTo(729,142);c.lineTo(763,220);c.moveTo(1070,128);c.lineTo(1099,167);c.lineTo(1125,157);c.lineTo(1158,206);c.stroke();
    // Distant ice horizon.
    const water=c.createLinearGradient(0,255,0,H);water.addColorStop(0,'#5b9c9d');water.addColorStop(.16,'#32787f');water.addColorStop(.56,'#174b5a');water.addColorStop(1,'#0b2736');c.fillStyle=water;c.fillRect(0,257,W,H-257);
    // Far bank, ice shelf and cracks.
    c.fillStyle='#b8d8cb';c.beginPath();c.moveTo(0,265);c.quadraticCurveTo(190,248,360,267);c.quadraticCurveTo(490,280,650,259);c.quadraticCurveTo(890,241,1200,267);c.lineTo(1200,284);c.quadraticCurveTo(920,266,700,283);c.quadraticCurveTo(430,300,210,281);c.lineTo(0,287);c.closePath();c.fill();
    c.strokeStyle='rgba(219,255,231,.42)';c.lineWidth=1;for(let i=0;i<17;i++){let x=(i*93+(t*9)%100)%W,y=267+Math.sin(i*1.8)*6;c.beginPath();c.moveTo(x,y);c.lineTo(x+18,y+3);c.lineTo(x+30,y-1);c.stroke()}
    // Water ribbons.
    for(let layer=0;layer<7;layer++){
      let y=305+layer*52+(layer%2)*8;c.beginPath();
      for(let x=-10;x<=W+10;x+=20){const yy=y+Math.sin(x*.013+t*(.55+layer*.04)+layer)*5+Math.sin(x*.035-t*.25)*2.2;if(x===-10)c.moveTo(x,yy);else c.lineTo(x,yy)}
      c.strokeStyle=`rgba(164,235,219,${.13-layer*.012})`;c.lineWidth=layer%2?1:1.5;c.stroke();
    }
    // Scrolling bits of frazil ice.
    for(let i=0;i<28;i++){let x=(i*109-(t*46*(.4+(i%3)*.2))%(W+60)+W+60)%(W+60),y=310+(i*67)%350;c.fillStyle=`rgba(199,250,232,${.14+(i%4)*.045})`;c.beginPath();c.ellipse(x,y,5+(i%4)*2,1.2,Math.sin(t+i),0,Math.PI*2);c.fill()}
    // Snow.
    for(const s of snow){c.globalAlpha=.35+s.r*.16;c.fillStyle='#e5fff3';c.beginPath();c.arc(s.x,s.y,s.r,0,Math.PI*2);c.fill()}c.globalAlpha=1;
    // low-frequency dark vignette at the bottom
    const vg=c.createLinearGradient(0,450,0,H);vg.addColorStop(0,'rgba(1,12,21,0)');vg.addColorStop(1,'rgba(2,12,21,.35)');c.fillStyle=vg;c.fillRect(0,450,W,H-450);
  }
  function drawFloe(c,o,t){
    const x=o.x,y=o.y+Math.sin(o.phase)*3,s=o.size;
    c.save();c.translate(x,y);c.rotate(Math.sin(o.phase*.6)*.035);
    c.shadowColor='rgba(91,244,235,.2)';c.shadowBlur=18;
    c.beginPath();c.moveTo(-s,-s*.28);c.lineTo(-s*.54,-s*.72);c.lineTo(s*.06,-s*.61);c.lineTo(s*.73,-s*.42);c.lineTo(s,-s*.06);c.lineTo(s*.65,s*.42);c.lineTo(-s*.1,s*.61);c.lineTo(-s*.72,s*.36);c.closePath();
    const g=c.createLinearGradient(-s,-s,s,s);g.addColorStop(0,'#d4fff0');g.addColorStop(.32,'#80d9dc');g.addColorStop(1,'#4c9baa');c.fillStyle=g;c.fill();c.shadowBlur=0;
    c.strokeStyle='rgba(233,255,248,.78)';c.lineWidth=2;c.stroke();
    c.beginPath();c.moveTo(-s*.54,-s*.3);c.lineTo(-s*.11,-s*.51);c.lineTo(s*.33,-s*.31);c.strokeStyle='rgba(245,255,250,.55)';c.lineWidth=2;c.stroke();
    c.restore();
  }
  function drawTea(c,o,t){
    const x=o.x,y=o.y+Math.sin(o.phase)*6;
    c.save();c.translate(x,y);c.shadowColor='rgba(220,255,126,.55)';c.shadowBlur=20;
    c.fillStyle='rgba(216,255,128,.22)';c.beginPath();c.arc(0,0,26,0,Math.PI*2);c.fill();c.shadowBlur=0;
    // thermos silhouette
    c.fillStyle='#d5ff78';roundedRect(c,-9,-17,18,34,4);c.fill();c.fillStyle='#718b46';roundedRect(c,-6,-12,12,20,2);c.fill();
    c.fillStyle='#ecffcf';roundedRect(c,-6,-23,12,7,2);c.fill();c.fillStyle='#bddf68';roundedRect(c,-4,-26,8,4,1);c.fill();
    c.strokeStyle='rgba(232,255,221,.75)';c.lineWidth=2;c.beginPath();c.moveTo(0,-29);c.bezierCurveTo(-8,-37,8,-40,1,-48);c.stroke();
    c.restore();
  }
  function drawSwimmer(c,t){
    const p=player;if(!p)return;const x=p.x,y=p.y+Math.sin(t*5)*2.4;
    c.save();c.translate(x,y);
    if(invulnerable>0 && Math.floor(t*17)%2===0)c.globalAlpha=.42;
    // kick wake
    c.strokeStyle='rgba(181,245,229,.46)';c.lineWidth=2;c.beginPath();c.moveTo(-42,9);c.quadraticCurveTo(-63,Math.sin(t*11)*5,-83,4);c.moveTo(-36,17);c.quadraticCurveTo(-57,22+Math.sin(t*9)*5,-69,19);c.stroke();
    // flippers
    c.fillStyle='#ed9679';c.beginPath();c.moveTo(-22,8);c.quadraticCurveTo(-43,20,-58,12);c.lineTo(-38,0);c.closePath();c.fill();
    c.beginPath();c.moveTo(-22,18);c.quadraticCurveTo(-40,31,-53,24);c.lineTo(-34,11);c.closePath();c.fill();
    // swimsuit body
    c.fillStyle='#f4b28a';c.beginPath();c.ellipse(-4,7,31,15,-.08,0,Math.PI*2);c.fill();
    c.fillStyle='#ff735f';c.beginPath();c.moveTo(-22,-3);c.quadraticCurveTo(-5,-15,12,-4);c.lineTo(8,17);c.quadraticCurveTo(-8,22,-24,13);c.closePath();c.fill();
    // arm reaching forward
    c.strokeStyle='#f4b28a';c.lineWidth=9;c.lineCap='round';c.beginPath();c.moveTo(4,-1);c.quadraticCurveTo(23,-18,38,-10);c.stroke();c.fillStyle='#f4b28a';c.beginPath();c.arc(39,-10,6,0,Math.PI*2);c.fill();
    // head and cap
    c.fillStyle='#f2b98e';c.beginPath();c.arc(24,-18,18,0,Math.PI*2);c.fill();
    c.fillStyle='#ff735f';c.beginPath();c.ellipse(22,-30,19,11,-.08,Math.PI,Math.PI*2);c.lineTo(39,-25);c.quadraticCurveTo(34,-19,17,-20);c.closePath();c.fill();
    // goggles / nose
    c.strokeStyle='#14303b';c.lineWidth=2.5;c.beginPath();c.moveTo(27,-20);c.lineTo(40,-18);c.stroke();c.fillStyle='#b9ffff';roundedRect(c,28,-24,11,7,3);c.fill();
    c.fillStyle='#f2b98e';c.beginPath();c.moveTo(39,-17);c.lineTo(47,-13);c.lineTo(39,-11);c.fill();
    // scarf flutter
    c.fillStyle='#d8ff7b';c.beginPath();c.moveTo(9,-8);c.quadraticCurveTo(-5,-5,-15,2);c.quadraticCurveTo(-3,3,10,-1);c.closePath();c.fill();
    if(chanting){
      c.save();c.globalAlpha=.75;
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(30,-18,31+i*13,23+i*9,0,-.95,.95);c.strokeStyle=`rgba(171,255,218,${.57-i*.14})`;c.lineWidth=2;c.stroke()}
      c.restore();
    }
    c.restore();
  }
  function drawParticles(c){for(const p of particles){const a=Math.max(0,1-p.age/p.life);c.globalAlpha=a;c.fillStyle=p.color;c.shadowColor=p.color;c.shadowBlur=12;c.beginPath();c.arc(p.x,p.y,p.size*(.5+a*.5),0,Math.PI*2);c.fill()}c.globalAlpha=1;c.shadowBlur=0;}
  function draw(){
    const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    const sx=canvas.width/W,sy=canvas.height/H;
    ctx.setTransform(sx,0,0,sy,0,0);
    const t=performance.now()/1000;
    ctx.save();if(shake>0){ctx.translate((Math.random()-.5)*shake*32,(Math.random()-.5)*shake*18)}
    drawBackground(ctx,t);
    // tiny distant floes
    for(let i=0;i<4;i++){const x=(i*350-(t*24)%(W+260)+W+260)%(W+260)-40;ctx.fillStyle='rgba(188,231,216,.52)';ctx.beginPath();ctx.ellipse(x,283+Math.sin(t+i)*3,50+i%2*20,7,0,0,Math.PI*2);ctx.fill()}
    for(const o of objects){if(o.kind==='ice')drawFloe(ctx,o,t);else drawTea(ctx,o,t)}
    drawSwimmer(ctx,t);drawParticles(ctx);
    // Chant intensity light on the swimmer.
    if(chanting&&player){const g=ctx.createRadialGradient(player.x,player.y,2,player.x,player.y,140);g.addColorStop(0,'rgba(206,255,135,.12)');g.addColorStop(1,'rgba(206,255,135,0)');ctx.fillStyle=g;ctx.fillRect(player.x-140,player.y-140,280,280)}
    ctx.restore();
  }
  function loop(now){const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;update(dt);draw();requestAnimationFrame(loop)}
  requestAnimationFrame(loop);
})();
