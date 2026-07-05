/**
 * BatchedMesh — backport from r185, WebGL1 改造版(阶段三 4.2#2)
 *
 * 与 r185 官方版的差异(全部为 WebGL1 约束下的等价降级, 见差距分析 3.2 节 #10):
 * 1. 间接索引纹理由 usampler2D 整数纹理(RedIntegerFormat/UnsignedIntType)改为
 *    RGBA float DataTexture(id 存 .r 通道, float32 整数精度 2^24 足够);
 * 2. 矩阵/颜色/间接纹理尺寸按 2 的幂对齐(与 r110 boneTexture 同策略, 规避
 *    低端真机 NPOT float 纹理兼容性问题);
 * 3. r110 BufferAttribute 无 addUpdateRange 多段增量上传, 统一置 needsUpdate
 *    全量上传(LDraw 场景几何在加载期一次写入, 无每帧增量, 代价可忽略);
 * 4. 剔除用 Frustum.setFromProjectionMatrix(本轮已 backport), 不含
 *    ArrayCamera/reversedDepth 分支(小程序无 XR);
 * 5. 绘制端: 有 WEBGL_multi_draw 扩展时一次 multiDrawElementsWEBGL 提交;
 *    无扩展时渲染器循环 drawElements + _gl_DrawID uniform(r185 自带的
 *    fallback 方案), 仍省掉逐对象的 program/material/attribute 切换。
 *
 * 能力要求(consumer 通过 THREE.global.detectCapabilities 判定):
 * floatTexture + vertexTextures; multiDraw 可选(无则走循环 fallback)。
 * 不支持 shadow map 深度材质合批(LDraw 场景未启用阴影)。
 */

import { BufferAttribute } from '../core/BufferAttribute.js';
import { BufferGeometry } from '../core/BufferGeometry.js';
import { DataTexture } from '../textures/DataTexture.js';
import { FloatType, RGBAFormat } from '../constants.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Mesh } from './Mesh.js';
import { Box3 } from '../math/Box3.js';
import { Sphere } from '../math/Sphere.js';
import { Frustum } from '../math/Frustum.js';
import { Vector3 } from '../math/Vector3.js';
import { Color } from '../math/Color.js';
import { _Math } from '../math/Math.js';

function ascIdSort( a, b ) {

	return a - b;

}

function sortOpaque( a, b ) {

	return a.z - b.z;

}

function sortTransparent( a, b ) {

	return b.z - a.z;

}

function MultiDrawRenderList() {

	this.index = 0;
	this.pool = [];
	this.list = [];

}

Object.assign( MultiDrawRenderList.prototype, {

	push: function ( start, count, z, index ) {

		var pool = this.pool;
		var list = this.list;
		if ( this.index >= pool.length ) {

			pool.push( { start: - 1, count: - 1, z: - 1, index: - 1 } );

		}

		var item = pool[ this.index ];
		list.push( item );
		this.index ++;

		item.start = start;
		item.count = count;
		item.z = z;
		item.index = index;

	},

	reset: function () {

		this.list.length = 0;
		this.index = 0;

	}

} );

var _matrix = new Matrix4();
var _whiteColor = new Color( 1, 1, 1 );
var _frustum = new Frustum();
var _box = new Box3();
var _sphere = new Sphere();
var _vector = new Vector3();
var _forward = new Vector3();
var _temp = new Vector3();
var _renderList = new MultiDrawRenderList();
var _mesh = new Mesh();
var _batchIntersects = [];

// copies data from attribute "src" into "target" starting at "targetOffset"
function copyAttributeData( src, target, targetOffset ) {

	var itemSize = target.itemSize;
	if ( src.isInterleavedBufferAttribute || src.array.constructor !== target.array.constructor ) {

		// use the component getters and setters if the array data cannot
		// be copied directly
		var vertexCount = src.count;
		for ( var i = 0; i < vertexCount; i ++ ) {

			for ( var c = 0; c < itemSize; c ++ ) {

				setComponent( target, i + targetOffset, c, getComponent( src, i, c ) );

			}

		}

	} else {

		// faster copy approach using typed array set function
		target.array.set( src.array, targetOffset * itemSize );

	}

	target.needsUpdate = true;

}

// r110 BufferAttribute 无 get/setComponent, 以数组下标等价实现
function getComponent( attribute, index, component ) {

	return attribute.array[ index * attribute.itemSize + component ];

}

