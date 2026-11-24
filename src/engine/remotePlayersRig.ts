import * as THREE from 'three';
import type { MultiplayerCarPose } from '../shared/socialTypes';
import { type CarModelId, type McLarenCarInstance, type McLarenTemplate, normalizeCarModelId } from './mclarenCarLoader';
import { getDefaultVisualCustomization } from './carCustomization';

interface RemoteCarEntry {
  userId: string;
  username: string;
  carId: CarModelId;
  paintHex: string;
  root: THREE.Group;
  carInstance: McLarenCarInstance | null;
  fallbackGroup: THREE.Group | null;
  nameSprite: THREE.Sprite;
  nameTex: THREE.CanvasTexture;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  targetQuat: THREE.Quaternion;
  velX: number;
  velZ: number;
  speedMps: number;
  steerNorm: number;
  wheelSpin: number;
  braking: boolean;
  headlightsOn: boolean;
  lastUpdatedMs: number;
  ghosted: boolean;
}

const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function createNametagSprite(username: string): { sprite: THREE.Sprite; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.82)';
  ctx.fillRect(8, 8, 240, 40);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 240, 40);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(username.slice(0, 18), 128, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 2.25, 0);
  sprite.scale.set(3.2, 0.7, 1);
  return { sprite, tex };
}

function createFallbackSilhouette(paintHex: string): THREE.Group {
  const grp = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(1.95, 0.62, 4.45);
  const cabinGeo = new THREE.BoxGeometry(1.48, 0.44, 1.95);
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12);
  wheelGeo.rotateZ(Math.PI * 0.5);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: paintHex || '#38bdf8',
    roughness: 0.3,
    metalness: 0.7,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.15,
    metalness: 0.9,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.98, -0.15);

  grp.add(body, cabin);
  const wheelOffsets: Array<[number, number, number]> = [
    [0.92, 0.35, 1.38],
    [-0.92, 0.35, 1.38],
    [0.92, 0.35, -1.38],
    [-0.92, 0.35, -1.38],
  ];
  for (const [wx, wy, wz] of wheelOffsets) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, wy, wz);
    grp.add(w);
  }
  return grp;
}

function setCarGhostOpacity(root: THREE.Object3D, ghosted: boolean) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat instanceof THREE.SpriteMaterial) continue;
      if (ghosted) {
        if (!mat.userData.__origOpSaved) {
          mat.userData.__origOpSaved = true;
          mat.userData.__origTransparent = mat.transparent;
          mat.userData.__origOpacity = mat.opacity;
        }
        mat.transparent = true;
        mat.opacity = Math.min(mat.userData.__origOpacity ?? 1, 0.44);
      } else if (mat.userData.__origOpSaved) {
        mat.transparent = Boolean(mat.userData.__origTransparent);
        mat.opacity = Number(mat.userData.__origOpacity ?? 1);
      }
      mat.needsUpdate = true;
    }
  });
}

export class RemotePlayersRig {
  public readonly group = new THREE.Group();
  private entries = new Map<string, RemoteCarEntry>();
  private ghostMode = true;

  constructor(
    private getTemplate: (carId: CarModelId) => McLarenTemplate | undefined,
    private requestTemplate: (carId: CarModelId) => void,
  ) {
    this.group.name = 'RemoteMultiplayerCars';
  }

  public setGhostMode(ghosted: boolean) {
    if (this.ghostMode === ghosted) return;
    this.ghostMode = ghosted;
    this.entries.forEach((entry) => {
      entry.ghosted = ghosted;
      setCarGhostOpacity(entry.root, ghosted);
    });
  }

