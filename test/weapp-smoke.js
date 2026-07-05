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

// ---- 9. P1 #6: UTF-8 解码回退(无 TextDecoder 时) ----

const savedTextDecoder = global.TextDecoder;
delete global.TextDecoder;
// "汉A𝄞" = 多字节 + ASCII + 四字节(代理对)
const utf8 = new Uint8Array( [ 0xE6, 0xB1, 0x89, 0x41, 0xF0, 0x9D, 0x84, 0x9E ] );
const decoded = THREE.LoaderUtils.decodeText( utf8 );
global.TextDecoder = savedTextDecoder;
assert( 'LoaderUtils.decodeText 纯 JS 回退正确解码多字节', decoded === '汉A\uD834\uDD1E' );

// ---- 结果 ----

THREE.global.clearCanvas();

if ( failures > 0 ) {

	console.error( '\n冒烟测试失败: ' + failures + ' 项' );
	process.exit( 1 );

}

console.log( '\n冒烟测试全部通过' );
