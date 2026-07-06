/**
 * build/three.weapp.js 冒烟测试(Node 环境 + wx stub)
 * 用法: node test/weapp-smoke.js
 * 覆盖: 适配层 P0/P1 修复点、Matrix4/Matrix3.invert 与 getInverse 别名、
 *       Box3 快速扫盒、THREE.global API 面兼容性
 */

'use strict';

let failures = 0;

function assert( name, condition ) {

	if ( condition ) {

		console.log( '  ok  ' + name );

	} else {

		failures ++;
		console.error( 'FAIL  ' + name );

	}

}

// ---- wx stub(真机形态: getPerformance().now() 返回微秒) ----

const MICRO_START = 123456789;
let microNow = MICRO_START;

global.wx = {
	getSystemInfoSync() {
		return {
			platform: 'ios',
			system: 'iOS 15.0',
			language: 'zh_CN',
			screenWidth: 375,
			screenHeight: 667,
			devicePixelRatio: 2
		};
	},
	getPerformance() {
		return { now() { return microNow; } };
	},
	getFileSystemManager() {
		return { readFile( options ) { options.fail( { errMsg: 'stub' } ); } };
	},
	request() {}
};

const THREE = require( '../build/three.weapp.js' );

// ---- 1. API 面兼容(现网 61 处 import 依赖) ----

assert( 'THREE.global.registerCanvas 存在', typeof THREE.global.registerCanvas === 'function' );
assert( 'THREE.global.touchEventHandlerFactory 存在', typeof THREE.global.touchEventHandlerFactory === 'function' );
assert( 'THREE.global.clearCanvas 存在', typeof THREE.global.clearCanvas === 'function' );
assert( 'THREE.global.detectCapabilities 存在(新增)', typeof THREE.global.detectCapabilities === 'function' );
assert( 'THREE.Scene 可实例化', new THREE.Scene().isScene === true );

// ---- 2. P0 #1: RAF 未注册 canvas 时回退 setTimeout(不再是 noop) ----

const rafId = THREE.global.requestAnimationFrame( function () {} );
assert( 'requestAnimationFrame 返回有效 id(非 noop)', rafId !== undefined && rafId !== null );
THREE.global.cancelAnimationFrame( rafId );

// ---- 3. P1 #5: performance 统一毫秒(真机微秒 / 1000) ----

microNow = MICRO_START + 16000; // 前进 16000 微秒 = 16ms
assert( 'performance.now 真机返回毫秒', Math.abs( THREE.global.performance.now() - 16 ) < 1e-6 );

// ---- 4. Matrix4.invert / getInverse 别名 ----

const m = new THREE.Matrix4().set(
	2, 0, 0, 3,
	0, 4, 0, 5,
	0, 0, 8, 7,
	0, 0, 0, 1
);

const inv = m.clone().invert();
const identity = new THREE.Matrix4().multiplyMatrices( m, inv );
let maxErr = 0;
const ie = identity.elements, ee = new THREE.Matrix4().elements;
for ( let i = 0; i < 16; i ++ ) maxErr = Math.max( maxErr, Math.abs( ie[ i ] - ee[ i ] ) );
assert( 'Matrix4.invert: M * M⁻¹ = I (误差 ' + maxErr.toExponential( 2 ) + ')', maxErr < 1e-12 );

const legacy = new THREE.Matrix4().getInverse( m );
assert( 'Matrix4.getInverse 别名与 invert 等价', legacy.equals( inv ) );

const degenerate = new THREE.Matrix4().set( 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ).invert();
assert( 'Matrix4.invert 退化矩阵置零', degenerate.elements.every( function ( v ) { return v === 0; } ) );

const m3 = new THREE.Matrix3().set( 2, 0, 0, 0, 4, 0, 0, 0, 8 );
const m3inv = m3.clone().invert();
assert( 'Matrix3.invert 正确', Math.abs( m3inv.elements[ 0 ] - 0.5 ) < 1e-12 && Math.abs( m3inv.elements[ 8 ] - 0.125 ) < 1e-12 );
assert( 'Matrix3.getInverse 别名与 invert 等价', new THREE.Matrix3().getInverse( m3 ).equals( m3inv ) );

const normal = new THREE.Matrix3().getNormalMatrix( new THREE.Matrix4().makeScale( 2, 2, 2 ) );
assert( 'Matrix3.getNormalMatrix 正常', Math.abs( normal.elements[ 0 ] - 0.5 ) < 1e-12 );

// ---- 5. Box3 快速扫盒(默认走几何级包围盒, precise 走逐顶点) ----

const geometry = new THREE.BoxBufferGeometry( 2, 2, 2 );
const mesh = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial() );
mesh.position.set( 10, 0, 0 );
mesh.updateMatrixWorld( true );

