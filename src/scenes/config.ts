import * as T from 'three';
import { quadrotorPresets, usvPresets } from '../models';
import type { ModelHandle } from '../models';
import { environmentPresets } from '../environments';
import type { EnvironmentVariant, Placement, Point3 } from '../environments';

export const modelCatalog = [
  ...Object.entries(quadrotorPresets).map(([variant, p]) => ({ id: `quadrotor-${variant}`, kind: 'quadrotor' as const, variant, name: p.name, code: p.code, colors: { primary: p.primary, secondary: p.secondary, accent: p.accent } })),
  ...Object.entries(usvPresets).map(([variant, p]) => ({ id: `usv-${variant}`, kind: 'usv' as const, variant, name: p.name, code: p.code, colors: { primary: p.primary, secondary: p.secondary, accent: p.accent } })),
];
export interface VehicleConfig {
  id: string;
  modelId: string;
  position: Point3;
  yaw: number;
  scale: number;
  colors: { primary: string; secondary: string; accent: string };
}
export interface SceneConfig {
  version: 1;
  environment: { variant: EnvironmentVariant; seed: number };
  vehicles: VehicleConfig[];
  view: {
    selectedId: string | null;
    cameraPosition: Point3;
    target: Point3;
    fov?: number;
    labels: boolean;
    waterBoundary: boolean;
    obstacles: boolean;
    spawns: boolean;
    waterAnimation: boolean;
    rotorAnimation: boolean;
  };
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置字段须为对象');
  return value as Record<string, unknown>;
};
function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) throw new Error(`${label}须为绝对值不超过 1,000,000 的有限数`);
  return value;
}
function tuple(value: unknown, label: string): Point3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label}须为三维坐标`);
  return value.map(v => finite(v, label)) as Point3;
}
function boolean(value: unknown, label: string) { if (typeof value !== 'boolean') throw new Error(`${label}须为布尔值`); return value; }
/** Pure validation, no model allocation or mutation of an existing scene. */
export function parseSceneConfig(text: string): SceneConfig {
  if (text.length > 2_000_000) throw new Error('配置文件超过 2 MB');
  const raw = object(JSON.parse(text));
  if (raw.version !== 1) throw new Error('不支持的配置版本');
  const e = object(raw.environment);
  if (typeof e.variant !== 'string' || !Object.hasOwn(environmentPresets, e.variant)) throw new Error('未知环境类型');
  if (typeof e.seed !== 'number' || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0xffffffff) throw new Error('环境种子无效');
  if (!Array.isArray(raw.vehicles) || raw.vehicles.length > 100) throw new Error('载具列表须为数组且最多 100 个');
  const ids = new Set<string>();
  const vehicles = raw.vehicles.map(value => {
    const v = object(value);
    if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.id) || ids.has(v.id)) throw new Error('载具 ID 无效或重复');
    ids.add(v.id);
    const model = modelCatalog.find(m => m.id === v.modelId); if (!model) throw new Error('未知载具型号');
    const position = tuple(v.position, '载具位置'), yaw = finite(v.yaw, '朝向'), scale = finite(v.scale, '缩放');
    if (scale <= 0 || scale > 100) throw new Error('缩放须大于 0 且不超过 100');
    if (model.kind === 'usv' && position[1] !== 0) throw new Error('无人艇 Y 坐标须为设计水位 0');
    const c = object(v.colors), colors = { primary: '', secondary: '', accent: '' };
    for (const key of ['primary', 'secondary', 'accent'] as const) {
      if (typeof c[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c[key])) throw new Error('配色须为六位十六进制颜色');
      colors[key] = c[key] as string;
    }
    return { id: v.id, modelId: model.id, position, yaw, scale, colors };
  });
  const v = object(raw.view), cameraPosition = tuple(v.cameraPosition, '相机位置'), target = tuple(v.target, '相机目标');
  if (v.selectedId !== null && (typeof v.selectedId !== 'string' || !ids.has(v.selectedId))) throw new Error('所选载具 ID 不存在');
  if (v.fov !== undefined && (typeof v.fov !== 'number' || !Number.isFinite(v.fov) || v.fov < 20 || v.fov > 75)) throw new Error('相机视场角须为 20–75°');
  if (cameraPosition.every((n, i) => n === target[i])) throw new Error('相机位置不能与目标重合');
  return {
    version: 1, environment: { variant: e.variant as EnvironmentVariant, seed: e.seed }, vehicles,
    view: { selectedId: v.selectedId as string | null, cameraPosition, target, ...(v.fov !== undefined ? { fov: v.fov as number } : {}), labels: boolean(v.labels, '标签'), waterBoundary: boolean(v.waterBoundary, '水域边界'), obstacles: boolean(v.obstacles, '障碍体'), spawns: boolean(v.spawns, '出生点'), waterAnimation: boolean(v.waterAnimation, '水面动画'), rotorAnimation: boolean(v.rotorAnimation, '桨叶动画') },
  };
}
export function serializeSceneConfig(config: SceneConfig) { return JSON.stringify(parseSceneConfig(JSON.stringify(config)), null, 2); }
export function conservativeBounds(handle: ModelHandle, modelId: string): Placement['bounds'] {
  const bounds = new T.Box3().setFromObject(handle.root);
  const model = modelCatalog.find(m => m.id === modelId)!;
  if (model.kind === 'quadrotor') {
    const p = quadrotorPresets[model.variant as keyof typeof quadrotorPresets], scale = handle.root.scale.x;
    bounds.min.x = Math.min(bounds.min.x, -(p.armX + p.radius * 1.03) * scale);
    bounds.max.x = Math.max(bounds.max.x, (p.armX + p.radius * 1.03) * scale);
    bounds.min.z = Math.min(bounds.min.z, -(p.armZ + p.radius * 1.03) * scale);
    bounds.max.z = Math.max(bounds.max.z, (p.armZ + p.radius * 1.03) * scale);
  }
  return { min: bounds.min.toArray() as Point3, max: bounds.max.toArray() as Point3 };
}
