/**
 * @author mrdoob / http://mrdoob.com/
 *
 * backport from r185(阶段三 4.2#1): instanceColor / getMatrixAt / getColorAt /
 * computeBoundingBox / computeBoundingSphere / raycast / copy / dispose。
 * 渲染路径复用 r110 已有 ANGLE_instanced_arrays 分支(WebGLRenderer 补
 * instanceColor attribute 绑定)。逐实例 morphTexture 依赖 WebGL2 整数纹理
 * 路径, 按差距分析 3.3 节明确不移植。
 */

import { InstancedBufferAttribute } from '../core/InstancedBufferAttribute.js';
import { Mesh } from './Mesh.js';
import { Box3 } from '../math/Box3.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Sphere } from '../math/Sphere.js';

var _instanceLocalMatrix = new Matrix4();
var _instanceWorldMatrix = new Matrix4();

var _instanceIntersects = [];

var _box3 = new Box3();
var _identity = new Matrix4();
var _mesh = new Mesh();
var _sphere = new Sphere();

function InstancedMesh( geometry, material, count ) {

	Mesh.call( this, geometry, material );

	this.instanceMatrix = new InstancedBufferAttribute( new Float32Array( count * 16 ), 16 );
	this.instanceColor = null;

	this.count = count;

	this.boundingBox = null;
	this.boundingSphere = null;

	for ( var i = 0; i < count; i ++ ) {

		this.setMatrixAt( i, _identity );

	}

}

InstancedMesh.prototype = Object.assign( Object.create( Mesh.prototype ), {

	constructor: InstancedMesh,

	isInstancedMesh: true,

	computeBoundingBox: function () {

		var geometry = this.geometry;
		var count = this.count;

		if ( this.boundingBox === null ) {

			this.boundingBox = new Box3();

		}

		if ( geometry.boundingBox === null ) {

			geometry.computeBoundingBox();

		}

		this.boundingBox.makeEmpty();

		for ( var i = 0; i < count; i ++ ) {

			this.getMatrixAt( i, _instanceLocalMatrix );

			_box3.copy( geometry.boundingBox ).applyMatrix4( _instanceLocalMatrix );

			this.boundingBox.union( _box3 );

		}

	},

	computeBoundingSphere: function () {

		var geometry = this.geometry;
		var count = this.count;

		if ( this.boundingSphere === null ) {

			this.boundingSphere = new Sphere();

		}

		if ( geometry.boundingSphere === null ) {

			geometry.computeBoundingSphere();

		}

		this.boundingSphere.makeEmpty();

		for ( var i = 0; i < count; i ++ ) {

			this.getMatrixAt( i, _instanceLocalMatrix );

			_sphere.copy( geometry.boundingSphere ).applyMatrix4( _instanceLocalMatrix );

			this.boundingSphere.union( _sphere );

		}

	},

	copy: function ( source, recursive ) {

		Mesh.prototype.copy.call( this, source, recursive );

		this.instanceMatrix.copy( source.instanceMatrix );

		if ( source.instanceColor !== null ) this.instanceColor = source.instanceColor.clone();

		this.count = source.count;

		if ( source.boundingBox !== null ) this.boundingBox = source.boundingBox.clone();
		if ( source.boundingSphere !== null ) this.boundingSphere = source.boundingSphere.clone();

		return this;

	},

	getColorAt: function ( index, color ) {

		if ( this.instanceColor === null ) {

			return color.setRGB( 1, 1, 1 );

		}

		return color.fromArray( this.instanceColor.array, index * 3 );

	},

	getMatrixAt: function ( index, matrix ) {

		return matrix.fromArray( this.instanceMatrix.array, index * 16 );

	},

	raycast: function ( raycaster, intersects ) {

		var matrixWorld = this.matrixWorld;
		var raycastTimes = this.count;

		_mesh.geometry = this.geometry;
		_mesh.material = this.material;

		if ( _mesh.material === undefined ) return;

		// test with bounding sphere first

		if ( this.boundingSphere === null ) this.computeBoundingSphere();

		_sphere.copy( this.boundingSphere );
		_sphere.applyMatrix4( matrixWorld );

		if ( raycaster.ray.intersectsSphere( _sphere ) === false ) return;

		// now test each instance

		for ( var instanceId = 0; instanceId < raycastTimes; instanceId ++ ) {

			// calculate the world matrix for each instance

			this.getMatrixAt( instanceId, _instanceLocalMatrix );

			_instanceWorldMatrix.multiplyMatrices( matrixWorld, _instanceLocalMatrix );

			// the mesh represents this single instance

			_mesh.matrixWorld = _instanceWorldMatrix;

			_mesh.raycast( raycaster, _instanceIntersects );

			// process the result of raycast

			for ( var i = 0, l = _instanceIntersects.length; i < l; i ++ ) {

				var intersect = _instanceIntersects[ i ];
				intersect.instanceId = instanceId;
				intersect.object = this;
				intersects.push( intersect );

			}

			_instanceIntersects.length = 0;

		}

	},

	setColorAt: function ( index, color ) {

		if ( this.instanceColor === null ) {

			var colorArray = new Float32Array( this.instanceMatrix.count * 3 );

			for ( var i = 0; i < colorArray.length; i ++ ) colorArray[ i ] = 1;

			this.instanceColor = new InstancedBufferAttribute( colorArray, 3 );

		}

		color.toArray( this.instanceColor.array, index * 3 );
		return this;

	},

	setMatrixAt: function ( index, matrix ) {

		matrix.toArray( this.instanceMatrix.array, index * 16 );
		return this;

	},

	updateMorphTargets: function () {},

	dispose: function () {

		this.dispatchEvent( { type: 'dispose' } );

	}

} );

export { InstancedMesh };
