import type { AlgorithmId } from './types';

export const algorithmCatalog: { id: AlgorithmId; name: string; family: string; label: string; description: string; equation: string; note: string; reference?: { title: string; url: string } }[] = [
  { id: 'astar', name: 'A* 启发式规划', family: '路径规划', label: 'A*', description: '在水域栅格上搜索航线，用直线距离引导搜索方向。', equation: 'f(n) = g(n) + h(n)', note: '八邻接栅格 + 欧氏启发式；折线按通视条件简化。最优性针对栅格图，不代表连续空间最短。', reference: { title: 'Hart, Nilsson & Raphael · 1968', url: 'https://www.cs.auckland.ac.nz/courses/compsci709s2c/resources/Mike.d/astarNilsson.pdf' } },
  { id: 'dijkstra', name: 'Dijkstra 最短路', family: '路径规划', label: 'DIJ', description: '按累计路程扩展节点，可与 A* 比较搜索开销。', equation: 'f(n) = g(n)', note: '与 A* 使用相同栅格和连接规则。搜索节点数反映工作量，简化航线长度单独统计。', reference: { title: 'E. W. Dijkstra · 1959', url: 'https://link.springer.com/article/10.1007/BF01386390' } },
  { id: 'leader', name: '领航跟随', family: '集群控制', label: 'L–F', description: '领航艇沿 A* 航线运动，其余艇保持世界坐标系中的队形偏移。', equation: 'uᵢ = u₀ + k (p₀ + dᵢ − pᵢ)', note: '工程基线：初始队形展开 8%，固定朝向，领航艇预留 25% 速度余量。按整个编队的保守圆包络规划。' },
  { id: 'consensus', name: '一致性编队', family: '集群控制', label: 'Σ', description: '艇群从展开队形收敛到设定间距，观察误差如何下降。', equation: 'qᵢ = pᵢ − dᵢ ; uᵢ = k (q̄ − qᵢ)', note: '固定完全图、无通信时延。水动力学模式将速度指令交给推进器控制，不保证质心不变；运动学模式保留一阶基线。不复现切换拓扑论文的全部结论。', reference: { title: 'Olfati-Saber & Murray · 2004', url: 'https://www.ee.iitb.ac.in/~dc/EE749/Olfati.pdf' } },
  { id: 'coverage', name: '分区往复覆盖', family: '协同任务', label: 'SWP', description: '将矩形区域均分给各艇，按往复航线遍历可通航采样点。', equation: '任务区 → 条带分区 → 往复航线', note: '工程条带基线；障碍段以 A* 连接。覆盖率指离散采样点到达率，不是连续面积覆盖率，也不是完整牛耕分解实现。', reference: { title: '覆盖规划背景 · Choset & Pignon · 1997', url: 'https://publications.ri.cmu.edu/coverage-path-planning-the-boustrophedon-decomposition' } },
];
