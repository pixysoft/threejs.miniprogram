// backport from r185(阶段三 4.2#1/#2): vec4 整体相乘(alpha 随 batchingColor 生效)
export default /* glsl */`
#ifdef USE_COLOR

	diffuseColor *= vColor;

#endif
`;
