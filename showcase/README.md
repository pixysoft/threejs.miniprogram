# threejs.miniprogram Showcase — PC 端演示站

把 **微信小程序版 Three.js（three.weapp.js）+ three-ui 2D UI 层** 搬到 PC 浏览器在线演示。
内核产物 `libs/three.weapp.js` 与 `libs/ui/` **零修改**（从 `build/` 与 `ui/` 原样拷贝），
浏览器兼容全部由演示站自己的 polyfill / 桥接层完成。

## 快速开始

纯静态站点，无构建步骤。任选一种方式启动 HTTP 服务后打开 `index.html`：

```bash
cd showcase
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

或把 `showcase/` 整个目录上传到任意静态托管（GitHub Pages / nginx / OSS）。
注意不能用 `file://` 直接打开（模块通过 fetch 加载）。

## 演示内容

- **3D 渲染**：registerCanvas 注册、拖拽旋转、Raycaster 点选换色
- **2D UI 层（three-ui）**：
  - 基础件：Button 三态 / ProgressBar / Toggle / Slider / TabBar / Theme 一行换皮 / Toast / tween
  - 容器：ScrollView 惯性回弹 + 子控件 cancelPress 拦截、List 虚拟化（1000 条数据 9 个实例）、PageView 磁吸翻页、Modal 防穿透
  - 横竖屏适配：fitWidth / fitHeight 切换，Widget 锚点自动重排，一套 UI 双方向
- **3D + UI 混合**：OVERLAY 双 pass 渲染、UICoordinateTracker 血条跟随 3D 单位、HUD、伤害飘字

每个演示页 = 可交互实时渲染 + 使用说明 + 代码片段。

## 工作原理（不改内核）

```
浏览器
 ├─ js/wx-polyfill.js   模拟 wx.*（系统信息 / performance / request→fetch / 文件系统→fetch）
 ├─ js/loader.js        迷你 CommonJS 加载器（支持 ui/ 多文件相对 require 递归预载）
 ├─ js/harness.js       伪小程序 canvas（_canvasId / createImage / rAF）
 │                       + 鼠标→wx 触摸事件桥 + 演示生命周期（切换时销毁 renderer/UI）
 ├─ libs/three.weapp.js  ← build/ 原样拷贝，一行未改
 └─ libs/ui/             ← ui/ 原样拷贝，一行未改
```

要点：

- 内核 adapter 在模块求值时就调用 `wx.getSystemInfoSync` 等，polyfill 必须先于 loader 加载；
- canvas 带 `_canvasId` 后走真实的 `THREE.global.registerCanvas()`——DOM canvas 的
  tagName 是 CANVAS，adapter 跳过原型混入，不污染浏览器原型；
- 触摸链路与小程序完全同路：鼠标事件被转成 `{ touches, changedTouches }` 结构，
  先经 `ui.dispatchTouch(e)`，UI 未消费再透传给 3D 相机控制（小程序页面 bindtouch* 的推荐接法）；
- `createCanvas2D` 在浏览器注入 `document.createElement('canvas')`，
  小程序端对应 `wx.createOffscreenCanvas({ type: '2d' })`——同一套 UI 代码两端自适配。

## 同步内核产物

`build/three.weapp.js` 或 `ui/` 更新后重新拷贝：

```bash
cp build/three.weapp.js showcase/libs/
rm -rf showcase/libs/ui && cp -R ui showcase/libs/ui
```

## 相关文档

- UI 架构设计：`docs/fable5/three-ui-design.md`
- 开发总结与计划：`docs/fable5/three-ui-devlog.md`
- UI 冒烟测试：`node test/ui-smoke.js`（131 项）
