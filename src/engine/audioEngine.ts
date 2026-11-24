import { clamp } from './mathNoise';
import { VehicleTelemetry } from './vehiclePhysics';
import { type MapId } from '../Maps/mapRegistry';
import type { WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';

export class GtAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private engineLowOsc: OscillatorNode | null = null;
  private engineMainOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private hybridWhineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private hybridGain: GainNode | null = null;

  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private scrapeFilter: BiquadFilterNode | null = null;
  private scrapeGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private surfaceFilter: BiquadFilterNode | null = null;
  private surfaceGain: GainNode | null = null;

  // Spatial Ambient Buses (Alpine Wind, Pine Forest Rustle, Gorge Canyon Echo, Grandstand Crowd)
  private ambientWindFilter: BiquadFilterNode | null = null;
  private ambientWindGain: GainNode | null = null;
  private forestFilter: BiquadFilterNode | null = null;
  private forestGain: GainNode | null = null;
  private gorgeEchoSendGain: GainNode | null = null;
  private gorgeEchoReturnGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private crowdGain: GainNode | null = null;
  private radioDucked = false;

  private lastCountdownStep = '';
  private lastImpactAt = 0;
  private lastBlowOffAt = 0;
  private lastPitAt = -10;
  private volume = 0.72;
  private muted = false;
  private surfaceAudioEnabled = true;
  private lowCpuAudio = false;
  private initialized = false;
  private cachedNoiseBuf: AudioBuffer | null = null;

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  public setRadioDucking(ducking: boolean) {
    this.radioDucked = ducking;
    if (this.masterGain && this.ctx) {
      const targetGain = this.muted ? 0 : this.volume * 0.42 * (ducking ? 0.62 : 1.0);
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
    }
  }

  public unlock() {
    if (this.initialized) {
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume * 0.42;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine harmonic stack -> soft distortion waveshaper -> lowpass exhaust filter
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 255 - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      shaper.curve = curve;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      filter.Q.value = 2.4;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0;

      const lowOsc = ctx.createOscillator();
      lowOsc.type = 'sawtooth';
      lowOsc.frequency.value = 55;

      const mainOsc = ctx.createOscillator();
      mainOsc.type = 'sawtooth';
      mainOsc.frequency.value = 110;

      const subOsc = ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.value = 82;

      const lowMix = ctx.createGain();
      lowMix.gain.value = 0.42;
      const mainMix = ctx.createGain();
      mainMix.gain.value = 0.36;
      const subMix = ctx.createGain();
      subMix.gain.value = 0.28;

      lowOsc.connect(lowMix).connect(shaper);
      mainOsc.connect(mainMix).connect(shaper);
      subOsc.connect(subMix).connect(shaper);
      shaper.connect(filter).connect(engGain).connect(master);

      // Straight-cut sequential transmission / high-revving GT3 harmonic whine
      const hybridOsc = ctx.createOscillator();
      hybridOsc.type = 'sine';
      hybridOsc.frequency.value = 420;
      const hybGain = ctx.createGain();
      hybGain.gain.value = 0;
      hybridOsc.connect(hybGain).connect(master);

      // Shared white & pink-ish noise buffer for tire squeal, wind, forest rustle & crowd
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.85 * b0 + white * 0.15;
        data[i] = white * 0.65 + b0 * 0.55;
      }

      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = noiseBuf;
      screechSrc.loop = true;
      const scrFilter = ctx.createBiquadFilter();
      scrFilter.type = 'bandpass';
      scrFilter.frequency.value = 1350;
      scrFilter.Q.value = 5.5;
      const scrGain = ctx.createGain();
      scrGain.gain.value = 0;
      screechSrc.connect(scrFilter).connect(scrGain).connect(master);

      // Metallic guardrail / concrete wall scrape friction channel
      const scrapeSrc = ctx.createBufferSource();
      scrapeSrc.buffer = noiseBuf;
      scrapeSrc.loop = true;
      const skpFilter = ctx.createBiquadFilter();
      skpFilter.type = 'bandpass';
      skpFilter.frequency.value = 920;
      skpFilter.Q.value = 2.6;
      const skpGain = ctx.createGain();
      skpGain.gain.value = 0;
      scrapeSrc.connect(skpFilter).connect(skpGain).connect(master);

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuf;
      windSrc.loop = true;
      const wFilter = ctx.createBiquadFilter();
      wFilter.type = 'bandpass';
      wFilter.frequency.value = 450;
      wFilter.Q.value = 0.9;
      const wGain = ctx.createGain();
      wGain.gain.value = 0;
      windSrc.connect(wFilter).connect(wGain).connect(master);

      // Spatial Ambient 1: High-Altitude Alpine Wind Bed
      const ambWindSrc = ctx.createBufferSource();
      ambWindSrc.buffer = noiseBuf;
      ambWindSrc.loop = true;
      const ambWindFilter = ctx.createBiquadFilter();
      ambWindFilter.type = 'bandpass';
      ambWindFilter.frequency.value = 320;
      ambWindFilter.Q.value = 0.85;
      const ambWindGain = ctx.createGain();
      ambWindGain.gain.value = 0;
      ambWindSrc.connect(ambWindFilter).connect(ambWindGain).connect(master);

      // Spatial Ambient 2: Pine Forest Needle Rustle
      const forestSrc = ctx.createBufferSource();
      forestSrc.buffer = noiseBuf;
      forestSrc.loop = true;
      const forFilter = ctx.createBiquadFilter();
      forFilter.type = 'bandpass';
      forFilter.frequency.value = 2350;
      forFilter.Q.value = 1.75;
      const forGain = ctx.createGain();
      forGain.gain.value = 0;
      forestSrc.connect(forFilter).connect(forGain).connect(master);

      // Spatial Ambient 3: Gorge & Bridge Canyon Slapback Echo Loop (fed by engine)
      const echoSend = ctx.createGain();
      echoSend.gain.value = 0;
      const echoDelay = ctx.createDelay(0.6);
      echoDelay.delayTime.value = 0.24;
      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = 'bandpass';
      echoFilter.frequency.value = 640;
      echoFilter.Q.value = 1.25;
      const echoFeedback = ctx.createGain();
      echoFeedback.gain.value = 0.36;
      const echoReturn = ctx.createGain();
      echoReturn.gain.value = 0;
      engGain.connect(echoSend);
      echoSend.connect(echoDelay);
      echoDelay.connect(echoFilter);
      echoFilter.connect(echoFeedback);
      echoFeedback.connect(echoDelay);
      echoFilter.connect(echoReturn);
      echoReturn.connect(master);

      // Spatial Ambient 4: Grandstand & Podium Crowd Cheer Murmur
      const crowdSrc = ctx.createBufferSource();
      crowdSrc.buffer = noiseBuf;
      crowdSrc.loop = true;
      const crdFilter = ctx.createBiquadFilter();
      crdFilter.type = 'bandpass';
      crdFilter.frequency.value = 880;
      crdFilter.Q.value = 1.1;
      const crdGain = ctx.createGain();
      crdGain.gain.value = 0;
      crowdSrc.connect(crdFilter).connect(crdGain).connect(master);

      // Kerb / off-road suspension rumble
      const rmbOsc = ctx.createOscillator();
      rmbOsc.type = 'triangle';
      rmbOsc.frequency.value = 42;
      const rmbGain = ctx.createGain();
      rmbGain.gain.value = 0;
      rmbOsc.connect(rmbGain).connect(master);

      // Real-time road-surface noise filter (asphalt / curb / gravel / snow)
      const surfSrc = ctx.createBufferSource();
      surfSrc.buffer = noiseBuf;
      surfSrc.loop = true;
      const srfFilter = ctx.createBiquadFilter();
      srfFilter.type = 'bandpass';
      srfFilter.frequency.value = 320;
      srfFilter.Q.value = 0.8;
      const srfGain = ctx.createGain();
      srfGain.gain.value = 0;
      surfSrc.connect(srfFilter).connect(srfGain).connect(master);

      lowOsc.start();
      mainOsc.start();
      subOsc.start();
      hybridOsc.start();
      screechSrc.start();
      scrapeSrc.start();
      windSrc.start();
      ambWindSrc.start();
      forestSrc.start();
      crowdSrc.start();
      rmbOsc.start();
      surfSrc.start();

      this.engineLowOsc = lowOsc;
      this.engineMainOsc = mainOsc;
      this.engineSubOsc = subOsc;
      this.hybridWhineOsc = hybridOsc;
      this.engineFilter = filter;
      this.engineGain = engGain;
      this.hybridGain = hybGain;
      this.screechFilter = scrFilter;
      this.screechGain = scrGain;
      this.scrapeFilter = skpFilter;
      this.scrapeGain = skpGain;
      this.windFilter = wFilter;
      this.windGain = wGain;
      this.ambientWindFilter = ambWindFilter;
      this.ambientWindGain = ambWindGain;
      this.forestFilter = forFilter;
      this.forestGain = forGain;
      this.gorgeEchoSendGain = echoSend;
      this.gorgeEchoReturnGain = echoReturn;
      this.crowdFilter = crdFilter;
      this.crowdGain = crdGain;
      this.rumbleOsc = rmbOsc;
      this.rumbleGain = rmbGain;
      this.surfaceFilter = srfFilter;
      this.surfaceGain = srfGain;

      this.initialized = true;
    } catch {
      // Audio unavailable
    }
  }

  public setVolume(vol: number, muted: boolean) {
    this.volume = clamp(vol, 0, 1);
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume * 0.42 * (this.radioDucked ? 0.62 : 1.0),
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public setSurfaceAudioEnabled(enabled: boolean) {
    this.surfaceAudioEnabled = enabled;
    if (!enabled && this.surfaceGain && this.ctx) {
      this.surfaceGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public setLowCpuAudio(lowCpu: boolean) {
    this.lowCpuAudio = lowCpu;
    if (lowCpu && this.ctx && this.initialized) {
      const now = this.ctx.currentTime;
      this.ambientWindGain?.gain.setTargetAtTime(0, now, 0.08);
      this.forestGain?.gain.setTargetAtTime(0, now, 0.08);
      this.gorgeEchoSendGain?.gain.setTargetAtTime(0, now, 0.08);
      this.gorgeEchoReturnGain?.gain.setTargetAtTime(0, now, 0.08);
      this.crowdGain?.gain.setTargetAtTime(0, now, 0.08);
    }
  }

  public silence() {
    if (!this.ctx || !this.initialized) return;
    const t = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, t, 0.05);
    this.hybridGain?.gain.setTargetAtTime(0, t, 0.05);
    this.screechGain?.gain.setTargetAtTime(0, t, 0.05);
    this.scrapeGain?.gain.setTargetAtTime(0, t, 0.05);
    this.windGain?.gain.setTargetAtTime(0, t, 0.05);
    this.rumbleGain?.gain.setTargetAtTime(0, t, 0.05);
    this.surfaceGain?.gain.setTargetAtTime(0, t, 0.05);
    this.ambientWindGain?.gain.setTargetAtTime(0, t, 0.14);
    this.forestGain?.gain.setTargetAtTime(0, t, 0.14);
    this.gorgeEchoSendGain?.gain.setTargetAtTime(0, t, 0.12);
    this.gorgeEchoReturnGain?.gain.setTargetAtTime(0, t, 0.12);
    this.crowdGain?.gain.setTargetAtTime(0, t, 0.16);
    this.lastCountdownStep = '';
  }

  /**
   * Dynamically fades spatial ambient audio buses (Alpine Wind, Pine Forest Rustle,
   * Gorge Canyon Echoes, and Grandstand Crowd Cheers) based on active camera coordinates
   * and circuit sector progression.
   */
  public updateSpatialAmbience(
    camPos: { x: number; y: number; z: number },
    trackT: number,
    speedKmh: number,
    contextMode: 'racing' | 'podium' | 'spectator' | 'silent',
    elapsedSec = 0,
    mapId: MapId = 'aurelia_ridge',
    weatherPreset: WeatherPreset = 'dry',
  ) {
    if (!this.initialized || !this.ctx || this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;

    if (contextMode === 'silent' || this.muted || this.lowCpuAudio) {
      this.ambientWindGain?.gain.setTargetAtTime(0, now, 0.12);
      this.forestGain?.gain.setTargetAtTime(0, now, 0.12);
      this.gorgeEchoSendGain?.gain.setTargetAtTime(0, now, 0.12);
      this.gorgeEchoReturnGain?.gain.setTargetAtTime(0, now, 0.12);
      this.crowdGain?.gain.setTargetAtTime(0, now, 0.12);
      return;
    }

    const isCoral = mapId === 'coral_bay';
    const isFrostpeak = mapId === 'frostpeak_pass';
    const isKestrel = mapId === 'kestrel_peaks';
    const isSunsetStorm = weatherPreset === 'sunset_storm';
    const isMorningMist = weatherPreset === 'deep_morning_mist';
    const weatherWindBoost = isSunsetStorm ? 1.52 : weatherPreset === 'rain' ? 1.32 : isMorningMist ? 0.72 : 1.0;

    // 1. Alpine Pass Wind / Sea Breeze
    const altFactor = isCoral
      ? clamp((camPos.y - 4) / 34, 0.25, 1.0)
      : isFrostpeak
      ? clamp((camPos.y - 12) / 48, 0.28, 1.0)
      : isKestrel
      ? clamp((camPos.y - 26) / 130, 0.22, 1.0)
      : clamp((camPos.y - 18) / 55, 0.12, 1.0);
    const gust = 0.8 + 0.2 * Math.sin(elapsedSec * (isSunsetStorm ? 0.95 : isCoral ? 0.55 : isFrostpeak ? 0.62 : isKestrel ? 0.52 : 0.45));
    const windLevel =
      (isFrostpeak
        ? 0.036 + altFactor * 0.068
        : isKestrel
        ? 0.030 + altFactor * 0.064
        : isCoral
        ? 0.032 + altFactor * 0.05
        : 0.025 + altFactor * 0.055) *
      gust *
      weatherWindBoost *
      (contextMode === 'podium' ? 0.45 : 1.0);
    this.ambientWindFilter?.frequency.setTargetAtTime(
      (isSunsetStorm ? 360 : isMorningMist ? 210 : isFrostpeak ? 380 : isKestrel ? 350 : isCoral ? 340 : 280) +
        altFactor * (isFrostpeak ? 360 : isKestrel ? 320 : 290) +
        gust * (isSunsetStorm ? 120 : 75),
      now,
      0.15,
    );
    this.ambientWindGain?.gain.setTargetAtTime(windLevel, now, 0.18);

    // 2. Forest Rustle / Ocean Surf / Frozen Glacial Lake / Kestrel Waterfall
    const distLake = isFrostpeak
      ? Math.hypot(camPos.x - 42, camPos.z - 192)
      : isKestrel
      ? Math.hypot(camPos.x - 676, camPos.z + 18)
      : 999;
    const surfZone = isCoral
      ? clamp(1 - (camPos.y - 1.0) / 14, 0.2, 1.0) * (0.65 + 0.35 * Math.sin(elapsedSec * 0.8))
      : isFrostpeak
      ? clamp(1 - distLake / 145, 0.12, 1.0) * (0.72 + 0.28 * Math.sin(elapsedSec * 0.52))
      : isKestrel
      ? clamp(1 - distLake / 260, 0.15, 1.0) * (0.78 + 0.22 * Math.sin(elapsedSec * 0.6))
      : clamp((-camPos.z - 55) / 180, 0, 1);
    const sectorBias = isCoral
      ? trackT < 0.38 || trackT > 0.72
        ? 0.82
        : 0.32
      : isFrostpeak || isKestrel
      ? trackT > 0.28 && trackT < 0.84
        ? 0.7
        : 0.24
      : trackT > 0.36 && trackT < 0.82
      ? 0.65
      : 0.18;
    const speedAtten = 1 - clamp(speedKmh / 320, 0, 0.65);
    const forestWeatherMult = isSunsetStorm ? 1.4 : isMorningMist ? 0.68 : 1.0;
    const foliageOrSurfLevel =
      clamp(Math.max(surfZone, sectorBias), 0, 1) *
      (isCoral ? 0.044 : isKestrel ? 0.042 : isFrostpeak ? 0.04 : 0.038) *
      gust *
      forestWeatherMult *
      speedAtten;
    this.forestFilter?.frequency.setTargetAtTime(
      (isMorningMist
        ? 1150
        : isSunsetStorm
          ? 2350
          : isKestrel
            ? 1720
            : isFrostpeak
              ? 1580
              : isCoral
                ? 1150
                : 2050) +
        Math.sin(elapsedSec * (isCoral ? 0.85 : isFrostpeak || isKestrel ? 0.95 : 0.7)) * 340,
      now,
      0.16,
    );
    this.forestGain?.gain.setTargetAtTime(
      contextMode === 'podium'
        ? isCoral
          ? 0.014
          : isFrostpeak || isKestrel
            ? 0.01
            : 0.006
        : foliageOrSurfLevel,
      now,
      0.18,
    );

    // 3. Gorge Canyon / Coastal Cliff Echoes
    const inEchoCoords = isCoral
      ? camPos.z < -105 && camPos.y > 12
        ? clamp((camPos.y - 12) / 20, 0, 1)
        : 0
      : isFrostpeak
      ? (camPos.x < -190 || camPos.x > 190) && camPos.z > -220 && camPos.z < 120
        ? clamp((Math.abs(camPos.x) - 190) / 140, 0, 1)
        : 0
      : isKestrel
      ? camPos.z < -420 || Math.hypot(camPos.x - 570, camPos.z + 10) < 220
        ? clamp(Math.max((-420 - camPos.z) / 220, 1 - Math.hypot(camPos.x - 570, camPos.z + 10) / 220), 0, 1)
        : 0
      : camPos.x > 25 && camPos.z > -185 && camPos.z < 120
      ? clamp((camPos.x - 25) / 110, 0, 1)
      : 0;
    const inEchoSector = isCoral
      ? trackT > 0.42 && trackT < 0.72
        ? 0.65
        : 0.0
      : isFrostpeak
      ? (trackT > 0.16 && trackT < 0.44) || (trackT > 0.72 && trackT < 0.92)
        ? 0.88
        : 0.0
      : isKestrel
      ? (trackT > 0.18 && trackT < 0.42) || (trackT > 0.54 && trackT < 0.72)
        ? 0.86
        : 0.0
      : trackT > 0.13 && trackT < 0.44
      ? 0.85
      : 0.0;
    const echoFactor =
      contextMode === 'racing' ? Math.max(inEchoCoords, inEchoSector) : inEchoCoords * 0.5;
    this.gorgeEchoSendGain?.gain.setTargetAtTime(
      echoFactor * (isCoral ? 0.36 : isFrostpeak ? 0.52 : isKestrel ? 0.50 : 0.48),
      now,
      0.12,
    );
    this.gorgeEchoReturnGain?.gain.setTargetAtTime(
      echoFactor * (isCoral ? 0.32 : isFrostpeak ? 0.46 : isKestrel ? 0.44 : 0.42),
      now,
      0.12,
    );

    // 4. Grandstand & Paddock Crowd Cheers
    const distStart = isCoral
      ? Math.min(Math.hypot(camPos.x + 125, camPos.z - 218), Math.hypot(camPos.x + 135, camPos.z - 22))
      : isFrostpeak
      ? Math.min(Math.hypot(camPos.x + 25, camPos.z + 264), Math.hypot(camPos.x + 165, camPos.z - 118))
      : isKestrel
      ? Math.hypot(camPos.x, camPos.z - 540)
      : Math.hypot(camPos.x + 25, camPos.z - 238);
    const nearCrowd = clamp(1 - distStart / 145, 0, 1);
    const cheerExcitement =
      contextMode === 'podium'
        ? 0.95 + 0.18 * Math.sin(elapsedSec * 2.2)
        : nearCrowd * (0.45 + 0.35 * clamp(speedKmh / 240, 0, 1));
    const crowdLevel = clamp(cheerExcitement, 0, 1.1) * (contextMode === 'podium' ? 0.072 : 0.048);
    this.crowdFilter?.frequency.setTargetAtTime(
      contextMode === 'podium' ? 980 + Math.sin(elapsedSec * 1.9) * 140 : 820,
      now,
      0.16,
    );
    this.crowdGain?.gain.setTargetAtTime(crowdLevel, now, 0.2);
  }

  private playTone(freq: number, duration: number, gainLevel: number) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gainLevel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private playNoiseBurst(freq: number, q: number, duration: number, gainLevel: number) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    if (!this.cachedNoiseBuf) {
      const len = Math.max(512, Math.floor(this.ctx.sampleRate * 0.5));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      this.cachedNoiseBuf = buf;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this.cachedNoiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainLevel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.masterGain);
    src.start(t, 0, Math.min(duration, 0.48));
  }

  public update(tlm: VehicleTelemetry, active: boolean, wetTrackRatio = 0) {
    if (!active) {
      this.silence();
      return;
    }
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    // GT7 countdown tones
    if (tlm.countdownLabel && tlm.countdownLabel !== this.lastCountdownStep) {
      this.lastCountdownStep = tlm.countdownLabel;
      if (tlm.countdownLabel === 'START') {
        this.playTone(987.77, 0.42, 0.24);
      } else {
        this.playTone(587.33, 0.16, 0.18);
      }
    } else if (!tlm.countdownLabel) {
      this.lastCountdownStep = '';
    }

    // Engine harmonic pitches scaled by engine redline character + staged fuel starvation / stall / cranking
    const rpmNorm = clamp((tlm.rpm - 900) / Math.max(1200, tlm.redlineRpm - 900), 0, 1.05);
    const redlineTimbreMult = clamp(tlm.redlineRpm / 8200, 0.85, 1.38);
    let fundamental = (32 + rpmNorm * 145) * redlineTimbreMult;
    let loadMix = 0.24 + tlm.throttle * 0.48 + rpmNorm * 0.28;
    const shiftDip = 1 - tlm.gearShiftPulse * 0.55;
    let fuelAudioMult = 1.0;

    if (tlm.fuelState === 'starving') {
      fuelAudioMult = Math.sin(now * 28.0) > 0.25 ? 0.35 : 1.0;
    } else if (tlm.fuelState === 'critical') {
      fuelAudioMult = Math.sin(now * 41.0) > -0.15 ? 0.38 : 0.85;
    } else if (tlm.fuelState === 'stalled') {
      if (tlm.engineCranking) {
        const crankPulse = 0.55 + 0.45 * Math.sin(now * 34.5);
        fundamental = 28 + crankPulse * 14;
        loadMix = 0.32 * crankPulse;
        fuelAudioMult = 0.85;
      } else {
        fuelAudioMult = 0.0;
      }
    }

    this.engineLowOsc?.frequency.setTargetAtTime(fundamental, now, 0.025);
    this.engineMainOsc?.frequency.setTargetAtTime(fundamental * 2.0, now, 0.025);
    this.engineSubOsc?.frequency.setTargetAtTime(fundamental * 1.5, now, 0.025);

    // Real-time surface acoustic filtering (asphalt dry/wet | curb | gravel | snow)
    const surf = tlm.audioSurface ?? (tlm.surface === 'kerb' ? 'curb' : tlm.surface === 'offroad' ? 'gravel' : 'asphalt');
    const rollingFrac = clamp(tlm.speedMps / 42, 0, 1);
    const wetTireBoost = surf === 'asphalt' ? clamp(wetTrackRatio, 0, 1) : 0;
    let engSurfCutoffMult = 1.0 - wetTireBoost * 0.05;
    let engSurfQ = 2.4 - wetTireBoost * 0.25;
    let surfFreq = 320 + rollingFrac * 420 + wetTireBoost * 980;
    let surfQ = 0.75 + wetTireBoost * 0.4;
    let surfLevel = rollingFrac > 0.03 ? (0.014 + rollingFrac * (0.038 + wetTireBoost * 0.055)) : 0;

    if (this.surfaceAudioEnabled) {
      if (surf === 'snow') {
        engSurfCutoffMult = 0.80;
        engSurfQ = 1.65;
        surfFreq = 240 + rollingFrac * 170;
        surfQ = 0.45;
        surfLevel = rollingFrac > 0.02 ? (0.036 + rollingFrac * 0.088) : 0;
      } else if (surf === 'gravel') {
        engSurfCutoffMult = 1.08;
        engSurfQ = 2.75;
        surfFreq = 1320 + rollingFrac * 960;
        surfQ = 2.2;
        surfLevel = rollingFrac > 0.02 ? (0.052 + rollingFrac * 0.125) : 0;
      } else if (surf === 'curb') {
        engSurfCutoffMult = 1.05;
        engSurfQ = 2.95;
        surfFreq = 155 + rollingFrac * 165;
        surfQ = 2.45;
        surfLevel = rollingFrac > 0.02 ? (0.044 + rollingFrac * 0.082) : 0;
      }
    } else {
      surfLevel = 0;
    }

    this.engineFilter?.frequency.setTargetAtTime(
      (260 + rpmNorm * 1850 + tlm.throttle * 950) * engSurfCutoffMult,
      now,
      0.08,
    );
    this.engineFilter?.Q.setTargetAtTime(engSurfQ, now, 0.085);
    this.engineGain?.gain.setTargetAtTime(0.26 * loadMix * shiftDip * fuelAudioMult, now, 0.025);

    this.surfaceFilter?.frequency.setTargetAtTime(surfFreq, now, 0.12);
    this.surfaceFilter?.Q.setTargetAtTime(surfQ, now, 0.12);
    this.surfaceGain?.gain.setTargetAtTime(surfLevel, now, 0.12);

    // Hybrid electric whine
    const speedRatio = clamp(tlm.speedKmh / 350, 0, 1);
    const hybridMult = tlm.fuelState === 'stalled' ? 0.12 : 1.0;
    this.hybridWhineOsc?.frequency.setTargetAtTime(380 + speedRatio * 1480 + tlm.throttle * 180, now, 0.04);
    this.hybridGain?.gain.setTargetAtTime(
      (0.015 + speedRatio * 0.045) * (0.4 + tlm.throttle * 0.6) * hybridMult,
      now,
      0.05,
    );

    // Tire squeal (braking lockup + worn-tire slip + rotor fade overheat metallic squeal)
    const wearRatio = clamp((100 - tlm.avgTireLifePct) / 100, 0, 1);
    const brakeFadeSqueal = tlm.brakeFadeCount > 0 && tlm.isBraking ? 0.08 * tlm.brake : 0;
    const squealLevel = clamp(tlm.tireSquealIntensity * 0.19 + brakeFadeSqueal, 0, 0.24);
    const fadePitchShift = tlm.brakeFadeCount > 0 && tlm.isBraking ? 460 : 0;
    this.screechFilter?.frequency.setTargetAtTime(
      1180 + speedRatio * 680 + wearRatio * 340 + fadePitchShift,
      now,
      0.04,
    );
    this.screechGain?.gain.setTargetAtTime(squealLevel, now, 0.035);

    // Metallic guardrail / wall scrape friction
    const scrapeLevel = clamp(tlm.wallScrapeIntensity * 0.24, 0, 0.26);
    this.scrapeFilter?.frequency.setTargetAtTime(760 + speedRatio * 1250, now, 0.03);
    this.scrapeGain?.gain.setTargetAtTime(scrapeLevel, now, 0.025);

    // Wind rush at high speeds
    const windAmt = clamp((tlm.speedKmh - 75) / 280, 0, 1);
    this.windFilter?.frequency.setTargetAtTime(360 + windAmt * 900, now, 0.06);
    this.windGain?.gain.setTargetAtTime(windAmt * 0.11, now, 0.06);

    // Kerb / off-road rumble + shredded tire carcass flap thump
    const shredThump =
      tlm.shreddedCount > 0 && tlm.speedMps > 2.5
        ? clamp(tlm.speedMps / 45, 0.15, 0.85) * (0.55 + 0.45 * Math.sin(now * Math.min(75, tlm.speedMps * 3.1)))
        : 0;
    const rumbleFreqBoost = surf === 'gravel' ? 54 : surf === 'snow' ? 28 : 36;
    this.rumbleOsc?.frequency.setTargetAtTime(
      shredThump > 0 ? 28 + speedRatio * 26 : rumbleFreqBoost + speedRatio * 34,
      now,
      0.035,
    );
    const surfRumbleGain = surf === 'snow' ? tlm.kerbRumble * 0.08 : tlm.kerbRumble * 0.14;
    this.rumbleGain?.gain.setTargetAtTime(Math.max(surfRumbleGain, shredThump * 0.16), now, 0.03);

    // Turbo wastegate blow-off flutter
    if (tlm.turboBlowOffPulse > 0.35 && now - this.lastBlowOffAt > 0.45 && tlm.fuelState !== 'stalled') {
      this.lastBlowOffAt = now;
      this.playNoiseBurst(2600, 3.2, 0.22, 0.09 * tlm.turboBlowOffPulse);
    }

    // Wall impact thud & metallic crunch
    if (tlm.wallImpactImpulse > 0.14 && now - this.lastImpactAt > 0.16) {
      this.lastImpactAt = now;
      this.playTone(68, 0.17, 0.28 * tlm.wallImpactImpulse);
      this.playNoiseBurst(320 + tlm.wallImpactImpulse * 420, 1.3, 0.2, 0.22 * tlm.wallImpactImpulse);
    }

    // Pit Lane tire service pneumatic confirmation chime
    if (tlm.pitCompletePulse > 0.85 && now - this.lastPitAt > 2.5) {
      this.lastPitAt = now;
      this.playNoiseBurst(2200, 2.8, 0.14, 0.14);
      this.playTone(659.25, 0.14, 0.16);
      window.setTimeout(() => {
        this.playTone(987.77, 0.24, 0.18);
      }, 110);
    }
  }

  public dispose() {
    try {
      this.silence();
      this.engineLowOsc?.stop();
      this.engineMainOsc?.stop();
      this.engineSubOsc?.stop();
      this.hybridWhineOsc?.stop();
      this.rumbleOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
    this.ctx = null;
  }
}
