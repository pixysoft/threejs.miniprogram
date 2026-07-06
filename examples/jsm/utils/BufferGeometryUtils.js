/**
 * backport from r185
 *
 * 与官方 r185 的刻意分歧（升级差距分析说明 3.0 §2.4）：
 * 1. 裁掉 computeMikkTSpaceTangents（依赖外部 mikktspace WASM 包，小程序无消费方）；
 * 2. 删除 BufferAttribute.gpuType 相关校验（r110 无该属性，全部 attribute 语义一致）；
 * 3. mergeAttributes 的 interleaved 分支改用 getX/getY/getZ/getW（r110 无 getComponent/setComponent）；
 * 4. 保留 r110 的 computeTangents（examples 仍有消费方，官方 r185 已移入核心 BufferGeometry）；
 * 5. 保留兼容别名导出：mergeBufferGeometries = mergeGeometries、mergeBufferAttributes = mergeAttributes，
 *    并维持旧的 BufferGeometryUtils 命名空间对象导出（单测与业务侧零改动）。
 */

import {
	BufferAttribute,
	BufferGeometry,
	Float32BufferAttribute,
	InstancedBufferAttribute,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	TriangleFanDrawMode,
	TriangleStripDrawMode,
	TrianglesDrawMode,
	Vector2,
	Vector3,
} from "../../../build/three.module.js";

/**
 * Merges a set of geometries into a single instance. All geometries must have compatible attributes.
 *
 * @param {Array<BufferGeometry>} geometries - The geometries to merge.
 * @param {boolean} [useGroups=false] - Whether to use groups or not.
 * @return {?BufferGeometry} The merged geometry. Returns `null` if the merge does not succeed.
 */
function mergeGeometries( geometries, useGroups = false ) {

	const isIndexed = geometries[ 0 ].index !== null;

	const attributesUsed = new Set( Object.keys( geometries[ 0 ].attributes ) );
	const morphAttributesUsed = new Set( Object.keys( geometries[ 0 ].morphAttributes ) );

	const attributes = {};
	const morphAttributes = {};

	const morphTargetsRelative = geometries[ 0 ].morphTargetsRelative;

	const mergedGeometry = new BufferGeometry();

	let offset = 0;

	for ( let i = 0; i < geometries.length; ++ i ) {

		const geometry = geometries[ i ];
		let attributesCount = 0;

		// ensure that all geometries are indexed, or none

		if ( isIndexed !== ( geometry.index !== null ) ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.' );
			return null;

		}

		// gather attributes, exit early if they're different

		for ( const name in geometry.attributes ) {

			if ( ! attributesUsed.has( name ) ) {

				console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.' );
				return null;

			}

			if ( attributes[ name ] === undefined ) attributes[ name ] = [];

			attributes[ name ].push( geometry.attributes[ name ] );

			attributesCount ++;

		}

		// ensure geometries have the same number of attributes

		if ( attributesCount !== attributesUsed.size ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. Make sure all geometries have the same number of attributes.' );
			return null;

		}

		// gather morph attributes, exit early if they're different

		if ( morphTargetsRelative !== geometry.morphTargetsRelative ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. .morphTargetsRelative must be consistent throughout all geometries.' );
			return null;

		}

		for ( const name in geometry.morphAttributes ) {

			if ( ! morphAttributesUsed.has( name ) ) {

				console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '.  .morphAttributes must be consistent throughout all geometries.' );
				return null;

			}

			if ( morphAttributes[ name ] === undefined ) morphAttributes[ name ] = [];

			morphAttributes[ name ].push( geometry.morphAttributes[ name ] );

		}

		if ( useGroups ) {

			let count;

			if ( isIndexed ) {

				count = geometry.index.count;

			} else if ( geometry.attributes.position !== undefined ) {

				count = geometry.attributes.position.count;

			} else {

				console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' + i + '. The geometry must have either an index or a position attribute' );
				return null;

			}

			mergedGeometry.addGroup( offset, count, i );

			offset += count;

		}

	}

	// merge indices

	if ( isIndexed ) {

		let indexOffset = 0;
		const mergedIndex = [];

		for ( let i = 0; i < geometries.length; ++ i ) {

			const index = geometries[ i ].index;

			for ( let j = 0; j < index.count; ++ j ) {

				mergedIndex.push( index.getX( j ) + indexOffset );

			}

			indexOffset += geometries[ i ].attributes.position.count;

		}

		mergedGeometry.setIndex( mergedIndex );

	}

	// merge attributes

	for ( const name in attributes ) {

		const mergedAttribute = mergeAttributes( attributes[ name ] );

		if ( ! mergedAttribute ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the ' + name + ' attribute.' );
			return null;

		}

		mergedGeometry.setAttribute( name, mergedAttribute );

	}

	// merge morph attributes

	for ( const name in morphAttributes ) {

		const numMorphTargets = morphAttributes[ name ][ 0 ].length;
		if ( numMorphTargets === 0 ) continue;

		mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
		mergedGeometry.morphAttributes[ name ] = [];

		for ( let i = 0; i < numMorphTargets; ++ i ) {

			const morphAttributesToMerge = [];

			for ( let j = 0; j < morphAttributes[ name ].length; ++ j ) {

				morphAttributesToMerge.push( morphAttributes[ name ][ j ][ i ] );

			}

			const mergedMorphAttribute = mergeAttributes( morphAttributesToMerge );

			if ( ! mergedMorphAttribute ) {

				console.error( 'THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the ' + name + ' morphAttribute.' );
				return null;

			}

			mergedGeometry.morphAttributes[ name ].push( mergedMorphAttribute );

		}

	}

	return mergedGeometry;

}

