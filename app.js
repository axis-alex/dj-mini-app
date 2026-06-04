(function(){
'use strict';
const TG=window.Telegram?.WebApp; if(TG) TG.ready();
const playerA=new Tone.Player(),playerB=new Tone.Player();
const eqA=new Tone.EQ3(0,0,0),eqB=new Tone.EQ3(0,0,0);
const gainA=new Tone.Gain(1),gainB=new Tone.Gain(1);
const masterGain=new Tone.Gain(0.8),crossFade=new Tone.CrossFade(0.5);
const fxA={delay:new Tone.FeedbackDelay('8n',0.4).set({wet:0}),reverb:new Tone.Reverb(1.5).set({wet:0}),phaser:new Tone.Phaser({frequency:2,octaves:3,baseFrequency:1000}).set({wet:0})};
const fxB={delay:new Tone.FeedbackDelay('8n',0.4).set({wet:0}),reverb:new Tone.Reverb(1.5).set({wet:0}),phaser:new Tone.Phaser({frequency:2,octaves:3,baseFrequency:1000}).set({wet:0})};
playerA.chain(eqA,fxA.delay,fxA.reverb,fxA.phaser,gainA,crossFade.a);
playerB.chain(eqB,fxB.delay,fxB.reverb,fxB.phaser,gainB,crossFade.b);
const dest=Tone.context.createMediaStreamDestination();
crossFade.chain(masterGain,Tone.Destination); masterGain.connect(dest);

const deck={
  A:{playing:false,fileUrl:null,startTime:0,offset:0,bpm:0,firstBeat:0,pitch:1,loopIn:-1,loopOut:-1,loopActive:false,bars:null},
  B:{playing:false,fileUrl:null,startTime:0,offset:0,bpm:0,firstBeat:0,pitch:1,loopIn:-1,loopOut:-1,loopActive:false,bars:null}
};
const players={A:playerA,B:playerB};
let isRecording=false,mediaRecorder,audioChunks=[];
const activeFx={A:{},B:{}};
const $=id=>document.getElementById(id);

// API base URL — auto-detected from server injection or configured manually
// When served from server.js, window.__API_BASE is injected automatically
// When on GitHub Pages, set this to your server's public URL (e.g. https://xxx.loca.lt)
const API_BASE = window.__API_BASE || '';

function fmtTime(s){if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60);const sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec;}
function getDur(d){const p=players[d];return p.buffer?.loaded?p.buffer.duration:0;}
function getPos(d){const s=deck[d];if(!s.playing)return Math.min(s.offset,getDur(d));const el=(Tone.now()-s.startTime)*s.pitch;return Math.min(s.offset+el,getDur(d));}

// === Pre-compute waveform bars (SoundCloud style) ===
function computeBars(buffer,numBars){
  if(!buffer||!buffer.loaded)return null;
  const ch=buffer.getChannelData(0);
  const len=ch.length;
  const step=Math.floor(len/numBars);
  const bars=new Float32Array(numBars);
  let maxPeak=0;
  for(let i=0;i<numBars;i++){
    let peak=0;
    const start=i*step;
    for(let j=0;j<step;j++){
      const v=Math.abs(ch[start+j]||0);
      if(v>peak)peak=v;
    }
    bars[i]=peak;
    if(peak>maxPeak)maxPeak=peak;
  }
  if(maxPeak>0)for(let i=0;i<numBars;i++)bars[i]/=maxPeak;
  return bars;
}

// === SoundCloud-style waveform ===
function drawWaveform(canvas,d,accent){
  const s=deck[d];
  const bars=s.bars;
  const dpr=Math.min(window.devicePixelRatio||1, 2); // Fix #11: cap DPR at 2 for perf
  const cw=canvas.clientWidth,ch=canvas.clientHeight;
  const w=cw*dpr,h=ch*dpr;
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#080818';
  ctx.fillRect(0,0,w,h);

  if(!bars){
    ctx.fillStyle='#2a2a4a';
    ctx.font=(11*dpr)+'px Inter,sans-serif';
    ctx.textAlign='center';
    ctx.fillText('нет трека',w/2,h/2+4*dpr);
    return;
  }

  const zoom = s.zoom || 1;
  const dur=getDur(d);
  const pos=getPos(d);
  const progress=dur>0?pos/dur:0;
  
  const numBars=bars.length;
  const visibleFraction = 1 / zoom;
  let startFraction = progress - visibleFraction / 2;
  let endFraction = progress + visibleFraction / 2;
  
  if (startFraction < 0) {
    startFraction = 0;
    endFraction = Math.min(1, visibleFraction);
  }
  if (endFraction > 1) {
    endFraction = 1;
    startFraction = Math.max(0, 1 - visibleFraction);
  }
  
  const startIndex = Math.floor(startFraction * numBars);
  const endIndex = Math.min(numBars, Math.ceil(endFraction * numBars));
  const visibleBarsCount = endIndex - startIndex;
  
  const playX = ((progress - startFraction) / visibleFraction) * w;

  // Loop region
  const loopIn=s.loopIn,loopOut=s.loopOut;
  const hasLoop=loopIn>=0&&loopOut>loopIn;
  if(hasLoop){
    const loopInFrac = loopIn / dur;
    const loopOutFrac = loopOut / dur;
    if (loopOutFrac > startFraction && loopInFrac < endFraction) {
      const x1 = Math.max(0, ((loopInFrac - startFraction) / visibleFraction) * w);
      const x2 = Math.min(w, ((loopOutFrac - startFraction) / visibleFraction) * w);
      ctx.fillStyle=s.loopActive?'rgba(0,230,118,0.08)':'rgba(0,230,118,0.04)';
      ctx.fillRect(x1,0,x2-x1,h);
      // Loop markers
      ctx.fillStyle=s.loopActive?'rgba(0,230,118,0.6)':'rgba(0,230,118,0.3)';
      if (x1 >= 0 && x1 <= w) ctx.fillRect(x1,0,1.5*dpr,h);
      if (x2 >= 0 && x2 <= w) ctx.fillRect(x2-1.5*dpr,0,1.5*dpr,h);
    }
  }

  // Bar dimensions
  const barGap=1*dpr;
  const totalBarW=w/visibleBarsCount;
  const barW=Math.max(1,totalBarW-barGap);
  const mainH=h*0.65;
  const refH=h*0.25;
  const midY=mainH;

  for(let i=0;i<visibleBarsCount;i++){
    const amp=bars[startIndex + i] || 0;
    const x=i*totalBarW;
    const bh=Math.max(1*dpr, amp*mainH*0.95);
    const rh=Math.max(0, amp*refH*0.6);
    const isPast=x<playX;

    if(isPast){
      ctx.fillStyle=accent;
      ctx.globalAlpha=0.85;
    }else{
      ctx.fillStyle=accent;
      ctx.globalAlpha=0.25;
    }
    const bx=x+barGap/2;
    const by=midY-bh;
    const radius=Math.min(barW/2, 2*dpr);
    ctx.beginPath();
    ctx.moveTo(bx+radius,by);
    ctx.lineTo(bx+barW-radius,by);
    ctx.quadraticCurveTo(bx+barW,by,bx+barW,by+radius);
    ctx.lineTo(bx+barW,midY);
    ctx.lineTo(bx,midY);
    ctx.lineTo(bx,by+radius);
    ctx.quadraticCurveTo(bx,by,bx+radius,by);
    ctx.fill();

    const ry=midY+2*dpr;
    ctx.globalAlpha*=0.3;
    ctx.fillRect(bx,ry,barW,rh);
    ctx.globalAlpha=1;
  }

  // Playhead
  if(progress>0.001&&progress<0.999 && playX >= 0 && playX <= w){
    ctx.save();
    ctx.shadowColor=accent;
    ctx.shadowBlur=8*dpr;
    ctx.fillStyle='#ffffff';
    ctx.fillRect(playX-1*dpr,0,2*dpr,h);
    ctx.restore();
    ctx.fillStyle='#ffffff';
    ctx.beginPath();
    ctx.moveTo(playX-4*dpr,0);
    ctx.lineTo(playX+4*dpr,0);
    ctx.lineTo(playX,6*dpr);
    ctx.fill();
  }

  // Subtle center divider
  ctx.strokeStyle='rgba(255,255,255,0.06)';
  ctx.beginPath();ctx.moveTo(0,midY);ctx.lineTo(w,midY);ctx.stroke();
}


// === BPM Detection (onset energy flux + autocorrelation) ===
function detectBPM(buffer) {
  if (!buffer?.loaded) return { bpm: 0, firstBeat: 0 };
  const raw = buffer.getChannelData(0);
  const sr = buffer.sampleRate;

  // 1. Compute energy in ~10ms frames (low-pass focus for kick detection)
  const frameSize = Math.floor(sr * 0.01); // 10ms
  const hopSize = Math.floor(frameSize / 2);
  const numFrames = Math.floor((raw.length - frameSize) / hopSize);
  const energy = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const offset = i * hopSize;
    for (let j = 0; j < frameSize; j++) {
      const v = raw[offset + j];
      sum += v * v;
    }
    energy[i] = sum / frameSize;
  }

  // 2. Spectral flux (positive energy difference = onset likelihood)
  const flux = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    const diff = energy[i] - energy[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // 3. Adaptive threshold for onset detection
  const windowLen = 20; // ~100ms median window
  const onsets = [];
  const minOnsetDist = Math.floor(0.1 * sr / hopSize); // min 100ms between onsets

  for (let i = windowLen; i < numFrames - windowLen; i++) {
    // Local median threshold
    let localVals = [];
    for (let j = i - windowLen; j <= i + windowLen; j++) localVals.push(flux[j]);
    localVals.sort((a, b) => a - b);
    const median = localVals[Math.floor(localVals.length * 0.7)];
    const threshold = median * 1.8 + 0.0001;

    if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      if (onsets.length === 0 || i - onsets[onsets.length - 1] >= minOnsetDist) {
        onsets.push(i);
      }
    }
  }

  if (onsets.length < 8) return { bpm: 0, firstBeat: 0 };

  // 4. Autocorrelation on onset pulse train
  const onsetSignal = new Float32Array(numFrames);
  onsets.forEach(o => { onsetSignal[o] = 1; });

  // BPM range: 60-180 → interval range in frames
  const frameRate = sr / hopSize;
  const minLag = Math.floor(frameRate * 60 / 180); // 180 BPM
  const maxLag = Math.floor(frameRate * 60 / 60);  // 60 BPM
  const acLen = Math.min(maxLag + 1, numFrames);

  let bestLag = minLag, bestCorr = 0;
  for (let lag = minLag; lag <= Math.min(maxLag, acLen); lag++) {
    let corr = 0;
    const limit = Math.min(numFrames - lag, numFrames);
    for (let i = 0; i < limit; i++) {
      corr += onsetSignal[i] * onsetSignal[i + lag];
    }
    // Weight towards common tempos (120-130 BPM)
    const bpmAtLag = frameRate * 60 / lag;
    const tempoWeight = 1 + 0.1 * Math.exp(-Math.pow((bpmAtLag - 125) / 30, 2));
    corr *= tempoWeight;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  let bpm = frameRate * 60 / bestLag;
  // Normalize to 70-170 range (prefer doubling/halving)
  while (bpm > 170) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  bpm = Math.round(bpm * 10) / 10; // 1 decimal precision

  // 5. Find first beat position (best candidate matching the BPM grid)
  const beatInterval = 60 / bpm;
  let bestFirstBeat = onsets.length > 0 ? (onsets[0] * hopSize / sr) : 0;
  let maxScore = -1;

  // Check first ~20 onsets to see which one aligns best with the rest of the file
  const candidates = onsets.slice(0, 20);
  candidates.forEach(o => {
    const candidateTime = o * hopSize / sr;
    let score = 0;
    // Count how many other onsets fall on the grid defined by this candidate
    for (let i = 0; i < Math.min(onsets.length, 100); i++) {
      const otherTime = onsets[i] * hopSize / sr;
      const diff = Math.abs(otherTime - candidateTime);
      const distToGrid = diff % beatInterval;
      if (distToGrid < 0.04 || distToGrid > beatInterval - 0.04) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestFirstBeat = candidateTime;
    }
  });

  return { bpm, firstBeat: bestFirstBeat };
}

// Get the beat phase: position within the current beat (0.0 - 1.0)
function getBeatPhase(d) {
  const s = deck[d];
  if (s.bpm <= 0) return 0;
  const pos = getPos(d);
  const interval = 60 / s.bpm;
  // Phase relative to beat grid
  let phase = ((pos - s.firstBeat) % interval) / interval;
  if (phase < 0) phase += 1;
  return phase;
}

// === Sync State ===
let syncLocked = false;
let syncFollower = null; // 'A' or 'B'

function updatePitchUI(d, value) {
  const sl = $(d === 'A' ? 'pitchA' : 'pitchB');
  const valEl = $(d === 'A' ? 'pitchValA' : 'pitchValB');
  const pct = (value - 1) * 100;
  sl.value = pct;
  const disp = pct.toFixed(1);
  valEl.textContent = (pct > 0 ? '+' : '') + disp + '%';
  valEl.classList.toggle('negative', pct < 0);
}

// Reset pitch of a single deck to 1.0
function resetPitch(d) {
  deck[d].pitch = 1;
  players[d].playbackRate = 1;
  updatePitchUI(d, 1);
}

// Reset both decks' pitch
function resetBothPitch() {
  resetPitch('A');
  resetPitch('B');
  $('syncABtn')?.classList.remove('synced');
  $('syncBBtn')?.classList.remove('synced');
  $('syncStatus').textContent = '↺ Pitch reset';
  setTimeout(() => { $('syncStatus').textContent = ''; }, 2000);
}

// Sync: follower adjusts pitch to match master's effective BPM and aligns phase
function performSync(follower) {
  const master = follower === 'A' ? 'B' : 'A';
  const sM = deck[master], sF = deck[follower];
  const pM = players[master], pF = players[follower];

  if (!pM.buffer?.loaded || !pF.buffer?.loaded) {
    alert('Загрузите оба трека'); return;
  }
  if (sM.bpm <= 0 || sF.bpm <= 0) {
    alert('BPM не определен'); return;
  }

  const stEl = $('syncStatus');

  // 1. Calculate Master's current effective BPM (BPM * current pitch)
  const masterEffectiveBPM = sM.bpm * sM.pitch;
  
  // 2. Set Follower's pitch to reach the same effective BPM
  const newPitch = masterEffectiveBPM / sF.bpm;
  sF.pitch = newPitch;
  pF.playbackRate = newPitch;
  updatePitchUI(follower, newPitch);

  // 3. Phase Alignment (Beat Match)
  const phaseM = sM.playing ? getBeatPhase(master) : 0;
  const phaseF = getBeatPhase(follower);
  
  let phaseDiff = phaseM - phaseF;
  if (phaseDiff > 0.5) phaseDiff -= 1;
  if (phaseDiff < -0.5) phaseDiff += 1;

  const intervalF = 60 / sF.bpm;
  const jumpAmount = phaseDiff * intervalF;
  const curPos = getPos(follower);
  const target = curPos + jumpAmount;
  
  const clamped = Math.max(0, Math.min(target, getDur(follower) - 0.1));
  sF.offset = clamped;

  if (sF.playing) {
    pF.stop();
    pF.playbackRate = newPitch;
    pF.start(undefined, clamped);
    sF.startTime = Tone.now();
  }

  // Visual feedback
  syncFollower = follower;
  stEl.textContent = `✅ Sync: ${follower} -> ${master} (${masterEffectiveBPM.toFixed(1)} BPM)`;
  setTimeout(() => { if(stEl.textContent.includes('Sync')) stEl.textContent = ''; }, 3000);
}

// Continuous sync: per-frame phase correction
function continuousSync() {
  if (!syncLocked || !syncFollower) return;
  const f = syncFollower, m = f === 'A' ? 'B' : 'A';
  if (!deck[m].playing || !deck[f].playing) return;
  if (deck[m].bpm <= 0 || deck[f].bpm <= 0) return;

  const bpmM = deck[m].bpm, bpmF = deck[f].bpm;
  const targetPitch = Math.max(0.5, Math.min(1.5, bpmM / bpmF));

  // Keep pitch locked (no drift)
  if (Math.abs(deck[f].pitch - targetPitch) > 0.001) {
    deck[f].pitch = targetPitch;
    updatePitchUI(f, targetPitch);
  }

  // Phase correction
  const phaseM = getBeatPhase(m), phaseF = getBeatPhase(f);
  let pd = phaseM - phaseF;
  if (pd > 0.5) pd -= 1;
  if (pd < -0.5) pd += 1;
  const absDiff = Math.abs(pd);

  if (absDiff > 0.03 && absDiff < 0.15) {
    players[f].playbackRate = targetPitch + (pd > 0 ? 0.003 : -0.003);
  } else if (absDiff >= 0.15) {
    const intervalF = 60 / bpmF;
    const posF = getPos(f);
    const cb = Math.round((posF - deck[f].firstBeat) / intervalF);
    const tp = deck[f].firstBeat + cb * intervalF + phaseM * intervalF;
    if (tp > 0 && tp < getDur(f)) seekDeck(f, tp / getDur(f));
    players[f].playbackRate = targetPitch;
  } else {
    players[f].playbackRate = targetPitch;
  }

  $('syncStatus').textContent = '🔒 Lock ' + f + '→' + m +
    ' | Δ' + Math.round(absDiff * 100) + '% | ' + bpmM + ' BPM';
}

// === Load ===
async function loadDeck(d, url) {
  if (Tone.context.state !== 'running') await Tone.start();
  const p = players[d], s = deck[d];
  const stEl = $(d === 'A' ? 'statusA' : 'statusB');
  stEl.textContent = '⏳ Loading...';
  if (s.fileUrl && s.fileUrl.startsWith('blob:')) URL.revokeObjectURL(s.fileUrl);
  s.offset = 0; s.startTime = 0; s.loopIn = -1; s.loopOut = -1; s.loopActive = false;
  updateLoopUI(d);

  try {
    let loadUrl = url;

    // For remote URLs (API streams), download as Blob with progress → ObjectURL
    if (url.startsWith('http') || url.startsWith('/api/')) {
      stEl.textContent = '⬇️ 0%';
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Fix #3: Check for ReadableStream support (iOS < 16.4 fallback)
      if (total && response.body && typeof response.body.getReader === 'function') {
        // Stream with progress
        try {
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            const pct = Math.round((received / total) * 100);
            stEl.textContent = `⬇️ ${pct}%`;
          }

          const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'audio/mpeg' });
          loadUrl = URL.createObjectURL(blob);
        } catch (streamErr) {
          // ReadableStream failed — fallback to blob
          console.warn('Stream read failed, using blob fallback:', streamErr);
          stEl.textContent = '⬇️ ...';
          const fallbackResponse = await fetch(url);
          const blob = await fallbackResponse.blob();
          loadUrl = URL.createObjectURL(blob);
        }
      } else {
        // Fallback: no Content-Length or no ReadableStream support
        stEl.textContent = '⬇️ ...';
        const blob = await response.blob();
        loadUrl = URL.createObjectURL(blob);
      }
      s.fileUrl = loadUrl;
      stEl.textContent = '⏳ Декодирование...';
    } else {
      s.fileUrl = url;
    }

    await p.load(loadUrl);
    const result = detectBPM(p.buffer);
    s.bpm = result.bpm;
    s.firstBeat = result.firstBeat;
    s.bars = computeBars(p.buffer, 2000);
    stEl.textContent = '🎵 Ready';
    $(d === 'A' ? 'bpmA' : 'bpmB').textContent = s.bpm ? s.bpm + ' BPM' : '— BPM';
    $(d === 'A' ? 'durA' : 'durB').textContent = fmtTime(getDur(d));
    if (s.playing) { p.stop(); p.playbackRate = s.pitch; p.start(undefined, 0); s.startTime = Tone.now(); s.offset = 0; }
  } catch (e) {
    console.error('loadDeck error:', e);
    stEl.textContent = '❌ Ошибка загрузки';
  }
}

