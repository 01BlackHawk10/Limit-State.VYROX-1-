import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Video,
  X,
} from 'lucide-react';
import { REPLAY_CAMERA_OPTIONS, type ReplayCameraMode, type ReplayUiState } from '../engine/replayManager';

interface ReplayOverlayProps {
  state: ReplayUiState;
  onTogglePlay: () => void;
  onSeekMs: (targetMs: number) => void;
  onStepFrames: (frameDelta: number) => void;
  onSpeedChange: (speed: number) => void;
  onCameraChange: (mode: ReplayCameraMode) => void;
  onCctvStationChange: (index: number) => void;
  onCaptureScreenshot: () => void;
  onExit: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

function formatReplayTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(safe / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export const ReplayOverlay: React.FC<ReplayOverlayProps> = ({
  state,
  onTogglePlay,
  onSeekMs,
  onStepFrames,
  onSpeedChange,
  onCameraChange,
  onCctvStationChange,
  onCaptureScreenshot,
  onExit,
}) => {
  const [uiHidden, setUiHidden] = useState(false);
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const progressFrac =
    state.durationMs > 0 ? Math.max(0, Math.min(1, state.currentTimeMs / state.durationMs)) : 0;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = scrubRef.current;
      if (!el || state.durationMs <= 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeekMs(Math.round(frac * state.durationMs));
    },
    [onSeekMs, state.durationMs],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
  };

  // Precompute SVG polyline paths for speed & throttle/brake telemetry trace
  const traceSvg = useMemo(() => {
    const pts = state.tracePoints;
    const w = 800;
    const h = 44;
    if (!pts || pts.length < 2) {
      return { w, h, speedPath: '', speedArea: '', brakeBars: [] as Array<{ x: number; w: number; h: number }> };
    }
    const speedCoords = pts.map((p) => {
      const x = p.tFrac * w;
      const y = h - 4 - p.speedNorm * (h - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const speedPath = `M ${speedCoords.join(' L ')}`;
    const speedArea = `${speedPath} L ${w},${h} L 0,${h} Z`;
    const barW = Math.max(2, w / pts.length);
    const brakeBars: Array<{ x: number; w: number; h: number }> = [];
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].brake > 0.12) {
        brakeBars.push({
          x: pts[i].tFrac * w - barW * 0.5,
          w: barW,
          h: Math.max(4, pts[i].brake * (h - 10)),
        });
      }
    }
    return { w, h, speedPath, speedArea, brakeBars };
  }, [state.tracePoints]);

  const activeStation =
    state.cctvStations[state.cctvStationIndex] ?? state.cctvStations[0] ?? null;

  const rpmPct =
    state.redlineRpm > 0 ? Math.max(0, Math.min(100, (state.rpm / state.redlineRpm) * 100)) : 0;

  if (uiHidden) {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 flex items-start justify-end p-4">
        <button
          type="button"
          onClick={() => setUiHidden(false)}
          className="pointer-events-auto gt5-panel flex items-center gap-1.5 border border-white/20 px-3 py-1.5 text-[11px] font-bold tracking-wider text-white uppercase hover:border-sky-400 transition-colors cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5 text-sky-400" />
          Show Replay HUD
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* Top Broadcast Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto gt5-panel border border-white/15 px-3.5 py-2.5 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <Film className="h-4 w-4 text-sky-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-black tracking-[0.14em] text-white uppercase">
                  Race Replay Broadcast
                </span>
                <span className="border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-sky-300 uppercase">
                  {state.playing ? 'PLAY' : 'PAUSED'} · {state.playbackSpeed}x
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-300">
                {state.carName} <span className="text-slate-500">·</span> {state.mapName}{' '}
                <span className="text-slate-500">·</span>{' '}
                <span className="uppercase text-slate-400">{state.mode.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Frame Telemetry Pill-Free Strip + Actions */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="gt5-panel border border-white/15 px-3 py-2 flex items-center gap-3.5 font-mono-tabular text-xs">
            <div>
              <div className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Speed</div>
              <div className="text-sm font-black text-white">
                {state.speedKmh} <span className="text-[10px] font-normal text-slate-400">km/h</span>
              </div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <div className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Gear</div>
              <div className="text-sm font-black text-sky-300">
                {state.gear === -1 ? 'R' : state.gear === 0 ? 'N' : `G${state.gear}`}
              </div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="w-20">
              <div className="flex items-center justify-between text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                <span>RPM</span>
                <span className="text-slate-200">{state.rpm}</span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full ${rpmPct > 90 ? 'bg-rose-400' : 'bg-sky-400'}`}
                  style={{ width: `${rpmPct}%` }}
                />
              </div>
            </div>
            <div className="hidden sm:block h-6 w-px bg-white/10" />
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-12">
                <div className="text-[9px] text-emerald-300 uppercase">THR</div>
                <div className="mt-1 h-1.5 bg-white/10">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${Math.round(state.throttle * 100)}%` }}
                  />
                </div>
              </div>
              <div className="w-12">
                <div className="text-[9px] text-rose-300 uppercase">BRK</div>
                <div className="mt-1 h-1.5 bg-white/10">
                  <div
                    className="h-full bg-rose-400"
                    style={{ width: `${Math.round(state.brake * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="hidden md:block h-6 w-px bg-white/10" />
            <div className="hidden md:block">
              <div className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                Lat G / Slip
              </div>
              <div className="text-xs font-bold text-amber-300">
                {state.latG.toFixed(2)}G · {state.driftAngleDeg}°
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCaptureScreenshot}
            className="gt5-panel flex items-center gap-1.5 border border-white/18 px-3 py-2.5 text-[11px] font-bold tracking-wider text-slate-100 uppercase hover:border-sky-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5 text-sky-400" />
            Snapshot
          </button>

          <button
            type="button"
            onClick={() => setUiHidden(true)}
            className="gt5-panel flex items-center gap-1.5 border border-white/18 px-3 py-2.5 text-[11px] font-bold tracking-wider text-slate-100 uppercase hover:border-sky-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <EyeOff className="h-3.5 w-3.5 text-slate-300" />
            Hide HUD
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 border border-rose-400/50 bg-rose-500/20 px-3.5 py-2.5 text-[11px] font-bold tracking-wider text-white uppercase hover:bg-rose-500/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Exit Replay
          </button>
        </div>
      </div>

      {/* Bottom Interactive Telemetry Scrubber + Camera Switcher */}
      <div className="pointer-events-auto gt5-panel border border-white/15 p-3 sm:p-4 shadow-2xl space-y-3">
        {/* Camera Angle Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <Video className="h-3.5 w-3.5 text-sky-400" /> Camera
            </span>
            {REPLAY_CAMERA_OPTIONS.map((cam) => {
              const active = state.cameraMode === cam.id;
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => onCameraChange(cam.id)}
                  className={`border px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-sky-400 bg-sky-500/25 text-white'
                      : 'border-white/12 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <span className="hidden sm:inline">{cam.label}</span>
                  <span className="sm:hidden">{cam.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {(state.cameraMode === 'cctv_auto' || state.cameraMode === 'cctv_manual') &&
            state.cctvStations.length > 0 && (
              <div className="flex items-center gap-1.5 border border-amber-400/35 bg-amber-500/10 px-2 py-1">
                <button
                  type="button"
                  onClick={() => onCctvStationChange(state.cctvStationIndex - 1)}
                  className="p-0.5 text-amber-200 hover:text-white cursor-pointer"
                  aria-label="Previous CCTV Station"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono-tabular text-[10px] font-bold tracking-wider text-amber-200 uppercase whitespace-nowrap">
                  {activeStation ? `${activeStation.code} · ${activeStation.label}` : `CAM ${state.cctvStationIndex + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => onCctvStationChange(state.cctvStationIndex + 1)}
                  className="p-0.5 text-amber-200 hover:text-white cursor-pointer"
                  aria-label="Next CCTV Station"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

          {state.cameraMode === 'orbit' && (
            <div className="text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
              Drag canvas to orbit · Scroll to zoom
            </div>
          )}
        </div>

        {/* Interactive Speed & Braking Trace Scrubber */}
        <div
          ref={scrubRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative h-12 w-full border border-white/15 bg-black/70 cursor-ew-resize overflow-hidden touch-none"
          role="slider"
          aria-label="Replay Timeline Scrubber"
          aria-valuemin={0}
          aria-valuemax={state.durationMs}
          aria-valuenow={state.currentTimeMs}
        >
          <svg
            viewBox={`0 0 ${traceSvg.w} ${traceSvg.h}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full pointer-events-none"
          >
            <defs>
              <linearGradient id="replaySpeedFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
              </linearGradient>
            </defs>
            {traceSvg.brakeBars.map((bar, idx) => (
              <rect
                key={idx}
                x={bar.x}
                y={traceSvg.h - bar.h}
                width={bar.w}
                height={bar.h}
                fill="rgba(244, 63, 94, 0.35)"
              />
            ))}
            {traceSvg.speedArea && <path d={traceSvg.speedArea} fill="url(#replaySpeedFill)" />}
            {traceSvg.speedPath && (
              <path
                d={traceSvg.speedPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.8"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Played Region Tint */}
          <div
            className="absolute inset-y-0 left-0 bg-sky-400/12 border-r-2 border-sky-300 pointer-events-none"
            style={{ width: `${progressFrac * 100}%` }}
          />
          <div className="absolute top-1 left-2 text-[9px] font-bold tracking-wider text-slate-400 uppercase pointer-events-none">
            Speed Trace (Blue) · Braking Zones (Red)
          </div>
          <div className="absolute top-1 right-2 font-mono-tabular text-[10px] font-bold text-slate-200 pointer-events-none">
            LAP {state.lap}
          </div>
        </div>

        {/* Transport Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSeekMs(0)}
              className="border border-white/15 bg-white/[0.04] p-2 text-slate-200 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Jump to Start"
              aria-label="Jump to Start"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSeekMs(state.currentTimeMs - 5000)}
              className="flex items-center gap-1 border border-white/15 bg-white/[0.04] px-2.5 py-2 font-mono-tabular text-[11px] font-bold text-slate-200 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Rewind 5 seconds"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 5s
            </button>
            <button
              type="button"
              onClick={() => onStepFrames(-1)}
              className="border border-white/15 bg-white/[0.04] px-2 py-2 font-mono-tabular text-[11px] font-bold text-slate-300 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Step Back 1 Frame"
            >
              -1F
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="flex items-center gap-1.5 border border-sky-400 bg-sky-500/25 px-4 py-2 text-xs font-black tracking-wider text-white uppercase hover:bg-sky-500/40 transition-colors cursor-pointer"
            >
              {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {state.playing ? 'Pause' : 'Play'}
            </button>

            <button
              type="button"
              onClick={() => onStepFrames(1)}
              className="border border-white/15 bg-white/[0.04] px-2 py-2 font-mono-tabular text-[11px] font-bold text-slate-300 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Step Forward 1 Frame"
            >
              +1F
            </button>
            <button
              type="button"
              onClick={() => onSeekMs(state.currentTimeMs + 5000)}
              className="flex items-center gap-1 border border-white/15 bg-white/[0.04] px-2.5 py-2 font-mono-tabular text-[11px] font-bold text-slate-200 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Forward 5 seconds"
            >
              5s <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSeekMs(state.durationMs)}
              className="border border-white/15 bg-white/[0.04] p-2 text-slate-200 hover:border-sky-400 hover:text-white transition-colors cursor-pointer"
              title="Jump to End"
              aria-label="Jump to End"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="font-mono-tabular text-xs font-bold text-white">
              {formatReplayTime(state.currentTimeMs)}{' '}
              <span className="text-slate-500">/</span>{' '}
              <span className="text-slate-400">{formatReplayTime(state.durationMs)}</span>
            </div>

            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((spd) => {
                const active = Math.abs(state.playbackSpeed - spd) < 0.01;
                return (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onSpeedChange(spd)}
                    className={`border px-2 py-1 font-mono-tabular text-[11px] font-bold transition-colors cursor-pointer ${
                      active
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-white/12 bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