/**
 * Merges a set of attributes into a single instance. All attributes must have compatible properties and types.
 *
 * @param {Array<BufferAttribute>} attributes - The attributes to merge.
 * @return {?BufferAttribute} The merged attribute. Returns `null` if the merge does not succeed.
 */
function mergeAttributes( attributes ) {

	let TypedArray;
	let itemSize;
	let normalized;
	let arrayLength = 0;

	for ( let i = 0; i < attributes.length; ++ i ) {

		const attribute = attributes[ i ];

		if ( TypedArray === undefined ) TypedArray = attribute.array.constructor;
		if ( TypedArray !== attribute.array.constructor ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.' );
			return null;

		}

		if ( itemSize === undefined ) itemSize = attribute.itemSize;
		if ( itemSize !== attribute.itemSize ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.' );
			return null;

		}

		if ( normalized === undefined ) normalized = attribute.normalized;
		if ( normalized !== attribute.normalized ) {

			console.error( 'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.' );
			return null;

		}

		arrayLength += attribute.count * itemSize;

	}

	const array = new TypedArray( arrayLength );
	const result = new BufferAttribute( array, itemSize, normalized );
	let offset = 0;

	const getters = [ 'getX', 'getY', 'getZ', 'getW' ];
	const setters = [ 'setX', 'setY', 'setZ', 'setW' ];

	for ( let i = 0; i < attributes.length; ++ i ) {

		const attribute = attributes[ i ];
		if ( attribute.isInterleavedBufferAttribute ) {

			// r110 适配：官方用 getComponent/setComponent，r110 无此 API，改用 getX 系列
			const tupleOffset = offset / itemSize;
			for ( let j = 0, l = attribute.count; j < l; j ++ ) {

				for ( let c = 0; c < itemSize; c ++ ) {

					result[ setters[ c ] ]( j + tupleOffset, attribute[ getters[ c ] ]( j ) );

				}

			}

		} else {

			array.set( attribute.array, offset );

		}

		offset += attribute.count * itemSize;

	}

	return result;

}

/**
 * Performs a deep clone of the given buffer attribute.
 *
 * @param {BufferAttribute} attribute - The attribute to clone.
 * @return {BufferAttribute} The cloned attribute.
 */
function deepCloneAttribute( attribute ) {

	if ( attribute.isInstancedInterleavedBufferAttribute || attribute.isInterleavedBufferAttribute ) {

		return deinterleaveAttribute( attribute );

	}

	if ( attribute.isInstancedBufferAttribute ) {

		return new InstancedBufferAttribute().copy( attribute );

	}

	return new BufferAttribute().copy( attribute );

}

/**
 * Interleaves a set of attributes and returns a new array of corresponding attributes that share a
 * single InterleavedBuffer instance. All attributes must have compatible types.
 *
 * @param {Array<BufferAttribute>} attributes - The attributes to interleave.
 * @return {?Array<InterleavedBufferAttribute>} An array of interleaved attributes. If interleave does not succeed, the method returns `null`.
 */
function interleaveAttributes( attributes ) {

	// Interleaves the provided attributes into an InterleavedBuffer and returns
	// a set of InterleavedBufferAttributes for each attribute
	let TypedArray;
	let arrayLength = 0;
	let stride = 0;

	// calculate the length and type of the interleavedBuffer
	for ( let i = 0, l = attributes.length; i < l; ++ i ) {

		const attribute = attributes[ i ];

		if ( TypedArray === undefined ) TypedArray = attribute.array.constructor;
		if ( TypedArray !== attribute.array.constructor ) {

			console.error( 'AttributeBuffers of different types cannot be interleaved' );
			return null;

		}

		arrayLength += attribute.array.length;
		stride += attribute.itemSize;

	}

	// Create the set of buffer attributes
	const interleavedBuffer = new InterleavedBuffer( new TypedArray( arrayLength ), stride );
	let offset = 0;
	const res = [];
	const getters = [ 'getX', 'getY', 'getZ', 'getW' ];
	const setters = [ 'setX', 'setY', 'setZ', 'setW' ];

	for ( let j = 0, l = attributes.length; j < l; j ++ ) {

		const attribute = attributes[ j ];
		const itemSize = attribute.itemSize;
		const count = attribute.count;
		const iba = new InterleavedBufferAttribute( interleavedBuffer, itemSize, offset, attribute.normalized );
		res.push( iba );

		offset += itemSize;

		// Move the data for each attribute into the new interleavedBuffer
		// at the appropriate offset
		for ( let c = 0; c < count; c ++ ) {

			for ( let k = 0; k < itemSize; k ++ ) {

				iba[ setters[ k ] ]( c, attribute[ getters[ k ] ]( c ) );

			}

		}

	}

	return res;

}

/**
 * Returns a new, non-interleaved version of the given attribute.
 *
 * @param {InterleavedBufferAttribute} attribute - The interleaved attribute.
 * @return {BufferAttribute} The non-interleaved attribute.
 */