const fast = new THREE.Box3().setFromObject( mesh );
assert( 'Box3.setFromObject 快速路径结果正确',
	Math.abs( fast.min.x - 9 ) < 1e-12 && Math.abs( fast.max.x - 11 ) < 1e-12 &&
	Math.abs( fast.min.y + 1 ) < 1e-12 && Math.abs( fast.max.y - 1 ) < 1e-12 );

const precise = new THREE.Box3().setFromObject( mesh, true );
assert( 'Box3.setFromObject precise 路径与快速路径一致(轴对齐几何)', precise.equals( fast ) );

// ---- 6. P0 #2: Image addEventListener 映射 ----

// 用独立构造器模拟微信原生 canvas(registerCanvas 会向 constructor.prototype 混入方法,
// 普通对象字面量会污染 Object.prototype, 与真机行为不符)
class FakeCanvas {
	constructor() { this._canvasId = 'smoke-canvas'; }
	createImage() { return {}; }
}
THREE.global.registerCanvas( new FakeCanvas() );

const img = new THREE.global.Image();
let loadFired = false;
img.addEventListener( 'load', function () { loadFired = true; } );
assert( 'Image.addEventListener 映射到 onload', typeof img.onload === 'function' );
img.onload( {} );
assert( 'Image load 回调触发', loadFired );
img.removeEventListener( 'load', function () {} );
assert( 'Image.removeEventListener 不误删他人监听器', typeof img.onload === 'function' );

// ---- 7. P1 #3: removeEventListener off-by-one(index 0 可移除) ----

const listener0 = function () {};
THREE.global.document.addEventListener( 'smoke-evt', listener0 );
THREE.global.document.removeEventListener( 'smoke-evt', listener0 );
let leaked = false;
THREE.global.document.addEventListener( 'smoke-evt', function () { leaked = true; } );
THREE.global.document.dispatchEvent( { type: 'smoke-evt' } );
// listener0 若泄漏不影响本断言, 单独验证 index 0 已被移除:
let called0 = false;
const probe = function () { called0 = true; };
THREE.global.document.addEventListener( 'probe-evt', probe );
THREE.global.document.removeEventListener( 'probe-evt', probe );
THREE.global.document.dispatchEvent( { type: 'probe-evt' } );
assert( 'document.removeEventListener 可移除 index 0 监听器', called0 === false );

// ---- 8. P1 #4: XHR addEventListener 支持多监听器 ----

const xhr = new THREE.global.XMLHttpRequest();
let hits = 0;
xhr.addEventListener( 'load', function () { hits ++; } );
xhr.addEventListener( 'load', function () { hits ++; } );
xhr.dispatchEvent( { type: 'load' } );
assert( 'XHR 同类事件可挂多个监听器', hits === 2 );

// ---- 8b. dispatchEvent 的 this 绑定(DOM 规范: this = currentTarget) ----
// FileLoader 的 load 回调依赖 this.status/this.response, 裸调用会全部 undefined
// 导致 status 200 的成功响应被误判为失败走 onError(2026-07 回归)

const xhr2 = new THREE.global.XMLHttpRequest();
xhr2.status = 200;
let boundStatus = null;
xhr2.addEventListener( 'load', function () { boundStatus = this && this.status; } );
xhr2.dispatchEvent( { type: 'load' } );
assert( 'XHR addEventListener 回调 this 绑定到 XHR 实例', boundStatus === 200 );

let docThisOk = false;
const docProbe = function () { docThisOk = this === THREE.global.document; };
THREE.global.document.addEventListener( 'this-evt', docProbe );
THREE.global.document.dispatchEvent( { type: 'this-evt' } );
THREE.global.document.removeEventListener( 'this-evt', docProbe );
assert( 'document 监听器回调 this 绑定到 document', docThisOk );

// ---- 9. P1 #6: UTF-8 解码回退(无 TextDecoder 时) ----

const savedTextDecoder = global.TextDecoder;
delete global.TextDecoder;
// "汉A𝄞" = 多字节 + ASCII + 四字节(代理对)
const utf8 = new Uint8Array( [ 0xE6, 0xB1, 0x89, 0x41, 0xF0, 0x9D, 0x84, 0x9E ] );
const decoded = THREE.LoaderUtils.decodeText( utf8 );
global.TextDecoder = savedTextDecoder;
assert( 'LoaderUtils.decodeText 纯 JS 回退正确解码多字节', decoded === '汉A\uD834\uDD1E' );

// ---- 10. 阶段二收尾 4.1#2: Ray/Frustum/Sphere r185 数学 ----

// Ray.intersectTriangle watertight: 共享边上的命中不遗漏(旧算法在共享边可能双侧都 miss)
const ray = new THREE.Ray( new THREE.Vector3( 0.5, 0.5, 5 ), new THREE.Vector3( 0, 0, - 1 ) );
const hitA = ray.intersectTriangle(
	new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 1, 0, 0 ), new THREE.Vector3( 1, 1, 0 ),
	false, new THREE.Vector3() );
