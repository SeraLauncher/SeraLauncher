import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { createSteveFallbackCanvas } from "./steveFallback";

/**
 * Loads an image from a URL or data URI.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", (e) => reject(e), { once: true });
    img.src = src;
  });
}

function expandLegacySkin(srcCtx: CanvasRenderingContext2D, targetCtx: CanvasRenderingContext2D) {
  targetCtx.drawImage(srcCtx.canvas, 0, 0);

  const armData = srcCtx.getImageData(40, 16, 16, 16);
  targetCtx.putImageData(flipHorizontal(armData), 32, 48);

  const legData = srcCtx.getImageData(0, 16, 16, 16);
  targetCtx.putImageData(flipHorizontal(legData), 16, 48);
}

function flipHorizontal(imgData: ImageData): ImageData {
  const { width, height, data } = imgData;
  const flipped = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = (y * width + (width - 1 - x)) * 4;
      flipped.data[dstIdx] = data[srcIdx];
      flipped.data[dstIdx + 1] = data[srcIdx + 1];
      flipped.data[dstIdx + 2] = data[srcIdx + 2];
      flipped.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return flipped;
}

/**
 * Creates a Three.js CanvasTexture from a skin image or URL.
 * In Tauri, uses fetch_skin_as_data_url to bypass cross-origin restrictions.
 */
export async function createSkinTexture(skinUrl?: string | null): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let loaded = false;
  if (skinUrl) {
    let resolvedUrl = skinUrl;

    // Use Tauri backend proxy for remote URLs to avoid webview CORS blocking
    if (skinUrl.startsWith("http://") || skinUrl.startsWith("https://")) {
      try {
        const dataUrl = await invoke<string>("fetch_skin_as_data_url", { url: skinUrl });
        if (dataUrl) {
          resolvedUrl = dataUrl;
        }
      } catch {
        // Fall back to direct URL if tauri command is unavailable
      }
    }

    try {
      const img = await loadImage(resolvedUrl);
      if (ctx) {
        ctx.clearRect(0, 0, 64, 64);
        if (img.height === 32) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = 64;
          tempCanvas.height = 32;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.drawImage(img, 0, 0);
            expandLegacySkin(tempCtx, ctx);
          }
        } else {
          ctx.drawImage(img, 0, 0, 64, 64);
        }
        loaded = true;
      }
    } catch {
      loaded = false;
    }
  }

  if (!loaded && ctx) {
    const fallback = createSteveFallbackCanvas();
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(fallback, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