function deinterleaveAttribute( attribute ) {

	const cons = attribute.data.array.constructor;
	const count = attribute.count;
	const itemSize = attribute.itemSize;
	const normalized = attribute.normalized;

	const array = new cons( count * itemSize );
	let newAttribute;
	if ( attribute.isInstancedInterleavedBufferAttribute ) {

		newAttribute = new InstancedBufferAttribute( array, itemSize, normalized, attribute.meshPerAttribute );

	} else {

		newAttribute = new BufferAttribute( array, itemSize, normalized );

	}

	for ( let i = 0; i < count; i ++ ) {

		newAttribute.setX( i, attribute.getX( i ) );

		if ( itemSize >= 2 ) {

			newAttribute.setY( i, attribute.getY( i ) );

		}

		if ( itemSize >= 3 ) {

			newAttribute.setZ( i, attribute.getZ( i ) );

		}

		if ( itemSize >= 4 ) {

			newAttribute.setW( i, attribute.getW( i ) );

		}

	}

	return newAttribute;

}

/**
 * Deinterleaves all attributes on the given geometry.
 *
 * @param {BufferGeometry} geometry - The geometry to deinterleave.
 */
function deinterleaveGeometry( geometry ) {

	const attributes = geometry.attributes;
	const morphTargets = geometry.morphTargets;
	const attrMap = new Map();

	for ( const key in attributes ) {

		const attr = attributes[ key ];
		if ( attr.isInterleavedBufferAttribute ) {

			if ( ! attrMap.has( attr ) ) {

				attrMap.set( attr, deinterleaveAttribute( attr ) );

			}

			attributes[ key ] = attrMap.get( attr );

		}

	}

	for ( const key in morphTargets ) {

		const attr = morphTargets[ key ];
		if ( attr.isInterleavedBufferAttribute ) {

			if ( ! attrMap.has( attr ) ) {

				attrMap.set( attr, deinterleaveAttribute( attr ) );

			}

			morphTargets[ key ] = attrMap.get( attr );

		}

	}

}

/**
 * Returns the amount of bytes used by all attributes to represent the geometry.
 *
 * @param {BufferGeometry} geometry - The geometry.
 * @return {number} The estimate bytes used.
 */
function estimateBytesUsed( geometry ) {

	// Return the estimated memory used by this geometry in bytes
	// Calculate using itemSize, count, and BYTES_PER_ELEMENT to account
	// for InterleavedBufferAttributes.
	let mem = 0;
	for ( const name in geometry.attributes ) {

		const attr = geometry.getAttribute( name );
		mem += attr.count * attr.itemSize * attr.array.BYTES_PER_ELEMENT;

	}

	const indices = geometry.getIndex();
	mem += indices ? indices.count * indices.itemSize * indices.array.BYTES_PER_ELEMENT : 0;
	return mem;

}

/**
 * Returns a new geometry with vertices for which all similar vertex attributes (within tolerance) are merged.
 *
 * @param {BufferGeometry} geometry - The geometry to merge vertices for.
 * @param {number} [tolerance=1e-4] - The tolerance value.
 * @return {BufferGeometry} - The new geometry with merged vertices.
 */
function mergeVertices( geometry, tolerance = 1e-4 ) {

	tolerance = Math.max( tolerance, Number.EPSILON );

	// Generate an index buffer if the geometry doesn't have one, or optimize it
	// if it's already available.
	const hashToIndex = {};
	const indices = geometry.getIndex();
	const positions = geometry.getAttribute( 'position' );
	const vertexCount = indices ? indices.count : positions.count;

	// next value for triangle indices
	let nextIndex = 0;

	// attributes and new attribute arrays
	const attributeNames = Object.keys( geometry.attributes );
	const tmpAttributes = {};
	const tmpMorphAttributes = {};
	const newIndices = [];
	const getters = [ 'getX', 'getY', 'getZ', 'getW' ];
	const setters = [ 'setX', 'setY', 'setZ', 'setW' ];

	// Initialize the arrays, allocating space conservatively. Extra
	// space will be trimmed in the last step.
	for ( let i = 0, l = attributeNames.length; i < l; i ++ ) {

		const name = attributeNames[ i ];
		const attr = geometry.attributes[ name ];

		tmpAttributes[ name ] = new attr.constructor(
			new attr.array.constructor( attr.count * attr.itemSize ),
			attr.itemSize,
			attr.normalized
		);

		const morphAttributes = geometry.morphAttributes[ name ];
		if ( morphAttributes ) {

			if ( ! tmpMorphAttributes[ name ] ) tmpMorphAttributes[ name ] = [];
			morphAttributes.forEach( ( morphAttr, i ) => {

				const array = new morphAttr.array.constructor( morphAttr.count * morphAttr.itemSize );
				tmpMorphAttributes[ name ][ i ] = new morphAttr.constructor( array, morphAttr.itemSize, morphAttr.normalized );

			} );

		}

	}

	// convert the error tolerance to an amount of decimal places to truncate to
	const halfTolerance = tolerance * 0.5;
	const exponent = Math.log10( 1 / tolerance );
	const hashMultiplier = Math.pow( 10, exponent );
	const hashAdditive = halfTolerance * hashMultiplier;
	for ( let i = 0; i < vertexCount; i ++ ) {

		const index = indices ? indices.getX( i ) : i;

		// Generate a hash for the vertex attributes at the current index 'i'
		let hash = '';
		for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

			const name = attributeNames[ j ];
			const attribute = geometry.getAttribute( name );
			const itemSize = attribute.itemSize;

			for ( let k = 0; k < itemSize; k ++ ) {

				// double tilde truncates the decimal value
				hash += `${ ~ ~ ( attribute[ getters[ k ] ]( index ) * hashMultiplier + hashAdditive ) },`;

			}

		}

		// Add another reference to the vertex if it's already
		// used by another index
		if ( hash in hashToIndex ) {

			newIndices.push( hashToIndex[ hash ] );

		} else {

			// copy data to the new index in the temporary attributes
			for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

				const name = attributeNames[ j ];
				const attribute = geometry.getAttribute( name );
				const morphAttributes = geometry.morphAttributes[ name ];
				const itemSize = attribute.itemSize;
				const newArray = tmpAttributes[ name ];
				const newMorphArrays = tmpMorphAttributes[ name ];

				for ( let k = 0; k < itemSize; k ++ ) {

					const getterFunc = getters[ k ];
					const setterFunc = setters[ k ];
					newArray[ setterFunc ]( nextIndex, attribute[ getterFunc ]( index ) );

					if ( morphAttributes ) {

						for ( let m = 0, ml = morphAttributes.length; m < ml; m ++ ) {

							newMorphArrays[ m ][ setterFunc ]( nextIndex, morphAttributes[ m ][ getterFunc ]( index ) );

						}

					}

				}

			}

			hashToIndex[ hash ] = nextIndex;
			newIndices.push( nextIndex );
			nextIndex ++;

		}

	}

	// generate result BufferGeometry
	const result = geometry.clone();
	for ( const name in geometry.attributes ) {

		const tmpAttribute = tmpAttributes[ name ];

		result.setAttribute( name, new tmpAttribute.constructor(
			tmpAttribute.array.slice( 0, nextIndex * tmpAttribute.itemSize ),
			tmpAttribute.itemSize,
			tmpAttribute.normalized,
		) );

		if ( ! ( name in tmpMorphAttributes ) ) continue;

		for ( let j = 0; j < tmpMorphAttributes[ name ].length; j ++ ) {

			const tmpMorphAttribute = tmpMorphAttributes[ name ][ j ];

			result.morphAttributes[ name ][ j ] = new tmpMorphAttribute.constructor(
				tmpMorphAttribute.array.slice( 0, nextIndex * tmpMorphAttribute.itemSize ),
				tmpMorphAttribute.itemSize,
				tmpMorphAttribute.normalized,
			);

		}

	}

	// indices

	result.setIndex( newIndices );

	return result;

}