// === Play/Pause ===
async function playDeck(d){
  if (Tone.context.state !== 'running') await Tone.start();
  const p=players[d],s=deck[d];
  if(!p.buffer?.loaded)return;
  if(s.playing){
    s.offset=getPos(d);p.stop();s.playing=false;
    $(d==='A'?'playA':'playB').textContent='▶ Play';
    $(d==='A'?'playA':'playB').classList.remove('playing');
  }else{
    if(s.offset>=getDur(d))s.offset=0;
    p.playbackRate=s.pitch;p.start(undefined,s.offset);s.startTime=Tone.now();s.playing=true;
    $(d==='A'?'playA':'playB').textContent='⏸ Pause';
    $(d==='A'?'playA':'playB').classList.add('playing');
  }
}

// === Seek ===
async function seekDeck(d,frac){
  if (Tone.context.state !== 'running') await Tone.start();
  const p=players[d],s=deck[d];
  if(!p.buffer?.loaded)return;
  const pos=Math.max(0,Math.min(frac,0.999))*getDur(d);
  s.offset=pos;
  if(s.playing){p.stop();p.playbackRate=s.pitch;p.start(undefined,pos);s.startTime=Tone.now();}
  $(d==='A'?'timeA':'timeB').textContent=fmtTime(pos);
}

