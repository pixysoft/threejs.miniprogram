/**
 * examples/jsm 模块冒烟测试(Node 环境 + wx stub)
 * 用法: node test/jsm-smoke.js
 * 覆盖: BufferGeometryUtils r185 版(mergeGeometries/mergeVertices/toCreasedNormals/兼容别名)、
 *       CCDIKSolver r185 版(骨骼链迭代逼近目标)
 *
 * 加载方式说明: examples/jsm 为 ESM(import build/three.module.js), 本仓库 package.json
 * 无 "type": "module", Node 无法直接 import; 这里按 weapp 实际形态加载——读入源码、
 * 剥离 import/export、以 build/three.weapp.js 的同名导出注入求值(与业务侧把 jsm 文件
 * 拷入分包后改 import 指向 three.weapp.js 的消费方式等价)。
 */

'use strict';

const fs = require( 'fs' );
const path = require( 'path' );

let failures = 0;

function assert( name, condition ) {

	if ( condition ) {

		console.log( '  ok  ' + name );

	} else {

		failures ++;
		console.error( 'FAIL  ' + name );

	}

}

// ---- wx stub(与 test/weapp-smoke.js 一致) ----

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
		return { now() { return 0; } };
	},
	getFileSystemManager() {
		return { readFile( options ) { options.fail( { errMsg: 'stub' } ); } };
	},
	request() {}
};

const THREE = require( '../build/three.weapp.js' );

/**
 * 加载一个 examples/jsm 模块: 剥离 import/export, 注入 THREE 命名导出后求值。
 * @param {string} relPath - 相对仓库根的模块路径
 * @param {Array<string>} returnNames - 需要从模块中取回的顶层标识符
 * @returns {Object} 以 returnNames 为 key 的导出对象
 */
function loadJsmModule( relPath, returnNames ) {

	const file = path.join( __dirname, '..', relPath );
	let src = fs.readFileSync( file, 'utf8' );

	// 收集并剥离 import 声明(仅支持 named import, jsm 模块均为此形态;
	// ^ 锚定行首, 避免误匹配 JSDoc 注释里的 @three_import 示例)
	const importedNames = [];
	src = src.replace( /^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?/gm, function ( _, names ) {

		names.split( ',' ).forEach( function ( n ) {

			const name = n.trim();
			if ( name ) importedNames.push( name.split( /\s+as\s+/ ).pop() );

		} );
		return '';

	} );

	// 剥离所有 export 声明
	src = src.replace( /export\s*\{[^}]*\};?/g, '' );
	src = src.replace( /export\s+(class|function|const|let|var)\s/g, '$1 ' );

	const factory = new Function(
		importedNames.join( ',' ),
		'"use strict";\n' + src + '\nreturn { ' + returnNames.join( ', ' ) + ' };'
	);

	const args = importedNames.map( function ( name ) {

		if ( ! ( name in THREE ) ) throw new Error( 'three.weapp.js 缺少 jsm 依赖的导出: ' + name );
		return THREE[ name ];

	} );

	return factory.apply( null, args );

}

// ============================================================
// 1. BufferGeometryUtils (升级差距分析说明 3.0 §2.4)
// ============================================================

const BGU = loadJsmModule( 'examples/jsm/utils/BufferGeometryUtils.js', [
	'BufferGeometryUtils', 'mergeGeometries', 'mergeBufferGeometries',
	'mergeAttributes', 'mergeBufferAttributes', 'mergeVertices', 'toCreasedNormals',
	'interleaveAttributes', 'estimateBytesUsed', 'computeTangents', 'toTrianglesDrawMode'
] );

console.log( '\n---- BufferGeometryUtils ----' );

// 1.1 导出面: 新函数名 + r110 兼容别名 + 命名空间对象
assert( 'mergeGeometries 导出为函数', typeof BGU.mergeGeometries === 'function' );
assert( '兼容别名 mergeBufferGeometries === mergeGeometries', BGU.mergeBufferGeometries === BGU.mergeGeometries );
assert( '兼容别名 mergeBufferAttributes === mergeAttributes', BGU.mergeBufferAttributes === BGU.mergeAttributes );
assert( '命名空间对象 BufferGeometryUtils.mergeBufferGeometries 可用',
	BGU.BufferGeometryUtils.mergeBufferGeometries === BGU.mergeGeometries );
assert( 'r110 保留函数 computeTangents 存在', typeof BGU.computeTangents === 'function' );
assert( '刻意裁剪: computeMikkTSpaceTangents 不导出', BGU.BufferGeometryUtils.computeMikkTSpaceTangents === undefined );