const hitB = ray.intersectTriangle(
	new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 1, 1, 0 ), new THREE.Vector3( 0, 1, 0 ),
	false, new THREE.Vector3() );
assert( 'Ray.intersectTriangle watertight: 共享对角线命中不遗漏', hitA !== null || hitB !== null );

const hitPlain = ray.intersectTriangle(
	new THREE.Vector3( - 1, - 1, 0 ), new THREE.Vector3( 2, - 1, 0 ), new THREE.Vector3( 0.5, 2, 0 ),
	false, new THREE.Vector3() );
assert( 'Ray.intersectTriangle 常规命中点正确', hitPlain !== null && Math.abs( hitPlain.z ) < 1e-12 &&
	Math.abs( hitPlain.x - 0.5 ) < 1e-12 && Math.abs( hitPlain.y - 0.5 ) < 1e-12 );

const cullBack = ray.intersectTriangle(
	new THREE.Vector3( - 1, - 1, 0 ), new THREE.Vector3( 0.5, 2, 0 ), new THREE.Vector3( 2, - 1, 0 ),
	true, new THREE.Vector3() );
assert( 'Ray.intersectTriangle backfaceCulling 剔除背面', cullBack === null );

// 射线起点在球内: 应返回出射点(而非 null)
const insideHit = new THREE.Ray( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, 1 ) )
	.intersectSphere( new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 2 ), new THREE.Vector3() );
assert( 'Ray.intersectSphere 起点在球内返回出射点', insideHit !== null && Math.abs( insideHit.z - 2 ) < 1e-12 );

const emptySphere = new THREE.Sphere().makeEmpty();
assert( 'Ray.intersectsSphere 空球(radius<0)返回 false',
	new THREE.Ray( new THREE.Vector3(), new THREE.Vector3( 0, 0, 1 ) ).intersectsSphere( emptySphere ) === false );

// Sphere.union / expandByPoint
const sA = new THREE.Sphere( new THREE.Vector3( 0, 0, 0 ), 1 );
sA.union( new THREE.Sphere( new THREE.Vector3( 4, 0, 0 ), 1 ) );
assert( 'Sphere.union 结果包裹两球', Math.abs( sA.center.x - 2 ) < 1e-12 && Math.abs( sA.radius - 3 ) < 1e-12 );

// Frustum: setFromProjectionMatrix 新 API + setFromMatrix 别名
const cam = new THREE.PerspectiveCamera( 60, 1, 1, 100 );
cam.updateMatrixWorld( true );
const projScreen = new THREE.Matrix4().multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );
const fr1 = new THREE.Frustum().setFromProjectionMatrix( projScreen );
const fr2 = new THREE.Frustum().setFromMatrix( projScreen );
assert( 'Frustum.setFromMatrix 别名与 setFromProjectionMatrix 等价',
	fr1.planes.every( function ( p, i ) { return p.normal.equals( fr2.planes[ i ].normal ) && p.constant === fr2.planes[ i ].constant; } ) );
assert( 'Frustum 含视锥内点', fr1.containsPoint( new THREE.Vector3( 0, 0, - 10 ) ) );
assert( 'Frustum 剔除视锥外点', fr1.containsPoint( new THREE.Vector3( 0, 0, 10 ) ) === false );

// Frustum.intersectsObject 消费对象级 boundingSphere(InstancedMesh/BatchedMesh 剔除路径)
const imCull = new THREE.InstancedMesh( new THREE.BoxBufferGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial(), 2 );
imCull.setMatrixAt( 0, new THREE.Matrix4().makeTranslation( 0, 0, - 10 ) );
imCull.setMatrixAt( 1, new THREE.Matrix4().makeTranslation( 0, 0, - 50 ) );
imCull.updateMatrixWorld( true );
assert( 'Frustum.intersectsObject 走对象级 boundingSphere', fr1.intersectsObject( imCull ) === true && imCull.boundingSphere !== null );

// ---- 11. 阶段二收尾 4.1#3: matrixWorldAutoUpdate 脏标记 ----

const parentObj = new THREE.Object3D();
const staticChild = new THREE.Object3D();
parentObj.add( staticChild );
staticChild.position.set( 5, 0, 0 );
staticChild.updateMatrix();
staticChild.matrixAutoUpdate = false;
staticChild.matrixWorldAutoUpdate = false;
staticChild.matrixWorld.identity();
parentObj.updateMatrixWorld( true );
assert( 'matrixWorldAutoUpdate=false 跳过 matrixWorld 重算',
	staticChild.matrixWorld.elements[ 12 ] === 0 );
staticChild.matrixWorldAutoUpdate = true;
parentObj.updateMatrixWorld( true );
assert( 'matrixWorldAutoUpdate=true 恢复正常更新',
	Math.abs( staticChild.matrixWorld.elements[ 12 ] - 5 ) < 1e-12 );
