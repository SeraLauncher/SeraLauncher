import * as THREE from "three";
import { applyBoxUvs, computeBoxUvs } from "./uvMath";

export interface PlayerCharacterRig {
  root: THREE.Group;
  characterGroup: THREE.Group;
  headPivot: THREE.Group;
  bodyPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  dispose: () => void;
}

/**
 * Builds the complete 3D Minecraft player model hierarchy with base parts,
 * overlays, and anatomical joint pivots.
 * Character height is 32 units tall, standing with feet at Y = 0.
 * Anatomical pivots are parented to characterGroup (centered at Y = 16)
 * so that flight/swimming pitch tilts the whole character as one seamless unit.
 */
export function buildPlayerModel(texture: THREE.CanvasTexture, isSlim = false): PlayerCharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const baseMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: false,
  });
  materials.push(baseMaterial);

  const overlayMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  materials.push(overlayMaterial);

  const root = new THREE.Group();
  root.name = "playerRoot";

  // characterGroup pivots around the vertical center of the character (Y = 16)
  const characterGroup = new THREE.Group();
  characterGroup.name = "characterGroup";
  characterGroup.position.set(0, 16, 0);
  root.add(characterGroup);

  const createPart = (
    w: number,
    h: number,
    d: number,
    uvX: number,
    uvY: number,
    mat: THREE.Material,
    texW = Math.round(w),
    texH = Math.round(h),
    texD = Math.round(d),
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geometries.push(geo);
    const uvs = computeBoxUvs(uvX, uvY, texW, texH, texD);
    applyBoxUvs(geo, uvs);
    return new THREE.Mesh(geo, mat);
  };

  // 1. Head (8x8x8), absolute pivot at [0, 24, 0] -> relative to characterGroup is [0, 8, 0]
  const headPivot = new THREE.Group();
  headPivot.name = "headPivot";
  headPivot.position.set(0, 8, 0);

  const headBase = createPart(8, 8, 8, 0, 0, baseMaterial, 8, 8, 8);
  headBase.position.set(0, 4, 0);
  headPivot.add(headBase);

  // Outer hat layer: inflated by 0.6, UVs mapped strictly to 8x8x8 pixels
  const headOverlay = createPart(8.6, 8.6, 8.6, 32, 0, overlayMaterial, 8, 8, 8);
  headOverlay.position.set(0, 4, 0);
  headPivot.add(headOverlay);
  characterGroup.add(headPivot);

  // 2. Body / Torso (8x12x4), absolute pivot at [0, 18, 0] -> relative is [0, 2, 0]
  const bodyPivot = new THREE.Group();
  bodyPivot.name = "bodyPivot";
  bodyPivot.position.set(0, 2, 0);

  const bodyBase = createPart(8, 12, 4, 16, 16, baseMaterial, 8, 12, 4);
  bodyPivot.add(bodyBase);

  // Jacket layer: inflated slightly, UVs mapped strictly to 8x12x4 pixels
  const bodyOverlay = createPart(8.5, 12.5, 4.5, 16, 32, overlayMaterial, 8, 12, 4);
  bodyPivot.add(bodyOverlay);
  characterGroup.add(bodyPivot);

  // 3. Arms (Classic: 4x12x4, Slim: 3x12x4), absolute shoulder pivot at [±(4 + armW/2), 24, 0] -> relative is [±armX, 8, 0]
  const armW = isSlim ? 3 : 4;
  const armOverlayW = isSlim ? 3.5 : 4.5;
  const armX = 4 + armW / 2;

  // Right Arm
  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = "rightArmPivot";
  rightArmPivot.position.set(-armX, 8, 0);

  const rightArmBase = createPart(armW, 12, 4, 40, 16, baseMaterial, armW, 12, 4);
  rightArmBase.position.set(0, -6, 0);
  rightArmPivot.add(rightArmBase);

  const rightArmOverlay = createPart(armOverlayW, 12.5, 4.5, 40, 32, overlayMaterial, armW, 12, 4);
  rightArmOverlay.position.set(0, -6, 0);
  rightArmPivot.add(rightArmOverlay);
  characterGroup.add(rightArmPivot);

  // Left Arm
  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = "leftArmPivot";
  leftArmPivot.position.set(armX, 8, 0);

  const leftArmBase = createPart(armW, 12, 4, 32, 48, baseMaterial, armW, 12, 4);
  leftArmBase.position.set(0, -6, 0);
  leftArmPivot.add(leftArmBase);

  const leftArmOverlay = createPart(armOverlayW, 12.5, 4.5, 48, 48, overlayMaterial, armW, 12, 4);
  leftArmOverlay.position.set(0, -6, 0);
  leftArmPivot.add(leftArmOverlay);
  characterGroup.add(leftArmPivot);

  // 4. Legs (4x12x4), absolute hip pivot at [±2, 12, 0] -> relative is [±2, -4, 0]
  // Right Leg
  const rightLegPivot = new THREE.Group();
  rightLegPivot.name = "rightLegPivot";
  rightLegPivot.position.set(-2, -4, 0);

  const rightLegBase = createPart(4, 12, 4, 0, 16, baseMaterial, 4, 12, 4);
  rightLegBase.position.set(0, -6, 0);
  rightLegPivot.add(rightLegBase);

  const rightLegOverlay = createPart(4.5, 12.5, 4.5, 0, 32, overlayMaterial, 4, 12, 4);
  rightLegOverlay.position.set(0, -6, 0);
  rightLegPivot.add(rightLegOverlay);
  characterGroup.add(rightLegPivot);

  // Left Leg
  const leftLegPivot = new THREE.Group();
  leftLegPivot.name = "leftLegPivot";
  leftLegPivot.position.set(2, -4, 0);

  const leftLegBase = createPart(4, 12, 4, 16, 48, baseMaterial, 4, 12, 4);
  leftLegBase.position.set(0, -6, 0);
  leftLegPivot.add(leftLegBase);

  const leftLegOverlay = createPart(4.5, 12.5, 4.5, 0, 48, overlayMaterial, 4, 12, 4);
  leftLegOverlay.position.set(0, -6, 0);
  leftLegPivot.add(leftLegOverlay);
  characterGroup.add(leftLegPivot);

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };

  return {
    root,
    characterGroup,
    headPivot,
    bodyPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    dispose,
  };
}
