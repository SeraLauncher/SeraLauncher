import type { PlayerCharacterRig } from "./skinModel";
import type { PlayerAnimationId } from "./types";

export interface JointTransform {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  rootY: number;
  characterPitch: number;
  characterYaw: number;
  characterRoll: number;
  body: JointTransform;
  head: JointTransform;
  leftArm: JointTransform;
  rightArm: JointTransform;
  leftLeg: JointTransform;
  rightLeg: JointTransform;
}

export function createEmptyPose(): Pose {
  return {
    rootY: 0,
    characterPitch: 0,
    characterYaw: 0,
    characterRoll: 0,
    body: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
    leftArm: { x: 0, y: 0, z: 0 },
    rightArm: { x: 0, y: 0, z: 0 },
    leftLeg: { x: 0, y: 0, z: 0 },
    rightLeg: { x: 0, y: 0, z: 0 },
  };
}

/**
 * 1. Dynamic Idle: subtle breathing, gentle weight sway, relaxed arm sway, natural gaze
 */
export function calculateDynamicIdlePose(t: number): Pose {
  const pose = createEmptyPose();
  const breath = Math.sin(t * 1.7);
  const breathAlt = Math.cos(t * 1.7);
  const sway = Math.sin(t * 0.85);

  pose.rootY = Math.sin(t * 1.7) * 0.25;

  pose.body.x = breath * 0.035;
  pose.body.y = sway * 0.02;
  pose.body.z = sway * 0.015;

  pose.head.y = Math.sin(t * 0.55) * 0.12;
  pose.head.x = Math.sin(t * 1.7 + 0.3) * 0.035;
  pose.head.z = -sway * 0.02;

  pose.leftArm.z = 0.08 + breath * 0.02;
  pose.rightArm.z = -0.08 - breath * 0.02;
  pose.leftArm.x = breath * 0.05 + breathAlt * 0.015;
  pose.rightArm.x = -breath * 0.05 - breathAlt * 0.015;

  pose.leftLeg.z = sway * 0.01;
  pose.rightLeg.z = sway * 0.01;

  return pose;
}

/**
 * 2. Walking: in-place Minecraft step cycle, arms swinging opposite to legs, step bob
 */
export function calculateWalkPose(t: number): Pose {
  const pose = createEmptyPose();
  const speed = 4.2;
  const swing = Math.sin(t * speed);
  const cosSwing = Math.cos(t * speed);

  pose.rootY = -Math.abs(Math.sin(t * speed)) * 0.7;

  pose.leftLeg.x = swing * 0.55;
  pose.rightLeg.x = -swing * 0.55;

  pose.leftArm.x = -swing * 0.45;
  pose.rightArm.x = swing * 0.45;
  pose.leftArm.z = 0.1 + Math.abs(cosSwing) * 0.04;
  pose.rightArm.z = -0.1 - Math.abs(cosSwing) * 0.04;

  pose.body.x = 0.05;
  pose.body.y = -swing * 0.06;
  pose.body.z = cosSwing * 0.025;

  pose.head.x = Math.sin(t * speed * 2) * 0.04;
  pose.head.z = -cosSwing * 0.015;

  return pose;
}

/**
 * 3. Levitation Float: suspended in air, wing-like outstretched arms, drifting limbs
 */
export function calculateLevitatePose(t: number): Pose {
  const pose = createEmptyPose();
  const floatSpeed = 1.6;
  const float = Math.sin(t * floatSpeed);
  const drift = Math.cos(t * floatSpeed * 0.5);

  pose.rootY = 2.4 + float * 1.5;

  pose.body.x = 0.12 + float * 0.03;
  pose.body.y = drift * 0.06;
  pose.body.z = drift * 0.03;

  pose.head.x = -0.12 - float * 0.04;
  pose.head.y = drift * 0.08;
  pose.head.z = -drift * 0.04;

  pose.leftArm.x = 0.15;
  pose.leftArm.y = -0.1;
  pose.leftArm.z = 0.65 + float * 0.08;

  pose.rightArm.x = 0.15;
  pose.rightArm.y = 0.1;
  pose.rightArm.z = -0.65 - float * 0.08;

  pose.leftLeg.x = 0.28 + float * 0.08;
  pose.leftLeg.z = 0.06;
  pose.rightLeg.x = 0.18 - float * 0.08;
  pose.rightLeg.z = -0.06;

  return pose;
}