const copied = new THREE.Object3D();
copied.matrixWorldAutoUpdate = false;
assert( 'matrixWorldAutoUpdate 随 copy 传递', copied.clone().matrixWorldAutoUpdate === false );

// ---- 12. 阶段三 4.2#1: InstancedMesh 增强 ----

const imGeo = new THREE.BoxBufferGeometry( 2, 2, 2 );
const im = new THREE.InstancedMesh( imGeo, new THREE.MeshBasicMaterial(), 3 );
im.setMatrixAt( 0, new THREE.Matrix4().makeTranslation( 0, 0, 0 ) );
im.setMatrixAt( 1, new THREE.Matrix4().makeTranslation( 10, 0, 0 ) );
im.setMatrixAt( 2, new THREE.Matrix4().makeTranslation( - 10, 0, 0 ) );

const outM = new THREE.Matrix4();
im.getMatrixAt( 1, outM );
assert( 'InstancedMesh.getMatrixAt 读回矩阵', Math.abs( outM.elements[ 12 ] - 10 ) < 1e-12 );

im.setColorAt( 1, new THREE.Color( 1, 0, 0 ) );
assert( 'InstancedMesh.setColorAt 创建 instanceColor attribute',
	im.instanceColor !== null && im.instanceColor.itemSize === 3 && im.instanceColor.array[ 3 ] === 1 && im.instanceColor.array[ 4 ] === 0 );
const outC = new THREE.Color();
im.getColorAt( 0, outC );
assert( 'InstancedMesh.getColorAt 未设置的实例返回白色', outC.r === 1 && outC.g === 1 && outC.b === 1 );

im.computeBoundingBox();
assert( 'InstancedMesh.computeBoundingBox 覆盖全部实例',
	Math.abs( im.boundingBox.min.x + 11 ) < 1e-12 && Math.abs( im.boundingBox.max.x - 11 ) < 1e-12 );
im.computeBoundingSphere();
assert( 'InstancedMesh.computeBoundingSphere 覆盖全部实例', im.boundingSphere.radius >= 11 );

im.updateMatrixWorld( true );
const rc = new THREE.Raycaster( new THREE.Vector3( 10, 0, 5 ), new THREE.Vector3( 0, 0, - 1 ) );
const imHits = rc.intersectObject( im );
assert( 'InstancedMesh.raycast 命中并回填 instanceId',
	imHits.length > 0 && imHits[ 0 ].instanceId === 1 && imHits[ 0 ].object === im );

const imCopy = im.clone();
assert( 'InstancedMesh.copy 保留 instanceColor/count', imCopy.count === 3 && imCopy.instanceColor !== null );

// ---- 13. 阶段三 4.2#2: BatchedMesh GL1 版(JS 逻辑层) ----

assert( 'THREE.BatchedMesh 已导出', typeof THREE.BatchedMesh === 'function' );

const bmBox = new THREE.BoxBufferGeometry( 2, 2, 2 );
const bmSphereGeo = new THREE.SphereBufferGeometry( 1, 8, 8 );
const bm = new THREE.BatchedMesh( 10, 4000, 8000, new THREE.MeshPhongMaterial() );

const gidBox = bm.addGeometry( bmBox );
const gidSphere = bm.addGeometry( bmSphereGeo );
const iid0 = bm.addInstance( gidBox );
const iid1 = bm.addInstance( gidBox );
const iid2 = bm.addInstance( gidSphere );

bm.setMatrixAt( iid0, new THREE.Matrix4().makeTranslation( 0, 0, 0 ) );
bm.setMatrixAt( iid1, new THREE.Matrix4().makeTranslation( 10, 0, 0 ) );
bm.setMatrixAt( iid2, new THREE.Matrix4().makeTranslation( - 10, 0, 0 ) );
bm.setColorAt( iid1, new THREE.Color( 0, 1, 0 ) );

assert( 'BatchedMesh 实例计数正确', bm.instanceCount === 3 && bm.maxInstanceCount === 10 );
assert( 'BatchedMesh 矩阵纹理为 float RGBA(GL1 编码)',
	bm._matricesTexture.image.data instanceof Float32Array && bm._indirectTexture.image.data instanceof Float32Array );
assert( 'BatchedMesh 纹理尺寸为 2 的幂(GL1 NPOT 规避)',
	( bm._matricesTexture.image.width & ( bm._matricesTexture.image.width - 1 ) ) === 0 );

const bmM = new THREE.Matrix4();
bm.getMatrixAt( iid1, bmM );
assert( 'BatchedMesh.getMatrixAt 读回矩阵', Math.abs( bmM.elements[ 12 ] - 10 ) < 1e-12 );

const bmC = new THREE.Color();
bm.getColorAt( iid1, bmC );
assert( 'BatchedMesh.setColorAt/getColorAt', bmC.g === 1 && bmC.r === 0 );

bm.computeBoundingBox();
assert( 'BatchedMesh.computeBoundingBox 覆盖全部实例',
	bm.boundingBox.min.x < - 10 && bm.boundingBox.max.x > 10 );

