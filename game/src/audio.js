// Synthesized sound effects with plain WebAudio: no audio files anywhere, everything is
// an oscillator or filtered noise. The engine hum follows the player's speed and the siren
// wails while the police are near. Audio only starts after the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // Engine: a low sawtooth, its pitch following speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that swings between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, volume, type) {
    if (!ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq0, freq1, duration, volume, type) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq0, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    /** Call from a user gesture so the browser lets audio start. */
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    /** Engine hum: speed 0..1, and whether the player is in a car at all. */
    engine(speed01, inCar) {
      if (!ctx) return;
      const target = inCar ? 0.05 + speed01 * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 110, ctx.currentTime, 0.08);
    },
    /** Siren wail while wanted; call every frame with dt and the star count. */
    siren(dt, starsCount) {
      if (!ctx) return;
      if (starsCount > 0) {
        sirenTimer += dt;
        const phase = Math.floor(sirenTimer * 1.6) % 2;
        sirenOsc.frequency.setTargetAtTime(phase === 0 ? 660 : 880, ctx.currentTime, 0.03);
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    },
    shot() {
      noiseBurst(0.14, 2400, 0.5, 'highpass');
      tone(180, 60, 0.12, 0.25, 'square');
    },
    punch() {
      tone(140, 55, 0.12, 0.4, 'sine');
    },
    crash() {
      noiseBurst(0.35, 900, 0.6, 'lowpass');
    },
    cash() {
      tone(880, 880, 0.09, 0.25, 'sine');
      setTimeout(() => tone(1318, 1318, 0.14, 0.25, 'sine'), 90);
    },
    mission() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 0.22, 'triangle'), i * 110));
    },
    steal() {
      tone(300, 520, 0.16, 0.25, 'triangle');
    },
  };
}
