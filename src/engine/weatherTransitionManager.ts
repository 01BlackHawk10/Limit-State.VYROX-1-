import { clamp, lerp } from './mathNoise';
import type { MapId } from '../Maps/mapRegistry';
import type { SnowAtmospherePreset, WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';

export type WeatherAutoPace = 'rapid' | 'sprint' | 'endurance';

export interface WeatherTransitionConfig {
  autoEnabled: boolean;
  pace: WeatherAutoPace;
  manualTarget: WeatherPreset;
}

export interface ContinuousWeatherState {
  overcast: number;        // 0.0 (clear) .. 1.0 (heavy overcast)
  wetness: number;         // 0.0 (dry) .. 1.0 (saturated tarmac / puddles)
  rainIntensity: number;   // 0.0 .. 1.0 (rain streak opacity)
  stormIntensity: number;  // 0.0 .. 1.0 (snowstorm intensity on Frostpeak)
  sunsetStormIntensity: number; // 0.0 .. 1.0 (Sunset Storm atmospheric mix)
  mistIntensity: number;        // 0.0 .. 1.0 (Deep Morning Mist valley fog mix)
  windSpeedScale: number;  // 0.65 .. 2.65 wind speed multiplier
  fogDensityScale: number; // 1.0 .. 2.35 atmospheric fog multiplier
  aiSpeedScale: number;    // 0.80 .. 1.00 continuous AI pace multiplier
  roadFrictionScale: number;    // 0.72 .. 1.00 continuous tire grip multiplier
  offroadFrictionScale: number; // 0.78 .. 1.00 continuous off-road multiplier
  activePhase: WeatherPreset;
  nearestPreset: WeatherPreset;
  activeLabel: string;
  progressPct: number;     // 0 .. 100 progression through race weather timeline
  autoEnabled: boolean;
  pace: WeatherAutoPace;
}

const PACE_CYCLE_DURATION_SEC: Record<WeatherAutoPace, number> = {
  rapid: 90,
  sprint: 180,
  endurance: 340,
};

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Automated Race-Time Weather Transition Manager.
 *
 * Smoothly shifts between 'Dry' -> 'Overcast' -> 'Rain' -> 'Sunset Storm' -> 'Deep Morning Mist'
 * based on race time elapsed or manual selection, driving both skybox/lighting/road
 * shader uniforms and continuous tire surface friction coefficients without discrete snaps.
 */
export class WeatherTransitionManager {
  private autoEnabled = true;
  private pace: WeatherAutoPace = 'sprint';
  private manualTarget: WeatherPreset = 'dry';
  private raceElapsedSec = 0;

  private overcast = 0;
  private wetness = 0;
  private rainIntensity = 0;
  private stormIntensity = 0;
  private sunsetStormIntensity = 0;
  private mistIntensity = 0;
  private roadFrictionScale = 1.0;
  private offroadFrictionScale = 1.0;
  private activePhase: WeatherPreset = 'dry';
  private progressPct = 0;
  private snapshotCache: ContinuousWeatherState = {
    overcast: 0,
    wetness: 0,
    rainIntensity: 0,
    stormIntensity: 0,
    sunsetStormIntensity: 0,
    mistIntensity: 0,
    windSpeedScale: 1,
    fogDensityScale: 1,
    aiSpeedScale: 1,
    roadFrictionScale: 1,
    offroadFrictionScale: 1,
    activePhase: 'dry',
    nearestPreset: 'dry',
    activeLabel: 'Dry',
    progressPct: 100,
    autoEnabled: false,
    pace: 'sprint',
  };

  public configure(cfg: Partial<WeatherTransitionConfig>) {
    if (typeof cfg.autoEnabled === 'boolean') {
      this.autoEnabled = cfg.autoEnabled;
    }
    if (cfg.pace) {
      this.pace = cfg.pace;
    }
    if (cfg.manualTarget) {
      this.manualTarget = cfg.manualTarget;
    }
  }

  private getPresetTargets(target: WeatherPreset) {
    if (target === 'sunset_storm') {
      return { ov: 0.86, wet: 0.95, rain: 0.92, storm: 0.95, sunsetStorm: 1.0, mist: 0.0 };
    }
    if (target === 'deep_morning_mist') {
      return { ov: 0.34, wet: 0.28, rain: 0.0, storm: 0.0, sunsetStorm: 0.0, mist: 1.0 };
    }
    if (target === 'rain') {
      return { ov: 0.94, wet: 1.0, rain: 1.0, storm: 1.0, sunsetStorm: 0.0, mist: 0.0 };
    }
    if (target === 'overcast') {
      return { ov: 0.88, wet: 0.0, rain: 0.0, storm: 0.45, sunsetStorm: 0.0, mist: 0.0 };
    }
    return { ov: 0.0, wet: 0.0, rain: 0.0, storm: 0.0, sunsetStorm: 0.0, mist: 0.0 };
  }

  public setManualWeather(target: WeatherPreset, snap = false) {
    this.manualTarget = target;
    if (snap) {
      const t = this.getPresetTargets(target);
      this.overcast = t.ov;
      this.wetness = t.wet;
      this.rainIntensity = t.rain;
      this.stormIntensity = t.storm;
      this.sunsetStormIntensity = t.sunsetStorm;
      this.mistIntensity = t.mist;
      this.activePhase = target;
      this.recomputeFriction('aurelia_ridge', null);
    }
  }

  public resetForNewRace(
    startPreset: WeatherPreset,
    mapId: MapId = 'aurelia_ridge',
    snowPreset: SnowAtmospherePreset | null = null,
  ) {
    this.raceElapsedSec = 0;
    this.manualTarget = startPreset;
    const t = this.getPresetTargets(startPreset);
    if (startPreset === 'overcast') {
      this.raceElapsedSec = PACE_CYCLE_DURATION_SEC[this.pace] * 0.48;
      this.wetness = 0.04;
    } else if (startPreset === 'rain' || startPreset === 'sunset_storm') {
      this.raceElapsedSec = PACE_CYCLE_DURATION_SEC[this.pace] * 0.78;
      this.wetness = t.wet;
    } else {
      this.wetness = t.wet;
    }
    this.overcast = t.ov;
    this.rainIntensity = t.rain;
    this.stormIntensity =
      startPreset === 'dry' && snowPreset === 'alpine_snow' ? 0.45 : t.storm;
    this.sunsetStormIntensity = t.sunsetStorm;
    this.mistIntensity = t.mist;
    this.activePhase = startPreset;
    this.recomputeFriction(mapId, snowPreset);
  }

  public update(
    deltaSec: number,
    isLiveRace: boolean,
    mapId: MapId,
    snowPreset: SnowAtmospherePreset | null,
  ): ContinuousWeatherState {
    const dt = clamp(deltaSec, 0.001, 0.1);
    const isFrostpeak = mapId === 'frostpeak_pass';

    let targetOvercast = 0;
    let targetWetness = 0;
    let targetRain = 0;
    let targetStorm = 0;
    let targetSunsetStorm = 0;
    let targetMist = 0;

    if (this.autoEnabled && isLiveRace) {
      this.raceElapsedSec += dt;
      const cycleDur = PACE_CYCLE_DURATION_SEC[this.pace];
      const u = (this.raceElapsedSec % cycleDur) / cycleDur;
      this.progressPct = Math.round(u * 100);

      if (u < 0.28) {
        const warmBuild = smoothstep01(0.16, 0.28, u);
        targetOvercast = warmBuild * 0.18;
        targetWetness = 0.0;
        targetRain = 0.0;
        targetStorm = warmBuild * 0.15;
      } else if (u < 0.56) {
        const ovT = smoothstep01(0.28, 0.46, u);
        const preDrizzle = smoothstep01(0.50, 0.56, u);
        targetOvercast = lerp(0.18, 0.88, ovT);
        targetWetness = preDrizzle * 0.14;
        targetRain = preDrizzle * 0.22;
        targetStorm = lerp(0.15, 0.52, ovT);
      } else if (u < 0.86) {
        const rainIn = smoothstep01(0.56, 0.67, u);
        const rainHoldEnd = 1.0 - smoothstep01(0.80, 0.86, u) * 0.25;
        targetOvercast = lerp(0.88, 0.94, rainIn);
        targetRain = clamp(lerp(0.22, 1.0, rainIn) * rainHoldEnd, 0, 1);
        targetWetness = clamp(lerp(0.14, 1.0, rainIn), 0, 1);
        targetStorm = lerp(0.52, 1.0, rainIn);
      } else {
        const clearT = smoothstep01(0.86, 1.0, u);
        targetOvercast = lerp(0.94, 0.04, clearT);
        targetRain = lerp(0.75, 0.0, smoothstep01(0.86, 0.92, u));
        targetWetness = lerp(1.0, 0.0, smoothstep01(0.89, 1.0, u));
        targetStorm = lerp(1.0, 0.05, clearT);
      }
    } else {
      this.progressPct =
        this.manualTarget === 'dry'
          ? 15
          : this.manualTarget === 'deep_morning_mist'
            ? 32
            : this.manualTarget === 'overcast'
              ? 52
              : this.manualTarget === 'sunset_storm'
                ? 76
                : 90;
      if (isFrostpeak && snowPreset) {
        targetOvercast =
          snowPreset === 'twilight_storm' ? 0.86 : snowPreset === 'alpine_snow' ? 0.36 : 0.04;
        targetWetness = snowPreset === 'twilight_storm' ? 0.22 : 0.0;
        targetRain = 0.0;
        targetStorm =
          snowPreset === 'twilight_storm' ? 1.0 : snowPreset === 'alpine_snow' ? 0.45 : 0.0;
      } else {
        const t = this.getPresetTargets(this.manualTarget);
        targetOvercast = t.ov;
        targetWetness = t.wet;
        targetRain = t.rain;
        targetStorm = t.storm;
        targetSunsetStorm = t.sunsetStorm;
        targetMist = t.mist;
      }
    }

    const dampAlpha = 1 - Math.exp(-1.55 * dt);
    this.overcast = lerp(this.overcast, targetOvercast, dampAlpha);
    this.wetness = lerp(this.wetness, targetWetness, dampAlpha);
    this.rainIntensity = lerp(this.rainIntensity, targetRain, dampAlpha);
    this.stormIntensity = lerp(this.stormIntensity, targetStorm, dampAlpha);
    this.sunsetStormIntensity = lerp(this.sunsetStormIntensity, targetSunsetStorm, dampAlpha);
    this.mistIntensity = lerp(this.mistIntensity, targetMist, dampAlpha);

    if (this.sunsetStormIntensity >= 0.45) {
      this.activePhase = 'sunset_storm';
    } else if (this.mistIntensity >= 0.45) {
      this.activePhase = 'deep_morning_mist';
    } else if (this.wetness >= 0.45 || this.rainIntensity >= 0.42) {
      this.activePhase = 'rain';
    } else if (this.overcast >= 0.42) {
      this.activePhase = 'overcast';
    } else {
      this.activePhase = 'dry';
    }

    this.recomputeFriction(mapId, snowPreset);

    return this.getSnapshot(mapId, snowPreset);
  }

  private recomputeFriction(mapId: MapId, snowPreset: SnowAtmospherePreset | null) {
    if (mapId === 'frostpeak_pass') {
      const snowBase =
        snowPreset === 'glacier_sun' ? 0.94 : snowPreset === 'alpine_snow' ? 0.91 : 0.86;
      const dynStorm = clamp(Math.max(this.stormIntensity, this.wetness), 0, 1);
      const ovPenalty = lerp(1.0, 0.95, clamp(this.overcast, 0, 1));
      const stormPenalty = lerp(1.0, 0.84, dynStorm);
      this.roadFrictionScale = clamp(snowBase * ovPenalty * stormPenalty, 0.72, 1.0);
      this.offroadFrictionScale = clamp(lerp(0.95, 0.76, dynStorm), 0.72, 1.0);
    } else {
      const overcastScale = lerp(1.0, 0.94, clamp(this.overcast / 0.88, 0, 1));
      const wetRelative = clamp(this.wetness, 0, 1);
      const baseRoad = lerp(overcastScale, 0.72, wetRelative);
      // Slight dew grip trim during Deep Morning Mist, storm sheen during Sunset Storm
      const mistTrim = lerp(1.0, 0.97, clamp(this.mistIntensity, 0, 1));
      this.roadFrictionScale = clamp(baseRoad * mistTrim, 0.72, 1.0);
      this.offroadFrictionScale = clamp(lerp(1.0, 0.78, wetRelative) * lerp(1.0, 0.92, this.mistIntensity), 0.76, 1.0);
    }
  }

  public getSnapshot(mapId: MapId, snowPreset: SnowAtmospherePreset | null): ContinuousWeatherState {
    let activeLabel = 'Dry';
    if (mapId === 'frostpeak_pass') {
      if (this.activePhase === 'rain' || snowPreset === 'twilight_storm') {
        activeLabel = this.autoEnabled ? 'Snow Squall' : 'Twilight Storm';
      } else if (this.activePhase === 'overcast') {
        activeLabel = 'Alpine Flurry';
      } else {
        activeLabel = snowPreset === 'glacier_sun' ? 'Glacier Sun' : 'Crisp Alpine';
      }
    } else {
      activeLabel =
        this.activePhase === 'sunset_storm'
          ? 'Sunset Storm'
          : this.activePhase === 'deep_morning_mist'
            ? 'Deep Morning Mist'
            : this.activePhase === 'rain'
              ? 'Wet Rain'
              : this.activePhase === 'overcast'
                ? 'Overcast'
                : 'Dry';
    }

    const windActivity = clamp(
      Math.max(this.overcast * 0.65, this.rainIntensity, this.stormIntensity, this.sunsetStormIntensity),
      0,
      1,
    );
    const fogActivity = clamp(
      Math.max(this.overcast * 0.52, this.wetness, this.stormIntensity * 0.7),
      0,
      1,
    );
    const aiWeatherLoad = clamp(
      Math.max(this.overcast * 0.25, this.wetness, this.stormIntensity * 0.65, this.mistIntensity * 0.42),
      0,
      1,
    );

    const windSpeedScale = lerp(
      lerp(1.0, 2.35, windActivity),
      this.sunsetStormIntensity >= 0.45 ? 2.65 : 0.65,
      Math.max(this.sunsetStormIntensity, this.mistIntensity),
    );
    const fogDensityScale = Math.max(
      lerp(1.0, 1.55, fogActivity),
      lerp(1.0, 2.35, this.mistIntensity),
      lerp(1.0, 1.65, this.sunsetStormIntensity),
    );

    const s = this.snapshotCache;
    s.overcast = this.overcast;
    s.wetness = this.wetness;
    s.rainIntensity = this.rainIntensity;
    s.stormIntensity = this.stormIntensity;
    s.sunsetStormIntensity = this.sunsetStormIntensity;
    s.mistIntensity = this.mistIntensity;
    s.windSpeedScale = windSpeedScale;
    s.fogDensityScale = fogDensityScale;
    s.aiSpeedScale = lerp(1.0, 0.80, aiWeatherLoad);
    s.roadFrictionScale = this.roadFrictionScale;
    s.offroadFrictionScale = this.offroadFrictionScale;
    s.activePhase = this.activePhase;
    s.nearestPreset = this.activePhase;
    s.activeLabel = activeLabel;
    s.progressPct = this.progressPct;
    s.autoEnabled = this.autoEnabled;
    s.pace = this.pace;
    return s;
  }
}
