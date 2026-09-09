/**
 * 把场景灯光整理成 shader uniform 状态。
 * 阴影矩阵与 normalBias 共用下标：投射阴影的灯排前，数组截到阴影数量。
 *
 * @author mrdoob / http://mrdoob.com/
 */

import { Color } from '../../math/Color.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { Vector2 } from '../../math/Vector2.js';
import { Vector3 } from '../../math/Vector3.js';

/**
 * 按灯光 id 缓存 fragment 侧 light struct 对象，避免每帧分配。
 * @returns {{ get: function(Light): Object }} get(light) 返回该灯的 uniforms 引用
 */
function UniformsCache() {

	var lights = {};

	return {

		/**
		 * @param {Light} light 场景中的灯
		 * @returns {Object} 该灯可写入 shader 的 struct 字段
		 */
		get: function ( light ) {

			if ( lights[ light.id ] !== undefined ) {

				return lights[ light.id ];

			}

			var uniforms;

			switch ( light.type ) {

				case 'DirectionalLight':
					uniforms = {
						direction: new Vector3(),
						color: new Color(),

						shadow: false,
						shadowBias: 0,
						shadowRadius: 1,
						shadowMapSize: new Vector2()
					};
					break;

				case 'SpotLight':
					uniforms = {
						position: new Vector3(),
						direction: new Vector3(),
						color: new Color(),
						distance: 0,
						coneCos: 0,
						penumbraCos: 0,
						decay: 0,

						shadow: false,
						shadowBias: 0,
						shadowRadius: 1,
						shadowMapSize: new Vector2()
					};
					break;

				case 'PointLight':
					uniforms = {
						position: new Vector3(),
						color: new Color(),
						distance: 0,
						decay: 0,

						shadow: false,
						shadowBias: 0,
						shadowRadius: 1,
						shadowMapSize: new Vector2(),
						shadowCameraNear: 1,
						shadowCameraFar: 1000
					};
					break;

				case 'HemisphereLight':
					uniforms = {
						direction: new Vector3(),
						skyColor: new Color(),
						groundColor: new Color()
					};
					break;

				case 'RectAreaLight':
					uniforms = {
						color: new Color(),
						position: new Vector3(),
						halfWidth: new Vector3(),
						halfHeight: new Vector3()
						// TODO (abelnation): set RectAreaLight shadow uniforms
					};
					break;

			}

			lights[ light.id ] = uniforms;

			return uniforms;

		}

	};

}

var nextVersion = 0;

/**
 * 投射阴影的灯排在前面，保证 *Shadow* 数组下标 0..N-1 与 shader 循环一致。
 * @param {Light} lightA
 * @param {Light} lightB
 * @returns {number} 排序权重差
 */
function shadowCastingLightsFirst( lightA, lightB ) {

	return ( lightB.castShadow ? 1 : 0 ) - ( lightA.castShadow ? 1 : 0 );

}

/**
 * @returns {{ setup: function, state: Object }} setup 填充 state；state 供 WebGLRenderer 绑 uniform
 */