// 1.2 mergeGeometries 非索引几何
const g1 = new THREE.BufferGeometry();
g1.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 1, 2, 3 ] ), 1, false ) );
const g2 = new THREE.BufferGeometry();
g2.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 4, 5, 6 ] ), 1, false ) );

const mergedBasic = BGU.mergeGeometries( [ g1, g2 ] );
assert( 'mergeGeometries 非索引: 属性拼接',
	mergedBasic !== null &&
	Array.from( mergedBasic.attributes.position.array ).join() === '1,2,3,4,5,6' &&
	mergedBasic.attributes.position.itemSize === 1 );

// 1.3 mergeGeometries 索引几何 + useGroups
const gi1 = new THREE.BufferGeometry();
gi1.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ), 3, false ) );
gi1.setIndex( new THREE.BufferAttribute( new Uint16Array( [ 0, 1, 2, 2, 1, 0 ] ), 1, false ) );
const gi2 = new THREE.BufferGeometry();
gi2.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 2, 0, 0, 3, 0, 0, 2, 1, 0 ] ), 3, false ) );
gi2.setIndex( new THREE.BufferAttribute( new Uint16Array( [ 0, 1, 2 ] ), 1, false ) );

const mergedIndexed = BGU.mergeGeometries( [ gi1, gi2 ], true );
assert( 'mergeGeometries 索引: 索引偏移正确',
	mergedIndexed !== null &&
	Array.from( mergedIndexed.index.array ).join() === '0,1,2,2,1,0,3,4,5' );
assert( 'mergeGeometries useGroups: 分组区间正确',
	mergedIndexed.groups.length === 2 &&
	mergedIndexed.groups[ 0 ].start === 0 && mergedIndexed.groups[ 0 ].count === 6 &&
	mergedIndexed.groups[ 1 ].start === 6 && mergedIndexed.groups[ 1 ].count === 3 );

// 1.4 r185 修复语义: 属性不一致时显式失败返回 null(r110 为静默产出错误几何)
const gBad = new THREE.BufferGeometry();
gBad.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 0 ] ), 3, false ) );
gBad.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( [ 0, 0 ] ), 2, false ) );
const origError = console.error;
console.error = function () {};
const mergedBad = BGU.mergeGeometries( [ gi1, gBad ] );
const mergedMixedIndex = BGU.mergeGeometries( [ gi1, g1 ] );
console.error = origError;
assert( 'mergeGeometries 属性集不一致显式返回 null', mergedBad === null );
assert( 'mergeGeometries 索引/非索引混合显式返回 null', mergedMixedIndex === null );

// 1.5 与 BoxBufferGeometry 组合场景: 合并后三角形总数守恒
const boxA = new THREE.BoxBufferGeometry( 1, 1, 1 );
const boxB = new THREE.BoxBufferGeometry( 2, 2, 2 );
boxB.applyMatrix4
	? boxB.applyMatrix4( new THREE.Matrix4().makeTranslation( 5, 0, 0 ) )
	: boxB.applyMatrix( new THREE.Matrix4().makeTranslation( 5, 0, 0 ) );
const mergedBoxes = BGU.mergeGeometries( [ boxA, boxB ] );
assert( 'mergeGeometries 三角形总数守恒(2 个 box)',
	mergedBoxes.index.count === boxA.index.count + boxB.index.count &&
	mergedBoxes.attributes.position.count === boxA.attributes.position.count + boxB.attributes.position.count );

// 1.6 mergeVertices: box 非索引化后 36 顶点焊接回 24(逐面法线不同, 8 角点不可焊)
const boxNonIndexed = new THREE.BoxBufferGeometry( 1, 1, 1 ).toNonIndexed();
const welded = BGU.mergeVertices( boxNonIndexed );
assert( 'mergeVertices 焊接顶点(36 -> 24, 法线区分面)',
	boxNonIndexed.attributes.position.count === 36 &&
	welded.attributes.position.count === 24 &&
	welded.index.count === 36 );

// 1.7 mergeVertices 后拾取不变(设计文档验收: raycast 命中距离一致)
const meshBefore = new THREE.Mesh( boxNonIndexed, new THREE.MeshBasicMaterial() );
const meshAfter = new THREE.Mesh( welded, new THREE.MeshBasicMaterial() );
meshBefore.updateMatrixWorld( true );
meshAfter.updateMatrixWorld( true );
const ray = new THREE.Raycaster( new THREE.Vector3( 0.1, 0.2, 5 ), new THREE.Vector3( 0, 0, - 1 ) );
const hitBefore = ray.intersectObject( meshBefore );
const hitAfter = ray.intersectObject( meshAfter );
assert( 'mergeVertices 前后 raycast 命中距离一致',
	hitBefore.length > 0 && hitAfter.length > 0 &&
	Math.abs( hitBefore[ 0 ].distance - hitAfter[ 0 ].distance ) < 1e-6 );

