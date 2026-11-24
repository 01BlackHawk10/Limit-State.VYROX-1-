import {
  Aperture,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Download,
  Eye,
  EyeOff,
  Gamepad2,
  Image as ImageIcon,
  Lightbulb,
  Lock,
  Move,
  RotateCcw,
  Sliders,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AppScreenMode,
  CinematicSettings,
  FilmGradePreset,
  GraphicsQuality,
  MapId,
  PhotoModeState,
  PhotoViewMode,
  RenderScaleOption,
  ShadowQualityOption,
  SnowAtmospherePreset,
  TextureSizeOption,
} from '../engine/SceneController';
import type { HazePreset, WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import type { InspectMode } from '../Maps/Aurelia Ridge/terrainBuilder';

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  timestamp: number;
  carName: string;
  locationName: string;
  viewLabel: string;
  fovDeg: number;
}

export const PHOTO_VIEW_DEFS: Array<{
  id: PhotoViewMode;
  label: string;
  shortLabel: string;
  hint: string;
}> = [
  {
    id: 'drone',
    label: 'Free Walk',
    shortLabel: 'Free',
    hint: 'Drag to look · WASD + Q/E to move freely anywhere',
  },
  {
    id: 'orbit',
    label: 'Orbit Car',
    shortLabel: 'Orbit',
    hint: 'Drag to orbit 360° · Scroll to zoom · WASD to pan target',
  },
  {
    id: 'interior',
    label: 'Inside Car',
    shortLabel: 'In-Car',
    hint: 'Drag to look inside cabin · WASD + Q/E to move inside car',
  },
  {
    id: 'front_low',
    label: 'Front 3/4',
    shortLabel: 'Front',
    hint: 'Low splitter hero angle · Drag & scroll to adjust',
  },
  {
    id: 'rear_aero',
    label: 'Rear Wing',
    shortLabel: 'Rear',
    hint: 'Rear aero & diffuser angle · Drag & scroll to adjust',
  },
];

export function getPhotoViewLabel(view: PhotoViewMode): string {
  return PHOTO_VIEW_DEFS.find((v) => v.id === view)?.label ?? 'Free Walk';
}

type PhotoStudioTab = 'camera' | 'weather' | 'render';

const PHOTO_WEATHER_OPTIONS: Array<{ id: WeatherPreset; label: string }> = [
  { id: 'dry', label: 'Clear' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'rain', label: 'Rain' },
  { id: 'sunset_storm', label: 'Storm' },
  { id: 'deep_morning_mist', label: 'Mist' },
];

const PHOTO_TIME_PRESETS: Array<{ label: string; deg: number }> = [
  { label: 'Dawn', deg: 14 },
  { label: 'Morning', deg: 42 },
  { label: 'Noon', deg: 82 },
  { label: 'Sunset', deg: 168 },
  { label: 'Night', deg: 265 },
];

const PHOTO_HAZE_OPTIONS: Array<{ id: HazePreset; label: string }> = [
  { id: 'low', label: 'Crisp' },
  { id: 'golden', label: 'Golden' },
  { id: 'heavy', label: 'Thick' },
];

const PHOTO_SNOW_OPTIONS: Array<{ id: SnowAtmospherePreset; label: string }> = [
  { id: 'alpine_snow', label: 'Alpine' },
  { id: 'twilight_storm', label: 'Twilight' },
  { id: 'glacier_sun', label: 'Glacier' },
];

const PHOTO_QUALITY_OPTIONS: Array<{ id: GraphicsQuality; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'recommended', label: 'Balanced' },
  { id: 'high', label: 'High' },
  { id: 'ultra', label: 'Ultra' },
  { id: 'max', label: 'Max' },
];

const PHOTO_SHADOW_OPTIONS: Array<{ id: ShadowQualityOption; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
];

const PHOTO_TEX_OPTIONS: Array<{ id: TextureSizeOption; label: string }> = [
  { id: '512', label: '512' },
  { id: '1024', label: '1024' },
  { id: '2048', label: '2048' },
];

const PHOTO_SCALE_OPTIONS: Array<{ id: RenderScaleOption; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'native', label: 'Native' },
];

const PHOTO_FILM_GRADES: Array<{ id: FilmGradePreset; label: string }> = [
  { id: 'natural', label: 'Natural' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'kodak_gold', label: 'Kodak Gold' },
  { id: 'cool_gt', label: 'Cool GT' },
  { id: 'noir', label: 'Noir' },
];

const PHOTO_INSPECT_MODES: Array<{ id: InspectMode; label: string }> = [
  { id: 'lit', label: 'Lit PBR' },
  { id: 'elevation', label: 'Elev' },
  { id: 'wireframe', label: 'Wire' },
];

