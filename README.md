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

## 🚢 一键部署到 Vercel

本项目是标准 Next.js 应用,可直接部署到 [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jassbin/gesture-cube)

手动方式:

1. 登录 Vercel → **Add New… → Project** → 导入 `jassbin/gesture-cube` 仓库。
2. Framework 会自动识别为 **Next.js**,构建命令 `next build`、输出目录默认即可,无需额外配置。
3. 点击 **Deploy**,几十秒后即可获得一个 `https://<项目名>.vercel.app` 的正式地址。

> 💡 摄像头手势依赖 HTTPS —— Vercel 默认提供 HTTPS,因此部署后手势功能可直接使用。
> 若使用了 Eazo 平台相关能力,可在 Vercel 项目的 **Settings → Environment Variables** 里补充对应环境变量(见 `.env.example`)。

---

## 🔮 未来优化空间:做成原生 App,引入「深度」操控

### 现状与瓶颈
当前是 **Web 版**,通过普通 RGB 摄像头 + MediaPipe 得到手部 21 个关键点的 **2D 屏幕坐标 (x, y)**。这带来一个本质限制:**没有真实深度信息 (z)**。因此:

- 只能按屏幕平面判断手指位置,**选中的永远是「最靠前的那一面」**,无法区分魔方的前层 / 中层 / 后层;
- 「捏合」只是二维的两指靠近,不是真正的空间抓取;
- 整体旋转只能映射到屏幕平移,缺少绕任意空间轴的自然翻转。

之前尝试过用「手变大 / 变小」来伪造深度分层,但 2D 推断的 z 抖动大、不可靠,最终为了稳定放弃了,退回成纯 2D 的「触屏模拟器」。

### 做成原生 App 后能解锁什么
原生 App(iOS / Android)可以调用设备的**深度传感能力**,直接拿到每个手部关键点的**真实三维坐标 (x, y, z)**:

- **iOS**:ARKit + 前置 TrueDepth / 后置 LiDAR,或 Vision 手部姿态 + 深度图;
- **Android**:ARCore Depth API + ToF 传感器,或 MediaPipe 的 3D 世界坐标。

有了可靠的 z,交互就能从「2D 触屏模拟」升级为真正的**空间手势**:

| 能力 | 2D Web(现在) | 带深度的原生 App(未来) |
| --- | --- | --- |
| 选面 | 只能选最靠前的外层面 | 手伸得越深 → 选中越里层,**前 / 中 / 后层可分** |
| 捏合 | 两指屏幕距离靠近 | 真实空间中拇指-食指指尖三维距离,**抓取更精准** |
| 拧动 | 屏幕平面角度 | 绕手在空间中的真实朝向轴旋转,**贴合真实手腕动作** |
| 整体旋转 | 手平移 → 绕屏幕轴 | 手在空间中六自由度移动 → **绕任意空间轴自然翻滚** |
| 视觉反馈 | 半透明手影(2D 轮廓) | 手与魔方**正确遮挡**,手指插入方块间隙有**纵深感** |

### 落地路线(建议)
1. **架构复用**:核心魔方逻辑(`src/lib/cube/scene.ts` 的求解、状态、旋转)与平台无关,可原样保留;只替换**输入层**(`use-hands.ts`)——把"2D 关键点"换成"带 z 的三维关键点"。
2. **深度选层**:用指尖 z 与魔方各层的世界坐标做**最近层匹配**,替代现在「只选最前面」的逻辑,实现真正的分层拾取。
3. **空间捏合与旋转**:用三维指尖向量计算捏合强度与旋转轴,让「转多少 = 面转多少」在空间中成立。
4. **封装形式**:可用 **React Native / Expo + 原生 AR 模块**,或 **Capacitor** 包壳 + 原生深度插件,尽量复用现有 React + three.js 渲染。
5. **渐进增强**:检测到设备支持深度则启用深度模式,不支持则自动回退到当前 2D 手势模式,保证兼容性。

> 一句话:**Web 版验证了手势玩法,原生 App + 深度传感器能把它从「隔空触屏」升级为真正的「隔空抓握并旋转一个立体魔方」。**

---

## 📄 许可

本项目基于 [MIT License](./LICENSE) 开源。
