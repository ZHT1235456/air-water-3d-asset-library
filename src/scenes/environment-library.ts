import type { EnvironmentVariant } from '../environments/types';
import { marineConfig } from '../environments/marine/config';
import { qingzhouConfig } from '../environments/qingzhou/config';
import { ninepinConfig } from '../environments/ninepin/config';
import { hornseaConfig } from '../environments/hornsea/config';
import { jiuzhouConfig } from '../environments/jiuzhou/config';
import { usvSiteConfigs } from '../environments/usv-sites/config';
/** Explicit display registry: adding a site must not hide previously delivered environments. */
export const environmentLibrary = [
  {variant:'deepwater',category:'原创工程示范',fixedAerial:false,cameras:marineConfig.cameras,height:110,source:'/assets/environment/sources.json',attribution:'深水港原创布局 · 天空 CC0 · 来源说明'},
  {variant:'qingzhou',category:'实景校核版',fixedAerial:true,cameras:qingzhouConfig.cameras,height:175,source:'/assets/qingzhou/sources.json',attribution:'地图 © OpenStreetMap contributors · ODbL · 工程数据说明'},
  {variant:'jiuzhou',category:'实景校核版',fixedAerial:true,cameras:jiuzhouConfig.cameras,height:125,source:'/assets/jiuzhou/sources.json',attribution:'地图 © OpenStreetMap contributors · ODbL · 工程数据说明'},
  {variant:'hornsea',category:'实景局部校核版',fixedAerial:true,cameras:hornseaConfig.cameras,height:210,source:'/assets/hornsea/sources.json',attribution:'G33 周边 12 台 · 机位 © OpenStreetMap contributors · ODbL · 精度说明'},
  {variant:'ninepin',category:'实景地形校核版',fixedAerial:true,cameras:ninepinConfig.cameras,height:125,source:'/assets/ninepin/sources.json',attribution:'岸线 © OSM · 地形 © 香港特区政府 地政总署 / DATA.GOV.HK · 精度说明'},
  ...(['westlake','kallang','waalhaven'] as const).map(variant => ({
    variant, category:'实景岸线 · 集群场景', fixedAerial:true, cameras:usvSiteConfigs[variant].cameras, height:200,
    source:`/assets/${variant}/sources.json`, attribution:'岸线与轮廓 © OpenStreetMap contributors · ODbL · 高度部分近似 · 数据说明',
    fleetSize:12,
  })),
] as const;
export const libraryEntry=(variant:EnvironmentVariant)=>environmentLibrary.find(entry=>entry.variant===variant);
