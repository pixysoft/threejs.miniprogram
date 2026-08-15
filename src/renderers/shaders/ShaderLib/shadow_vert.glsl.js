/**
 * ShadowMaterial 顶点着色器：算 worldPosition 与阴影坐标。
 * 补 normal 相关 chunk，供 shadowmap_vertex 使用 transformedNormal（normalBias=0 时偏移为 0）。
 */
export default /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>

void main() {

	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

	#include <begin_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`;
