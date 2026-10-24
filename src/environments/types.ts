import type { Color, Group, Vector3, Texture } from 'three';

export type EnvironmentVariant = 'lake' | 'river' | 'harbor' | 'islands' | 'bridge' | 'waterfront' | 'deepwater' | 'qingzhou' | 'jiuzhou' | 'hornsea' | 'ninepin' | 'westlake' | 'kallang' | 'waalhaven';
export type Point2 = [number, number]; // X, Z
export type Point3 = [number, number, number];
export interface Polygon { outer: Point2[]; holes: Point2[][] }
export interface Obstacle extends Polygon {
  id: string;
  name: string;
  minY: number;
  maxY: number;
  kind: 'land' | 'building' | 'pier' | 'bridge' | 'rock' | 'tree' | 'facility';
  color: string;
}
export interface SpatialData {
  units: 'metres';
  waterLevel: 0;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  water: Polygon[];
  obstacles: Obstacle[];
  flight: { minY: number; maxY: number };
  spawnPoints: { id: string; kind: 'quadrotor' | 'usv'; position: Point3; yaw: number }[];
}
export interface EnvironmentDefinition {
  variant: EnvironmentVariant;
  seed: number;
  spatial: SpatialData;
}
export interface EnvironmentHandle {
  root: Group;
  spatial: SpatialData;
  presentation: { background: string; fog: [number, number]; sunPosition: Point3; cameraPosition: Point3; target: Point3; backgroundAsset?: string; cameraFar?: number };
  setVessels?(vessels: { id: string; position: Point3; yaw: number; length: number }[]): void;
  setSun?(direction: Vector3): void;
  setHorizon?(color: Color): void;
  setSky?(texture: Texture): void;
  invalidateReflection?(): void;
  /** Only visual water time changes. Spatial data and water level remain fixed. */
  update(deltaSeconds: number): void;
  dispose(): void;
}
export interface Placement {
  id: string;
  kind: 'quadrotor' | 'usv';
  position: Point3;
  yaw: number;
  /** Local conservative box, including the complete swept rotor envelope. */
  bounds: { min: Point3; max: Point3 };
}
export interface PlacementIssue {
  code: 'bounds' | 'altitude' | 'water' | 'obstacle' | 'vehicle';
  message: string;
  otherId?: string;
}