/**
 * Converts the given geometry to the `TrianglesDrawMode` draw mode, which
 * corresponds to the `gl.TRIANGLES` primitive in WebGL. The conversion only
 * rewrites the index, so the geometry is modified in place and returned.
 *
 * @param {BufferGeometry} geometry - The geometry to convert.
 * @param {number} drawMode - The current draw mode.
 * @return {BufferGeometry} The converted geometry using `TrianglesDrawMode`.
 */
function toTrianglesDrawMode( geometry, drawMode ) {

	if ( drawMode === TrianglesDrawMode ) {

		console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
		return geometry;

	}

	if ( drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode ) {

		let index = geometry.getIndex();

		// generate index if not present

		if ( index === null ) {

			const indices = [];

			const position = geometry.getAttribute( 'position' );

			if ( position !== undefined ) {

				for ( let i = 0; i < position.count; i ++ ) {

					indices.push( i );

				}

				geometry.setIndex( indices );
				index = geometry.getIndex();

			} else {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
				return geometry;

			}

		}

		//

		const numberOfTriangles = index.count - 2;
		const newIndices = [];

		if ( drawMode === TriangleFanDrawMode ) {

			// gl.TRIANGLE_FAN

			for ( let i = 1; i <= numberOfTriangles; i ++ ) {

				newIndices.push( index.getX( 0 ) );
				newIndices.push( index.getX( i ) );
				newIndices.push( index.getX( i + 1 ) );

			}

		} else {

			// gl.TRIANGLE_STRIP

			for ( let i = 0; i < numberOfTriangles; i ++ ) {

				if ( i % 2 === 0 ) {

					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i + 2 ) );

				} else {

					newIndices.push( index.getX( i + 2 ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i ) );

				}

			}

		}

		if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

		}

		// updated indices

		geometry.setIndex( newIndices );
		geometry.clearGroups();

		return geometry;

	} else {

		console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
		return geometry;

	}

}

/**
 * Calculates the morphed attributes of a morphed/skinned BufferGeometry.
 *
 * Helpful for Raytracing or Decals (i.e. a `DecalGeometry` applied to a morphed Object with a `BufferGeometry`
 * will use the original `BufferGeometry`, not the morphed/skinned one, generating an incorrect result.
 * Using this function to create a shadow `Object3D` the `DecalGeometry` can be correctly generated).
 *
 * @param {Mesh|Line|Points} object - The 3D object to compute morph attributes for.
 * @return {Object} An object with original position/normal attributes and morphed ones.
 */
let _boneTransformWarned = false;

