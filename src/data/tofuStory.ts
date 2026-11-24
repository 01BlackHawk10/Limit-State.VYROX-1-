import type { MapId } from '../Maps/mapRegistry';
import type { WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import type { TougeDirection } from '../Maps/Touge/tougePassData';

export type TofuGrade = 'S' | 'A' | 'B' | 'C';

export interface TofuStoryChapter {
  id: string;
  chapterNumber: number;
  title: string;
  subtitle: string;
  description: string;
  mapId: MapId;
  direction: TougeDirection;
  weather: WeatherPreset;
  solarDeg: number;
  headlightsRequired: boolean;
  spillSensitivity: number; // 0.85 .. 1.35 (higher = easier to spill water cup)
  minIntegrityPct: number; // minimum remaining water % at finish
  targetTimeMs: {
    S: number;
    A: number;
    B: number;
  };
  rewardCr: number;
  recommendedCarId: 'toyota-ae86-trueno';
}

export const TOFU_STORY_CHAPTERS: TofuStoryChapter[] = [
  {
    id: 'tofu_ch1_akina_dawn',
    chapterNumber: 1,
    title: 'Dawn Water Cup Test',
    subtitle: 'Mt. Akina · Downhill · Morning Mist',
    description:
      '04:30 AM dispatch to Lake Akina Hotel. Keep the paper water cup steady through the five consecutive hairpins — smooth weight transfer only.',
    mapId: 'akina_pass',
    direction: 'downhill',
    weather: 'deep_morning_mist',
    solarDeg: 10,
    headlightsRequired: true,
    spillSensitivity: 0.92,
    minIntegrityPct: 35,
    targetTimeMs: {
      S: 108_000,
      A: 120_000,
      B: 138_000,
    },
    rewardCr: 6500,
    recommendedCarId: 'toyota-ae86-trueno',
  },
  {
    id: 'tofu_ch2_myogi_overcast',
    chapterNumber: 2,
    title: 'Myogi Express Freight',
    subtitle: 'Mt. Myogi · Downhill · Overcast',
    description:
      'High-speed sweepers and tight guardrails demand measured trail-braking. Snap oversteer or barrier taps will ruin the tray.',
    mapId: 'myogi_pass',
    direction: 'downhill',
    weather: 'overcast',
    solarDeg: 28,
    headlightsRequired: false,
    spillSensitivity: 1.04,
    minIntegrityPct: 40,
    targetTimeMs: {
      S: 112_000,
      A: 126_000,
      B: 145_000,
    },
    rewardCr: 8500,
    recommendedCarId: 'toyota-ae86-trueno',
  },
  {
    id: 'tofu_ch3_akagi_rain',
    chapterNumber: 3,
    title: 'Rain on Akagi Hairpins',
    subtitle: 'Mt. Akagi · Downhill · Night Rain',
    description:
      'Heavy midnight downpour on unfamiliar tarmac. Flip on your beams, read the reflectors, and balance throttle without spinning the rears.',
    mapId: 'akagi_pass',
    direction: 'downhill',
    weather: 'rain',
    solarDeg: 258,
    headlightsRequired: true,
    spillSensitivity: 1.12,
    minIntegrityPct: 45,
    targetTimeMs: {
      S: 122_000,
      A: 136_000,
      B: 155_000,
    },
    rewardCr: 11500,
    recommendedCarId: 'toyota-ae86-trueno',
  },
  {
    id: 'tofu_ch4_akina_midnight',
    chapterNumber: 4,
    title: 'Midnight Gutter Run',
    subtitle: 'Mt. Akina · Downhill · Pitch Midnight',
    description:
      'Total mountain darkness. Carve the inside drainage gutters smoothly at race pace while keeping the cup above half-full.',
    mapId: 'akina_pass',
    direction: 'downhill',
    weather: 'dry',
    solarDeg: 266,
    headlightsRequired: true,
    spillSensitivity: 1.2,
    minIntegrityPct: 50,
    targetTimeMs: {
      S: 100_000,
      A: 112_000,
      B: 128_000,
    },
    rewardCr: 14500,
    recommendedCarId: 'toyota-ae86-trueno',
  },
  {
    id: 'tofu_ch5_akagi_uphill',
    chapterNumber: 5,
    title: 'Summit Uphill Return',
    subtitle: 'Mt. Akagi · Uphill · Pre-Dawn Storm',
    description:
      'Final express order back up the mountain before sunrise. Manage boost and wheelspin on steep climbs without sloshing the cargo.',
    mapId: 'akagi_pass',
    direction: 'uphill',
    weather: 'sunset_storm',
    solarDeg: 192,
    headlightsRequired: true,
    spillSensitivity: 1.24,
    minIntegrityPct: 50,
    targetTimeMs: {
      S: 116_000,
      A: 130_000,
      B: 148_000,
    },
    rewardCr: 18000,
    recommendedCarId: 'toyota-ae86-trueno',
  },
];

export function getTofuChapterById(id?: string): TofuStoryChapter {
  return TOFU_STORY_CHAPTERS.find((c) => c.id === id) ?? TOFU_STORY_CHAPTERS[0];
}

export function evaluateTofuGrade(
  chapter: TofuStoryChapter,
  timeMs: number,
  integrityPct: number,
): TofuGrade {
  if (timeMs <= chapter.targetTimeMs.S && integrityPct >= 75) return 'S';
  if (timeMs <= chapter.targetTimeMs.A && integrityPct >= 55) return 'A';
  if (timeMs <= chapter.targetTimeMs.B && integrityPct >= chapter.minIntegrityPct) return 'B';
  return 'C';
}