  public upsertPose(pose: MultiplayerCarPose) {
    let entry = this.entries.get(pose.userId);
    const carId = normalizeCarModelId(pose.carId);

    if (!entry) {
      const root = new THREE.Group();
      const { sprite, tex } = createNametagSprite(pose.username);
      root.add(sprite);

      const fallback = createFallbackSilhouette(pose.paintHex);
      root.add(fallback);

      const startPos = new THREE.Vector3(pose.x, pose.y, pose.z);
      _tmpEuler.set(pose.pitchRad || 0, pose.headingRad || 0, pose.rollRad || 0, 'YXZ');
      const startQuat = new THREE.Quaternion().setFromEuler(_tmpEuler);
      root.position.copy(startPos);
      root.quaternion.copy(startQuat);

      entry = {
        userId: pose.userId,
        username: pose.username,
        carId,
        paintHex: pose.paintHex || '#38bdf8',
        root,
        carInstance: null,
        fallbackGroup: fallback,
        nameSprite: sprite,
        nameTex: tex,
        currentPos: startPos.clone(),
        targetPos: startPos.clone(),
        currentQuat: startQuat.clone(),
        targetQuat: startQuat.clone(),
        velX: Math.sin(pose.headingRad || 0) * (pose.speedMps || 0),
        velZ: Math.cos(pose.headingRad || 0) * (pose.speedMps || 0),
        speedMps: pose.speedMps || 0,
        steerNorm: pose.steerNorm || 0,
        wheelSpin: 0,
        braking: pose.braking,
        headlightsOn: pose.headlightsOn,
        lastUpdatedMs: performance.now(),
        ghosted: this.ghostMode,
      };
      this.entries.set(pose.userId, entry);
      this.group.add(root);
      this.tryAttachTemplate(entry);
      setCarGhostOpacity(root, this.ghostMode);
    }

    if (entry.carId !== carId) {
      entry.carId = carId;
      if (entry.carInstance) {
        entry.root.remove(entry.carInstance.root);
        entry.carInstance.dispose();
        entry.carInstance = null;
      }
      if (!entry.fallbackGroup) {
        entry.fallbackGroup = createFallbackSilhouette(pose.paintHex);
        entry.root.add(entry.fallbackGroup);
      }
    }

    if (entry.paintHex !== pose.paintHex && pose.paintHex) {
      entry.paintHex = pose.paintHex;
      if (entry.carInstance) {
        entry.carInstance.setVisualCustomization({
          ...getDefaultVisualCustomization(entry.carId),
          paintHex: pose.paintHex,
        });
      }
    }

    entry.targetPos.set(pose.x, pose.y, pose.z);
    _tmpEuler.set(pose.pitchRad || 0, pose.headingRad || 0, pose.rollRad || 0, 'YXZ');
    entry.targetQuat.setFromEuler(_tmpEuler);
    entry.speedMps = pose.speedMps || 0;
    entry.velX = Math.sin(pose.headingRad || 0) * entry.speedMps;
    entry.velZ = Math.cos(pose.headingRad || 0) * entry.speedMps;
    entry.steerNorm = pose.steerNorm || 0;
    entry.braking = pose.braking;
    entry.headlightsOn = pose.headlightsOn;
    entry.lastUpdatedMs = performance.now();
  }

