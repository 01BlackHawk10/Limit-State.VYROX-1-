import * as THREE from 'three';

export interface DriverRigBones {
  hips: THREE.Bone;
  spine: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  shoulderL: THREE.Bone;
  upperArmL: THREE.Bone;
  forearmL: THREE.Bone;
  handL: THREE.Bone;
  shoulderR: THREE.Bone;
  upperArmR: THREE.Bone;
  forearmR: THREE.Bone;
  handR: THREE.Bone;
  thighL: THREE.Bone;
  shinL: THREE.Bone;
  footL: THREE.Bone;
  thighR: THREE.Bone;
  shinR: THREE.Bone;
  footR: THREE.Bone;
}

export interface PlaceholderDriverRig {
  root: THREE.Group;
  bones: DriverRigBones;
  skeleton: THREE.Skeleton;
  update: (elapsedSec: number) => void;
  dispose: () => void;
}

export type PodiumCameraAngle = 'auto' | 'car' | 'driver' | 'crane';

export interface PodiumCeremonyRig {
  group: THREE.Group;
  driverRig: PlaceholderDriverRig;
  setPodiumLocation: (x: number, y: number, z: number) => void;
  setPodiumPose: (x: number, y: number, z: number, tanX?: number, tanZ?: number) => void;
  activate: () => void;
  deactivate: () => void;
  getCarParkPose: () => { pos: THREE.Vector3; yaw: number };
  getRivalParkPoses: () => Array<{ pos: THREE.Vector3; yaw: number }>;
  update: (delta: number, elapsedSec: number) => void;
  getPodiumPose: (
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3,
    cameraAngle?: PodiumCameraAngle,
  ) => void;
  dispose: () => void;
}

interface DriverRigBuildOptions {
  accentColor?: number;
  emissiveColor?: number;
  helmetColor?: number;
  hasTrophy?: boolean;
  cheerMode?: 'trophy' | 'fistpump' | 'wave';
  cheerPhase?: number;
  name?: string;
}

function createStepNumberTexture(label: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f141e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 112, 112);
    ctx.fillStyle = accentHex;
    ctx.font = 'bold 76px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an articulated THREE.Bone rigged cheering podium driver.
 * Clean hierarchical bone tree allows effortless replacement with any rigged humanoid GLB later.
 */
