/**
 * 100% Procedural Web Audio GT Engine & Tire Scrub Synthesizer
 */
export class GtAudioEngine {
  private ctx: AudioContext | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private muted = true;
  private initialized = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted && !this.initialized) {
      this.init();
    }
    if (this.ctx && this.gain) {
      this.gain.gain.setTargetAtTime(muted ? 0 : 0.065, this.ctx.currentTime, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.oscPrimary = this.ctx.createOscillator();
      this.oscHarmonic = this.ctx.createOscillator();
      this.filter = this.ctx.createBiquadFilter();
      this.gain = this.ctx.createGain();

      this.oscPrimary.type = 'sawtooth';
      this.oscHarmonic.type = 'triangle';
      this.oscPrimary.frequency.value = 65;
      this.oscHarmonic.frequency.value = 130;

      this.filter.type = 'lowpass';
      this.filter.frequency.value = 340;
      this.gain.gain.value = 0;

      this.oscPrimary.connect(this.filter);
      this.oscHarmonic.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.oscPrimary.start();
      this.oscHarmonic.start();
      this.initialized = true;
    } catch {
      // Ignore if browser blocks audio before user gesture
    }
  }

  public update(rpm: number, throttle: number, active: boolean): void {
    if (!this.ctx || !this.oscPrimary || !this.oscHarmonic || !this.filter || !this.gain) return;
    if (this.ctx.state === 'suspended' && !this.muted && active) {
      this.ctx.resume().catch(() => {});
    }
    const baseFreq = 46 + (rpm / 8500) * 145;
    this.oscPrimary.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
    this.oscHarmonic.frequency.setTargetAtTime(baseFreq * 1.98, this.ctx.currentTime, 0.04);
    this.filter.frequency.setTargetAtTime(240 + throttle * 650 + (rpm / 8500) * 520, this.ctx.currentTime, 0.05);
    const targetGain = !this.muted && active ? 0.045 + throttle * 0.04 : 0;
    this.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
  }

  public dispose(): void {
    try {
      this.oscPrimary?.stop();
      this.oscHarmonic?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.initialized = false;
  }
}