function setupWaveformInteraction(cid,d){
  const c=$(cid);
  let drag=false;
  let lastX=0;
  let initialPinchDist=0;
  let initialZoom=1;

  function handleDown(e) {
    if (e.touches && e.touches.length === 2) {
      drag = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.sqrt(dx*dx + dy*dy);
      initialZoom = deck[d].zoom || 1;
    } else {
      drag = true;
      lastX = e.touches ? e.touches[0].clientX : e.clientX;
      if ((deck[d].zoom || 1) === 1) {
        const r=c.getBoundingClientRect();
        const f=Math.max(0,Math.min(1,(lastX-r.left)/r.width));
        seekDeck(d, f);
      }
    }
  }

  function handleMove(e) {
    if (e.touches && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const scale = dist / initialPinchDist;
      let newZoom = initialZoom * scale;
      newZoom = Math.max(1, Math.min(newZoom, 20));
      deck[d].zoom = newZoom;
    } else if (drag) {
      const currentX = e.touches ? e.touches[0].clientX : e.clientX;
      const deltaX = currentX - lastX;
      lastX = currentX;
      
      const zoom = deck[d].zoom || 1;
      const r=c.getBoundingClientRect();
      if (zoom > 1) {
        const visibleFraction = 1 / zoom;
        const shiftFrac = - (deltaX / r.width) * visibleFraction;
        const dur = getDur(d);
        const curPos = getPos(d);
        const newPos = curPos + shiftFrac * dur;
        seekDeck(d, newPos / dur);
      } else {
        const f=Math.max(0,Math.min(1,(currentX-r.left)/r.width));
        seekDeck(d, f);
      }
    }
  }

  c.addEventListener('mousedown', e => { handleDown(e); });
  c.addEventListener('mousemove', e => { if(drag) handleMove(e); });
  window.addEventListener('mouseup', () => { drag=false; });
  
  c.addEventListener('touchstart', e => { handleDown(e); e.preventDefault(); }, {passive:false});
  c.addEventListener('touchmove', e => { handleMove(e); e.preventDefault(); }, {passive:false});
  c.addEventListener('touchend', () => { drag=false; });
}
setupWaveformInteraction('waveA','A');
setupWaveformInteraction('waveB','B');