/**
 * 4. Elytra Soar: fixed anatomical glide angle.
 * The whole character tilts forward together (via characterPitch/characterRoll),
 * avoiding the torso disconnecting from hips or shoulders.
 */
export function calculateElytraPose(t: number): Pose {
  const pose = createEmptyPose();
  const roll = Math.sin(t * 1.2);
  const pitch = Math.sin(t * 2.4);

  // The whole character pitches forward ~70 degrees into flight and rolls with banking
  pose.rootY = 3.5 + pitch * 0.8;
  pose.characterPitch = 1.22 + pitch * 0.05;
  pose.characterRoll = roll * 0.18;
  pose.characterYaw = roll * 0.06;

  // Torso remains aligned with the body frame
  pose.body.x = 0;
  pose.body.y = 0;
  pose.body.z = 0;

  // Head lifts forward looking ahead along flight path
  pose.head.x = -0.92;
  pose.head.y = 0;
  pose.head.z = -roll * 0.1;

  // Arms swept back along the sides
  pose.leftArm.x = 0.26;
  pose.leftArm.z = 0.26;
  pose.rightArm.x = 0.26;
  pose.rightArm.z = -0.26;

  // Legs trailing straight back together
  pose.leftLeg.x = 0.08;
  pose.leftLeg.z = 0.03;
  pose.rightLeg.x = 0.08;
  pose.rightLeg.z = -0.03;

  return pose;
}

/**
 * 5. Sleepy Nod Off: character slowly drops head, body sags, sudden jerk awake, repeat
 */
export function calculateSleepyNodPose(t: number): Pose {
  const pose = createEmptyPose();
  const cycle = t % 5.0;
  let headDrop = 0;
  let bodyDrop = 0;
  let jerk = 0;

  if (cycle < 3.8) {
    const p = cycle / 3.8;
    headDrop = Math.pow(p, 2) * 0.52;
    bodyDrop = Math.pow(p, 2) * 0.12;
  } else if (cycle < 4.2) {
    const p = (cycle - 3.8) / 0.4;
    headDrop = 0.52 * (1 - p) - Math.sin(p * Math.PI) * 0.15;
    jerk = Math.sin(p * Math.PI) * 0.3;
  } else {
    headDrop = -0.05;
  }

  const breath = Math.sin(t * 1.4);
  pose.rootY = breath * 0.15 + jerk;
  pose.body.x = bodyDrop + breath * 0.02;
  pose.head.x = headDrop;
  pose.head.z = headDrop * 0.2;

  pose.leftArm.x = 0.05;
  pose.leftArm.z = 0.08;
  pose.rightArm.x = 0.05;
  pose.rightArm.z = -0.08;

  pose.leftLeg.z = 0.02;
  pose.rightLeg.z = -0.02;

  return pose;
}

/**
 * Calculates current pose for given animation ID and elapsed time
 */
export function getAnimationPose(id: PlayerAnimationId, t: number): Pose {
  switch (id) {
    case "walking":
      return calculateWalkPose(t);
    case "levitation_float":
      return calculateLevitatePose(t);
    case "elytra_soar":
      return calculateElytraPose(t);
    case "sleepy_nod_off":
      return calculateSleepyNodPose(t);
    case "dynamic_idle":
    default:
      return calculateDynamicIdlePose(t);
  }
}

/**
 * Smoothly blends target pose into currentPose and applies it to the Three.js rig
 */