bm.updateMatrixWorld( true );
const bmRc = new THREE.Raycaster( new THREE.Vector3( 10, 0, 5 ), new THREE.Vector3( 0, 0, - 1 ) );
const bmHits = bmRc.intersectObject( bm );
assert( 'BatchedMesh.raycast 命中并回填 batchId',
	bmHits.length > 0 && bmHits[ 0 ].batchId === iid1 && bmHits[ 0 ].object === bm );

// onBeforeRender: 剔除 + 排序 + 间接索引写入(渲染前逐帧准备)
bm.setVisibleAt( iid2, false );
bm.onBeforeRender( null, null, cam, bm.geometry, bm.material );
assert( 'BatchedMesh.onBeforeRender 可见性过滤生效(2/3 可见 + 视锥剔除)',
	bm._multiDrawCount <= 2 && bm._multiDrawCount >= 0 );

bm.setVisibleAt( iid2, true );
bm.perObjectFrustumCulled = false;
bm.sortObjects = false;
bm._visibilityChanged = true;
bm.onBeforeRender( null, null, cam, bm.geometry, bm.material );
assert( 'BatchedMesh.onBeforeRender 无剔除时全部可见段入列', bm._multiDrawCount === 3 );
assert( 'BatchedMesh 间接索引写入 float 纹理 .r 通道',
	bm._indirectTexture.image.data[ 0 * 4 ] === 0 && bm._indirectTexture.image.data[ 1 * 4 ] === 1 && bm._indirectTexture.image.data[ 2 * 4 ] === 2 );

bm.deleteInstance( iid1 );
assert( 'BatchedMesh.deleteInstance 后实例计数减一', bm.instanceCount === 2 );

// ---- 14. capabilities 新增 multiDraw 探测项 ----

const fakeGL = {
	getExtension: function ( name ) {

		return ( name === 'ANGLE_instanced_arrays' || name === 'WEBGL_multi_draw' ) ? {} : null;

	},
	getParameter: function () { return 8; },
	MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660
};
const caps = THREE.global.detectCapabilities( fakeGL );
assert( 'detectCapabilities 返回 multiDraw 探测项', caps.multiDraw === true && caps.instancing === true && caps.floatTexture === false );

// ---- 15. capabilities 增强: compressedFormats / halfFloatRenderable / elementIndexUint ----

assert( 'detectCapabilities 无扩展时 compressedFormats 全 false',
	caps.compressedFormats !== undefined &&
	caps.compressedFormats.etc1 === false && caps.compressedFormats.etc2 === false &&
	caps.compressedFormats.astc === false && caps.compressedFormats.pvrtc === false &&
	caps.compressedFormats.s3tc === false );
assert( 'detectCapabilities 无 half float 扩展时 halfFloatRenderable=false', caps.halfFloatRenderable === false );
assert( 'detectCapabilities 无扩展时 elementIndexUint=false', caps.elementIndexUint === false );

// half float 可渲染: 声明扩展 + FBO 实测通过(借鉴 Cocos "声明支持 ≠ 可渲染")
const fakeGL2 = {
	FLOAT: 5126,
	TEXTURE_2D: 3553,
	RGBA: 6408,
	FRAMEBUFFER: 36160,
	COLOR_ATTACHMENT0: 36064,
	FRAMEBUFFER_COMPLETE: 36053,
	MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
	_lastTexImageType: null,
	getExtension: function ( name ) {

		if ( name === 'OES_texture_half_float' ) return { HALF_FLOAT_OES: 36193 };
		if ( name === 'OES_texture_float' || name === 'OES_element_index_uint' ) return {};
		if ( name === 'WEBGL_compressed_texture_etc1' || name === 'WEBGL_compressed_texture_astc' ) return {};
		return null;

	},
	getParameter: function () { return 8; },
	createTexture: function () { return {}; },
	bindTexture: function () {},
	texImage2D: function ( target, level, internalFormat, w, h, border, format, type ) { this._lastTexImageType = type; },
	createFramebuffer: function () { return {}; },
	bindFramebuffer: function () {},
	framebufferTexture2D: function () {},
	// float 可渲染, half float(36193) 不可渲染 —— 断言两者独立探测
	checkFramebufferStatus: function () { return this._lastTexImageType === 36193 ? 0 : this.FRAMEBUFFER_COMPLETE; },
	deleteFramebuffer: function () {},
	deleteTexture: function () {}
};
const caps2 = THREE.global.detectCapabilities( fakeGL2 );
assert( 'detectCapabilities float 可渲染 FBO 实测通过', caps2.floatRenderable === true );
assert( 'detectCapabilities half float 声明支持但 FBO 实测不可渲染', caps2.halfFloatTexture === true && caps2.halfFloatRenderable === false );
assert( 'detectCapabilities elementIndexUint 探测', caps2.elementIndexUint === true );
assert( 'detectCapabilities compressedFormats 逐项枚举',
	caps2.compressedFormats.etc1 === true && caps2.compressedFormats.astc === true &&
	caps2.compressedFormats.etc2 === false && caps2.compressedFormats.pvrtc === false && caps2.compressedFormats.s3tc === false );