// 1.8 toCreasedNormals: 立方体直角边(90° > 60° 阈值)保持硬边, 法线为面法线
const creased = BGU.toCreasedNormals( new THREE.BoxBufferGeometry( 1, 1, 1 ).toNonIndexed(), Math.PI / 3 );
const nAttr = creased.attributes.normal;
let creasedHard = true;
for ( let i = 0; i < nAttr.count; i ++ ) {

	// 每个顶点法线应恰为坐标轴方向(硬边未被平均)
	const x = Math.abs( nAttr.getX( i ) ), y = Math.abs( nAttr.getY( i ) ), z = Math.abs( nAttr.getZ( i ) );
	if ( Math.abs( x + y + z - 1 ) > 1e-6 || ( x !== 1 && y !== 1 && z !== 1 ) ) creasedHard = false;

}
assert( 'toCreasedNormals 立方体硬边法线保持', creasedHard );

// 1.9 toCreasedNormals: 阈值放宽到 180° 时全部平滑(顶点法线被平均)
const creasedSmooth = BGU.toCreasedNormals( new THREE.BoxBufferGeometry( 1, 1, 1 ).toNonIndexed(), Math.PI );
const nSmooth = creasedSmooth.attributes.normal;
let anySmoothed = false;
for ( let i = 0; i < nSmooth.count; i ++ ) {

	const x = Math.abs( nSmooth.getX( i ) ), y = Math.abs( nSmooth.getY( i ) ), z = Math.abs( nSmooth.getZ( i ) );
	if ( x > 0 && y > 0 && z > 0 ) anySmoothed = true;

}
assert( 'toCreasedNormals 大阈值时法线被平滑', anySmoothed );

// 1.10 interleaveAttributes 往返
const ia = new THREE.BufferAttribute( new Float32Array( [ 1, 2, 3, 4, 5, 6 ] ), 3, false );
const ib = new THREE.BufferAttribute( new Float32Array( [ 7, 8, 9, 10 ] ), 2, false );
const interleaved = BGU.interleaveAttributes( [ ia, ib ] );
assert( 'interleaveAttributes 数据往返一致',
	interleaved !== null &&
	interleaved[ 0 ].getX( 1 ) === 4 && interleaved[ 0 ].getZ( 1 ) === 6 &&
	interleaved[ 1 ].getX( 0 ) === 7 && interleaved[ 1 ].getY( 1 ) === 10 );

// 1.11 mergeAttributes 含 interleaved 输入(r110 适配分支: getX 系列替代 getComponent)
const mergedWithInterleaved = BGU.mergeAttributes( [ ia, ia ] );
assert( 'mergeAttributes 普通输入拼接正确',
	Array.from( mergedWithInterleaved.array ).join() === '1,2,3,4,5,6,1,2,3,4,5,6' );
const mergedInterleavedIn = BGU.mergeAttributes( [ ia, interleaved[ 0 ] ] );
assert( 'mergeAttributes interleaved 输入走 getX 系列分支',
	mergedInterleavedIn !== null &&
	Array.from( mergedInterleavedIn.array ).join() === '1,2,3,4,5,6,1,2,3,4,5,6' );

// 1.12 estimateBytesUsed
assert( 'estimateBytesUsed 计数正确',
	BGU.estimateBytesUsed( gi1 ) === 9 * 4 + 6 * 2 );

// ============================================================
// 2. CCDIKSolver (升级差距分析说明 3.0 §2.3)
// ============================================================

const IK = loadJsmModule( 'examples/jsm/animation/CCDIKSolver.js', [ 'CCDIKSolver', 'CCDIKHelper' ] );

console.log( '\n---- CCDIKSolver ----' );

assert( 'CCDIKSolver/CCDIKHelper 导出', typeof IK.CCDIKSolver === 'function' && typeof IK.CCDIKHelper === 'function' );

/**
 * 构造固定骨骼链: b0(原点) - b1(+y1) - b2(+y1, effector), target 挂根部
 * @param {Array<number>} targetPos - 目标骨骼位置 [x, y, z]
 * @returns {{mesh: THREE.SkinnedMesh, bones: Array<THREE.Bone>}}
 */