// === A-B Loop ===
function updateLoopUI(d){
  const s=deck[d];
  const inBtn=$('loopIn'+d),outBtn=$('loopOut'+d),togBtn=$('loopToggle'+d),info=$('loopInfo'+d);
  inBtn.classList.toggle('set',s.loopIn>=0);
  outBtn.classList.toggle('set',s.loopOut>=0);
  togBtn.classList.toggle('active',s.loopActive);
  if(s.loopIn>=0&&s.loopOut>0){info.textContent=fmtTime(s.loopIn)+' → '+fmtTime(s.loopOut);}
  else if(s.loopIn>=0){info.textContent='A: '+fmtTime(s.loopIn);}
  else{info.textContent='';}
}
function setupLoop(d){
  $('loopIn'+d).addEventListener('click',()=>{deck[d].loopIn=getPos(d);if(deck[d].loopOut>=0&&deck[d].loopOut<=deck[d].loopIn)deck[d].loopOut=-1;updateLoopUI(d);});
  $('loopOut'+d).addEventListener('click',()=>{const pos=getPos(d);if(deck[d].loopIn>=0&&pos>deck[d].loopIn){deck[d].loopOut=pos;deck[d].loopActive=true;}updateLoopUI(d);});
  $('loopToggle'+d).addEventListener('click',()=>{if(deck[d].loopIn>=0&&deck[d].loopOut>deck[d].loopIn){deck[d].loopActive=!deck[d].loopActive;}updateLoopUI(d);});
  $('loopClear'+d).addEventListener('click',()=>{deck[d].loopIn=-1;deck[d].loopOut=-1;deck[d].loopActive=false;updateLoopUI(d);});
}
setupLoop('A');setupLoop('B');

