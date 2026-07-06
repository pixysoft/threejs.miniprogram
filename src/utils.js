/**
 * @author mrdoob / http://mrdoob.com/
 */

function arrayMin( array ) {

	if ( array.length === 0 ) return Infinity;

	var min = array[ 0 ];

	for ( var i = 1, l = array.length; i < l; ++ i ) {

		if ( array[ i ] < min ) min = array[ i ];

	}

	return min;

}

function arrayMax( array ) {

	if ( array.length === 0 ) return - Infinity;

	var max = array[ 0 ];

	for ( var i = 1, l = array.length; i < l; ++ i ) {

		if ( array[ i ] > max ) max = array[ i ];

	}

	return max;

}

// backport from r185: AnimationUtils 依赖
function isTypedArray( object ) {

	return ArrayBuffer.isView( object ) && ! ( object instanceof DataView );

}

// backport from r185: 同一条警告只输出一次(ColorManagement 依赖)
var _warnedMessages = {};

function warnOnce( message ) {

	if ( _warnedMessages[ message ] === true ) return;

	_warnedMessages[ message ] = true;

	console.warn( message );

}

export { arrayMin, arrayMax, isTypedArray, warnOnce };
