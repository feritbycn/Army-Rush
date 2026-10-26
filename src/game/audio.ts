// Özgün, WebAudio ile sentezlenen sesler (harici ses dosyası yok → lisans sorunu yok).
export type SfxName = 'gate' | 'collect' | 'hit' | 'enemyHit' | 'bossAttack' | 'bossDown' | 'coin' | 'click' | 'win' | 'lose' | 'warn';

export class Sfx {
  enabled = true;
  volume = 0.7;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const C = W.AudioContext ?? W.webkitAudioContext;
        if (!C) return null;
        this.ctx = new C();
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number, delay = 0): void {
    const ctx = this.ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol * this.volume, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  play(n: SfxName): void {
    switch (n) {
      case 'gate': this.tone(520, 0.12, 'triangle', 0.25, 880); this.tone(780, 0.14, 'triangle', 0.2, 1170, 0.08); break;
      case 'collect': this.tone(660, 0.07, 'square', 0.1, 990); break;
      case 'hit': this.tone(160, 0.25, 'sawtooth', 0.3, 60); break;
      case 'enemyHit': this.tone(240, 0.06, 'square', 0.07, 120); break;
      case 'bossAttack': this.tone(90, 0.5, 'sawtooth', 0.35, 40); break;
      case 'warn': this.tone(440, 0.15, 'square', 0.15); this.tone(440, 0.15, 'square', 0.15, undefined, 0.22); break;
      case 'bossDown': this.tone(300, 0.9, 'sawtooth', 0.3, 40); this.tone(600, 0.6, 'triangle', 0.2, 120, 0.1); break;
      case 'coin': this.tone(990, 0.08, 'square', 0.12); this.tone(1320, 0.12, 'square', 0.12, undefined, 0.07); break;
      case 'click': this.tone(500, 0.04, 'square', 0.08); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.25, undefined, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.2, undefined, i * 0.15)); break;
    }
  }
}