function buildRiggedPlaceholderDriver(
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  options: DriverRigBuildOptions = {},
): PlaceholderDriverRig {
  const {
    accentColor = 0x38bdf8,
    emissiveColor = 0x0b3a59,
    helmetColor = 0x11151d,
    hasTrophy = true,
    cheerMode = 'trophy',
    cheerPhase = 0,
    name = 'RiggedPlaceholderDriver',
  } = options;

  const root = new THREE.Group();
  root.name = name;

  const suitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161c26,
      roughness: 0.62,
      metalness: 0.14,
    }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.35,
      metalness: 0.45,
      emissive: emissiveColor,
      emissiveIntensity: 0.32,
    }),
  );
  const helmetMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: helmetColor,
      roughness: 0.14,
      metalness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    }),
  );
  const visorMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      emissive: 0x1e5c8e,
      emissiveIntensity: 0.35,
      roughness: 0.06,
      metalness: 0.9,
      clearcoat: 1.0,
    }),
  );
  const gloveBootMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b0e14,
      roughness: 0.48,
      metalness: 0.2,
    }),
  );
  const trophyGoldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6c343,
      roughness: 0.18,
      metalness: 0.92,
      emissive: 0x452c04,
      emissiveIntensity: 0.18,
    }),
  );

  // Explicit THREE.Bone hierarchy (hips at y = 0.92m above feet)
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.92, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.14, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.24, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.22, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.09, 0);
  neck.add(head);

  const shoulderL = new THREE.Bone();
  shoulderL.name = 'Shoulder_L';
  shoulderL.position.set(0.14, 0.17, 0);
  chest.add(shoulderL);

  const upperArmL = new THREE.Bone();
  upperArmL.name = 'UpperArm_L';
  upperArmL.position.set(0.08, -0.01, 0);
  shoulderL.add(upperArmL);

  const forearmL = new THREE.Bone();
  forearmL.name = 'Forearm_L';
  forearmL.position.set(0, -0.28, 0);
  upperArmL.add(forearmL);

  const handL = new THREE.Bone();
  handL.name = 'Hand_L';
  handL.position.set(0, -0.25, 0);
  forearmL.add(handL);

  const shoulderR = new THREE.Bone();
  shoulderR.name = 'Shoulder_R';
  shoulderR.position.set(-0.14, 0.17, 0);
  chest.add(shoulderR);

  const upperArmR = new THREE.Bone();
  upperArmR.name = 'UpperArm_R';
  upperArmR.position.set(-0.08, -0.01, 0);
  shoulderR.add(upperArmR);

  const forearmR = new THREE.Bone();
  forearmR.name = 'Forearm_R';
  forearmR.position.set(0, -0.28, 0);
  upperArmR.add(forearmR);

  const handR = new THREE.Bone();
  handR.name = 'Hand_R';
  handR.position.set(0, -0.25, 0);
  forearmR.add(handR);

  const thighL = new THREE.Bone();
  thighL.name = 'Thigh_L';
  thighL.position.set(0.11, -0.03, 0);
  hips.add(thighL);

  const shinL = new THREE.Bone();
  shinL.name = 'Shin_L';
  shinL.position.set(0, -0.43, 0);
  thighL.add(shinL);

  const footL = new THREE.Bone();
  footL.name = 'Foot_L';
  footL.position.set(0, -0.42, 0);
  shinL.add(footL);

  const thighR = new THREE.Bone();
  thighR.name = 'Thigh_R';
  thighR.position.set(-0.11, -0.03, 0);
  hips.add(thighR);

  const shinR = new THREE.Bone();
  shinR.name = 'Shin_R';
  shinR.position.set(0, -0.43, 0);
  thighR.add(shinR);

  const footR = new THREE.Bone();
  footR.name = 'Foot_R';
  footR.position.set(0, -0.42, 0);
  shinR.add(footR);

  root.add(hips);

  const allBones: THREE.Bone[] = [
    hips,
    spine,
    chest,
    neck,
    head,
    shoulderL,
    upperArmL,
    forearmL,
    handL,
    shoulderR,
    upperArmR,
    forearmR,
    handR,
    thighL,
    shinL,
    footL,
    thighR,
    shinR,
    footR,
  ];
  const skeleton = new THREE.Skeleton(allBones);

  const attachMesh = (
    bone: THREE.Bone,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    px = 0,
    py = 0,
    pz = 0,
  ) => {
    const m = new THREE.Mesh(trackGeo(geo), mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    bone.add(m);
    return m;
  };

  // Pelvis & Torso
  attachMesh(hips, new THREE.CapsuleGeometry(0.125, 0.08, 6, 12), suitMat, 0, 0.02, 0);
  attachMesh(spine, new THREE.CylinderGeometry(0.145, 0.13, 0.24, 12), suitMat, 0, 0.10, 0);
  attachMesh(chest, new THREE.BoxGeometry(0.35, 0.25, 0.20), suitMat, 0, 0.09, 0);
  attachMesh(chest, new THREE.BoxGeometry(0.365, 0.055, 0.21), accentMat, 0, 0.11, 0);

  // Racing Helmet + Iridium Visor + Aero Spoiler
  attachMesh(neck, new THREE.CylinderGeometry(0.055, 0.065, 0.09, 10), suitMat, 0, 0.04, 0);
  attachMesh(head, new THREE.SphereGeometry(0.135, 16, 14), helmetMat, 0, 0.09, 0);
  attachMesh(head, new THREE.BoxGeometry(0.19, 0.085, 0.10), visorMat, 0, 0.095, 0.095);
  attachMesh(head, new THREE.BoxGeometry(0.04, 0.06, 0.22), accentMat, 0, 0.21, -0.02);

  // Arms & Gloves
  for (const side of ['L', 'R'] as const) {
    const uArm = side === 'L' ? upperArmL : upperArmR;
    const fArm = side === 'L' ? forearmL : forearmR;
    const hand = side === 'L' ? handL : handR;
    attachMesh(uArm, new THREE.CapsuleGeometry(0.052, 0.19, 6, 10), suitMat, 0, -0.14, 0);
    attachMesh(fArm, new THREE.CapsuleGeometry(0.044, 0.17, 6, 10), suitMat, 0, -0.12, 0);
    attachMesh(hand, new THREE.BoxGeometry(0.065, 0.085, 0.055), gloveBootMat, 0, -0.04, 0);
  }

  // Legs & Race Boots
  for (const side of ['L', 'R'] as const) {
    const thigh = side === 'L' ? thighL : thighR;
    const shin = side === 'L' ? shinL : shinR;
    const foot = side === 'L' ? footL : footR;
    attachMesh(thigh, new THREE.CapsuleGeometry(0.072, 0.30, 6, 10), suitMat, 0, -0.21, 0);
    attachMesh(shin, new THREE.CapsuleGeometry(0.056, 0.29, 6, 10), suitMat, 0, -0.20, 0);
    attachMesh(foot, new THREE.BoxGeometry(0.095, 0.075, 0.22), gloveBootMat, 0, -0.02, 0.055);
  }

  // GT Championship Trophy attached to Right Hand (for 1st place winner)
  if (hasTrophy) {
    const trophyGroup = new THREE.Group();
    trophyGroup.position.set(0, -0.03, 0.06);
    trophyGroup.rotation.x = Math.PI * 0.45;
    const cupBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.065, 0.05, 14)), trophyGoldMat);
    const cupStem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.03, 0.11, 12)), trophyGoldMat);
    cupStem.position.y = 0.08;
    const cupBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.095, 0.038, 0.16, 16)), trophyGoldMat);
    cupBowl.position.y = 0.21;
    trophyGroup.add(cupBase, cupStem, cupBowl);
    handR.add(trophyGroup);
  }

  const bones: DriverRigBones = {
    hips,
    spine,
    chest,
    neck,
    head,
    shoulderL,
    upperArmL,
    forearmL,
    handL,
    shoulderR,
    upperArmR,
    forearmR,
    handR,
    thighL,
    shinL,
    footL,
    thighR,
    shinR,
    footR,
  };

  return {
    root,
    bones,
    skeleton,
    update: (elapsedSec: number) => {
      const t = elapsedSec + cheerPhase;
      const bob = Math.sin(t * 2.6) * 0.02;
      hips.position.y = 0.92 + bob;
      spine.rotation.x = 0.035 * Math.sin(t * 1.5);
      chest.rotation.y = 0.11 * Math.sin(t * 0.95);
      head.rotation.y = 0.24 * Math.sin(t * 0.85);
      head.rotation.x = -0.09 + 0.06 * Math.sin(t * 1.8);

      if (cheerMode === 'trophy') {
        // P1 raises & pumps championship trophy while waving left arm
        upperArmR.rotation.set(-2.35 + Math.sin(t * 2.8) * 0.2, 0, -0.32);
        forearmR.rotation.set(-0.32 + Math.sin(t * 2.8) * 0.12, 0, 0);
        upperArmL.rotation.set(-1.45 + Math.sin(t * 3.2 + 0.8) * 0.34, 0, 0.52);
        forearmL.rotation.set(-0.7 + Math.cos(t * 3.2) * 0.22, 0, 0);
      } else if (cheerMode === 'fistpump') {
        // P2 pumps both fists high in celebration
        upperArmR.rotation.set(-2.15 + Math.sin(t * 3.5) * 0.32, 0, -0.45);
        forearmR.rotation.set(-0.65 + Math.cos(t * 3.5) * 0.22, 0, 0);
        upperArmL.rotation.set(-2.05 + Math.cos(t * 3.5) * 0.32, 0, 0.45);
        forearmL.rotation.set(-0.7 + Math.sin(t * 3.5) * 0.22, 0, 0);
      } else {
        // P3 cheers & waves toward P1 and crowd
        upperArmL.rotation.set(-2.2 + Math.sin(t * 3.4) * 0.36, 0, 0.58);
        forearmL.rotation.set(-0.55 + Math.sin(t * 4.2) * 0.28, 0, 0);
        upperArmR.rotation.set(-0.75 + Math.cos(t * 2.9) * 0.26, 0, -0.42);
        forearmR.rotation.set(-0.95 + Math.sin(t * 2.9) * 0.2, 0, 0);
      }

      // Grounded athletic wide stance
      thighL.rotation.set(-0.04, 0, 0.06);
      thighR.rotation.set(0.04, 0, -0.06);
      shinL.rotation.set(0.05, 0, 0);
      shinR.rotation.set(0.04, 0, 0);
    },
    dispose: () => {
      skeleton.dispose();
    },
  };
}

