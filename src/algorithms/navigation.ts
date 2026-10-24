import { pointInPolygon, segmentsIntersect } from '../environments/spatial';
import type { Point2, Polygon, SpatialData } from '../environments/types';

export const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = (path: Point2[]) => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
const finitePoint = (p: Point2) => p.length === 2 && p.every(Number.isFinite);
export function pointSegmentDistance(p: Point2, a: Point2, b: Point2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], d2 = dx * dx + dz * dz;
  const t = d2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / d2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
function segmentDistance(a: Point2, b: Point2, c: Point2, d: Point2) {
  return segmentsIntersect(a, b, c, d) ? 0 : Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
type Edge = { a: Point2; b: Point2 };
type BoundedPolygon = { polygon: Polygon; minX: number; maxX: number; minZ: number; maxZ: number };
function bounded(polygon: Polygon): BoundedPolygon {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { polygon, minX, maxX, minZ, maxZ };
}
const inside = (p: Point2, b: BoundedPolygon) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ && pointInPolygon(p, b.polygon);

/** Immutable scene geometry. Boundary contact is blocked; overlapping water polygons are conservative. */
export class NavigationDomain {
  private water: BoundedPolygon[];
  readonly obstacles: BoundedPolygon[];
  private bins = new Map<string, Edge[]>();
  private binSize: number;
  readonly bounds: SpatialData['bounds'];
  constructor(readonly spatial: SpatialData, height = { minY: -1, maxY: 2 }) {
    this.bounds = spatial.bounds;
    this.water = spatial.water.map(bounded);
    this.obstacles = spatial.obstacles.filter(o => o.minY <= height.maxY && o.maxY >= height.minY).map(bounded);
    this.binSize = Math.max(10, Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) / 60);
    for (const { polygon } of [...this.water, ...this.obstacles]) for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], edge = { a, b };
        this.forBins(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), key => {
          const bin = this.bins.get(key); if (bin) bin.push(edge); else this.bins.set(key, [edge]);
        });
      }
    }
  }
  private forBins(minX: number, maxX: number, minZ: number, maxZ: number, visit: (key: string) => void) {
    for (let x = Math.floor(minX / this.binSize); x <= Math.floor(maxX / this.binSize); x++)
      for (let z = Math.floor(minZ / this.binSize); z <= Math.floor(maxZ / this.binSize); z++) visit(`${x},${z}`);
  }
  private edgesNear(a: Point2, b: Point2, r: number) {
    const found = new Set<Edge>();
    this.forBins(Math.min(a[0], b[0]) - r, Math.max(a[0], b[0]) + r, Math.min(a[1], b[1]) - r, Math.max(a[1], b[1]) + r, key => {
      for (const edge of this.bins.get(key) ?? []) found.add(edge);
    });
    return found;
  }
  contains(p: Point2, radius: number) {
    if (!finitePoint(p) || !Number.isFinite(radius) || radius < 0) return false;
    const b = this.bounds;
    if (p[0] - radius <= b.minX || p[0] + radius >= b.maxX || p[1] - radius <= b.minZ || p[1] + radius >= b.maxZ) return false;
    if (!this.water.some(w => inside(p, w)) || this.obstacles.some(o => inside(p, o))) return false;
    for (const e of this.edgesNear(p, p, radius)) if (pointSegmentDistance(p, e.a, e.b) <= radius + 1e-7) return false;
    return true;
  }
  segmentClear(a: Point2, b: Point2, radius: number, endpointsKnownFree = false) {
    if (!endpointsKnownFree && (!this.contains(a, radius) || !this.contains(b, radius))) return false;
    for (const e of this.edgesNear(a, b, radius)) if (segmentDistance(a, b, e.a, e.b) <= radius + 1e-7) return false;
    return true;
  }
}

/** Minimum simultaneous centre distance along two linear movements, not just their endpoints. */
export function sweptSeparation(a: Point2, nextA: Point2, b: Point2, nextB: Point2) {
  const relative: Point2 = [a[0] - b[0], a[1] - b[1]];
  const end: Point2 = [nextA[0] - nextB[0], nextA[1] - nextB[1]];
  return pointSegmentDistance([0, 0], relative, end);
}
