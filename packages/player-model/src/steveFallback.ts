/**
 * Creates a clean default Steve skin texture on a 64x64 canvas.
 * Fully paints all 6 faces of every body part to ensure solid rendering.
 */
export function createSteveFallbackCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, 64, 64);

  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  // 1. Head (x: 0..32, y: 0..16)
  fill(0, 0, 32, 16, "#2e1c10"); // Hair coverage on all sides
  fill(8, 8, 8, 8, "#c48858"); // Face
  fill(8, 8, 8, 2, "#2e1c10"); // Hair bangs
  fill(8, 10, 1, 3, "#2e1c10"); // Left sideburn
  fill(15, 10, 1, 3, "#2e1c10"); // Right sideburn
  // Eyes
  fill(9, 12, 1, 1, "#ffffff");
  fill(10, 12, 1, 1, "#2e48aa");
  fill(14, 12, 1, 1, "#ffffff");
  fill(13, 12, 1, 1, "#2e48aa");
  // Nose and mouth
  fill(11, 13, 2, 1, "#aa6e40");
  fill(11, 14, 2, 1, "#543322");

  // 2. Torso (x: 16..40, y: 16..32)
  fill(16, 16, 24, 16, "#00a8aa"); // Cyan shirt all sides
  fill(20, 20, 4, 3, "#c48858"); // Neck chest cutout

  // 3. Right Arm (x: 40..56, y: 16..32)
  fill(40, 16, 16, 8, "#00a8aa"); // Cyan shoulder & sleeve
  fill(40, 24, 16, 8, "#c48858"); // Skin forearm

  // 4. Left Arm (x: 32..48, y: 48..64)
  fill(32, 48, 16, 8, "#00a8aa"); // Cyan shoulder & sleeve
  fill(32, 56, 16, 8, "#c48858"); // Skin forearm

  // 5. Right Leg (x: 0..16, y: 16..32)
  fill(0, 16, 16, 12, "#333399"); // Blue pants
  fill(0, 28, 16, 4, "#444444"); // Grey shoes

  // 6. Left Leg (x: 16..32, y: 48..64)
  fill(16, 48, 16, 12, "#333399"); // Blue pants
  fill(16, 60, 16, 4, "#444444"); // Grey shoes

  return canvas;
}
