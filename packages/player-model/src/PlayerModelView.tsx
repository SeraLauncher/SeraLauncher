import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createSkinTexture } from "./skinTexture";
import { buildPlayerModel, type PlayerCharacterRig } from "./skinModel";
import { type Pose, createEmptyPose, getAnimationPose, blendAndApplyPose } from "./animations";
import type { PlayerModelViewProps } from "./types";

export function PlayerModelView({
  skinUrl,
  slim = false,
  size,
  width = size ?? 200,
  height = size ?? 280,
  animated = true,
  animation = "dynamic_idle",
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

  const animationRef = useRef(animation);
  useEffect(() => {
    animationRef.current = animation;
  }, [animation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number | null = null;
    let currentRig: PlayerCharacterRig | null = null;
    let currentTexture: THREE.CanvasTexture | null = null;
    const currentPose: Pose = createEmptyPose();

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 200);
    // Positioned zoomed out to display the entire character with clean margins
    camera.position.set(0, 16, 66);
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
    const startTime = performance.now();
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
          const targetPose = getAnimationPose(animationRef.current, elapsed);
          blendAndApplyPose(currentRig, currentPose, targetPose, 0.15);
        } else {
          currentPose.rootY = 0;
        }

        // follow a fraction of the model lift so lifted poses (levitation/elytra) never exceed the top edge;
        // 0.6 keeps the float motion visible while the hat front corner stays inside the frustum
        const followY = Math.max(0, currentPose.rootY) * 0.6;
        camera.position.y = 16 + followY;
        camera.lookAt(0, 16 + followY, 0);
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
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [skinUrl, slim, width, height, animated, interactive]);

  return <div ref={containerRef} className={`relative select-none ${className}`} />;
}
