export const quadrotorPresets = {
  inspection: { name: '轻型巡检', code: 'Q-01', description: '紧凑机身 / 双轴云台 / X 形四旋翼', armX: 0.265, armZ: 0.245, radius: 0.175, body: [0.20, 0.105, 0.30], leg: 0.13, primary: '#e7ecef', secondary: '#28363f', accent: '#df6c39' },
  survey: { name: '专业测绘', code: 'Q-02', description: '碳纤维机臂 / 测绘载荷 / 高位定位天线', armX: 0.40, armZ: 0.36, radius: 0.24, body: [0.27, 0.12, 0.35], leg: 0.29, primary: '#e2e9ed', secondary: '#293b46', accent: '#267ca0' },
  heavy: { name: '重载作业', code: 'Q-03', description: '加强机臂 / 双电池舱 / 腹部挂载平台', armX: 0.55, armZ: 0.48, radius: 0.32, body: [0.36, 0.16, 0.44], leg: 0.38, primary: '#d4dce0', secondary: '#303c42', accent: '#df6c39' },
  protected: { name: '近距巡检', code: 'Q-04', description: '环形桨叶护罩 / 紧凑机身 / 前置云台', armX: 0.24, armZ: 0.23, radius: 0.15, body: [0.19, 0.10, 0.24], leg: 0.15, primary: '#e4ebeb', secondary: '#304649', accent: '#408f81' },
  rescue: { name: '应急照明', code: 'Q-05', description: '双探照灯 / 定向扬声器 / 高起落架', armX: 0.39, armZ: 0.35, radius: 0.23, body: [0.28, 0.13, 0.36], leg: 0.32, primary: '#ece8e1', secondary: '#38424a', accent: '#d95e32' },
  cargo: { name: '物资运输', code: 'Q-06', description: '封闭货舱 / 悬挂锁扣 / 双电池供电', armX: 0.59, armZ: 0.53, radius: 0.33, body: [0.38, 0.17, 0.46], leg: 0.52, primary: '#dde6ed', secondary: '#2d3e50', accent: '#417fae' },
  multispectral: { name: '多光谱观测', code: 'Q-07', description: '四通道下视相机 / 顶置光照传感器 / 高起落架', armX: 0.43, armZ: 0.38, radius: 0.245, body: [0.30, 0.13, 0.38], leg: 0.34, primary: '#e2ebe3', secondary: '#31463c', accent: '#528665' },
  relay: { name: '空中中继', code: 'Q-08', description: '双极化面板天线 / 通信设备舱 / 双鞭状天线', armX: 0.46, armZ: 0.42, radius: 0.26, body: [0.32, 0.14, 0.40], leg: 0.36, primary: '#e4e7ef', secondary: '#394255', accent: '#6b7dab' },
} as const;
export const usvPresets = {
  inspection: { name: '轻型巡检', code: 'S-01', description: '单尖船首 / 流线设备舱 / 单推进器', length: 1.8, width: 0.64, depth: 0.22, deck: 0.18, primary: '#e7ecef', secondary: '#31444f', accent: '#df6c39' },
  survey: { name: '水文测量', code: 'S-02', description: '单尖船首 / 定位桅杆 / 水文探测支架', length: 2.4, width: 0.92, depth: 0.29, deck: 0.23, primary: '#e3ebee', secondary: '#2b414e', accent: '#267ca0' },
  utility: { name: '综合作业', code: 'S-03', description: '单尖船首 / 开放作业甲板 / 防护围栏', length: 3.2, width: 1.08, depth: 0.34, deck: 0.28, primary: '#e1e7e8', secondary: '#36444a', accent: '#df6c39' },
  rescue: { name: '水上救援', code: 'S-04', description: '单尖船首 / 双救生圈 / 船尾回收滑道', length: 2.2, width: 0.88, depth: 0.26, deck: 0.21, primary: '#eee7df', secondary: '#3c484c', accent: '#e26732' },
  sampling: { name: '环境采样', code: 'S-05', description: '单尖船首 / 六瓶采样盘 / 吊架与采样探头', length: 2.8, width: 1.02, depth: 0.31, deck: 0.25, primary: '#e0ece7', secondary: '#324a47', accent: '#399582' },
  endurance: { name: '长航时观测', code: 'S-06', description: '单尖船首 / 双太阳能板 / 气象观测桅杆', length: 3.6, width: 1.12, depth: 0.33, deck: 0.27, primary: '#e2e8ed', secondary: '#2c4054', accent: '#3c7fa7' },
  multibeam: { name: '多波束测深', code: 'S-07', description: '侧挂换能器阵列 / 船尾 A 架 / 双定位天线', length: 3.8, width: 1.2, depth: 0.36, deck: 0.29, primary: '#e0e8eb', secondary: '#304652', accent: '#337c9b' },
  relay: { name: '通信中继', code: 'S-08', description: '球形天线罩 / 双面板天线 / 通信机柜', length: 3.0, width: 1.02, depth: 0.30, deck: 0.25, primary: '#e6e8ee', secondary: '#394255', accent: '#6b7dab' },
  debris: { name: '水面清理', code: 'S-09', description: '侧置回收输送带 / 网格收集筐 / 作业警示灯', length: 3.4, width: 1.22, depth: 0.35, deck: 0.28, primary: '#e2ebe4', secondary: '#35483d', accent: '#57966d' },
  patrol: { name: '水域巡逻', code: 'S-10', description: '高位光电云台 / 横向雷达 / 周向护舷', length: 4.2, width: 1.18, depth: 0.37, deck: 0.30, primary: '#e7eced', secondary: '#2f414e', accent: '#397aa4' },
} as const;
