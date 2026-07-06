/**
 * @author Don McCurdy / https://www.donmccurdy.com
 */

var LoaderUtils = {

	decodeText: function ( array ) {

		if ( typeof TextDecoder !== 'undefined' ) {

			return new TextDecoder().decode( array );

		}

		// 纯 JS UTF-8 解码回退: 旧实现 decodeURIComponent( escape( s ) )
		// 对部分多字节边界出错(#16358), 小程序真机无 TextDecoder 时走此路径

		var s = '';
		var i = 0, il = array.length;

		while ( i < il ) {

			var byte1 = array[ i ++ ];

			if ( byte1 < 0x80 ) {

				s += String.fromCharCode( byte1 );

			} else if ( byte1 < 0xE0 ) {

				var byte2 = array[ i ++ ] & 0x3F;
				s += String.fromCharCode( ( ( byte1 & 0x1F ) << 6 ) | byte2 );

			} else if ( byte1 < 0xF0 ) {

				var byte2 = array[ i ++ ] & 0x3F;
				var byte3 = array[ i ++ ] & 0x3F;
				s += String.fromCharCode( ( ( byte1 & 0x0F ) << 12 ) | ( byte2 << 6 ) | byte3 );

			} else {

				var byte2 = array[ i ++ ] & 0x3F;
				var byte3 = array[ i ++ ] & 0x3F;
				var byte4 = array[ i ++ ] & 0x3F;
				var codepoint = ( ( ( byte1 & 0x07 ) << 18 ) | ( byte2 << 12 ) | ( byte3 << 6 ) | byte4 ) - 0x10000;
				s += String.fromCharCode( 0xD800 + ( codepoint >> 10 ), 0xDC00 + ( codepoint & 0x3FF ) );

			}

		}

		return s;

	},

	extractUrlBase: function ( url ) {

		var index = url.lastIndexOf( '/' );

		if ( index === - 1 ) return './';

		return url.substr( 0, index + 1 );

	}

};

export { LoaderUtils };
