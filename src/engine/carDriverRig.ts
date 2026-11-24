import * as THREE from 'three';
import type { CarLiveryVariant } from './mclarenCarLoader';

export interface CarDriverInstance {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  wireframeMats: THREE.MeshStandardMaterial[];
  setSteer: (steerRad: number) => void;
  dispose: () => void;
}

interface DriverPalette {
  suitHex: number;
  stripeHex: number;
  helmetHex: number;
  visorHex: number;
  gloveHex: number;
}

const DRIVER_PALETTES: Record<CarLiveryVariant, DriverPalette> = {
  stealth_black: {
    suitHex: 0x1e2430,
    stripeHex: 0x38bdf8,
    helmetHex: 0xf8fafc,
    visorHex: 0x0b1628,
    gloveHex: 0xef4444,
  },
  platinum_silver: {
    suitHex: 0xe2e8f0,
    stripeHex: 0x0ea5e9,
    helmetHex: 0x0f172a,
    visorHex: 0x164e63,
    gloveHex: 0x0f172a,
  },
  titanium_gunmetal: {
    suitHex: 0x334155,
    stripeHex: 0xf59e0b,
    helmetHex: 0xe2e8f0,
    visorHex: 0x1e1b4b,
    gloveHex: 0xf59e0b,
  },
  obsidian_bronze: {
    suitHex: 0x292524,
    stripeHex: 0xfbbf24,
    helmetHex: 0xd97706,
    visorHex: 0x090d16,
    gloveHex: 0x1c1917,
  },
  papaya_orange: {
    suitHex: 0x18181b,
    stripeHex: 0xf97316,
    helmetHex: 0xf97316,
    visorHex: 0x082f49,
    gloveHex: 0xf8fafc,
  },
};

interface SharedDriverGeos {
  pelvis: THREE.BoxGeometry;
  torso: THREE.CylinderGeometry;
  chestStripe: THREE.BoxGeometry;
  shoulder: THREE.SphereGeometry;
  upperArm: THREE.CylinderGeometry;
  forearm: THREE.CylinderGeometry;
  glove: THREE.BoxGeometry;
  hansCollar: THREE.TorusGeometry;
  neck: THREE.CylinderGeometry;
  helmetShell: THREE.SphereGeometry;
  chinBar: THREE.BoxGeometry;
  visor: THREE.CylinderGeometry;
  crest: THREE.BoxGeometry;
}

let cachedGeos: SharedDriverGeos | null = null;

function getSharedDriverGeos(): SharedDriverGeos {
  if (cachedGeos) return cachedGeos;

  const pelvis = new THREE.BoxGeometry(0.32, 0.14, 0.24);
  const torso = new THREE.CylinderGeometry(0.175, 0.145, 0.42, 10);
  const chestStripe = new THREE.BoxGeometry(0.24, 0.36, 0.18);
  const shoulder = new THREE.SphereGeometry(0.072, 8, 8);
  const upperArm = new THREE.CylinderGeometry(0.044, 0.038, 0.24, 8);
  upperArm.rotateX(Math.PI * 0.5);
  const forearm = new THREE.CylinderGeometry(0.036, 0.030, 0.23, 8);
  forearm.rotateX(Math.PI * 0.5);
  const glove = new THREE.BoxGeometry(0.068, 0.058, 0.095);
  const hansCollar = new THREE.TorusGeometry(0.115, 0.026, 6, 12, Math.PI * 1.35);
  hansCollar.rotateX(Math.PI * 0.5);
  hansCollar.rotateZ(-Math.PI * 0.18);
  const neck = new THREE.CylinderGeometry(0.056, 0.064, 0.10, 8);

  const helmetShell = new THREE.SphereGeometry(0.132, 14, 12);
  helmetShell.scale(0.92, 1.02, 1.08);
  const chinBar = new THREE.BoxGeometry(0.165, 0.085, 0.105);
  const visor = new THREE.CylinderGeometry(0.128, 0.124, 0.068, 12, 1, false, -Math.PI * 0.38, Math.PI * 0.76);
  const crest = new THREE.BoxGeometry(0.036, 0.024, 0.22);

  cachedGeos = {
    pelvis,
    torso,
    chestStripe,
    shoulder,
    upperArm,
    forearm,
    glove,
    hansCollar,
    neck,
    helmetShell,
    chinBar,
    visor,
    crest,
  };
  return cachedGeos;
}

