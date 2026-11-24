import { useCallback, useEffect, useRef, useState } from 'react';
import { CircuitViewport } from './components/CircuitViewport';
import { PauseModal } from './components/PauseModal';
import { TelemetryHud } from './components/TelemetryHud';
import { TitleScreen } from './components/TitleScreen';
import type {
  AppPhase,
  CircuitSceneController,
  TelemetrySnapshot,
  WeatherSettings,
} from './engine/CircuitSceneController';
import { MAP_REGISTRY } from './tracks/mapRegistry';
import type { CameraVantageId, LayoutPresetId, MapId } from './tracks/types';

function readInitialUrlParams(): {
  autostart: boolean;
  mapId: MapId;
} {
  if (typeof window === 'undefined') {
    return { autostart: false, mapId: 'coral_bay' };
  }
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const rawMap = params.get('map');
  const mapId: MapId = rawMap === 'frostpeak_pass' ? 'frostpeak_pass' : 'coral_bay';
  return { autostart, mapId };
}

export default function App() {
  const initial = readInitialUrlParams();
  const controllerRef = useRef<CircuitSceneController | null>(null);

  const [appPhase, setAppPhase] = useState<AppPhase>(initial.autostart ? 'playing' : 'title');
  const [mapId, setMapId] = useState<MapId>(initial.mapId);
  const [layoutPreset, setLayoutPreset] = useState<LayoutPresetId>('original');
  const [vantage, setVantage] = useState<CameraVantageId>('chase');
  const [editorActive, setEditorActive] = useState(false);
  const [muted, setMuted] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const initialDef = MAP_REGISTRY[initial.mapId];
  const [weather, setWeather] = useState<WeatherSettings>({
    solarDeg: initialDef.defaultSolarDeg,
    haze: initialDef.defaultHaze,
    wetness: initial.mapId === 'frostpeak_pass' ? 0.38 : 0.36,
    snowAccum: 0.65,
    waterChop: 0.45,
    waterClarity: 0.82,
  });

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    speedKmh: 0,
    gear: 1,
    rpm: 1200,
    lap: 1,
    lapTime: 0,
    bestLapTime: null,
    sectorId: 'S1',
    sectorName: initialDef.sectors[0].name,
    onRoad: true,
    inPitLane: false,
    trackLengthKm: initialDef.targetLengthKm,
    elevationDeltaM: initialDef.elevationDeltaM,
    isSoftwareGl: false,
    controlPoints: [],
  });

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = appPhase;
  }, [appPhase]);

  const handleStart = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setAppPhase('playing');
  }, []);

  const handleSelectMap = useCallback((nextMap: MapId) => {
    setMapId(nextMap);
    setLayoutPreset('original');
    const nextDef = MAP_REGISTRY[nextMap];
    setWeather((prev) => ({
      ...prev,
      solarDeg: nextDef.defaultSolarDeg,
      haze: nextDef.defaultHaze,
      wetness: nextMap === 'frostpeak_pass' ? 0.38 : 0.36,
    }));
  }, []);

  const handleUpdateWeather = useCallback((patch: Partial<WeatherSettings>) => {
    setWeather((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleResetCar = useCallback(() => {
    controllerRef.current?.resetCarToGrid();
  }, []);

  const handleNudgeWaypoint = useCallback(
    (index: number, dx: number, dy: number, dz: number) => {
      controllerRef.current?.nudgeWaypoint(index, dx, dy, dz);
    },
    []
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
        return;
      }

      if (appPhase === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        setAppPhase((prev) => (prev === 'playing' ? 'paused' : 'playing'));
        return;
      }

      if (appPhase !== 'playing') return;

      if (e.code === 'KeyM') {
        setMuted((prev) => !prev);
      } else if (e.code === 'KeyR') {
        controllerRef.current?.resetCarToGrid();
      } else if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyC') {
        setVantage('chase');
      } else if (e.code >= 'Digit1' && e.code <= 'Digit7') {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        const vList = MAP_REGISTRY[mapId].vantages;
        if (vList[idx]) setVantage(vList[idx].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appPhase, mapId, handleStart]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <CircuitViewport
        initialMapId={initial.mapId}
        controllerRef={controllerRef}
        onTelemetry={setTelemetry}
        appPhase={appPhase}
        mapId={mapId}
        layoutPreset={layoutPreset}
        vantage={vantage}
        editorActive={editorActive}
        muted={muted}
        weather={weather}
      />

      {appPhase === 'title' && (
        <TitleScreen
          selectedMap={mapId}
          onSelectMap={handleSelectMap}
          onStart={handleStart}
        />
      )}

      {appPhase === 'playing' && (
        <TelemetryHud
          mapId={mapId}
          layoutPreset={layoutPreset}
          vantage={vantage}
          editorActive={editorActive}
          muted={muted}
          dockCollapsed={dockCollapsed}
          weather={weather}
          telemetry={telemetry}
          onSelectMap={handleSelectMap}
          onSelectLayout={setLayoutPreset}
          onSelectVantage={setVantage}
          onToggleEditor={setEditorActive}
          onNudgeWaypoint={handleNudgeWaypoint}
          onUpdateWeather={handleUpdateWeather}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleDock={() => setDockCollapsed((c) => !c)}
          onResetCar={handleResetCar}
          onPause={() => setAppPhase('paused')}
        />
      )}

      {appPhase === 'paused' && (
        <PauseModal
          mapId={mapId}
          lap={telemetry.lap}
          bestLapTime={telemetry.bestLapTime}
          onResume={() => setAppPhase('playing')}
          onRestart={() => {
            handleResetCar();
            setAppPhase('playing');
          }}
          onReturnTitle={() => {
            handleResetCar();
            setAppPhase('title');
          }}
        />
      )}
    </div>
  );
}