function computeMorphedAttributes( object ) {

	const _vA = new Vector3();
	const _vB = new Vector3();
	const _vC = new Vector3();

	const _tempA = new Vector3();
	const _tempB = new Vector3();
	const _tempC = new Vector3();

	const _morphA = new Vector3();
	const _morphB = new Vector3();
	const _morphC = new Vector3();

	function _calculateMorphedAttributeData(
		object,
		attribute,
		morphAttribute,
		morphTargetsRelative,
		a,
		b,
		c,
		modifiedAttributeArray
	) {

		_vA.fromBufferAttribute( attribute, a );
		_vB.fromBufferAttribute( attribute, b );
		_vC.fromBufferAttribute( attribute, c );

		const morphInfluences = object.morphTargetInfluences;

		if ( morphAttribute && morphInfluences ) {

			_morphA.set( 0, 0, 0 );
			_morphB.set( 0, 0, 0 );
			_morphC.set( 0, 0, 0 );

			for ( let i = 0, il = morphAttribute.length; i < il; i ++ ) {

				const influence = morphInfluences[ i ];
				const morph = morphAttribute[ i ];

				if ( influence === 0 ) continue;

				_tempA.fromBufferAttribute( morph, a );
				_tempB.fromBufferAttribute( morph, b );
				_tempC.fromBufferAttribute( morph, c );

				if ( morphTargetsRelative ) {

					_morphA.addScaledVector( _tempA, influence );
					_morphB.addScaledVector( _tempB, influence );
					_morphC.addScaledVector( _tempC, influence );

				} else {

					_morphA.addScaledVector( _tempA.sub( _vA ), influence );
					_morphB.addScaledVector( _tempB.sub( _vB ), influence );
					_morphC.addScaledVector( _tempC.sub( _vC ), influence );

				}

			}

			_vA.add( _morphA );
			_vB.add( _morphB );
			_vC.add( _morphC );

		}

		if ( object.isSkinnedMesh ) {

			// r110 适配：官方 r185 为 applyBoneTransform（r111 起才有 boneTransform），
			// r110 核心无此方法，做保护性降级（跳过蒙皮变换并警告一次）
			if ( typeof object.boneTransform === 'function' ) {

				object.boneTransform( a, _vA );
				object.boneTransform( b, _vB );
				object.boneTransform( c, _vC );

			} else if ( _boneTransformWarned === false ) {

				console.warn( 'THREE.BufferGeometryUtils: computeMorphedAttributes() skinning skipped, SkinnedMesh.boneTransform is unavailable in this build (r110).' );
				_boneTransformWarned = true;

			}

		}

		modifiedAttributeArray[ a * 3 + 0 ] = _vA.x;
		modifiedAttributeArray[ a * 3 + 1 ] = _vA.y;
		modifiedAttributeArray[ a * 3 + 2 ] = _vA.z;
		modifiedAttributeArray[ b * 3 + 0 ] = _vB.x;
		modifiedAttributeArray[ b * 3 + 1 ] = _vB.y;
		modifiedAttributeArray[ b * 3 + 2 ] = _vB.z;
		modifiedAttributeArray[ c * 3 + 0 ] = _vC.x;
		modifiedAttributeArray[ c * 3 + 1 ] = _vC.y;
		modifiedAttributeArray[ c * 3 + 2 ] = _vC.z;

	}

	const geometry = object.geometry;
	const material = object.material;

	let a, b, c;
	const index = geometry.index;
	const positionAttribute = geometry.attributes.position;
	const morphPosition = geometry.morphAttributes.position;
	const morphTargetsRelative = geometry.morphTargetsRelative;
	const normalAttribute = geometry.attributes.normal;
	const morphNormal = geometry.morphAttributes.normal;

	const groups = geometry.groups;
	const drawRange = geometry.drawRange;
	let i, j, il, jl;
	let group;
	let start, end;

	const modifiedPosition = new Float32Array( positionAttribute.count * positionAttribute.itemSize );
	const modifiedNormal = new Float32Array( normalAttribute.count * normalAttribute.itemSize );

	if ( index !== null ) {

		// indexed buffer geometry

		if ( Array.isArray( material ) ) {

			for ( i = 0, il = groups.length; i < il; i ++ ) {

				group = groups[ i ];

				start = Math.max( group.start, drawRange.start );
				end = Math.min( ( group.start + group.count ), ( drawRange.start + drawRange.count ) );

				for ( j = start, jl = end; j < jl; j += 3 ) {

					a = index.getX( j );
					b = index.getX( j + 1 );
					c = index.getX( j + 2 );

					_calculateMorphedAttributeData(
						object,
						positionAttribute,
						morphPosition,
						morphTargetsRelative,
						a, b, c,
						modifiedPosition
					);

					_calculateMorphedAttributeData(
						object,
						normalAttribute,
						morphNormal,
						morphTargetsRelative,
						a, b, c,
						modifiedNormal
					);

				}

			}

		} else {

			start = Math.max( 0, drawRange.start );
			end = Math.min( index.count, ( drawRange.start + drawRange.count ) );

			for ( i = start, il = end; i < il; i += 3 ) {

				a = index.getX( i );
				b = index.getX( i + 1 );
				c = index.getX( i + 2 );

				_calculateMorphedAttributeData(
					object,
					positionAttribute,
					morphPosition,
					morphTargetsRelative,
					a, b, c,
					modifiedPosition
				);

				_calculateMorphedAttributeData(
					object,
					normalAttribute,
					morphNormal,
					morphTargetsRelative,
					a, b, c,
					modifiedNormal
				);

			}

		}

	} else {

		// non-indexed buffer geometry

		if ( Array.isArray( material ) ) {

			for ( i = 0, il = groups.length; i < il; i ++ ) {

				group = groups[ i ];

				start = Math.max( group.start, drawRange.start );
				end = Math.min( ( group.start + group.count ), ( drawRange.start + drawRange.count ) );

				for ( j = start, jl = end; j < jl; j += 3 ) {

					a = j;
					b = j + 1;
					c = j + 2;

					_calculateMorphedAttributeData(
						object,
						positionAttribute,
						morphPosition,
						morphTargetsRelative,
						a, b, c,
						modifiedPosition
					);

					_calculateMorphedAttributeData(
						object,
						normalAttribute,
						morphNormal,
						morphTargetsRelative,
						a, b, c,
						modifiedNormal
					);

				}

			}

		} else {

			start = Math.max( 0, drawRange.start );
			end = Math.min( positionAttribute.count, ( drawRange.start + drawRange.count ) );

			for ( i = start, il = end; i < il; i += 3 ) {

				a = i;
				b = i + 1;
				c = i + 2;

				_calculateMorphedAttributeData(
					object,
					positionAttribute,
					morphPosition,
					morphTargetsRelative,
					a, b, c,
					modifiedPosition
				);

				_calculateMorphedAttributeData(
					object,
					normalAttribute,
					morphNormal,
					morphTargetsRelative,
					a, b, c,
					modifiedNormal
				);

			}

		}

	}

	const morphedPositionAttribute = new Float32BufferAttribute( modifiedPosition, 3 );
	const morphedNormalAttribute = new Float32BufferAttribute( modifiedNormal, 3 );

	return {

		positionAttribute: positionAttribute,
		normalAttribute: normalAttribute,
		morphedPositionAttribute: morphedPositionAttribute,
		morphedNormalAttribute: morphedNormalAttribute

	};

}

