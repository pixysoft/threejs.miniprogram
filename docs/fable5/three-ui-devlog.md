# three-ui 开发总结与后续计划

> 设计文档：[three-ui-design.md](./three-ui-design.md)
> 状态：M1–M5 全部完成，`test/ui-smoke.js` 131 项冒烟全绿；既有 `weapp-smoke` / `jsm-smoke` 回归通过。
> 追加：**PC 演示站 `showcase/` 已上线**（参照 pixi-miniprogram showcase 模式），5 个演示页在浏览器实测渲染与交互正常。

## 一、本期交付

### 交付物

| 位置 | 内容 |
|------|------|
| `ui/` | UI 模块全部源码（CommonJS，零构建，直接拷入小程序分包） |
| `test/ui-smoke.js` | 131 项冒烟测试（Node + wx stub + 2D canvas stub） |
| `docs/fable5/three-ui-design.md` | 架构设计文档 |
| `showcase/` | PC 演示站：wx-polyfill + CommonJS loader + harness，内核零修改；5 个演示页（3D 基础 / UI 基础件 / 容器 / 横竖屏 / 3D+UI 混合） |

### 按里程碑

**M1 核心层**（`ui/core/` + `ui/render/`）

- `View`：设计分辨率 750，竖屏 fitWidth / 横屏 fitHeight 自动切换，安全区换算，触摸 px→ui 换算
- `UINode`：左上原点 y 向下坐标系、anchor、alpha 级联、树管理、AABB 命中、事件 on/emit
- `UIRoot`：独立 Scene + 正交相机 overlay 二次渲染，renderOrder DFS 排序，ticker 驱动
- `UIEventSystem`：`dispatchTouch` 返回消费标记（未消费可透给 OrbitControls）、逆 DFS 命中、冒泡 + stopPropagation、`makePressable` 按压协议（14px 位移取消）
- `UISprite`（共享几何）/ `UILabel`（canvas 绘字，wrap/align）/ `TextureFactory`（程序化圆角矩形/圆/圆环 + 缓存）

**M2 布局与基础控件**

- `Widget`：锚点对齐（centerX > left > right 优先级、双边拉伸、比例尺寸、safe 安全区），订阅 resize 自动重排——横竖屏一套 UI 的机制
- `Layout`：horizontal / vertical / grid 三模式
- `Theme`：JSON 深合并换皮 + 订阅制热更，控件全部走程序化纹理（无图集也能渲染）
- `Panel` / `Button`（三态 + zoomDown 0.95 回退）/ `ProgressBar`

**M3 容器**

- `Mask`：材质 clippingPlanes 4 平面矩形裁剪（WebGL1 单 pass），子树自动继承、每帧跟随容器
- `ScrollView`：完整移植 pixi（参数源自 cocos/egret）——惯性速度加权采样、越界阻尼 0.5、300ms 回弹、snapInterval 磁吸、子控件 cancelPress 拦截
- `List`：EUI DataGroup 虚拟化，实例数恒为可视区+2，千条数据 6 个实例
- `PageView`：水平 ScrollView + 页宽磁吸

**M4 扩展**

- `Toggle` / `Slider`（拖拽按世界 x 取值 + step）/ `TabBar`（选中态不重建）
- `Modal`（遮罩 blockInput 防穿透 + 面板防误关 + 淡入淡出）/ `Toast`（队列顶替 + 自动淡出 + 不挡触摸）
- `tween`：to/delay/call 链式 + 6 种 easing，同节点顶替
- `NineSlice`：单 mesh 4x4 顶点网格九宫格，resize 只更新 position
- `UICoordinateTracker`：3D 世界坐标 → UI（血条/名字牌），相机背面自动隐藏

### 与参考项目的对应

- **对标 Cocos**：Canvas/OVERLAY 双 pass 分层、UITransform 命中、View+Widget 适配、BlockInputEvents、ScrollView 拦截协议、UICoordinateTracker
- **移植 pixi-miniprogram**：ScrollView 手感参数与状态机、List 复用池、makePressable、Theme JSON、程序化纹理回退、Toast/Modal 模式
- **不依赖 DOM/WXML**：全部渲染在 WebGL Canvas 内，事件走现有 adapter 的 touchEventHandlerFactory 链路

