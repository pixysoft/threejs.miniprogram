import { Vector3 } from './Vector3.js';

/**
 * @author bhouston / http://clara.io
 *
 * backport from r185(阶段二 4.1#2): 数学算法逐函数对齐 r185
 * - at/closestPointToPoint/distanceSqToSegment: multiplyScalar+add 改 addScaledVector(数值更稳)
 * - intersectSphere: 判空条件由 (t0<0 && t1<0) 收敛为 (t1<0)(语义等价、更直白)
 * - intersectsSphere: 显式处理空球(radius<0, 对应 Sphere.makeEmpty 语义)
 * - intersectTriangle: 换 Woop/Benthin/Wald watertight 算法(JCGT 2013),
 *   消除共享边"缝隙漏拾取"问题, 是拾取正确性的核心改进
 * 保持 r110 的 function/prototype 风格与无 target 参数时的兼容告警
 */

var _vector = new Vector3();
var _segCenter = new Vector3();
var _segDir = new Vector3();
var _diff = new Vector3();

function Ray( origin, direction ) {

	this.origin = ( origin !== undefined ) ? origin : new Vector3();
	this.direction = ( direction !== undefined ) ? direction : new Vector3();

}

Object.assign( Ray.prototype, {

	set: function ( origin, direction ) {

		this.origin.copy( origin );
		this.direction.copy( direction );

		return this;

	},

	clone: function () {

		return new this.constructor().copy( this );

	},

	copy: function ( ray ) {

		this.origin.copy( ray.origin );
		this.direction.copy( ray.direction );

		return this;

	},

	at: function ( t, target ) {

		if ( target === undefined ) {

			console.warn( 'THREE.Ray: .at() target is now required' );
			target = new Vector3();

		}

		return target.copy( this.origin ).addScaledVector( this.direction, t );

	},

	lookAt: function ( v ) {

		this.direction.copy( v ).sub( this.origin ).normalize();

		return this;

	},

	recast: function ( t ) {

		this.origin.copy( this.at( t, _vector ) );

		return this;

	},

	closestPointToPoint: function ( point, target ) {

		if ( target === undefined ) {

			console.warn( 'THREE.Ray: .closestPointToPoint() target is now required' );
			target = new Vector3();

		}

		target.subVectors( point, this.origin );

		var directionDistance = target.dot( this.direction );

		if ( directionDistance < 0 ) {

			return target.copy( this.origin );

		}

		return target.copy( this.origin ).addScaledVector( this.direction, directionDistance );

	},

	distanceToPoint: function ( point ) {

		return Math.sqrt( this.distanceSqToPoint( point ) );

	},

	distanceSqToPoint: function ( point ) {

		var directionDistance = _vector.subVectors( point, this.origin ).dot( this.direction );

		// point behind the ray

		if ( directionDistance < 0 ) {

			return this.origin.distanceToSquared( point );

		}

		_vector.copy( this.origin ).addScaledVector( this.direction, directionDistance );

		return _vector.distanceToSquared( point );

	},

	distanceSqToSegment: function ( v0, v1, optionalPointOnRay, optionalPointOnSegment ) {

		// from https://github.com/pmjoniak/GeometricTools/blob/master/GTEngine/Include/Mathematics/GteDistRaySegment.h
		// It returns the min distance between the ray and the segment
		// defined by v0 and v1
		// It can also set two optional targets :
		// - The closest point on the ray
		// - The closest point on the segment

		_segCenter.copy( v0 ).add( v1 ).multiplyScalar( 0.5 );
		_segDir.copy( v1 ).sub( v0 ).normalize();
		_diff.copy( this.origin ).sub( _segCenter );

		var segExtent = v0.distanceTo( v1 ) * 0.5;
		var a01 = - this.direction.dot( _segDir );
		var b0 = _diff.dot( this.direction );
		var b1 = - _diff.dot( _segDir );
		var c = _diff.lengthSq();
		var det = Math.abs( 1 - a01 * a01 );
		var s0, s1, sqrDist, extDet;

		if ( det > 0 ) {

			// The ray and segment are not parallel.

			s0 = a01 * b1 - b0;
			s1 = a01 * b0 - b1;
			extDet = segExtent * det;

			if ( s0 >= 0 ) {

				if ( s1 >= - extDet ) {

					if ( s1 <= extDet ) {

						// region 0
						// Minimum at interior points of ray and segment.

						var invDet = 1 / det;
						s0 *= invDet;
						s1 *= invDet;
						sqrDist = s0 * ( s0 + a01 * s1 + 2 * b0 ) + s1 * ( a01 * s0 + s1 + 2 * b1 ) + c;

					} else {

						// region 1

						s1 = segExtent;
						s0 = Math.max( 0, - ( a01 * s1 + b0 ) );
						sqrDist = - s0 * s0 + s1 * ( s1 + 2 * b1 ) + c;

					}

				} else {

					// region 5

					s1 = - segExtent;
					s0 = Math.max( 0, - ( a01 * s1 + b0 ) );
					sqrDist = - s0 * s0 + s1 * ( s1 + 2 * b1 ) + c;

				}

			} else {

				if ( s1 <= - extDet ) {

					// region 4

					s0 = Math.max( 0, - ( - a01 * segExtent + b0 ) );
					s1 = ( s0 > 0 ) ? - segExtent : Math.min( Math.max( - segExtent, - b1 ), segExtent );
					sqrDist = - s0 * s0 + s1 * ( s1 + 2 * b1 ) + c;

				} else if ( s1 <= extDet ) {

					// region 3

					s0 = 0;
					s1 = Math.min( Math.max( - segExtent, - b1 ), segExtent );
					sqrDist = s1 * ( s1 + 2 * b1 ) + c;

				} else {

					// region 2

					s0 = Math.max( 0, - ( a01 * segExtent + b0 ) );
					s1 = ( s0 > 0 ) ? segExtent : Math.min( Math.max( - segExtent, - b1 ), segExtent );
					sqrDist = - s0 * s0 + s1 * ( s1 + 2 * b1 ) + c;

				}

			}

		} else {

			// Ray and segment are parallel.

			s1 = ( a01 > 0 ) ? - segExtent : segExtent;
			s0 = Math.max( 0, - ( a01 * s1 + b0 ) );
			sqrDist = - s0 * s0 + s1 * ( s1 + 2 * b1 ) + c;

		}

		if ( optionalPointOnRay ) {

			optionalPointOnRay.copy( this.origin ).addScaledVector( this.direction, s0 );

		}

		if ( optionalPointOnSegment ) {

			optionalPointOnSegment.copy( _segCenter ).addScaledVector( _segDir, s1 );

		}

		return sqrDist;

	},

	intersectSphere: function ( sphere, target ) {

		_vector.subVectors( sphere.center, this.origin );
		var tca = _vector.dot( this.direction );
		var d2 = _vector.dot( _vector ) - tca * tca;
		var radius2 = sphere.radius * sphere.radius;

		if ( d2 > radius2 ) return null;

		var thc = Math.sqrt( radius2 - d2 );

		// t0 = first intersect point - entrance on front of sphere
		var t0 = tca - thc;

		// t1 = second intersect point - exit point on back of sphere
		var t1 = tca + thc;

		// test to see if t1 is behind the ray - if so, return null
		if ( t1 < 0 ) return null;

		// test to see if t0 is behind the ray:
		// if it is, the ray is inside the sphere, so return the second exit point scaled by t1,
		// in order to always return an intersect point that is in front of the ray.
		if ( t0 < 0 ) return this.at( t1, target );

		// else t0 is in front of the ray, so return the first collision point scaled by t0
		return this.at( t0, target );

	},

	intersectsSphere: function ( sphere ) {

		if ( sphere.radius < 0 ) return false; // handle empty spheres

		return this.distanceSqToPoint( sphere.center ) <= ( sphere.radius * sphere.radius );

	},

	distanceToPlane: function ( plane ) {

		var denominator = plane.normal.dot( this.direction );

		if ( denominator === 0 ) {

			// line is coplanar, return origin
			if ( plane.distanceToPoint( this.origin ) === 0 ) {

				return 0;

			}

			// Null is preferable to undefined since undefined means.... it is undefined

			return null;

		}

		var t = - ( this.origin.dot( plane.normal ) + plane.constant ) / denominator;

		// Return if the ray never intersects the plane

		return t >= 0 ? t : null;

	},

	intersectPlane: function ( plane, target ) {

		var t = this.distanceToPlane( plane );

		if ( t === null ) {

			return null;

		}

		return this.at( t, target );

	},

	intersectsPlane: function ( plane ) {

		// check if the ray lies on the plane first

		var distToPoint = plane.distanceToPoint( this.origin );

		if ( distToPoint === 0 ) {

			return true;

		}

		var denominator = plane.normal.dot( this.direction );

		if ( denominator * distToPoint < 0 ) {

			return true;

		}

		// ray origin is behind the plane (and is pointing behind it)

		return false;

	},

	intersectBox: function ( box, target ) {

		var tmin, tmax, tymin, tymax, tzmin, tzmax;

		var invdirx = 1 / this.direction.x,
			invdiry = 1 / this.direction.y,
			invdirz = 1 / this.direction.z;

		var origin = this.origin;

		if ( invdirx >= 0 ) {

			tmin = ( box.min.x - origin.x ) * invdirx;
			tmax = ( box.max.x - origin.x ) * invdirx;

		} else {

			tmin = ( box.max.x - origin.x ) * invdirx;
			tmax = ( box.min.x - origin.x ) * invdirx;

		}

		if ( invdiry >= 0 ) {

			tymin = ( box.min.y - origin.y ) * invdiry;
			tymax = ( box.max.y - origin.y ) * invdiry;

		} else {

			tymin = ( box.max.y - origin.y ) * invdiry;
			tymax = ( box.min.y - origin.y ) * invdiry;

		}

		if ( ( tmin > tymax ) || ( tymin > tmax ) ) return null;

		if ( tymin > tmin || isNaN( tmin ) ) tmin = tymin;

		if ( tymax < tmax || isNaN( tmax ) ) tmax = tymax;

		if ( invdirz >= 0 ) {

			tzmin = ( box.min.z - origin.z ) * invdirz;
			tzmax = ( box.max.z - origin.z ) * invdirz;

		} else {

			tzmin = ( box.max.z - origin.z ) * invdirz;
			tzmax = ( box.min.z - origin.z ) * invdirz;

		}

		if ( ( tmin > tzmax ) || ( tzmin > tmax ) ) return null;

		if ( tzmin > tmin || tmin !== tmin ) tmin = tzmin;

		if ( tzmax < tmax || tmax !== tmax ) tmax = tzmax;

		// return point closest to the ray (positive side)

		if ( tmax < 0 ) return null;

		return this.at( tmin >= 0 ? tmin : tmax, target );

	},

	intersectsBox: function ( box ) {

		return this.intersectBox( box, _vector ) !== null;

	},

	intersectTriangle: function ( a, b, c, backfaceCulling, target ) {

		// Watertight ray/triangle intersection. Reference: Woop, Benthin, Wald,
		// "Watertight Ray/Triangle Intersection", JCGT vol. 2 no. 1 (2013), Appendix A.
		// https://jcgt.org/published/0002/01/05/

		var origin = this.origin;
		var direction = this.direction;

		var dx = direction.x;
		var dy = direction.y;
		var dz = direction.z;

		// triangle vertices relative to the ray origin

		var aox = a.x - origin.x, aoy = a.y - origin.y, aoz = a.z - origin.z;
		var box = b.x - origin.x, boy = b.y - origin.y, boz = b.z - origin.z;
		var cox = c.x - origin.x, coy = c.y - origin.y, coz = c.z - origin.z;

		// Use the dimension where the ray direction is maximal as the projection
		// axis (kz) and read every component already permuted into (kx, ky, kz).
		// kx and ky are swapped when the direction's kz component is negative, to
		// preserve the winding order of triangles.

		var adx = Math.abs( dx ), ady = Math.abs( dy ), adz = Math.abs( dz );

		var dkx, dky, dkz;
		var akx, aky, akz, bkx, bky, bkz, ckx, cky, ckz;

		if ( adx >= ady && adx >= adz ) {

			dkz = dx; akz = aox; bkz = box; ckz = cox;

			if ( dx >= 0 ) {

				dkx = dy; dky = dz;
				akx = aoy; aky = aoz; bkx = boy; bky = boz; ckx = coy; cky = coz;

			} else {

				dkx = dz; dky = dy;
				akx = aoz; aky = aoy; bkx = boz; bky = boy; ckx = coz; cky = coy;

			}

		} else if ( ady >= adz ) {

			dkz = dy; akz = aoy; bkz = boy; ckz = coy;

			if ( dy >= 0 ) {

				dkx = dz; dky = dx;
				akx = aoz; aky = aox; bkx = boz; bky = box; ckx = coz; cky = cox;

			} else {

				dkx = dx; dky = dz;
				akx = aox; aky = aoz; bkx = box; bky = boz; ckx = cox; cky = coz;

			}

		} else {

			dkz = dz; akz = aoz; bkz = boz; ckz = coz;

			if ( dz >= 0 ) {

				dkx = dx; dky = dy;
				akx = aox; aky = aoy; bkx = box; bky = boy; ckx = cox; cky = coy;

			} else {

				dkx = dy; dky = dx;
				akx = aoy; aky = aox; bkx = boy; bky = box; ckx = coy; cky = cox;

			}

		}

		// a zero direction has no maximal axis and cannot intersect

		if ( dkz === 0 ) return null;

		// shear constants that align the ray with the +kz axis

		var sx = dkx / dkz, sy = dky / dkz, sz = 1 / dkz;

		// sheared and scaled vertices

		var ax = akx - sx * akz, ay = aky - sy * akz;
		var bx = bkx - sx * bkz, by = bky - sy * bkz;
		var cx = ckx - sx * ckz, cy = cky - sy * ckz;

		// scaled barycentric coordinates (signed edge functions); the shear makes a
		// shared edge evaluate identically for both adjacent triangles, so the ray
		// can never fall between them

		var u = cx * by - cy * bx;
		var v = ax * cy - ay * cx;
		var w = bx * ay - by * ax;

		if ( backfaceCulling ) {

			if ( u < 0 || v < 0 || w < 0 ) return null;

		} else {

			if ( ( u < 0 || v < 0 || w < 0 ) && ( u > 0 || v > 0 || w > 0 ) ) return null;

		}

		var det = u + v + w;

		// ray is co-planar with the triangle

		if ( det === 0 ) return null;

		// scaled hit distance; t = tScaled / det must lie in front of the origin

		var tScaled = sz * ( u * akz + v * bkz + w * ckz );

		if ( det > 0 ? tScaled < 0 : tScaled > 0 ) return null;

		return this.at( tScaled / det, target );

	},

	applyMatrix4: function ( matrix4 ) {

		this.origin.applyMatrix4( matrix4 );
		this.direction.transformDirection( matrix4 );

		return this;

	},

	equals: function ( ray ) {

		return ray.origin.equals( this.origin ) && ray.direction.equals( this.direction );

	}

} );


export { Ray };
