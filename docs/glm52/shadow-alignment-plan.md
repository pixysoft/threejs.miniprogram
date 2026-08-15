# 阴影系统对齐官方方案 - 分析与开发计划

## 文档架构

1. **现状分析** - 当前版本 vs 官方版本的架构差异
2. **文件级差异** - 逐文件对比，标注每个改动点
3. **优化方案** - 分阶段对齐计划
4. **开发计划** - 按优先级排序的实施步骤

---

## 1. 现状分析

### 1.1 版本基线

| 维度 | 当前小程序版本 | 官方版本 |
|------|---------------|---------|
| 基线 | r110-r120 时期 | master (r183+) |
| 代码风格 | ES5 prototype + `var` | ES6 class + `const/let` |
| 阴影 uniform 组织 | 平铺数组 | struct 打包 |
| normalBias 覆范围 | 仅 directional | directional + spot + point |
| PCF 实现 | 手动 17-tap 软件采样 | 硬件 PCF (sampler2DShadow) + Vogel disk |
| 阴影强度 | 无 shadowIntensity | 支持 shadowIntensity 混合 |
| 深度缓冲 | 无 reversed depth 支持 | 支持 USE_REVERSED_DEPTH_BUFFER |
| Spot light map | 不支持 | 支持 spotLightMap / spotLightMatrix |
| setup 函数 | 单函数 setup(lights, shadows, camera) | 拆分 setup(lights) + setupView(lights, camera) |

### 1.2 核心差距总结

当前版本是 r110-r120 基线 + directional-only normalBias 的 backport。官方在 r129 之后对阴影系统做了**三次重大重构**：

1. **struct 打包重构** - 把 shadowBias/shadowNormalBias/shadowRadius/shadowMapSize 打包进 struct uniform，三种灯全覆盖
2. **PCF 硬件化** - 用 `sampler2DShadow` 替代手动 `unpackRGBAToDepth`，配合 Vogel disk + IGN 采样
3. **架构拆分** - WebGLLights 拆出独立的 `ShadowUniformsCache`，`setup` 只处理灯光列表变化，`setupView` 每帧处理相机相关更新

---

## 2. 文件级差异

涉及 9 个文件，按数据流向排序（LightShadow -> UniformsLib -> shader -> WebGLLights -> WebGLPrograms/WebGLProgram -> ObjectLoader）。

### 2.1 LightShadow.js

**当前版本**（ES5 prototype，[src/lights/LightShadow.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/lights/LightShadow.js)）

| 属性/方法 | 当前 | 官方 |
|-----------|------|------|
| intensity | 缺失 | `1`（控制阴影不透明度） |
| biasNode | 缺失 | `null`（WebGPU 可编程 bias） |
| normalBias | `0` | `0`（一致） |
| blurSamples | 缺失 | `8`（VSM 模糊采样数） |
| mapType | 缺失 | `UnsignedByteType`（阴影纹理类型） |
| autoUpdate | 缺失 | `true` |
| needsUpdate | 缺失 | `false` |
| dispose() | 缺失 | 释放 map / mapPass |
| copy() | 拷贝 bias/radius/normalBias/mapSize | 额外拷贝 intensity/autoUpdate/needsUpdate/blurSamples/biasNode |
| toJSON() | 序列化 bias/normalBias/radius/mapSize | 额外序列化 intensity |
| updateMatrices() | `setFromMatrix`（旧API） | `setFromProjectionMatrix` + WebGPU坐标系 + reversed depth |

### 2.2 UniformsLib.js

**当前版本**（[src/renderers/shaders/UniformsLib.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/UniformsLib.js)）

当前 lights 块使用**平铺数组**：

```
directionalShadowNormalBias: { value: [] }   // 仅 directional
directionalShadowMap: { value: [] }
directionalShadowMatrix: { value: [] }
spotShadowMap: { value: [] }
spotShadowMatrix: { value: [] }
pointShadowMap: { value: [] }
pointShadowMatrix: { value: [] }
```

官方使用 **struct 打包**：