/**
 * Merges the groups for the given geometry.
 *
 * @param {BufferGeometry} geometry - The geometry to modify.
 * @return {BufferGeometry} - The updated geometry
 */
function mergeGroups( geometry ) {

	if ( geometry.groups.length === 0 ) {

		console.warn( 'THREE.BufferGeometryUtils.mergeGroups(): No groups are defined. Nothing to merge.' );
		return geometry;

	}

	let groups = geometry.groups;

	// sort groups by material index

	groups = groups.sort( ( a, b ) => {

		if ( a.materialIndex !== b.materialIndex ) return a.materialIndex - b.materialIndex;

		return a.start - b.start;

	} );

	// create index for non-indexed geometries

	if ( geometry.getIndex() === null ) {

		const positionAttribute = geometry.getAttribute( 'position' );
		const indices = [];

		for ( let i = 0; i < positionAttribute.count; i += 3 ) {

			indices.push( i, i + 1, i + 2 );

		}

		geometry.setIndex( indices );

	}

	// sort index

	const index = geometry.getIndex();

	const newIndices = [];

	for ( let i = 0; i < groups.length; i ++ ) {

		const group = groups[ i ];

		const groupStart = group.start;
		const groupLength = groupStart + group.count;

		for ( let j = groupStart; j < groupLength; j ++ ) {

			newIndices.push( index.getX( j ) );

		}

	}

	geometry.dispose(); // Required to force buffer recreation
	geometry.setIndex( newIndices );

	// update groups indices

	let start = 0;

	for ( let i = 0; i < groups.length; i ++ ) {

		const group = groups[ i ];

		group.start = start;
		start += group.count;

	}

	// merge groups

	let currentGroup = groups[ 0 ];

	geometry.groups = [ currentGroup ];

	for ( let i = 1; i < groups.length; i ++ ) {

		const group = groups[ i ];

		if ( currentGroup.materialIndex === group.materialIndex ) {

			currentGroup.count += group.count;

		} else {

			currentGroup = group;
			geometry.groups.push( currentGroup );

		}

	}

	return geometry;

}

/**
 * Modifies the supplied geometry if it is non-indexed, otherwise creates a new,
 * non-indexed geometry. Returns the geometry with smooth normals everywhere except
 * faces that meet at an angle greater than the crease angle.
 *
 * @param {BufferGeometry} geometry - The geometry to modify.
 * @param {number} [creaseAngle=Math.PI/3] - The crease angle in radians.
 * @return {BufferGeometry} - The updated geometry
 */
