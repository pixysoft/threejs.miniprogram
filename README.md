three.js for wechat miniprogram
=======

该项目的目标是将 three.js 移植到微信小程序，在 **WebGL1 约束** 下逐步回移植 upstream r185 能力并修复小程序适配层问题。

当前分支 `feature/fable5_upgrade` 基于 three.js **r110**，内嵌 [miniapp-adapter](utils/miniapp-adapter/) 源码直连构建，产物为 `build/three.weapp.min.js`。

### 升级亮点（fable5_upgrade，新 → 旧） ###

#### 阶段四：ColorManagement 与动画混合增强
* **ColorManagement**：新增色彩空间管理（`src/math/ColorManagement.js`），`Color` 支持 sRGB / working 空间转换（默认关闭，与 r110 行为兼容）
* **动画系统**：回移植 r185 动画混合能力，含 `AdditiveAnimationBlendMode`、`accumulateAdditive`、`AnimationUtils.makeClipAdditive` 等
* **数学与核心**：`Quaternion` 增强（additive 混合前置）、`Raycaster` 行为对齐 r185
* **JSM 模块**：同步 `CCDIKSolver`、`BufferGeometryUtils` 至 r185 版本
* **测试**：新增 `test/jsm-smoke.js`，扩展 `test/weapp-smoke.js` 覆盖色彩与动画路径

#### 阶段三：BatchedMesh 与合批渲染管线
* **BatchedMesh**：WebGL1 下可用合批网格，含 per-instance 颜色与几何合并
* **InstancedMesh**：对齐 r185 实例化增强
* **渲染管线**：`WebGLShaderCache`、batching shader chunks、`multiDraw` fallback（不支持时逐段 draw）
* **数学**：`Ray`、`Frustum`、`Sphere` 等几何工具回移植增强
* **能力探测**：`THREE.global.detectCapabilities` 扩展 instancing / float 纹理等项

#### 适配层：dispatchEvent this 绑定修复
* 监听器 `this` 按 DOM 规范指向 `currentTarget`，修复 `FileLoader` load 回调误判失败

#### 阶段一 + 二：适配层 P0/P1 修复与 r185 纯 JS 增强
* **requestAnimationFrame**：运行时动态取当前 canvas 的 RAF，无 canvas 时回退 `setTimeout(16ms)`，修复 `setAnimationLoop` 不驱动帧循环
* **Image / XHR / EventTarget**：修复 `ImageLoader` 回调、`removeEventListener` off-by-one、XHR 双通道事件派发
* **performance.now**：真机微秒统一为毫秒；无 `getPerformance` 时回退 `Date.now`
* **LoaderUtils**：`TextDecoder` 缺失时使用纯 JS UTF-8 解码器
* **capabilities.js**：WebGL1 扩展探测统一入口，经 `THREE.global.detectCapabilities` 暴露
* **Matrix4/Matrix3.invert**：解析求逆 backport，`getInverse` 保留为别名（业务侧 import 零改动）
* **Box3**：`setFromObject` / `expandByObject` 默认几何级快速路径，`precise=true` 保留逐顶点精确扫盒
* **测试**：新增 `test/weapp-smoke.js`（`node test/weapp-smoke.js`）

### 使用 ###