assert( 'detectCapabilities 同一上下文结果缓存', THREE.global.detectCapabilities( fakeGL2 ) === caps2 );

// ---- 16. Additive 动画混合(升级差距分析说明 3.0 §2.1) ----

assert( '常量 NormalAnimationBlendMode = 2500', THREE.NormalAnimationBlendMode === 2500 );
assert( '常量 AdditiveAnimationBlendMode = 2501', THREE.AdditiveAnimationBlendMode === 2501 );
assert( 'Quaternion.multiplyQuaternionsFlat 已导出', typeof THREE.Quaternion.multiplyQuaternionsFlat === 'function' );
assert( 'AnimationUtils.makeClipAdditive 已导出', typeof THREE.AnimationUtils.makeClipAdditive === 'function' );
assert( 'AnimationUtils.arraySlice 保留(r110 KeyframeTrack 消费)', typeof THREE.AnimationUtils.arraySlice === 'function' );

// multiplyQuaternionsFlat 与 Quaternion.multiply 对拍
( function () {

	const qa = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 0, 1 ), Math.PI / 3 );
	const qb = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), Math.PI / 5 );
	const expected = qa.clone().multiply( qb );

	const flat = new Float64Array( 12 );
	qa.toArray( flat, 0 );
	qb.toArray( flat, 4 );
	THREE.Quaternion.multiplyQuaternionsFlat( flat, 8, flat, 0, flat, 4 );

	assert( 'multiplyQuaternionsFlat 与 multiply 逐位一致',
		flat[ 8 ] === expected.x && flat[ 9 ] === expected.y && flat[ 10 ] === expected.z && flat[ 11 ] === expected.w );

} )();

// 16.1 Normal 双 clip 混合结果与旧版语义逐位一致(加权平均 + 原值补权)
( function () {

	const node = new THREE.Object3D();
	const mixer = new THREE.AnimationMixer( node );

	const trackA = new THREE.VectorKeyframeTrack( '.position', [ 0, 1 ], [ 1, 0, 0, 1, 0, 0 ] );
	const trackB = new THREE.VectorKeyframeTrack( '.position', [ 0, 1 ], [ 0, 1, 0, 0, 1, 0 ] );
	const clipA = new THREE.AnimationClip( 'A', 1, [ trackA ] );
	const clipB = new THREE.AnimationClip( 'B', 1, [ trackB ] );

	const actionA = mixer.clipAction( clipA ).setEffectiveWeight( 0.25 ).play();
	const actionB = mixer.clipAction( clipB ).setEffectiveWeight( 0.75 ).play();
	mixer.update( 0.5 );

	// 权重和 = 1: 期望 position = A*0.25 + B*0.75 = (0.25, 0.75, 0), 无原值参与
	assert( 'Normal 双 clip 混合逐位一致(0.25/0.75 加权)',
		node.position.x === 0.25 && node.position.y === 0.75 && node.position.z === 0 );

	actionA.stop(); actionB.stop();

	// 权重和 < 1: 原值补权 accu*w + orig*(1-w)
	node.position.set( 8, 0, 0 );
	const actionA2 = mixer.clipAction( clipA ).setEffectiveWeight( 0.5 ).play();
	mixer.update( 0.01 );
	assert( 'Normal 单 clip 半权重与原值补权一致(8*0.5 + 1*0.5)',
		node.position.x === 4.5 && node.position.y === 0 && node.position.z === 0 );
	actionA2.stop();

} )();

// 16.2 additive clip 叠加 = 手算期望
( function () {

	const node = new THREE.Object3D();
	const mixer = new THREE.AnimationMixer( node );

	// 基础层: 恒定位置 (10, 20, 30)
	const baseTrack = new THREE.VectorKeyframeTrack( '.position', [ 0, 1 ], [ 10, 20, 30, 10, 20, 30 ] );
	const baseClip = new THREE.AnimationClip( 'base', 1, [ baseTrack ] );

	// 叠加层: 从 (1,1,1) 到 (3,1,1), 参考帧 0 -> 差值 clip 为 (0,0,0) 到 (2,0,0)
	const addTrack = new THREE.VectorKeyframeTrack( '.position', [ 0, 1 ], [ 1, 1, 1, 3, 1, 1 ] );
	const addClip = new THREE.AnimationClip( 'breathe', 1, [ addTrack ] );
	THREE.AnimationUtils.makeClipAdditive( addClip );

	assert( 'makeClipAdditive 置 blendMode 为 Additive', addClip.blendMode === THREE.AdditiveAnimationBlendMode );
	assert( 'makeClipAdditive 差值化(首帧减参考值)',
		addClip.tracks[ 0 ].values[ 0 ] === 0 && addClip.tracks[ 0 ].values[ 3 ] === 2 );

	const baseAction = mixer.clipAction( baseClip ).play();
	const addAction = mixer.clipAction( addClip, undefined, THREE.AdditiveAnimationBlendMode ).play();

	assert( 'clipAction 第三参 blendMode 透传', addAction.blendMode === THREE.AdditiveAnimationBlendMode );

	// t=0.5: 基础 (10,20,30) + 差值 (1,0,0) = (11,20,30)
	mixer.update( 0.5 );
	assert( 'additive 叠加 = 基础 + 差值(手算期望 11,20,30)',
		node.position.x === 11 && node.position.y === 20 && node.position.z === 30 );

	baseAction.stop(); addAction.stop();

} )();

