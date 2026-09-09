# 阴影 normalBias：现状清理与改法

目标：功能结果不变，对外 API 不变。修 bug、补齐同一代架构里该有的能力，去掉补丁感。能改再改，不强行对齐官方后期重构。

---

## 文档架构

1. **约束** — 什么必须不变，什么才算值得动
2. **已有改动概述** — 当前工作区相对 HEAD 实际做了什么
3. **技术细节** — 数据流、下标约定、shader 接入点
4. **问题** — bug / 半截实现 / 类型与构建缺口
5. **改法** — 在现有 r110–r120 架构内一次做完，不打补丁
6. **不做** — 明确砍掉的官方后期项
7. **文件与验收** — 改哪些文件、怎么验

---

## 1. 约束

| 必须不变 | 可以动 |
|---------|--------|
| `LightShadow.normalBias` 作为公开属性（默认 `0`） | 内部 uniform 组织（仍走本仓库已有的平铺数组） |
| `getShadow(map, mapSize, bias, radius, coord)` 五参数 | vertex 里三种灯共用同一偏移公式 |
| `WebGLLights.setup(lights, shadows, camera)` 签名 | `ShadowMaterial` 顶点补 normal chunk |
| 默认画面（`normalBias === 0`） | `.d.ts` 与构建产物对齐源码 |

默认值为 0 时，沿法线偏移量为 0，像素结果与改前相同。Spot / Point 补上偏移不是新功能：属性已经挂在基类上，只是没接到 shader。

---

## 2. 已有改动概述

相对 HEAD 的真实 diff：方向光 `normalBias` 最小 backport。与 `shadow-alignment-plan.md` 第 5 节（struct 打包、intensity、11 个文件）不一致，以 git 为准。

涉及源文件 7 个：

- `src/lights/LightShadow.js` — 属性、`copy`、`toJSON`
- `src/loaders/ObjectLoader.js` — parse
- `src/renderers/webgl/WebGLLights.js` — 写入 + hash 时截断
- `src/renderers/shaders/UniformsLib.js` — `directionalShadowNormalBias: { value: [] }`
- `src/renderers/WebGLRenderer.js` — state → uniform 映射
- `src/renderers/shaders/ShaderChunk/shadowmap_pars_vertex.glsl.js` — vertex uniform
- `src/renderers/shaders/ShaderChunk/shadowmap_vertex.glsl.js` — 仅方向光偏移

构建产物 `build/three.js`、`three.module.js`、`three.weapp.js` 已跟着改；`three.weapp.min.js` 未进这次改动。

---

## 3. 技术细节

### 3.1 本仓库阴影数据怎么走

Fragment 和 Vertex 本来就分家，不是这次才拆开的：

- **Fragment**：`shadow` / `shadowBias` / `shadowRadius` / `shadowMapSize` 在 light struct 里（`lights_pars_begin`）。Phong/Physical 顶点不 include 这份 struct。
- **Vertex**：只有 `*ShadowMatrix` 和 varying。`normalBias` 必须在 vertex 用，所以只能再挂一条平铺 float 数组，和 matrix 同一代写法。

不要把 `normalBias` 塞进 light struct「省数组」：顶点看不见，反而要给 Phong 顶点整份灯光定义，更冗余。

### 3.2 现有方向光数据流

```
light.shadow.normalBias
  → state.directionalShadowNormalBias[directionalLength]
  → uniforms.directionalShadowNormalBias
  → worldPosition + N * bias，再乘 directionalShadowMatrix
```

下标用 `directionalLength`（全部方向光序号），不是 `numDirectionalShadows`。依赖 `shadowCastingLightsFirst`：投射阴影的灯排前面，再把数组 `length` 截到 `numDirectionalShadows`。与 `directionalShadowMap` / `directionalShadowMatrix` 同一约定，截断这次已经做了。

Shader 循环次数 `NUM_DIR_LIGHT_SHADOWS` 来自 `lights.directionalShadowMap.length`。

### 3.3 Vertex 公式（当前只方向光）

```glsl
vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
vDirectionalShadowCoord[i] = directionalShadowMatrix[i]
  * (worldPosition + vec4(shadowWorldNormal * directionalShadowNormalBias[i], 0.0));
```

Spot / Point 仍是 `matrix * worldPosition`。

### 3.4 谁 include 了 shadowmap_vertex

- `meshphong_vert` / `meshlambert_vert` / `meshphysical_vert`：有 `defaultnormal_vertex`，有 `transformedNormal`
- `shadow_vert`（ShadowMaterial）：没有 normal chunk，没有 `transformedNormal`

本仓库顶点 prefix 始终声明 `attribute vec3 normal`，缺的是 `transformedNormal` 这个局部变量。

---

## 4. 问题

按必须修 / 同一代该补齐 / 收尾排，不按「对齐官方」排。

### 必须修

**ShadowMaterial 编译失败。** 有方向光阴影时，`shadowmap_vertex` 引用未声明的 `transformedNormal`。这是这次 backport 引入的。ShadowMaterial 常用于接地影，和高方向光阴影一起出现。

官方同期修法：给 `shadow_vert` 补 `beginnormal_vertex` → `defaultnormal_vertex`。`normalBias === 0` 时偏移为 0，画面与改前一致。

本仓库不必先上 `HAS_NORMAL` define：那是官方后期给「几何没有 normal 属性」用的，当前四份 include shadowmap 的内置 shader 里，真正缺变量的只有 `shadow_vert`。

### 同一代该补齐