下载 `build` 目录中的 `three.weapp.min.js` 到小程序相应目录。或者你可以[构建自己的版本](https://github.com/mrdoob/three.js/wiki/Build-instructions)

使用方法可以参考示例 [threejs-example](https://github.com/yannliao/threejs-example)

```bash
# 冒烟测试（Node + wx stub）
node test/weapp-smoke.js
node test/jsm-smoke.js
```

### 兼容性 ###

* 基本模型、材质、灯光、阴影
* OrbitControls、TrackballControls（`examples/jsm/controls/`，需手动集成）
* TextureLoader、GLTFLoader（gltf/glb）、OBJLoader、STLLoader
* Animation system（含 additive 混合）
* Raycaster
* BatchedMesh、InstancedMesh（WebGL1）
* ColorManagement（可选开启）
* DDSLoader / MTLLoader 待测试

### miniapp-adapter 要点 ###

* `window.registerCanvas` / `unregisterCanvas`：注册与反注册小程序 Canvas（用完务必 unregister，避免内存泄漏）
* `window.touchEventHandlerFactory`：将小程序 touch 事件转发到指定 canvas，供 OrbitControls 等使用
* `THREE.global.detectCapabilities(canvas)`：探测 WebGL1 扩展与渲染能力
* 支持 WebGL2 上下文回退至 WebGL1

更多说明见 [utils/miniapp-adapter/README.md](utils/miniapp-adapter/README.md)

---

three.js
========

[![NPM package][npm]][npm-url]
[![Build Size][build-size]][build-size-url]
[![Build Status][build-status]][build-status-url]
[![Dependencies][dependencies]][dependencies-url]
[![Dev Dependencies][dev-dependencies]][dev-dependencies-url]
[![Language Grade][lgtm]][lgtm-url]

#### JavaScript 3D library ####

The aim of the project is to create an easy to use, lightweight, 3D library with a default WebGL renderer. The library also provides Canvas 2D, SVG and CSS3D renderers in the examples.

[Examples](http://threejs.org/examples/) &mdash;
[Documentation](http://threejs.org/docs/) &mdash;
[Wiki](https://github.com/mrdoob/three.js/wiki) &mdash;
[Migrating](https://github.com/mrdoob/three.js/wiki/Migration-Guide) &mdash;
[Questions](http://stackoverflow.com/questions/tagged/three.js) &mdash;
[Forum](https://discourse.threejs.org/) &mdash;
[Gitter](https://gitter.im/mrdoob/three.js) &mdash;
[Slack](https://join.slack.com/t/threejs/shared_invite/enQtMzYxMzczODM2OTgxLTQ1YmY4YTQxOTFjNDAzYmQ4NjU2YzRhNzliY2RiNDEyYjU2MjhhODgyYWQ5Y2MyZTU3MWNkOGVmOGRhOTQzYTk)

### Usage ###

Download the [minified library](http://threejs.org/build/three.min.js) and include it in your HTML, or install and import it as a [module](http://threejs.org/docs/#manual/introduction/Import-via-modules),
Alternatively, see [how to build the library yourself](https://github.com/mrdoob/three.js/wiki/Build-instructions).

```html
<script src="js/three.min.js"></script>
```

This code creates a scene, a camera, and a geometric cube, and it adds the cube to the scene. It then creates a `WebGL` renderer for the scene and camera, and it adds that viewport to the `document.body` element. Finally, it animates the cube within the scene for the camera.

```javascript
var camera, scene, renderer;
var geometry, material, mesh;

init();
animate();

function init() {

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 10 );
	camera.position.z = 1;

	scene = new THREE.Scene();

	geometry = new THREE.BoxGeometry( 0.2, 0.2, 0.2 );
	material = new THREE.MeshNormalMaterial();

	mesh = new THREE.Mesh( geometry, material );
	scene.add( mesh );

	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.appendChild( renderer.domElement );

}

function animate() {

	requestAnimationFrame( animate );

	mesh.rotation.x += 0.01;
	mesh.rotation.y += 0.02;

	renderer.render( scene, camera );

}
```

If everything went well you should see [this](https://jsfiddle.net/f2Lommf5/).

### Change log ###

[Releases](https://github.com/mrdoob/three.js/releases)


[npm]: https://img.shields.io/npm/v/three.svg
[npm-url]: https://www.npmjs.com/package/three
[build-size]: https://badgen.net/bundlephobia/minzip/three
[build-size-url]: https://bundlephobia.com/result?p=three
[build-status]: https://travis-ci.org/mrdoob/three.js.svg?branch=dev
[build-status-url]: https://travis-ci.org/mrdoob/three.js
[dependencies]: https://img.shields.io/david/mrdoob/three.js.svg
[dependencies-url]: https://david-dm.org/mrdoob/three.js
[dev-dependencies]: https://img.shields.io/david/dev/mrdoob/three.js.svg
[dev-dependencies-url]: https://david-dm.org/mrdoob/three.js#info=devDependencies
[lgtm]: https://img.shields.io/lgtm/grade/javascript/g/mrdoob/three.js.svg?label=code%20quality
[lgtm-url]: https://lgtm.com/projects/g/mrdoob/three.js/