### 小程序接入方式

```js
const THREE = require('libs/three.weapp.js');
const { createUI } = require('libs/ui/index.js');

const ui = createUI(THREE, {
  renderer,
  createCanvas2D: () => wx.createOffscreenCanvas({ type: '2d', width: 512, height: 512 }),
  safeArea: wx.getSystemInfoSync().safeArea,
});

// 帧循环
renderer.render(scene3d, camera3d);
ui.render(dt);

// 页面触摸事件(bindtouchstart/move/end)
onTouch(e) { if (!ui.dispatchTouch(e)) controls.handle(e); }

// 横竖屏(wx.onWindowResize)
ui.onResize(res.windowWidth, res.windowHeight);
```

## 二、已知边界

- `hitTest` 为轴对齐 AABB，不含 rotation（旋转节点命中不准，UI 场景极少用）
- `UILabel` 单 canvas 单纹理，超长文本会产生大纹理；未做文本纹理图集
- Mask 仅轴对齐矩形（clippingPlanes），不支持圆角/任意形状裁剪
- 无合批：每个 UISprite 一次 draw call，复杂界面（>100 元素）需关注真机帧率
- Modal/Toast 布局在创建时按当时 view 尺寸计算，横竖屏切换后需重建（未挂 Widget）
- 真机像素验证未做（本期为逻辑冒烟），需在微信开发者工具 + 真机跑通一次渲染路径

## 三、后续开发计划

### P0 — 真机验证（下一步必做）

1. 写一个小程序示例页（3D 场景 + HUD + ScrollView 列表 + Modal），在开发者工具与 iOS/Android 真机验证：
   - 触摸链路（页面 bindtouch → dispatchTouch）
   - clippingPlanes 在真机 WebGL1 的兼容性（个别旧 GPU 可能有精度问题，备选方案：scissor 分 pass）
   - `wx.createOffscreenCanvas` 2D 文字绘制与 CanvasTexture 上传
2. 横竖屏真机切换回归（`wx.onWindowResize`）

> 浏览器侧已由 `showcase/` 验证：registerCanvas、双 pass 渲染、clippingPlanes 裁剪、
> 触摸命中/拦截、Widget 横竖屏重排、tracker 投影全部跑通（Chrome 无头实测截图确认）。
> 真机差异点集中在 wx offscreen canvas 与旧 GPU clippingPlanes 精度两项。

### P1 — 体验补齐

- Modal/Toast 挂 Widget，横竖屏切换自动重排
- Button/Toggle 支持图集帧皮肤（Theme `frame` 键 + NineSlice 接管），对齐 pixi 的「图集 → 程序化」双路皮肤
- ScrollView 滚动条指示（cocos ScrollBar 简化版）
- 富文本 `richLabel`（分段着色，参考 pixi widgets.richLabel）
- EditBox：`wx.showKeyboard` 分流方案（参考 cocos minigame Editbox）

### P2 — 性能

- UI 合批：同纹理 UISprite 合并 geometry（对标 cocos Batcher2D 的最小实现）
- 文本纹理图集 / 常用字预烘焙
- 脏矩形：UI 无变化时跳过第二个 render pass

### P3 — 生态

- 图集加载器（TexturePacker JSON → Theme 帧皮肤）
- CooldownButton、红点、货币胶囊等游戏向组件（pixi framework 已有蓝本）
- 声音反馈钩子（等 adapter Audio 适配后接入）

## 四、测试基线

```
node test/ui-smoke.js     # 131 项, ALL PASS
node test/weapp-smoke.js  # 回归通过
node test/jsm-smoke.js    # 回归通过
```

新功能合入标准：ui-smoke 保持全绿，新控件补对应用例（对照 pixi `test/framework.test.js` 的用例设计）。
