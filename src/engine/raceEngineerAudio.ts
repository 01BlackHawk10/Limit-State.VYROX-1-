import { clamp } from './mathNoise';
import { VehicleTelemetry } from './vehiclePhysics';

export type EngineerCalloutSeverity = 'info' | 'warn' | 'critical' | 'record';

export interface EngineerRadioCaption {
  id: number;
  speaker: string;
  message: string;
  severity: EngineerCalloutSeverity;
  expiresAtMs: number;
}

type EventKey =
  | 'tire_critical'
  | 'tire_shredded'
  | 'low_fuel'
  | 'fuel_starvation'
  | 'fuel_stalled'
  | 'brake_fade'
  | 'pit_required'
  | 'final_lap'
  | 'sector_record'
  | 'yellow_flag'
  | 'pit_complete';

/**
 * Context-aware Race Engineer radio system pairing Web Speech synthesis
 * with procedural VHF squelch/beep audio bursts and synchronized HUD captions.
 */
export class RaceEngineerRadio {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private cachedSquelchBuf: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.72;
  private captionSeq = 0;
  private speakingUntilMs = 0;
  private lastEventAtMs: Record<EventKey, number> = {
    tire_critical: -60000,
    tire_shredded: -60000,
    low_fuel: -60000,
    fuel_starvation: -60000,
    fuel_stalled: -60000,
    brake_fade: -60000,
    pit_required: -60000,
    final_lap: -60000,
    sector_record: -60000,
    yellow_flag: -60000,
    pit_complete: -60000,
  };

  private lastFinalLapAnnounced = -1;
  private prevPitStatus: VehicleTelemetry['pitStatus'] = 'none';
  private prevFlagState: 'green' | 'yellow' = 'green';
  private activeCaption: EngineerRadioCaption | null = null;
  private onCaptionChange?: (caption: EngineerRadioCaption | null) => void;

  public bindAudio(ctx: AudioContext | null, outputNode: GainNode | null) {
    if (this.ctx !== ctx) {
      this.cachedSquelchBuf = null;
    }
    this.ctx = ctx;
    this.outputNode = outputNode;
  }

  public setCaptionListener(cb: (caption: EngineerRadioCaption | null) => void) {
    this.onCaptionChange = cb;
  }

