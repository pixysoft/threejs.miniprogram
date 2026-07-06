// backport from r185(阶段三 4.2#2)
export default /* glsl */`
#ifdef USE_BATCHING

	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );

#endif
`;
