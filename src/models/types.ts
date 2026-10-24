import type { ColorRepresentation, Group, Object3D } from 'three';

export type QuadrotorVariant = 'inspection' | 'survey' | 'heavy' | 'protected' | 'rescue' | 'cargo' | 'multispectral' | 'relay';
export type USVVariant = 'inspection' | 'survey' | 'utility' | 'rescue' | 'sampling' | 'endurance' | 'multibeam' | 'relay' | 'debris' | 'patrol';
export interface ModelColors {
  primary?: ColorRepresentation;
  secondary?: ColorRepresentation;
  accent?: ColorRepresentation;
}
export interface ModelOptions<V extends string> {
  variant?: V;
  /** Positive uniform scale. Geometry units before scaling are metres. */
  scale?: number;
  colors?: ModelColors;
}
export interface ModelHandle {
  root: Group;
  /** Stable semantic names; the same objects can be found by root.getObjectByName(). */
  parts: Record<string, Object3D>;
  /** Seconds and radians/second. Paused by default. Negative speeds reverse rotation. */
  update(deltaSeconds: number, state?: { rotorSpeed?: number; rotorSpeeds?: number[]; /** Absolute signed angles for deterministic physics replay. */ rotorAngles?: number[] }): void;
  /** Idempotent. Removes root from parent and frees only this instance's resources. */
  dispose(): void;
}
