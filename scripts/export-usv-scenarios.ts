/** Export source notices, actual shoreline thumbnails and editable fleet examples. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { siteSurveys, usvSiteConfigs } from '../src/environments/usv-sites/config';
import { defineUSVSite } from '../src/environments/usv-sites/scene';
import { modelCatalog, serializeSceneConfig } from '../src/scenes/config';
import type { SceneConfig } from '../src/scenes/config';
import type { Point2 } from '../src/environments/types';
import type { USVSiteVariant } from '../src/environments/usv-sites/types';

const references = {
  westlake: { title:'West Lake Cultural Landscape of Hangzhou — UNESCO', url:'https://whc.unesco.org/en/list/1334/' },
  kallang: { title:'Marina Barrage / Marina Reservoir — PUB', url:'https://www.pub.gov.sg/Public/Places-of-Interest/Marina-Barrage' },
  waalhaven: { title:'Waalhaven — Port of Rotterdam', url:'https://www.portofrotterdam.com/nl/vestigen/waalhaven' },
};
for (const variant of Object.keys(siteSurveys) as USVSiteVariant[]) {
  const d=siteSurveys[variant], c=usvSiteConfigs[variant], spatial=defineUSVSite(variant).spatial;
  const dir=`public/assets/${variant}`, base=`/assets/${variant}`;
  const save=(file:string,data:unknown)=>writeFileSync(`${dir}/${file}`,JSON.stringify(data,null,2)+'\n');
  const model=modelCatalog.find(m=>m.id==='usv-survey')!;
  const config:SceneConfig={version:1,environment:{variant,seed:c.seed},vehicles:spatial.spawnPoints.filter(s=>s.kind==='usv').map((s,i)=>({
    id:`v${i+1}`,modelId:model.id,position:s.position,yaw:s.yaw,scale:1,
    colors:{...model.colors,accent:['#247d8c','#c19c40','#b76b50'][Math.floor(i/4)]},
  })),view:{selectedId:null,cameraPosition:c.cameras.establishing.position,target:c.cameras.establishing.target,fov:48,
    labels:false,waterBoundary:false,obstacles:false,spawns:false,waterAnimation:true,rotorAnimation:false}};
  writeFileSync(`${dir}/fleet-scene.json`,serializeSceneConfig(config)+'\n');
  save('navigation.json',{version:1,variant,units:'metres',origin:d.origin,axes:d.origin.axes,waterLevel:0,
    attribution:'© OpenStreetMap contributors',license:'ODbL 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',
    sourceNotice:`${base}/sources.json`,
    purpose:'静态几何运动规划示例；路线是设计示例，不是现场航迹。各路径独立，不包含多艇时序、避碰控制或水动力学。',
    bounds:spatial.bounds,water:spatial.water,obstacles:spatial.obstacles.filter(o=>o.minY<=0&&o.maxY>=0),
    spawnPoints:spatial.spawnPoints.filter(s=>s.kind==='usv'),routes:c.routes,
    corridorDefinition:'corridorRadius 为路线中心线两侧及端点的静态水域留空半径，不等于整组编队可保持刚性队形通过。',
  });
  const measured=d.buildings.filter(b=>b.heightBasis==='osm-height').length;
  const floors=d.buildings.filter(b=>b.heightBasis==='levels-estimate').length;
  save('sources.json',{
    scene:c.name,variant,reviewed:'2026-10-24',scope:'实景岸线与设施轮廓版；适合米制水域编队及运动规划的几何实验。未取得高程模型，不是实测三维孪生。',
    coordinateSystem:d.origin,extentMetres:[d.width,d.depth],verticalDatum:'局部显示水位 Y=0；岸面统一设定高度，不对应实地潮位或测量高程。',
    counts:{waterPolygons:d.water.length,buildings:d.buildings.length,structures:d.structures.length,osmHeight:measured,estimatedFromLevels:floors,displayHeight:d.buildings.length-measured-floors},
    verified:['OSM water 多边形及孔洞、真实建筑/道路/码头/桥位轮廓；保留稳定 OSM ID。','水域与陆地同源；岛屿和突堤从水域中扣除。','12 个出生点及参考航线按当前静态几何检查。'],
    limitations:[
      'OSM 记录存在采集年代、位置误差和缺漏，未作现场测量校核。0.2 m 岸线简化容差不是数据测量精度。',
      `岸面高度 ${d.bankHeight} m 为显示设定；建筑仅 ${measured} 个轮廓有 OSM height 标签，${floors} 个按层数 × 3.2 m 估计，其余为统一显示高度。`,
      '建筑屋顶、门窗、树木、表面颜色、水波与天空均为外观表达；不代表现场细部、树位或当天气象。',
      '桥梁仅保留已标绘平面范围，显示桥面高度为近似；未核实桥下净空/桥墩，整个桥位作为保守水面障碍，不开放虚构桥洞。',
      '没有水深、潮汐、流场、船流或临时障碍数据；参考航线不代表实地通航许可，群体动力学与避碰算法由使用方接入。',
      '这是矩形裁剪范围，未补造范围之外的城市或山体；低机位可见裁剪边缘。',
    ],
    sources:[{title:'OpenStreetMap geographic database',url:`https://www.openstreetmap.org/#map=15/${d.origin.latitude}/${d.origin.longitude}`,
      author:'© OpenStreetMap contributors',license:'ODbL 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',
      attributionUrl:'https://www.openstreetmap.org/copyright',downloadUrls:readFileSync(`${dir}/download-urls.txt`,'utf8').trim().split(/\r?\n/),
      snapshot:`${base}/site.osm`,sha256:createHash('sha256').update(readFileSync(`${dir}/site.osm`)).digest('hex'),
      derivedDatabase:`${base}/layout.json`,derivedDatabaseLicense:'ODbL 1.0',
      modifications:'合并 OSM API 分块和完整水域关系；筛除无关记录；投影至本地 UTM 米制坐标；裁剪、有效化、简化岸线；线状道路按标签宽度或显示宽度缓冲。'},
      {...references[variant],usage:'地点与地理背景核对；网页照片未下载或作为纹理分发。'},
      {title:'Kloppenheim 06 Pure Sky — Poly Haven',url:'https://polyhaven.com/a/kloppenheim_06_puresky',author:'Greg Zaal, Jarod Guest',license:'CC0 1.0',usage:'共用通用天空与环境光，非现场摄影。'}],
  });
  const ring=(points:Point2[])=>'M'+points.map(([x,z])=>`${x.toFixed(1)},${z.toFixed(1)}`).join('L')+'Z';
  const paths=d.water.map(p=>`<path d="${ring(p.outer)}${p.holes.map(ring).join('')}" fill="#568b96" fill-rule="evenodd"/>`).join('');
  writeFileSync(`${dir}/map.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-d.width/2} ${-d.depth/2} ${d.width} ${d.depth}"><title>${c.name} · © OpenStreetMap contributors</title><rect x="${-d.width/2}" y="${-d.depth/2}" width="${d.width}" height="${d.depth}" fill="#bcc6ad"/>${paths}</svg>\n`);
  console.log(`${variant}: 12 boats, ${c.routes.length} routes; ${measured}/${d.buildings.length} explicit OSM heights`);
}
