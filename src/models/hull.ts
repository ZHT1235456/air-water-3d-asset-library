import * as T from 'three';

/** Continuous station profile, one monohull, a single bow apex at +length/2. */
export function hullProfile(t: number, width: number, deck: number) {
  const bow = Math.max(0, (t - 0.48) / 0.52);
  return { halfWidth: width / 2 * (0.83 + 0.17 * Math.sin(Math.PI * Math.min(t / 0.7, 1) / 2)) * (1 - Math.pow(bow, 1.65)), top: deck + deck * 0.32 * Math.pow(t, 5) };
}
export function createHullGeometry(length: number, width: number, depth: number, deck: number) {
  const positions: number[] = [], buckets: number[][] = [[], [], []];
  const stations = 48, ring = 10;
  for (let i = 0; i < stations; i++) {
    const t = i / stations;
    const { halfWidth: w, top } = hullProfile(t, width, deck);
    const bottom = -depth * (1 - 0.78 * Math.pow(t, 4));
    const contour = [[w, top], [w * 0.98, 0.025], [w * 0.64, bottom * 0.78], [0, bottom], [-w * 0.64, bottom * 0.78], [-w * 0.98, 0.025], [-w, top], [-w * 0.55, top], [0, top], [w * 0.55, top]];
    for (const [x, y] of contour) positions.push(x, y, (t - 0.5) * length);
  }
  // Single vertex closes every longitudinal surface at the bow.
  const tip = positions.length / 3;
  positions.push(0, deck * 1.32, length / 2);
  const stern = positions.length / 3;
  positions.push(0, 0, -length / 2);
  for (let i = 0; i < stations - 1; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    buckets[j >= 6 ? 1 : j >= 1 && j <= 4 ? 2 : 0].push(a, c, b, b, c, d);
  }
  for (let j = 0; j < ring; j++) {
    buckets[0].push(stern, j, (j + 1) % ring);
    buckets[j >= 6 ? 1 : 0].push((stations - 1) * ring + j, tip, (stations - 1) * ring + (j + 1) % ring);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setIndex(buckets.flat());
  // Batch by surface material: only three draw calls for the complete hull.
  let offset = 0;
  buckets.forEach((bucket, materialIndex) => { g.addGroup(offset, bucket.length, materialIndex); offset += bucket.length; });
  g.computeVertexNormals(); g.computeBoundingBox(); return g;
}