// 16.3 additive 四元数叠加(基础 identity + 叠加 rotZ 90°)
( function () {

	const node = new THREE.Object3D();
	const mixer = new THREE.AnimationMixer( node );

	const qId = new THREE.Quaternion();
	const qRot = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 0, 1 ), Math.PI / 2 );

	const baseTrack = new THREE.QuaternionKeyframeTrack( '.quaternion', [ 0, 1 ],
		[ qId.x, qId.y, qId.z, qId.w, qId.x, qId.y, qId.z, qId.w ] );
	const baseClip = new THREE.AnimationClip( 'idle', 1, [ baseTrack ] );

	const addTrack = new THREE.QuaternionKeyframeTrack( '.quaternion', [ 0, 1 ],
		[ qRot.x, qRot.y, qRot.z, qRot.w, qRot.x, qRot.y, qRot.z, qRot.w ] );
	const addClip = new THREE.AnimationClip( 'aim', 1, [ addTrack ] );
	// 参考 clip 用恒 identity 的 baseClip 结构: 参考帧值即 identity, 差值 = qRot 本身
	THREE.AnimationUtils.makeClipAdditive( addClip, 0, new THREE.AnimationClip( 'ref', 1, [ new THREE.QuaternionKeyframeTrack( '.quaternion', [ 0, 1 ], [ qId.x, qId.y, qId.z, qId.w, qId.x, qId.y, qId.z, qId.w ] ) ] ) );

	mixer.clipAction( baseClip ).play();
	mixer.clipAction( addClip, undefined, THREE.AdditiveAnimationBlendMode ).play();
	mixer.update( 0.25 );

	const err = Math.abs( node.quaternion.x - qRot.x ) + Math.abs( node.quaternion.y - qRot.y ) +
		Math.abs( node.quaternion.z - qRot.z ) + Math.abs( node.quaternion.w - qRot.w );
	assert( 'additive 四元数叠加 identity ∘ rotZ90 = rotZ90 (误差 ' + err.toExponential( 2 ) + ')', err < 1e-12 );

} )();

// 16.4 AnimationUtils.subclip 裁剪
( function () {

	const track = new THREE.NumberKeyframeTrack( '.morphTargetInfluences[a]', [ 0, 1, 2, 3 ], [ 0, 10, 20, 30 ] );
	const clip = new THREE.AnimationClip( 'full', - 1, [ track ] );
	const sub = THREE.AnimationUtils.subclip( clip, 'part', 1, 3, 1 );

	assert( 'subclip 裁剪帧区间且时间归零',
		sub.name === 'part' && sub.tracks[ 0 ].times.length === 2 &&
		sub.tracks[ 0 ].times[ 0 ] === 0 && sub.tracks[ 0 ].values[ 0 ] === 10 && sub.tracks[ 0 ].values[ 1 ] === 20 );

} )();

// ---- 17. ColorManagement(升级差距分析说明 3.0 §2.2) ----

assert( 'ColorManagement 已导出且默认关闭(与官方刻意分歧)',
	THREE.ColorManagement !== undefined && THREE.ColorManagement.enabled === false );

// 17.1 enabled=false: 全部入口行为与 r110 逐位一致
( function () {

	const c = new THREE.Color( 0x808080 );
	assert( 'enabled=false: setHex 不做转换(0x808080 -> 128/255)',
		c.r === 128 / 255 && c.g === 128 / 255 && c.b === 128 / 255 );
	assert( 'enabled=false: getHex 往返逐位一致', c.getHex() === 0x808080 );
	assert( 'enabled=false: getStyle 与旧版一致', c.getStyle() === 'rgb(128,128,128)' );

	const cs = new THREE.Color().setStyle( '#ff8000' );
	assert( 'enabled=false: setStyle 十六进制不做转换', cs.r === 1 && cs.g === 128 / 255 && cs.b === 0 );

	const hsl = new THREE.Color().setHSL( 0.5, 0.5, 0.5 ).getHSL( {} );
	assert( 'enabled=false: setHSL/getHSL 往返一致',
		Math.abs( hsl.h - 0.5 ) < 1e-12 && Math.abs( hsl.s - 0.5 ) < 1e-12 && Math.abs( hsl.l - 0.5 ) < 1e-12 );

} )();