// === Pitch ===
function setupPitch(d){
  const sl=$(d==='A'?'pitchA':'pitchB'),val=$(d==='A'?'pitchValA':'pitchValB');
  sl.addEventListener('input',()=>{
    const sliderVal=parseFloat(sl.value);
    const v=1 + (sliderVal/100);
    deck[d].pitch=v;players[d].playbackRate=v;
    const disp=sliderVal.toFixed(1);
    val.textContent=(sliderVal>0?'+':'')+disp+'%';val.classList.toggle('negative',sliderVal<0);
  });
  addReset(d==='A'?'pitchA':'pitchB', 0, () => {
    deck[d].pitch=1;players[d].playbackRate=1;val.textContent='0.0%';val.classList.remove('negative');
  });
}
setupPitch('A');setupPitch('B');

// === Sync button handlers (with double-tap reset) ===
let lastSyncTapA = 0, lastSyncTapB = 0;

$('syncABtn')?.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastSyncTapA < 400) { resetBothPitch(); lastSyncTapA = 0; return; }
  lastSyncTapA = now;
  performSync('A');
});
$('syncBBtn')?.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastSyncTapB < 400) { resetBothPitch(); lastSyncTapB = 0; return; }
  lastSyncTapB = now;
  performSync('B');
});

$('syncLockBtn')?.addEventListener('click', () => {
  syncLocked = !syncLocked;
  $('syncLockBtn').classList.toggle('active', syncLocked);
  $('syncLockBtn').textContent = syncLocked ? '🔓 Unlock' : '🔒 Lock';
  if (syncLocked) {
    if (syncFollower) {
      performSync(syncFollower);
      $('syncStatus').textContent = '🔒 Lock ' + syncFollower + ' активен';
    } else {
      $('syncStatus').textContent = '⚠ Сначала нажмите Sync A или Sync B';
      syncLocked = false;
      $('syncLockBtn').classList.remove('active');
      $('syncLockBtn').textContent = '🔒 Lock';
    }
  } else {
    $('syncStatus').textContent = '';
    $('syncABtn')?.classList.remove('synced');
    $('syncBBtn')?.classList.remove('synced');
    if (syncFollower) players[syncFollower].playbackRate = deck[syncFollower].pitch;
  }
});