function toCreasedNormals( geometry, creaseAngle = Math.PI / 3 /* 60 degrees */ ) {

	// BufferGeometry.toNonIndexed() warns if the geometry is non-indexed
	// and returns the original geometry
	const resultGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
	const posAttr = resultGeometry.attributes.position;
	const vertexCount = posAttr.count;

	let positions;

	if ( posAttr.isBufferAttribute === true && posAttr.itemSize === 3 && posAttr.normalized === false ) {

		positions = posAttr.array;

	} else {

		// flatten the position buffer so the math below operates on plain numbers
		positions = new Float64Array( vertexCount * 3 );

		for ( let i = 0; i < vertexCount; i ++ ) {

			positions[ 3 * i + 0 ] = posAttr.getX( i );
			positions[ 3 * i + 1 ] = posAttr.getY( i );
			positions[ 3 * i + 2 ] = posAttr.getZ( i );

		}

	}

	const creaseDot = Math.cos( creaseAngle );
	const hashMultiplier = ( 1 + 1e-10 ) * 1e2;
	const faceCount = vertexCount / 3;

	// compute the normal of each face
	const faceNormals = new Float64Array( faceCount * 3 );
	for ( let f = 0; f < faceCount; f ++ ) {

		const f9 = 9 * f;
		const ax = positions[ f9 + 0 ], ay = positions[ f9 + 1 ], az = positions[ f9 + 2 ];
		const bx = positions[ f9 + 3 ], by = positions[ f9 + 4 ], bz = positions[ f9 + 5 ];
		const cx = positions[ f9 + 6 ], cy = positions[ f9 + 7 ], cz = positions[ f9 + 8 ];

		const v1x = cx - bx, v1y = cy - by, v1z = cz - bz;
		const v2x = ax - bx, v2y = ay - by, v2z = az - bz;

		const nx = v1y * v2z - v1z * v2y;
		const ny = v1z * v2x - v1x * v2z;
		const nz = v1x * v2y - v1y * v2x;

		const invLength = 1 / ( Math.sqrt( nx * nx + ny * ny + nz * nz ) || 1 );
		faceNormals[ 3 * f + 0 ] = nx * invLength;
		faceNormals[ 3 * f + 1 ] = ny * invLength;
		faceNormals[ 3 * f + 2 ] = nz * invLength;

	}

	// assign an id to each vertex, sharing the id between vertices with the same
	// quantized position via an open-addressed hash table (slots hold id + 1, 0 means empty)
	const vertexIds = new Int32Array( vertexCount );
	const quantized = new Int32Array( vertexCount * 3 );

	let tableSize = 1;
	while ( tableSize < vertexCount * 2 ) tableSize <<= 1;
	const tableMask = tableSize - 1;
	const table = new Int32Array( tableSize );

	let uniqueCount = 0;
	for ( let i = 0; i < vertexCount; i ++ ) {

		const i3 = 3 * i;
		const qx = ~ ~ ( positions[ i3 + 0 ] * hashMultiplier );
		const qy = ~ ~ ( positions[ i3 + 1 ] * hashMultiplier );
		const qz = ~ ~ ( positions[ i3 + 2 ] * hashMultiplier );

		let slot = ( Math.imul( qx, 73856093 ) ^ Math.imul( qy, 19349663 ) ^ Math.imul( qz, 83492791 ) ) & tableMask;

		while ( true ) {

			const id = table[ slot ];

			if ( id === 0 ) {

				const q3 = 3 * uniqueCount;
				quantized[ q3 + 0 ] = qx;
				quantized[ q3 + 1 ] = qy;
				quantized[ q3 + 2 ] = qz;

				table[ slot ] = uniqueCount + 1;
				vertexIds[ i ] = uniqueCount ++;
				break;

			}

			const q3 = 3 * ( id - 1 );

			if ( quantized[ q3 + 0 ] === qx && quantized[ q3 + 1 ] === qy && quantized[ q3 + 2 ] === qz ) {

				vertexIds[ i ] = id - 1;
				break;

			}

			slot = ( slot + 1 ) & tableMask;

		}

	}

	// bucket the faces surrounding each unique vertex position
	const bucketOffsets = new Int32Array( uniqueCount + 1 );
	for ( let i = 0; i < vertexCount; i ++ ) bucketOffsets[ vertexIds[ i ] + 1 ] ++;
	for ( let i = 0; i < uniqueCount; i ++ ) bucketOffsets[ i + 1 ] += bucketOffsets[ i ];

	const bucketFaces = new Int32Array( vertexCount );
	const bucketCursors = bucketOffsets.slice( 0, uniqueCount );
	for ( let f = 0; f < faceCount; f ++ ) {

		const f3 = 3 * f;
		bucketFaces[ bucketCursors[ vertexIds[ f3 + 0 ] ] ++ ] = f;
		bucketFaces[ bucketCursors[ vertexIds[ f3 + 1 ] ] ++ ] = f;
		bucketFaces[ bucketCursors[ vertexIds[ f3 + 2 ] ] ++ ] = f;

	}

	// average the normals of the faces surrounding each vertex if they are within the
	// provided crease threshold
	const normalArray = new Float32Array( vertexCount * 3 );
	for ( let f = 0; f < faceCount; f ++ ) {

		const f3 = 3 * f;
		const nx = faceNormals[ f3 + 0 ];
		const ny = faceNormals[ f3 + 1 ];
		const nz = faceNormals[ f3 + 2 ];

		for ( let n = 0; n < 3; n ++ ) {

			const i = f3 + n;
			const id = vertexIds[ i ];

			let sumX = 0, sumY = 0, sumZ = 0;

			for ( let k = bucketOffsets[ id ], end = bucketOffsets[ id + 1 ]; k < end; k ++ ) {

				const o3 = 3 * bucketFaces[ k ];
				const ox = faceNormals[ o3 + 0 ];
				const oy = faceNormals[ o3 + 1 ];
				const oz = faceNormals[ o3 + 2 ];

				if ( nx * ox + ny * oy + nz * oz > creaseDot ) {

					sumX += ox;
					sumY += oy;
					sumZ += oz;

				}

			}

			const invLength = 1 / ( Math.sqrt( sumX * sumX + sumY * sumY + sumZ * sumZ ) || 1 );
			normalArray[ 3 * i + 0 ] = sumX * invLength;
			normalArray[ 3 * i + 1 ] = sumY * invLength;
			normalArray[ 3 * i + 2 ] = sumZ * invLength;

		}

	}

	resultGeometry.setAttribute( 'normal', new BufferAttribute( normalArray, 3, false ) );
	return resultGeometry;

}

/**
 * r110 保留函数：逐顶点切线计算（官方 r185 已移入核心 BufferGeometry.computeTangents，
 * r110 核心无此方法，examples（webgl_terrain_dynamic 等）仍消费，故原样保留）。
 *
 * @param {BufferGeometry} geometry - The geometry to compute tangents for.
 */
