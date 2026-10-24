import type { Point2 } from '../environments/types';
import type { USVVariant } from '../models/types';
import type { USVState } from '../dynamics';

export type AlgorithmId = 'astar' | 'dijkstra' | 'leader' | 'consensus' | 'coverage';
export type Formation = 'wedge' | 'column' | 'line';
export interface ExperimentConfig {
  /** Default: dynamics. Kinematic is an explicitly selected algorithm-only baseline. */
  motion?: 'dynamics' | 'kinematic';
  vehicle?: USVVariant;
  current?: Point2;
  wind?: Point2;
  algorithm: AlgorithmId;
  start: Point2;
  goal: Point2;
  fleetSize: number;
  speed: number;
  spacing: number;
  gain: number;
  gridSize: number;
  /** Conservative horizontal envelope, including equipment and extra clearance. */
  radius: number;
  minY: number;
  maxY: number;
  formation: Formation;
  coverageWidth: number;
  coverageHeight: number;
  laneSpacing: number;
}
export interface SearchResult { path: Point2[]; expanded: number; gridCost: number; length: number }
export interface ExperimentPlan {
  config: ExperimentConfig;
  initial: Point2[];
  routes: Point2[][];
  offsets: Point2[];
  targets: Point2[];
  samples: { point: Point2; boat: number }[];
  excludedSamples: number;
  expanded: number;
  gridCost: number;
  routeLength: number;
}
export interface VesselState { id: string; position: Point2; yaw: number; distance: number; waypoint: number }
export interface Frame { time: number; vessels: { position: Point2; yaw: number; dynamics?: USVState }[] }
export type RunStatus = 'ready' | 'running' | 'complete' | 'blocked' | 'timeout';