/**
 * Builds the Post-Race Top-3 Victory Pedestal with 3 cheering drivers,
 * Spotlights, Confetti Cannon & Hero Car park pose beside the winners.
 */
export function buildPodiumCeremonyRig(): PodiumCeremonyRig {
  const group = new THREE.Group();
  group.name = 'PodiumCeremonyRig';
  group.visible = false;

  const podiumCenter = new THREE.Vector3(-25.0, 20.0, 236.4);
  group.position.copy(podiumCenter);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTextures: THREE.Texture[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTextures.push(t);
    return t;
  };

  const daisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x151a24,
      roughness: 0.34,
      metalness: 0.45,
    }),
  );
  const goldTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    }),
  );
  const silverTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    }),
  );
  const bronzeTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x92400e,
      emissiveIntensity: 0.5,
      roughness: 0.28,
    }),
  );
  const backdropMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b0f17,
      roughness: 0.45,
      metalness: 0.3,
    }),
  );

  // 3-Tier Championship Podium Steps (P1 Center = 1.05m, P2 Right = 0.68m, P3 Left = 0.46m)
  const tiers: Array<{
    rankLabel: string;
    accentHex: string;
    x: number;
    w: number;
    h: number;
    d: number;
    trim: THREE.Material;
  }> = [
    { rankLabel: '1', accentHex: '#fbbf24', x: 0, w: 2.3, h: 1.05, d: 2.0, trim: goldTrimMat },
    { rankLabel: '2', accentHex: '#38bdf8', x: 2.3, w: 2.1, h: 0.68, d: 1.9, trim: silverTrimMat },
    { rankLabel: '3', accentHex: '#f97316', x: -2.3, w: 2.1, h: 0.46, d: 1.9, trim: bronzeTrimMat },
  ];

  for (const t of tiers) {
    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(t.w, t.h, t.d)), daisMat);
    step.position.set(t.x, t.h * 0.5, 0);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);

    const glowStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(t.w + 0.04, 0.08, t.d + 0.04)), t.trim);
    glowStrip.position.set(t.x, t.h - 0.05, 0);
    group.add(glowStrip);

    const plaqueTex = trackTex(createStepNumberTexture(t.rankLabel, t.accentHex));
    const plaqueMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    const plaqueSize = Math.min(t.h * 0.68, 0.56);
    const plaque = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(plaqueSize, plaqueSize)), plaqueMat);
    plaque.position.set(t.x, t.h * 0.46, t.d * 0.5 + 0.015);
    group.add(plaque);
  }

  // Backdrop Championship Arch Wall behind the podium steps
  const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.2, 3.6, 0.35)), backdropMat);
  backWall.position.set(0, 1.8, -1.25);
  backWall.castShadow = true;
  group.add(backWall);

  const archGlow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.3, 0.12, 0.42)), silverTrimMat);
  archGlow.position.set(0, 3.56, -1.25);
  group.add(archGlow);

  // Victory Spotlights lighting both the Top-3 Pedestal and the Hero Car beside it
  const podiumSpot = new THREE.SpotLight(0xfff1d6, 38.0, 44, Math.PI * 0.28, 0.55, 1.25);
  podiumSpot.position.set(3.2, 8.6, 7.2);
  podiumSpot.target.position.set(1.6, 1.0, 1.0);
  group.add(podiumSpot, podiumSpot.target);

  const rimLight = new THREE.PointLight(0x38bdf8, 8.5, 22, 1.5);
  rimLight.position.set(0, 3.4, -0.4);
  group.add(rimLight);

  // Three Cheering Rigged Drivers atop P1, P2, and P3 Pedestal Tiers
  const p1DriverRig = buildRiggedPlaceholderDriver(trackGeo, trackMat, {
    name: 'PodiumDriver_P1',
    accentColor: 0xf59e0b,
    emissiveColor: 0x78350f,
    helmetColor: 0x0f172a,
    hasTrophy: true,
    cheerMode: 'trophy',
    cheerPhase: 0,
  });
  p1DriverRig.root.position.set(0, 1.05, 0);
  group.add(p1DriverRig.root);

  const p2DriverRig = buildRiggedPlaceholderDriver(trackGeo, trackMat, {
    name: 'PodiumDriver_P2',
    accentColor: 0x38bdf8,
    emissiveColor: 0x0c4a6e,
    helmetColor: 0x1e293b,
    hasTrophy: false,
    cheerMode: 'fistpump',
    cheerPhase: 1.4,
  });
  p2DriverRig.root.position.set(2.3, 0.68, 0);
  p2DriverRig.root.rotation.y = -0.14;
  group.add(p2DriverRig.root);

  const p3DriverRig = buildRiggedPlaceholderDriver(trackGeo, trackMat, {
    name: 'PodiumDriver_P3',
    accentColor: 0xf97316,
    emissiveColor: 0x7c2d12,
    helmetColor: 0x171717,
    hasTrophy: false,
    cheerMode: 'wave',
    cheerPhase: 2.7,
  });
  p3DriverRig.root.position.set(-2.3, 0.46, 0);
  p3DriverRig.root.rotation.y = 0.16;
  group.add(p3DriverRig.root);

  // Confetti Particle System (140 fluttering metallic foils over pedestal)
  const confettiCount = 140;
  const confettiDummy = new THREE.Object3D();
  const confettiGeo = trackGeo(new THREE.PlaneGeometry(0.11, 0.065));
  const confettiMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    }),
  );
  const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
  confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const confettiColors = [
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xf59e0b),
    new THREE.Color(0xf8fafc),
    new THREE.Color(0xef4444),
  ];
  const confettiSeeds: Array<{
    x: number;
    y0: number;
    z: number;
    speed: number;
    sway: number;
    phase: number;
  }> = [];
  for (let i = 0; i < confettiCount; i++) {
    confettiMesh.setColorAt(i, confettiColors[i % confettiColors.length]);
    confettiSeeds.push({
      x: Math.sin(i * 12.989) * 5.2,
      y0: 1.5 + (i % 17) * 0.32,
      z: Math.cos(i * 78.233) * 3.4 + 0.8,
      speed: 1.05 + (i % 7) * 0.22,
      sway: 0.45 + (i % 5) * 0.18,
      phase: i * 0.71,
    });
  }
  if (confettiMesh.instanceColor) confettiMesh.instanceColor.needsUpdate = true;
  group.add(confettiMesh);

  let active = false;
  let activeTime = 0;
  let podiumYaw = 0;
  let podiumCos = 1;
  let podiumSin = 0;

  const setPoseInternal = (x: number, y: number, z: number, tanX = 1, tanZ = 0) => {
    podiumCenter.set(x, y, z);
    group.position.copy(podiumCenter);
    podiumYaw = Math.atan2(-tanZ, tanX);
    podiumCos = Math.cos(podiumYaw);
    podiumSin = Math.sin(podiumYaw);
    group.rotation.y = podiumYaw;
  };

  const toWorld = (lx: number, ly: number, lz: number, out: THREE.Vector3) => {
    out.set(
      podiumCenter.x + lx * podiumCos + lz * podiumSin,
      podiumCenter.y + ly,
      podiumCenter.z - lx * podiumSin + lz * podiumCos,
    );
  };

  return {
    group,
    driverRig: p1DriverRig,
    setPodiumLocation: (x: number, y: number, z: number) => {
      setPoseInternal(x, y, z, 1, 0);
    },
    setPodiumPose: (x: number, y: number, z: number, tanX = 1, tanZ = 0) => {
      setPoseInternal(x, y, z, tanX, tanZ);
    },
    activate: () => {
      active = true;
      activeTime = 0;
      group.visible = true;
    },
    deactivate: () => {
      active = false;
      group.visible = false;
    },
    getCarParkPose: () => {
      // Hero car parked cleanly beside the Top-3 pedestal & cheering winners
      const pos = new THREE.Vector3();
      toWorld(5.15, 0.03, 2.25, pos);
      return {
        pos,
        yaw: -Math.PI * 0.22 + podiumYaw,
      };
    },
    getRivalParkPoses: () => {
      const p2 = new THREE.Vector3();
      const p3 = new THREE.Vector3();
      toWorld(-6.6, 0.03, 4.2, p2);
      toWorld(-10.2, 0.03, -0.2, p3);
      return [
        { pos: p2, yaw: Math.PI * 0.22 + podiumYaw },
        { pos: p3, yaw: Math.PI * 0.34 + podiumYaw },
      ];
    },
    update: (delta: number, elapsedSec: number) => {
      if (!active) return;
      activeTime += delta;
      p1DriverRig.update(elapsedSec);
      p2DriverRig.update(elapsedSec);
      p3DriverRig.update(elapsedSec);

      for (let i = 0; i < confettiCount; i++) {
        const s = confettiSeeds[i];
        const fall = ((s.y0 + 5.5 - ((activeTime * s.speed + s.phase) % 5.5)) % 5.5) + 0.1;
        confettiDummy.position.set(
          s.x + Math.sin(activeTime * 1.9 + s.phase) * s.sway,
          fall,
          s.z + Math.cos(activeTime * 1.6 + s.phase) * s.sway,
        );
        confettiDummy.rotation.set(
          activeTime * 3.1 + s.phase,
          activeTime * 2.4 + s.phase * 1.3,
          activeTime * 1.7,
        );
        confettiDummy.updateMatrix();
        confettiMesh.setMatrixAt(i, confettiDummy.matrix);
      }
      confettiMesh.instanceMatrix.needsUpdate = true;
    },
    getPodiumPose: (
      outPos: THREE.Vector3,
      outTarget: THREE.Vector3,
      cameraAngle: PodiumCameraAngle = 'auto',
    ) => {
      if (cameraAngle === 'car') {
        toWorld(9.1, 1.55, 6.2, outPos);
        toWorld(4.85, 0.9, 2.1, outTarget);
        return;
      }
      if (cameraAngle === 'driver') {
        toWorld(0, 2.15, 5.2, outPos);
        toWorld(0, 1.82, 0, outTarget);
        return;
      }
      if (cameraAngle === 'crane') {
        toWorld(4.2, 5.2, 12.6, outPos);
        toWorld(1.4, 1.15, 0.9, outTarget);
        return;
      }
      // Default 'auto': static showcase framing Top-3 Pedestal + 3 cheering winners + parked hero car beside them
      toWorld(2.2, 2.45, 10.6, outPos);
      toWorld(1.5, 1.25, 0.9, outTarget);
    },
    dispose: () => {
      p1DriverRig.dispose();
      p2DriverRig.dispose();
      p3DriverRig.dispose();
      for (const tex of disposableTextures) tex.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}