**Spot / Point 的 `normalBias` 是空操作。** 属性在 `LightShadow` 基类上，三种灯都继承。只接方向光是半截实现，不是「有意只支持方向光」的设计。默认 0，接上后默认画面不变。

### 收尾

- `LightShadow.d.ts`、`UniformsLib.d.ts` 没有 `normalBias`
- 若小程序吃 `three.weapp.min.js`，它还是改前的 shader

`setup` 的 `shadows` 参数本来就没用，不是这次引入的，这次不动。

---

## 5. 改法

原则：按本仓库已经在用的「vertex 平铺数组」把 `normalBias` 做成三种灯的同一条通路，而不是再给方向光开特例。公式、下标、截断、renderer 映射跟 matrix 对齐。一次改完，不留第二处平行逻辑。

参考：官方第一次落地 `normalBias`（约 r117）的方式。不参考 r129 之后的 struct / PCF / setupView。

### 5.1 Vertex：一处法线，三种灯同一公式

`shadowWorldNormal` 提到 `USE_SHADOWMAP` 顶层（只要三种阴影计数任一大于 0 就算）。三种灯都写成：

```glsl
shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * xxxShadowNormalBias[ i ], 0.0 );
vXxxShadowCoord[ i ] = xxxShadowMatrix[ i ] * shadowWorldPosition;
```

`inverseTransformDirection` 函数名保持现状。`#pragma unroll_loop` 语法保持现状。

### 5.2 JS：三条平铺数组，规则相同

每种灯一套：`*ShadowNormalBias[]`。写入、下标、hash 截断，分别与各自的 `*ShadowMatrix` 相同。

UniformsLib 补 `spotShadowNormalBias`、`pointShadowNormalBias`。WebGLRenderer 三处映射一起写，不要只映射方向光。

不引入 `ShadowUniformsCache`，不把 bias/radius 从 light struct 里拆走。Fragment 继续从 `directionalLights[i].shadowBias` 取值。

### 5.3 ShadowMaterial

`shadow_vert.glsl.js` 在 `begin_vertex` 前补：

```
beginnormal_vertex
morphnormal_vertex
skinbase_vertex
skinnormal_vertex
defaultnormal_vertex
```

与官方现用 `shadow.glsl.js` 顶点一致，也与本仓库 Phong/Lambert 一致。不改 ShadowMaterial 的公开接口。

不为此改 `WebGLPrograms` / `WebGLProgram` 加 `HAS_NORMAL`。

### 5.4 类型与构建

`LightShadow.d.ts` 增加 `normalBias: number`。`UniformsLib.d.ts` 的 lights 块补三条 `*ShadowNormalBias`。构建按项目现有流程出，需要下发 min 就包含 min。

---

## 6. 不做

这些能提升官方对齐度，但不修当前 bug、还扩大回归面。现在不做。

| 项 | 原因 |
|---|---|
| shadow struct + `ShadowUniformsCache` | 要动 fragment `getShadow` 取值路径 8–11 个文件。本仓库 fragment 已从 light struct 读 bias。半拆成「bias 在 light、normalBias 在另一 struct」比现在更碎 |
| `shadow.intensity` | 新公开属性，还要改 `getShadow` 签名 |
| `autoUpdate` / `needsUpdate` / `blurSamples` / `dispose` | 公开面扩张，与 acne 无关 |
| `sampler2DShadow` / Vogel disk | 改阴影观感；WebGL1 还要双路径 |
| `setup` / `setupView` 拆分 | 内部性能，调用链要改，和这次无关 |
| Spot light map、reversed depth、VSM define | 独立功能 |
| 给 light struct 加 `shadowNormalBias` | 顶点用不上 |
| 改 `inverseTransformDirection` 之名、ES6 class 化 LightShadow | 无关风格 |

struct 打包只在下一步真做 intensity 或换 PCF 时才有意义。

---

## 7. 文件与验收

### 改哪些

| 文件 | 做什么 |
|---|---|
| `shadowmap_vertex.glsl.js` | 顶层 `shadowWorldNormal`；三种灯同一公式 |
| `shadowmap_pars_vertex.glsl.js` | 三种灯各一条 `uniform float *ShadowNormalBias[]` |
| `UniformsLib.js` | 对应三条 `{ value: [] }` |
| `WebGLLights.js` | spot/point 写入 + 截断（方向光已有，对齐写法即可） |
| `WebGLRenderer.js` | 三条都映射 |
| `shadow_vert.glsl.js` | 补 normal chunk |
| `LightShadow.js` / `ObjectLoader.js` | 已有，不改公开语义 |
| `LightShadow.d.ts` / `UniformsLib.d.ts` | 补类型 |
| `build/*` | 按现有打包流程 |

`lights_pars_begin`、`lights_fragment_begin`、`shadowmap_pars_fragment`、`shadowmask_pars_fragment` 不改。

### 验收

- `normalBias = 0`：三种灯 + ShadowMaterial，画面与改前一致
- 方向光设 `normalBias`：acne 减轻，与当前 backport 一致
- 聚光 / 点光设同一值：开始生效（默认 0 无差别）
- 有方向光阴影时 ShadowMaterial 能编译、能画
- `toJSON` / `ObjectLoader` 往返带 `normalBias`
- 动态增删投射阴影的灯：数组截断后无残留 uniform 报错

### 实施顺序

1. `shadow_vert` 补 normal —— 先消掉编译失败
2. vertex 三种灯同一公式 + pars uniform
3. UniformsLib / WebGLLights / WebGLRenderer 三条通路一次接完
4. `.d.ts` + 构建

顺序 2–3 是同一条通路，不要先只做 vertex 或只做 JS。
