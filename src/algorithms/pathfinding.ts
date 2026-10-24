import type { Point2 } from '../environments/types';
import { NavigationDomain, distance, pathLength } from './navigation';
import type { SearchResult } from './types';

class MinHeap {
  private data: { id: number; priority: number }[] = [];
  get length() { return this.data.length; }
  push(item: { id: number; priority: number }) {
    let i = this.data.length; this.data.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (this.data[p].priority <= item.priority) break; this.data[i] = this.data[p]; i = p; }
    this.data[i] = item;
  }
  pop() {
    const first = this.data[0], last = this.data.pop()!;
    if (this.data.length) {
      let i = 0;
      while (2 * i + 1 < this.data.length) {
        let child = 2 * i + 1;
        if (child + 1 < this.data.length && this.data[child + 1].priority < this.data[child].priority) child++;
        if (last.priority <= this.data[child].priority) break;
        this.data[i] = this.data[child]; i = child;
      }
      this.data[i] = last;
    }
    return first;
  }
}

/** A* and Dijkstra share exactly the same 8-neighbour graph and endpoint connectors. */
export class GridPlanner {
  readonly nx: number;
  readonly nz: number;
  private occupancy: Int8Array;
  private edgeCache = new Map<string, boolean>();
  constructor(readonly domain: NavigationDomain, readonly cellSize: number, readonly radius: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isFinite(radius) || radius <= 0) throw new Error('栅格尺寸和包络半径必须大于 0');
    const b = domain.bounds;
    this.nx = Math.ceil((b.maxX - b.minX) / cellSize); this.nz = Math.ceil((b.maxZ - b.minZ) / cellSize);
    if (this.nx * this.nz > 100_000) throw new Error('栅格超过 100,000 个，请增大栅格尺寸');
    this.occupancy = new Int8Array(this.nx * this.nz);
  }
  private point(id: number): Point2 { return [this.domain.bounds.minX + (id % this.nx + 0.5) * this.cellSize, this.domain.bounds.minZ + (Math.floor(id / this.nx) + 0.5) * this.cellSize]; }
  private free(id: number) {
    if (!this.occupancy[id]) this.occupancy[id] = this.domain.contains(this.point(id), this.radius) ? 1 : -1;
    return this.occupancy[id] === 1;
  }
  private edge(a: number, b: number) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    let valid = this.edgeCache.get(key);
    if (valid === undefined) { valid = this.domain.segmentClear(this.point(a), this.point(b), this.radius, true); this.edgeCache.set(key, valid); }
    return valid;
  }
  private connectors(p: Point2) {
    const x = Math.floor((p[0] - this.domain.bounds.minX) / this.cellSize), z = Math.floor((p[1] - this.domain.bounds.minZ) / this.cellSize);
    const found: number[] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const cx = x + dx, cz = z + dz, id = cz * this.nx + cx;
      if (cx >= 0 && cx < this.nx && cz >= 0 && cz < this.nz && this.free(id) && this.domain.segmentClear(p, this.point(id), this.radius, true)) found.push(id);
    }
    return found;
  }
  search(start: Point2, goal: Point2, method: 'astar' | 'dijkstra' = 'astar'): SearchResult {
    if (!this.domain.contains(start, this.radius)) throw new Error('起点或编队包络接近岸线、障碍物，请调整起点或缩小编队');
    if (!this.domain.contains(goal, this.radius)) throw new Error('终点或编队包络接近岸线、障碍物，请调整终点或缩小编队');
    if (distance(start, goal) < 1e-7) return { path: [[...start]], expanded: 0, gridCost: 0, length: 0 };
    const starts = this.connectors(start), ends = new Set(this.connectors(goal));
    if (!starts.length || !ends.size) throw new Error('起终点无法连接栅格，请减小栅格尺寸或移动选点');
    const n = this.occupancy.length, goalId = n, costs = new Float64Array(n + 1).fill(Infinity), parents = new Int32Array(n + 1).fill(-1), closed = new Uint8Array(n + 1), queue = new MinHeap();
    const h = (id: number) => method === 'astar' && id !== goalId ? distance(this.point(id), goal) : 0;
    for (const id of starts) { costs[id] = distance(start, this.point(id)); queue.push({ id, priority: costs[id] + h(id) }); }
    let expanded = 0;
    while (queue.length) {
      const { id } = queue.pop(); if (closed[id]) continue;
      closed[id] = 1; expanded++;
      if (id === goalId) break;
      const candidates: number[] = [], x = id % this.nx, z = Math.floor(id / this.nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= this.nx || z + dz < 0 || z + dz >= this.nz) continue;
        const next = (z + dz) * this.nx + x + dx;
        if (!closed[next] && this.free(next) && this.edge(id, next)) candidates.push(next);
      }
      if (ends.has(id)) candidates.push(goalId);
      for (const next of candidates) {
        const cost = costs[id] + distance(this.point(id), next === goalId ? goal : this.point(next));
        if (cost + 1e-8 >= costs[next]) continue;
        costs[next] = cost; parents[next] = id; queue.push({ id: next, priority: cost + h(next) });
      }
    }
    if (!closed[goalId]) throw new Error('此栅格下未找到可通航路径，请调整选点、减小栅格或更换水域');
    const raw: Point2[] = [[...goal]];
    for (let id = parents[goalId]; id !== -1; id = parents[id]) raw.push(this.point(id));
    raw.push([...start]); raw.reverse();
    const path = simplifyPath(raw, this.domain, this.radius);
    return { path, expanded, gridCost: costs[goalId], length: pathLength(path) };
  }
}

export function simplifyPath(path: Point2[], domain: NavigationDomain, radius: number) {
  const result: Point2[] = [path[0]];
  for (let i = 0; i < path.length - 1;) {
    let j = path.length - 1;
    while (j > i + 1 && !domain.segmentClear(path[i], path[j], radius, true)) j--;
    result.push(path[j]); i = j;
  }
  return result;
}