interface PhotoModeOverlayProps {
  photoState: PhotoModeState;
  appMode: AppScreenMode;
  activeMapId: MapId;
  isHudHidden: boolean;
  carName: string;
  locationName: string;
  photos: CapturedPhoto[];
  previewPhotoId: string | null;
  autoPreview: boolean;
  flashCounter: number;
  isMobileTouch: boolean;
  solarAngle: number;
  phaseLabel: string;
  isAutoCycle: boolean;
  hazePreset: HazePreset;
  weatherPreset: WeatherPreset;
  snowAtmosphere: SnowAtmospherePreset;
  headlightsOn: boolean;
  graphicsQuality: GraphicsQuality;
  shadowQuality: ShadowQualityOption;
  textureSize: TextureSizeOption;
  renderScale: RenderScaleOption;
  postFxEnabled: boolean;
  inspectMode: InspectMode;
  cinematicSettings: CinematicSettings;
  onSolarChange: (deg: number) => void;
  onToggleAutoCycle: () => void;
  onHazeChange: (haze: HazePreset) => void;
  onWeatherChange: (weather: WeatherPreset) => void;
  onSnowAtmosphereChange: (preset: SnowAtmospherePreset) => void;
  onToggleHeadlights: () => void;
  onGraphicsQualityChange: (q: GraphicsQuality) => void;
  onShadowQualityChange: (s: ShadowQualityOption) => void;
  onTextureSizeChange: (t: TextureSizeOption) => void;
  onRenderScaleChange: (r: RenderScaleOption) => void;
  onTogglePostFx: () => void;
  onInspectChange: (m: InspectMode) => void;
  onCinematicSettingsChange: (next: CinematicSettings) => void;
  onTakePhoto: () => void;
  onCycleView: () => void;
  onSelectView: (view: PhotoViewMode) => void;
  onToggleFreeze: () => void;
  onLensChange: (patch: { fovDeg?: number; rollDeg?: number; moveSpeed?: number }) => void;
  onResetCamera: () => void;
  onToggleHudHidden: () => void;
  onToggleAutoPreview: () => void;
  onOpenPreview: (photoId?: string) => void;
  onClosePreview: () => void;
  onDownloadPhoto: (photo: CapturedPhoto) => void;
  onDeletePhoto: (photoId: string) => void;
  onPhotoMoveInput: (input: { forward?: number; right?: number; up?: number; boost?: boolean }) => void;
  onExit: () => void;
}

