import * as THREE from "three";
import type { BoxFaceUv } from "./types";

/**
 * Computes texture coordinate rectangles for the 6 faces of a Minecraft body part box.
 * Standard Minecraft skin net:
 * [x, y] is the top-left of the box unfold.
 */
export function computeBoxUvs(x: number, y: number, w: number, h: number, d: number): BoxFaceUv {
  return {
    top: [x + d, y, x + d + w, y + d],
    bottom: [x + d + w, y, x + d + 2 * w, y + d],
    right: [x, y + d, x + d, y + d + h],
    front: [x + d, y + d, x + d + w, y + d + h],
    left: [x + d + w, y + d, x + 2 * d + w, y + d + h],
    back: [x + 2 * d + w, y + d, x + 2 * d + 2 * w, y + d + h],
  };
}

/**
 * Writes computed UV coordinates into Three.js BoxGeometry buffer attributes.
 * Three.js BoxGeometry face order:
 * Face 0: +X (viewer's right, which is the player's LEFT face)
 * Face 1: -X (viewer's left, which is the player's RIGHT face)
 * Face 2: +Y (top)
 * Face 3: -Y (bottom)
 * Face 4: +Z (front)
 * Face 5: -Z (back)
 */
export function applyBoxUvs(
  geometry: THREE.BufferGeometry,
  faces: BoxFaceUv,
  texW = 64,
  texH = 64,
): void {
  const uvAttr = geometry.getAttribute("uv");
  const uvs = uvAttr.array as Float32Array;

  // Face 0 (+X) is player's left, Face 1 (-X) is player's right
  const order: (keyof BoxFaceUv)[] = ["left", "right", "top", "bottom", "front", "back"];

  order.forEach((faceKey, faceIndex) => {
    const [x1, y1, x2, y2] = faces[faceKey];
    const uMin = x1 / texW;
    const uMax = x2 / texW;
    const vMin = 1 - y2 / texH;
    const vMax = 1 - y1 / texH;

    const offset = faceIndex * 8;
    // Vertex 0 (top-left)
    uvs[offset] = uMin;
    uvs[offset + 1] = vMax;
    // Vertex 1 (top-right)
    uvs[offset + 2] = uMax;
    uvs[offset + 3] = vMax;
    // Vertex 2 (bottom-left)
    uvs[offset + 4] = uMin;
    uvs[offset + 5] = vMin;
    // Vertex 3 (bottom-right)
    uvs[offset + 6] = uMax;
    uvs[offset + 7] = vMin;
  });

  uvAttr.needsUpdate = true;
}
