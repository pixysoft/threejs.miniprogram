# three-ui — threejs.miniprogram 2D UI 架构设计

> 状态：设计定稿，M1–M5 已实现（见 [three-ui-devlog.md](./three-ui-devlog.md)）
> 目标：为 threejs.miniprogram 补齐 3D 场景内的 2D UI 层。架构对标 Cocos Creator（Canvas/UITransform/Widget/ScrollView 体系），实现细节参考 pixi-miniprogram framework（同小程序环境的已验证做法）。仅面向移动端手机屏幕，竖屏/横屏均需支持。

## 目录

1. [背景与目标](#1-背景与目标)
2. [参考取舍：Cocos 为主，pixi 为辅](#2-参考取舍)
3. [总体架构](#3-总体架构)
4. [坐标系与屏幕适配（竖屏/横屏）](#4-坐标系与屏幕适配)
5. [节点与渲染](#5-节点与渲染)
6. [事件系统](#6-事件系统)
7. [布局系统](#7-布局系统)
8. [控件清单](#8-控件清单)
9. [主题与皮肤](#9-主题与皮肤)
10. [3D/UI 混合](#10-3dui-混合)
11. [动效](#11-动效)
12. [目录结构与模块 API](#12-目录结构与模块-api)
13. [开发里程碑](#13-开发里程碑)
14. [测试策略](#14-测试策略)
15. [明确不做（防过度设计）](#15-明确不做)

---

## 1. 背景与目标

### 现状

threejs.miniprogram = Three.js r110 + miniapp-adapter，已解决「3D 在小程序里跑起来」：渲染、Loader、Controls、触摸桥接（`THREE.global.touchEventHandlerFactory`）、能力探测。但 **UI 层完全空白**：无面板/按钮/列表/滚动/布局/文本，CSS2DRenderer 依赖 DOM 在小程序不可用。

### 目标

在 Three.js 之上新建独立 UI 模块 `ui/`（three-ui），提供游戏级 2D UI 能力：

- 全部渲染在同一个 WebGL Canvas 内（正交相机 overlay），不依赖 WXML 叠层
- 完整控件集：Panel / Label / Button / ProgressBar / Slider / Toggle / ScrollView / List（虚拟化）/ PageView / TabBar / Modal / Toast
- 移动端专用：竖屏/横屏自动适配、安全区、设计分辨率
- 3D 混合：世界坐标 → UI 坐标跟踪（血条、名字牌）
- 不修改 Three.js 核心源码，不改 three.weapp.js 构建产物；纯增量模块，运行时注入 THREE

### 非目标

不做 UI 编辑器、不做 EditBox 输入框（第一版用 wx 原生接口由业务层处理）、不做富文本排版引擎。

## 2. 参考取舍

pixi-miniprogram 的 framework 本身就标注「移植 cocos/egret」——它是 Cocos 思路在 2D 小程序的二次实现。因此**架构与 API 对标 Cocos，实现手感与小程序细节对照 pixi**。

| 能力 | 主参考（Cocos） | 辅参考（pixi-miniprogram） | three-ui 落点 |
|------|----------------|---------------------------|---------------|
| UI 根节点 / 分层渲染 | `Canvas` / `RenderRoot2D`，相机 priority | createGame 的 stage 顶层 | `UIRoot`：独立 Scene + 正交相机，autoClear=false 二次渲染 |
| 尺寸/锚点/命中 | `UITransform.hitTest` | hitArea 矩形 | `UINode` 内置 transform（w/h/anchor）+ 屏幕空间 AABB 命中 |
| 屏幕适配 | `View` 设计分辨率 + `Widget` 锚点 | designWidth=750 比例换算 | `View`（适配策略）+ `Widget`（贴边/拉伸） |
| 事件分发 | `PointerEventDispatcher` capture/bubble | `dispatchTouch` + 坐标比例 | `UIEventSystem`：命中→冒泡，UI 消费则不透给 3D |
| 按压判定 | Button 状态机 | `Widget.makePressable` 14px 位移取消 | `makePressable`（同协议） |
| 滚动 | `ScrollView` + `ViewGroup` capture 拦截 | ScrollView 惯性/回弹/磁吸参数（源自 cocos） | `ScrollView`：pixi 参数集 + cancelPress 协议 |
| 虚拟列表 | 无内置（需自研） | `List`（EUI DataGroup 复用池） | `List`：等高 item + 复用池 |
| 布局容器 | `Layout` H/V/Grid | 无 | `Layout`：H/V/Grid 三模式 |
| 裁剪 | `Mask` + StencilManager | Graphics mask | 材质 `clippingPlanes`（4 平面轴对齐矩形，WebGL1 单 pass 可用） |
| 皮肤 | 编辑器资源 | `Theme` JSON 换皮 + 程序化纹理回退 | `Theme`：JSON 键控 + TextureFactory 回退 |
| 3D→UI | `UICoordinateTracker` | 无 | `UICoordinateTracker`：`Vector3.project()` |
| 动效 | tween 系统 | `actions`（moveTo/fadeTo/easing） | 轻量 `tween`：move/scale/fade + easing |

## 3. 总体架构

```
业务代码（小程序页面 / 游戏逻辑）
        │  createUI(THREE, { renderer, canvas, design })
        ▼
┌─────────────────────────────────────────────┐
│ three-ui（ui/ 目录，CommonJS，零构建依赖）      │
│                                             │
│  widgets/  Button ScrollView List Modal …   │  ← 控件层
│  core/     Widget(锚点) Layout Theme tween  │  ← 布局/皮肤/动效
│  core/     UIEventSystem（命中/冒泡/拦截）    │  ← 交互层
│  render/   UISprite UILabel Mask TexFactory │  ← 渲染元件层
│  core/     UIRoot UINode View               │  ← 根/节点/适配层
└──────────────┬──────────────────────────────┘
               │ 只依赖 THREE 公开 API（注入，不 import）
               ▼
THREE (three.weapp.js)  +  miniapp-adapter（touch/canvas/RAF）
```

### 渲染流程（每帧）

```js
renderer.autoClear = true;
renderer.render(scene3d, camera3d);   // 3D 场景
renderer.autoClearColor = false;      // 保留颜色，清除深度由 UIRoot 处理
uiRoot.update(dt);                    // tween / ScrollView 惯性 / 脏布局
renderer.render(uiRoot.scene, uiRoot.camera);  // UI overlay（对标 Cocos OVERLAY 模式）
```

### 关键决策

1. **依赖注入而非 import**：所有模块经 `createUI(THREE, opts)` 拿到 THREE 引用，避免与 three.weapp.js 的 UMD 包装耦合，也便于 Node 冒烟测试。
2. **CommonJS + ES5 风格**：与小程序运行时、现有 `test/weapp-smoke.js` 一致，无需额外构建步骤，`ui/` 目录直接拷入小程序分包即可用。
3. **UI 材质统一 `depthTest=false, transparent=true`**，层级由 `renderOrder`（树 DFS 序）决定，不依赖 z 值——对标 Cocos Batcher2D 按树序出图。
4. **文本/程序化纹理需要 2D canvas**：由业务注入 `createCanvas2D()`（小程序传 `wx.createOffscreenCanvas({type:'2d'})`，Node 测试传 stub），UI 层不直接触碰 wx API。

## 4. 坐标系与屏幕适配

### 坐标系

UI 使用 **左上原点、y 向下** 的屏幕坐标（web/pixi 习惯，避免 Cocos 中心原点带来的换算负担），由正交相机直接实现：

```js
new THREE.OrthographicCamera(0, viewW, 0, -viewH, -1000, 1000)
// node.position 内部 y 取负映射，业务侧永远只见 y 向下的 UI 单位
```

### 设计分辨率与适配策略（对标 Cocos View）

- 设计分辨率默认 `750 × 1334`（竖屏基准，微信惯例）
- 策略取 Cocos 最常用的两种，按屏幕方向自动切换：
  - **竖屏**：`fitWidth` — UI 宽恒等于 750，高度 = 750 × screenH/screenW（可长可短）
  - **横屏**：`fitHeight` — UI 高恒等于 750，宽度按比例伸展
- `view.width / view.height` 即当前 UI 可用尺寸，全体 Widget 以此为对齐边界

### 横竖屏切换

监听 adapter 的 `document` `resize` 事件（`wx.onWindowResize` 已桥接）：

```
resize → view.refresh()（重算 UI 视口）→ camera 更新投影
       → uiRoot 触发 'resize' → 所有 Widget 重新对齐 → Layout 重排
```

业务不需要写两套 UI：贴边元素用 Widget 声明（`{ right: 20, bottom: 20 }`），居中元素用 `centerX/centerY`，切换方向时自动重排。

### 安全区

`view.safeArea` 由业务注入（`wx.getSystemInfoSync().safeArea` 换算为 UI 单位）；Widget 支持 `safe: true`，对齐边界从屏幕边收缩到安全区边。

## 5. 节点与渲染

### UINode（≈ Cocos Node + UITransform 合体）

所有 UI 元素的基类，内部持有一个 `THREE.Group`：

```
UINode
  ├─ x, y            // UI 坐标（左上原点）
  ├─ width, height   // 内容尺寸
  ├─ anchorX/Y       // 锚点 0~1，默认 0（左上），决定自身定位参考点
  ├─ scale, rotation, alpha, visible
  ├─ interactive     // 是否参与命中
  ├─ addChild / removeChild / removeFromParent
  ├─ hitTest(ux, uy) // 世界 AABB 命中（含 scale，暂不含 rotation）
  └─ on/off/emit     // 'tap' 'pointerdown' 'pointermove' 'pointerup' ...
```

- alpha 级联：向下相乘（对标 Cocos UIOpacity），写入材质 opacity
- renderOrder：UIRoot 每帧对脏树做 DFS 编号，保证「后添加者在上」

### 渲染元件

| 元件 | 实现 | 说明 |
|------|------|------|
| `UISprite` | 单位 PlaneBufferGeometry + MeshBasicMaterial(map) | 支持纯色（无贴图 tint）与贴图；共享几何体 |
| `UILabel` | 2D canvas 绘字 → CanvasTexture → UISprite | 支持 size/color/bold/wrap/align/maxWidth；文本变化时重绘纹理 |
| `NineSlice` | 九宫格：9 个 UISprite 复用同一贴图 UV 切片 | M4 提供；之前用程序化圆角回退 |
| `TextureFactory` | 2D canvas 程序化生成：圆角矩形、圆、圆环 | 无美术图集时 UI 也能完整渲染（pixi 验证过的思路），带缓存 |

### 裁剪（ScrollView 用）

采用 **材质 clippingPlanes**（Three r110 / WebGL1 单 pass 支持）：裁剪区为轴对齐矩形 → 4 个世界空间平面，赋给子树内所有材质。`renderer.localClippingEnabled = true` 由 UIRoot 统一开启。不做 stencil（过度设计）。

## 6. 事件系统

### 接入链路

```
WXML bindtouch* → THREE.global.touchEventHandlerFactory('canvas', type)（现有 adapter）
                → canvas dispatchEvent(TouchEvent)
                → UIEventSystem.handleTouch(event)
                → 屏幕 px × (view.width / canvas.width) 换算为 UI 坐标
```

`handleTouch` 返回 **是否被 UI 消费**；未消费时业务可将事件继续交给 OrbitControls 等 3D 控制器——对标 Cocos「UI 优先级高于场景」的分发次序。

### 命中与冒泡

- 命中：对 UIRoot 子树做 **逆 DFS**（后渲染者优先），条件 `visible && interactive && hitTest()`
- 冒泡：命中节点向上逐级 emit（`pointerdown/move/up`、`tap`），任何一级 `stopPropagation()` 截断
- 防穿透：`node.blockInput = true`（对标 Cocos BlockInputEvents）——命中即消费，即使自身无监听（Modal 遮罩用）

### 按压协议（对标 pixi Widget.makePressable，源自 Cocos 判定）

```
pointerdown → 'down' 态
移动超过 moveCancelPx(14) → cancelPress()（还原 'up'，不触发 tap）
pointerup 且仍 'down' → onTap
```

`cancelPress()` 暴露为公开方法：ScrollView 检测到滚动位移超阈值（10px）时调用子控件的 cancelPress 并接管手势——这是「列表里的按钮」能同时可点可滚的关键协议。

## 7. 布局系统

两个正交的机制，均对标 Cocos：

### Widget（锚点对齐，屏幕适配核心）

声明式贴边/居中/拉伸，绑定到某个边界（默认 view，可指定父节点）：

```js
ui.widget(node, { right: 20, bottom: 20, safe: true });   // 右下角，避开安全区
ui.widget(node, { centerX: 0, top: 40 });                 // 顶部居中
ui.widget(node, { left: 0, right: 0, top: 0 });           // 横向拉伸（改 width）
```

优先级 `centerX > left > right`（Egret BasicLayout 规则，pixi 已验证）；`left+right` 同时给出且无固定宽 → 拉伸。resize 时全体 Widget 自动重算——这就是横竖屏一套 UI 的机制。

### Layout（容器内子节点排列）

`Layout.apply(container, { mode, gap, cols, padding })`，mode = `horizontal | vertical | grid`。子节点增删或尺寸变化后调用 `refresh()` 重排（不做自动脏检测，保持简单）。

## 8. 控件清单

| 级别 | 控件 | 行为规格（验收口径） |
|------|------|---------------------|
| P0 | `Panel` | 圆角底 + 容器；Theme 键 `Panel` |
| P0 | `Label` | 文本；set text/color 重绘 |
| P0 | `Button` | 三态 up/down/disabled；位移取消；`setLabel/setEnabled`；Theme 键 `Button`；down 态无皮肤时缩放 0.95 回退（Cocos zoomScale 思路） |
| P0 | `ProgressBar` | `setRatio(0~1)` + 可选文本；Theme 键 `ProgressBar` |
| P1 | `ScrollView` | 垂直/水平；惯性（速度加权采样）、越界阻尼 0.5、300ms 回弹、snapInterval 磁吸；子控件 cancelPress 拦截 |
| P1 | `List` | 等高虚拟化：实例数 = 可视区 + 2，复用池滚万条数据 |
| P1 | `PageView` | 水平 ScrollView + 页宽磁吸 + onSnap(index) |
| P2 | `Toggle` | 开关两态 + onChange |
| P2 | `Slider` | 拖拽取值 min/max/step |
| P2 | `TabBar` | 选中态切换不重建 |
| P2 | `Modal` | 全屏遮罩（blockInput）+ 居中面板 + 标题/关闭 |
| P2 | `Toast` | 顶部浮层队列，自动淡出，不挡触摸 |

## 9. 主题与皮肤

对标 pixi Theme（本质是 Cocos 皮肤思想的 JSON 化）：

```js
theme.set({
  Button:      { bg: { color: 0x3B72B0, radius: 0.28 }, label: { color: 0xFFFFFF } },
  Panel:       { bg: { color: 0x14171F, alpha: 0.96, radius: 12 } },
  ProgressBar: { fill: { color: 0x5CB85C } },
});
```

- 控件按「组件名键」取皮肤，`theme.resolve(name, override)` 支持实例级覆盖
- 第一版皮肤全部走 **TextureFactory 程序化纹理**（圆角矩形等）；图集九宫格帧留到 M4——保证任何阶段 UI 都能渲染（pixi 的关键经验）
- `theme.set()` 触发已存在控件重绘（订阅制）

## 10. 3D/UI 混合

### 分层渲染

见第 3 章渲染流程：UI 是第二个 render pass，等价 Cocos Canvas 的 OVERLAY 模式。3D 与 UI 各自独立 Scene/Camera，互不污染。

### UICoordinateTracker（血条/名字牌）

```js
const tracker = ui.tracker(object3d, camera3d, healthBarNode, { offsetY: -40 });
// 每帧: object3d 世界坐标 → project(camera3d) → NDC → UI 坐标 → healthBarNode.x/y
// 物体在相机背面时自动隐藏节点
```

由 UIRoot.update 统一驱动，业务只管创建/销毁。

## 11. 动效

轻量 tween（对标 pixi actions 的裁剪版，够用即可）：

```js
ui.tween(node).to({ x: 100, alpha: 0 }, 300, 'quadOut').then(cb);
ui.tween(node).delay(200).to({ scale: 1.2 }, 150).to({ scale: 1 }, 150);
```

- 属性集：x/y/scale/rotation/alpha/width/height
- easing：linear / quadIn / quadOut / quadInOut / quintOut / backOut（ScrollView 回弹与磁吸共用 quintOut）
- 链式序列 + delay + onComplete；由 UIRoot.update(dt) 驱动；节点销毁自动停止

## 12. 目录结构与模块 API

```
ui/                        # 零构建，CommonJS，直接拷入小程序分包
  index.js                 # createUI(THREE, opts) 入口，装配一切
  core/
    UIRoot.js              # scene + ortho camera + update 循环 + renderOrder
    UINode.js              # 节点基类：transform / 树 / 事件 / hitTest
    View.js                # 设计分辨率 / 横竖屏 / 安全区
    UIEventSystem.js       # 触摸接入 / 命中 / 冒泡 / makePressable
    Widget.js              # 锚点对齐
    Layout.js              # H/V/Grid 容器排列
    Theme.js               # 皮肤
    tween.js               # 动效
  render/
    TextureFactory.js      # 程序化纹理 + 缓存（依赖注入的 2D canvas）
    UISprite.js            # 四边形元件（纯色/贴图）
    UILabel.js             # 文本元件
    NineSlice.js           # 九宫格（M4）
    Mask.js                # clippingPlanes 矩形裁剪
  widgets/
    Panel.js Button.js ProgressBar.js
    ScrollView.js List.js PageView.js
    Toggle.js Slider.js TabBar.js Modal.js Toast.js
  misc/
    UICoordinateTracker.js
```

### 初始化范例（小程序页面）

```js
const THREE = require('../../libs/three.weapp.js');
const { createUI } = require('../../libs/ui/index.js');

const ui = createUI(THREE, {
  canvas, renderer,
  designWidth: 750,
  createCanvas2D: () => wx.createOffscreenCanvas({ type: '2d', width: 512, height: 512 }),
  safeArea: wx.getSystemInfoSync().safeArea,
});

// 帧循环
renderer.render(scene, camera);
ui.render(dt);           // update + 第二 pass

// 触摸（页面 bindtouchstart 等）
onTouch(e) { const consumed = ui.dispatchTouch(e); if (!consumed) controls.handle(e); }
```

`ui` 上暴露：`root view theme label button panel progressBar scrollView list pageView toggle slider tabBar modal toast widget layout tween tracker dispatchTouch render`。

## 13. 开发里程碑

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| **M1 核心** | UIRoot / View / UINode / UIEventSystem / TextureFactory / UISprite / UILabel | 节点树渲染、tap 命中、横竖屏 resize 重算 |
| **M2 布局与基础控件** | Widget / Layout / Theme / Panel / Button / ProgressBar | Button 三态+位移取消；Widget 各锚点组合；主题换皮 |
| **M3 容器** | Mask / ScrollView / List / PageView | 惯性+回弹+磁吸；子控件拦截；List 实例数恒定 |
| **M4 扩展** | Toggle / Slider / TabBar / Modal / Toast / tween / NineSlice / UICoordinateTracker | Modal 防穿透；tween 链；tracker 投影正确 |
| **M5 测试收口** | test/ui-smoke.js 全绿 + 文档 devlog | 覆盖各里程碑验收点 |

每个里程碑独立可用、独立提交，后一个只依赖前一个的公开 API。

## 14. 测试策略

沿用仓库既有模式（`test/weapp-smoke.js`）：**Node + wx stub + require build/three.weapp.js** 跑纯逻辑冒烟：

- 2D canvas 用极小 stub（measureText 按字数估宽、getContext 返回记录式对象）
- 不验证像素，验证：节点树/命中/事件冒泡/按压取消/Widget 数学/Layout 数学/ScrollView 状态机（手动喂 pointer 序列 + update(dt) 步进）/List 复用池实例数/tween 数值/tracker 投影
- pixi-miniprogram `test/framework.test.js` 的用例设计作为对照清单

## 15. 明确不做

- UI 可视化编辑器、prefab 序列化
- Flex/约束布局树（Widget + Layout 已覆盖移动端游戏 UI 需求）
- Stencil 遮罩 / 任意形状裁剪（clippingPlanes 矩形够用）
- 文本输入框 EditBox（业务用 wx.showKeyboard 或 WXML 叠层）
- 合批器 / DynamicAtlas（列为后期优化，第一版靠共享几何 + 纹理缓存控制开销）
- 鼠标/键盘事件（纯移动端触摸）
