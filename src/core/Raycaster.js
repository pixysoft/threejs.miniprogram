import { Ray } from '../math/Ray.js';
import { Layers } from './Layers.js';

/**
 * @author mrdoob / http://mrdoob.com/
 * @author bhouston / http://clara.io/
 * @author stephomi / http://stephaneginier.com/
 *
 * backport from r185 (升级差距分析说明 3.0 §2.5)
 *
 * 与官方 r185 的刻意分歧(文件头注明, 均为保护现网拾取语义):
 * 1. intersectObject(s) 的 recursive 默认值保持 r110 的 false(官方 r185 为 true);
 * 2. 保留 r110 的 object.visible === false 跳过逻辑(官方 r113 起移除、只按 layers 过滤;
 *    现网 highlight()/renderBoundingboxMeshes 依赖 visible 语义);
 * 3. raycaster.layers 默认全通(enableAll, 官方默认仅 layer 0): r110 的 Raycaster 不看
 *    layers, 现网 LDrawBatchedPartStore 依赖「面 mesh 切隐藏图层后仍可拾取」;
 *    需要过滤时显式 raycaster.layers.set(n) 即得官方语义;
 * 4. setFromXRController 不移植(小程序无 XR)。
 *
 * 从 r185 引入:
 * - raycaster.layers 过滤(object.layers.test(raycaster.layers), 未设置过 layers 的对象恒通过);
 * - params.Line.threshold(线拾取阈值可调, Line.raycast 同步消费);
 * - object.raycast 返回 false 时停止向子树传播(r185 语义, r110 的 raycast 返回 undefined 不受影响)。
 */

function Raycaster( origin, direction, near, far ) {

	this.ray = new Ray( origin, direction );
	// direction is assumed to be normalized (for accurate distance calculations)

	this.near = near || 0;
	this.far = far || Infinity;
	this.camera = null;
	this.layers = new Layers();
	this.layers.enableAll(); // 刻意分歧 #3: 默认全通, 兼容 r110「拾取不看 layers」语义

	this.params = {
		Mesh: {},
		Line: { threshold: 1 },
		LOD: {},
		Points: { threshold: 1 },
		Sprite: {}
	};

	Object.defineProperties( this.params, {
		PointCloud: {
			get: function () {

				console.warn( 'THREE.Raycaster: params.PointCloud has been renamed to params.Points.' );
				return this.Points;

			}
		}
	} );

}

function ascSort( a, b ) {

	return a.distance - b.distance;

}

function intersect( object, raycaster, intersects, recursive ) {

	// r110 保留: 不可见对象整体跳过(见文件头刻意分歧 #2)
	if ( object.visible === false ) return;

	var propagate = true;

	if ( object.layers.test( raycaster.layers ) ) {

		var result = object.raycast( raycaster, intersects );

		if ( result === false ) propagate = false;

	}

	if ( propagate === true && recursive === true ) {

		var children = object.children;

		for ( var i = 0, l = children.length; i < l; i ++ ) {

			intersect( children[ i ], raycaster, intersects, true );

		}

	}

}

Object.assign( Raycaster.prototype, {

	linePrecision: 1,

	set: function ( origin, direction ) {

		// direction is assumed to be normalized (for accurate distance calculations)

		this.ray.set( origin, direction );

	},

	setFromCamera: function ( coords, camera ) {

		if ( ( camera && camera.isPerspectiveCamera ) ) {

			this.ray.origin.setFromMatrixPosition( camera.matrixWorld );
			this.ray.direction.set( coords.x, coords.y, 0.5 ).unproject( camera ).sub( this.ray.origin ).normalize();
			this.camera = camera;

		} else if ( ( camera && camera.isOrthographicCamera ) ) {

			this.ray.origin.set( coords.x, coords.y, ( camera.near + camera.far ) / ( camera.near - camera.far ) ).unproject( camera ); // set origin in plane of camera
			this.ray.direction.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld );
			this.camera = camera;

		} else {

			console.error( 'THREE.Raycaster: Unsupported camera type.' );

		}

	},

	intersectObject: function ( object, recursive, optionalTarget ) {

		var intersects = optionalTarget || [];

		intersect( object, this, intersects, recursive );

		intersects.sort( ascSort );

		return intersects;

	},

	intersectObjects: function ( objects, recursive, optionalTarget ) {

		var intersects = optionalTarget || [];

		if ( Array.isArray( objects ) === false ) {

			console.warn( 'THREE.Raycaster.intersectObjects: objects is not an Array.' );
			return intersects;

		}

		for ( var i = 0, l = objects.length; i < l; i ++ ) {

			intersect( objects[ i ], this, intersects, recursive );

		}

		intersects.sort( ascSort );

		return intersects;

	}

} );


export { Raycaster };
