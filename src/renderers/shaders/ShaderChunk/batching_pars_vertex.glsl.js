// backport from r185, GLSL 100 改造版(阶段三 4.2#2):
// texelFetch/textureSize -> texture2D + size uniform(套用 r110 boneTexture 采样模板);
// usampler2D 整数间接纹理 -> float RGBA 纹理(id 存 .r 通道);
// 无 WEBGL_multi_draw 扩展时渲染器循环 draw 并逐段更新 _gl_DrawID uniform
export default /* glsl */`
#ifdef USE_BATCHING

	#ifndef GL_ANGLE_multi_draw

		#define gl_DrawID _gl_DrawID
		uniform int _gl_DrawID;

	#endif

	uniform highp sampler2D batchingTexture;
	uniform int batchingTextureSize;

	mat4 getBatchingMatrix( const in float i ) {

		float j = i * 4.0;
		float x = mod( j, float( batchingTextureSize ) );
		float y = floor( j / float( batchingTextureSize ) );

		float dx = 1.0 / float( batchingTextureSize );
		float dy = 1.0 / float( batchingTextureSize );

		y = dy * ( y + 0.5 );

		vec4 v1 = texture2D( batchingTexture, vec2( dx * ( x + 0.5 ), y ) );
		vec4 v2 = texture2D( batchingTexture, vec2( dx * ( x + 1.5 ), y ) );
		vec4 v3 = texture2D( batchingTexture, vec2( dx * ( x + 2.5 ), y ) );
		vec4 v4 = texture2D( batchingTexture, vec2( dx * ( x + 3.5 ), y ) );

		return mat4( v1, v2, v3, v4 );

	}

	uniform highp sampler2D batchingIdTexture;
	uniform int batchingIdTextureSize;

	float getIndirectIndex( const in int i ) {

		float j = float( i );
		float x = mod( j, float( batchingIdTextureSize ) );
		float y = floor( j / float( batchingIdTextureSize ) );

		float dx = 1.0 / float( batchingIdTextureSize );
		float dy = 1.0 / float( batchingIdTextureSize );

		return texture2D( batchingIdTexture, vec2( dx * ( x + 0.5 ), dy * ( y + 0.5 ) ) ).r;

	}

#endif

#ifdef USE_BATCHING_COLOR

	uniform sampler2D batchingColorTexture;
	uniform int batchingColorTextureSize;

	vec4 getBatchingColor( const in float i ) {

		float x = mod( i, float( batchingColorTextureSize ) );
		float y = floor( i / float( batchingColorTextureSize ) );

		float dx = 1.0 / float( batchingColorTextureSize );
		float dy = 1.0 / float( batchingColorTextureSize );

		return texture2D( batchingColorTexture, vec2( dx * ( x + 0.5 ), dy * ( y + 0.5 ) ) );

	}

#endif
`;