// 17.2 enabled=true: sRGB→linear 工作流
( function () {

	THREE.ColorManagement.enabled = true;

	const c = new THREE.Color( 0x808080 );
	// sRGB 0.50196 linear 化 ≈ 0.2158(设计文档验收值)
	assert( 'enabled=true: new Color(0x808080) 内部值 ≈ 0.2158 (实测 ' + c.r.toFixed( 4 ) + ')',
		Math.abs( c.r - 0.2158 ) < 1e-3 );
	assert( 'enabled=true: getHex 反向转换回 sRGB', c.getHex() === 0x808080 );

	const cRGB = new THREE.Color().setRGB( 0.5, 0.5, 0.5 );
	assert( 'enabled=true: setRGB 默认按 working(linear) 不转换', cRGB.r === 0.5 );

	const cSrgb = new THREE.Color().setRGB( 0.5, 0.5, 0.5, THREE.SRGBColorSpace );
	assert( 'enabled=true: setRGB 显式 sRGB 时做 linear 化', Math.abs( cSrgb.r - 0.2140 ) < 1e-3 );

	THREE.ColorManagement.enabled = false;

	const cAfter = new THREE.Color( 0x808080 );
	assert( '恢复 enabled=false 后行为回到 r110', cAfter.r === 128 / 255 );

} )();

// ---- 18. Raycaster 小改进(升级差距分析说明 3.0 §2.5) ----

( function () {

	const boxMesh = new THREE.Mesh( new THREE.BoxBufferGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial() );
	boxMesh.updateMatrixWorld( true );
	const ray = new THREE.Raycaster( new THREE.Vector3( 0, 0, 5 ), new THREE.Vector3( 0, 0, - 1 ) );

	assert( 'Raycaster.layers 存在', ray.layers !== undefined && typeof ray.layers.test === 'function' );
	assert( 'params.Line.threshold 默认 1', ray.params.Line.threshold === 1 );

	// 刻意分歧 #3: raycaster.layers 默认全通(r110「拾取不看 layers」语义,
	// LDrawBatchedPartStore 的隐藏图层拾取依赖此行为)
	assert( '默认层对象可命中', ray.intersectObject( boxMesh ).length > 0 );
	boxMesh.layers.set( 30 );
	assert( '默认全通: 对象切隐藏图层仍可拾取(r110 语义)', ray.intersectObject( boxMesh ).length > 0 );

	// 显式收窄 raycaster.layers 后过滤生效(r185 官方语义, opt-in)
	ray.layers.set( 0 );
	assert( '显式 layers.set(0) 后隐藏图层对象被过滤', ray.intersectObject( boxMesh ).length === 0 );
	ray.layers.enable( 30 );
	assert( 'raycaster.layers.enable 后恢复命中', ray.intersectObject( boxMesh ).length > 0 );
	boxMesh.layers.set( 0 );
	ray.layers.enableAll();

	// 刻意分歧 #1: recursive 默认 false(r110 语义)
	const parent = new THREE.Object3D();
	const child = new THREE.Mesh( new THREE.BoxBufferGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial() );
	parent.add( child );
	parent.updateMatrixWorld( true );
	assert( 'recursive 默认 false(不查子树, r110 语义)', ray.intersectObject( parent ).length === 0 );
	assert( 'recursive=true 时命中子对象', ray.intersectObject( parent, true ).length > 0 );

	// 刻意分歧 #2: visible=false 跳过(r110 语义)
	child.visible = false;
	assert( 'visible=false 对象跳过(r110 语义保留)', ray.intersectObject( parent, true ).length === 0 );
	child.visible = true;

	// Line.threshold 生效: 离线 0.5 世界单位的射线, 默认阈值 1 可命中, 收紧到 0.1 不可命中
	const lineGeom = new THREE.BufferGeometry();
	lineGeom.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ - 1, 0.5, 0, 1, 0.5, 0 ] ), 3 ) );
	const line = new THREE.Line( lineGeom, new THREE.LineBasicMaterial() );
	line.updateMatrixWorld( true );

	const rayLine = new THREE.Raycaster( new THREE.Vector3( 0, 0, 5 ), new THREE.Vector3( 0, 0, - 1 ) );
	assert( 'Line 默认阈值 1 命中(距线 0.5)', rayLine.intersectObject( line ).length > 0 );
	rayLine.params.Line.threshold = 0.1;
	assert( 'params.Line.threshold=0.1 时不命中', rayLine.intersectObject( line ).length === 0 );

} )();

// ---- 结果 ----

THREE.global.clearCanvas();

if ( failures > 0 ) {

	console.error( '\n冒烟测试失败: ' + failures + ' 项' );
	process.exit( 1 );

}

console.log( '\n冒烟测试全部通过' );