```glsl
directionalLightShadows: { value: [], properties: {
    shadowIntensity, shadowBias, shadowNormalBias, shadowRadius, shadowMapSize
}}
spotLightShadows: { value: [], properties: { ...同上 }}
pointLightShadows: { value: [], properties: {
    ...同上 + shadowCameraNear, shadowCameraFar
}}
```

额外差异：官方有 `spotLightMap`、`spotLightMatrix`（spot light 纹理投射），当前版本无。

### 2.3 shadowmap_pars_vertex.glsl.js

**当前版本**（[src/renderers/shaders/ShaderChunk/shadowmap_pars_vertex.glsl.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/ShaderChunk/shadowmap_pars_vertex.glsl.js)）

```glsl
// 当前：平铺 float 数组
uniform float directionalShadowNormalBias[ NUM_DIR_LIGHT_SHADOWS ];

// 官方：struct
struct DirectionalLightShadow {
    float shadowIntensity; float shadowBias; float shadowNormalBias;
    float shadowRadius; vec2 shadowMapSize;
};
uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
```

命名差异：官方 spot 相关从 `spotShadowMatrix`/`vSpotShadowCoord` 改为 `spotLightMatrix`/`vSpotLightCoord`，并引入 `NUM_SPOT_LIGHT_COORDS`（与 `NUM_SPOT_LIGHT_SHADOWS` 分离）。

### 2.4 shadowmap_vertex.glsl.js

**当前版本**（[src/renderers/shaders/ShaderChunk/shadowmap_vertex.glsl.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/ShaderChunk/shadowmap_vertex.glsl.js)）

```glsl
// 当前：shadowWorldNormal 仅在 directional 块内声明
vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
// directional：应用 normalBias ✓
// spot：无 normalBias ✗
// point：无 normalBias ✗
```

```glsl
// 官方：shadowWorldNormal 在顶层声明，三种灯全应用
vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
// directional：directionalLightShadows[i].shadowNormalBias ✓
// point：pointLightShadows[i].shadowNormalBias ✓
// spot：spotLightShadows[i].shadowNormalBias ✓（条件判断）
```

官方额外有 `HAS_NORMAL` 回退（无法线时 fallback 为 `vec3(0.0)`，见 issue #21483）。

### 2.5 shadowmap_pars_fragment.glsl.js

**当前版本**（[src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js)）

| 维度 | 当前 | 官方 |
|------|------|------|
| 采样器类型 | `sampler2D`（全部） | PCF: `sampler2DShadow`，BASIC: `sampler2D`，Point-PCF: `samplerCubeShadow` |
| 深度解码 | `unpackRGBAToDepth(texture2D())` 手动 | 硬件 `texture(shadowMap, vec3(uv, compare))` |
| PCF 采样 | 17-tap 固定网格 | 5-tap Vogel disk + interleaved gradient noise |
| PCFSoft | 双线性 lerp (9-tap) | 已合并进 PCF（Vogel disk） |
| VSM | 基础 Chebyshev | 改进版 + reversed depth 支持 |
| shadowIntensity | 无 | `mix(1.0, shadow, shadowIntensity)` |
| reversed depth | 无 | `#ifdef USE_REVERSED_DEPTH_BUFFER` |
| getShadow 签名 | `(map, mapSize, bias, radius, coord)` | `(map, mapSize, intensity, bias, radius, coord)` |

### 2.6 WebGLLights.js

**当前版本**（[src/renderers/webgl/WebGLLights.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/webgl/WebGLLights.js)）

| 维度 | 当前 | 官方 |
|------|------|------|
| shadow uniform 缓存 | 混在 `UniformsCache` 内 | 独立 `ShadowUniformsCache` |
| 函数结构 | `setup(lights, shadows, camera)` 单函数 | `setup(lights)` + `setupView(lights, camera)` 拆分 |
| directional shadow | state 有 `directionalShadowNormalBias` 平铺数组 | state 有 `directionalShadow` struct 数组 |
| spot shadow | 有 shadowBias/shadowRadius 但**无 shadowNormalBias** | struct 含 shadowNormalBias |
| point shadow | 有 shadowBias/shadowRadius 但**无 shadowNormalBias** | struct 含 shadowNormalBias |
| 数组截断 | `directionalShadowNormalBias` **漏截断** | struct 数组截断即覆盖 |
| RectArea LTC | 内联在 setup 中 | 独立判断 extensions |

