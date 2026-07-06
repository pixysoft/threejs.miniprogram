import { Box3 } from './Box3.js';
import { Vector3 } from './Vector3.js';

var _box = new Box3();
var _v1 = new Vector3();
var _v2 = new Vector3();

/**
 * @author bhouston / http://clara.io
 * @author mrdoob / http://mrdoob.com/
 *
 * backport from r185(为 InstancedMesh/BatchedMesh 包围球计算补的纯 JS 增量):
 * isEmpty/makeEmpty/expandByPoint/union; 构造默认 radius 仍为 0(不改旧语义),
 * 空球以 radius<0 表达(makeEmpty 之后), 旧 empty() 保留
 */

function Sphere( center, radius ) {

	this.center = ( center !== undefined ) ? center : new Vector3();
	this.radius = ( radius !== undefined ) ? radius : 0;

}

Object.assign( Sphere.prototype, {

	set: function ( center, radius ) {

		this.center.copy( center );
		this.radius = radius;

		return this;

	},

	setFromPoints: function ( points, optionalCenter ) {

		var center = this.center;

		if ( optionalCenter !== undefined ) {

			center.copy( optionalCenter );

		} else {

			_box.setFromPoints( points ).getCenter( center );

		}

		var maxRadiusSq = 0;

		for ( var i = 0, il = points.length; i < il; i ++ ) {

			maxRadiusSq = Math.max( maxRadiusSq, center.distanceToSquared( points[ i ] ) );

		}

		this.radius = Math.sqrt( maxRadiusSq );

		return this;

	},

	clone: function () {

		return new this.constructor().copy( this );

	},

	copy: function ( sphere ) {

		this.center.copy( sphere.center );
		this.radius = sphere.radius;

		return this;

	},

	empty: function () {

		return ( this.radius <= 0 );

	},

	isEmpty: function () {

		return ( this.radius < 0 );

	},

	makeEmpty: function () {

		this.center.set( 0, 0, 0 );
		this.radius = - 1;

		return this;

	},

	expandByPoint: function ( point ) {

		if ( this.isEmpty() ) {

			this.center.copy( point );

			this.radius = 0;

			return this;

		}

		_v1.subVectors( point, this.center );

		var lengthSq = _v1.lengthSq();

		if ( lengthSq > ( this.radius * this.radius ) ) {

			// calculate the minimal sphere

			var length = Math.sqrt( lengthSq );

			var delta = ( length - this.radius ) * 0.5;

			this.center.addScaledVector( _v1, delta / length );

			this.radius += delta;

		}

		return this;

	},

	union: function ( sphere ) {

		if ( sphere.isEmpty() ) {

			return this;

		}

		if ( this.isEmpty() ) {

			this.copy( sphere );

			return this;

		}

		if ( this.center.equals( sphere.center ) === true ) {

			this.radius = Math.max( this.radius, sphere.radius );

		} else {

			_v2.subVectors( sphere.center, this.center ).setLength( sphere.radius );

			this.expandByPoint( _v1.copy( sphere.center ).add( _v2 ) );

			this.expandByPoint( _v1.copy( sphere.center ).sub( _v2 ) );

		}

		return this;

	},

	containsPoint: function ( point ) {

		return ( point.distanceToSquared( this.center ) <= ( this.radius * this.radius ) );

	},

	distanceToPoint: function ( point ) {

		return ( point.distanceTo( this.center ) - this.radius );

	},

	intersectsSphere: function ( sphere ) {

		var radiusSum = this.radius + sphere.radius;

		return sphere.center.distanceToSquared( this.center ) <= ( radiusSum * radiusSum );

	},

	intersectsBox: function ( box ) {

		return box.intersectsSphere( this );

	},

	intersectsPlane: function ( plane ) {

		return Math.abs( plane.distanceToPoint( this.center ) ) <= this.radius;

	},

	clampPoint: function ( point, target ) {

		var deltaLengthSq = this.center.distanceToSquared( point );

		if ( target === undefined ) {

			console.warn( 'THREE.Sphere: .clampPoint() target is now required' );
			target = new Vector3();

		}

		target.copy( point );

		if ( deltaLengthSq > ( this.radius * this.radius ) ) {

			target.sub( this.center ).normalize();
			target.multiplyScalar( this.radius ).add( this.center );

		}

		return target;

	},

	getBoundingBox: function ( target ) {

		if ( target === undefined ) {

			console.warn( 'THREE.Sphere: .getBoundingBox() target is now required' );
			target = new Box3();

		}

		target.set( this.center, this.center );
		target.expandByScalar( this.radius );

		return target;

	},

	applyMatrix4: function ( matrix ) {

		this.center.applyMatrix4( matrix );
		this.radius = this.radius * matrix.getMaxScaleOnAxis();

		return this;

	},

	translate: function ( offset ) {

		this.center.add( offset );

		return this;

	},

	equals: function ( sphere ) {

		return sphere.center.equals( this.center ) && ( sphere.radius === this.radius );

	}

} );


export { Sphere };
