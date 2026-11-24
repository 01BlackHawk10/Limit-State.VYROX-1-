import {
  ArrowDownToLine,
  ArrowLeft,
  Box,
  Car,
  Check,
  Compass,
  Copy,
  Crosshair,
  Droplets,
  Eye,
  FilePlus2,
  FolderTree,
  HelpCircle,
  Layers,
  Lock,
  Maximize2,
  Mountain,
  MousePointer2,
  Move,
  Navigation,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  PlusSquare,
  Redo2,
  Rotate3d,
  RotateCw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Spline,
  Sun,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BUILDER_PROP_CATALOG,
  MAP_TEMPLATES,
  STUDIO_PROP_MATERIAL_DEFS,
  TERRAIN_MATERIAL_DEFS,
  createBlueprintFromTemplate,
} from '../engine/customMapBuilder';
import type { CarModelId } from '../engine/SceneController';
import { groundHeightAt } from '../Maps/Aurelia Ridge/terrainField';
import type {
  AuthUser,
  BaseplateTheme,
  BuilderPropInstance,
  BuilderPropType,
  CustomMapBlueprint,
  HazePresetId,
  KerbTheme,
  MapDifficultyTag,
  MapTemplateId,
  MapTypeTag,
  RoadSurfaceTheme,
  StudioMaterialId,
  StudioToolMode,
  TerrainMaterialId,
  WeatherPresetId,
} from '../shared/socialTypes';

export type StudioTab = 'spline' | 'terrain' | 'props' | 'env' | 'publish';
type PropCategoryFilter = 'all' | 'stunt' | 'barrier' | 'structure' | 'scenery';
export type StudioRebuildMode = 'none' | 'props' | 'terrain_look' | 'terrain_geo' | 'full';

export interface StudioTerrainToolConfig {
  mode: 'material' | 'sculpt';
  sculptOp: 'raise' | 'lower' | 'flatten' | 'smooth';
  materialId: TerrainMaterialId;
  colorHex: string;
  radius: number;
  strength: number;
}

