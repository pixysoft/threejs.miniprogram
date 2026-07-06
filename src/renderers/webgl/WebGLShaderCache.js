/**
 * backport from r185(阶段三 4.2#3): shader 源码级缓存。
 * 自定义 ShaderMaterial 的 program cacheKey 由"完整 GLSL 源文本"退化为
 * 递增 id, 大量自定义材质(后处理 Pass 等)时 key 构建与比对成本从 O(源码长度)
 * 降为 O(1); 与 GL 版本无关。
 */

var _id = 0;

function WebGLShaderStage( code ) {

	this.id = _id ++;

	this.code = code;
	this.usedTimes = 0;

}

function WebGLShaderCache() {

	this.shaderCache = new Map();
	this.materialCache = new Map();

}

Object.assign( WebGLShaderCache.prototype, {

	update: function ( material ) {

		var vertexShader = material.vertexShader;
		var fragmentShader = material.fragmentShader;

		var vertexShaderStage = this._getShaderStage( vertexShader );
		var fragmentShaderStage = this._getShaderStage( fragmentShader );

		var materialShaders = this._getShaderCacheForMaterial( material );

		if ( materialShaders.has( vertexShaderStage ) === false ) {

			materialShaders.add( vertexShaderStage );
			vertexShaderStage.usedTimes ++;

		}

		if ( materialShaders.has( fragmentShaderStage ) === false ) {

			materialShaders.add( fragmentShaderStage );
			fragmentShaderStage.usedTimes ++;

		}

		return this;

	},

	remove: function ( material ) {

		var materialShaders = this.materialCache.get( material );

		if ( materialShaders !== undefined ) {

			materialShaders.forEach( function ( shaderStage ) {

				shaderStage.usedTimes --;

				if ( shaderStage.usedTimes === 0 ) this.shaderCache.delete( shaderStage.code );

			}, this );

			this.materialCache.delete( material );

		}

		return this;

	},

	getVertexShaderID: function ( material ) {

		return this._getShaderStage( material.vertexShader ).id;

	},

	getFragmentShaderID: function ( material ) {

		return this._getShaderStage( material.fragmentShader ).id;

	},

	dispose: function () {

		this.shaderCache.clear();
		this.materialCache.clear();

	},

	_getShaderCacheForMaterial: function ( material ) {

		var cache = this.materialCache;
		var set = cache.get( material );

		if ( set === undefined ) {

			set = new Set();
			cache.set( material, set );

		}

		return set;

	},

	_getShaderStage: function ( code ) {

		var cache = this.shaderCache;
		var stage = cache.get( code );

		if ( stage === undefined ) {

			stage = new WebGLShaderStage( code );
			cache.set( code, stage );

		}

		return stage;

	}

} );

export { WebGLShaderCache };