function setComponent( attribute, index, component, value ) {

	attribute.array[ index * attribute.itemSize + component ] = value;

}

// safely copies array contents to a potentially smaller array
function copyArrayContents( src, target ) {

	if ( src.constructor !== target.constructor ) {

		// if arrays are of a different type (eg due to index size increasing) then data must be per-element copied
		var len = Math.min( src.length, target.length );
		for ( var i = 0; i < len; i ++ ) {

			target[ i ] = src[ i ];

		}

	} else {

		// if the arrays use the same data layout we can use a fast block copy
		var len2 = Math.min( src.length, target.length );
		target.set( new src.constructor( src.buffer, 0, len2 ) );

	}

}

function BatchedMesh( maxInstanceCount, maxVertexCount, maxIndexCount, material ) {

	if ( maxIndexCount === undefined ) maxIndexCount = maxVertexCount * 2;

	Mesh.call( this, new BufferGeometry(), material );

	this.perObjectFrustumCulled = true;
	this.sortObjects = true;
	this.boundingBox = null;
	this.boundingSphere = null;
	this.customSort = null;

	// stores visible, active, and geometry id per instance and reserved buffer ranges for geometries
	this._instanceInfo = [];
	this._geometryInfo = [];

	// instance, geometry ids that have been set as inactive, and are available to be overwritten
	this._availableInstanceIds = [];
	this._availableGeometryIds = [];

	// used to track where the next point is that geometry should be inserted
	this._nextIndexStart = 0;
	this._nextVertexStart = 0;
	this._geometryCount = 0;

	// flags
	this._visibilityChanged = true;
	this._geometryInitialized = false;

	// cached user options
	this._maxInstanceCount = maxInstanceCount;
	this._maxVertexCount = maxVertexCount;
	this._maxIndexCount = maxIndexCount;

	// buffers for multi draw
	this._multiDrawCounts = new Int32Array( maxInstanceCount );
	this._multiDrawStarts = new Int32Array( maxInstanceCount );
	this._multiDrawCount = 0;

	// Local matrix per geometry by using data texture
	this._matricesTexture = null;
	this._indirectTexture = null;
	this._colorsTexture = null;

	this._initMatricesTexture();
	this._initIndirectTexture();

}

