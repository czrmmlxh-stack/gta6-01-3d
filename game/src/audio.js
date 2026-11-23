// Synthesized sound effects. Everything is an oscillator through
// WebAudio — no audio files, no network. The engine hum, siren,
// pickup chime, gunshot, punch thud and mission jingle are all built
// here from raw waveforms.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch (err) {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol || 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpass || 1200;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.35;
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.22);
      setTimeout(() => tone(880, 0.18, 'sine', 0.22), 90);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 110);
      });
    },
    punch() {
      noiseBurst(0.12, 0.3, 500);
      tone(120, 0.1, 'sine', 0.3, 60);
    },
    gunshot() {
      noiseBurst(0.18, 0.4, 2500);
      tone(180, 0.12, 'square', 0.15, 50);
    },
    crash() {
      noiseBurst(0.3, 0.35, 700);
      tone(90, 0.25, 'sine', 0.3, 40);
    },
    cash() {
      tone(988, 0.1, 'sine', 0.18);
      setTimeout(() => tone(1319, 0.16, 'sine', 0.18), 80);
    },
    denied() {
      tone(220, 0.18, 'square', 0.15, 160);
    },
    engineStart() {
      if (!ensure() || muted) return;
      if (engineOsc) return;
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0.0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    },
    engine(speed01) {
      if (!engineOsc || !engineGain) return;
      const target = 0.02 + speed01 * 0.06;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 90, ctx.currentTime, 0.1);
    },
    engineStop() {
      if (!engineOsc) return;
      try {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        const osc = engineOsc;
        setTimeout(() => {
          try {
            osc.stop();
          } catch (err) {}
        }, 300);
      } catch (err) {}
      engineOsc = null;
      engineGain = null;
    },
    sirenStart() {
      if (!ensure() || muted || sirenTimer) return;
      let high = false;
      sirenTimer = setInterval(() => {
        if (muted) return;
        tone(high ? 950 : 700, 0.32, 'sine', 0.05);
        high = !high;
      }, 340);
    },
    sirenStop() {
      if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },
  };
}
