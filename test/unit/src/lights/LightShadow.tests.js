/**
 * @author TristanVALCKE / https://github.com/Itee
 * @author moraxy / https://github.com/moraxy
 */
/* global QUnit */

import { LightShadow } from '../../../../src/lights/LightShadow';
import { OrthographicCamera } from '../../../../src/cameras/OrthographicCamera';
import { DirectionalLight } from '../../../../src/lights/DirectionalLight';
import { ObjectLoader } from '../../../../src/loaders/ObjectLoader';

export default QUnit.module( 'Lights', () => {

	QUnit.module( 'LightShadow', () => {

		QUnit.test( "Instancing", ( assert ) => {

			var shadow = new LightShadow( new OrthographicCamera( - 5, 5, 5, - 5, 0.5, 500 ) );

			assert.equal( shadow.normalBias, 0, "normalBias 默认 0，旧调用不受影响" );
			assert.equal( shadow.bias, 0, "bias 默认仍为 0" );
			assert.equal( shadow.radius, 1, "radius 默认仍为 1" );

		} );

		QUnit.test( "clone/copy", ( assert ) => {

			var a = new LightShadow( new OrthographicCamera( - 5, 5, 5, - 5, 0.5, 500 ) );
			var b = new LightShadow( new OrthographicCamera( - 3, 3, 3, - 3, 0.3, 300 ) );
			var c;

			assert.notDeepEqual( a, b, "Newly instanced shadows are not equal" );

			c = a.clone();
			assert.smartEqual( a, c, "Shadows are identical after clone()" );
			assert.equal( c.normalBias, 0, "clone 带上默认 normalBias" );

			a.normalBias = 0.05;
			c = a.clone();
			assert.equal( c.normalBias, 0.05, "clone 复制 non-default normalBias" );

			c.mapSize.set( 256, 256 );
			assert.notDeepEqual( a, c, "Shadows are different again after change" );

			b.copy( a );
			assert.smartEqual( a, b, "Shadows are identical after copy()" );
			assert.equal( b.normalBias, 0.05, "copy 复制 normalBias" );

			b.mapSize.set( 512, 512 );
			assert.notDeepEqual( a, b, "Shadows are different again after change" );

		} );

		QUnit.test( "toJSON", ( assert ) => {

			var light = new DirectionalLight();

			var jsonDefault = light.toJSON();
			assert.equal( jsonDefault.object.shadow.normalBias, undefined, "默认 0 不写入 JSON" );

			light.shadow.normalBias = 0.05;
			light.shadow.bias = 0.001;

			var json = light.toJSON();
			assert.equal( json.object.shadow.normalBias, 0.05, "非默认 normalBias 写入 JSON" );

			var restored = new ObjectLoader().parse( json );
			assert.equal( restored.shadow.normalBias, 0.05, "ObjectLoader 还原 normalBias" );
			assert.equal( restored.shadow.bias, 0.001, "ObjectLoader 还原 bias" );

			var restoredDefault = new ObjectLoader().parse( jsonDefault );
			assert.equal( restoredDefault.shadow.normalBias, 0, "旧 JSON 无字段时保持默认 0" );

		} );

	} );

} );
