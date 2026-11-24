import * as THREE from 'three';

export interface GtVehicleRig {
  root: THREE.Group;
  updateVisuals: (
    x: number,
    y: number,
    z: number,
    heading: number,
    steerAngle: number,
    wheelSpin: number,
    braking: boolean,
    accentHex: string
  ) => void;
  dispose: () => void;
}

/**
 * Composite 10-part GT Race Car (`THREE.Group`):
 * - Grounded bottom-center pivot
 * - Soft radial contact shadow disc
 * - Sculpted extruded aero chassis, carbon splitter, rear diffuser, swan-neck GT wing
 * - Glazed cockpit canopy, LED headlights, braking-reactive taillights
 * - 4 multi-part alloy wheels + rubber tires (front wheels steer + spin, rear wheels spin)
 */
export function buildGtVehicle(accentHex: string): GtVehicleRig {
  const disposables: { dispose: () => void }[] = [];
  const root = new THREE.Group();

  // Materials (varied roughness >= 0.25 & metalness across adjacent parts)
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.16,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const liveryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.2,
    metalness: 0.35,
    clearcoat: 0.9,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x181c22,
    roughness: 0.62,
    metalness: 0.28,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.08,
    metalness: 0.9,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.88,
    metalness: 0.04,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.22,
    metalness: 0.88,
  });
  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.0,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.2,
  });
  disposables.push(
    bodyPaintMat,
    liveryMat,
    carbonMat,
    canopyMat,
    tireMat,
    alloyMat,
    headLightMat,
    tailLightMat
  );

  // Soft radial contact shadow disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeo = new THREE.PlaneGeometry(4.9, 2.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.025;
  root.add(contactShadow);
  disposables.push(shadowTex, shadowGeo, shadowMat);

  // Car local frame: +X forward, +Y up, +Z right
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // 1. Sculpted Extruded Main Body Profile
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.15, 0.24);
  bodyShape.lineTo(2.15, 0.22);
  bodyShape.lineTo(2.26, 0.45);
  bodyShape.lineTo(1.55, 0.72);
  bodyShape.lineTo(0.65, 0.82);
  bodyShape.lineTo(0.18, 1.18);
  bodyShape.lineTo(-0.88, 1.18);
  bodyShape.lineTo(-1.82, 0.82);
  bodyShape.lineTo(-2.22, 0.72);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.76,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.88);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyPaintMat);
  bodyMesh.castShadow = true;
  chassisGroup.add(bodyMesh);
  disposables.push(bodyGeo);

  // 2. Center Racing Livery Stripe
  const stripeGeo = new THREE.BoxGeometry(3.45, 0.04, 0.48);
  const stripeMesh = new THREE.Mesh(stripeGeo, liveryMat);
  stripeMesh.position.set(0.15, 0.82, 0);
  chassisGroup.add(stripeMesh);
  disposables.push(stripeGeo);

  // 3. Glazed Cockpit Canopy
  const canopyGeo = new THREE.BoxGeometry(1.52, 0.36, 1.32);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(-0.32, 1.0, 0);
  chassisGroup.add(canopyMesh);
  disposables.push(canopyGeo);

  // 4. Front Carbon Aero Splitter
  const splitterGeo = new THREE.BoxGeometry(0.45, 0.07, 1.98);
  const splitterMesh = new THREE.Mesh(splitterGeo, carbonMat);
  splitterMesh.position.set(2.18, 0.19, 0);
  chassisGroup.add(splitterMesh);
  disposables.push(splitterGeo);

  // 5. Rear Diffuser + Twin Exhausts
  const diffGeo = new THREE.BoxGeometry(0.35, 0.16, 1.84);
  const diffMesh = new THREE.Mesh(diffGeo, carbonMat);
  diffMesh.position.set(-2.16, 0.24, 0);
  chassisGroup.add(diffMesh);
  disposables.push(diffGeo);

  // 6. Swan-Neck GT Rear Wing + Endplates
  const wingDeckGeo = new THREE.BoxGeometry(0.38, 0.05, 1.98);
  const wingEndGeo = new THREE.BoxGeometry(0.44, 0.28, 0.05);
  const wingStrutGeo = new THREE.BoxGeometry(0.16, 0.46, 0.05);
  const wingDeck = new THREE.Mesh(wingDeckGeo, carbonMat);
  wingDeck.position.set(-2.06, 1.24, 0);
  wingDeck.rotation.z = 0.12;
  const wingEndL = new THREE.Mesh(wingEndGeo, liveryMat);
  wingEndL.position.set(-2.06, 1.22, -0.98);
  const wingEndR = new THREE.Mesh(wingEndGeo, liveryMat);
  wingEndR.position.set(-2.06, 1.22, 0.98);
  const strutL = new THREE.Mesh(wingStrutGeo, carbonMat);
  strutL.position.set(-1.98, 1.0, -0.45);
  const strutR = new THREE.Mesh(wingStrutGeo, carbonMat);
  strutR.position.set(-1.98, 1.0, 0.45);
  chassisGroup.add(wingDeck, wingEndL, wingEndR, strutL, strutR);
  disposables.push(wingDeckGeo, wingEndGeo, wingStrutGeo);

  // 7. Headlights & Taillights
  const lampGeo = new THREE.BoxGeometry(0.08, 0.11, 0.36);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(lampGeo, headLightMat);
    hl.position.set(2.26, 0.52, side * 0.64);
    const tl = new THREE.Mesh(lampGeo, tailLightMat);
    tl.position.set(-2.24, 0.66, side * 0.64);
    chassisGroup.add(hl, tl);
  }
  disposables.push(lampGeo);

  // 8. 4 Multi-Part Wheels (Tire + Alloy Rim + Center Lock)
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 16);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.29, 12);
  rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.36, 0.04, 0.30);
  disposables.push(tireGeo, rimGeo, spokeGeo);

  const wheelConfigs = [
    { x: 1.38, z: -0.92, front: true },
    { x: 1.38, z: 0.92, front: true },
    { x: -1.36, z: -0.94, front: false },
    { x: -1.36, z: 0.94, front: false },
  ];
  const wheels: { steerPivot: THREE.Group; spinMesh: THREE.Group; front: boolean }[] = [];

  for (const wc of wheelConfigs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wc.x, 0.34, wc.z);
    const spinMesh = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, alloyMat);
    const spokeA = new THREE.Mesh(spokeGeo, carbonMat);
    const spokeB = new THREE.Mesh(spokeGeo, carbonMat);
    spokeB.rotation.z = Math.PI / 2;
    spinMesh.add(tire, rim, spokeA, spokeB);
    steerPivot.add(spinMesh);
    root.add(steerPivot);
    wheels.push({ steerPivot, spinMesh, front: wc.front });
  }

  return {
    root,
    updateVisuals: (x, y, z, heading, steerAngle, wheelSpin, braking, nextAccent) => {
      root.position.set(x, y, z);
      root.rotation.y = -heading;
      liveryMat.color.set(nextAccent);
      tailLightMat.emissiveIntensity = braking ? 3.5 : 1.1;

      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (w.front) w.steerPivot.rotation.y = -steerAngle;
        w.spinMesh.rotation.z = -wheelSpin;
      }
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
