/**
 * @author mrdoob / http://mrdoob.com/
 */

function WebGLIndexedBufferRenderer( gl, extensions, info, capabilities ) {

	var isWebGL2 = capabilities.isWebGL2;

	var mode;

	function setMode( value ) {

		mode = value;

	}

	var type, bytesPerElement;

	function setIndex( value ) {

		type = value.type;
		bytesPerElement = value.bytesPerElement;

	}

	function render( start, count ) {

		gl.drawElements( mode, count, type, start * bytesPerElement );

		info.update( count, mode );

	}

	function renderInstances( geometry, start, count, primcount ) {

		if ( primcount === 0 ) return;

		var extension, methodName;

		if ( isWebGL2 ) {

			extension = gl;
			methodName = 'drawElementsInstanced';

		} else {

			extension = extensions.get( 'ANGLE_instanced_arrays' );
			methodName = 'drawElementsInstancedANGLE';

			if ( extension === null ) {

				console.error( 'THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
				return;

			}

		}

		extension[ methodName ]( mode, count, type, start * bytesPerElement, primcount );

		info.update( count, mode, primcount );

	}

	// backport from r185(阶段三 4.2#2): BatchedMesh 单次多段提交
	// (starts 为字节偏移; 无 WEBGL_multi_draw 扩展时渲染器走循环 fallback, 不会调到这里)
	function renderMultiDraw( starts, counts, drawCount ) {

		if ( drawCount === 0 ) return;

		var extension = extensions.get( 'WEBGL_multi_draw' );

		if ( extension === null ) {

			console.error( 'THREE.WebGLIndexedBufferRenderer: hardware does not support extension WEBGL_multi_draw.' );
			return;

		}

		extension.multiDrawElementsWEBGL( mode, counts, 0, type, starts, 0, drawCount );

		var elementCount = 0;
		for ( var i = 0; i < drawCount; i ++ ) {

			elementCount += counts[ i ];

		}

		info.update( elementCount, mode );

	}

	//

	this.setMode = setMode;
	this.setIndex = setIndex;
	this.render = render;
	this.renderInstances = renderInstances;
	this.renderMultiDraw = renderMultiDraw;

}


export { WebGLIndexedBufferRenderer };
