// backport from r185(阶段三 4.2#1/#2): vColor 升为 vec4
// (片元侧 USE_COLOR 在 instancingColor/batchingColor 时由 WebGLProgram 补 define)
export default /* glsl */`
#ifdef USE_COLOR

	varying vec4 vColor;

#endif
`;