  private tryAttachTemplate(entry: RemoteCarEntry) {
    if (entry.carInstance) return;
    const tpl = this.getTemplate(entry.carId);
    if (!tpl) {
      this.requestTemplate(entry.carId);
      return;
    }
    const inst = tpl.createInstance(false);
    inst.setVisualCustomization({
      ...getDefaultVisualCustomization(entry.carId),
      paintHex: entry.paintHex || '#38bdf8',
    });
    entry.carInstance = inst;
    entry.root.add(inst.root);
    if (entry.fallbackGroup) {
      entry.root.remove(entry.fallbackGroup);
      entry.fallbackGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material && !Array.isArray(m.material)) m.material.dispose();
      });
      entry.fallbackGroup = null;
    }
    setCarGhostOpacity(entry.root, this.ghostMode);
  }

  public removePlayer(userId: string) {
    const entry = this.entries.get(userId);
    if (!entry) return;
    this.group.remove(entry.root);
    entry.carInstance?.dispose();
    if (entry.fallbackGroup) {
      entry.fallbackGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (m.material && !Array.isArray(m.material)) m.material.dispose();
      });
    }
    entry.nameTex.dispose();
    (entry.nameSprite.material as THREE.SpriteMaterial).dispose();
    this.entries.delete(userId);
  }

  public clearAll() {
    for (const id of Array.from(this.entries.keys())) {
      this.removePlayer(id);
    }
  }

  public update(deltaSec: number, nightFactor: number, wetness: number) {
    const now = performance.now();
    const posAlpha = 1 - Math.exp(-12.5 * deltaSec);
    const rotAlpha = 1 - Math.exp(-12.5 * deltaSec);

    this.entries.forEach((entry, userId) => {
      if (now - entry.lastUpdatedMs > 8500) {
        this.removePlayer(userId);
        return;
      }
      if (!entry.carInstance) {
        this.tryAttachTemplate(entry);
      }
      if (entry.currentPos.distanceToSquared(entry.targetPos) > 1600) {
        entry.currentPos.copy(entry.targetPos);
        entry.currentQuat.copy(entry.targetQuat);
      } else {
        entry.currentPos.lerp(entry.targetPos, posAlpha);
        entry.currentQuat.slerp(entry.targetQuat, rotAlpha);
      }
      entry.root.position.copy(entry.currentPos);
      entry.root.quaternion.copy(entry.currentQuat);

      if (entry.carInstance) {
        const radius = entry.carInstance.wheelRadius || 0.34;
        entry.wheelSpin += (entry.speedMps / radius) * deltaSec;
        for (let i = 0; i < 4; i++) {
          entry.carInstance.wheelSpinPivots[i].rotation.x = entry.wheelSpin;
        }
        const steerAng = entry.steerNorm * 0.45;
        entry.carInstance.frontWheelSteerPivots[0].rotation.y = steerAng;
        entry.carInstance.frontWheelSteerPivots[1].rotation.y = steerAng;
        entry.carInstance.setLights(entry.headlightsOn, entry.braking ? 1 : 0, nightFactor);
        entry.carInstance.setDirtAndWeather(0.05, wetness);
      }
    });
  }

  public getColliderSnapshots(): Array<{
    id: string;
    name: string;
    color: string;
    x: number;
    z: number;
    vx: number;
    vz: number;
    trackT: number;
    totalProgress: number;
  }> {
    if (this.ghostMode) return [];
    const out: Array<{
      id: string;
      name: string;
      color: string;
      x: number;
      z: number;
      vx: number;
      vz: number;
      trackT: number;
      totalProgress: number;
    }> = [];
    this.entries.forEach((e) => {
      out.push({
        id: e.userId,
        name: e.username,
        color: e.paintHex,
        x: e.currentPos.x,
        z: e.currentPos.z,
        vx: e.velX,
        vz: e.velZ,
        trackT: 0,
        totalProgress: 0,
      });
    });
    return out;
  }

  public getTandemCandidates(): Array<{
    userId: string;
    username: string;
    x: number;
    z: number;
    velX: number;
    velZ: number;
    speedMps: number;
    headingRad: number;
  }> {
    const out: Array<{
      userId: string;
      username: string;
      x: number;
      z: number;
      velX: number;
      velZ: number;
      speedMps: number;
      headingRad: number;
    }> = [];
    this.entries.forEach((e) => {
      _tmpEuler.setFromQuaternion(e.currentQuat, 'YXZ');
      out.push({
        userId: e.userId,
        username: e.username,
        x: e.currentPos.x,
        z: e.currentPos.z,
        velX: e.velX,
        velZ: e.velZ,
        speedMps: e.speedMps,
        headingRad: _tmpEuler.y,
      });
    });
    return out;
  }

  public dispose() {
    this.clearAll();
  }
}
