/**
 * @author mrdoob / http://mrdoob.com/
 */

function WebGLBufferRenderer( gl, extensions, info, capabilities ) {

	var isWebGL2 = capabilities.isWebGL2;

	var mode;

	function setMode( value ) {

		mode = value;

	}

	function render( start, count ) {

		gl.drawArrays( mode, start, count );

		info.update( count, mode );

	}

	function renderInstances( geometry, start, count, primcount ) {

		if ( primcount === 0 ) return;

		var extension, methodName;

		if ( isWebGL2 ) {

			extension = gl;
			methodName = 'drawArraysInstanced';

		} else {

			extension = extensions.get( 'ANGLE_instanced_arrays' );
			methodName = 'drawArraysInstancedANGLE';

			if ( extension === null ) {

				console.error( 'THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
				return;

			}

		}

		extension[ methodName ]( mode, start, count, primcount );

		info.update( count, mode, primcount );

	}

	// backport from r185(阶段三 4.2#2): BatchedMesh 单次多段提交
	function renderMultiDraw( starts, counts, drawCount ) {

		if ( drawCount === 0 ) return;

		var extension = extensions.get( 'WEBGL_multi_draw' );

		if ( extension === null ) {

			console.error( 'THREE.WebGLBufferRenderer: hardware does not support extension WEBGL_multi_draw.' );
			return;

		}

		extension.multiDrawArraysWEBGL( mode, starts, 0, counts, 0, drawCount );

		var elementCount = 0;
		for ( var i = 0; i < drawCount; i ++ ) {

			elementCount += counts[ i ];

		}

		info.update( elementCount, mode );

	}

	//

	this.setMode = setMode;
	this.render = render;
	this.renderInstances = renderInstances;
	this.renderMultiDraw = renderMultiDraw;

}


export { WebGLBufferRenderer };