function createIKRig( targetPos ) {

	const b0 = new THREE.Bone();
	const b1 = new THREE.Bone();
	const b2 = new THREE.Bone();
	const targetBone = new THREE.Bone();

	b1.position.y = 1;
	b2.position.y = 1;
	b0.add( b1 );
	b1.add( b2 );
	targetBone.position.set( targetPos[ 0 ], targetPos[ 1 ], targetPos[ 2 ] );

	const mesh = new THREE.SkinnedMesh( new THREE.BufferGeometry(), new THREE.MeshBasicMaterial() );
	mesh.add( b0 );
	mesh.add( targetBone );
	mesh.bind( new THREE.Skeleton( [ b0, b1, b2, targetBone ] ) );
	mesh.updateMatrixWorld( true );

	return { mesh: mesh, bones: [ b0, b1, b2, targetBone ] };

}

// 2.1 骨骼链迭代逼近目标: 目标 (1.2, 1.2, 0), 链长 2, 可达
( function () {

	const rig = createIKRig( [ 1.2, 1.2, 0 ] );
	const iks = [ {
		target: 3,
		effector: 2,
		links: [ { index: 1 }, { index: 0 } ],
		iteration: 30
	} ];

	const solver = new IK.CCDIKSolver( rig.mesh, iks );
	solver.update();
	rig.mesh.updateMatrixWorld( true );

	const effectorPos = new THREE.Vector3().setFromMatrixPosition( rig.bones[ 2 ].matrixWorld );
	const dist = effectorPos.distanceTo( new THREE.Vector3( 1.2, 1.2, 0 ) );
	assert( 'CCD 迭代后 effector 世界坐标误差 < 1e-3 (实测 ' + dist.toExponential( 2 ) + ')', dist < 1e-3 );

} )();

// 2.2 blendFactor = 0 时骨骼保持原姿态(r185 新增混合权重)
( function () {

	const rig = createIKRig( [ 1.2, 1.2, 0 ] );
	const iks = [ {
		target: 3,
		effector: 2,
		links: [ { index: 1 }, { index: 0 } ],
		iteration: 30
	} ];

	const solver = new IK.CCDIKSolver( rig.mesh, iks );
	solver.update( 0 );
	rig.mesh.updateMatrixWorld( true );

	const q0 = rig.bones[ 0 ].quaternion;
	const q1 = rig.bones[ 1 ].quaternion;
	assert( 'update(0) 骨骼姿态不变(IK 全部混出)',
		Math.abs( q0.w - 1 ) < 1e-12 && Math.abs( q1.w - 1 ) < 1e-12 &&
		Math.abs( q0.x ) + Math.abs( q0.y ) + Math.abs( q0.z ) < 1e-12 );

	// blendFactor = 0.5 应介于两者之间(角度非 0 且小于全量)
	solver.update( 0.5 );
	rig.mesh.updateMatrixWorld( true );
	const halfPos = new THREE.Vector3().setFromMatrixPosition( rig.bones[ 2 ].matrixWorld );
	solver.update( 1 );
	rig.mesh.updateMatrixWorld( true );
	const fullPos = new THREE.Vector3().setFromMatrixPosition( rig.bones[ 2 ].matrixWorld );
	assert( 'update(0.5) 介于原姿态与全量 IK 之间',
		halfPos.distanceTo( new THREE.Vector3( 0, 2, 0 ) ) > 1e-3 &&
		halfPos.distanceTo( new THREE.Vector3( 1.2, 1.2, 0 ) ) > fullPos.distanceTo( new THREE.Vector3( 1.2, 1.2, 0 ) ) );

} )();

// 2.3 CCDIKHelper 结构: 每条 IK = target球 + effector球 + N link球 + 1 line
( function () {

	const rig = createIKRig( [ 1.2, 1.2, 0 ] );
	const iks = [ { target: 3, effector: 2, links: [ { index: 1 }, { index: 0 } ] } ];
	const solver = new IK.CCDIKSolver( rig.mesh, iks );
	const helper = solver.createHelper( 0.1 );

	assert( 'CCDIKHelper 子对象数 = 2 + links + 1', helper.children.length === 2 + 2 + 1 );
	assert( 'CCDIKHelper 几何为 BufferGeometry(r110 SphereBufferGeometry 适配)',
		helper.sphereGeometry.isBufferGeometry === true );

	helper.updateMatrixWorld( true );
	helper.dispose();
	assert( 'CCDIKHelper updateMatrixWorld/dispose 可用', true );

} )();

// ============================================================
// 汇总
// ============================================================

console.log( '' );

if ( failures > 0 ) {

	console.error( failures + ' assertion(s) failed' );
	process.exit( 1 );

} else {

	console.log( 'jsm-smoke: all assertions passed' );

}
