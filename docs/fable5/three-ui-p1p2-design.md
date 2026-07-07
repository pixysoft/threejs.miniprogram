# three-ui P1/P2 — 体验对齐与性能 架构设计

> 状态：设计定稿，N1–N5 已实现（见 [three-ui-p1p2-devlog.md](./three-ui-p1p2-devlog.md)）
> 前置：[three-ui-design.md](./three-ui-design.md)（M1–M5 已交付），本文是其增量篇。
> 范围：**只做 P1（体验对齐 Cocos/pixi）与 P2（性能）两组共 8 项**，其余不做。
> 平台：仅移动端手机屏幕，竖屏/横屏均需支持（沿用 View/Widget 适配机制）。

## 目录

1. [范围与原则](#1-范围与原则)
2. [P1-1 RichLabel 分段富文本](#2-p1-1-richlabel)
3. [P1-2 EditBox 输入框](#3-p1-2-editbox)
4. [P1-3 Atlas 图集与 Theme 帧皮肤](#4-p1-3-atlas-与-theme-帧皮肤)
5. [P1-4 ScrollBar 滚动指示条](#5-p1-4-scrollbar)
6. [P1-5 Modal/Toast 横竖屏重排](#6-p1-5-modaltoast-横竖屏重排)
7. [P2-1 UIBatcher 同纹理合批](#7-p2-1-uibatcher-合批)
8. [P2-2 CharAtlas 文本图集](#8-p2-2-charatlas-文本图集)
9. [P2-3 UI 缓存与跳 pass](#9-p2-3-ui-缓存与跳-pass)
10. [目录结构与 API 增量](#10-目录结构与-api-增量)
11. [开发节奏（里程碑）](#11-开发节奏)
12. [测试策略](#12-测试策略)
13. [明确不做](#13-明确不做)

---

## 1. 范围与原则

### 范围（8 项，闭集）

| 组 | 项 | 主参考 | 落点 |
|----|----|--------|------|
| P1 | RichLabel 分段着色富文本 | pixi `widgets.richLabel` | `ui/render/RichLabel.js` |
| P1 | EditBox 输入框 | Cocos minigame `Editbox.js` | `ui/widgets/EditBox.js` |
| P1 | Atlas 图集 + Theme 帧皮肤 | pixi `AssetManager` + Cocos SpriteFrame | `ui/render/Atlas.js` + Theme/widgets 改造 |
| P1 | ScrollBar 指示条 | Cocos `scroll-bar.ts` 简化 | `ui/widgets/ScrollBar.js` |
| P1 | Modal/Toast 横竖屏重排 | Cocos Widget 常驻对齐 | Modal/Toast 改挂 Widget |
| P2 | UIBatcher 同纹理合批 | Cocos Batcher2D / pixi BatchRenderer | `ui/render/UIBatcher.js` |
| P2 | CharAtlas 文本图集 | Cocos DynamicAtlas（预烘焙裁剪版） | `ui/render/CharAtlas.js` |
| P2 | UI 缓存跳 pass | 通用 RTT 缓存 | UIRoot 增量 |

### 原则（沿用主设计文档，重申三条）

1. **零破坏增量**：不改 three.weapp.js；已有 `ui/` 公开 API 不变，全部新能力为可选项（不传参数则行为与 M5 一致）。
2. **依赖注入**：新增的 wx 能力（键盘、图片加载）与 2D canvas 一样经 `createUI` 注入，`ui/` 不直接 require wx。
3. **回退链**：一切皮肤/字体能力遵循 pixi 验证过的「图集帧 → 程序化纹理」「CharAtlas → 整段 canvas 绘字」回退，任何资源缺失 UI 仍可渲染。

## 2. P1-1 RichLabel

分段着色富文本，**直接移植 pixi `widgets.richLabel`**：不做 HTML/BBCode 解析引擎，输入就是分段数组。

### API

```js
const rich = ui.richLabel([
  { text: '获得 ' },
  { text: '×100 金币', color: 0xFFD24D, bold: true },
  { text: '，点击领取', size: 22 },
], { size: 26, wrapWidth: 400, lineGap: 6 });
rich.setSegments(segs);      // 整体重建
```

### 实现（`ui/render/RichLabel.js`）

- 继承 `UINode`，内部每段一个 `UILabel`，贪心换行：`wrapWidth` 给定且当前行放不下整段时换行（**段内不拆字**，与 pixi 行为一致；要精细断行的业务自己拆段）。
- 每段样式 = `{ size, color, bold }` 覆盖 opts 默认值，默认值再回退 Theme `Label` 键。
- 排版完成后 `setSize(maxLineWidth, totalHeight)`，因此可直接交给 Widget/Layout 摆放。
- `setSegments` 全量销毁重建子 Label——富文本变更频率低，不值得做 diff。

### 验收

- 三段两色一换行的用例，行数、总宽高、每段坐标可断言；空段数组不崩溃。

## 3. P1-2 EditBox

对标 Cocos minigame EditBox 的 wx 键盘分流方案（`platforms/minigame/common/engine/Editbox.js`）：**WebGL 内只画「显示框」，输入本体交给 `wx.showKeyboard` 原生键盘**。

### 键盘注入

`createUI` 新增可选项 `keyboard`，接口与 wx 同形，小程序侧一行接入；Node/浏览器传 stub：

```js
createUI(THREE, {
  keyboard: {           // 全部可选; 缺省时 EditBox 退化为只读显示框
    show(opts) {},      // { defaultValue, maxLength, multiple, confirmType }
    hide() {},
    onInput(fn) {}, offInput(fn) {},
    onConfirm(fn) {}, offConfirm(fn) {},
    onComplete(fn) {}, offComplete(fn) {},
  },
});
// 小程序: show → wx.showKeyboard, onInput → wx.onKeyboardInput ...
```

### 组件（`ui/widgets/EditBox.js`）

```js
const input = ui.editBox({
  w: 400, h: 72, placeholder: '请输入昵称',
  maxLength: 20, confirmType: 'done',
  onChange(text) {}, onConfirm(text) {}, onBlur(text) {},
});
input.getText() / setText(v) / focus() / blur()
```

- 结构 = 背景（Theme `EditBox` 键，走 makeBg 回退链）+ 文本 Label + placeholder Label（互斥显示）。
- 状态机取 Cocos 协议的裁剪版：
  - `tap → focus()`：调 `keyboard.show({ defaultValue: 当前文本, ... })`，注册 input/confirm/complete 回调，进入 editing 态（背景切 `focus` 皮肤）；
  - `onInput → setText + onChange`；`onConfirm → onConfirm + 结束`；`onComplete → onBlur + 注销回调`；
  - **单实例约束**（Cocos `_currentEditBoxImpl`）：模块级记录当前 editing 实例，新实例 focus 时先 `blur()` 旧实例。
- 超宽文本显示尾部截断（`…` 前缀留最近输入），密码模式 `password: true` 显示 `•`。
- 不做：多行 textarea 光标绘制、键盘顶起页面（wx 原生键盘自带）、DOM 隐藏 input。

### 验收

- stub keyboard 下：focus 触发 show 参数正确；input/confirm/complete 序列驱动文本与回调；双实例互斥。

## 4. P1-3 Atlas 与 Theme 帧皮肤

把 pixi `AssetManager` 的图集层移植到 three-ui，并打通 Theme 的 `frame` 键——这是「程序化纹理 → 美术皮肤」的升级通道。

### Atlas（`ui/render/Atlas.js`）

```js
ui.atlas.addAtlas('ui', texturePackerJson, texture);   // TexturePacker JSON Hash
ui.atlas.addSheet('ui', texture, { 'btn_up': { x, y, w, h, slice: [l,t,r,b] } });
ui.atlas.frame('btn_up')   // → { texture, x, y, w, h, slice } | null
ui.atlas.has('btn_up')     // 帧可用性
```

- **纹理如何进来**：three-ui 不管加载。业务用 `THREE.TextureLoader`（小程序已验证）拿到 `THREE.Texture` 后连同 JSON 一起注册。Atlas 只做帧索引，不做网络/文件 IO——比 pixi AssetManager 更薄，符合注入原则。
- 帧名全局索引 + 重名告警，与 pixi 相同；`slice` 元数据来自 TexturePacker 的自定义字段或 addSheet 手写。

### 帧的渲染：UV 子矩形

Three 侧不复制纹理，帧 = 共享 texture + UV 偏移：

- `UISprite.setFrame(frame)`：克隆共享几何为实例几何一次，写入帧的 UV 矩形（v 轴翻转换算）。
- `NineSlice` 增加 `frame` 入参：UV 网格基于帧子矩形计算，insets 单位仍为贴图像素。

### Theme `frame` 键与 makeBg 回退链

对齐 pixi `makeBg`，抽出公共函数 `ui/render/skin.js: makeBg(ctx, cfg, w, h)`：

```
cfg.frame 且 atlas.has(frame)
  ├─ 帧带 slice → NineSlice(frame)
  └─ 无 slice   → UISprite.setFrame(帧拉伸)
否则 → UISprite + TextureFactory.roundRect(程序化)      ← 现状行为
```

Button/Panel/Modal/ProgressBar/EditBox 的皮肤解析统一改走 `makeBg`。Theme 示例：

```js
theme.set({
  Button: {
    bg:     { frame: 'btn_up', slice: [12,12,12,12] },
    bgDown: { frame: 'btn_down' },
    // frame 缺失时自动落回 color/radius 程序化皮肤
  },
});
```

### 验收

- 帧索引/重名/UV 换算数学可断言；Button 配帧皮肤三态切换用帧、去掉帧后回退程序化；NineSlice 用帧子矩形 UV 正确。

## 5. P1-4 ScrollBar

Cocos `ScrollBar` 的简化版：**只做指示，不做拖拽**（移动端拖滚动条是伪需求，Cocos 自己也只在滚动时显示）。

### 行为

- `ui.scrollView({ scrollBar: true })` 即启用；ScrollView 内部创建，业务无需单独摆放。
- 条长 = `viewLen * viewLen / contentLen`（比例映射，最小 20），位置随 `scrollPos` 线性映射；越界（回弹区）时条压缩，与 iOS/Cocos 手感一致。
- 显隐：拖动/惯性/回弹期间显示；静止后延迟 `autoHideTime = 1000ms` 淡出（Cocos 默认值）。
- 皮肤：Theme `ScrollBar` 键 `{ bar: { color, alpha, radius } }`，宽 6，贴容器右缘/下缘留 2。

### 实现（`ui/widgets/ScrollBar.js`）

独立类，构造入参为宿主 ScrollView；订阅其 onScroll 不侵入状态机，每帧由宿主 `update` 末尾调 `scrollBar.sync()`。轴向自动取宿主 `direction`。

### 验收

- 长度/位置映射数学；contentLen ≤ viewLen 时不显示；静止 1s 后 alpha → 0。

## 6. P1-5 Modal/Toast 横竖屏重排

修掉 devlog 已知边界「Modal/Toast 创建时按当时 view 尺寸布死，切横竖屏错位」。

### 方案：内部改挂 Widget，不改公开 API

- **Modal**：
  - mask 挂 `widget({ left: 0, right: 0, top: 0, bottom: 0 })` 全屏拉伸；
  - panel 挂 `widget({ centerX: 0, centerY: 0 })`；title/close/body 改为 **panel 的子节点**（相对面板定位，随面板移动，不再各自算绝对坐标）——这是结构性修正，顺带消除三处重复的 `panel.x +` 偏移算式。
  - destroy 时 detach（Widget.attach 返回的 detach 函数存实例上）。
- **Toast**：bg 挂 `widget({ centerX: 0, top: view.height * 0.12 })` → 改为 `{ centerX: 0, top: 0.12 }`（Widget 已支持比例语义？——不支持 top 比例，因此 Toast 直接监听 root `resize` 重算 `(view.width-w)/2` 与 `view.height*0.12`，一行处理，不为它扩 Widget 语义）。
- Widget 本身不动；`safe: true` 由业务在皮肤/spec 里自行决定。

### 验收

- 创建 Modal → `root.onResize(横屏尺寸)` → mask 铺满新视口、panel 居中、title/close 相对面板位置不变；Toast 同理。

## 7. P2-1 UIBatcher 合批

对标 Cocos Batcher2D 的**最小实现**，采用 pixi BatchRenderer 的 CPU 路线：每帧把可合批的 quad 顶点写进共享动态缓冲，按「纹理 + 裁剪状态」分段出 draw call。UI 元素量级（几百个）下 CPU 变换开销可忽略，换来 draw call 从 O(元素数) 降到 O(纹理数)。

### 开关与范围

- `createUI(THREE, { batch: true })` 可选开启；默认关闭，关闭时零改动零开销。
- **可合批**：`UISprite`（纯色/贴图/帧）。纯色 quad 统一走一张 1×1 白纹理 + 顶点色 tint，天然同批——对标 pixi 的 white texture 方案。
- **不合批**（保持独立 mesh）：UILabel/RichLabel（各自独占 CanvasTexture，合了也不省）、NineSlice（顶点数不同，量少）、被 Mask 裁剪的子树按 clip 组分批。

### 数据流（每帧，`UIRoot.update` 末尾）

```
DFS 按 renderOrder 收集可见 UISprite
  → 按 (texture, clipPlanes 引用) 切段, 保持树序(保证遮挡关系)
  → 每段写入 BatchMesh: position(世界变换后 quad) / uv / color(tint×worldAlpha)
  → 原生 mesh 设 visible=false, BatchMesh 参与渲染
```

- 顶点缓冲预分配（512 quad 起，不够翻倍），`BufferAttribute.dynamic`，每帧只 `needsUpdate` 用到的区间（`setDrawRange`）。
- 世界变换直接复用 `worldAABB()` 的数学（平移+缩放；带 rotation 的节点退出合批走原 mesh——与 hitTest 的 AABB 限制一致，不新增矩阵体系）。
- 材质：`MeshBasicMaterial({ map: 段纹理, vertexColors: true, transparent, depthTest: false })`，按纹理缓存复用。
- 树序切段意味着「纹理交错会打断合批」——不做重排序（重排会破坏画序），交错优化交给美术合图集，与 Cocos 的建议一致。

### 验收

- N 个同纹理 sprite → 1 个 BatchMesh、1 段；两纹理交错 → 段数 = 交错次数；开关前后渲染结果（顶点数学）一致；带 rotation/Label 的节点不进批。

## 8. P2-2 CharAtlas 文本图集

Cocos DynamicAtlas 的**预烘焙裁剪版**：解决「分数/倒计时等高频变动文本每帧重绘 canvas + 重传纹理」的开销。不做动态增长图集（复杂度不成比例），做**预烘焙 + 缺字回退**。

### API

```js
ui.charAtlas.bake('0123456789+-:.%', { size: 32, color: 0xFFFFFF, bold: true });
const score = ui.label('0', { atlas: true, size: 32, color: 0xFFFFFF, bold: true });
score.setText('12500');   // 只改顶点/UV, 不触碰 canvas
```

### 实现（`ui/render/CharAtlas.js` + UILabel 改造）

- `bake(chars, style)`：一次性把字符集绘到单张 canvas（2x 密度，网格排布），记 `char → {u0,v0,u1,v1,w}`；同 style（size+color+bold）合并进同一 key。
- `UILabel` 增 `atlas: true` 模式：
  - setText 时逐字查 CharAtlas，命中 → 每字一个 quad 写进自身小几何（单 mesh 多 quad，共享 atlas 纹理）；
  - **任一字符未烘焙 → 整体回退现有 canvas 绘字路径**（行为不变，只是慢），并 console.warn 一次;
  - atlas 模式不支持 wrap/align 之外的能力差异：单行、左对齐起排，业务用于数字/时间足够。
- atlas 纹理全局单例集合，归 `ui.charAtlas` 管理，`destroy` 统一释放。
- 与 UIBatcher 天然协同：atlas 模式 Label 的 mesh 共享同一纹理，可进批（第二迭代再接，先保证独立可用）。

### 验收

- bake 后 setText 不触发 canvas fillText；宽度 = Σ字宽；缺字回退路径走通；同 style 复用同一纹理。

## 9. P2-3 UI 缓存与跳 pass

「UI 无变化时跳过第二个 render pass」不能直接跳——3D pass 每帧清屏，UI 不重画就消失。标准解法：**UI 画进 RenderTarget，脏了才重绘 RT，每帧只合成一张全屏贴图**（1 次 draw call）。

### 开关与结构

- `createUI(THREE, { cache: true })` 可选开启；默认关闭（多数场景 UI 帧帧在动，RT 反而多一次拷贝；给「静态 HUD + 重 3D」场景用）。
- UIRoot 持有：`WebGLRenderTarget`（尺寸 = drawingBuffer，resize 时重建）+ 合成用全屏 quad 场景（单 mesh + `map: rt.texture`）。

### 脏标记（关键在收敛）

`uiRoot.invalidate()` 置脏，来源收口在已有机制上，不散布到每个属性：

- `markOrderDirty()`（增删节点）时置脏；
- `UINode._syncTransform / setSize / visible / _propagateAlpha` 尾部置脏（基类 5 处，子类免改）；
- 纹理级变化（Label 重绘、setTexture/setFrame、Theme 换肤订阅）各自置脏；
- tween/ScrollView/tracker 活跃 → 它们本来就在改 transform，自动覆盖。

### 渲染流程

```js
render(renderer, dt):
  update(dt)
  if (cache 开启):
    if (dirty): renderer.setRenderTarget(rt); 清屏; render(scene, camera); 还原; dirty = false
    render(合成quad场景, 合成正交相机)     // 每帧 1 draw call
  else: 现状双 pass
```

### 验收

- 静止两帧后第二帧不触发 UI 场景渲染（stub renderer 记录调用）；任意节点动一下 → 下一帧重绘 RT；resize 后 RT 重建。

## 10. 目录结构与 API 增量

```
ui/
  render/
    RichLabel.js        # 新增 P1-1
    Atlas.js            # 新增 P1-3 帧索引
    skin.js             # 新增 P1-3 makeBg 回退链(widgets 共用)
    UIBatcher.js        # 新增 P2-1
    CharAtlas.js        # 新增 P2-2
    UISprite.js         # 改 +setFrame
    NineSlice.js        # 改 +frame 入参
    UILabel.js          # 改 +atlas 模式
  widgets/
    EditBox.js          # 新增 P1-2
    ScrollBar.js        # 新增 P1-4
    Modal.js Toast.js   # 改 挂 Widget
    ScrollView.js       # 改 +scrollBar 选项
    Button.js Panel.js ProgressBar.js   # 改 皮肤走 skin.makeBg
  core/
    UIRoot.js           # 改 P2-1 批驱动 / P2-3 RT 缓存
    UINode.js           # 改 P2-3 置脏钩子
  index.js              # 装配: atlas/charAtlas/richLabel/editBox + batch/cache 开关
```

`createUI` 新可选项：`keyboard`（P1-2）、`batch: false`（P2-1）、`cache: false`（P2-3）。
`ui` 新增导出：`richLabel(segs, opts)`、`editBox(opts)`、`atlas`、`charAtlas`。
全部向后兼容：不传新选项时行为与 M5 完全一致。

## 11. 开发节奏

顺序 = 依赖序 + 风险后置（合批/缓存动核心，放最后；每步独立可交付、ui-smoke 全绿才进下一步）：

| 迭代 | 内容 | 依赖 |
|------|------|------|
| **N1** | RichLabel + Modal/Toast 挂 Widget | 无（纯增量 + 局部重构） |
| **N2** | Atlas + skin.makeBg + UISprite.setFrame + NineSlice frame + widgets 皮肤接线 | 无 |
| **N3** | EditBox（依赖 N2 的 makeBg）+ ScrollBar | N2 |
| **N4** | UIBatcher + UIRoot 接线 | N2（帧/白纹理语义） |
| **N5** | CharAtlas + UILabel atlas 模式 + UIRoot RT 缓存/置脏 | N4（置脏与批共用遍历时机） |
| **N6** | 测试收口 + devlog | 全部 |

## 12. 测试策略

沿用 `test/ui-smoke.js`（Node + wx stub + 2D canvas stub），每迭代追加一节：

- N1：richLabel 换行/宽高/setSegments；Modal resize 后各节点位置。
- N2：Atlas 帧索引/UV 数学/回退链（有帧→帧，无帧→程序化）。
- N3：EditBox 键盘 stub 全事件序列 + 单实例互斥；ScrollBar 映射数学 + 自动隐藏。
- N4：合批分段计数/顶点数学/开关等价性（stub THREE 记录 BufferAttribute 写入）。
- N5：CharAtlas 命中不走 fillText / 缺字回退；cache 模式 stub renderer 调用计数。

showcase 追加一个演示页（图集皮肤 + richLabel + EditBox + ScrollBar + batch 开关对比），浏览器实测。

## 13. 明确不做

- HTML/BBCode 富文本解析、字内断行、行内图片
- EditBox 多行光标绘制、DOM/WXML 叠层输入
- Atlas 的网络/文件加载（业务用 TextureLoader 自装）
- 滚动条拖拽交互
- 动态增长字体图集（预烘焙 + 回退够用）
- 合批重排序（打破树序）、多材质 shader 合批
- 脏矩形局部重绘（RT 整帧缓存已覆盖目标场景）
