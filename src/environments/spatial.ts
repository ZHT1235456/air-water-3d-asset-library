import type { Obstacle, Placement, PlacementIssue, Point2, Polygon, SpatialData } from './types';

const EPS = 1e-7;
const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(p: Point2, a: Point2, b: Point2) {
  return Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}
export function pointInRing(p: Point2, ring: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (onSegment(p, a, b)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(p: Point2, polygon: Polygon) { return pointInRing(p, polygon.outer) && !polygon.holes.some(h => pointInRing(p, h)); }
export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < -EPS && cdA * cdB < -EPS) return true;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
function ringsCross(a: Point2[], b: Point2[]) {
  return a.some((p, i) => b.some((q, j) => segmentsIntersect(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  if (ringsCross(a.outer, b.outer) || b.holes.some(h => ringsCross(a.outer, h)) || a.holes.some(h => ringsCross(h, b.outer))) return true;
  return a.outer.some(p => pointInPolygon(p, b)) || b.outer.some(p => pointInPolygon(p, a));
}
/** Boundary contact is treated conservatively as not safely inside. */
export function ringInsidePolygon(ring: Point2[], polygon: Polygon) {
  return ring.every(p => pointInPolygon(p, polygon)) && !ringsCross(ring, polygon.outer) &&
    polygon.holes.every(h => !ringsCross(ring, h) && !pointInRing(h[0], ring));
}
export function placementVolume(p: Placement) {
  const [x, y, z] = p.position, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const { min, max } = p.bounds;
  const outer: Point2[] = [[min[0], min[2]], [max[0], min[2]], [max[0], max[2]], [min[0], max[2]]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
  return { outer, holes: [], minY: y + min[1], maxY: y + max[1] } satisfies Polygon & { minY: number; maxY: number };
}
export function checkPlacement(spatial: SpatialData, placement: Placement, others: Placement[] = []): PlacementIssue[] {
  const volume = placementVolume(placement), b = spatial.bounds, issues: PlacementIssue[] = [];
  if (volume.outer.some(([x, z]) => x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) issues.push({ code: 'bounds', message: '超出场景边界' });
  if (placement.kind === 'quadrotor' && (volume.minY < spatial.flight.minY || volume.maxY > spatial.flight.maxY)) issues.push({ code: 'altitude', message: '超出飞行高度范围' });
  if (placement.kind === 'usv' && (Math.abs(placement.position[1] - spatial.waterLevel) > EPS || !spatial.water.some(p => ringInsidePolygon(volume.outer, p)))) issues.push({ code: 'water', message: '无人艇未完整处于可通行水域或设计水位' });
  for (const obstacle of spatial.obstacles) {
    if (volume.maxY >= obstacle.minY && volume.minY <= obstacle.maxY && polygonsOverlap(volume, obstacle)) issues.push({ code: 'obstacle', otherId: obstacle.id, message: `与${obstacle.name}重叠` });
  }
  for (const other of others) {
    if (other.id === placement.id) continue;
    const v = placementVolume(other);
    if (volume.maxY >= v.minY && volume.minY <= v.maxY && polygonsOverlap(volume, v)) issues.push({ code: 'vehicle', otherId: other.id, message: `与载具 ${other.id} 重叠` });
  }
  return issues;
}
/** Water-crossing solids only. Elevated bridge decks are deliberately excluded. */
export function surfaceObstacles(spatial: SpatialData): Obstacle[] { return spatial.obstacles.filter(o => o.minY <= 0 && o.maxY >= 0); }
