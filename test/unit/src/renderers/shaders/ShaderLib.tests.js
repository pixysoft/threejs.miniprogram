/**
 * @author TristanVALCKE / https://github.com/Itee
 */
/* global QUnit */

import { ShaderChunk } from '../../../../../src/renderers/shaders/ShaderChunk';
import { ShaderLib } from '../../../../../src/renderers/shaders/ShaderLib';
import { UniformsLib } from '../../../../../src/renderers/shaders/UniformsLib';

function glslBraceBalance( src ) {

	var n = 0;

	for ( var i = 0; i < src.length; i ++ ) {

		if ( src[ i ] === '{' ) n ++;
		else if ( src[ i ] === '}' ) n --;
		if ( n < 0 ) return n;

	}

	return n;

}

export default QUnit.module( 'Renderers', () => {

	QUnit.module( 'Shaders', () => {

		QUnit.module( 'ShaderLib', () => {

			QUnit.test( 'shadow normalBias uniforms', ( assert ) => {

				var lights = UniformsLib.lights;

				assert.ok( lights.directionalShadowNormalBias, "UniformsLib 有 directionalShadowNormalBias" );
				assert.ok( lights.spotShadowNormalBias, "UniformsLib 有 spotShadowNormalBias" );
				assert.ok( lights.pointShadowNormalBias, "UniformsLib 有 pointShadowNormalBias" );
				assert.ok( Array.isArray( lights.directionalShadowNormalBias.value ), "方向光 bias value 是数组" );
				assert.ok( Array.isArray( lights.spotShadowNormalBias.value ), "聚光 bias value 是数组" );
				assert.ok( Array.isArray( lights.pointShadowNormalBias.value ), "点光 bias value 是数组" );

			} );

			QUnit.test( 'shadowmap vertex chunks', ( assert ) => {

				var pars = ShaderChunk.shadowmap_pars_vertex;
				var vert = ShaderChunk.shadowmap_vertex;
				var shadowVert = ShaderLib.shadow.vertexShader;

				assert.ok( pars.indexOf( 'directionalShadowNormalBias' ) !== - 1, "pars 声明方向光 normalBias" );
				assert.ok( pars.indexOf( 'spotShadowNormalBias' ) !== - 1, "pars 声明聚光 normalBias" );
				assert.ok( pars.indexOf( 'pointShadowNormalBias' ) !== - 1, "pars 声明点光 normalBias" );

				assert.ok( vert.indexOf( 'shadowWorldNormal' ) !== - 1, "vertex 计算 shadowWorldNormal" );
				assert.ok( vert.indexOf( 'directionalShadowNormalBias' ) !== - 1, "vertex 应用方向光 normalBias" );
				assert.ok( vert.indexOf( 'spotShadowNormalBias' ) !== - 1, "vertex 应用聚光 normalBias" );
				assert.ok( vert.indexOf( 'pointShadowNormalBias' ) !== - 1, "vertex 应用点光 normalBias" );

				assert.equal( glslBraceBalance( pars ), 0, "pars 大括号配对" );
				assert.equal( glslBraceBalance( vert ), 0, "vertex 大括号配对" );
				assert.equal( glslBraceBalance( shadowVert ), 0, "shadow_vert 大括号配对" );

				assert.ok( shadowVert.indexOf( 'beginnormal_vertex' ) !== - 1, "ShadowMaterial 含 beginnormal_vertex" );
				assert.ok( shadowVert.indexOf( 'defaultnormal_vertex' ) !== - 1, "ShadowMaterial 含 defaultnormal_vertex" );
				assert.ok( shadowVert.indexOf( '<common>' ) !== - 1, "ShadowMaterial 含 common（inverseTransformDirection）" );

			} );

			QUnit.test( 'shadow vertex expands without missing symbols', ( assert ) => {

				function expand( src ) {

					return src.replace( /#include <([\w]+)>/g, function ( match, name ) {

						if ( ShaderChunk[ name ] === undefined ) return match;
						return expand( ShaderChunk[ name ] );

					} );

				}

				var expandedShadow = expand( ShaderLib.shadow.vertexShader );

				assert.ok( expandedShadow.indexOf( '#include <' ) === - 1, "ShadowMaterial 顶点 include 全部展开" );
				assert.ok( expandedShadow.indexOf( 'transformedNormal' ) !== - 1, "展开后有 transformedNormal" );
				assert.ok( expandedShadow.indexOf( 'inverseTransformDirection' ) !== - 1, "展开后有 inverseTransformDirection" );
				assert.ok( expandedShadow.indexOf( 'directionalShadowNormalBias' ) !== - 1, "展开后使用方向光 normalBias" );
				assert.equal( glslBraceBalance( expandedShadow ), 0, "展开后大括号配对" );

				var expandedPhong = expand( ShaderLib.phong.vertexShader );

				assert.ok( expandedPhong.indexOf( 'spotShadowNormalBias' ) !== - 1, "Phong 展开后有聚光 normalBias" );
				assert.ok( expandedPhong.indexOf( 'pointShadowNormalBias' ) !== - 1, "Phong 展开后有点光 normalBias" );
				assert.equal( glslBraceBalance( expandedPhong ), 0, "Phong 顶点展开后大括号配对" );

			} );

			QUnit.test( 'getShadow signature unchanged', ( assert ) => {

				var frag = ShaderChunk.shadowmap_pars_fragment;

				assert.ok( frag.indexOf( 'float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float radius, vec4 shadowCoord )' ) !== - 1 ||
					frag.indexOf( 'float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord )' ) !== - 1,
				"getShadow 仍是五参数" );

			} );

		} );

	} );

} );
