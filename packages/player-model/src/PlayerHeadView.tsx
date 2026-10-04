import { useEffect, useState } from "react";
import * as THREE from "three";
import { applyBoxUvs, computeBoxUvs } from "./uvMath";
import { createSkinTexture, loadSkinCanvas, DEFAULT_STEVE_SKIN_URL } from "./skinTexture";
import type { PlayerHeadViewProps } from "./types";

/** Memory cache of rendered head data URLs keyed by [key, facing, size] */
const headSnapshotCache = new Map<string, string>();
const pendingSnapshots = new Map<string, Promise<string>>();

/**
 * Shared single WebGL offscreen renderer to avoid hitting browser WebGL context limits.
 */
let sharedRenderer: THREE.WebGLRenderer | null = null;
function getSharedRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  try {
    const canvas = document.createElement("canvas");
    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    return sharedRenderer;
  } catch {
    return null;
  }
}

/**
 * Renders a 3D isometric head into a data URL using the shared renderer.
 */
async function snapshot3DHead(
  skinUrl: string | null | undefined,
  facing: "left" | "right",
  size: number,
): Promise<string> {
  const cacheKey = `${skinUrl || DEFAULT_STEVE_SKIN_URL}_${facing}_${size}`;
  const existing = headSnapshotCache.get(cacheKey);
  if (existing) return existing;

  const pending = pendingSnapshots.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const renderer = getSharedRenderer();
    if (!renderer) return "";

    renderer.setSize(size, size);

    const scene = new THREE.Scene();
    const d = 6.2;
    const camera = new THREE.OrthographicCamera(-d, d, d, -d, 0.1, 100);
    const camX = facing === "left" ? 12 : -12;
    camera.position.set(camX, 10, 12);
    camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(camX > 0 ? 8 : -8, 14, 8);
    scene.add(dir);

    const texture = await createSkinTexture(skinUrl);

    // Base Head
    const baseMat = new THREE.MeshLambertMaterial({ map: texture, transparent: false });
    const baseGeo = new THREE.BoxGeometry(8, 8, 8);
    applyBoxUvs(baseGeo, computeBoxUvs(0, 0, 8, 8, 8));
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    scene.add(baseMesh);

    // Hat Overlay
    const hatMat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const hatGeo = new THREE.BoxGeometry(8.6, 8.6, 8.6);
    applyBoxUvs(hatGeo, computeBoxUvs(32, 0, 8, 8, 8));
    const hatMesh = new THREE.Mesh(hatGeo, hatMat);
    scene.add(hatMesh);

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL();

    // Clean up Three.js objects
    baseGeo.dispose();
    baseMat.dispose();
    hatGeo.dispose();
    hatMat.dispose();
    ambient.dispose();
    dir.dispose();
    texture.dispose();

    headSnapshotCache.set(cacheKey, dataUrl);
    pendingSnapshots.delete(cacheKey);
    return dataUrl;
  })();

  pendingSnapshots.set(cacheKey, promise);
  return promise;
}

/**
 * Renders a 2D head data URL extracted from skin canvas.
 */
async function snapshot2DHead(skinUrl: string | null | undefined): Promise<string> {
  const cacheKey = `2d_${skinUrl || DEFAULT_STEVE_SKIN_URL}`;
  const existing = headSnapshotCache.get(cacheKey);
  if (existing) return existing;

  const sheet = await loadSkinCanvas(skinUrl);
  const headCanvas = document.createElement("canvas");
  headCanvas.width = 8;
  headCanvas.height = 8;
  const ctx = headCanvas.getContext("2d");
  if (!ctx) return "";

  // Base face
  ctx.drawImage(sheet, 8, 8, 8, 8, 0, 0, 8, 8);
  // Hat overlay
  ctx.drawImage(sheet, 40, 8, 8, 8, 0, 0, 8, 8);

  const dataUrl = headCanvas.toDataURL();
  headSnapshotCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Fast, cached player head renderer.
 * Employs an in-memory snapshot cache and shared renderer to prevent WebGL context exhaustion,
 * ensuring instantaneous rendering even when rapidly switching accounts.
 */
export function PlayerHeadView({
  username,
  skinUrl,
  avatarUrl,
  size = 24,
  viewMode = "3d",
  facing = "right",
  isGray = false,
  className = "",
  style: customStyle,
}: PlayerHeadViewProps) {
  const cacheKey = avatarUrl
    ? avatarUrl
    : viewMode === "2d"
      ? `2d_${skinUrl || DEFAULT_STEVE_SKIN_URL}`
      : `${skinUrl || DEFAULT_STEVE_SKIN_URL}_${facing}_${size}`;

  const cachedUrl = avatarUrl || headSnapshotCache.get(cacheKey) || "";
  const [asyncSrc, setAsyncSrc] = useState<string>("");
  const renderedSrc = cachedUrl || asyncSrc;

  useEffect(() => {
    if (cachedUrl) return;
    let active = true;

    const runner =
      viewMode === "2d" ? snapshot2DHead(skinUrl) : snapshot3DHead(skinUrl, facing, size);
    runner.then((url) => {
      if (active && url) {
        setAsyncSrc(url);
      }
    });

    return () => {
      active = false;
    };
  }, [cacheKey, cachedUrl, viewMode, facing, size, skinUrl]);

  if (!renderedSrc) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "inline-block",
          flexShrink: 0,
          backgroundColor: "transparent",
          ...customStyle,
        }}
      />
    );
  }

  return (
    <img
      src={renderedSrc}
      alt={username ?? "Steve"}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        filter: isGray ? "grayscale(100%)" : "none",
        display: "inline-block",
        flexShrink: 0,
        backgroundColor: "transparent",
        border: "none",
        outline: "none",
        ...customStyle,
      }}
    />
  );
}

/** Legacy alias for backwards compatibility */
export const MinecraftHead = PlayerHeadView;
