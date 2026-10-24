import type { Point2, Polygon } from '../types';

export type USVSiteVariant = 'westlake' | 'kallang' | 'waalhaven';
export interface MappedFeature {
  id: string;
  osmType: string;
  osmId: string;
  name: string;
  polygon: Polygon;
}
export interface SiteSurvey {
  variant: USVSiteVariant;
  origin: { latitude: number; longitude: number; crs: string; easting: number; northing: number; axes: string };
  width: number;
  depth: number;
  bankHeight: number;
  water: Polygon[];
  land: Polygon[];
  waterSources: { type: string; id: string; name: string }[];
  buildings: (MappedFeature & { height: number; heightBasis: string })[];
  green: MappedFeature[];
  roads: (MappedFeature & { pedestrian: boolean })[];
  structures: (MappedFeature & { kind: 'pier' | 'bridge'; height: number; heightBasis: string; clearanceVerified: boolean })[];
}
export interface SiteRoute {
  id: string;
  name: string;
  points: Point2[];
  corridorRadius: number;
}