export function createCarDriverInstance(options: {
  steeringCenter: THREE.Vector3;
  canopyCeilingY: number;
  glassFloorY: number;
  isOpenWheel?: boolean;
  livery?: CarLiveryVariant;
}): CarDriverInstance {
  const {
    steeringCenter,
    canopyCeilingY,
    glassFloorY,
    isOpenWheel = false,
    livery = 'stealth_black',
  } = options;

  const geos = getSharedDriverGeos();
  const palette = DRIVER_PALETTES[livery] ?? DRIVER_PALETTES.stealth_black;

  const group = new THREE.Group();
  group.name = 'CarRacingDriver';

  const suitMat = new THREE.MeshStandardMaterial({
    color: palette.suitHex,
    roughness: 0.76,
    metalness: 0.06,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: palette.stripeHex,
    roughness: 0.55,
    metalness: 0.14,
  });
  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: palette.helmetHex,
    roughness: 0.16,
    metalness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: palette.visorHex,
    roughness: 0.06,
    metalness: 0.78,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: palette.gloveHex,
    roughness: 0.68,
    metalness: 0.08,
  });
  const hansMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    roughness: 0.42,
    metalness: 0.22,
  });

  const mats: THREE.Material[] = [suitMat, stripeMat, helmetMat, visorMat, gloveMat, hansMat];
  const wireframeMats: THREE.MeshStandardMaterial[] = [
    suitMat,
    stripeMat,
    helmetMat,
    visorMat,
    gloveMat,
    hansMat,
  ];
  const meshes: THREE.Mesh[] = [];

  const registerMesh = (m: THREE.Mesh, castShadow = false) => {
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.userData.carPaintWeight = 0.05;
    meshes.push(m);
    return m;
  };

  // Compute natural reclined racing seat posture anchored behind steeringCenter
  const wheelZ = steeringCenter.z;
  const wheelY = steeringCenter.y;
  const driverX = isOpenWheel ? 0 : steeringCenter.x;

  // Ensure helmet crown always clears the canopy ceiling cleanly without clipping roof
  const rawHeadY = Math.max(glassFloorY + 0.16, wheelY + (isOpenWheel ? 0.14 : 0.17));
  const maxHeadY = Math.max(glassFloorY + 0.12, canopyCeilingY - (isOpenWheel ? 0.02 : 0.155));
  const headY = Math.min(rawHeadY, maxHeadY);
  const headZ = wheelZ - (isOpenWheel ? 0.44 : 0.41);

  const shoulderY = headY - 0.19;
  const shoulderZ = headZ - 0.04;
  const torsoRecline = isOpenWheel ? -0.34 : -0.22;

  const bodyAnchor = new THREE.Group();
  bodyAnchor.position.set(driverX, shoulderY - 0.14, shoulderZ - 0.05);
  bodyAnchor.rotation.x = torsoRecline;
  group.add(bodyAnchor);

  const pelvisMesh = registerMesh(new THREE.Mesh(geos.pelvis, suitMat));
  pelvisMesh.position.set(0, -0.22, 0.04);
  bodyAnchor.add(pelvisMesh);

  const torsoMesh = registerMesh(new THREE.Mesh(geos.torso, suitMat));
  torsoMesh.position.set(0, -0.02, 0);
  torsoMesh.scale.set(1.0, 1.0, 0.72);
  bodyAnchor.add(torsoMesh);

  const stripeMesh = registerMesh(new THREE.Mesh(geos.chestStripe, stripeMat));
  stripeMesh.position.set(0, 0.0, 0.052);
  stripeMesh.scale.set(1.0, 1.0, 0.65);
  bodyAnchor.add(stripeMesh);

  const hansMesh = registerMesh(new THREE.Mesh(geos.hansCollar, hansMat));
  hansMesh.position.set(0, 0.17, 0.02);
  bodyAnchor.add(hansMesh);

  const neckMesh = registerMesh(new THREE.Mesh(geos.neck, hansMat));
  neckMesh.position.set(0, 0.21, 0.01);
  bodyAnchor.add(neckMesh);

  // Articulated Head / Racing Helmet Pivot (leans slightly into steering turn)
  const headPivot = new THREE.Group();
  headPivot.position.set(driverX, headY, headZ);
  group.add(headPivot);

  const helmetMesh = registerMesh(new THREE.Mesh(geos.helmetShell, helmetMat), !isOpenWheel);
  headPivot.add(helmetMesh);

  const chinMesh = registerMesh(new THREE.Mesh(geos.chinBar, helmetMat));
  chinMesh.position.set(0, -0.055, 0.078);
  headPivot.add(chinMesh);

  const visorMesh = registerMesh(new THREE.Mesh(geos.visor, visorMat));
  visorMesh.position.set(0, 0.008, 0.024);
  headPivot.add(visorMesh);

  const crestMesh = registerMesh(new THREE.Mesh(geos.crest, stripeMat));
  crestMesh.position.set(0, 0.132, -0.01);
  headPivot.add(crestMesh);

  // Articulated Left & Right Arms + Gloves reaching the steering wheel rim
  const wheelRadiusGrip = 0.138;
  const handGroup = new THREE.Group();
  handGroup.position.set(driverX, wheelY, wheelZ - 0.02);
  group.add(handGroup);

  const armSpecs: Array<{ side: 1 | -1; shoulderX: number }> = [
    { side: 1, shoulderX: driverX + 0.185 },
    { side: -1, shoulderX: driverX - 0.185 },
  ];

  const armTargets: Array<{
    side: 1 | -1;
    forearmMesh: THREE.Mesh;
    gloveMesh: THREE.Mesh;
    baseForearmPos: THREE.Vector3;
    baseGlovePos: THREE.Vector3;
    elbowPos: THREE.Vector3;
  }> = [];

  for (const spec of armSpecs) {
    const sh = registerMesh(new THREE.Mesh(geos.shoulder, suitMat));
    sh.position.set(spec.shoulderX, shoulderY, shoulderZ);
    group.add(sh);

    const elbowPos = new THREE.Vector3(
      spec.shoulderX + spec.side * 0.035,
      shoulderY - 0.13,
      shoulderZ + 0.16,
    );
    const shPos = sh.position;

    const ua = registerMesh(new THREE.Mesh(geos.upperArm, suitMat));
    ua.position.copy(shPos).lerp(elbowPos, 0.5);
    ua.lookAt(elbowPos);
    group.add(ua);

    const handWorld = new THREE.Vector3(
      driverX + spec.side * wheelRadiusGrip,
      wheelY,
      wheelZ - 0.02,
    );

    const fa = registerMesh(new THREE.Mesh(geos.forearm, suitMat));
    fa.position.copy(elbowPos).lerp(handWorld, 0.5);
    fa.lookAt(handWorld);
    group.add(fa);

    const gl = registerMesh(new THREE.Mesh(geos.glove, gloveMat));
    gl.position.copy(handWorld);
    gl.rotation.z = spec.side * 0.16;
    group.add(gl);

    armTargets.push({
      side: spec.side,
      forearmMesh: fa,
      gloveMesh: gl,
      baseForearmPos: fa.position.clone(),
      baseGlovePos: gl.position.clone(),
      elbowPos,
    });
  }

  const _handScratch = new THREE.Vector3();

  const setSteer = (steerRad: number) => {
    const clampedSteer = Math.max(-0.65, Math.min(0.65, steerRad));
    headPivot.rotation.y = clampedSteer * 0.24;
    headPivot.rotation.z = -clampedSteer * 0.14;

    const wheelRot = -clampedSteer * 1.45;
    const cosR = Math.cos(wheelRot);
    const sinR = Math.sin(wheelRot);
    for (let i = 0; i < armTargets.length; i++) {
      const a = armTargets[i];
      const lx = a.side * wheelRadiusGrip;
      const rx = lx * cosR;
      const ry = lx * sinR;
      _handScratch.set(driverX + rx, wheelY + ry, wheelZ - 0.02);
      a.gloveMesh.position.copy(_handScratch);
      a.gloveMesh.rotation.z = wheelRot + a.side * 0.16;
      a.forearmMesh.position.copy(a.elbowPos).lerp(_handScratch, 0.5);
      a.forearmMesh.lookAt(_handScratch);
    }
  };

  return {
    group,
    meshes,
    wireframeMats,
    setSteer,
    dispose: () => {
      for (const m of mats) m.dispose();
    },
  };
}
