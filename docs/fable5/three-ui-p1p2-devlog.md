# three-ui P1/P2 开发总结与后期计划

> 设计文档：[three-ui-p1p2-design.md](./three-ui-p1p2-design.md)
> 前置交付：[three-ui-devlog.md](./three-ui-devlog.md)（M1–M5）
> 状态：**N1–N5 全部完成**。`test/ui-smoke.js` 212 项全绿（原 131 + 新增 81）；
> `weapp-smoke` / `jsm-smoke` 回归通过；`showcase/libs/ui` 已同步。
> 追加：showcase 新增两个演示页 `ui-p1` / `ui-p2`，Chrome 无头实测截图确认渲染与数据正常。

## 一、本期交付

### 按迭代

**N1 — RichLabel + Modal/Toast 横竖屏**

- `ui/render/RichLabel.js`：分段着色富文本（移植 pixi `widgets.richLabel`），贪心换行（段内不拆字）、段级 size/color/bold 覆盖、`setSegments` 全量重建、尺寸自动可交 Widget/Layout 摆放。
- `Modal`：mask 挂 Widget 双边拉伸、panel 挂 Widget 居中；title/close/body 改为 **panel 子节点**（相对定位），destroy 时 detach。修掉「横竖屏切换后错位」的已知边界。
- `Toast`：监听 root `resize` 重算顶部居中位置；顶替与到期两条销毁路径统一走 `dismiss()`（修复监听器泄漏）。

**N2 — Atlas 图集与 Theme 帧皮肤**

- `ui/render/Atlas.js`：帧索引（TexturePacker JSON Hash `addAtlas` / 手写切片 `addSheet`），比 pixi AssetManager 更薄——纹理由业务用 `THREE.TextureLoader` 加载后注册，Atlas 不做 IO。
- `UISprite.setFrame(frame)`：共享纹理 + UV 子矩形（首次克隆共享几何，只改 uv）。
- `NineSlice` 支持 `frame` 入参：UV 网格换算进帧子矩形，insets 缺省取帧 `slice` 元数据。
- `ui/render/skin.js`：`makeBg` 回退链（帧+slice → NineSlice；帧无 slice → 拉伸；无帧 → 程序化圆角）+ `resizeBg`（原地更新不重建）。
- Button/Panel/ProgressBar/Modal 皮肤统一接线 `makeBg`；Button 采用 pixi 方案 **三态背景预构建**，状态切换只改可见性（`bg`/`bgDown`/`bgDisabled` 皆可配 `frame`，缺帧自动回退程序化，`zoomDown` 回退保留）。

**N3 — EditBox + ScrollBar**

- `ui/widgets/EditBox.js`：对标 Cocos minigame Editbox 协议——`createUI` 注入 `keyboard` 接口（与 `wx.showKeyboard` 系同形），focus → show + 注册 input/confirm/complete，**单实例互斥**（新 focus 自动 blur 旧实例），placeholder / maxLength / 密码打点 / 超宽尾部截断 / focus 态皮肤（Theme `EditBox` 键）；未注入 keyboard 时退化为只读显示框。
- `ui/widgets/ScrollBar.js`：Cocos ScrollBar 简化版（只指示不拖拽）——条长 `view²/content`（最小 20）、位置线性映射、越界压缩、静止 1s 淡出（cocos autoHideTime）；`ui.scrollView({ scrollBar: true })` 一键启用，垂直/水平自适应，Theme `ScrollBar` 键。

**N4 — UIBatcher 同纹理合批**

- `ui/render/UIBatcher.js`：`createUI({ batch: true })` 开启。每帧 DFS 按渲染序收集可见 UISprite，按 `(纹理, 裁剪组, worldAlpha)` 切**连续段**（树序切段保证画序），每段写一个动态缓冲 BatchMesh（position/uv/顶点色），原 mesh 隐藏。纯色 sprite 统一走 1×1 白纹理 + 顶点色 tint——任意颜色同批（pixi 方案）。
- 不进批走原 mesh：带 rotation 的子树、UILabel（canvas 路径）、NineSlice、`batchable: false`。段 mesh 池化 + 容量翻倍增长 + `setDrawRange`。
- 效果：N 个纯色/同图集 sprite → 1 draw call；退批/进批可逐帧切换，关闭时零改动零开销。

**N5 — CharAtlas + RT 缓存**

- `ui/render/CharAtlas.js`：预烘焙字符图集（cocos DynamicAtlas 裁剪版）——`ui.charAtlas.bake(chars, style)` 一次绘进单 canvas（2x 密度，行排布），同 style（size+color+bold）共享纹理。
- `UILabel({ atlas: true })`：setText 逐字查表出 quad（自有几何 + 共享图集纹理），**不再重绘 canvas / 重传纹理**；任一字符缺失自动回退整段绘字（warn 一次），字符齐全后自动恢复。适合分数/倒计时等高频文本。
- UIRoot RT 缓存：`createUI({ cache: true })` 开启。UI 画进 `WebGLRenderTarget`，**脏了才重绘 RT**，每帧只合成一张全屏贴图（1 draw call）。置脏收口：`markOrderDirty`（增删节点）、`UINode` transform/visible/alpha、`UISprite.setTexture/setColor`、`UILabel._redraw`、`NineSlice.setTexture`、resize（RT 重建）。tween/ScrollView/tracker 改 transform 自然覆盖。

