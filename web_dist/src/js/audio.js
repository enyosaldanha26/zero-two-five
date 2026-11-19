function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 16-bar Jazz Lounge progression (Cmaj9 -> A7 -> Dm9 -> G13 ... turnaround)
const LOUNGE_BARS = [
  { chord: [52, 55, 59, 62], bass: [36, 40, 43, 45], lead: [76, null, 74, null, 72, null, null, null] },
  { chord: [55, 61, 64, 66], bass: [45, 43, 40, 39], lead: [null, null, 73, null, 76, null, 79, null] },
  { chord: [53, 57, 60, 64], bass: [38, 41, 45, 48], lead: [77, null, 76, null, 74, null, null, null] },
  { chord: [53, 57, 59, 64], bass: [43, 47, 45, 42], lead: [null, null, 71, 74, 76, null, null, null] },
  { chord: [55, 59, 62, 67], bass: [40, 43, 47, 44], lead: [74, null, 72, null, 71, null, null, null] },
  { chord: [55, 59, 60, 64], bass: [45, 48, 43, 41], lead: [null, null, 72, null, 76, null, null, null] },
  { chord: [53, 57, 60, 64], bass: [38, 40, 41, 42], lead: [74, null, null, 72, 69, null, null, null] },
  { chord: [53, 57, 59, 64], bass: [43, 47, 50, 47], lead: [null, null, 74, null, 76, null, 74, null] },
  { chord: [52, 55, 57, 60], bass: [41, 45, 48, 45], lead: [79, null, 77, null, 76, null, null, null] },
  { chord: [53, 56, 60, 62], bass: [41, 44, 43, 42], lead: [null, null, 74, null, 72, null, null, null] },
  { chord: [55, 59, 62, 67], bass: [40, 43, 47, 46], lead: [71, null, 74, null, 76, null, null, null] },
  { chord: [55, 61, 64, 67], bass: [45, 43, 41, 40], lead: [null, null, 79, null, 76, null, 73, null] },
  { chord: [53, 57, 60, 64], bass: [38, 41, 45, 48], lead: [74, null, 77, null, 76, null, 72, null] },
  { chord: [53, 57, 59, 64], bass: [43, 41, 40, 38], lead: [null, null, 74, null, 71, null, null, null] },
  { chord: [52, 55, 59, 62], bass: [36, 40, 43, 48], lead: [72, null, null, null, null, null, null, null] },
  { chord: [53, 57, 60, 62], bass: [43, 45, 47, 43], lead: [null, null, null, null, 74, null, 76, null] }
];

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxEnabled = true;
    this.musicEnabled = false;
    this.musicTimer = null;
    this.musicSession = 0;
    this.beatStep = 0;
    this.brushBuffer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  tone(freq, duration, type = 'triangle', volume = 0.14, delay = 0, slideTo = null) {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playUiClick() {
    this.tone(520, 0.07, 'sine', 0.1, 0, 680);
  }

  playCardSnap() {
    this.tone(240, 0.08, 'triangle', 0.16, 0, 120);
    this.tone(680, 0.05, 'sine', 0.08, 0.01, 420);
  }

  playCardDeal() {
    this.tone(360, 0.06, 'sine', 0.08, 0, 520);
  }

  playYourTurn() {
    this.tone(587.33, 0.1, 'triangle', 0.1, 0);
    this.tone(880, 0.14, 'triangle', 0.1, 0.08);
  }

  playBidPlace() {
    this.tone(440, 0.09, 'square', 0.07, 0);
    this.tone(659.25, 0.15, 'triangle', 0.12, 0.07);
  }

  playDisputeWin() {
    this.tone(523.25, 0.12, 'triangle', 0.14, 0);
    this.tone(659.25, 0.12, 'triangle', 0.14, 0.08);
    this.tone(783.99, 0.22, 'triangle', 0.16, 0.16);
  }

  playDisputeTie() {
    this.tone(340, 0.14, 'sawtooth', 0.07, 0, 290);
    this.tone(290, 0.22, 'sawtooth', 0.07, 0.13, 240);
  }

  playTokenEarn() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.tone(n, 0.18, 'triangle', 0.14, idx * 0.08);
    });
  }

  playGameWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5];
    const delays = [0, 0.09, 0.18, 0.27, 0.42, 0.54];
    notes.forEach((n, idx) => {
      this.tone(n, 0.28, 'triangle', 0.16, delays[idx]);
    });
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (enabled) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  startMusic() {
    if (this.musicTimer) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.musicSession += 1;
    const session = this.musicSession;

    const scheduleStep = () => {
      if (!this.musicEnabled || session !== this.musicSession) {
        this.musicTimer = null;
        return;
      }

      if (this.ctx && this.ctx.state === 'running') {
        const totalSteps = LOUNGE_BARS.length * 8;
        const stepInCycle = this.beatStep % totalSteps;
        const bar = LOUNGE_BARS[Math.floor(stepInCycle / 8)];
        const stepInBar = stepInCycle % 8;

        // Walking bass on beats 0, 2, 4, 6
        if (stepInBar % 2 === 0) {
          const bassMidi = bar.bass[stepInBar / 2];
          this._playWalkingBass(midiToFreq(bassMidi), 0.42);
        }

        // Syncopated electric piano voicings (Charleston lounge comping)
        if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6) {
          const chordDur = stepInBar === 0 ? 0.55 : stepInBar === 3 ? 0.45 : 0.35;
          const chordVol = stepInBar === 0 ? 0.022 : 0.016;
          this._playLoungeChord(bar.chord, chordDur, chordVol);
        }

        // Spacious vibraphone melody phrase
        const leadMidi = bar.lead[stepInBar];
        if (leadMidi) {
          this._playVibeLead(midiToFreq(leadMidi), 0.52);
        }

        // Gentle brushed jazz swing percussion
        if (stepInBar === 0 || stepInBar === 2 || stepInBar === 3 || stepInBar === 4 || stepInBar === 6 || stepInBar === 7) {
          const isAccent = stepInBar === 2 || stepInBar === 6;
          this._playBrush(isAccent ? 0.012 : 0.007, isAccent ? 0.075 : 0.045);
        }

        this.beatStep = (this.beatStep + 1) % totalSteps;
      }

      // True jazz swing: longer downbeats (275ms), brisker upbeats (195ms)
      const waitMs = this.beatStep % 2 === 1 ? 275 : 195;
      this.musicTimer = setTimeout(scheduleStep, waitMs);
    };

    scheduleStep();
  }

  _playWalkingBass(freq, duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(310, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  _playLoungeChord(midiNotes, duration, volumePerVoice) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1050, now);
    filter.connect(ctx.destination);

    midiNotes.forEach((midi, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(midi), now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volumePerVoice, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    });
  }

  _playVibeLead(freq, duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    const fund = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, now);
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2, now);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.22, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.032, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    fund.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(ctx.destination);

    fund.start(now);
    overtone.start(now);
    fund.stop(now + duration + 0.03);
    overtone.stop(now + duration + 0.03);
  }

  _playBrush(volume, duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.brushBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.1);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.brushBuffer = buf;
    }

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.brushBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4200, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  stopMusic() {
    this.musicSession += 1;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const sound = new SoundEngine();
