export const quadrotorPresets = {
  inspection: { name: '轻型巡检', code: 'Q-01', description: '紧凑机身 / 双轴云台 / X 形四旋翼', armX: 0.265, armZ: 0.245, radius: 0.175, body: [0.20, 0.105, 0.30], leg: 0.13, primary: '#e7ecef', secondary: '#28363f', accent: '#df6c39' },
  survey: { name: '专业测绘', code: 'Q-02', description: '碳纤维机臂 / 测绘载荷 / 高位定位天线', armX: 0.40, armZ: 0.36, radius: 0.24, body: [0.27, 0.12, 0.35], leg: 0.29, primary: '#e2e9ed', secondary: '#293b46', accent: '#267ca0' },
  heavy: { name: '重载作业', code: 'Q-03', description: '加强机臂 / 双电池舱 / 腹部挂载平台', armX: 0.55, armZ: 0.48, radius: 0.32, body: [0.36, 0.16, 0.44], leg: 0.38, primary: '#d4dce0', secondary: '#303c42', accent: '#df6c39' },
  protected: { name: '近距巡检', code: 'Q-04', description: '环形桨叶护罩 / 紧凑机身 / 前置云台', armX: 0.24, armZ: 0.23, radius: 0.15, body: [0.19, 0.10, 0.24], leg: 0.15, primary: '#e4ebeb', secondary: '#304649', accent: '#408f81' },
  rescue: { name: '应急照明', code: 'Q-05', description: '双探照灯 / 定向扬声器 / 高起落架', armX: 0.39, armZ: 0.35, radius: 0.23, body: [0.28, 0.13, 0.36], leg: 0.32, primary: '#ece8e1', secondary: '#38424a', accent: '#d95e32' },
  cargo: { name: '物资运输', code: 'Q-06', description: '封闭货舱 / 悬挂锁扣 / 双电池供电', armX: 0.59, armZ: 0.53, radius: 0.33, body: [0.38, 0.17, 0.46], leg: 0.52, primary: '#dde6ed', secondary: '#2d3e50', accent: '#417fae' },
} as const;
export const usvPresets = {
  inspection: { name: '轻型巡检', code: 'S-01', description: '单尖船首 / 流线设备舱 / 单推进器', length: 1.8, width: 0.64, depth: 0.22, deck: 0.18, primary: '#e7ecef', secondary: '#31444f', accent: '#df6c39' },
  survey: { name: '水文测量', code: 'S-02', description: '单尖船首 / 定位桅杆 / 水文探测支架', length: 2.4, width: 0.92, depth: 0.29, deck: 0.23, primary: '#e3ebee', secondary: '#2b414e', accent: '#267ca0' },
  utility: { name: '综合作业', code: 'S-03', description: '单尖船首 / 开放作业甲板 / 防护围栏', length: 3.2, width: 1.08, depth: 0.34, deck: 0.28, primary: '#e1e7e8', secondary: '#36444a', accent: '#df6c39' },
  rescue: { name: '水上救援', code: 'S-04', description: '单尖船首 / 双救生圈 / 船尾回收滑道', length: 2.2, width: 0.88, depth: 0.26, deck: 0.21, primary: '#eee7df', secondary: '#3c484c', accent: '#e26732' },
  sampling: { name: '环境采样', code: 'S-05', description: '单尖船首 / 六瓶采样盘 / 吊架与采样探头', length: 2.8, width: 1.02, depth: 0.31, deck: 0.25, primary: '#e0ece7', secondary: '#324a47', accent: '#399582' },
  endurance: { name: '长航时观测', code: 'S-06', description: '单尖船首 / 双太阳能板 / 气象观测桅杆', length: 3.6, width: 1.12, depth: 0.33, deck: 0.27, primary: '#e2e8ed', secondary: '#2c4054', accent: '#3c7fa7' },
} as const;