### API 增量（全部向后兼容）

```js
const ui = createUI(THREE, {
  ...原有参数,
  keyboard,          // EditBox 键盘接口(wx.showKeyboard 系), 可选
  batch: true,       // P2-1 合批, 默认关
  cache: true,       // P2-3 RT 缓存, 默认关(静态 HUD + 重 3D 场景用)
});

ui.richLabel(segments, { size, wrapWidth, lineGap });
ui.editBox({ w, h, placeholder, maxLength, password, onChange, onConfirm, onBlur });
ui.scrollView({ ..., scrollBar: true });
ui.atlas.addAtlas(key, tpJson, texture); ui.atlas.addSheet(key, texture, defs);
ui.charAtlas.bake('0123456789', { size: 32, color: 0xFFFFFF, bold: true });
ui.label('0', { atlas: true, size: 32, ... });   // 高频文本走字符图集

theme.set({ Button: { bg: { frame: 'btn_up' }, bgDown: { frame: 'btn_down' } } });
```

新 Theme 键：`EditBox`（bg/bgFocus/text/placeholder）、`ScrollBar`（bar）。

### 测试基线

```
node test/ui-smoke.js     # 212 项, ALL PASS(N1–N5 各迭代均有断言节)
node test/weapp-smoke.js  # 回归通过
node test/jsm-smoke.js    # 回归通过
```

覆盖点：richLabel 换行/重建、Modal/Toast resize 重排、Atlas 帧索引与 UV 数学、makeBg 三级回退、Button 帧三态、EditBox 键盘全事件序列 + 单实例互斥 + 无键盘退化、ScrollBar 映射/淡出/双轴、合批分段计数/顶点与顶点色写入/退批还原、CharAtlas 命中不触碰 canvas/缺字回退/纹理复用、cache 模式 pass 计数/置脏矩阵/resize 重建。

## 二、已知边界

- RichLabel 段内不拆字：超长单段配 `wrapWidth` 会溢出，业务需自行分段。
- EditBox 无光标/选区绘制（wx 原生键盘自带输入 UI）；多行 `multiple` 仅透传给键盘，显示框仍单行截断。
- CharAtlas 无动态增长：未烘焙字符整段回退 canvas 路径（设计取舍，回退有 warn 提示）。
- UIBatcher 树序切段：纹理交错会打断合批（不重排序，保画序），交错优化交给美术合图集。
- cache 模式下 UI 帧帧在动（tween/滚动常驻）时每帧仍重绘 RT + 合成，比直渲多一次拷贝——按设计仅推荐「静态 HUD + 重 3D」场景开启。
- batch + atlas 模式 Label 尚未互通（Label 不进批），列入后期。
- 真机验证未做：clippingPlanes 旧 GPU 精度、`wx.showKeyboard` 真机行为、RT 缓存在小程序 WebGL1 的兼容性，均需微信开发者工具 + 真机跑通。

## 三、后期开发计划

### P0 — 真机验证（下一步必做）

1. 小程序示例页：图集皮肤 Button + richLabel + EditBox（真机键盘）+ 带 ScrollBar 的列表 + `batch`/`cache` 开关对比帧率。
2. 重点验证：`wx.onKeyboardInput` 事件序列与 Editbox 协议差异、WebGLRenderTarget 在真机 WebGL1 的透明合成、合批后 clippingPlanes 分段正确性。

> 浏览器侧已由 showcase 验证（`demos/ui-p1.js` / `demos/ui-p2.js`，无头 Chrome 截图确认）：
> - ui-p1：RichLabel 分段换行、图集帧三态皮肤 + 缺帧回退、EditBox 悬浮键盘（与 wx 接口同形）互斥/密码打点、List 滚动指示条淡出；
> - ui-p2：210 方块实测 draw call — 合批关 214 次 → 合批开 5 次（合批段数 1）；缓存开 + 静止时每帧 1 次合成 draw call，RT 重绘累计停在 1；
>   支持 `?batch=1&cache=1&anim=0` URL 预置开关。
> 真机差异点集中在 wx 键盘事件序列与 RT 透明合成两项。

### P1 — 补齐与互通

- atlas 模式 UILabel 接入 UIBatcher（共享 CharAtlas 纹理天然可批，设计已预留）。
- Toggle/Slider/TabBar 皮肤接线 `makeBg`（目前仍程序化直连，帧皮肤只差接线）。
- EditBox 多行显示（显示框内换行渲染，键盘已支持 multiple）。
- CharAtlas 按 measureText 实宽收紧字距（当前含 2px 防溢边距）。

### P2 — 性能进阶

- cache 模式局部脏矩形（当前整帧重绘 RT）。
- 合批段 mesh 的 attribute 增量上传（当前整段 needsUpdate）。
- TextureFactory / CharAtlas 纹理上限与 LRU 淘汰。

### P3 — 生态（沿用主 devlog 规划）

- 图集加载器胶水（TexturePacker JSON + TextureLoader 一步注册）。
- CooldownButton、红点、货币胶囊等游戏向组件（pixi 蓝本，makeBg 就绪后成本低）。
- 声音反馈钩子（等 adapter Audio 适配）。

## 四、合入标准

ui-smoke 保持全绿；新控件/新模式补对应断言节；`showcase/libs/ui` 与 `ui/` 保持 rsync 同步。