BatchedMesh.prototype = Object.assign( Object.create( Mesh.prototype ), {

	constructor: BatchedMesh,

	isBatchedMesh: true,

	_initMatricesTexture: function () {

		// layout (1 matrix = 4 pixels)  RGBA RGBA RGBA RGBA (=> column1..column4)
		var size = Math.sqrt( this._maxInstanceCount * 4 );
		size = _Math.ceilPowerOfTwo( Math.ceil( size / 4 ) * 4 );
		size = Math.max( size, 4 );

		var matricesArray = new Float32Array( size * size * 4 );
		this._matricesTexture = new DataTexture( matricesArray, size, size, RGBAFormat, FloatType );

	},

	// GL1 改造: float 纹理编码间接索引(id 存 .r), 替代 r185 的整数纹理
	_initIndirectTexture: function () {

		var size = _Math.ceilPowerOfTwo( Math.ceil( Math.sqrt( this._maxInstanceCount ) ) );
		size = Math.max( size, 4 );

		var indirectArray = new Float32Array( size * size * 4 );
		this._indirectTexture = new DataTexture( indirectArray, size, size, RGBAFormat, FloatType );

	},

	_initColorsTexture: function () {

		var size = _Math.ceilPowerOfTwo( Math.ceil( Math.sqrt( this._maxInstanceCount ) ) );
		size = Math.max( size, 4 );

		// 4 floats per RGBA pixel initialized to white
		var colorsArray = new Float32Array( size * size * 4 );
		for ( var i = 0; i < colorsArray.length; i ++ ) colorsArray[ i ] = 1;

		this._colorsTexture = new DataTexture( colorsArray, size, size, RGBAFormat, FloatType );

	},

	_initializeGeometry: function ( reference ) {

		var geometry = this.geometry;
		var maxVertexCount = this._maxVertexCount;
		var maxIndexCount = this._maxIndexCount;
		if ( this._geometryInitialized === false ) {

			for ( var attributeName in reference.attributes ) {

				var srcAttribute = reference.getAttribute( attributeName );
				var dstArray = new srcAttribute.array.constructor( maxVertexCount * srcAttribute.itemSize );
				var dstAttribute = new BufferAttribute( dstArray, srcAttribute.itemSize, srcAttribute.normalized );

				geometry.setAttribute( attributeName, dstAttribute );

			}

			if ( reference.getIndex() !== null ) {

				var indexArray = maxVertexCount > 65535
					? new Uint32Array( maxIndexCount )
					: new Uint16Array( maxIndexCount );

				geometry.setIndex( new BufferAttribute( indexArray, 1 ) );

			}

			this._geometryInitialized = true;

		}

	},

	// Make sure the geometry is compatible with the existing combined geometry attributes
	_validateGeometry: function ( geometry ) {

		var batchGeometry = this.geometry;
		if ( Boolean( geometry.getIndex() ) !== Boolean( batchGeometry.getIndex() ) ) {

			throw new Error( 'THREE.BatchedMesh: All geometries must consistently have "index".' );

		}

		for ( var attributeName in batchGeometry.attributes ) {

			if ( geometry.attributes[ attributeName ] === undefined ) {

				throw new Error( 'THREE.BatchedMesh: Added geometry missing "' + attributeName + '". All geometries must have consistent attributes.' );

			}

			var srcAttribute = geometry.getAttribute( attributeName );
			var dstAttribute = batchGeometry.getAttribute( attributeName );
			if ( srcAttribute.itemSize !== dstAttribute.itemSize || srcAttribute.normalized !== dstAttribute.normalized ) {

				throw new Error( 'THREE.BatchedMesh: All attributes must have a consistent itemSize and normalized value.' );

			}

		}

	},

	validateInstanceId: function ( instanceId ) {

		var instanceInfo = this._instanceInfo;
		if ( instanceId < 0 || instanceId >= instanceInfo.length || instanceInfo[ instanceId ].active === false ) {

			throw new Error( 'THREE.BatchedMesh: Invalid instanceId ' + instanceId + '. Instance is either out of range or has been deleted.' );

		}

	},

	validateGeometryId: function ( geometryId ) {

		var geometryInfoList = this._geometryInfo;
		if ( geometryId < 0 || geometryId >= geometryInfoList.length || geometryInfoList[ geometryId ].active === false ) {

			throw new Error( 'THREE.BatchedMesh: Invalid geometryId ' + geometryId + '. Geometry is either out of range or has been deleted.' );

		}

	},

	setCustomSort: function ( func ) {

		this.customSort = func;
		return this;

	},

	computeBoundingBox: function () {

		if ( this.boundingBox === null ) {

			this.boundingBox = new Box3();

		}

		var boundingBox = this.boundingBox;
		var instanceInfo = this._instanceInfo;

		boundingBox.makeEmpty();
		for ( var i = 0, l = instanceInfo.length; i < l; i ++ ) {

			if ( instanceInfo[ i ].active === false ) continue;

			var geometryId = instanceInfo[ i ].geometryIndex;
			this.getMatrixAt( i, _matrix );
			this.getBoundingBoxAt( geometryId, _box ).applyMatrix4( _matrix );
			boundingBox.union( _box );

		}

	},

	computeBoundingSphere: function () {

		if ( this.boundingSphere === null ) {

			this.boundingSphere = new Sphere();

		}

		var boundingSphere = this.boundingSphere;
		var instanceInfo = this._instanceInfo;

		boundingSphere.makeEmpty();
		for ( var i = 0, l = instanceInfo.length; i < l; i ++ ) {

			if ( instanceInfo[ i ].active === false ) continue;

			var geometryId = instanceInfo[ i ].geometryIndex;
			this.getMatrixAt( i, _matrix );
			this.getBoundingSphereAt( geometryId, _sphere ).applyMatrix4( _matrix );
			boundingSphere.union( _sphere );

		}

	},

	addInstance: function ( geometryId ) {

		var atCapacity = this._instanceInfo.length >= this._maxInstanceCount;

		// ensure we're not over geometry
		if ( atCapacity && this._availableInstanceIds.length === 0 ) {

			throw new Error( 'THREE.BatchedMesh: Maximum item count reached.' );

		}

		var instanceInfo = {
			visible: true,
			active: true,
			geometryIndex: geometryId
		};

		var drawId = null;

		// Prioritize using previously freed instance ids
		if ( this._availableInstanceIds.length > 0 ) {

			this._availableInstanceIds.sort( ascIdSort );

			drawId = this._availableInstanceIds.shift();
			this._instanceInfo[ drawId ] = instanceInfo;

		} else {

			drawId = this._instanceInfo.length;
			this._instanceInfo.push( instanceInfo );

		}

		var matricesTexture = this._matricesTexture;
		_matrix.identity().toArray( matricesTexture.image.data, drawId * 16 );
		matricesTexture.needsUpdate = true;

		var colorsTexture = this._colorsTexture;
		if ( colorsTexture ) {

			_whiteColor.toArray( colorsTexture.image.data, drawId * 4 );
			colorsTexture.needsUpdate = true;

		}

		this._visibilityChanged = true;
		return drawId;

	},

	addGeometry: function ( geometry, reservedVertexCount, reservedIndexCount ) {

		if ( reservedVertexCount === undefined ) reservedVertexCount = - 1;
		if ( reservedIndexCount === undefined ) reservedIndexCount = - 1;

		this._initializeGeometry( geometry );

		this._validateGeometry( geometry );

		var geometryInfo = {
			// geometry information
			vertexStart: - 1,
			vertexCount: - 1,
			reservedVertexCount: - 1,

			indexStart: - 1,
			indexCount: - 1,
			reservedIndexCount: - 1,

			// draw range information
			start: - 1,
			count: - 1,

			// state
			boundingBox: null,
			boundingSphere: null,
			active: true
		};

		var geometryInfoList = this._geometryInfo;
		geometryInfo.vertexStart = this._nextVertexStart;
		geometryInfo.reservedVertexCount = reservedVertexCount === - 1 ? geometry.getAttribute( 'position' ).count : reservedVertexCount;

		var index = geometry.getIndex();
		var hasIndex = index !== null;
		if ( hasIndex ) {

			geometryInfo.indexStart = this._nextIndexStart;
			geometryInfo.reservedIndexCount = reservedIndexCount === - 1 ? index.count : reservedIndexCount;

		}

		if (
			geometryInfo.indexStart !== - 1 &&
			geometryInfo.indexStart + geometryInfo.reservedIndexCount > this._maxIndexCount ||
			geometryInfo.vertexStart + geometryInfo.reservedVertexCount > this._maxVertexCount
		) {

			throw new Error( 'THREE.BatchedMesh: Reserved space request exceeds the maximum buffer size.' );

		}

		// update id
		var geometryId;
		if ( this._availableGeometryIds.length > 0 ) {

			this._availableGeometryIds.sort( ascIdSort );

			geometryId = this._availableGeometryIds.shift();
			geometryInfoList[ geometryId ] = geometryInfo;

		} else {

			geometryId = this._geometryCount;
			this._geometryCount ++;
			geometryInfoList.push( geometryInfo );

		}

		// update the geometry
		this.setGeometryAt( geometryId, geometry );

		// increment the next geometry position
		this._nextIndexStart = geometryInfo.indexStart + geometryInfo.reservedIndexCount;
		this._nextVertexStart = geometryInfo.vertexStart + geometryInfo.reservedVertexCount;

		return geometryId;

	},

	setGeometryAt: function ( geometryId, geometry ) {

		if ( geometryId >= this._geometryCount ) {

			throw new Error( 'THREE.BatchedMesh: Maximum geometry count reached.' );

		}

		this._validateGeometry( geometry );

		var batchGeometry = this.geometry;
		var hasIndex = batchGeometry.getIndex() !== null;
		var dstIndex = batchGeometry.getIndex();
		var srcIndex = geometry.getIndex();
		var geometryInfo = this._geometryInfo[ geometryId ];
		if (
			hasIndex &&
			srcIndex.count > geometryInfo.reservedIndexCount ||
			geometry.attributes.position.count > geometryInfo.reservedVertexCount
		) {

			throw new Error( 'THREE.BatchedMesh: Reserved space not large enough for provided geometry.' );

		}

		// copy geometry buffer data over
		var vertexStart = geometryInfo.vertexStart;
		var reservedVertexCount = geometryInfo.reservedVertexCount;
		geometryInfo.vertexCount = geometry.getAttribute( 'position' ).count;

		for ( var attributeName in batchGeometry.attributes ) {

			// copy attribute data
			var srcAttribute = geometry.getAttribute( attributeName );
			var dstAttribute = batchGeometry.getAttribute( attributeName );
			copyAttributeData( srcAttribute, dstAttribute, vertexStart );

			// fill the rest in with zeroes
			var itemSize = srcAttribute.itemSize;
			for ( var i = srcAttribute.count, l = reservedVertexCount; i < l; i ++ ) {

				var index = vertexStart + i;
				for ( var c = 0; c < itemSize; c ++ ) {

					setComponent( dstAttribute, index, c, 0 );

				}

			}

			// GL1 改造: 无 addUpdateRange, 全量上传
			dstAttribute.needsUpdate = true;

		}

		// copy index
		if ( hasIndex ) {

			var indexStart = geometryInfo.indexStart;
			var reservedIndexCount = geometryInfo.reservedIndexCount;
			geometryInfo.indexCount = geometry.getIndex().count;

			// copy index data over
			for ( var j = 0; j < srcIndex.count; j ++ ) {

				dstIndex.setX( indexStart + j, vertexStart + srcIndex.getX( j ) );

			}

			// fill the rest in with zeroes
			for ( var k = srcIndex.count, kl = reservedIndexCount; k < kl; k ++ ) {

				dstIndex.setX( indexStart + k, vertexStart );

			}

			dstIndex.needsUpdate = true;

		}

		// update the draw range
		geometryInfo.start = hasIndex ? geometryInfo.indexStart : geometryInfo.vertexStart;
		geometryInfo.count = hasIndex ? geometryInfo.indexCount : geometryInfo.vertexCount;

		// store the bounding boxes
		geometryInfo.boundingBox = null;
		if ( geometry.boundingBox !== null ) {

			geometryInfo.boundingBox = geometry.boundingBox.clone();

		}

		geometryInfo.boundingSphere = null;
		if ( geometry.boundingSphere !== null ) {

			geometryInfo.boundingSphere = geometry.boundingSphere.clone();

		}

		this._visibilityChanged = true;
		return geometryId;

	},

	deleteGeometry: function ( geometryId ) {

		var geometryInfoList = this._geometryInfo;
		if ( geometryId >= geometryInfoList.length || geometryInfoList[ geometryId ].active === false ) {

			return this;

		}

		// delete any instances associated with this geometry
		var instanceInfo = this._instanceInfo;
		for ( var i = 0, l = instanceInfo.length; i < l; i ++ ) {

			if ( instanceInfo[ i ].active && instanceInfo[ i ].geometryIndex === geometryId ) {

				this.deleteInstance( i );

			}

		}

		geometryInfoList[ geometryId ].active = false;
		this._availableGeometryIds.push( geometryId );
		this._visibilityChanged = true;

		return this;

	},

	deleteInstance: function ( instanceId ) {

		this.validateInstanceId( instanceId );

		this._instanceInfo[ instanceId ].active = false;
		this._availableInstanceIds.push( instanceId );
		this._visibilityChanged = true;

		return this;

	},

	getBoundingBoxAt: function ( geometryId, target ) {

		if ( geometryId >= this._geometryCount ) {

			return null;

		}

		// compute bounding box
		var geometry = this.geometry;
		var geometryInfo = this._geometryInfo[ geometryId ];
		if ( geometryInfo.boundingBox === null ) {

			var box = new Box3();
			var index = geometry.index;
			var position = geometry.attributes.position;
			for ( var i = geometryInfo.start, l = geometryInfo.start + geometryInfo.count; i < l; i ++ ) {

				var iv = i;
				if ( index ) {

					iv = index.getX( iv );

				}

				box.expandByPoint( _vector.fromBufferAttribute( position, iv ) );

			}

			geometryInfo.boundingBox = box;

		}

		target.copy( geometryInfo.boundingBox );
		return target;

	},

	getBoundingSphereAt: function ( geometryId, target ) {

		if ( geometryId >= this._geometryCount ) {

			return null;

		}

		// compute bounding sphere
		var geometry = this.geometry;
		var geometryInfo = this._geometryInfo[ geometryId ];
		if ( geometryInfo.boundingSphere === null ) {

			var sphere = new Sphere();
			this.getBoundingBoxAt( geometryId, _box );
			_box.getCenter( sphere.center );

			var index = geometry.index;
			var position = geometry.attributes.position;

			var maxRadiusSq = 0;
			for ( var i = geometryInfo.start, l = geometryInfo.start + geometryInfo.count; i < l; i ++ ) {

				var iv = i;
				if ( index ) {

					iv = index.getX( iv );

				}

				_vector.fromBufferAttribute( position, iv );
				maxRadiusSq = Math.max( maxRadiusSq, sphere.center.distanceToSquared( _vector ) );

			}

			sphere.radius = Math.sqrt( maxRadiusSq );
			geometryInfo.boundingSphere = sphere;

		}

		target.copy( geometryInfo.boundingSphere );
		return target;

	},

	setMatrixAt: function ( instanceId, matrix ) {

		this.validateInstanceId( instanceId );

		var matricesTexture = this._matricesTexture;
		matrix.toArray( matricesTexture.image.data, instanceId * 16 );
		matricesTexture.needsUpdate = true;

		return this;

	},

	getMatrixAt: function ( instanceId, matrix ) {

		this.validateInstanceId( instanceId );
		return matrix.fromArray( this._matricesTexture.image.data, instanceId * 16 );

	},

	setColorAt: function ( instanceId, color ) {

		this.validateInstanceId( instanceId );

		if ( this._colorsTexture === null ) {

			this._initColorsTexture();

		}

		color.toArray( this._colorsTexture.image.data, instanceId * 4 );
		this._colorsTexture.image.data[ instanceId * 4 + 3 ] = 1.0;
		this._colorsTexture.needsUpdate = true;

		return this;

	},

	getColorAt: function ( instanceId, color ) {

		this.validateInstanceId( instanceId );
		if ( this._colorsTexture === null ) {

			return color.setRGB( 1, 1, 1 );

		}

		return color.fromArray( this._colorsTexture.image.data, instanceId * 4 );

	},

	setVisibleAt: function ( instanceId, visible ) {

		this.validateInstanceId( instanceId );

		if ( this._instanceInfo[ instanceId ].visible === visible ) {

			return this;

		}

		this._instanceInfo[ instanceId ].visible = visible;
		this._visibilityChanged = true;

		return this;

	},

	getVisibleAt: function ( instanceId ) {

		this.validateInstanceId( instanceId );

		return this._instanceInfo[ instanceId ].visible;

	},

	setGeometryIdAt: function ( instanceId, geometryId ) {

		this.validateInstanceId( instanceId );
		this.validateGeometryId( geometryId );

		this._instanceInfo[ instanceId ].geometryIndex = geometryId;
		this._visibilityChanged = true;

		return this;

	},

	getGeometryIdAt: function ( instanceId ) {

		this.validateInstanceId( instanceId );

		return this._instanceInfo[ instanceId ].geometryIndex;

	},

	getGeometryRangeAt: function ( geometryId, target ) {

		this.validateGeometryId( geometryId );

		if ( target === undefined ) target = {};

		var geometryInfo = this._geometryInfo[ geometryId ];
		target.vertexStart = geometryInfo.vertexStart;
		target.vertexCount = geometryInfo.vertexCount;
		target.reservedVertexCount = geometryInfo.reservedVertexCount;

		target.indexStart = geometryInfo.indexStart;
		target.indexCount = geometryInfo.indexCount;
		target.reservedIndexCount = geometryInfo.reservedIndexCount;

		target.start = geometryInfo.start;
		target.count = geometryInfo.count;

		return target;

	},

	raycast: function ( raycaster, intersects ) {

		var instanceInfo = this._instanceInfo;
		var geometryInfoList = this._geometryInfo;
		var matrixWorld = this.matrixWorld;
		var batchGeometry = this.geometry;

		// iterate over each geometry
		_mesh.material = this.material;
		_mesh.geometry.index = batchGeometry.index;
		_mesh.geometry.attributes = batchGeometry.attributes;
		if ( _mesh.geometry.boundingBox === null ) {

			_mesh.geometry.boundingBox = new Box3();

		}

		if ( _mesh.geometry.boundingSphere === null ) {

			_mesh.geometry.boundingSphere = new Sphere();

		}

		for ( var i = 0, l = instanceInfo.length; i < l; i ++ ) {

			if ( ! instanceInfo[ i ].visible || ! instanceInfo[ i ].active ) {

				continue;

			}

			var geometryId = instanceInfo[ i ].geometryIndex;
			var geometryInfo = geometryInfoList[ geometryId ];
			_mesh.geometry.setDrawRange( geometryInfo.start, geometryInfo.count );

			// get the intersects
			this.getMatrixAt( i, _mesh.matrixWorld ).premultiply( matrixWorld );
			this.getBoundingBoxAt( geometryId, _mesh.geometry.boundingBox );
			this.getBoundingSphereAt( geometryId, _mesh.geometry.boundingSphere );
			_mesh.raycast( raycaster, _batchIntersects );

			// add batch id to the intersects
			for ( var j = 0, jl = _batchIntersects.length; j < jl; j ++ ) {

				var intersect = _batchIntersects[ j ];
				intersect.object = this;
				intersect.batchId = i;
				intersects.push( intersect );

			}

			_batchIntersects.length = 0;

		}

		_mesh.material = null;
		_mesh.geometry.index = null;
		_mesh.geometry.attributes = {};
		_mesh.geometry.setDrawRange( 0, Infinity );

	},

	copy: function ( source, recursive ) {

		Mesh.prototype.copy.call( this, source, recursive );

		this.geometry = source.geometry.clone();
		this.perObjectFrustumCulled = source.perObjectFrustumCulled;
		this.sortObjects = source.sortObjects;
		this.boundingBox = source.boundingBox !== null ? source.boundingBox.clone() : null;
		this.boundingSphere = source.boundingSphere !== null ? source.boundingSphere.clone() : null;

		this._geometryInfo = source._geometryInfo.map( function ( info ) {

			var cloned = Object.assign( {}, info );
			cloned.boundingBox = info.boundingBox !== null ? info.boundingBox.clone() : null;
			cloned.boundingSphere = info.boundingSphere !== null ? info.boundingSphere.clone() : null;
			return cloned;

		} );
		this._instanceInfo = source._instanceInfo.map( function ( info ) {

			return Object.assign( {}, info );

		} );

		this._availableInstanceIds = source._availableInstanceIds.slice();
		this._availableGeometryIds = source._availableGeometryIds.slice();

		this._nextIndexStart = source._nextIndexStart;
		this._nextVertexStart = source._nextVertexStart;
		this._geometryCount = source._geometryCount;

		this._maxInstanceCount = source._maxInstanceCount;
		this._maxVertexCount = source._maxVertexCount;
		this._maxIndexCount = source._maxIndexCount;

		this._geometryInitialized = source._geometryInitialized;
		this._multiDrawCounts = source._multiDrawCounts.slice();
		this._multiDrawStarts = source._multiDrawStarts.slice();

		this._indirectTexture = source._indirectTexture.clone();
		this._indirectTexture.image.data = this._indirectTexture.image.data.slice();

		this._matricesTexture = source._matricesTexture.clone();
		this._matricesTexture.image.data = this._matricesTexture.image.data.slice();

		if ( source._colorsTexture !== null ) {

			this._colorsTexture = source._colorsTexture.clone();
			this._colorsTexture.image.data = this._colorsTexture.image.data.slice();

		}

		return this;

	},

	dispose: function () {

		// Assuming the geometry is not shared with other meshes
		this.geometry.dispose();

		this._matricesTexture.dispose();
		this._matricesTexture = null;

		this._indirectTexture.dispose();
		this._indirectTexture = null;

		if ( this._colorsTexture !== null ) {

			this._colorsTexture.dispose();
			this._colorsTexture = null;

		}

	},

	onBeforeRender: function ( renderer, scene, camera, geometry, material /*, group */ ) {

		// if visibility has not changed and frustum culling and object sorting is not required
		// then skip iterating over all items
		if ( ! this._visibilityChanged && ! this.perObjectFrustumCulled && ! this.sortObjects ) {

			return;

		}

		// the indexed version of the multi draw function requires specifying the start
		// offset in bytes.
		var index = geometry.getIndex();
		var bytesPerElement = index === null ? 1 : index.array.BYTES_PER_ELEMENT;

		// wireframe 隐式让顶点数翻倍(每三角形 3 条线)
		var multiDrawMultiplier = 1;
		if ( material && material.wireframe ) {

			multiDrawMultiplier = 2;
			bytesPerElement = geometry.attributes.position.count > 65535 ? 4 : 2;

		}

		var instanceInfo = this._instanceInfo;
		var multiDrawStarts = this._multiDrawStarts;
		var multiDrawCounts = this._multiDrawCounts;
		var geometryInfoList = this._geometryInfo;
		var perObjectFrustumCulled = this.perObjectFrustumCulled;
		var indirectTexture = this._indirectTexture;
		var indirectArray = indirectTexture.image.data;

		// prepare the frustum in the local frame
		if ( perObjectFrustumCulled ) {

			_matrix
				.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
				.multiply( this.matrixWorld );

			_frustum.setFromProjectionMatrix( _matrix );

		}

		var multiDrawCount = 0;
		if ( this.sortObjects ) {

			// get the camera position in the local frame
			_matrix.copy( this.matrixWorld ).invert();
			_vector.setFromMatrixPosition( camera.matrixWorld ).applyMatrix4( _matrix );
			_forward.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld ).transformDirection( _matrix );

			for ( var i = 0, l = instanceInfo.length; i < l; i ++ ) {

				if ( instanceInfo[ i ].visible && instanceInfo[ i ].active ) {

					var geometryId = instanceInfo[ i ].geometryIndex;

					// get the bounds in world space
					this.getMatrixAt( i, _matrix );
					this.getBoundingSphereAt( geometryId, _sphere ).applyMatrix4( _matrix );

					// determine whether the batched geometry is within the frustum
					var culled = false;
					if ( perObjectFrustumCulled ) {

						culled = ! _frustum.intersectsSphere( _sphere );

					}

					if ( ! culled ) {

						// get the distance from camera used for sorting
						var geometryInfo = geometryInfoList[ geometryId ];
						var z = _temp.subVectors( _sphere.center, _vector ).dot( _forward );
						_renderList.push( geometryInfo.start, geometryInfo.count, z, i );

					}

				}

			}

			// Sort the draw ranges and prep for rendering
			var list = _renderList.list;
			var customSort = this.customSort;
			if ( customSort === null ) {

				list.sort( material && material.transparent ? sortTransparent : sortOpaque );

			} else {

				customSort.call( this, list, camera );

			}

			for ( var j = 0, jl = list.length; j < jl; j ++ ) {

				var item = list[ j ];
				multiDrawStarts[ multiDrawCount ] = item.start * bytesPerElement * multiDrawMultiplier;
				multiDrawCounts[ multiDrawCount ] = item.count * multiDrawMultiplier;
				indirectArray[ multiDrawCount * 4 ] = item.index; // GL1: float RGBA 纹理, id 存 .r
				multiDrawCount ++;

			}

			_renderList.reset();

		} else {

			for ( var k = 0, kl = instanceInfo.length; k < kl; k ++ ) {

				if ( instanceInfo[ k ].visible && instanceInfo[ k ].active ) {

					var geometryId2 = instanceInfo[ k ].geometryIndex;

					// determine whether the batched geometry is within the frustum
					var culled2 = false;
					if ( perObjectFrustumCulled ) {

						// get the bounds in world space
						this.getMatrixAt( k, _matrix );
						this.getBoundingSphereAt( geometryId2, _sphere ).applyMatrix4( _matrix );
						culled2 = ! _frustum.intersectsSphere( _sphere );

					}

					if ( ! culled2 ) {

						var geometryInfo2 = geometryInfoList[ geometryId2 ];
						multiDrawStarts[ multiDrawCount ] = geometryInfo2.start * bytesPerElement * multiDrawMultiplier;
						multiDrawCounts[ multiDrawCount ] = geometryInfo2.count * multiDrawMultiplier;
						indirectArray[ multiDrawCount * 4 ] = k; // GL1: float RGBA 纹理, id 存 .r
						multiDrawCount ++;

					}

				}

			}

		}

		indirectTexture.needsUpdate = true;
		this._multiDrawCount = multiDrawCount;
		this._visibilityChanged = false;

	}

} );

Object.defineProperties( BatchedMesh.prototype, {

	maxInstanceCount: {
		get: function () {

			return this._maxInstanceCount;

		}
	},

	instanceCount: {
		get: function () {

			return this._instanceInfo.length - this._availableInstanceIds.length;

		}
	},

	unusedVertexCount: {
		get: function () {

			return this._maxVertexCount - this._nextVertexStart;

		}
	},

	unusedIndexCount: {
		get: function () {

			return this._maxIndexCount - this._nextIndexStart;

		}
	}

} );

export { BatchedMesh };
