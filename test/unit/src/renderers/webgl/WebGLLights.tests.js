/**
 * @author TristanVALCKE / https://github.com/Itee
 */
/* global QUnit */

import { WebGLLights } from '../../../../../src/renderers/webgl/WebGLLights';
import { DirectionalLight } from '../../../../../src/lights/DirectionalLight';
import { SpotLight } from '../../../../../src/lights/SpotLight';
import { PointLight } from '../../../../../src/lights/PointLight';
import { PerspectiveCamera } from '../../../../../src/cameras/PerspectiveCamera';

export default QUnit.module( 'Renderers', () => {

	QUnit.module( 'WebGL', () => {

		QUnit.module( 'WebGLLights', () => {

			QUnit.test( "Instancing", ( assert ) => {

				var lights = new WebGLLights();

				assert.ok( lights.state, "state 存在" );
				assert.ok( typeof lights.setup === 'function', "setup 可调用" );
				assert.deepEqual( lights.state.directionalShadowNormalBias, [], "directionalShadowNormalBias 初始空数组" );
				assert.deepEqual( lights.state.spotShadowNormalBias, [], "spotShadowNormalBias 初始空数组" );
				assert.deepEqual( lights.state.pointShadowNormalBias, [], "pointShadowNormalBias 初始空数组" );

			} );

			QUnit.test( "setup", ( assert ) => {

				var webglLights = new WebGLLights();
				var camera = new PerspectiveCamera();
				camera.updateMatrixWorld();

				var dir = new DirectionalLight();
				dir.castShadow = true;
				dir.shadow.normalBias = 0.05;
				dir.updateMatrixWorld();

				var spot = new SpotLight();
				spot.castShadow = true;
				spot.shadow.normalBias = 0.02;
				spot.updateMatrixWorld();
				spot.target.updateMatrixWorld();

				var point = new PointLight();
				point.castShadow = true;
				point.shadow.normalBias = 0.03;
				point.updateMatrixWorld();

				webglLights.setup( [ dir, spot, point ], [ dir, spot, point ], camera );

				var state = webglLights.state;

				assert.equal( state.directionalShadowNormalBias.length, 1, "方向光阴影数组长度为 1" );
				assert.equal( state.spotShadowNormalBias.length, 1, "聚光阴影数组长度为 1" );
				assert.equal( state.pointShadowNormalBias.length, 1, "点光阴影数组长度为 1" );
				assert.equal( state.directionalShadowNormalBias[ 0 ], 0.05, "方向光 normalBias 写入" );
				assert.equal( state.spotShadowNormalBias[ 0 ], 0.02, "聚光 normalBias 写入" );
				assert.equal( state.pointShadowNormalBias[ 0 ], 0.03, "点光 normalBias 写入" );
				assert.equal( state.directionalShadowMatrix.length, state.directionalShadowNormalBias.length, "方向光 bias 与 matrix 长度一致" );
				assert.equal( state.spotShadowMatrix.length, state.spotShadowNormalBias.length, "聚光 bias 与 matrix 长度一致" );
				assert.equal( state.pointShadowMatrix.length, state.pointShadowNormalBias.length, "点光 bias 与 matrix 长度一致" );

			} );

			QUnit.test( "state", ( assert ) => {

				var webglLights = new WebGLLights();
				var camera = new PerspectiveCamera();
				camera.updateMatrixWorld();

				var caster = new DirectionalLight();
				caster.castShadow = true;
				caster.shadow.normalBias = 0.08;
				caster.updateMatrixWorld();

				var idle = new DirectionalLight();
				idle.castShadow = false;
				idle.updateMatrixWorld();

				webglLights.setup( [ idle, caster ], [], camera );

				assert.equal( webglLights.state.directionalShadowNormalBias.length, 1, "仅投射阴影的灯进入 bias 数组" );
				assert.equal( webglLights.state.directionalShadowNormalBias[ 0 ], 0.08, "排序后下标 0 是投射阴影的灯" );

				webglLights.setup( [ idle ], [], camera );

				assert.equal( webglLights.state.directionalShadowNormalBias.length, 0, "删减灯光后数组被截断" );
				assert.equal( webglLights.state.spotShadowNormalBias.length, 0, "无聚光时 spot 数组长度为 0" );
				assert.equal( webglLights.state.pointShadowNormalBias.length, 0, "无点光时 point 数组长度为 0" );

			} );

		} );

	} );

} );