interface MapBuilderStudioProps {
  blueprint: CustomMapBlueprint;
  user: AuthUser | null;
  studioToolMode: StudioToolMode;
  selectedPropId: string | null;
  selectedNodeIdx?: number;
  canUndo: boolean;
  canRedo: boolean;
  terrainToolConfig: StudioTerrainToolConfig;
  activePropType: BuilderPropType;
  autoAlignTrack: boolean;
  statusMessage?: string | null;
  onChangeStudioToolMode: (mode: StudioToolMode) => void;
  onSelectProp: (propId: string | null) => void;
  onFocusProp: (propId: string) => void;
  onSelectNode?: (ptIndex: number) => void;
  onFocusNode?: (ptIndex: number) => void;
  onSnapPropToRoad?: (propId: string) => void;
  onGetCameraTarget: () => { x: number; y: number; z: number };
  onSetTransformConfig: (cfg: {
    space: 'world' | 'local';
    snapMove: number;
    snapRotateDeg: number;
    snapScale: number;
    brushRadius?: number;
  }) => void;
  onChangeTerrainToolConfig: (cfg: StudioTerrainToolConfig) => void;
  onChangeActivePropType: (propType: BuilderPropType) => void;
  onChangeAutoAlignTrack: (align: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onChangeBlueprint: (
    next: CustomMapBlueprint,
    rebuildMode?: StudioRebuildMode,
    selectedPropId?: string | null,
    recordUndo?: boolean,
  ) => void;
  onSetCameraMode: (mode: 'overview' | 'top_down') => void;
  selectedCarId: CarModelId;
  availableCars: Array<{ id: CarModelId; name: string; category: string }>;
  buildSlots: CustomMapBlueprint[];
  hasUnsavedChanges: boolean;
  onSelectCar: (carId: CarModelId) => void;
  onOpenCarSelect?: () => void;
  onSwitchSlot: (slotId: string) => void;
  onCreateNewSlot: (templateId: MapTemplateId, customTitle?: string) => void;
  onDuplicateSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => Promise<void>;
  onSaveDraft: (bp: CustomMapBlueprint) => Promise<void>;
  onPublishMap: (bp: CustomMapBlueprint) => Promise<void>;
  onTestDrive: (bp: CustomMapBlueprint) => void;
  onExitStudio: () => void;
  onRequireAuth: () => void;
  onStudioModalStateChange?: (frozen: boolean) => void;
}

const WEATHER_OPTIONS: Array<{ id: WeatherPresetId; label: string; solar: number; haze: HazePresetId }> = [
  { id: 'dry', label: 'Dry Clear', solar: 30, haze: 'golden' },
  { id: 'overcast', label: 'Overcast', solar: 58, haze: 'low' },
  { id: 'rain', label: 'Rain Storm', solar: 145, haze: 'heavy' },
  { id: 'sunset_storm', label: 'Sunset Storm', solar: 176, haze: 'golden' },
  { id: 'deep_morning_mist', label: 'Deep Morning Mist', solar: 11, haze: 'heavy' },
];

const BASEPLATE_OPTIONS: Array<{ id: BaseplateTheme; label: string }> = [
  { id: 'studio_grid', label: 'Studio Grid' },
  { id: 'asphalt_pad', label: 'Asphalt Pad' },
  { id: 'grassland', label: 'Grassland' },
  { id: 'desert_sand', label: 'Desert Sand' },
  { id: 'alpine_slate', label: 'Alpine Slate' },
];

const ROAD_SURFACE_OPTIONS: Array<{ id: RoadSurfaceTheme; label: string }> = [
  { id: 'asphalt', label: 'Tarmac' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'dirt', label: 'Dirt Rally' },
  { id: 'snow_tarmac', label: 'Snow Tarmac' },
  { id: 'neon_grid', label: 'Neon Grid' },
];

const KERB_OPTIONS: Array<{ id: KerbTheme; label: string }> = [
  { id: 'red_white', label: 'Red / White' },
  { id: 'blue_white', label: 'Blue / White' },
  { id: 'yellow_black', label: 'Yellow / Black' },
  { id: 'monochrome', label: 'Mono Slate' },
  { id: 'none', label: 'No Kerbs' },
];

const PROP_ACCENT_SWATCHES = [
  { hex: '', label: 'Auto' },
  { hex: '#38bdf8', label: 'Sky' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#a855f7', label: 'Violet' },
  { hex: '#f8fafc', label: 'White' },
  { hex: '#1e293b', label: 'Slate' },
];

export function MapBuilderStudio({
  blueprint,
  user,
  studioToolMode,
  selectedPropId,
  selectedNodeIdx,
  canUndo,
  canRedo,
  terrainToolConfig,
  activePropType,
  autoAlignTrack,
  statusMessage,
  onChangeStudioToolMode,
  onSelectProp,
  onFocusProp,
  onSelectNode,
  onFocusNode,
  onSnapPropToRoad,
  onGetCameraTarget,
  onSetTransformConfig,
  onChangeTerrainToolConfig,
  onChangeActivePropType,
  onChangeAutoAlignTrack,
  onUndo,
  onRedo,
  onChangeBlueprint,
  onSetCameraMode,
  selectedCarId,
  availableCars,
  buildSlots,
  hasUnsavedChanges,
  onSelectCar,
  onOpenCarSelect,
  onSwitchSlot,
  onCreateNewSlot,
  onDuplicateSlot,
  onDeleteSlot,
  onSaveDraft,
  onPublishMap,
  onTestDrive,
  onExitStudio,
  onRequireAuth,
  onStudioModalStateChange,
}: MapBuilderStudioProps) {
  const [studioTab, setStudioTab] = useState<StudioTab>('spline');
  const [internalSelectedPtIdx, setInternalSelectedPtIdx] = useState<number>(0);
  const selectedPtIdx = Math.max(
    0,
    Math.min(
      selectedNodeIdx ?? internalSelectedPtIdx,
      Math.max(0, blueprint.controlPoints.length - 1),
    ),
  );
  const setSelectedPtIdx = (updater: number | ((prev: number) => number)) => {
    const raw = typeof updater === 'function' ? updater(selectedPtIdx) : updater;
    const clamped = Math.max(0, Math.min(raw, Math.max(0, blueprint.controlPoints.length - 1)));
    setInternalSelectedPtIdx(clamped);
    onSelectNode?.(clamped);
  };
  const [draggingPtIdx, setDraggingPtIdx] = useState<number | null>(null);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState<boolean>(false);
  const [slotsModalOpen, setSlotsModalOpen] = useState<boolean>(false);
  const [newSlotTemplateId, setNewSlotTemplateId] = useState<MapTemplateId>('blank_loop');
  const [newSlotTitle, setNewSlotTitle] = useState<string>('');
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState<string | null>(null);
  const [renamingSlotId, setRenamingSlotId] = useState<string | null>(null);
  const [renameSlotValue, setRenameSlotValue] = useState<string>('');
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState<boolean>(false);
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth >= 1024,
  );
  const [explorerFilter, setExplorerFilter] = useState<string>('');
  const [propSearch, setPropSearch] = useState<string>('');
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Transform snap & space configuration (Roblox Studio style)
  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('world');
  const [snapMove, setSnapMove] = useState<number>(1);
  const [snapRotateDeg, setSnapRotateDeg] = useState<number>(15);
  const [snapScale] = useState<number>(0.1);

  // Props studio state
  const [propCategoryFilter, setPropCategoryFilter] = useState<PropCategoryFilter>('all');

  // Publish & Save state
  const [saving, setSaving] = useState(false);
  const [localBanner, setLocalBanner] = useState<string | null>(null);
  const effectiveBanner = localBanner ?? statusMessage ?? null;

  const triggerExplicitSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveDraft(blueprint);
      setLocalBanner(`Saved slot "${blueprint.title}"`);
    } catch (err) {
      setLocalBanner(err instanceof Error ? err.message : 'Failed to save build slot.');
    } finally {
      setSaving(false);
    }
  };

  // Freeze 3D background whenever Template Gallery, Build Slots, or Publish dialog is active
  useEffect(() => {
    const frozen = templateGalleryOpen || slotsModalOpen || studioTab === 'publish';
    onStudioModalStateChange?.(frozen);
    return () => onStudioModalStateChange?.(false);
  }, [templateGalleryOpen, slotsModalOpen, studioTab, onStudioModalStateChange]);

  // Sync TransformControls config & brush radius to SceneController
  useEffect(() => {
    onSetTransformConfig({
      space: transformSpace,
      snapMove,
      snapRotateDeg,
      snapScale,
      brushRadius: terrainToolConfig.radius,
    });
  }, [transformSpace, snapMove, snapRotateDeg, snapScale, terrainToolConfig.radius, onSetTransformConfig]);

  // Helper actions on selected prop
  const selectedProp = useMemo(
    () => blueprint.placedProps.find((p) => p.id === selectedPropId) ?? null,
    [blueprint.placedProps, selectedPropId],
  );

  const duplicateSelectedProp = () => {
    if (!selectedProp) return;
    const dup: BuilderPropInstance = {
      ...selectedProp,
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: selectedProp.name ? `${selectedProp.name} Copy` : undefined,
      x: Number((selectedProp.x + 6).toFixed(2)),
      z: Number((selectedProp.z + 6).toFixed(2)),
      locked: false,
    };
    onChangeBlueprint(
      { ...blueprint, placedProps: [...blueprint.placedProps, dup], updatedAt: Date.now() },
      'props',
      dup.id,
      true,
    );
    setLocalBanner(`Duplicated ${dup.type.replace('_', ' ')}`);
  };

  const deleteSelectedProp = () => {
    if (!selectedProp || selectedProp.locked) return;
    const nextProps = blueprint.placedProps.filter((p) => p.id !== selectedProp.id);
    onChangeBlueprint(
      { ...blueprint, placedProps: nextProps, updatedAt: Date.now() },
      'props',
      null,
      true,
    );
    setLocalBanner(`Deleted ${selectedProp.type.replace('_', ' ')}`);
  };

  const dropSelectedPropToGround = () => {
    if (!selectedProp || selectedProp.locked) return;
    const nextY = Number(groundHeightAt(selectedProp.x, selectedProp.z).toFixed(2));
    updateSelectedProp({ y: nextY });
    setLocalBanner(`Snapped ${selectedProp.type.replace('_', ' ')} Y to ${nextY}m`);
  };

  const spawnPropAtCameraTarget = (propType: BuilderPropType) => {
    const tgt = onGetCameraTarget();
    let rotY = 0;
    if (autoAlignTrack && blueprint.controlPoints.length >= 2) {
      let bestDist = Infinity;
      const pts = blueprint.controlPoints;
      const segCount = blueprint.closedLoop ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lenSq = Math.max(1e-4, dx * dx + dz * dz);
        const t = Math.max(0, Math.min(1, ((tgt.x - a.x) * dx + (tgt.z - a.z) * dz) / lenSq));
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const d = Math.hypot(tgt.x - px, tgt.z - pz);
        if (d < bestDist) {
          bestDist = d;
          rotY = Math.atan2(dx, dz);
        }
      }
    }
    const prop: BuilderPropInstance = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: propType,
      x: tgt.x,
      y: tgt.y,
      z: tgt.z,
      rotY: Number(rotY.toFixed(3)),
      scale: 1,
      canCollide: true,
      castShadow: true,
    };
    onChangeBlueprint(
      { ...blueprint, placedProps: [...blueprint.placedProps, prop], updatedAt: Date.now() },
      'props',
      prop.id,
      true,
    );
    if (studioToolMode === 'select' || studioToolMode === 'place' || studioToolMode === 'terrain') {
      onChangeStudioToolMode('move');
    }
    setLocalBanner(`Spawned ${propType.replace('_', ' ')} at (${Math.round(tgt.x)}, ${Math.round(tgt.z)})`);
  };

  // Studio Keyboard Shortcuts (Ctrl+S save, 1-6, F focus prop or spline node, Ctrl+Z/Y, Ctrl+D, Del)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!slotsModalOpen && document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void triggerExplicitSave();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedProp();
        return;
      }
      if (e.key === '1') {
        onChangeStudioToolMode('select');
      } else if (e.key === '2') {
        onChangeStudioToolMode('move');
      } else if (e.key === '3') {
        onChangeStudioToolMode('scale');
      } else if (e.key === '4') {
        onChangeStudioToolMode('rotate');
      } else if (e.key === '5') {
        onChangeStudioToolMode('place');
        setStudioTab('props');
      } else if (e.key === '6') {
        onChangeStudioToolMode('terrain');
        setStudioTab('terrain');
      } else if (e.key.toLowerCase() === 'f') {
        if (selectedPropId) {
          e.preventDefault();
          onFocusProp(selectedPropId);
        } else if (blueprint.controlPoints[selectedPtIdx]) {
          e.preventDefault();
          onFocusNode?.(selectedPtIdx);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedProp && !selectedProp.locked) {
          e.preventDefault();
          deleteSelectedProp();
        }
      } else if (e.key === 'Escape') {
        onSelectProp(null);
        setShortcutsHelpOpen(false);
        setSlotsModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // 2D SVG Spline Preview Curve + Flow Direction Chevrons
  const { svgSplinePath, svgDirectionMarkers } = useMemo(() => {
    if (blueprint.controlPoints.length < 2) {
      return { svgSplinePath: '', svgDirectionMarkers: [] as Array<{ x: number; z: number; angleDeg: number }> };
    }
    const vecs = blueprint.controlPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(
      vecs,
      blueprint.closedLoop,
      'catmullrom',
      blueprint.splineTension,
    );
    const steps = Math.max(60, vecs.length * 14);
    const cmds: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const pt = curve.getPoint(i / steps);
      cmds.push(`${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.z.toFixed(1)}`);
    }
    if (blueprint.closedLoop) cmds.push('Z');

    const arrows: Array<{ x: number; z: number; angleDeg: number }> = [];
    const arrowCount = 6;
    for (let i = 0; i < arrowCount; i++) {
      const t = (i + 0.5) / arrowCount;
      const pt = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const angleDeg = (Math.atan2(tan.z, tan.x) * 180) / Math.PI;
      arrows.push({ x: pt.x, z: pt.z, angleDeg });
    }

    return { svgSplinePath: cmds.join(' '), svgDirectionMarkers: arrows };
  }, [blueprint.controlPoints, blueprint.closedLoop, blueprint.splineTension]);

  const autoSmoothSpline = () => {
    const pts = blueprint.controlPoints;
    if (pts.length < 4) return;
    const n = pts.length;
    const nextPts = pts.map((pt, i) => {
      if (!blueprint.closedLoop && (i === 0 || i === n - 1)) return pt;
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      return {
        ...pt,
        x: Math.round(prev.x * 0.22 + pt.x * 0.56 + next.x * 0.22),
        y: Number((prev.y * 0.22 + pt.y * 0.56 + next.y * 0.22).toFixed(1)),
        z: Math.round(prev.z * 0.22 + pt.z * 0.56 + next.z * 0.22),
      };
    });
    onChangeBlueprint(
      { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
      'full',
      selectedPropId,
      true,
    );
    setLocalBanner('Smoothed spline curves for cleaner racing lines.');
  };

  const autoBankCorners = () => {
    const pts = blueprint.controlPoints;
    if (pts.length < 3) return;
    const n = pts.length;
    const nextPts = pts.map((pt, i) => {
      if (!blueprint.closedLoop && (i === 0 || i === n - 1)) return { ...pt, bankDeg: 0 };
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const ax = pt.x - prev.x;
      const az = pt.z - prev.z;
      const bx = next.x - pt.x;
      const bz = next.z - pt.z;
      const lenA = Math.max(1, Math.hypot(ax, az));
      const lenB = Math.max(1, Math.hypot(bx, bz));
      const cross = (ax * bz - az * bx) / (lenA * lenB);
      const bankDeg = Math.max(-14, Math.min(14, Math.round(cross * 18)));
      return { ...pt, bankDeg };
    });
    onChangeBlueprint(
      { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
      'full',
      selectedPropId,
      true,
    );
    setLocalBanner('Auto-banked track corners based on turn angle.');
  };

  const levelSplineElevation = () => {
    const targetY = selectedPoint?.y ?? 20;
    const nextPts = blueprint.controlPoints.map((pt) => ({ ...pt, y: targetY }));
    onChangeBlueprint(
      { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
      'full',
      selectedPropId,
      true,
    );
    setLocalBanner(`Leveled all spline nodes to ${targetY}m.`);
  };

  const alignTerrainToRoad = () => {
    if (blueprint.controlPoints.length < 2) return;
    const vecs = blueprint.controlPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(
      vecs,
      blueprint.closedLoop,
      'catmullrom',
      blueprint.splineTension,
    );
    const stampCount = 28;
    const radius = Math.max(20, Math.round(blueprint.roadWidth * 1.45));
    const stamps = [];
    const stampBatch = Date.now();
    for (let i = 0; i < stampCount; i++) {
      const t = blueprint.closedLoop ? i / stampCount : i / (stampCount - 1);
      const pt = curve.getPoint(t);
      stamps.push({
        id: `road_align_${stampBatch}_${i}`,
        x: Number(pt.x.toFixed(1)),
        z: Number(pt.z.toFixed(1)),
        radius,
        deltaY: 0,
        mode: 'flatten' as const,
        targetY: Number((pt.y - 0.12).toFixed(2)),
      });
    }
    onChangeBlueprint(
      {
        ...blueprint,
        terrainStamps: [...blueprint.terrainStamps, ...stamps],
        updatedAt: Date.now(),
      },
      'terrain_geo',
      selectedPropId,
      true,
    );
    setLocalBanner(`Aligned terrain bed beneath ${stampCount} road sections.`);
  };

  const toWorldFromSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const nx = (clientX - rect.left) / Math.max(1, rect.width);
    const nz = (clientY - rect.top) / Math.max(1, rect.height);
    let x = Math.round(Math.max(-610, Math.min(610, -640 + nx * 1280)));
    let z = Math.round(Math.max(-610, Math.min(610, -640 + nz * 1280)));
    if (snapToGrid) {
      x = Math.round(x / 10) * 10;
      z = Math.round(z / 10) * 10;
    }
    return { x, z };
  };

  const filteredPropCatalog = useMemo(() => {
    const q = propSearch.trim().toLowerCase();
    return BUILDER_PROP_CATALOG.filter((item) => {
      if (propCategoryFilter !== 'all' && item.category !== propCategoryFilter) return false;
      if (q && !item.label.toLowerCase().includes(q) && !item.desc.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [propCategoryFilter, propSearch]);

  const filteredExplorerProps = useMemo(() => {
    const q = explorerFilter.trim().toLowerCase();
    if (!q) return blueprint.placedProps;
    return blueprint.placedProps.filter(
      (p) =>
        p.type.toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [blueprint.placedProps, explorerFilter]);

  const selectedPoint = blueprint.controlPoints[selectedPtIdx] ?? blueprint.controlPoints[0];

  const updateSelectedPoint = (patch: Partial<{ x: number; y: number; z: number; bankDeg: number }>) => {
    const nextPts = blueprint.controlPoints.map((pt, i) =>
      i === selectedPtIdx ? { ...pt, ...patch } : pt,
    );
    onChangeBlueprint(
      { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
      'none',
      selectedPropId,
      false,
    );
  };

  const updateSelectedProp = (patch: Partial<BuilderPropInstance>, recordUndo = true) => {
    if (!selectedPropId) return;
    const nextProps = blueprint.placedProps.map((p) =>
      p.id === selectedPropId ? { ...p, ...patch } : p,
    );
    onChangeBlueprint(
      { ...blueprint, placedProps: nextProps, updatedAt: Date.now() },
      'props',
      selectedPropId,
      recordUndo,
    );
  };

  const degFromRad = (rad: number | undefined) => Math.round(((rad ?? 0) * 180) / Math.PI);
  const radFromDeg = (deg: number) => Number(((deg * Math.PI) / 180).toFixed(3));

  const TOOL_BUTTONS: Array<{
    id: StudioToolMode;
    label: string;
    shortcut: string;
    icon: typeof MousePointer2;
  }> = [
    { id: 'select', label: 'Select', shortcut: '1', icon: MousePointer2 },
    { id: 'move', label: 'Move', shortcut: '2', icon: Move },
    { id: 'scale', label: 'Scale', shortcut: '3', icon: Maximize2 },
    { id: 'rotate', label: 'Rotate', shortcut: '4', icon: Rotate3d },
    { id: 'place', label: 'Place', shortcut: '5', icon: PlusSquare },
    { id: 'terrain', label: 'Terrain', shortcut: '6', icon: Paintbrush },
  ];

  const paintStampCount = blueprint.terrainMaterialStamps?.length ?? 0;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-2 sm:p-3 overflow-hidden"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* ── TOP ROBLOX STUDIO RIBBON ── */}
      <header className="pointer-events-auto gt5-panel flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-between gap-1.5 sm:gap-2 border border-white/15 bg-[#090d14]/95 px-2.5 py-2 sm:px-3 shrink-0">
        {/* Left: Navigation, Build Slots, Explicit Save & Map Summary */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar md:flex-wrap">
          <button
            type="button"
            onClick={onExitStudio}
            className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-2.5 py-1.5 font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Hangar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setConfirmDeleteSlotId(null);
              setRenamingSlotId(null);
              setSlotsModalOpen(true);
            }}
            title="Manage & Switch Build Slots"
            className="inline-flex items-center gap-1.5 border border-amber-400/50 bg-amber-500/12 px-2.5 py-1.5 font-display text-[11px] font-bold tracking-wider text-amber-200 uppercase hover:bg-amber-500/22 whitespace-nowrap shrink-0"
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span>Slots ({Math.max(1, buildSlots.length)})</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void triggerExplicitSave();
            }}
            title="Save Current Build Slot (Ctrl+S)"
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 font-display text-[11px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
              saving
                ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                : hasUnsavedChanges
                ? 'border-sky-400 bg-sky-500/25 text-white hover:bg-sky-500/35'
                : 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/22'
            }`}
          >
            {hasUnsavedChanges || saving ? (
              <Save className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{saving ? 'Saving...' : hasUnsavedChanges ? 'Save*' : 'Saved'}</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="max-w-[180px] truncate font-display text-xs font-bold tracking-wider text-white uppercase sm:text-sm">
                {blueprint.title}
              </span>
            </div>
            <div className="font-mono-tabular text-[10px] text-slate-400 whitespace-nowrap">
              {blueprint.controlPoints.length} Nodes · {blueprint.terrainStamps.length} Sculpt · {paintStampCount} Paint · {blueprint.placedProps.length} Props
            </div>
          </div>
        </div>

        {/* Center: Transform & Editor Tool Ribbon */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border border-white/12 bg-black/55 p-1 md:flex-wrap">
          {TOOL_BUTTONS.map((tool) => {
            const Icon = tool.icon;
            const active = studioToolMode === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  onChangeStudioToolMode(tool.id);
                  if (tool.id === 'terrain') setStudioTab('terrain');
                  else if (tool.id === 'place') setStudioTab('props');
                }}
                title={`${tool.label} (${tool.shortcut})`}
                className={`inline-flex items-center gap-1 px-2 py-1 font-display text-[10px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{tool.label}</span>
                <span className={`font-mono-tabular text-[9px] ${active ? 'text-slate-900' : 'text-slate-500'}`}>
                  {tool.shortcut}
                </span>
              </button>
            );
          })}

          <span className="mx-1 h-4 w-px bg-white/15" />

          {/* World / Local Space */}
          <button
            type="button"
            onClick={() => setTransformSpace((s) => (s === 'world' ? 'local' : 'world'))}
            className={`border px-2 py-1 font-mono-tabular text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${
              transformSpace === 'local'
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-white/15 bg-white/5 text-slate-300'
            }`}
            title="Toggle World / Local Gizmo Space"
          >
            {transformSpace}
          </button>

          {/* Move Snap */}
          <select
            value={snapMove}
            onChange={(e) => setSnapMove(Number(e.target.value))}
            title="Move Grid Increment"
            className="border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[10px] text-sky-200"
          >
            <option value={0}>Move: Free</option>
            <option value={0.5}>Move: 0.5m</option>
            <option value={1}>Move: 1m</option>
            <option value={2}>Move: 2m</option>
            <option value={5}>Move: 5m</option>
            <option value={10}>Move: 10m</option>
          </select>

          {/* Rotate Snap */}
          <select
            value={snapRotateDeg}
            onChange={(e) => setSnapRotateDeg(Number(e.target.value))}
            title="Rotate Angle Increment"
            className="border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[10px] text-amber-200"
          >
            <option value={0}>Rot: Free</option>
            <option value={5}>Rot: 5°</option>
            <option value={15}>Rot: 15°</option>
            <option value={45}>Rot: 45°</option>
            <option value={90}>Rot: 90°</option>
          </select>

          <span className="mx-1 h-4 w-px bg-white/15" />

          {/* Undo / Redo */}
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          {selectedProp && (
            <>
              <span className="mx-1 h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={duplicateSelectedProp}
                title="Duplicate (Ctrl+D)"
                className="p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onFocusProp(selectedProp.id)}
                title="Focus Camera (F)"
                className="p-1.5 text-sky-300 hover:bg-white/10"
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={Boolean(selectedProp.locked)}
                onClick={() => onSnapPropToRoad?.(selectedProp.id)}
                title="Snap Flush & Align to Road"
                className="p-1.5 text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-30"
              >
                <Navigation className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={Boolean(selectedProp.locked)}
                onClick={deleteSelectedProp}
                title="Delete Selected (Del)"
                className="p-1.5 text-rose-400 hover:bg-rose-500/15 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Right: Car Changer, Viewport Controls & Test Drive */}
        <div className="relative flex items-center gap-1.5 overflow-x-auto no-scrollbar md:flex-wrap">
          <div className="inline-flex items-center border border-white/15 bg-black/70">
            <Car className="ml-2 h-3.5 w-3.5 shrink-0 text-sky-400" />
            <select
              value={selectedCarId}
              onChange={(e) => {
                const nextCar = e.target.value as CarModelId;
                onSelectCar(nextCar);
                const found = availableCars.find((c) => c.id === nextCar);
                if (found) setLocalBanner(`Active test car: ${found.name}`);
              }}
              aria-label="Select Car for Build Maps Test Drive"
              title="Change Car in Build Maps"
              className="max-w-[165px] truncate bg-transparent px-2 py-1.5 text-[11px] font-semibold text-white focus:outline-none"
            >
              {availableCars.map((car) => (
                <option key={car.id} value={car.id} className="bg-[#0b0e14] text-white">
                  {car.name}
                </option>
              ))}
            </select>
            {onOpenCarSelect && (
              <button
                type="button"
                onClick={onOpenCarSelect}
                title="Browse All Cars"
                className="border-l border-white/12 px-2 py-1.5 text-[10px] font-bold text-sky-300 uppercase hover:bg-white/10 hover:text-white whitespace-nowrap shrink-0"
              >
                All
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSetCameraMode('overview')}
            className="inline-flex items-center gap-1 border border-white/12 bg-black/55 px-2 py-1.5 text-[11px] text-slate-200 hover:border-sky-400/60 whitespace-nowrap shrink-0"
          >
            <Eye className="h-3.5 w-3.5 text-sky-400" />
            <span>Orbit</span>
          </button>
          <button
            type="button"
            onClick={() => onSetCameraMode('top_down')}
            className="inline-flex items-center gap-1 border border-white/12 bg-black/55 px-2 py-1.5 text-[11px] text-slate-200 hover:border-sky-400/60 whitespace-nowrap shrink-0"
          >
            <Compass className="h-3.5 w-3.5 text-amber-400" />
            <span>Top</span>
          </button>
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen((v) => !v)}
            title="Camera & Studio Keyboard Shortcuts"
            className={`inline-flex items-center gap-1 border px-2 py-1.5 text-[11px] whitespace-nowrap shrink-0 ${
              shortcutsHelpOpen
                ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                : 'border-white/12 bg-black/55 text-slate-300 hover:border-white/35'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Controls</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setPanelCollapsed((prev) => {
                const next = !prev;
                if (!next && typeof window !== 'undefined' && window.innerWidth < 768) {
                  setInspectorOpen(false);
                }
                return next;
              })
            }
            className={`inline-flex h-9 sm:h-auto items-center gap-1 border px-2.5 py-1.5 text-[11px] whitespace-nowrap shrink-0 ${
              !panelCollapsed
                ? 'border-amber-400/50 bg-amber-500/12 text-amber-200'
                : 'border-white/12 bg-black/55 text-slate-300'
            }`}
            title={panelCollapsed ? 'Show Toolbox' : 'Collapse Toolbox for Larger Viewport'}
          >
            {panelCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
            <span>Toolbox</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setInspectorOpen((prev) => {
                const next = !prev;
                if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
                  setPanelCollapsed(true);
                }
                return next;
              })
            }
            className={`inline-flex h-9 sm:h-auto items-center gap-1 border px-2.5 py-1.5 text-[11px] whitespace-nowrap shrink-0 ${
              inspectorOpen
                ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                : 'border-white/12 bg-black/55 text-slate-300'
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            <span>Explorer</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, false)
            }
            className="inline-flex h-9 sm:h-auto items-center gap-1 border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 font-display text-[11px] font-bold text-amber-200 uppercase hover:bg-amber-500/25 whitespace-nowrap shrink-0"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Rebuild</span>
          </button>
          <button
            type="button"
            onClick={() => onTestDrive(blueprint)}
            className="inline-flex h-9 sm:h-auto items-center gap-1.5 bg-sky-500 px-3 py-1.5 font-display text-[11px] font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Test Drive</span>
          </button>

          {shortcutsHelpOpen && (
            <div className="gt5-panel fixed top-24 right-2 left-2 sm:left-auto sm:top-full sm:right-0 sm:absolute z-50 sm:mt-2 sm:w-72 border border-sky-400/40 bg-[#0b1018]/98 p-3 text-[11px] text-slate-200 shadow-2xl">
              <div className="mb-2 flex items-center justify-between border-b border-white/12 pb-1.5">
                <span className="font-display text-[11px] font-bold tracking-wider text-sky-300 uppercase">
                  Studio Controls &amp; Shortcuts
                </span>
                <button
                  type="button"
                  onClick={() => setShortcutsHelpOpen(false)}
                  className="text-[10px] text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="space-y-1.5 font-mono-tabular text-[10px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Fly Camera</span>
                  <span className="text-white">WASD + Q/E · Shift Fast</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Orbit / Pan</span>
                  <span className="text-white">Right-Drag / Touch Drag</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Move 3D Track Node</span>
                  <span className="text-sky-300">Drag Cyan Pin (XZ)</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Node Elevation Y</span>
                  <span className="text-amber-300">Shift + Drag 3D Pin</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Tools</span>
                  <span className="text-white">1 Select · 2-4 Gizmo · 5 Place · 6 Brush</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Focus / Copy / Undo</span>
                  <span className="text-white">F · Ctrl+D · Ctrl+Z/Y</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── MIDDLE WORKSPACE: LEFT STUDIO PANEL + OPEN 3D CANVAS + RIGHT EXPLORER/PROPERTIES ── */}
      <div className="my-1.5 sm:my-2 flex min-h-0 flex-1 items-start justify-between gap-2.5 overflow-hidden">
        {panelCollapsed ? (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setInspectorOpen(false);
              }
              setPanelCollapsed(false);
            }}
            className="pointer-events-auto gt5-panel inline-flex h-10 sm:h-auto items-center gap-1.5 border border-amber-400/45 bg-[#0b0e14]/92 px-3 py-2 font-display text-[11px] font-bold tracking-wider text-amber-200 uppercase hover:border-amber-300"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
            <span>Open Studio</span>
          </button>
        ) : (
        <aside className="pointer-events-auto gt5-panel gt5-carbon flex max-h-[54dvh] landscape-short:max-h-full landscape-short:max-w-[320px] sm:max-h-full w-full sm:max-w-[360px] flex-col overflow-hidden border border-white/15 bg-[#0b0e14]/95">
          {/* Studio Tool Tabs */}
          <div className="grid grid-cols-5 border-b border-white/12 bg-black/60">
            {(
              [
                { id: 'spline', label: 'Spline', icon: Spline },
                { id: 'terrain', label: 'Terrain', icon: Mountain },
                { id: 'props', label: 'Toolbox', icon: Box },
                { id: 'env', label: 'World', icon: Sun },
                { id: 'publish', label: 'Publish', icon: Upload },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = studioTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setStudioTab(t.id);
                    if (t.id === 'terrain') onChangeStudioToolMode('terrain');
                  }}
                  className={`flex flex-col items-center gap-1 border-b-2 py-2 font-display text-[10px] font-bold tracking-wider uppercase transition-colors ${
                    active
                      ? 'border-amber-400 bg-amber-500/12 text-amber-300'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
            {effectiveBanner && (
              <div className="border border-sky-400/40 bg-sky-500/12 px-2.5 py-1.5 text-[11px] text-sky-200">
                {effectiveBanner}
              </div>
            )}

            {/* ── TAB 1: 2D/3D SPLINE EDITOR & ONE-CLICK PRESETS ── */}
            {studioTab === 'spline' && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                        One-Click Track Presets
                      </label>
                      <select
                        value={blueprint.templateId}
                        onChange={(e) => {
                          const next = createBlueprintFromTemplate(
                            e.target.value as MapTemplateId,
                            user?.id ?? blueprint.authorId,
                            user?.username ?? blueprint.authorUsername,
                          );
                          setSelectedPtIdx(0);
                          onSelectProp(null);
                          onChangeBlueprint(next, 'full', null, true);
                          setLocalBanner(`Loaded preset: ${MAP_TEMPLATES[next.templateId].name}`);
                        }}
                        className="w-full border border-white/15 bg-black/70 px-2.5 py-2 text-xs text-white"
                      >
                        {Object.values(MAP_TEMPLATES).map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.closedLoop ? 'Circuit' : 'Sprint'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTemplateGalleryOpen(true)}
                      className="border border-sky-400/50 bg-sky-500/15 px-2.5 py-2 font-display text-[10px] font-bold text-sky-200 uppercase hover:bg-sky-500/25 whitespace-nowrap shrink-0"
                    >
                      Gallery
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.values(MAP_TEMPLATES).map((tpl) => {
                      const activeTpl = blueprint.templateId === tpl.id;
                      const shortName = tpl.name
                        .replace('High-Banked ', '')
                        .replace('Crossover ', '')
                        .replace(' (Auto Tunnel)', '')
                        .replace(' Remixer', '')
                        .replace('Stunt & Switchback ', 'Touge ');
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            const next = createBlueprintFromTemplate(
                              tpl.id,
                              user?.id ?? blueprint.authorId,
                              user?.username ?? blueprint.authorUsername,
                            );
                            setSelectedPtIdx(0);
                            onSelectProp(null);
                            onChangeBlueprint(next, 'full', null, true);
                            setLocalBanner(`Loaded preset: ${tpl.name}`);
                          }}
                          title={tpl.subtitle}
                          className={`truncate border px-1.5 py-1 text-[9px] font-bold uppercase transition-colors ${
                            activeTpl
                              ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                              : 'border-white/12 bg-black/45 text-slate-300 hover:border-sky-400/50 hover:text-white'
                          }`}
                        >
                          {shortName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400 uppercase">
                    <span>2D Spline Canvas (±620m)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSnapToGrid((v) => !v)}
                        className={`border px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold uppercase ${
                          snapToGrid
                            ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                            : 'border-white/15 bg-white/5 text-slate-400'
                        }`}
                      >
                        Snap {snapToGrid ? '10m' : 'OFF'}
                      </button>
                      <span className="font-mono-tabular text-sky-300">
                        #{selectedPtIdx + 1}/{blueprint.controlPoints.length}
                      </span>
                    </div>
                  </div>
                  <svg
                    ref={svgRef}
                    viewBox="-640 -640 1280 1280"
                    className="h-52 w-full touch-none cursor-crosshair border border-white/15 bg-[#06090f]"
                    onPointerMove={(e) => {
                      if (draggingPtIdx === null) return;
                      const pos = toWorldFromSvg(e.clientX, e.clientY);
                      if (!pos) return;
                      const nextPts = blueprint.controlPoints.map((pt, i) =>
                        i === draggingPtIdx ? { ...pt, x: pos.x, z: pos.z } : pt,
                      );
                      onChangeBlueprint(
                        { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
                        'none',
                        selectedPropId,
                        false,
                      );
                    }}
                    onPointerUp={() => {
                      if (draggingPtIdx !== null) {
                        setDraggingPtIdx(null);
                        onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true);
                      }
                    }}
                    onPointerCancel={() => setDraggingPtIdx(null)}
                    onPointerLeave={() => setDraggingPtIdx(null)}
                    onClick={(e) => {
                      if (draggingPtIdx !== null) return;
                      const target = e.target as SVGElement;
                      if (target.dataset.ptIndex !== undefined) return;
                      const pos = toWorldFromSvg(e.clientX, e.clientY);
                      if (!pos) return;
                      const refPt = blueprint.controlPoints[selectedPtIdx] ?? { y: 20, bankDeg: 0 };
                      const nextPts = [
                        ...blueprint.controlPoints,
                        { x: pos.x, y: refPt.y, z: pos.z, bankDeg: 0 },
                      ];
                      setSelectedPtIdx(nextPts.length - 1);
                      onChangeBlueprint(
                        { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
                        'full',
                        selectedPropId,
                        true,
                      );
                    }}
                  >
                    {[-480, -320, -160, 0, 160, 320, 480].map((v) => (
                      <g key={v}>
                        <line x1={v} y1={-640} x2={v} y2={640} stroke={v === 0 ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.06)'} strokeWidth={3} />
                        <line x1={-640} y1={v} x2={640} y2={v} stroke={v === 0 ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.06)'} strokeWidth={3} />
                      </g>
                    ))}
                    {svgSplinePath && (
                      <path
                        d={svgSplinePath}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={Math.max(10, blueprint.roadWidth * 0.9)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.75}
                      />
                    )}
                    {svgDirectionMarkers.map((arr, idx) => (
                      <g
                        key={`dir_${idx}`}
                        transform={`translate(${arr.x.toFixed(1)}, ${arr.z.toFixed(1)}) rotate(${arr.angleDeg.toFixed(1)})`}
                        pointerEvents="none"
                      >
                        <polygon points="16,0 -10,-9 -6,0 -10,9" fill="#f8fafc" opacity={0.9} />
                      </g>
                    ))}
                    {blueprint.placedProps.map((pr) => (
                      <rect
                        key={pr.id}
                        x={pr.x - 7}
                        y={pr.z - 7}
                        width={14}
                        height={14}
                        fill={pr.id === selectedPropId ? '#fbbf24' : pr.type === 'boost_pad' ? '#06b6d4' : '#22c55e'}
                        opacity={0.85}
                      />
                    ))}
                    {blueprint.controlPoints.map((pt, idx) => {
                      const isSel = idx === selectedPtIdx;
                      return (
                        <g key={idx}>
                          <circle
                            data-pt-index={idx}
                            cx={pt.x}
                            cy={pt.z}
                            r={isSel ? 18 : 13}
                            fill={idx === 0 ? '#22c55e' : isSel ? '#f59e0b' : '#0f172a'}
                            stroke={isSel ? '#ffffff' : '#38bdf8'}
                            strokeWidth={4}
                            className="cursor-grab"
                            onPointerDown={(e) => {
                              if (e.button !== 0 && e.pointerType === 'mouse') return;
                              e.stopPropagation();
                              try {
                                (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                              } catch {
                                // Ignore pointer capture unsupported
                              }
                              setSelectedPtIdx(idx);
                              setDraggingPtIdx(idx);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (blueprint.controlPoints.length <= 4) {
                                setLocalBanner('Need at least 4 nodes to keep track valid.');
                                return;
                              }
                              const nextPts = blueprint.controlPoints.filter((_, i) => i !== idx);
                              setSelectedPtIdx((prev) => Math.max(0, Math.min(prev, nextPts.length - 1)));
                              onChangeBlueprint(
                                { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
                                'full',
                                selectedPropId,
                                true,
                              );
                            }}
                          />
                          <text
                            x={pt.x}
                            y={pt.z + 5}
                            textAnchor="middle"
                            fontSize="14"
                            fontWeight="bold"
                            fill="#ffffff"
                            pointerEvents="none"
                          >
                            {idx + 1}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Click canvas to add · Drag 2D or 3D cyan pins · Shift+Drag 3D for Y</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={autoSmoothSpline}
                      className="inline-flex items-center justify-center gap-1 border border-sky-400/40 bg-sky-500/12 py-1 font-display text-[10px] font-bold text-sky-200 uppercase hover:bg-sky-500/22"
                    >
                      <Wand2 className="h-3 w-3" />
                      <span>Smooth</span>
                    </button>
                    <button
                      type="button"
                      onClick={autoBankCorners}
                      className="inline-flex items-center justify-center gap-1 border border-amber-400/40 bg-amber-500/12 py-1 font-display text-[10px] font-bold text-amber-200 uppercase hover:bg-amber-500/22"
                    >
                      <RotateCw className="h-3 w-3" />
                      <span>Auto-Bank</span>
                    </button>
                    <button
                      type="button"
                      onClick={levelSplineElevation}
                      className="inline-flex items-center justify-center gap-1 border border-white/15 bg-white/5 py-1 font-display text-[10px] font-bold text-slate-200 uppercase hover:border-white/35"
                    >
                      <ArrowDownToLine className="h-3 w-3" />
                      <span>Level Y</span>
                    </button>
                  </div>
                </div>

                {selectedPoint && (
                  <div className="space-y-2 border border-white/10 bg-black/50 p-2.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-[11px] font-bold text-amber-300 uppercase">
                        Node #{selectedPtIdx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onFocusNode?.(selectedPtIdx)}
                          title="Focus Studio Camera on Node (F)"
                          className="border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 uppercase hover:border-sky-400 hover:text-white"
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextIdx = (selectedPtIdx + 1) % blueprint.controlPoints.length;
                            const a = blueprint.controlPoints[selectedPtIdx];
                            const b = blueprint.controlPoints[nextIdx];
                            const inserted = {
                              x: Math.round((a.x + b.x) * 0.5),
                              y: Math.round((a.y + b.y) * 0.5),
                              z: Math.round((a.z + b.z) * 0.5),
                              bankDeg: Math.round(((a.bankDeg ?? 0) + (b.bankDeg ?? 0)) * 0.5),
                            };
                            const nextPts = [
                              ...blueprint.controlPoints.slice(0, selectedPtIdx + 1),
                              inserted,
                              ...blueprint.controlPoints.slice(selectedPtIdx + 1),
                            ];
                            setSelectedPtIdx(selectedPtIdx + 1);
                            onChangeBlueprint(
                              { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
                              'full',
                              selectedPropId,
                              true,
                            );
                          }}
                          className="border border-sky-400/45 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200 uppercase"
                        >
                          + Split
                        </button>
                        <button
                          type="button"
                          disabled={blueprint.controlPoints.length <= 4}
                          onClick={() => {
                            if (blueprint.controlPoints.length <= 4) return;
                            const nextPts = blueprint.controlPoints.filter((_, i) => i !== selectedPtIdx);
                            setSelectedPtIdx(Math.max(0, selectedPtIdx - 1));
                            onChangeBlueprint(
                              { ...blueprint, controlPoints: nextPts, updatedAt: Date.now() },
                              'full',
                              selectedPropId,
                              true,
                            );
                          }}
                          className="border border-rose-500/45 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-200 uppercase disabled:opacity-35"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <label className="block">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">X (m)</span>
                        <input
                          type="number"
                          step={5}
                          value={Math.round(selectedPoint.x)}
                          onChange={(e) => updateSelectedPoint({ x: Number(e.target.value) || 0 })}
                          onBlur={() =>
                            onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-0.5 font-mono-tabular text-[11px] text-white"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Y Elev (m)</span>
                        <input
                          type="number"
                          step={1}
                          value={selectedPoint.y}
                          onChange={(e) => updateSelectedPoint({ y: Number(e.target.value) || 0 })}
                          onBlur={() =>
                            onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-0.5 font-mono-tabular text-[11px] text-white"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Z (m)</span>
                        <input
                          type="number"
                          step={5}
                          value={Math.round(selectedPoint.z)}
                          onChange={(e) => updateSelectedPoint({ z: Number(e.target.value) || 0 })}
                          onBlur={() =>
                            onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-0.5 font-mono-tabular text-[11px] text-white"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Elevation Y</span>
                          <span className="font-mono-tabular text-white">{selectedPoint.y}m</span>
                        </div>
                        <input
                          type="range"
                          min={-10}
                          max={120}
                          value={selectedPoint.y}
                          onChange={(e) => updateSelectedPoint({ y: Number(e.target.value) })}
                          onMouseUp={() =>
                            onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                          }
                          className="w-full accent-sky-400"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Corner Bank</span>
                          <span className="font-mono-tabular text-amber-300">{selectedPoint.bankDeg ?? 0}°</span>
                        </div>
                        <input
                          type="range"
                          min={-18}
                          max={24}
                          value={selectedPoint.bankDeg ?? 0}
                          onChange={(e) => updateSelectedPoint({ bankDeg: Number(e.target.value) })}
                          onMouseUp={() =>
                            onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                          }
                          className="w-full accent-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 border border-white/10 bg-black/45 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300">Layout Topology</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeBlueprint({ ...blueprint, closedLoop: true }, 'full', selectedPropId, true)
                        }
                        className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          blueprint.closedLoop ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-white/15 text-slate-300'
                        }`}
                      >
                        Closed Loop
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeBlueprint({ ...blueprint, closedLoop: false }, 'full', selectedPropId, true)
                        }
                        className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          !blueprint.closedLoop ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-white/15 text-slate-300'
                        }`}
                      >
                        Open Sprint
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Road Width</span>
                        <span className="font-mono-tabular text-white">{blueprint.roadWidth}m</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={24}
                        step={1}
                        value={blueprint.roadWidth}
                        onChange={(e) =>
                          onChangeBlueprint({ ...blueprint, roadWidth: Number(e.target.value) }, 'none', selectedPropId, false)
                        }
                        onMouseUp={() =>
                          onChangeBlueprint({ ...blueprint, updatedAt: Date.now() }, 'full', selectedPropId, true)
                        }
                        className="w-full accent-sky-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Grip Scale</span>
                        <span className="font-mono-tabular text-emerald-300">
                          {Math.round(blueprint.gripScale * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={1.35}
                        step={0.05}
                        value={blueprint.gripScale}
                        onChange={(e) =>
                          onChangeBlueprint({ ...blueprint, gripScale: Number(e.target.value) }, 'none', selectedPropId, false)
                        }
                        className="w-full accent-emerald-400"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── TAB 2: ROBLOX-STYLE TERRAIN MATERIAL PAINTER, SCULPT & WATER ── */}
            {studioTab === 'terrain' && (
              <>
                <div className="border border-sky-400/35 bg-sky-500/10 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-xs font-bold text-white uppercase">
                        Terrain Editor Brush
                      </div>
                      <div className="text-[10px] text-slate-300">
                        {studioToolMode === 'terrain'
                          ? 'Click & drag directly on the 3D terrain to paint or sculpt.'
                          : 'Click Activate Brush to paint materials or sculpt hills.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeStudioToolMode(studioToolMode === 'terrain' ? 'select' : 'terrain')
                      }
                      className={`px-2.5 py-1.5 font-display text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${
                        studioToolMode === 'terrain'
                          ? 'bg-amber-400 text-slate-950'
                          : 'border border-white/20 bg-white/5 text-slate-200'
                      }`}
                    >
                      {studioToolMode === 'terrain' ? 'Brush ON' : 'Activate'}
                    </button>
                  </div>
                </div>

                {/* Paint Material vs Height Sculpt Sub-Mode */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeTerrainToolConfig({ ...terrainToolConfig, mode: 'material' });
                      onChangeStudioToolMode('terrain');
                    }}
                    className={`border py-2 font-display text-[11px] font-bold uppercase ${
                      terrainToolConfig.mode === 'material'
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-black/50 text-slate-300'
                    }`}
                  >
                    Paint Material
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeTerrainToolConfig({ ...terrainToolConfig, mode: 'sculpt' });
                      onChangeStudioToolMode('terrain');
                    }}
                    className={`border py-2 font-display text-[11px] font-bold uppercase ${
                      terrainToolConfig.mode === 'sculpt'
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-white/12 bg-black/50 text-slate-300'
                    }`}
                  >
                    Sculpt Height
                  </button>
                </div>

                {terrainToolConfig.mode === 'material' ? (
                  <div className="space-y-2.5 border border-white/10 bg-black/45 p-2.5">
                    <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                      <span>Surface Materials (Real Grip Physics)</span>
                      <span className="font-mono-tabular text-slate-400">{paintStampCount} strokes</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TERRAIN_MATERIAL_DEFS.map((mat) => {
                        const active = terrainToolConfig.materialId === mat.id;
                        return (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => {
                              onChangeTerrainToolConfig({
                                ...terrainToolConfig,
                                mode: 'material',
                                materialId: mat.id,
                              });
                              onChangeStudioToolMode('terrain');
                            }}
                            className={`flex items-center gap-2 border px-2 py-1.5 text-left transition-colors ${
                              active
                                ? 'border-sky-400 bg-sky-500/20 text-white'
                                : 'border-white/12 bg-black/55 text-slate-300 hover:border-white/30'
                            }`}
                          >
                            <span
                              className="h-5 w-5 shrink-0 border border-white/25"
                              style={{
                                background: `linear-gradient(135deg, ${mat.hex} 0%, ${mat.secondaryHex} 100%)`,
                              }}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-display text-[10px] font-bold uppercase">
                                {mat.label}
                              </div>
                              <div className="font-mono-tabular text-[9px] text-slate-400">
                                μ {mat.gripMu.toFixed(2)} · {mat.audioSurface}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Optional Custom Color Tint */}
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="text-[10px] text-slate-400 uppercase">Custom Color Tint</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onChangeTerrainToolConfig({ ...terrainToolConfig, colorHex: '' })}
                          className={`border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            !terrainToolConfig.colorHex
                              ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                              : 'border-white/15 text-slate-400'
                          }`}
                        >
                          Default
                        </button>
                        <input
                          type="color"
                          value={
                            terrainToolConfig.colorHex ||
                            TERRAIN_MATERIAL_DEFS.find((m) => m.id === terrainToolConfig.materialId)?.hex ||
                            '#3b6e32'
                          }
                          onChange={(e) =>
                            onChangeTerrainToolConfig({
                              ...terrainToolConfig,
                              colorHex: e.target.value,
                            })
                          }
                          className="h-5 w-7 cursor-pointer border border-white/25 bg-transparent"
                          title="Pick custom paint tint"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paintStampCount === 0}
                        onClick={() => {
                          const next = {
                            ...blueprint,
                            terrainMaterialStamps: (blueprint.terrainMaterialStamps ?? []).slice(0, -1),
                            updatedAt: Date.now(),
                          };
                          onChangeBlueprint(next, 'terrain_look', selectedPropId, true);
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 border border-white/15 bg-white/5 py-1.5 text-[11px] font-semibold text-slate-200 disabled:opacity-40"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Undo Paint</span>
                      </button>
                      <button
                        type="button"
                        disabled={paintStampCount === 0}
                        onClick={() => {
                          const next = {
                            ...blueprint,
                            terrainMaterialStamps: [],
                            updatedAt: Date.now(),
                          };
                          onChangeBlueprint(next, 'terrain_look', selectedPropId, true);
                        }}
                        className="inline-flex items-center justify-center gap-1 border border-rose-500/45 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 border border-white/10 bg-black/45 p-2.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['raise', 'lower', 'flatten', 'smooth'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            onChangeTerrainToolConfig({
                              ...terrainToolConfig,
                              mode: 'sculpt',
                              sculptOp: m,
                            });
                            onChangeStudioToolMode('terrain');
                          }}
                          className={`border py-2 font-display text-[11px] font-bold uppercase ${
                            terrainToolConfig.sculptOp === m
                              ? 'border-amber-400 bg-amber-400 text-slate-950'
                              : 'border-white/12 bg-black/55 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={blueprint.terrainStamps.length === 0}
                        onClick={() => {
                          const next = {
                            ...blueprint,
                            terrainStamps: blueprint.terrainStamps.slice(0, -1),
                            updatedAt: Date.now(),
                          };
                          onChangeBlueprint(next, 'terrain_geo', selectedPropId, true);
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 border border-white/15 bg-white/5 py-1.5 text-[11px] font-semibold text-slate-200 disabled:opacity-40"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Undo Sculpt ({blueprint.terrainStamps.length})</span>
                      </button>
                      <button
                        type="button"
                        disabled={blueprint.terrainStamps.length === 0}
                        onClick={() => {
                          const next = { ...blueprint, terrainStamps: [], updatedAt: Date.now() };
                          onChangeBlueprint(next, 'terrain_geo', selectedPropId, true);
                        }}
                        className="inline-flex items-center justify-center gap-1 border border-rose-500/45 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={alignTerrainToRoad}
                      className="inline-flex w-full items-center justify-center gap-1.5 border border-emerald-400/45 bg-emerald-500/12 py-1.5 font-display text-[10px] font-bold text-emerald-200 uppercase hover:bg-emerald-500/22"
                    >
                      <Wand2 className="h-3 w-3" />
                      <span>Align Terrain to Road</span>
                    </button>
                  </div>
                )}

                {/* Brush Radius & Strength */}
                <div className="space-y-2 border border-white/10 bg-black/45 p-2.5">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
                      <span>Brush Radius</span>
                      <div className="flex items-center gap-1">
                        {[18, 40, 80].map((presetR) => (
                          <button
                            key={presetR}
                            type="button"
                            onClick={() =>
                              onChangeTerrainToolConfig({ ...terrainToolConfig, radius: presetR })
                            }
                            className={`border px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold ${
                              terrainToolConfig.radius === presetR
                                ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                                : 'border-white/12 bg-black/50 text-slate-400'
                            }`}
                          >
                            {presetR}m
                          </button>
                        ))}
                        <span className="ml-1 font-mono-tabular text-sky-300">{terrainToolConfig.radius}m</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={terrainToolConfig.radius}
                      onChange={(e) =>
                        onChangeTerrainToolConfig({
                          ...terrainToolConfig,
                          radius: Number(e.target.value),
                        })
                      }
                      className="w-full accent-sky-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span>
                        {terrainToolConfig.mode === 'material' ? 'Paint Opacity' : 'Sculpt Strength'}
                      </span>
                      <span className="font-mono-tabular text-amber-300">
                        {terrainToolConfig.mode === 'material'
                          ? `${Math.round(Math.min(1, terrainToolConfig.strength / 10) * 100)}%`
                          : `${terrainToolConfig.strength}m`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={18}
                      value={terrainToolConfig.strength}
                      onChange={(e) =>
                        onChangeTerrainToolConfig({
                          ...terrainToolConfig,
                          strength: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                {/* Studio Water Plane Controls */}
                <div className="space-y-2 border border-cyan-500/35 bg-cyan-950/20 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold text-cyan-200 uppercase">
                      <Droplets className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Studio Water Plane</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(blueprint.waterEnabled)}
                      onChange={(e) => {
                        const next = {
                          ...blueprint,
                          waterEnabled: e.target.checked,
                          waterLevel: blueprint.waterLevel ?? 17.5,
                          updatedAt: Date.now(),
                        };
                        onChangeBlueprint(next, 'terrain_look', selectedPropId, true);
                      }}
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </div>
                  {blueprint.waterEnabled && (
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-300">
                        <span>Water Elevation</span>
                        <span className="font-mono-tabular text-cyan-200">
                          {(blueprint.waterLevel ?? 17.5).toFixed(1)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-10}
                        max={60}
                        step={0.5}
                        value={blueprint.waterLevel ?? 17.5}
                        onChange={(e) => {
                          const next = {
                            ...blueprint,
                            waterLevel: Number(e.target.value),
                            updatedAt: Date.now(),
                          };
                          onChangeBlueprint(next, 'terrain_look', selectedPropId, false);
                        }}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── TAB 3: ROBLOX-STYLE PROP TOOLBOX ── */}
            {studioTab === 'props' && (
              <>
                <div className="border border-amber-400/35 bg-amber-500/10 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-xs font-bold text-white uppercase">
                        3D Prop Toolbox (24 Assets)
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Click a prop to place in 3D, or click Spawn at Camera.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => spawnPropAtCameraTarget(activePropType)}
                      className="inline-flex items-center gap-1 bg-emerald-400 px-2.5 py-1.5 font-display text-[10px] font-bold text-slate-950 uppercase hover:bg-emerald-300 whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Spawn</span>
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoAlignTrack}
                      onChange={(e) => onChangeAutoAlignTrack(e.target.checked)}
                      className="accent-sky-400"
                    />
                    <span>Auto-align rotation to nearest track direction</span>
                  </label>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 sm:top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={propSearch}
                    onChange={(e) => setPropSearch(e.target.value)}
                    placeholder="Search ramps, bridges, trees, buildings..."
                    className="w-full border border-white/15 bg-black/70 py-2 sm:py-1.5 pr-2.5 pl-8 text-base sm:text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                {/* Category Filter Tabs */}
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: 'all', label: `All (${BUILDER_PROP_CATALOG.length})` },
                      { id: 'stunt', label: 'Stunt' },
                      { id: 'barrier', label: 'Barrier' },
                      { id: 'structure', label: 'Structure' },
                      { id: 'scenery', label: 'Scenery' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPropCategoryFilter(cat.id)}
                      className={`border px-2 py-1 font-display text-[10px] font-bold uppercase ${
                        propCategoryFilter === cat.id
                          ? 'border-sky-400 bg-sky-500 text-slate-950'
                          : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid max-h-[360px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
                  {filteredPropCatalog.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        onChangeActivePropType(item.type);
                        onChangeStudioToolMode('place');
                      }}
                      className={`border px-2.5 py-2 text-left transition-colors ${
                        activePropType === item.type
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display text-[11px] font-bold uppercase">{item.label}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── TAB 4: STUDIO ENVIRONMENT, BASEPLATE, SURFACE & TUNNELS ── */}
            {studioTab === 'env' && (
              <>
                <div className="space-y-2 border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                    Flat Baseplate Ground Theme
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BASEPLATE_OPTIONS.map((bpOpt) => (
                      <button
                        key={bpOpt.id}
                        type="button"
                        onClick={() =>
                          onChangeBlueprint(
                            { ...blueprint, baseplateTheme: bpOpt.id, updatedAt: Date.now() },
                            'terrain_look',
                            selectedPropId,
                            true,
                          )
                        }
                        className={`border px-2 py-1.5 text-left text-[11px] font-semibold ${
                          (blueprint.baseplateTheme ?? 'studio_grid') === bpOpt.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/12 bg-black/45 text-slate-300'
                        }`}
                      >
                        {bpOpt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border border-white/10 bg-black/50 p-2.5">
                  <div className="text-[10px] font-bold tracking-wider text-amber-300 uppercase">
                    Road Surface &amp; Kerb Style
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {ROAD_SURFACE_OPTIONS.map((rs) => (
                      <button
                        key={rs.id}
                        type="button"
                        onClick={() =>
                          onChangeBlueprint(
                            { ...blueprint, roadSurfaceTheme: rs.id, updatedAt: Date.now() },
                            'full',
                            selectedPropId,
                            true,
                          )
                        }
                        className={`border px-2 py-1 text-[10px] font-semibold ${
                          (blueprint.roadSurfaceTheme ?? 'asphalt') === rs.id
                            ? 'border-amber-400 bg-amber-500/20 text-white'
                            : 'border-white/12 bg-black/45 text-slate-300'
                        }`}
                      >
                        {rs.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    {KERB_OPTIONS.map((kb) => (
                      <button
                        key={kb.id}
                        type="button"
                        onClick={() =>
                          onChangeBlueprint(
                            { ...blueprint, kerbTheme: kb.id, updatedAt: Date.now() },
                            'full',
                            selectedPropId,
                            true,
                          )
                        }
                        className={`border px-2 py-1 text-[10px] font-semibold ${
                          (blueprint.kerbTheme ?? 'red_white') === kb.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/12 bg-black/45 text-slate-300'
                        }`}
                      >
                        {kb.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-emerald-400/35 bg-emerald-500/10 p-2.5">
                  <label className="flex cursor-pointer items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-xs font-bold text-white uppercase">
                        Auto 3D Underpass Tunnels
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-300">
                        Automatically builds concrete 3D tunnel shells whenever lower road segments pass underneath an elevated overpass.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={blueprint.autoTunnels !== false}
                      onChange={(e) =>
                        onChangeBlueprint(
                          { ...blueprint, autoTunnels: e.target.checked, updatedAt: Date.now() },
                          'full',
                          selectedPropId,
                          true,
                        )
                      }
                      className="mt-1 h-4 w-4 accent-emerald-400"
                    />
                  </label>
                </div>

                <div className="space-y-2 border border-white/10 bg-black/50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                    <Sun className="h-3.5 w-3.5" />
                    <span>Default Atmosphere &amp; Weather</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WEATHER_OPTIONS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          onChangeBlueprint(
                            {
                              ...blueprint,
                              defaultWeather: w.id,
                              defaultSolarDeg: w.solar,
                              defaultHaze: w.haze,
                              updatedAt: Date.now(),
                            },
                            'none',
                            selectedPropId,
                            true,
                          )
                        }
                        className={`border px-2 py-1.5 text-left text-[11px] font-semibold ${
                          blueprint.defaultWeather === w.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/12 bg-black/45 text-slate-300'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Solar Angle</span>
                      <span className="font-mono-tabular text-white">{blueprint.defaultSolarDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={blueprint.defaultSolarDeg}
                      onChange={(e) =>
                        onChangeBlueprint(
                          { ...blueprint, defaultSolarDeg: Number(e.target.value) },
                          'none',
                          selectedPropId,
                          false,
                        )
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── TAB 5: METADATA & PUBLISH ── */}
            {studioTab === 'publish' && (
              <>
                <div className="space-y-2.5 border border-white/10 bg-black/50 p-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400 uppercase">
                      Track Title
                    </label>
                    <input
                      type="text"
                      value={blueprint.title}
                      onChange={(e) =>
                        onChangeBlueprint({ ...blueprint, title: e.target.value }, 'none', selectedPropId, false)
                      }
                      maxLength={48}
                      className="w-full border border-white/15 bg-black/70 px-2.5 py-2 text-base sm:text-xs text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400 uppercase">
                      Description
                    </label>
                    <textarea
                      value={blueprint.description}
                      onChange={(e) =>
                        onChangeBlueprint({ ...blueprint, description: e.target.value }, 'none', selectedPropId, false)
                      }
                      rows={2}
                      maxLength={220}
                      className="w-full border border-white/15 bg-black/70 px-2.5 py-2 text-base sm:text-xs text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-400 uppercase">
                        Map Type
                      </label>
                      <select
                        value={blueprint.mapType ?? (blueprint.closedLoop ? 'circuit' : 'sprint')}
                        onChange={(e) =>
                          onChangeBlueprint(
                            { ...blueprint, mapType: e.target.value as MapTypeTag },
                            'none',
                            selectedPropId,
                            false,
                          )
                        }
                        className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2 py-1.5 text-sm sm:text-xs text-white"
                      >
                        <option value="circuit">Circuit</option>
                        <option value="sprint">Sprint</option>
                        <option value="drift">Drift</option>
                        <option value="stunt">Stunt</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-400 uppercase">
                        Difficulty
                      </label>
                      <select
                        value={blueprint.difficulty ?? 'medium'}
                        onChange={(e) =>
                          onChangeBlueprint(
                            { ...blueprint, difficulty: e.target.value as MapDifficultyTag },
                            'none',
                            selectedPropId,
                            false,
                          )
                        }
                        className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2 py-1.5 text-sm sm:text-xs text-white"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="extreme">Extreme</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      void triggerExplicitSave();
                    }}
                    className="flex min-h-[42px] sm:min-h-0 w-full items-center justify-center gap-2 border border-sky-400/50 bg-sky-500/15 py-2.5 font-display text-xs font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/25"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{saving ? 'Saving Slot...' : hasUnsavedChanges ? 'Save Build Slot*' : 'Saved to Profile'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSlotsModalOpen(true)}
                    className="flex min-h-[42px] sm:min-h-0 w-full items-center justify-center gap-2 border border-amber-400/45 bg-amber-500/12 py-2 font-display text-xs font-bold tracking-wider text-amber-200 uppercase hover:bg-amber-500/22"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>Manage Build Slots ({Math.max(1, buildSlots.length)})</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      if (!user) {
                        onRequireAuth();
                        return;
                      }
                      setSaving(true);
                      try {
                        await onPublishMap(blueprint);
                        setLocalBanner('Published to Explore Maps! Anyone can drive or host parties on it.');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex min-h-[44px] sm:min-h-0 w-full items-center justify-center gap-2 bg-emerald-400 py-2.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-emerald-300"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{user ? 'Publish to Explore Maps' : 'Sign In to Publish Map'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
        )}

        {/* CENTER OPEN 3D VIEWPORT */}
        <div className="hidden flex-1 lg:block" />

        {/* ── RIGHT STUDIO DOCK: EXPLORER + PROPERTIES INSPECTOR ── */}
        {inspectorOpen && (
          <aside className="pointer-events-auto gt5-panel gt5-carbon flex max-h-[54dvh] landscape-short:max-h-full landscape-short:w-[290px] sm:max-h-full w-full sm:w-[310px] shrink-0 flex-col overflow-hidden border border-white/15 bg-[#0b0e14]/95">
            {/* Explorer Section */}
            <div className="border-b border-white/12 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-white uppercase">
                  <FolderTree className="h-3.5 w-3.5 text-sky-400" />
                  <span>Explorer · Workspace</span>
                </span>
                <span className="font-mono-tabular text-[10px] text-slate-400">
                  {blueprint.placedProps.length} items
                </span>
              </div>
              <input
                type="text"
                value={explorerFilter}
                onChange={(e) => setExplorerFilter(e.target.value)}
                placeholder="Filter Workspace..."
                className="mb-2 w-full border border-white/12 bg-black/65 px-2.5 py-1.5 sm:py-1 text-base sm:text-[11px] text-white focus:border-sky-400 focus:outline-none"
              />
              <div className="max-h-36 space-y-0.5 overflow-y-auto pr-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    onSelectProp(null);
                    setStudioTab('terrain');
                    onChangeStudioToolMode('terrain');
                  }}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-slate-300 hover:bg-white/6"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Mountain className="h-3 w-3 text-emerald-400" />
                    <span>Terrain</span>
                  </span>
                  <span className="font-mono-tabular text-[9px] text-slate-500">
                    {paintStampCount + blueprint.terrainStamps.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectProp(null);
                    setStudioTab('spline');
                  }}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-slate-300 hover:bg-white/6"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Spline className="h-3 w-3 text-sky-400" />
                    <span>CircuitSpline</span>
                  </span>
                  <span className="font-mono-tabular text-[9px] text-slate-500">
                    {blueprint.controlPoints.length} pts
                  </span>
                </button>
                {filteredExplorerProps.map((pr, idx) => {
                  const isSel = pr.id === selectedPropId;
                  return (
                    <div
                      key={pr.id}
                      className={`flex items-center justify-between px-2 py-1 transition-colors ${
                        isSel ? 'bg-sky-500/22 text-white' : 'text-slate-300 hover:bg-white/6'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProp(pr.id);
                          if (studioToolMode === 'terrain' || studioToolMode === 'place') {
                            onChangeStudioToolMode('move');
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <Box className={`h-3 w-3 shrink-0 ${isSel ? 'text-sky-300' : 'text-amber-400'}`} />
                        <span className="truncate">
                          {pr.name || `${pr.type.replace('_', ' ')} #${idx + 1}`}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 pl-1">
                        <button
                          type="button"
                          onClick={() => {
                            const nextProps = blueprint.placedProps.map((item) =>
                              item.id === pr.id ? { ...item, locked: !item.locked } : item,
                            );
                            onChangeBlueprint(
                              { ...blueprint, placedProps: nextProps, updatedAt: Date.now() },
                              'props',
                              pr.id,
                              true,
                            );
                          }}
                          title={pr.locked ? 'Unlock' : 'Lock'}
                          className="p-0.5 text-slate-400 hover:text-amber-300"
                        >
                          {pr.locked ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onFocusProp(pr.id)}
                          title="Focus (F)"
                          className="p-0.5 text-slate-400 hover:text-sky-300"
                        >
                          <Crosshair className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Properties Inspector Section */}
            <div className="flex-1 overflow-y-auto p-2.5 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-amber-300 uppercase">
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Properties</span>
                </span>
                {selectedProp && (
                  <span className="font-mono-tabular text-[10px] text-slate-400 uppercase">
                    {selectedProp.type.replace('_', ' ')}
                  </span>
                )}
              </div>

              {!selectedProp ? (
                <div className="border border-white/10 bg-black/40 p-3 text-center text-[11px] text-slate-400">
                  Click any 3D prop in the viewport or select an item in Explorer to inspect &amp; transform it with Move / Scale / Rotate gizmos.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Data: Name */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400 uppercase">
                      Name
                    </label>
                    <input
                      type="text"
                      value={selectedProp.name ?? ''}
                      placeholder={selectedProp.type.replace('_', ' ')}
                      onChange={(e) => updateSelectedProp({ name: e.target.value || undefined }, false)}
                      className="w-full border border-white/15 bg-black/70 px-2 py-1 text-xs text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  {/* Appearance: Material & Color */}
                  <div className="space-y-2 border border-white/10 bg-black/45 p-2">
                    <div className="text-[10px] font-bold text-sky-300 uppercase">Appearance</div>
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">Material</label>
                      <select
                        value={selectedProp.material ?? 'default'}
                        onChange={(e) =>
                          updateSelectedProp({ material: e.target.value as StudioMaterialId })
                        }
                        className="w-full border border-white/15 bg-black/75 px-2 py-1 text-xs text-white"
                      >
                        {STUDIO_PROP_MATERIAL_DEFS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">Color</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {PROP_ACCENT_SWATCHES.map((sw) => {
                          const active = (selectedProp.colorHex ?? '') === sw.hex;
                          return (
                            <button
                              key={sw.label}
                              type="button"
                              title={sw.label}
                              onClick={() => updateSelectedProp({ colorHex: sw.hex || undefined })}
                              className={`h-4 w-4 border ${
                                active ? 'scale-110 border-white' : 'border-white/25'
                              }`}
                              style={{ backgroundColor: sw.hex || '#334155' }}
                            />
                          );
                        })}
                        <input
                          type="color"
                          value={selectedProp.colorHex || '#38bdf8'}
                          onChange={(e) => updateSelectedProp({ colorHex: e.target.value }, false)}
                          className="h-4 w-5 cursor-pointer border border-white/25 bg-transparent"
                          title="Custom Prop Color"
                        />
                      </div>
                    </div>
                    <label className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>CastShadow</span>
                      <input
                        type="checkbox"
                        checked={selectedProp.castShadow !== false}
                        onChange={(e) => updateSelectedProp({ castShadow: e.target.checked })}
                        className="accent-sky-400"
                      />
                    </label>
                  </div>

                  {/* Position */}
                  <div className="space-y-1.5 border border-white/10 bg-black/45 p-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold text-sky-300 uppercase">Position (m)</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={Boolean(selectedProp.locked)}
                          onClick={() => onSnapPropToRoad?.(selectedProp.id)}
                          title="Snap flush onto road surface and align to track heading & bank"
                          className="inline-flex items-center gap-1 border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 uppercase hover:border-emerald-300 disabled:opacity-40"
                        >
                          <Navigation className="h-2.5 w-2.5" />
                          <span>Snap Road</span>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(selectedProp.locked)}
                          onClick={dropSelectedPropToGround}
                          className="inline-flex items-center gap-1 border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-200 uppercase hover:border-sky-400 disabled:opacity-40"
                        >
                          <ArrowDownToLine className="h-2.5 w-2.5" />
                          <span>Drop Y</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <label key={axis} className="block">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{axis}</span>
                          <input
                            type="number"
                            step={0.5}
                            disabled={Boolean(selectedProp.locked)}
                            value={Number((selectedProp[axis] ?? 0).toFixed(2))}
                            onChange={(e) =>
                              updateSelectedProp({ [axis]: Number(e.target.value) || 0 }, false)
                            }
                            className="w-full border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[11px] text-white"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Size / Scale */}
                  <div className="space-y-1.5 border border-white/10 bg-black/45 p-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-amber-300 uppercase">Size / Scale</span>
                      <span className="font-mono-tabular text-white">{selectedProp.scale.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={6.0}
                      step={0.05}
                      disabled={Boolean(selectedProp.locked)}
                      value={selectedProp.scale}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateSelectedProp(
                          { scale: v, scaleX: v, scaleY: v, scaleZ: v },
                          false,
                        );
                      }}
                      className="w-full accent-amber-400"
                    />
                    <div className="grid grid-cols-3 gap-1">
                      {(['scaleX', 'scaleY', 'scaleZ'] as const).map((sk) => {
                        const val = selectedProp[sk] ?? selectedProp.scale ?? 1;
                        return (
                          <label key={sk} className="block">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              {sk.replace('scale', 'Size ')}
                            </span>
                            <input
                              type="number"
                              min={0.2}
                              max={6.0}
                              step={0.1}
                              disabled={Boolean(selectedProp.locked)}
                              value={Number(val.toFixed(2))}
                              onChange={(e) =>
                                updateSelectedProp(
                                  { [sk]: Math.max(0.2, Math.min(6.0, Number(e.target.value) || 1)) },
                                  false,
                                )
                              }
                              className="w-full border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[11px] text-white"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Orientation (Degrees) */}
                  <div className="space-y-1.5 border border-white/10 bg-black/45 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-sky-300 uppercase">Orientation (°)</span>
                      <button
                        type="button"
                        disabled={Boolean(selectedProp.locked)}
                        onClick={() => updateSelectedProp({ rotX: 0, rotY: 0, rotZ: 0 })}
                        className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-300 uppercase"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div>
                        <span className="text-[9px] text-slate-400">Pitch X</span>
                        <input
                          type="number"
                          step={5}
                          disabled={Boolean(selectedProp.locked)}
                          value={degFromRad(selectedProp.rotX)}
                          onChange={(e) =>
                            updateSelectedProp({ rotX: radFromDeg(Number(e.target.value) || 0) }, false)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[11px] text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400">Yaw Y</span>
                        <input
                          type="number"
                          step={5}
                          disabled={Boolean(selectedProp.locked)}
                          value={degFromRad(selectedProp.rotY)}
                          onChange={(e) =>
                            updateSelectedProp({ rotY: radFromDeg(Number(e.target.value) || 0) }, false)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[11px] text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400">Roll Z</span>
                        <input
                          type="number"
                          step={5}
                          disabled={Boolean(selectedProp.locked)}
                          value={degFromRad(selectedProp.rotZ)}
                          onChange={(e) =>
                            updateSelectedProp({ rotZ: radFromDeg(Number(e.target.value) || 0) }, false)
                          }
                          className="w-full border border-white/15 bg-black/75 px-1.5 py-1 font-mono-tabular text-[11px] text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Behavior: CanCollide & Locked */}
                  <div className="space-y-1.5 border border-white/10 bg-black/45 p-2">
                    <div className="text-[10px] font-bold text-emerald-300 uppercase">Behavior</div>
                    <label className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>CanCollide</span>
                      <input
                        type="checkbox"
                        checked={selectedProp.canCollide !== false}
                        onChange={(e) => updateSelectedProp({ canCollide: e.target.checked })}
                        className="accent-emerald-400"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Locked (Disable Gizmo)</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedProp.locked)}
                        onChange={(e) => updateSelectedProp({ locked: e.target.checked })}
                        className="accent-amber-400"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── BOTTOM VIEWPORT HINT BAR ── */}
      <div className="pointer-events-none flex justify-center pb-0.5">
        <div className="gt5-panel hidden sm:block border border-white/15 bg-[#090d14]/88 px-3 py-1 font-mono-tabular text-[10px] tracking-wide text-slate-300">
          {studioToolMode === 'select' &&
            'SELECT · Drag 3D Cyan Pins (Shift+Drag Y) · Click Prop · WASD+QE Fly (Shift Fast) · F Focus'}
          {studioToolMode === 'move' &&
            'MOVE GIZMO · Drag XYZ Arrows or 3D Track Pins · WASD+QE Fly · F Focus · Ctrl+D Duplicate · Del Remove'}
          {studioToolMode === 'scale' &&
            'SCALE GIZMO · Drag handles to resize · WASD+QE Fly · Undo Ctrl+Z · Redo Ctrl+Y'}
          {studioToolMode === 'rotate' &&
            'ROTATE GIZMO · Drag axis rings to orient · WASD+QE Fly · Snap Road aligns tangent'}
          {studioToolMode === 'place' &&
            `PLACE (${activePropType.replace('_', ' ').toUpperCase()}) · Click 3D road or terrain to snap & align · WASD+QE Fly`}
          {studioToolMode === 'terrain' &&
            `TERRAIN ${terrainToolConfig.mode === 'material' ? `PAINT (${terrainToolConfig.materialId.toUpperCase()})` : `SCULPT (${terrainToolConfig.sculptOp.toUpperCase()})`} · Drag on 3D ground · Radius ${terrainToolConfig.radius}m · WASD+QE Fly`}
        </div>
        <div className="gt5-panel sm:hidden border border-white/15 bg-[#090d14]/88 px-2.5 py-1 font-mono-tabular text-[10px] text-slate-300 truncate max-w-full">
          {studioToolMode.toUpperCase()} · 1-finger orbit · 2-finger zoom/pan · Tap pins or props
        </div>
      </div>

      {/* Build Slots Manager Modal */}
      {slotsModalOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/84 p-0 sm:p-4"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div
            className="gt5-panel gt5-carbon flex h-[92dvh] sm:h-auto sm:max-h-[88dvh] w-full max-w-3xl flex-col border border-white/15 bg-[#0b0e14] shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/55 px-4 py-3 sm:px-5 sm:py-3.5 shrink-0">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-display text-sm sm:text-base font-bold text-white uppercase">
                  <Layers className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="truncate">Build Map Slots ({Math.max(1, buildSlots.length)})</span>
                </h3>
                <p className="hidden sm:block text-xs text-slate-400">
                  Create separate custom tracks, switch slots cleanly, duplicate backups, or save directly to your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSlotsModalOpen(false)}
                className="h-10 sm:h-auto border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
              >
                Close
              </button>
            </div>

            {/* Create New Slot Bar */}
            <div className="border-b border-white/10 bg-black/40 p-3.5 sm:p-4 shrink-0">
              <div className="mb-1.5 text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                Create New Build Slot
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newSlotTemplateId}
                  onChange={(e) => setNewSlotTemplateId(e.target.value as MapTemplateId)}
                  aria-label="New slot template"
                  className="h-10 sm:h-auto w-full sm:w-auto border border-white/15 bg-black/75 px-2.5 py-2 text-sm sm:text-xs text-white"
                >
                  {Object.values(MAP_TEMPLATES).map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newSlotTitle}
                  onChange={(e) => setNewSlotTitle(e.target.value)}
                  maxLength={48}
                  placeholder="Optional custom slot name..."
                  className="min-w-[180px] flex-1 border border-white/15 bg-black/75 px-2.5 py-2 text-base sm:text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    onCreateNewSlot(newSlotTemplateId, newSlotTitle.trim() || undefined);
                    setNewSlotTitle('');
                    setSlotsModalOpen(false);
                    setLocalBanner('Created and opened a new build slot.');
                  }}
                  className="inline-flex h-10 sm:h-auto w-full sm:w-auto items-center justify-center gap-1.5 bg-emerald-400 px-3.5 py-2 font-display text-xs font-bold text-slate-950 uppercase hover:bg-emerald-300 whitespace-nowrap shrink-0"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  <span>New Slot</span>
                </button>
              </div>
            </div>

            {/* Saved & Active Slots List */}
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {buildSlots.map((slot, idx) => {
                const isActive = slot.id === blueprint.id;
                const displaySlot = isActive ? blueprint : slot;
                const isDeleting = confirmDeleteSlotId === slot.id;
                const isRenaming = renamingSlotId === slot.id;

                return (
                  <div
                    key={slot.id}
                    className={`border p-3 transition-colors ${
                      isActive
                        ? 'border-sky-400/70 bg-sky-500/12'
                        : 'border-white/12 bg-black/50 hover:border-white/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="border border-white/15 bg-black/70 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-slate-300 uppercase">
                            Slot {String(idx + 1).padStart(2, '0')}
                          </span>
                          {isActive && (
                            <span className="border border-sky-400/60 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-200 uppercase">
                              Active{hasUnsavedChanges ? ' · Unsaved' : ''}
                            </span>
                          )}
                          <span
                            className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              displaySlot.isPublished
                                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                                : 'border-white/15 bg-white/5 text-slate-400'
                            }`}
                          >
                            {displaySlot.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </div>

                        {isRenaming && isActive ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = renameSlotValue.trim();
                              if (trimmed) {
                                onChangeBlueprint(
                                  { ...blueprint, title: trimmed, updatedAt: Date.now() },
                                  'none',
                                  selectedPropId,
                                  false,
                                );
                              }
                              setRenamingSlotId(null);
                            }}
                            className="mt-2 flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={renameSlotValue}
                              onChange={(e) => setRenameSlotValue(e.target.value)}
                              maxLength={48}
                              autoFocus
                              className="flex-1 border border-sky-400/60 bg-black/80 px-2 py-1.5 sm:py-1 text-base sm:text-xs text-white focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="h-9 sm:h-auto border border-emerald-400/60 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-200 uppercase whitespace-nowrap shrink-0"
                            >
                              Apply
                            </button>
                          </form>
                        ) : (
                          <h4 className="mt-1.5 truncate font-display text-sm font-bold text-white uppercase">
                            {displaySlot.title}
                          </h4>
                        )}

                        <div className="mt-0.5 font-mono-tabular text-[10px] text-slate-400">
                          {displaySlot.controlPoints.length} Nodes · {displaySlot.placedProps.length} Props · {(displaySlot.mapType ?? 'circuit').toUpperCase()} · Updated {new Date(displaySlot.updatedAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchSlot(slot.id);
                              setSlotsModalOpen(false);
                              setLocalBanner(`Switched to build slot "${slot.title}"`);
                            }}
                            className="bg-sky-500 px-3 py-1.5 font-display text-[11px] font-bold text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                          >
                            Load Slot
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingSlotId(slot.id);
                                setRenameSlotValue(displaySlot.title);
                              }}
                              className="border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-white/35 whitespace-nowrap shrink-0"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                void triggerExplicitSave();
                              }}
                              className="inline-flex items-center gap-1 border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200 uppercase hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
                            >
                              <Save className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            onDuplicateSlot(slot.id);
                            setLocalBanner(`Duplicated "${displaySlot.title}" into a new slot.`);
                          }}
                          title="Duplicate Build Slot"
                          className="inline-flex items-center gap-1 border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-sky-400/60 whitespace-nowrap shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Duplicate</span>
                        </button>

                        {isDeleting ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteSlot(slot.id);
                                setConfirmDeleteSlotId(null);
                                setLocalBanner(`Deleted build slot "${displaySlot.title}".`);
                              }}
                              className="border border-rose-400 bg-rose-500 px-2.5 py-1.5 text-[11px] font-bold text-white uppercase hover:bg-rose-400 whitespace-nowrap shrink-0"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSlotId(null)}
                              className="border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSlotId(slot.id)}
                            title="Delete Build Slot"
                            className="inline-flex items-center gap-1 border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Studio Template Gallery Modal (freezes background while open) */}
      {templateGalleryOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/82 p-0 sm:p-4"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div
            className="gt5-panel gt5-carbon flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden border border-white/15 bg-[#0b0e14] p-4 sm:p-5 shadow-2xl"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/12 pb-3 shrink-0">
              <div className="min-w-0">
                <h3 className="font-display text-sm sm:text-base font-bold text-white uppercase">
                  Studio Baseplate Templates
                </h3>
                <p className="text-xs text-slate-400">
                  Start on a clean flat baseplate or crossover auto-tunnel circuit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateGalleryOpen(false)}
                className="h-10 sm:h-auto border border-white/15 bg-white/5 px-3.5 py-1 text-xs text-slate-300 hover:text-white shrink-0"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid flex-1 grid-cols-1 gap-2.5 overflow-y-auto sm:grid-cols-2">
              {Object.values(MAP_TEMPLATES).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    const next = createBlueprintFromTemplate(
                      tpl.id,
                      user?.id ?? blueprint.authorId,
                      user?.username ?? blueprint.authorUsername,
                    );
                    setSelectedPtIdx(0);
                    onSelectProp(null);
                    onChangeBlueprint(next, 'full', null, true);
                    setLocalBanner(`Loaded template: ${tpl.name}`);
                    setTemplateGalleryOpen(false);
                  }}
                  className="border border-white/12 bg-black/55 p-3 text-left transition-colors hover:border-sky-400"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-xs font-bold text-white uppercase">
                      {tpl.name}
                    </span>
                    <span className="border border-sky-400/35 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 uppercase">
                      {tpl.mapType} · {tpl.difficulty}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{tpl.subtitle}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
