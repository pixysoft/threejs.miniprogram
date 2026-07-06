export default /* glsl */`
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

void main() {

	#include <batching_vertex>
	#include <begin_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`;
