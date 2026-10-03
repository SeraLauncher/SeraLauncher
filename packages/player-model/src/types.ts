export interface PlayerModelViewProps {
  skinUrl?: string | null;
  username?: string;
  slim?: boolean;
  size?: number;
  width?: number;
  height?: number;
  animated?: boolean;
  interactive?: boolean;
  className?: string;
}

export interface BoxFaceUv {
  right: [number, number, number, number];
  left: [number, number, number, number];
  top: [number, number, number, number];
  bottom: [number, number, number, number];
  front: [number, number, number, number];
  back: [number, number, number, number];
}

export interface BodyPartSpec {
  w: number;
  h: number;
  d: number;
  origin: [number, number];
  layerOrigin?: [number, number];
  layerDelta?: number;
}