### 2.7 WebGLPrograms.js

**当前版本**（[src/renderers/webgl/WebGLPrograms.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/webgl/WebGLPrograms.js)）

| 参数 | 当前 | 官方 |
|------|------|------|
| numDirLightShadows | ✓ | ✓ |
| numPointLightShadows | ✓ | ✓ |
| numSpotLightShadows | ✓ | ✓ |
| numSpotLightShadowsWithMaps | 缺失 | ✓ |
| numSpotLightCoords | 缺失 | ✓（= spot 数 + spotMap 数） |
| numSpotLightMaps | 缺失 | ✓ |

### 2.8 WebGLProgram.js

**当前版本**（[src/renderers/webgl/WebGLProgram.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/webgl/WebGLProgram.js)）

当前只替换 3 个 define：
```
NUM_DIR_LIGHT_SHADOWS, NUM_SPOT_LIGHT_SHADOWS, NUM_POINT_LIGHT_SHADOWS
```

官方额外替换：
```
NUM_SPOT_LIGHT_COORDS, NUM_SPOT_LIGHT_MAPS, NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS
```

shadowMapTypeDefines：当前仅 `PCFShadowMap`，官方增加 `VSMShadowMap`。

### 2.9 ObjectLoader.js

**当前版本**（[src/loaders/ObjectLoader.js](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/loaders/ObjectLoader.js#L940)）

当前解析：`bias`、`normalBias`、`radius`、`mapSize`、`camera`
官方额外解析：`intensity`

---

## 3. 优化方案

### 3.1 方案原则

- **严格对齐**：最终行为与官方 master 一致，不引入自定义逻辑
- **保持风格**：当前版本为 ES5 prototype 风格，不强制转 ES6 class（避免大面积无关改动）
- **分阶段实施**：按功能优先级拆分，每阶段可独立验证
- **不做的事**：不引入 spot light map（spotLightMap/spotLightMatrix），这是独立功能，与阴影质量无关

### 3.2 分阶段方案

#### Phase 1：struct 打包 + normalBias 全覆盖

**目标**：修复 P0（spot/point normalBias 失效）+ P1（数组截断遗漏），对齐官方 struct 架构。

**改动文件**（6 个）：

1. **UniformsLib.js** - 删除 `directionalShadowNormalBias` 平铺数组，新增三个 struct uniform
2. **shadowmap_pars_vertex.glsl.js** - 删除 `uniform float directionalShadowNormalBias[]`，新增三个 struct 声明
3. **shadowmap_vertex.glsl.js** - `shadowWorldNormal` 提到顶层，三种灯全应用 normalBias
4. **WebGLLights.js** - 新增 `ShadowUniformsCache`，三种灯填充 struct，修复数组截断
5. **LightShadow.js** - 补充 `intensity`、`autoUpdate`、`needsUpdate`、`blurSamples`、`dispose()`
6. **ObjectLoader.js** - 补充 `intensity` 解析

#### Phase 2：fragment shader 升级

**目标**：对齐官方 PCF/VSM 实现，提升阴影质量。

**改动文件**（3 个）：

1. **shadowmap_pars_fragment.glsl.js** - 整体重写：硬件 PCF (sampler2DShadow) + Vogel disk + shadowIntensity + reversed depth
2. **WebGLProgram.js** - 补充 `VSMShadowMap` define，`NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS` 替换
3. **shadowmap_vertex.glsl.js**（补充）- 使用 `HAS_NORMAL` 回退 + `#pragma unroll_loop_start/end`

#### Phase 3：WebGLLights 架构拆分

**目标**：对齐官方 `setup` + `setupView` 拆分，提升性能（灯光列表不变时不重复计算）。

**改动文件**（1 个）：

1. **WebGLLights.js** - 拆 `setup(lights, shadows, camera)` 为 `setup(lights)` + `setupView(lights, camera)`，调用方同步改

**前置依赖**：Phase 1 完成（struct 架构就绪后拆分才安全）

#### Phase 4：WebGLPrograms 参数补齐

**目标**：对齐官方 shader define 参数（不含 spot light map 功能）。

**改动文件**（2 个）：

1. **WebGLPrograms.js** - 补充 `numSpotLightShadowsWithMaps` 参数（值设为 0，因为不做 spot map）
2. **WebGLProgram.js** - 补充 `NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS` 替换

---

## 4. 开发计划

### 4.1 约束与风险

| 约束 | 说明 | 影响阶段 |
|------|------|---------|
| WebGL 版本 | 当前代码支持 WebGL1/WebGL2 双模式。`sampler2DShadow` 仅 WebGL2 可用。小程序环境需确认是否支持 WebGL2 | Phase 2 |
| 函数名差异 | 当前用 `inverseTransformDirection`（common.glsl.js:67），官方用 `transformNormalByInverseViewMatrix`。功能等价，保留当前函数名 | Phase 1 |
| HAS_NORMAL | 当前 WebGLPrograms.js 未定义 `HAS_NORMAL`。官方用它做无 normal 的回退 | Phase 1 |
| getShadow 签名 | 当前 5 参数 `(map, mapSize, bias, radius, coord)`，官方 6 参数含 `shadowIntensity`。改签名需同步改 3 处调用方 | Phase 2 |
| lights_fragment_begin | [lights_fragment_begin.glsl.js:64,85](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js#L64) 调用 getShadow，需同步改 | Phase 2 |
| shadowmask_pars_fragment | [shadowmask_pars_fragment.glsl.js:16,30](file:///Users/pixysoft/Downloads/虚拟机/git/threejs.miniprogram/src/renderers/shaders/ShaderChunk/shadowmask_pars_fragment.glsl.js#L16) 调用 getShadow，需同步改 | Phase 2 |

### 4.2 Phase 1：struct 打包 + normalBias 全覆盖

**优先级**：P0（修复 spot/point normalBias 失效）

**改动清单**：

#### 1. UniformsLib.js
- 删除 `directionalShadowNormalBias: { value: [] }`
- 删除 `directionalShadowMap` / `directionalShadowMatrix` / `spotShadowMap` / `spotShadowMatrix` / `pointShadowMap` / `pointShadowMatrix` 中的平铺结构
- 新增 struct uniform：`directionalLightShadows`、`spotLightShadows`、`pointLightShadows`
- 保留 `directionalShadowMap` / `directionalShadowMatrix` / `spotShadowMap` / `spotShadowMatrix` / `pointShadowMap` / `pointShadowMatrix`（采样器和矩阵仍需平铺）

#### 2. shadowmap_pars_vertex.glsl.js
- 删除 `uniform float directionalShadowNormalBias[]`
- 新增 `struct DirectionalLightShadow { shadowIntensity, shadowBias, shadowNormalBias, shadowRadius, shadowMapSize }`
- 新增 `struct SpotLightShadow { ...同上 }`
- 新增 `struct PointLightShadow { ...同上 + shadowCameraNear, shadowCameraFar }`
- 新增 `uniform DirectionalLightShadow directionalLightShadows[]`
- 新增 `uniform SpotLightShadow spotLightShadows[]`
- 新增 `uniform PointLightShadow pointLightShadows[]`
- spot/point 的 `varying` 和 `uniform mat4 ...ShadowMatrix` 保持不变

#### 3. shadowmap_vertex.glsl.js
- `shadowWorldNormal` 声明提到 `#ifdef USE_SHADOWMAP` 顶层（当前在 `#if NUM_DIR_LIGHT_SHADOWS > 0` 内部）
- directional：`shadowWorldNormal * directionalLightShadows[i].shadowNormalBias`
- point：新增 `shadowWorldNormal * pointLightShadows[i].shadowNormalBias`
- spot：新增 `shadowWorldNormal * spotLightShadows[i].shadowNormalBias`
- 使用 `#pragma unroll_loop_start/end`（当前用 `#pragma unroll_loop`）

#### 4. WebGLLights.js
- 新增 `ShadowUniformsCache` 函数，返回 `{ shadowIntensity, shadowBias, shadowNormalBias, shadowRadius, shadowMapSize }`
- state 新增 `directionalShadow`、`spotShadow`、`pointShadow` 数组（struct 值）
- state 删除 `directionalShadowNormalBias`
- `setup()` 中三种灯都从 `shadowCache.get()` 获取 struct 并填充 `shadowNormalBias`
- hash 变化时截断 `directionalShadow` / `spotShadow` / `pointShadow` 数组

#### 5. LightShadow.js
- 新增属性：`this.intensity = 1`、`this.autoUpdate = true`、`this.needsUpdate = false`、`this.blurSamples = 8`
- `copy()` 补充：`this.intensity = source.intensity`、`this.autoUpdate`、`this.needsUpdate`、`this.blurSamples`
- `toJSON()` 补充：`if ( this.intensity !== 1 ) object.intensity = this.intensity`
- 新增 `dispose()` 方法

#### 6. ObjectLoader.js
- 新增：`if ( data.shadow.intensity !== undefined ) object.shadow.intensity = data.shadow.intensity`

**验证**：
- 方向光 normalBias 效果不变（回归测试）
- 聚光灯 normalBias 生效（设置 `spotLight.shadow.normalBias = 0.05`，观察 acne 消除）
- 点光源 normalBias 生效
- 动态删减灯光后无残留 uniform 报错
- shadow.toJSON() / ObjectLoader.parse 往返一致

### 4.3 Phase 2：fragment shader 升级

**优先级**：P1（阴影质量提升）

**前置条件**：确认小程序环境 WebGL 版本

**改动清单**：

#### 1. shadowmap_pars_fragment.glsl.js（整体重写）
- PCF 分支：`sampler2DShadow` + Vogel disk 5-tap + IGN（WebGL2）
- BASIC 分支：`sampler2D` + 简化 depth 比较
- VSM 分支：`sampler2D` + 改进 Chebyshev + reversed depth
- Point-PCF：`samplerCubeShadow` + Vogel disk
- Point-BASIC：`samplerCube` + depth 比较
- 所有分支：`return mix(1.0, shadow, shadowIntensity)`
- struct 声明：`DirectionalLightShadow` / `SpotLightShadow` / `PointLightShadow`（与 vertex 端一致）

**WebGL1 回退策略**（如小程序不支持 WebGL2）：
- PCF 分支保留当前手动 17-tap `texture2DCompare` 方案
- 仅补充 `shadowIntensity` 混合 + struct 声明
- 不引入 `sampler2DShadow`

#### 2. lights_fragment_begin.glsl.js
- getShadow 调用增加 `shadowIntensity` 参数：`getShadow(map, mapSize, intensity, bias, radius, coord)`
- directional/spot 调用处改为 `directionalLightShadows[i].shadowIntensity` 等 struct 字段

#### 3. shadowmask_pars_fragment.glsl.js
- 同上，getShadow 调用增加 `shadowIntensity`

#### 4. WebGLProgram.js
- `shadowMapTypeDefines` 增加 `[ VSMShadowMap ]: 'SHADOWMAP_TYPE_VSM'`
- 新增 `NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS` 替换（值设 0）

#### 5. WebGLPrograms.js
- 新增 `numSpotLightShadowsWithMaps: 0`（占位）

**验证**：
- PCF 阴影边缘更柔和（Vogel disk vs 固定网格）
- VSM 模式可工作（`renderer.shadowMap.type = VSMShadowMap`）
- `shadow.intensity = 0.5` 阴影半透明生效
- reversed depth 场景（如有）无 acne

### 4.4 Phase 3：WebGLLights 架构拆分

**优先级**：P2（性能优化）

**前置条件**：Phase 1 完成

**改动清单**：

#### 1. WebGLLights.js
- 当前 `setup(lights, shadows, camera)` 拆为：
  - `setup(lights)` - 灯光列表变化时填充 state（shadow struct、color、distance 等不依赖相机的字段）
  - `setupView(lights, camera)` - 每帧执行，填充 position/direction（依赖 viewMatrix）
- state 中的 `version` 机制保持不变

#### 2. WebGLRenderStates.js（调用方）
- 当前调用 `lights.setup(lights, shadows, camera)` 的地方改为先 `setup` 再 `setupView`

**验证**：
- 灯光列表不变时，`setup` 不重复执行（通过 `state.version` 不递增验证）
- 相机移动时，position/direction 正确更新
- 阴影效果与 Phase 1 一致

### 4.5 Phase 4：WebGLPrograms 参数补齐

**优先级**：P3（完整性对齐）

**改动清单**：

#### 1. WebGLPrograms.js
- 新增 `numSpotLightShadowsWithMaps: 0`（不实现 spot map，值固定 0）
- 新增 `numSpotLightCoords: lights.spot.length`（= spot 数量）
- 新增 `numSpotLightMaps: 0`

#### 2. WebGLProgram.js
- 新增替换：`NUM_SPOT_LIGHT_COORDS`、`NUM_SPOT_LIGHT_MAPS`

**验证**：
- shader 编译无 `NUM_SPOT_LIGHT_COORDS` undefined 错误
- 聚光灯投射阴影正常

### 4.6 依赖关系图

```
Phase 1 (struct + normalBias 全覆盖)
  ├── Phase 2 (fragment shader 升级)  [依赖: struct 声明]
  │     └── Phase 4 (参数补齐)        [依赖: VSM define]
  └── Phase 3 (架构拆分)              [依赖: struct state]
```

Phase 1 是所有后续阶段的前置。Phase 2 和 Phase 3 可并行。Phase 4 依赖 Phase 2 的 VSM define。

---

## 5. Phase 1 实施记录

### 5.1 实际改动范围

计划预估 6 个文件，实际 11 个文件（fragment 调用链 + renderer 映射需同步改）：

| # | 文件 | 改动 |
|---|------|------|
| 1 | LightShadow.js | 新增 `intensity`/`dispose()`，更新 `copy()`/`toJSON()` |
| 2 | ObjectLoader.js | 新增 `intensity` 解析 |
| 3 | UniformsLib.js | 移除 light uniform shadow 字段，新增 3 个 shadow struct uniform |
| 4 | lights_pars_begin.glsl.js | 移除 3 个 light struct 的 shadow 字段 |
| 5 | shadowmap_pars_vertex.glsl.js | 声明 3 个 shadow struct + uniform 数组 |
| 6 | shadowmap_pars_fragment.glsl.js | fragment 端声明相同 struct（保留当前 PCF/VSM 函数） |
| 7 | shadowmap_vertex.glsl.js | shadowWorldNormal 提顶层，3 种灯全应用 normalBias |
| 8 | lights_fragment_begin.glsl.js | getShadow 调用改用 shadow struct 字段，移除 shadow 布尔检查 |
| 9 | shadowmask_pars_fragment.glsl.js | 同上 |
| 10 | WebGLLights.js | 新增 ShadowUniformsCache，3 种灯填充 struct，修复数组截断 |
| 11 | WebGLRenderer.js | 新增 shadow struct state -> uniform 映射（关键修复） |

### 5.2 修复的问题

- **P0（已修复）**：spot/point 灯的 normalBias 现在通过 shadow struct 正确传递和应用
- **P1（已修复）**：shadow struct 数组在 hash 变化时正确截断
- **隐藏 Bug（已修复）**：WebGLRenderer.js 从未映射 shadow struct state 到 uniform，导致旧 directionalShadowNormalBias 即使对 directional 灯也不生效

### 5.3 保持不变的部分

- `setup(lights, shadows, camera)` 函数签名不变（Phase 3 拆分）
- `getShadow` 5 参数签名不变（Phase 2 加 shadowIntensity）
- PCF/VSM 函数实现不变（Phase 2 升级）
- `#pragma unroll_loop` 语法不变（当前预处理器兼容）
- `inverseTransformDirection` 函数名不变（当前代码库已有）
- ES5 prototype 风格不变
- `vSpotShadowCoord`/`vPointShadowCoord` 命名不变（不引入 spot light map 改名）