function computeTangents( geometry ) {

	const index = geometry.index;
	const attributes = geometry.attributes;

	// based on http://www.terathon.com/code/tangent.html
	// (per vertex tangents)

	if ( index === null ||
		 attributes.position === undefined ||
		 attributes.normal === undefined ||
		 attributes.uv === undefined ) {

		console.warn( 'THREE.BufferGeometryUtils: Missing required attributes (index, position, normal or uv) in BufferGeometryUtils.computeTangents()' );
		return;

	}

	const indices = index.array;
	const positions = attributes.position.array;
	const normals = attributes.normal.array;
	const uvs = attributes.uv.array;

	const nVertices = positions.length / 3;

	if ( attributes.tangent === undefined ) {

		geometry.setAttribute( 'tangent', new BufferAttribute( new Float32Array( 4 * nVertices ), 4 ) );

	}

	const tangents = attributes.tangent.array;

	const tan1 = [], tan2 = [];

	for ( let i = 0; i < nVertices; i ++ ) {

		tan1[ i ] = new Vector3();
		tan2[ i ] = new Vector3();

	}

	const vA = new Vector3(),
		vB = new Vector3(),
		vC = new Vector3(),

		uvA = new Vector2(),
		uvB = new Vector2(),
		uvC = new Vector2(),

		sdir = new Vector3(),
		tdir = new Vector3();

	function handleTriangle( a, b, c ) {

		vA.fromArray( positions, a * 3 );
		vB.fromArray( positions, b * 3 );
		vC.fromArray( positions, c * 3 );

		uvA.fromArray( uvs, a * 2 );
		uvB.fromArray( uvs, b * 2 );
		uvC.fromArray( uvs, c * 2 );

		const x1 = vB.x - vA.x;
		const x2 = vC.x - vA.x;

		const y1 = vB.y - vA.y;
		const y2 = vC.y - vA.y;

		const z1 = vB.z - vA.z;
		const z2 = vC.z - vA.z;

		const s1 = uvB.x - uvA.x;
		const s2 = uvC.x - uvA.x;

		const t1 = uvB.y - uvA.y;
		const t2 = uvC.y - uvA.y;

		const r = 1.0 / ( s1 * t2 - s2 * t1 );

		sdir.set(
			( t2 * x1 - t1 * x2 ) * r,
			( t2 * y1 - t1 * y2 ) * r,
			( t2 * z1 - t1 * z2 ) * r
		);

		tdir.set(
			( s1 * x2 - s2 * x1 ) * r,
			( s1 * y2 - s2 * y1 ) * r,
			( s1 * z2 - s2 * z1 ) * r
		);

		tan1[ a ].add( sdir );
		tan1[ b ].add( sdir );
		tan1[ c ].add( sdir );

		tan2[ a ].add( tdir );
		tan2[ b ].add( tdir );
		tan2[ c ].add( tdir );

	}

	let groups = geometry.groups;

	if ( groups.length === 0 ) {

		groups = [ {
			start: 0,
			count: indices.length
		} ];

	}

	for ( let i = 0, il = groups.length; i < il; ++ i ) {

		const group = groups[ i ];

		const start = group.start;
		const count = group.count;

		for ( let j = start, jl = start + count; j < jl; j += 3 ) {

			handleTriangle(
				indices[ j + 0 ],
				indices[ j + 1 ],
				indices[ j + 2 ]
			);

		}

	}

	const tmp = new Vector3(), tmp2 = new Vector3();
	const n = new Vector3(), n2 = new Vector3();
	let w, t, test;

	function handleVertex( v ) {

		n.fromArray( normals, v * 3 );
		n2.copy( n );

		t = tan1[ v ];

		// Gram-Schmidt orthogonalize

		tmp.copy( t );
		tmp.sub( n.multiplyScalar( n.dot( t ) ) ).normalize();

		// Calculate handedness

		tmp2.crossVectors( n2, t );
		test = tmp2.dot( tan2[ v ] );
		w = ( test < 0.0 ) ? - 1.0 : 1.0;

		tangents[ v * 4 ] = tmp.x;
		tangents[ v * 4 + 1 ] = tmp.y;
		tangents[ v * 4 + 2 ] = tmp.z;
		tangents[ v * 4 + 3 ] = w;

	}

	for ( let i = 0, il = groups.length; i < il; ++ i ) {

		const group = groups[ i ];

		const start = group.start;
		const count = group.count;

		for ( let j = start, jl = start + count; j < jl; j += 3 ) {

			handleVertex( indices[ j + 0 ] );
			handleVertex( indices[ j + 1 ] );
			handleVertex( indices[ j + 2 ] );

		}

	}

}

// r110 兼容别名（升级差距分析说明 3.0 §2.4 移植思路第 3 条）
const mergeBufferGeometries = mergeGeometries;
const mergeBufferAttributes = mergeAttributes;

// 旧版命名空间对象导出，业务/单测经 `BufferGeometryUtils.xxx` 调用零改动
const BufferGeometryUtils = {
	computeTangents,
	mergeGeometries,
	mergeBufferGeometries,
	mergeAttributes,
	mergeBufferAttributes,
	deepCloneAttribute,
	deinterleaveAttribute,
	deinterleaveGeometry,
	interleaveAttributes,
	estimateBytesUsed,
	mergeVertices,
	toTrianglesDrawMode,
	computeMorphedAttributes,
	mergeGroups,
	toCreasedNormals,
};

export {
	BufferGeometryUtils,
	computeTangents,
	mergeGeometries,
	mergeBufferGeometries,
	mergeAttributes,
	mergeBufferAttributes,
	deepCloneAttribute,
	deinterleaveAttribute,
	deinterleaveGeometry,
	interleaveAttributes,
	estimateBytesUsed,
	mergeVertices,
	toTrianglesDrawMode,
	computeMorphedAttributes,
	mergeGroups,
	toCreasedNormals,
};