  public setAudioConfig(volume: number, muted: boolean) {
    this.volume = clamp(volume, 0, 1);
    this.muted = muted;
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore TTS cancel errors
      }
    }
  }

  public isTransmitting(): boolean {
    return performance.now() < this.speakingUntilMs;
  }

  public resetSession() {
    this.lastFinalLapAnnounced = -1;
    this.prevPitStatus = 'none';
    this.prevFlagState = 'green';
    this.speakingUntilMs = 0;
    for (const key of Object.keys(this.lastEventAtMs) as EventKey[]) {
      this.lastEventAtMs[key] = -60000;
    }
    this.activeCaption = null;
    this.onCaptionChange?.(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  public silence() {
    this.speakingUntilMs = 0;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  private playRadioSquelch(opening: boolean) {
    if (!this.ctx || !this.outputNode || this.muted || this.ctx.state === 'suspended') return;
    try {
      const t = this.ctx.currentTime;
      const dur = opening ? 0.095 : 0.07;
      if (!this.cachedSquelchBuf) {
        const len = Math.max(256, Math.floor(this.ctx.sampleRate * 0.12));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
          ch[i] = (Math.random() * 2 - 1) * 0.7;
        }
        this.cachedSquelchBuf = buf;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = this.cachedSquelchBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = opening ? 2150 : 1750;
      bp.Q.value = 3.2;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.08 * this.volume, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);

      src.connect(bp).connect(g).connect(this.outputNode);
      src.start(t, 0, dur);

      // Crisp VHF roger tone
      const osc = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(opening ? 1180 : 880, t);
      og.gain.setValueAtTime(0.045 * this.volume, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(og).connect(this.outputNode);
      osc.start(t);
      osc.stop(t + 0.065);
    } catch {
      // Ignore Web Audio squelch errors
    }
  }

  private triggerCallout(
    key: EventKey,
    message: string,
    severity: EngineerCalloutSeverity,
    cooldownMs: number,
    urgent = false,
  ) {
    const now = performance.now();
    if (now - this.lastEventAtMs[key] < cooldownMs) return;
    if (!urgent && now < this.speakingUntilMs - 400) return;

    this.lastEventAtMs[key] = now;
    const estDurationMs = clamp(message.length * 62 + 950, 2600, 5600);
    this.speakingUntilMs = now + estDurationMs;

    this.activeCaption = {
      id: ++this.captionSeq,
      speaker: 'Race Engineer',
      message,
      severity,
      expiresAtMs: now + estDurationMs + 800,
    };
    this.onCaptionChange?.(this.activeCaption);

    if (this.muted) return;

    this.playRadioSquelch(true);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (urgent) {
          window.speechSynthesis.cancel();
        }
        const utter = new SpeechSynthesisUtterance(message);
        utter.rate = 1.07;
        utter.pitch = 0.94;
        utter.volume = clamp(this.volume * 0.92, 0.1, 1.0);
        utter.onend = () => {
          this.playRadioSquelch(false);
        };
        utter.onerror = () => {
          this.playRadioSquelch(false);
        };
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback: caption remains visible even if speech synthesis is blocked
      }
    }
  }

  public update(tlm: VehicleTelemetry, liveRacing: boolean) {
    const now = performance.now();

    if (this.activeCaption && now > this.activeCaption.expiresAtMs) {
      this.activeCaption = null;
      this.onCaptionChange?.(null);
    }

    if (!liveRacing || tlm.countdownSec > 0.05 || tlm.raceFinished) {
      return;
    }

    // 1. Pit service completion confirmation
    if (this.prevPitStatus === 'servicing' && tlm.pitStatus === 'complete') {
      this.triggerCallout(
        'pit_complete',
        'Service complete. Fresh rubber and scheduled fuel aboard — push now!',
        'info',
        5000,
        true,
      );
    }
    this.prevPitStatus = tlm.pitStatus;

    // 2. Staged Fuel Emergency: Stalled (0%) -> Starving/Critical (<=3%) -> Low Fuel (<=20%)
    if (tlm.fuelState === 'stalled' && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'fuel_stalled',
        'Tank dry — engine stalled and power steering is off. Brakes are still live, coast back to pit lane!',
        'critical',
        22000,
        true,
      );
    } else if ((tlm.fuelState === 'starving' || tlm.fuelState === 'critical') && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'fuel_starvation',
        tlm.fuelState === 'critical'
          ? 'Critical fuel pressure — engine sputtering at half map. Box immediately!'
          : 'Fuel pickup uncovering under corner load — power cuts expected. Pit this lap!',
        'critical',
        20000,
        true,
      );
    } else if (tlm.fuelPct <= 20 && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'low_fuel',
        `Low fuel warning, ${Math.round(tlm.fuelPct)} percent remaining. Box for fuel.`,
        'warn',
        28000,
        tlm.fuelPct <= 8,
      );
    }

    // 3. Shredded Tire Slow Puncture vs Critical Tire Wear
    if (tlm.shreddedCount > 0 && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'tire_shredded',
        'Tire carcass shredded — slow puncture deflating. Expect heavy pull, limp cleanly to the pit box!',
        'critical',
        24000,
        true,
      );
    } else if (tlm.minTireLifePct < 20 && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'tire_critical',
        `Critical tire wear at ${tlm.minTireLifePct} percent — severe grip loss, box this lap.`,
        'critical',
        26000,
        true,
      );
    }

    // 4. Brake Rotor Fade (>760C)
    if (tlm.brakeFadeCount > 0 && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'brake_fade',
        'Brake rotors overheating past peak window — brake fade active, lift earlier or adjust bias!',
        'warn',
        26000,
        false,
      );
    }

    // 5. General Pit Stop Required callout (worn tires <30% or low fuel/overheating)
    if (tlm.pitRequired && tlm.minTireLifePct >= 20 && tlm.fuelPct > 20 && tlm.pitStatus === 'none') {
      this.triggerCallout(
        'pit_required',
        'Pit stop required this lap — tires losing peak grip, pit window is open.',
        'warn',
        32000,
        false,
      );
    }

    // 5. Final Lap callout
    if (
      tlm.lapTarget > 1 &&
      tlm.lap === tlm.lapTarget &&
      this.lastFinalLapAnnounced !== tlm.lap
    ) {
      this.lastFinalLapAnnounced = tlm.lap;
      this.triggerCallout(
        'final_lap',
        'White flag — final lap! Keep it clean to the checkered flag.',
        'info',
        35000,
        false,
      );
    }

    // 6. Purple Sector Record
    if (tlm.sectorRecordPulse > 0) {
      this.triggerCallout(
        'sector_record',
        `Purple sector ${tlm.sectorRecordPulse}! Fastest split of the session.`,
        'record',
        7000,
        false,
      );
    }

    this.prevFlagState = tlm.flagState;
  }
}
