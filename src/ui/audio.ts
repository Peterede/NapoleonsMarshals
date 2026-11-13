export type SoundName =
  | 'musket'
  | 'cannon'
  | 'charge'
  | 'rally'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'move';

const MUTE_KEY = 'napoleons-marshals.muted';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // ignore storage failures
    }
  }

  toggle(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) this.play('click');
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    this.unlock();
    return this.ctx;
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  private noiseBurst(ctx: AudioContext, duration: number, gainValue: number, frequency: number, type: BiquadFilterType): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  private tone(ctx: AudioContext, frequency: number, duration: number, gainValue: number, delay = 0, type: OscillatorType = 'triangle'): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  play(name: SoundName): void {
    const ctx = this.getContext();
    if (!ctx) return;
    switch (name) {
      case 'musket':
        this.noiseBurst(ctx, 0.11, 0.09, 1400, 'bandpass');
        this.tone(ctx, 180, 0.08, 0.04, 0, 'square');
        break;
      case 'cannon':
        this.noiseBurst(ctx, 0.5, 0.22, 180, 'lowpass');
        this.tone(ctx, 58, 0.42, 0.16, 0, 'sine');
        break;
      case 'charge':
        this.noiseBurst(ctx, 0.38, 0.1, 600, 'lowpass');
        this.tone(ctx, 92, 0.3, 0.05, 0.02, 'sawtooth');
        break;
      case 'rally': {
        const notes = [392, 523.25, 659.25];
        notes.forEach((f, i) => this.tone(ctx, f, 0.5, 0.05, i * 0.1, 'triangle'));
        break;
      }
      case 'victory': {
        const notes = [392, 523.25, 659.25, 783.99];
        notes.forEach((f, i) => this.tone(ctx, f, 0.65, 0.055, i * 0.13, 'triangle'));
        break;
      }
      case 'defeat': {
        const notes = [329.63, 293.66, 246.94, 196];
        notes.forEach((f, i) => this.tone(ctx, f, 0.7, 0.05, i * 0.16, 'sine'));
        break;
      }
      case 'click':
        this.tone(ctx, 680, 0.05, 0.025, 0, 'sine');
        break;
      case 'move':
        this.noiseBurst(ctx, 0.09, 0.025, 420, 'bandpass');
        break;
    }
  }
}

export const audio = new AudioEngine();
