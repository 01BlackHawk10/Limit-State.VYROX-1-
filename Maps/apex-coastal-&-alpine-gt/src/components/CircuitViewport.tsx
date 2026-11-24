import { useEffect, useRef } from 'react';
import {
  CircuitSceneController,
  type AppPhase,
  type TelemetrySnapshot,
  type WeatherSettings,
} from '../engine/CircuitSceneController';
import type { CameraVantageId, LayoutPresetId, MapId } from '../tracks/types';

export interface CircuitViewportProps {
  initialMapId: MapId;
  controllerRef: React.MutableRefObject<CircuitSceneController | null>;
  onTelemetry: (snap: TelemetrySnapshot) => void;
  appPhase: AppPhase;
  mapId: MapId;
  layoutPreset: LayoutPresetId;
  vantage: CameraVantageId;
  editorActive: boolean;
  muted: boolean;
  weather: WeatherSettings;
}

export function CircuitViewport({
  initialMapId,
  controllerRef,
  onTelemetry,
  appPhase,
  mapId,
  layoutPreset,
  vantage,
  editorActive,
  muted,
  weather,
}: CircuitViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const telemetryCbRef = useRef(onTelemetry);
  telemetryCbRef.current = onTelemetry;

  // Mount WebGLRenderer & scene once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const ctrl = new CircuitSceneController(el, initialMapId, (snap) => {
      telemetryCbRef.current(snap);
    });
    controllerRef.current = ctrl;
    return () => {
      controllerRef.current = null;
      ctrl.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.setAppPhase(appPhase);
  }, [appPhase, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setMap(mapId);
  }, [mapId, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setLayoutPreset(layoutPreset);
  }, [layoutPreset, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setCameraVantage(vantage);
  }, [vantage, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setEditorActive(editorActive);
  }, [editorActive, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setMuted(muted);
  }, [muted, controllerRef]);

  useEffect(() => {
    controllerRef.current?.updateWeather(weather);
  }, [weather, controllerRef]);

  return (
    <div
      ref={mountRef}
      data-testid="circuit-canvas-mount"
      className="fixed inset-0 w-full h-full bg-[#060a12]"
    />
  );
}