export function PhotoModeOverlay({
  photoState,
  appMode,
  activeMapId,
  isHudHidden,
  carName,
  locationName,
  photos,
  previewPhotoId,
  autoPreview,
  flashCounter,
  isMobileTouch,
  solarAngle,
  phaseLabel,
  isAutoCycle,
  hazePreset,
  weatherPreset,
  snowAtmosphere,
  headlightsOn,
  graphicsQuality,
  shadowQuality,
  textureSize,
  renderScale,
  postFxEnabled,
  inspectMode,
  cinematicSettings,
  onSolarChange,
  onToggleAutoCycle,
  onHazeChange,
  onWeatherChange,
  onSnowAtmosphereChange,
  onToggleHeadlights,
  onGraphicsQualityChange,
  onShadowQualityChange,
  onTextureSizeChange,
  onRenderScaleChange,
  onTogglePostFx,
  onInspectChange,
  onCinematicSettingsChange,
  onTakePhoto,
  onCycleView,
  onSelectView,
  onToggleFreeze,
  onLensChange,
  onResetCamera,
  onToggleHudHidden,
  onToggleAutoPreview,
  onOpenPreview,
  onClosePreview,
  onDownloadPhoto,
  onDeletePhoto,
  onPhotoMoveInput,
  onExit,
}: PhotoModeOverlayProps) {
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<PhotoStudioTab>('camera');
  const [movePadOpen, setMovePadOpen] = useState(isMobileTouch);
  const [flashVisible, setFlashVisible] = useState(false);

  useEffect(() => {
    if (flashCounter <= 0) return;
    setFlashVisible(true);
    const timer = window.setTimeout(() => setFlashVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [flashCounter]);

  useEffect(() => {
    if (!photoState.active) {
      setStudioOpen(false);
    }
  }, [photoState.active]);

  if (!photoState.active && !previewPhotoId) {
    return null;
  }

  const previewIndex = previewPhotoId
    ? photos.findIndex((p) => p.id === previewPhotoId)
    : -1;
  const previewPhoto = previewIndex >= 0 ? photos[previewIndex] : null;
  const activeViewDef =
    PHOTO_VIEW_DEFS.find((v) => v.id === photoState.viewMode) ?? PHOTO_VIEW_DEFS[0];
  const isDrivingCarMode = appMode === 'racing' && !photoState.carFrozen;

  return (
    <>
      {/* Subtle camera shutter flash */}
      {flashVisible && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[85] bg-white/80 transition-opacity duration-150"
        />
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[80] flex flex-col justify-between bg-black/92 p-3 sm:p-5"
          style={{
            paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          }}
          data-testid="photo-preview-modal"
        >
          {/* Preview Header */}
          <header className="gt5-panel gt5-carbon flex items-center justify-between gap-3 border border-white/15 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono-tabular text-[10px] font-bold tracking-[0.16em] text-sky-400">
                  Limit state <span className="text-white">.VYROX</span>
                </span>
                <span className="border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-sky-200 uppercase">
                  Preview {previewIndex + 1}/{photos.length}
                </span>
              </div>
              <div className="font-display text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                {previewPhoto.carName} · {previewPhoto.locationName} ·{' '}
                <span className="text-sky-300">{previewPhoto.viewLabel}</span> ({Math.round(previewPhoto.fovDeg)}°)
              </div>
            </div>

            <button
              type="button"
              onClick={onClosePreview}
              aria-label="Close Preview"
              className="inline-flex h-10 items-center gap-1.5 border border-white/18 bg-white/5 px-3 font-display text-xs font-bold tracking-wider text-slate-100 uppercase hover:border-sky-400/60 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Camera</span>
            </button>
          </header>

          {/* Preview Image Stage */}
          <div className="relative my-2 flex min-h-0 flex-1 items-center justify-center">
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => {
                  const prevIdx = (previewIndex - 1 + photos.length) % photos.length;
                  onOpenPreview(photos[prevIdx].id);
                }}
                className="absolute left-1 sm:left-3 z-10 flex h-11 w-11 items-center justify-center border border-white/25 bg-black/75 text-white hover:border-sky-400 hover:bg-sky-500/25"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <img
              src={previewPhoto.dataUrl}
              alt={`${previewPhoto.carName} photo`}
              className="max-h-full max-w-full border border-white/18 bg-black object-contain shadow-2xl"
            />

            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => {
                  const nextIdx = (previewIndex + 1) % photos.length;
                  onOpenPreview(photos[nextIdx].id);
                }}
                className="absolute right-1 sm:right-3 z-10 flex h-11 w-11 items-center justify-center border border-white/25 bg-black/75 text-white hover:border-sky-400 hover:bg-sky-500/25"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Preview Filmstrip & Actions */}
          <footer className="gt5-panel gt5-carbon flex flex-col gap-2.5 border border-white/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {photos.map((shot, idx) => {
                const selected = shot.id === previewPhoto.id;
                return (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => onOpenPreview(shot.id)}
                    className={`relative h-12 w-20 shrink-0 overflow-hidden border transition-all ${
                      selected
                        ? 'border-sky-400 ring-1 ring-sky-400'
                        : 'border-white/15 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={shot.dataUrl}
                      alt={`Shot ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 bg-black/80 px-1 font-mono-tabular text-[9px] font-bold text-white">
                      {idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onDeletePhoto(previewPhoto.id)}
                className="inline-flex h-10 items-center gap-1.5 border border-rose-500/45 bg-rose-500/15 px-3 font-display text-xs font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-500/25"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={() => onDownloadPhoto(previewPhoto)}
                data-testid="photo-download-btn"
                className="inline-flex h-10 items-center gap-1.5 bg-sky-500 px-4 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PNG</span>
              </button>
              <button
                type="button"
                onClick={onClosePreview}
                className="inline-flex h-10 items-center gap-1.5 border border-white/20 bg-white/8 px-3.5 font-display text-xs font-bold tracking-wider text-white uppercase hover:border-sky-400/60"
              >
                <Camera className="h-3.5 w-3.5 text-sky-400" />
                <span>Shoot More</span>
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* HUD-Free Clean View Corner Controls */}
      {photoState.active && !previewPhoto && isHudHidden && (
        <div
          className="pointer-events-auto fixed right-3 top-3 z-[65] flex items-center gap-2"
          style={{
            top: 'max(0.75rem, env(safe-area-inset-top))',
            right: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <button
            type="button"
            onClick={onTakePhoto}
            title="Take Clean Photo (Enter)"
            aria-label="Take Clean Photo"
            className="flex h-10 w-10 items-center justify-center border border-sky-400/70 bg-sky-500 text-slate-950 shadow-xl hover:bg-sky-400"
          >
            <Aperture className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleHudHidden}
            title="Show Photo Controls (H)"
            aria-label="Show Photo Controls"
            className="flex h-10 w-10 items-center justify-center border border-white/25 bg-[#080c12]/90 text-white shadow-xl hover:border-sky-400"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Photography Mode Controls */}
      {photoState.active && !previewPhoto && !isHudHidden && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] flex flex-col justify-between p-2 sm:p-4"
          style={{
            paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
            paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
            paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
          }}
          data-testid="photo-mode-overlay"
        >
          {/* Top Bar */}
          <div className="flex items-start justify-between gap-2">
            <div className="pointer-events-auto gt5-panel gt5-carbon border border-white/15 px-3 py-1.5 sm:px-3.5 sm:py-2 max-w-[68vw] sm:max-w-lg">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[10px] font-bold tracking-[0.16em] text-sky-400 uppercase">
                  <Aperture className="h-3.5 w-3.5" />
                  <span>Photo Mode</span>
                </span>
                <span
                  className={`border px-1.5 py-0.5 font-mono-tabular text-[9.5px] font-bold uppercase ${
                    isDrivingCarMode
                      ? 'border-amber-400/60 bg-amber-500/18 text-amber-200'
                      : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                  }`}
                >
                  {isDrivingCarMode ? 'Driving Car (F to Freeze)' : appMode === 'garage' ? 'Showroom' : 'Car Frozen'}
                </span>
                <span className="hidden sm:inline font-mono-tabular text-[10px] text-slate-300 truncate">
                  {carName} · {locationName}
                </span>
              </div>
              <p className="mt-0.5 hidden sm:block text-[11px] text-slate-400 truncate">
                {isDrivingCarMode
                  ? 'Drive with WASD/Arrows to position the car · Press F or click Freeze to shoot'
                  : activeViewDef.hint}
              </p>
            </div>

            {/* Top-Right Utility Buttons */}
            <div className="pointer-events-auto relative flex items-center gap-1.5 shrink-0">
              {!isDrivingCarMode && (
                <button
                  type="button"
                  onClick={() => setMovePadOpen((v) => !v)}
                  title="Toggle On-Screen Move Pad"
                  className={`gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase transition-colors ${
                    movePadOpen
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'text-slate-200 hover:border-sky-400/50'
                  }`}
                >
                  <Move className="h-3.5 w-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Move Pad</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setStudioTab('camera');
                  setStudioOpen((v) => (studioTab === 'camera' ? !v : true));
                }}
                aria-expanded={studioOpen && studioTab === 'camera'}
                title="Camera Lens & Speed Settings"
                className={`gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                  studioOpen && studioTab === 'camera'
                    ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                    : 'text-slate-200 hover:border-sky-400/50'
                }`}
              >
                <Sliders className="h-3.5 w-3.5 text-sky-400" />
                <span className="hidden sm:inline">Lens</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStudioTab('weather');
                  setStudioOpen((v) => (studioTab === 'weather' ? !v : true));
                }}
                aria-expanded={studioOpen && studioTab === 'weather'}
                title="Time of Day, Weather & Headlights"
                className={`gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                  studioOpen && studioTab === 'weather'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'text-slate-200 hover:border-amber-400/50'
                }`}
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden sm:inline">Time &amp; Weather</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStudioTab('render');
                  setStudioOpen((v) => (studioTab === 'render' ? !v : true));
                }}
                aria-expanded={studioOpen && studioTab === 'render'}
                title="Graphics Quality, Shadows & Render Settings"
                className={`gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                  studioOpen && studioTab === 'render'
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                    : 'text-slate-200 hover:border-emerald-400/50'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Quality &amp; Render</span>
              </button>

              <button
                type="button"
                onClick={onToggleHudHidden}
                title="Hide Controls for Clean Framing (H)"
                aria-label="Hide Photo Controls"
                data-testid="photo-hide-ui-btn"
                className="gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 px-2.5 text-[11px] font-bold text-slate-200 uppercase hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0"
              >
                <Eye className="h-3.5 w-3.5 text-sky-400" />
                <span className="hidden md:inline">Hide UI</span>
              </button>

              <button
                type="button"
                onClick={onExit}
                title="Exit Photo Mode (Esc / P)"
                data-testid="photo-exit-btn"
                className="gt7-hud-box inline-flex h-10 sm:h-9 items-center gap-1.5 border-rose-400/45 bg-rose-500/15 px-3 text-[11px] font-bold text-rose-100 uppercase hover:bg-rose-500/25 whitespace-nowrap shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                <span>Exit</span>
              </button>

              {/* Docked Photo Studio Panel (Camera / Time & Weather / Quality & Render) */}
              {studioOpen && (
                <div className="gt5-panel gt5-carbon absolute right-0 top-full z-40 mt-1.5 w-[min(350px,calc(100vw-1rem))] max-h-[72dvh] overflow-y-auto border border-sky-400/45 bg-[#090d14] p-3 shadow-2xl space-y-3">
                  {/* Studio Sub-Tabs */}
                  <div className="grid grid-cols-3 gap-1 border-b border-white/10 pb-2">
                    <button
                      type="button"
                      onClick={() => setStudioTab('camera')}
                      className={`inline-flex items-center justify-center gap-1 border px-2 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                        studioTab === 'camera'
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : 'border-white/10 bg-black/40 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <Sliders className="h-3 w-3" />
                      <span>Lens</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudioTab('weather')}
                      className={`inline-flex items-center justify-center gap-1 border px-2 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                        studioTab === 'weather'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-black/40 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <CloudRain className="h-3 w-3" />
                      <span>Sky/Wx</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudioTab('render')}
                      className={`inline-flex items-center justify-center gap-1 border px-2 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                        studioTab === 'render'
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/10 bg-black/40 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Render</span>
                    </button>
                  </div>

                  {studioTab === 'camera' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-xs font-bold tracking-wider text-white uppercase">
                          Camera &amp; Lens
                        </span>
                        <button
                          type="button"
                          onClick={onResetCamera}
                          className="inline-flex items-center gap-1 border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-sky-300 uppercase hover:border-sky-400/60"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset</span>
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">Field of View (Zoom)</span>
                          <span className="font-mono-tabular font-bold text-sky-300">
                            {Math.round(photoState.fovDeg)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={95}
                          step={1}
                          value={photoState.fovDeg}
                          onChange={(e) => onLensChange({ fovDeg: Number(e.target.value) })}
                          className="sun-slider mt-1 w-full"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">Camera Roll (Tilt)</span>
                          <span className="font-mono-tabular font-bold text-amber-300">
                            {photoState.rollDeg > 0 ? '+' : ''}
                            {Math.round(photoState.rollDeg)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-35}
                          max={35}
                          step={1}
                          value={photoState.rollDeg}
                          onChange={(e) => onLensChange({ rollDeg: Number(e.target.value) })}
                          className="sun-slider mt-1 w-full"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">Fly Speed</span>
                          <span className="font-mono-tabular font-bold text-emerald-300">
                            {photoState.moveSpeed.toFixed(1)} m/s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={30}
                          step={0.5}
                          value={photoState.moveSpeed}
                          onChange={(e) => onLensChange({ moveSpeed: Number(e.target.value) })}
                          className="sun-slider mt-1 w-full"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={onToggleAutoPreview}
                        className={`flex w-full items-center justify-between border px-2.5 py-1.5 text-[11px] font-semibold ${
                          autoPreview
                            ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                            : 'border-white/15 bg-white/5 text-slate-300'
                        }`}
                      >
                        <span>Show Preview After Shot</span>
                        <span className="font-mono-tabular text-[10px] font-bold uppercase">
                          {autoPreview ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>
                  )}

                  {studioTab === 'weather' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-200">
                            Time of Day · <span className="text-amber-300">{phaseLabel}</span>
                          </span>
                          <span className="font-mono-tabular font-bold text-amber-300">
                            {Math.round(solarAngle)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={359}
                          step={1}
                          value={solarAngle}
                          onChange={(e) => onSolarChange(Number(e.target.value))}
                          className="sun-slider mt-1 w-full"
                        />
                        <div className="mt-1.5 grid grid-cols-5 gap-1">
                          {PHOTO_TIME_PRESETS.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => onSolarChange(p.deg)}
                              className={`border px-1 py-1 text-[10px] font-semibold transition-colors ${
                                Math.abs(solarAngle - p.deg) < 12
                                  ? 'border-amber-400 bg-amber-500/20 text-white'
                                  : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={onToggleAutoCycle}
                          className={`flex items-center justify-between border px-2 py-1.5 text-[10.5px] font-semibold ${
                            isAutoCycle
                              ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                              : 'border-white/12 bg-black/45 text-slate-300'
                          }`}
                        >
                          <span>Solar Cycle</span>
                          <span className="font-mono-tabular">{isAutoCycle ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={onToggleHeadlights}
                          className={`flex items-center justify-between border px-2 py-1.5 text-[10.5px] font-semibold ${
                            headlightsOn
                              ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                              : 'border-white/12 bg-black/45 text-slate-300'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" />
                            Lights
                          </span>
                          <span className="font-mono-tabular">{headlightsOn ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                          Weather Condition
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {PHOTO_WEATHER_OPTIONS.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => onWeatherChange(w.id)}
                              className={`border px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                                weatherPreset === w.id
                                  ? 'border-sky-400 bg-sky-500/20 text-white'
                                  : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              {w.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                            Atmosphere Haze
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {PHOTO_HAZE_OPTIONS.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => onHazeChange(h.id)}
                                className={`border px-1 py-1 text-[10px] font-semibold ${
                                  hazePreset === h.id
                                    ? 'border-amber-400 bg-amber-500/20 text-white'
                                    : 'border-white/12 bg-black/45 text-slate-300'
                                }`}
                              >
                                {h.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                            Auto Weather
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onCinematicSettingsChange({
                                  ...cinematicSettings,
                                  weatherAutoEnabled: !cinematicSettings.weatherAutoEnabled,
                                })
                              }
                              className={`border px-1 py-1 text-[10px] font-semibold ${
                                cinematicSettings.weatherAutoEnabled
                                  ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                                  : 'border-white/12 bg-black/45 text-slate-400'
                              }`}
                            >
                              Prog
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onCinematicSettingsChange({
                                  ...cinematicSettings,
                                  dynamicWeatherEnabled: !cinematicSettings.dynamicWeatherEnabled,
                                })
                              }
                              className={`border px-1 py-1 text-[10px] font-semibold ${
                                cinematicSettings.dynamicWeatherEnabled
                                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                                  : 'border-white/12 bg-black/45 text-slate-400'
                              }`}
                            >
                              Dyn
                            </button>
                          </div>
                        </div>
                      </div>

                      {activeMapId === 'frostpeak_pass' && (
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-sky-300 uppercase mb-1">
                            <Snowflake className="h-3 w-3" />
                            <span>Snow Atmosphere</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {PHOTO_SNOW_OPTIONS.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => onSnowAtmosphereChange(s.id)}
                                className={`border px-1.5 py-1 text-[10px] font-semibold ${
                                  snowAtmosphere === s.id
                                    ? 'border-sky-400 bg-sky-500/25 text-white'
                                    : 'border-white/12 bg-black/45 text-slate-300'
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {studioTab === 'render' && (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                          Graphics Quality Preset
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {PHOTO_QUALITY_OPTIONS.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => onGraphicsQualityChange(q.id)}
                              className={`border px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                                graphicsQuality === q.id
                                  ? 'border-sky-400 bg-sky-500/20 text-white'
                                  : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <div className="text-[9.5px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                            Shadows
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {PHOTO_SHADOW_OPTIONS.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => onShadowQualityChange(s.id)}
                                className={`border px-1 py-1 text-[10px] font-semibold ${
                                  shadowQuality === s.id
                                    ? 'border-sky-400 bg-sky-500/20 text-white'
                                    : 'border-white/12 bg-black/45 text-slate-300'
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9.5px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                            Textures
                          </div>
                          <div className="grid grid-cols-1 gap-1">
                            {PHOTO_TEX_OPTIONS.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => onTextureSizeChange(t.id)}
                                className={`border px-1 py-0.5 font-mono-tabular text-[10px] font-semibold ${
                                  textureSize === t.id
                                    ? 'border-sky-400 bg-sky-500/20 text-white'
                                    : 'border-white/12 bg-black/45 text-slate-300'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9.5px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                            Render Scale
                          </div>
                          <div className="grid grid-cols-1 gap-1">
                            {PHOTO_SCALE_OPTIONS.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => onRenderScaleChange(r.id)}
                                className={`border px-1 py-0.5 text-[10px] font-semibold ${
                                  renderScale === r.id
                                    ? 'border-sky-400 bg-sky-500/20 text-white'
                                    : 'border-white/12 bg-black/45 text-slate-300'
                                }`}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                        <button
                          type="button"
                          onClick={onTogglePostFx}
                          className={`flex-1 border px-2 py-1.5 text-[10.5px] font-bold uppercase ${
                            postFxEnabled
                              ? 'border-emerald-400/60 bg-emerald-500/18 text-emerald-200'
                              : 'border-white/12 bg-black/45 text-slate-300'
                          }`}
                        >
                          Post-FX: {postFxEnabled ? 'HDR ON' : 'RAW PBR'}
                        </button>
                        <div className="flex items-center gap-1">
                          {PHOTO_INSPECT_MODES.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => onInspectChange(m.id)}
                              className={`border px-1.5 py-1.5 text-[10px] font-semibold ${
                                inspectMode === m.id
                                  ? 'border-sky-400 bg-sky-500/20 text-white'
                                  : 'border-white/12 bg-black/45 text-slate-400'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                          Film Color Grade LUT
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {PHOTO_FILM_GRADES.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() =>
                                onCinematicSettingsChange({
                                  ...cinematicSettings,
                                  filmGrade: g.id,
                                })
                              }
                              className={`border px-1 py-1 text-[9.5px] font-semibold truncate ${
                                cinematicSettings.filmGrade === g.id
                                  ? 'border-amber-400 bg-amber-500/20 text-white'
                                  : 'border-white/12 bg-black/45 text-slate-300'
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-white/10 pt-2">
                        <div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="text-slate-300">ACES Exposure</span>
                            <span className="font-mono-tabular text-amber-300">
                              {cinematicSettings.exposure.toFixed(2)} EV
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.7}
                            max={1.45}
                            step={0.02}
                            value={cinematicSettings.exposure}
                            onChange={(e) =>
                              onCinematicSettingsChange({
                                ...cinematicSettings,
                                exposure: Number(e.target.value),
                              })
                            }
                            className="sun-slider mt-0.5 w-full"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="text-slate-300">HDR Bloom Strength</span>
                            <span className="font-mono-tabular text-sky-300">
                              {cinematicSettings.bloomStrength.toFixed(2)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.45}
                            step={0.01}
                            value={cinematicSettings.bloomStrength}
                            onChange={(e) =>
                              onCinematicSettingsChange({
                                ...cinematicSettings,
                                bloomStrength: Number(e.target.value),
                              })
                            }
                            className="sun-slider mt-0.5 w-full"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="text-slate-300">Bloom Threshold</span>
                            <span className="font-mono-tabular text-sky-300">
                              {cinematicSettings.bloomThreshold.toFixed(2)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.7}
                            max={1.15}
                            step={0.01}
                            value={cinematicSettings.bloomThreshold}
                            onChange={(e) =>
                              onCinematicSettingsChange({
                                ...cinematicSettings,
                                bloomThreshold: Number(e.target.value),
                              })
                            }
                            className="sun-slider mt-0.5 w-full"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="text-slate-300">Optical Vignette</span>
                            <span className="font-mono-tabular text-slate-300">
                              {Math.round(cinematicSettings.vignetteStrength * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.55}
                            step={0.02}
                            value={cinematicSettings.vignetteStrength}
                            onChange={(e) =>
                              onCinematicSettingsChange({
                                ...cinematicSettings,
                                vignetteStrength: Number(e.target.value),
                              })
                            }
                            className="sun-slider mt-0.5 w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Middle Row: Optional On-Screen Move Pad (bottom-left) */}
          <div className="my-auto flex items-end justify-between">
            {movePadOpen && !isDrivingCarMode ? (
              <div className="pointer-events-auto gt5-panel gt5-carbon border border-white/18 p-2 shadow-2xl space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[9.5px] font-mono-tabular font-bold text-slate-400 uppercase">
                  <span>Move Camera</span>
                  <button
                    type="button"
                    onPointerDown={() => onPhotoMoveInput({ boost: true })}
                    onPointerUp={() => onPhotoMoveInput({ boost: false })}
                    onPointerLeave={() => onPhotoMoveInput({ boost: false })}
                    onPointerCancel={() => onPhotoMoveInput({ boost: false })}
                    className="border border-sky-400/45 bg-sky-500/15 px-1.5 py-0.5 text-sky-300 active:bg-sky-500/40"
                  >
                    Boost
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    aria-label="Move Camera Down"
                    onPointerDown={() => onPhotoMoveInput({ up: -1 })}
                    onPointerUp={() => onPhotoMoveInput({ up: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ up: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ up: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/5 text-[10px] font-bold text-slate-300 active:bg-sky-500/35"
                  >
                    DN
                  </button>
                  <button
                    type="button"
                    aria-label="Move Camera Forward"
                    onPointerDown={() => onPhotoMoveInput({ forward: 1 })}
                    onPointerUp={() => onPhotoMoveInput({ forward: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ forward: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ forward: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/10 text-white active:bg-sky-500/35"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move Camera Up"
                    onPointerDown={() => onPhotoMoveInput({ up: 1 })}
                    onPointerUp={() => onPhotoMoveInput({ up: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ up: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ up: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/5 text-[10px] font-bold text-slate-300 active:bg-sky-500/35"
                  >
                    UP
                  </button>
                  <button
                    type="button"
                    aria-label="Move Camera Left"
                    onPointerDown={() => onPhotoMoveInput({ right: -1 })}
                    onPointerUp={() => onPhotoMoveInput({ right: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ right: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ right: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/10 text-white active:bg-sky-500/35"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move Camera Backward"
                    onPointerDown={() => onPhotoMoveInput({ forward: -1 })}
                    onPointerUp={() => onPhotoMoveInput({ forward: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ forward: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ forward: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/10 text-white active:bg-sky-500/35"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move Camera Right"
                    onPointerDown={() => onPhotoMoveInput({ right: 1 })}
                    onPointerUp={() => onPhotoMoveInput({ right: 0 })}
                    onPointerLeave={() => onPhotoMoveInput({ right: 0 })}
                    onPointerCancel={() => onPhotoMoveInput({ right: 0 })}
                    className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/10 text-white active:bg-sky-500/35"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Bottom Control Dock */}
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="gt5-panel gt5-carbon border border-white/15 px-2.5 py-2 sm:px-3.5 sm:py-2.5 shadow-2xl space-y-2">
              {/* Quick View Strip on Desktop / Tablet */}
              {!isDrivingCarMode && (
                <div className="hidden sm:flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <span className="font-mono-tabular text-[10px] font-bold tracking-wider text-slate-400 uppercase mr-1">
                      View
                    </span>
                    {PHOTO_VIEW_DEFS.map((v) => {
                      const active = photoState.viewMode === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => onSelectView(v.id)}
                          className={`border px-2.5 py-1 text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-white/14 bg-white/[0.04] text-slate-300 hover:border-white/35 hover:text-white'
                          }`}
                        >
                          {v.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">
                    FOV {Math.round(photoState.fovDeg)}° · {Math.round(photoState.rollDeg)}° tilt
                  </span>
                </div>
              )}

              {/* Primary Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Switch View Button (always accessible with 1 click or V key) */}
                  {!isDrivingCarMode && (
                    <button
                      type="button"
                      onClick={onCycleView}
                      data-testid="photo-cycle-view-btn"
                      title="Switch Camera View (V)"
                      className="inline-flex h-11 sm:h-10 items-center gap-1.5 border border-sky-400/55 bg-sky-500/15 px-3 font-display text-xs font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/25"
                    >
                      <Camera className="h-3.5 w-3.5 text-sky-400" />
                      <span>View: {activeViewDef.shortLabel}</span>
                      <span className="hidden md:inline font-mono-tabular text-[10px] text-sky-300/80">
                        (V)
                      </span>
                    </button>
                  )}

                  {/* Freeze / Move Car Toggle (in Racing mode so user can drive & reposition car) */}
                  {appMode === 'racing' && (
                    <button
                      type="button"
                      onClick={onToggleFreeze}
                      data-testid="photo-freeze-toggle-btn"
                      title="Toggle between Driving Car and Frozen Camera (F)"
                      className={`inline-flex h-11 sm:h-10 items-center gap-1.5 border px-3 font-display text-xs font-bold tracking-wider uppercase transition-colors ${
                        isDrivingCarMode
                          ? 'border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400'
                          : 'border-white/20 bg-white/[0.06] text-slate-100 hover:border-amber-400/60 hover:text-amber-200'
                      }`}
                    >
                      {isDrivingCarMode ? (
                        <>
                          <Lock className="h-3.5 w-3.5" />
                          <span>Freeze Car (F)</span>
                        </>
                      ) : (
                        <>
                          <Gamepad2 className="h-3.5 w-3.5 text-amber-400" />
                          <span>Move Car (F)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Right: Preview Gallery + Take Photo Shutter */}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => onOpenPreview()}
                    disabled={photos.length === 0}
                    data-testid="photo-open-preview-btn"
                    className="inline-flex h-11 sm:h-10 items-center gap-1.5 border border-white/20 bg-white/[0.06] px-3 font-display text-xs font-bold tracking-wider text-slate-100 uppercase hover:border-sky-400/60 disabled:opacity-40"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-sky-400" />
                    <span>Preview</span>
                    <span className="font-mono-tabular bg-black/55 px-1.5 py-0.5 text-[10px] text-sky-300">
                      {photos.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onTakePhoto}
                    data-testid="photo-shutter-btn"
                    className="inline-flex h-11 sm:h-10 items-center gap-2 bg-sky-500 px-4 sm:px-5 font-display text-xs sm:text-sm font-bold tracking-wider text-slate-950 uppercase shadow-lg transition-colors hover:bg-sky-400"
                  >
                    <Aperture className="h-4 w-4" />
                    <span>Take Photo</span>
                    {!isDrivingCarMode && (
                      <span className="hidden md:inline font-mono-tabular text-[10px] opacity-80">
                        (Enter)
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