// === File loading ===
$('localA')?.addEventListener('click',()=>$('fileA').click());
$('localB')?.addEventListener('click',()=>$('fileB').click());
$('fileA')?.addEventListener('change',e=>{if(e.target.files[0])loadDeck('A',URL.createObjectURL(e.target.files[0]));});
$('fileB')?.addEventListener('change',e=>{if(e.target.files[0])loadDeck('B',URL.createObjectURL(e.target.files[0]));});
// === Track Browser Logic ===
let currentTargetDeck = null;
const trackModal = $('trackBrowserModal');
const trackList = $('trackList');

function triggerSync() {
    const initData = window.Telegram?.WebApp?.initData || '';
    const syncBtn = $('syncLibraryBtn');
    if (syncBtn) { syncBtn.textContent = '⏳ Отправка...'; syncBtn.disabled = true; }
    
    fetch(`${API_BASE}/api/sync?initData=${encodeURIComponent(initData)}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (syncBtn) { syncBtn.textContent = '✅ Проверьте чат с ботом'; }
            // Show instructions inside the track list
            trackList.innerHTML = '<div class="track-empty">' +
                '🔄 Сообщение отправлено в чат с ботом!<br><br>' +
                '1. Перейдите в чат с ботом<br>' +
                '2. Перешлите ему ваши аудиофайлы<br>' +
                '3. Вернитесь сюда и обновите список<br><br>' +
                '<button class="sync-btn sync-refresh" id="refreshTracksBtn">🔄 Обновить список</button>' +
                '</div>';
            $('refreshTracksBtn')?.addEventListener('click', () => openTrackBrowser(currentTargetDeck));
        })
        .catch(err => {
            console.error('Sync error:', err);
            if (syncBtn) { syncBtn.textContent = '🔄 Синхронизировать'; syncBtn.disabled = false; }
        });
}

function openTrackBrowser(deck) {
    currentTargetDeck = deck;
    trackModal.classList.add('active');
    trackList.innerHTML = '<div class="track-loading">Загрузка треков...</div>';
    
    const initData = window.Telegram?.WebApp?.initData || '';
    fetch(`${API_BASE}/api/tracks?initData=${encodeURIComponent(initData)}`)
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(tracks => {
            trackList.innerHTML = '';
            if (tracks.length === 0) {
                trackList.innerHTML = '<div class="track-empty">' +
                    '📭 Библиотека пуста.<br><br>' +
                    'Отправьте аудиофайлы боту в чат, или нажмите кнопку ниже для восстановления.' +
                    '<br><br><button class="sync-btn" id="syncLibraryBtn">🔄 Синхронизировать библиотеку</button>' +
                    '</div>';
                $('syncLibraryBtn')?.addEventListener('click', triggerSync);
                return;
            }
            
            // Add sync button at top of list
            const syncRow = document.createElement('div');
            syncRow.className = 'track-sync-row';
            syncRow.innerHTML = `<span>${tracks.length} треков</span><button class="sync-btn-small" id="syncLibraryBtn">🔄 Синхр.</button>`;
            trackList.appendChild(syncRow);
            syncRow.querySelector('#syncLibraryBtn')?.addEventListener('click', triggerSync);

            tracks.forEach(track => {
                const div = document.createElement('div');
                div.className = 'track-item';
                div.innerHTML = `
                    <div class="track-title">${track.performer} - ${track.title}</div>
                    <div class="track-meta">
                        <span>${track.file_name || 'audio'}</span>
                        <span>${fmtTime(track.duration)}</span>
                    </div>
                `;
                div.addEventListener('click', () => {
                    const streamUrl = `${API_BASE}/api/tracks/${track.file_id}/stream?initData=${encodeURIComponent(initData)}`;
                    loadDeck(currentTargetDeck, streamUrl);
                    trackModal.classList.remove('active');
                });
                trackList.appendChild(div);
            });
        })
        .catch(err => {
            console.error('Track browser error:', err);
            const isGitHubPages = location.hostname.includes('github.io');
            if (isGitHubPages && !API_BASE) {
                trackList.innerHTML = '<div class="track-empty">⚠️ Сервер не настроен.<br><br>Приложение работает на GitHub Pages, но API-сервер недоступен.<br><br>Запустите <code>node server.js</code> и откройте приложение через URL сервера.</div>';
            } else if (!initData) {
                trackList.innerHTML = '<div class="track-empty">⚠️ Откройте приложение через Telegram-бота, а не напрямую в браузере.</div>';
            } else {
                trackList.innerHTML = `<div class="track-empty">❌ Сервер недоступен (${API_BASE || location.origin}).<br><br>Убедитесь, что <code>node server.js</code> запущен.</div>`;
            }
        });
}

$('closeTrackBrowser')?.addEventListener('click', () => trackModal.classList.remove('active'));
trackModal?.addEventListener('click', e => { if(e.target === trackModal) trackModal.classList.remove('active'); });

$('tgA')?.addEventListener('click', () => openTrackBrowser('A'));
$('tgB')?.addEventListener('click', () => openTrackBrowser('B'));
$('playA').addEventListener('click',()=>playDeck('A'));
$('playB').addEventListener('click',()=>playDeck('B'));

// === CUE ===
function cueDeck(d) {
  const p = players[d], s = deck[d];
  if (!p.buffer?.loaded) return;
  const cuePoint = s.loopIn >= 0 ? s.loopIn : 0;
  
  if (s.playing) {
    p.stop();
    s.playing = false;
    s.offset = cuePoint;
    $(d === 'A' ? 'playA' : 'playB').textContent = '▶ Play';
    $(d === 'A' ? 'playA' : 'playB').classList.remove('playing');
  } else {
    s.offset = cuePoint;
  }
}

function setupCue(d) {
  const btn = $(d === 'A' ? 'cueA' : 'cueB');
  if (!btn) return;
  
  let isCuePlaying = false;
  
  const startCuePlay = async (e) => {
    e.preventDefault();
    if (deck[d].playing && !isCuePlaying) {
      cueDeck(d); // Regular pause and return to CUE
    } else {
      cueDeck(d); // jump to CUE
      if (Tone.context.state !== 'running') await Tone.start();
      const p = players[d], s = deck[d];
      p.playbackRate = s.pitch;
      p.start(undefined, s.offset);
      s.startTime = Tone.now();
      s.playing = true;
      isCuePlaying = true;
      $(d === 'A' ? 'playA' : 'playB').classList.add('playing');
    }
  };
  
  const stopCuePlay = (e) => {
    e.preventDefault();
    if (!isCuePlaying) return;
    const p = players[d], s = deck[d];
    p.stop();
    s.playing = false;
    isCuePlaying = false;
    s.offset = s.loopIn >= 0 ? s.loopIn : 0;
    $(d === 'A' ? 'playA' : 'playB').textContent = '▶ Play';
    $(d === 'A' ? 'playA' : 'playB').classList.remove('playing');
  };

  btn.addEventListener('mousedown', startCuePlay);
  btn.addEventListener('touchstart', startCuePlay, {passive: false});
  btn.addEventListener('mouseup', stopCuePlay);
  btn.addEventListener('mouseleave', stopCuePlay);
  btn.addEventListener('touchend', stopCuePlay);
  btn.addEventListener('touchcancel', stopCuePlay); // Fix #7: iOS touchcancel fallback
}
setupCue('A'); setupCue('B');

// === EQ & Controls (with double-tap reset) ===
function addReset(id, defaultVal, onReset) {
  const el = $(id);
  if (!el) return;
  // Desktop: dblclick
  el.addEventListener('dblclick', () => { el.value = defaultVal; onReset(defaultVal); });
  // Mobile: double-tap (two taps within 300ms)
  let lastTap = 0;
  el.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      e.preventDefault();
      e.stopPropagation(); // Fix #8: prevent iOS interpreting as zoom
      el.value = defaultVal; onReset(defaultVal);
    }
    lastTap = now;
  });
}

$('eqLowA')?.addEventListener('input', e => eqA.low.value = parseFloat(e.target.value));
$('eqMidA')?.addEventListener('input', e => eqA.mid.value = parseFloat(e.target.value));
$('eqHighA')?.addEventListener('input', e => eqA.high.value = parseFloat(e.target.value));
$('gainA')?.addEventListener('input', e => gainA.gain.value = parseFloat(e.target.value));
$('eqLowB')?.addEventListener('input', e => eqB.low.value = parseFloat(e.target.value));
$('eqMidB')?.addEventListener('input', e => eqB.mid.value = parseFloat(e.target.value));
$('eqHighB')?.addEventListener('input', e => eqB.high.value = parseFloat(e.target.value));
$('gainB')?.addEventListener('input', e => gainB.gain.value = parseFloat(e.target.value));
$('crossfader')?.addEventListener('input', e => crossFade.fade.value = parseFloat(e.target.value));
$('masterVol')?.addEventListener('input', e => masterGain.gain.value = parseFloat(e.target.value));

// Double-tap resets: EQ → 0, Gain → 1, Crossfader → 0.5, Master → 0.8
addReset('eqLowA', 0, v => { eqA.low.value = v; });
addReset('eqMidA', 0, v => { eqA.mid.value = v; });
addReset('eqHighA', 0, v => { eqA.high.value = v; });
addReset('gainA', 1, v => { gainA.gain.value = v; });
addReset('eqLowB', 0, v => { eqB.low.value = v; });
addReset('eqMidB', 0, v => { eqB.mid.value = v; });
addReset('eqHighB', 0, v => { eqB.high.value = v; });
addReset('gainB', 1, v => { gainB.gain.value = v; });
addReset('crossfader', 0.5, v => { crossFade.fade.value = v; });
addReset('masterVol', 0.8, v => { masterGain.gain.value = v; });

document.querySelectorAll('.fx-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const d=btn.dataset.deck,fx=btn.dataset.fx,set=d==='A'?fxA:fxB;
    if(activeFx[d][fx]){set[fx].wet.value=0;activeFx[d][fx]=false;btn.classList.remove('active');}
    else{set[fx].wet.value=0.5;activeFx[d][fx]=true;btn.classList.add('active');}
  });
});

// === Recording (Fix #2: iOS MediaRecorder detection) ===
if (typeof MediaRecorder === 'undefined') {
  // iOS Safari < 17.4 — hide record button
  const recBtn = $('recordBtn');
  if (recBtn) {
    recBtn.textContent = '🚫 Запись';
    recBtn.disabled = true;
    recBtn.style.opacity = '0.4';
    recBtn.title = 'Запись не поддерживается на этом устройстве';
  }
} else {
  // Determine best supported MIME type
  const recMime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
    : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
    : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : '';
  const recExt = recMime.includes('mp4') ? 'm4a' : recMime.includes('ogg') ? 'ogg' : 'webm';

  $('recordBtn')?.addEventListener('click', () => {
    const btn = $('recordBtn'), st = $('recStatus');
    if (!isRecording) {
      audioChunks = [];
      const opts = recMime ? { mimeType: recMime } : {};
      try {
        mediaRecorder = new MediaRecorder(dest.stream, opts);
      } catch (e) {
        mediaRecorder = new MediaRecorder(dest.stream);
      }
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const b = new Blob(audioChunks, { type: recMime || 'audio/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `katz_mix_${Date.now()}.${recExt}`;
        a.click();
        st.textContent = '✅ Сохранено!';
        setTimeout(() => st.textContent = '', 3000);
      };
      mediaRecorder.start();
      isRecording = true;
      btn.textContent = '⏹ Стоп';
      btn.classList.add('recording');
      st.textContent = '🔴 Запись...';
    } else {
      mediaRecorder.stop();
      isRecording = false;
      btn.textContent = '⏺ Запись';
      btn.classList.remove('recording');
    }
  });
}

// === Animation ===
function animate(){

  drawWaveform($('waveA'),'A','#00e5ff');
  drawWaveform($('waveB'),'B','#ff00e5');
  $('timeA').textContent=fmtTime(getPos('A'));
  $('timeB').textContent=fmtTime(getPos('B'));

  // A-B Loop enforcement + continuous sync
  continuousSync();
  ['A','B'].forEach(d=>{
    const s=deck[d];
    if(s.playing&&s.loopActive&&s.loopIn>=0&&s.loopOut>s.loopIn){
      const pos=getPos(d);
      if(pos>=s.loopOut){seekDeck(d,s.loopIn/getDur(d));}
    }
    // Auto-stop at end
    if(s.playing&&getPos(d)>=getDur(d)){
      s.playing=false;s.offset=0;players[d].stop();
      $(d==='A'?'playA':'playB').textContent='▶ Play';
      $(d==='A'?'playA':'playB').classList.remove('playing');
    }
  });
  requestAnimationFrame(animate);
}

drawWaveform($('waveA'),'A','#00e5ff');drawWaveform($('waveB'),'B','#ff00e5');
animate();

// Fix #1: iOS AudioContext resumption — careful not to steal user gestures from buttons
let iosAudioUnlocked = false;

const resumeAudioContext = () => {
  // Only resume if actually suspended — avoid consuming user gestures unnecessarily
  if (Tone.context.state === 'suspended') {
    Tone.start().catch(() => {});
  }
};

const unlockIOSAudio = () => {
  if (iosAudioUnlocked) return;
  iosAudioUnlocked = true;
  
  // Start Tone.js AudioContext
  Tone.start().catch(() => {});
  
  // Kick the silent audio element once to unlock iOS audio playback
  const iosHack = $('iosAudioHack');
  if (iosHack) {
    iosHack.play().catch(() => {});
  }
};

// First touch/click unlocks iOS audio (once)
document.body.addEventListener('touchstart', unlockIOSAudio, { once: true, passive: true });
document.body.addEventListener('click', unlockIOSAudio, { once: true });

// Lightweight check on subsequent touches — passive so it never blocks buttons
document.body.addEventListener('touchend', resumeAudioContext, { passive: true });

// Resume when returning from background / other chat
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    resumeAudioContext();
    // Re-kick silent audio hack only if it was previously unlocked
    if (iosAudioUnlocked) {
      const iosHack = $('iosAudioHack');
      if (iosHack) {
        iosHack.pause();
        iosHack.currentTime = 0;
        iosHack.play().catch(() => {});
      }
    }
  }
});

window.addEventListener('focus', resumeAudioContext);

// Periodic keep-alive (only resume context, never play() — that needs user gesture)
setInterval(() => {
  if (Tone.context.state === 'suspended' && iosAudioUnlocked) {
    Tone.context.resume().catch(() => {});
  }
}, 10000);

})();
