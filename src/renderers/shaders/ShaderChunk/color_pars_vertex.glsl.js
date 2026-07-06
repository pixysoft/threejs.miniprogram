// backport from r185(阶段三 4.2#1/#2): vColor 升为 vec4,
// 兼容 instanceColor / batchingColor(RGBA) 通道
export default /* glsl */`
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )

	varying vec4 vColor;

#endif
`;
