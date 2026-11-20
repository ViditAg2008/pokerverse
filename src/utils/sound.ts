// Web Audio API Procedural Casino Sound Engine

class SoundManager {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  public volume: number = 0.7; // 0.0 to 1.0

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMute = localStorage.getItem('pokerverse_muted');
      const savedVol = localStorage.getItem('pokerverse_volume');
      if (savedMute !== null) this.muted = savedMute === 'true';
      if (savedVol !== null) this.volume = Math.max(0, Math.min(1, Number(savedVol)));
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || this.volume <= 0 || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('pokerverse_muted', String(muted));
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('pokerverse_volume', String(this.volume));
    }
  }

  /**
   * Subtle UI button interaction click
   */
  public playClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);

      gain.gain.setValueAtTime(0.12 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Crisp card deal slide sound
   */
  public playCardDeal(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.065);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const env = Math.sin((i / bufferSize) * Math.PI);
        data[i] = (Math.random() * 2 - 1) * env * 0.35;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.065);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch {}
  }

  /**
   * Riffle shuffle sequence
   */
  public playShuffle(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.playCardDeal(), i * 42);
    }
  }

  /**
   * Clay/ceramic casino chip clink
   */
  public playChips(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = [2450, 3680, 5120];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f + idx * 90, now + idx * 0.018);

        gain.gain.setValueAtTime(0.11 * this.volume, now + idx * 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.018 + 0.07);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.018);
        osc.stop(now + idx * 0.018 + 0.075);
      });
    } catch {}
  }

  /**
   * Double-tap wood table check sound
   */
  public playCheck(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      [0, 0.09].forEach((offset) => {
        const now = ctx.currentTime + offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(155, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.06);

        gain.gain.setValueAtTime(0.28 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      });
    } catch {}
  }

  /**
   * Low soft swoosh for folding cards
   */
  public playFold(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

      gain.gain.setValueAtTime(0.15 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {}
  }

  /**
   * Gentle chime when it becomes the user's turn
   */
  public playTurnAlert(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [587.33, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);

        gain.gain.setValueAtTime(0.14 * this.volume, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.24);
      });
    } catch {}
  }

  /**
   * Warm harmonic chord when winning a pot
   */
  public playWin(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.16 * this.volume, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.48);
      });
    } catch {}
  }
}

export const sound = new SoundManager();
