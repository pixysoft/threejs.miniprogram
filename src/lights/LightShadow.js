/**
 * 灯光阴影配置：阴影相机、深度偏移、法线偏移与阴影贴图参数。
 * Directional / Spot / Point 共用此基类。
 */
import { Matrix4 } from '../math/Matrix4.js';
import { Vector2 } from '../math/Vector2.js';
import { Vector3 } from '../math/Vector3.js';
import { Vector4 } from '../math/Vector4.js';
import { Frustum } from '../math/Frustum.js';

/**
 * @param {Camera} camera 灯光看向场景的阴影相机
 */
function LightShadow( camera ) {

	this.camera = camera;

	this.bias = 0;
	this.radius = 1;
	/** 沿表面世界法线偏移采样点，减轻阴影 acne，三种灯共用 */
	this.normalBias = 0;

	this.mapSize = new Vector2( 512, 512 );

	this.map = null;
	this.mapPass = null;
	this.matrix = new Matrix4();

	this._frustum = new Frustum();
	this._frameExtents = new Vector2( 1, 1 );

	this._viewportCount = 1;

	this._viewports = [

		new Vector4( 0, 0, 1, 1 )

	];

}

Object.assign( LightShadow.prototype, {

	_projScreenMatrix: new Matrix4(),

	_lightPositionWorld: new Vector3(),

	_lookTarget: new Vector3(),

	/**
	 * @returns {number} 本阴影需要绘制的视口数量
	 */
	getViewportCount: function () {

		return this._viewportCount;

	},

	/**
	 * @returns {Frustum} 阴影相机视锥，供渲染器裁剪
	 */
	getFrustum: function () {

		return this._frustum;

	},

	/**
	 * 根据灯光位姿更新阴影相机、视锥与 shadow matrix。
	 * @param {Light} light 带 target 的灯光
	 */
	updateMatrices: function ( light ) {

		var shadowCamera = this.camera,
			shadowMatrix = this.matrix,
			projScreenMatrix = this._projScreenMatrix,
			lookTarget = this._lookTarget,
			lightPositionWorld = this._lightPositionWorld;

		lightPositionWorld.setFromMatrixPosition( light.matrixWorld );
		shadowCamera.position.copy( lightPositionWorld );

		lookTarget.setFromMatrixPosition( light.target.matrixWorld );
		shadowCamera.lookAt( lookTarget );
		shadowCamera.updateMatrixWorld();

		projScreenMatrix.multiplyMatrices( shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse );
		this._frustum.setFromMatrix( projScreenMatrix );

		shadowMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);

		shadowMatrix.multiply( shadowCamera.projectionMatrix );
		shadowMatrix.multiply( shadowCamera.matrixWorldInverse );

	},

	/**
	 * @param {number} viewportIndex 视口下标
	 * @returns {Vector4} 该视口的归一化矩形
	 */
	getViewport: function ( viewportIndex ) {

		return this._viewports[ viewportIndex ];

	},

	/**
	 * @returns {Vector2} 阴影图集帧范围
	 */
	getFrameExtents: function () {

		return this._frameExtents;

	},

	/**
	 * @param {LightShadow} source 源阴影配置
	 * @returns {LightShadow} this
	 */
	copy: function ( source ) {

		this.camera = source.camera.clone();

		this.bias = source.bias;
		this.radius = source.radius;
		this.normalBias = source.normalBias;

		this.mapSize.copy( source.mapSize );

		return this;

	},

	/**
	 * @returns {LightShadow} 拷贝后的新实例
	 */
	clone: function () {

		return new this.constructor().copy( this );

	},

	/**
	 * @returns {Object} 可被 ObjectLoader 解析的 JSON（仅序列化非默认值）
	 */
	toJSON: function () {

		var object = {};

		if ( this.bias !== 0 ) object.bias = this.bias;
		if ( this.radius !== 1 ) object.radius = this.radius;
		if ( this.normalBias !== 0 ) object.normalBias = this.normalBias;
		if ( this.mapSize.x !== 512 || this.mapSize.y !== 512 ) object.mapSize = this.mapSize.toArray();

		object.camera = this.camera.toJSON( false ).object;
		delete object.camera.matrix;

		return object;

	}

} );


export { LightShadow };