export function blendAndApplyPose(
  rig: PlayerCharacterRig,
  currentPose: Pose,
  targetPose: Pose,
  alpha = 0.15,
) {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;

  currentPose.rootY = lerp(currentPose.rootY, targetPose.rootY);
  currentPose.characterPitch = lerp(currentPose.characterPitch, targetPose.characterPitch);
  currentPose.characterYaw = lerp(currentPose.characterYaw, targetPose.characterYaw);
  currentPose.characterRoll = lerp(currentPose.characterRoll, targetPose.characterRoll);

  currentPose.body.x = lerp(currentPose.body.x, targetPose.body.x);
  currentPose.body.y = lerp(currentPose.body.y, targetPose.body.y);
  currentPose.body.z = lerp(currentPose.body.z, targetPose.body.z);

  currentPose.head.x = lerp(currentPose.head.x, targetPose.head.x);
  currentPose.head.y = lerp(currentPose.head.y, targetPose.head.y);
  currentPose.head.z = lerp(currentPose.head.z, targetPose.head.z);

  currentPose.leftArm.x = lerp(currentPose.leftArm.x, targetPose.leftArm.x);
  currentPose.leftArm.y = lerp(currentPose.leftArm.y, targetPose.leftArm.y);
  currentPose.leftArm.z = lerp(currentPose.leftArm.z, targetPose.leftArm.z);

  currentPose.rightArm.x = lerp(currentPose.rightArm.x, targetPose.rightArm.x);
  currentPose.rightArm.y = lerp(currentPose.rightArm.y, targetPose.rightArm.y);
  currentPose.rightArm.z = lerp(currentPose.rightArm.z, targetPose.rightArm.z);

  currentPose.leftLeg.x = lerp(currentPose.leftLeg.x, targetPose.leftLeg.x);
  currentPose.leftLeg.y = lerp(currentPose.leftLeg.y, targetPose.leftLeg.y);
  currentPose.leftLeg.z = lerp(currentPose.leftLeg.z, targetPose.leftLeg.z);

  currentPose.rightLeg.x = lerp(currentPose.rightLeg.x, targetPose.rightLeg.x);
  currentPose.rightLeg.y = lerp(currentPose.rightLeg.y, targetPose.rightLeg.y);
  currentPose.rightLeg.z = lerp(currentPose.rightLeg.z, targetPose.rightLeg.z);

  // Apply to Three.js rig
  rig.characterGroup.position.y = 16 + currentPose.rootY;
  rig.characterGroup.rotation.x = currentPose.characterPitch;
  rig.characterGroup.rotation.y = currentPose.characterYaw;
  rig.characterGroup.rotation.z = currentPose.characterRoll;

  rig.bodyPivot.rotation.x = currentPose.body.x;
  rig.bodyPivot.rotation.y = currentPose.body.y;
  rig.bodyPivot.rotation.z = currentPose.body.z;

  rig.headPivot.rotation.x = currentPose.head.x;
  rig.headPivot.rotation.y = currentPose.head.y;
  rig.headPivot.rotation.z = currentPose.head.z;

  rig.leftArmPivot.rotation.x = currentPose.leftArm.x;
  rig.leftArmPivot.rotation.y = currentPose.leftArm.y;
  rig.leftArmPivot.rotation.z = currentPose.leftArm.z;

  rig.rightArmPivot.rotation.x = currentPose.rightArm.x;
  rig.rightArmPivot.rotation.y = currentPose.rightArm.y;
  rig.rightArmPivot.rotation.z = currentPose.rightArm.z;

  rig.leftLegPivot.rotation.x = currentPose.leftLeg.x;
  rig.leftLegPivot.rotation.y = currentPose.leftLeg.y;
  rig.leftLegPivot.rotation.z = currentPose.leftLeg.z;

  rig.rightLegPivot.rotation.x = currentPose.rightLeg.x;
  rig.rightLegPivot.rotation.y = currentPose.rightLeg.y;
  rig.rightLegPivot.rotation.z = currentPose.rightLeg.z;
}
