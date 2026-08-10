# 手势魔方 · Gesture Cube 🖐️🧊

用手机后置摄像头,靠**手势**在空中操控一个 3D 魔方 —— 张开手掌拖动整体旋转,两指捏合抵住某个面并停顿即可锁定,再转动手指就能 1:1 拧动这一面。

> **在线预览**:<https://3000-ilrnqbngax4td61x2tt3k.e2b.app>
> (临时沙盒地址,需允许摄像头与动作权限;沙盒关闭后失效。)

---

## ✨ 玩法

| 手势 | 效果 |
| --- | --- |
| 🖐️ **张开手掌**,手指点住魔方拖动 | 整体旋转魔方(此时显示一只半透明的手) |
| 🤏 **两指捏合**抵住某个面 | 屏幕上出现两个指尖点,选中这一面 |
| ⏸️ 捏合后**停顿一下** | **锁定**这一面 |
| 🔄 锁定后**转动两指** | 1:1 拧动这一面;松开手指,面平滑吸附到最近的合法角度 |
| ✋ **张开手指** | 解锁,换一个面 |

底部按钮:**打乱** / **重置** / **手势·触摸** 模式切换。

> ⚠️ 摄像头手势需要 HTTPS 或 `localhost` 才能启用(浏览器安全策略)。本地 `http://localhost:3000` 满足条件。

---

## 🚀 如何使用

```bash
# 1. 克隆
git clone https://github.com/jassbin/gesture-cube.git
cd gesture-cube

# 2. 安装依赖(推荐 bun,也可用 npm)
bun install          # 或 npm install

# 3. 本地开发
bun dev              # 或 npm run dev
# 打开 http://localhost:3000

# 4. 生产构建
bun run build
bun run start
```

---

## ⚙️ 原理

### 技术栈
- **框架**:Next.js 16(App Router)+ React 19 + TypeScript
- **样式**:Tailwind CSS
- **3D 渲染**:[three.js](https://threejs.org)
- **手部识别**:[MediaPipe Tasks Vision](https://developers.google.com/mediapipe)(`@mediapipe/tasks-vision`)
- **文案**:`react-i18next`(中英双语)

### 数据流
```
摄像头视频帧
   ↓  MediaPipe Hands
21 个手部关键点 (x, y)
   ↓  use-hands.ts —— 手势判定
捏合 / 手掌态 / 锁定 / 旋转角度
   ↓  cube-stage.tsx —— 事件桥接
scene.ts —— three.js 拾取 + 旋转求解
   ↓
魔方三维状态 + 逻辑状态(判定是否复原)
```

### 关键实现
- **手势判定**(`src/lib/cube/use-hands.ts`):用关键点算拇指-食指间距(捏合)、四指相对手掌的张开度(手掌态),并用**连续帧计数**做"意图确认",避免轻碰误触。
- **拾取选面**(`src/lib/cube/scene.ts`):把指尖屏幕坐标做**射线拾取**,选中最靠前、朝向镜头的那一面,保证 2D 触点优先命中正面。
- **1:1 连续旋转**:锁定后把选中层挂到一个枢轴组(pivot),指尖转多少角度、面就转多少;松手时从当前角度**缓动吸附**到最近 90°,再同步进逻辑状态。
- **半透明手影**:手掌态时在离屏画布上把手掌+五指合成为一个连通轮廓,再半透明贴回,得到一只柔和、拟人的手影。

### 目录结构
```
src/
├─ app/                   # Next.js 路由(页面外壳)
├─ components/cube/        # 交互 UI:舞台、手影、HUD、引导、结算
│  ├─ cube-stage.tsx       # 手势事件 ↔ 3D 场景 的桥接
│  ├─ hand-skeleton.tsx    # 指尖点 / 半透明手影渲染
│  └─ gesture-intro.tsx    # 首次进入的玩法 + 权限引导
├─ lib/cube/               # 核心逻辑
│  ├─ use-hands.ts         # MediaPipe 接入 + 手势判定
│  ├─ scene.ts             # three.js 魔方渲染 / 拾取 / 旋转求解
│  └─ ...                  # 魔方逻辑状态、复原判定
└─ i18n/locales/           # zh-CN / en-US 文案
```

---

## 📄 许可

仅供学习与演示使用。