function WebGLLights() {

	var cache = new UniformsCache();

	var state = {

		version: 0,

		hash: {
			directionalLength: - 1,
			pointLength: - 1,
			spotLength: - 1,
			rectAreaLength: - 1,
			hemiLength: - 1,

			numDirectionalShadows: - 1,
			numPointShadows: - 1,
			numSpotShadows: - 1,
		},

		ambient: [ 0, 0, 0 ],
		probe: [],
		directional: [],
		directionalShadowMap: [],
		directionalShadowMatrix: [],
		directionalShadowNormalBias: [],
		spot: [],
		spotShadowMap: [],
		spotShadowMatrix: [],
		spotShadowNormalBias: [],
		rectArea: [],
		point: [],
		pointShadowMap: [],
		pointShadowMatrix: [],
		pointShadowNormalBias: [],
		hemi: [],

		numDirectionalShadows: - 1,
		numPointShadows: - 1,
		numSpotShadows: - 1

	};

	for ( var i = 0; i < 9; i ++ ) state.probe.push( new Vector3() );

	var vector3 = new Vector3();
	var matrix4 = new Matrix4();
	var matrix42 = new Matrix4();

	/**
	 * 按当前灯光列表写入 state（颜色、方向、阴影图、矩阵、normalBias）。
	 * @param {Light[]} lights 本帧灯光
	 * @param {Light[]} shadows 投射阴影的灯（本仓库未使用，保持签名）
	 * @param {Camera} camera 当前渲染相机（取 viewMatrix）
	 */
	function setup( lights, shadows, camera ) {

		var r = 0, g = 0, b = 0;

		for ( var i = 0; i < 9; i ++ ) state.probe[ i ].set( 0, 0, 0 );

		var directionalLength = 0;
		var pointLength = 0;
		var spotLength = 0;
		var rectAreaLength = 0;
		var hemiLength = 0;

		var numDirectionalShadows = 0;
		var numPointShadows = 0;
		var numSpotShadows = 0;

		var viewMatrix = camera.matrixWorldInverse;

		lights.sort( shadowCastingLightsFirst );

		for ( var i = 0, l = lights.length; i < l; i ++ ) {

			var light = lights[ i ];

			var color = light.color;
			var intensity = light.intensity;
			var distance = light.distance;

			var shadowMap = ( light.shadow && light.shadow.map ) ? light.shadow.map.texture : null;

			if ( light.isAmbientLight ) {

				r += color.r * intensity;
				g += color.g * intensity;
				b += color.b * intensity;

			} else if ( light.isLightProbe ) {

				for ( var j = 0; j < 9; j ++ ) {

					state.probe[ j ].addScaledVector( light.sh.coefficients[ j ], intensity );

				}

			} else if ( light.isDirectionalLight ) {

				var uniforms = cache.get( light );

				uniforms.color.copy( light.color ).multiplyScalar( light.intensity );
				uniforms.direction.setFromMatrixPosition( light.matrixWorld );
				vector3.setFromMatrixPosition( light.target.matrixWorld );
				uniforms.direction.sub( vector3 );
				uniforms.direction.transformDirection( viewMatrix );

				uniforms.shadow = light.castShadow;

				if ( light.castShadow ) {

					var shadow = light.shadow;

					uniforms.shadowBias = shadow.bias;
					uniforms.shadowRadius = shadow.radius;
					uniforms.shadowMapSize = shadow.mapSize;

					state.directionalShadowMap[ directionalLength ] = shadowMap;
					state.directionalShadowMatrix[ directionalLength ] = light.shadow.matrix;
					state.directionalShadowNormalBias[ directionalLength ] = shadow.normalBias;

					numDirectionalShadows ++;

				}

				state.directional[ directionalLength ] = uniforms;

				directionalLength ++;

			} else if ( light.isSpotLight ) {

				var uniforms = cache.get( light );

				uniforms.position.setFromMatrixPosition( light.matrixWorld );
				uniforms.position.applyMatrix4( viewMatrix );

				uniforms.color.copy( color ).multiplyScalar( intensity );
				uniforms.distance = distance;

				uniforms.direction.setFromMatrixPosition( light.matrixWorld );
				vector3.setFromMatrixPosition( light.target.matrixWorld );
				uniforms.direction.sub( vector3 );
				uniforms.direction.transformDirection( viewMatrix );

				uniforms.coneCos = Math.cos( light.angle );
				uniforms.penumbraCos = Math.cos( light.angle * ( 1 - light.penumbra ) );
				uniforms.decay = light.decay;

				uniforms.shadow = light.castShadow;

				if ( light.castShadow ) {

					var shadow = light.shadow;

					uniforms.shadowBias = shadow.bias;
					uniforms.shadowRadius = shadow.radius;
					uniforms.shadowMapSize = shadow.mapSize;

					state.spotShadowMap[ spotLength ] = shadowMap;
					state.spotShadowMatrix[ spotLength ] = light.shadow.matrix;
					state.spotShadowNormalBias[ spotLength ] = shadow.normalBias;

					numSpotShadows ++;

				}

				state.spot[ spotLength ] = uniforms;

				spotLength ++;

			} else if ( light.isRectAreaLight ) {

				var uniforms = cache.get( light );

				// (a) intensity is the total visible light emitted
				//uniforms.color.copy( color ).multiplyScalar( intensity / ( light.width * light.height * Math.PI ) );

				// (b) intensity is the brightness of the light
				uniforms.color.copy( color ).multiplyScalar( intensity );

				uniforms.position.setFromMatrixPosition( light.matrixWorld );
				uniforms.position.applyMatrix4( viewMatrix );

				// extract local rotation of light to derive width/height half vectors
				matrix42.identity();
				matrix4.copy( light.matrixWorld );
				matrix4.premultiply( viewMatrix );
				matrix42.extractRotation( matrix4 );

				uniforms.halfWidth.set( light.width * 0.5, 0.0, 0.0 );
				uniforms.halfHeight.set( 0.0, light.height * 0.5, 0.0 );

				uniforms.halfWidth.applyMatrix4( matrix42 );
				uniforms.halfHeight.applyMatrix4( matrix42 );

				// TODO (abelnation): RectAreaLight distance?
				// uniforms.distance = distance;

				state.rectArea[ rectAreaLength ] = uniforms;

				rectAreaLength ++;

			} else if ( light.isPointLight ) {

				var uniforms = cache.get( light );

				uniforms.position.setFromMatrixPosition( light.matrixWorld );
				uniforms.position.applyMatrix4( viewMatrix );

				uniforms.color.copy( light.color ).multiplyScalar( light.intensity );
				uniforms.distance = light.distance;
				uniforms.decay = light.decay;

				uniforms.shadow = light.castShadow;

				if ( light.castShadow ) {

					var shadow = light.shadow;

					uniforms.shadowBias = shadow.bias;
					uniforms.shadowRadius = shadow.radius;
					uniforms.shadowMapSize = shadow.mapSize;
					uniforms.shadowCameraNear = shadow.camera.near;
					uniforms.shadowCameraFar = shadow.camera.far;

					state.pointShadowMap[ pointLength ] = shadowMap;
					state.pointShadowMatrix[ pointLength ] = light.shadow.matrix;
					state.pointShadowNormalBias[ pointLength ] = shadow.normalBias;

					numPointShadows ++;

				}

				state.point[ pointLength ] = uniforms;

				pointLength ++;

			} else if ( light.isHemisphereLight ) {

				var uniforms = cache.get( light );

				uniforms.direction.setFromMatrixPosition( light.matrixWorld );
				uniforms.direction.transformDirection( viewMatrix );
				uniforms.direction.normalize();

				uniforms.skyColor.copy( light.color ).multiplyScalar( intensity );
				uniforms.groundColor.copy( light.groundColor ).multiplyScalar( intensity );

				state.hemi[ hemiLength ] = uniforms;

				hemiLength ++;

			}

		}

		state.ambient[ 0 ] = r;
		state.ambient[ 1 ] = g;
		state.ambient[ 2 ] = b;

		var hash = state.hash;

		if ( hash.directionalLength !== directionalLength ||
			hash.pointLength !== pointLength ||
			hash.spotLength !== spotLength ||
			hash.rectAreaLength !== rectAreaLength ||
			hash.hemiLength !== hemiLength ||
			hash.numDirectionalShadows !== numDirectionalShadows ||
			hash.numPointShadows !== numPointShadows ||
			hash.numSpotShadows !== numSpotShadows ) {

			state.directional.length = directionalLength;
			state.spot.length = spotLength;
			state.rectArea.length = rectAreaLength;
			state.point.length = pointLength;
			state.hemi.length = hemiLength;

			state.directionalShadowMap.length = numDirectionalShadows;
			state.pointShadowMap.length = numPointShadows;
			state.spotShadowMap.length = numSpotShadows;
			state.directionalShadowMatrix.length = numDirectionalShadows;
			state.directionalShadowNormalBias.length = numDirectionalShadows;
			state.pointShadowMatrix.length = numPointShadows;
			state.pointShadowNormalBias.length = numPointShadows;
			state.spotShadowMatrix.length = numSpotShadows;
			state.spotShadowNormalBias.length = numSpotShadows;

			hash.directionalLength = directionalLength;
			hash.pointLength = pointLength;
			hash.spotLength = spotLength;
			hash.rectAreaLength = rectAreaLength;
			hash.hemiLength = hemiLength;

			hash.numDirectionalShadows = numDirectionalShadows;
			hash.numPointShadows = numPointShadows;
			hash.numSpotShadows = numSpotShadows;

			state.version = nextVersion ++;

		}

	}

	return {
		setup: setup,
		state: state
	};

}


export { WebGLLights };
