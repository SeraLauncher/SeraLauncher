import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createSkinTexture } from "./skinTexture";
import { buildPlayerModel, type PlayerCharacterRig } from "./skinModel";
import type { PlayerModelViewProps } from "./types";

export function PlayerModelView({
  skinUrl,
  slim = false,
  size,
  width = size ?? 200,
  height = size ?? 280,
  animated = true,
  interactive = false,
  className = "",
}: PlayerModelViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Turned slightly towards the right
  const initialRotationY = 0.38;
  const initialRotationX = 0.05;

  const isDraggingRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const rotationYRef = useRef(initialRotationY);
  const rotationXRef = useRef(initialRotationX);
  const targetRotationYRef = useRef(initialRotationY);
  const targetRotationXRef = useRef(initialRotationX);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number | null = null;
    let currentRig: PlayerCharacterRig | null = null;
    let currentTexture: THREE.CanvasTexture | null = null;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 200);
    // Positioned zoomed out to display the entire character with clean margins
    camera.position.set(0, 16, 61);
    camera.lookAt(0, 16, 0);

    // 2. Lighting: soft ambient + directional key + subtle rim
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(24, 40, 40);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 0.45);
    rimLight.position.set(-24, 20, -30);
    scene.add(rimLight);

    // 3. WebGL Renderer with transparent background
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 4. Load Texture and Build Rig
    let cancelled = false;
    createSkinTexture(skinUrl).then((texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      currentTexture = texture;
      const rig = buildPlayerModel(texture, slim);
      currentRig = rig;
      scene.add(rig.root);
    });

    // 5. Interactive pointer event handlers
    const onPointerDown = (e: PointerEvent) => {
      if (!interactive) return;
      isDraggingRef.current = true;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !interactive) return;
      const deltaX = e.clientX - pointerStartRef.current.x;
      const deltaY = e.clientY - pointerStartRef.current.y;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };

      targetRotationYRef.current += deltaX * 0.015;
      targetRotationXRef.current = Math.max(
        -0.35,
        Math.min(0.35, targetRotationXRef.current + deltaY * 0.01),
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      isDraggingRef.current = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore pointer capture release errors
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);

    // 6. Animation loop
    let startTime = performance.now();
    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Smooth damping interpolation
      rotationYRef.current += (targetRotationYRef.current - rotationYRef.current) * 0.12;
      rotationXRef.current += (targetRotationXRef.current - rotationXRef.current) * 0.12;

      if (currentRig) {
        currentRig.root.rotation.y = rotationYRef.current;
        currentRig.root.rotation.x = rotationXRef.current;

        if (animated) {
          const elapsed = (time - startTime) * 0.001;
          // Natural idle breathing: feet stay firmly planted, chest, head and arms breathe
          currentRig.root.position.y = 0;
          const breathCycle = Math.sin(elapsed * 1.6);
          currentRig.bodyPivot.rotation.x = breathCycle * 0.016;
          currentRig.headPivot.rotation.x = Math.sin(elapsed * 1.6 + 0.3) * 0.018;
          currentRig.headPivot.rotation.y = Math.sin(elapsed * 0.8) * 0.035;
          currentRig.leftArmPivot.rotation.z = 0.06 + breathCycle * 0.015;
          currentRig.rightArmPivot.rotation.z = -0.06 - breathCycle * 0.015;
          currentRig.leftArmPivot.rotation.x = breathCycle * 0.025;
          currentRig.rightArmPivot.rotation.x = -breathCycle * 0.025;
        }
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    // 7. Cleanup
    return () => {
      cancelled = true;
      if (animId !== null) cancelAnimationFrame(animId);

      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);

      if (currentRig) {
        scene.remove(currentRig.root);
        currentRig.dispose();
      }
      if (currentTexture) {
        currentTexture.dispose();
      }

      ambient.dispose();
      keyLight.dispose();
      rimLight.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [skinUrl, slim, width, height, animated, interactive]);

  return (
    <div
      ref={containerRef}
      className={`player-model-viewport ${className}`}
      style={{
        width,
        height,
        touchAction: "none",
        userSelect: "none",
        pointerEvents: interactive ? "auto" : "none",
      }}
    />
  );
}
