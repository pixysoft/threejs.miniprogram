/**
 * WebGL1 运行时能力探测(全库唯一探测点)。
 * 后续移植特性(BatchedMesh/GPGPU/后处理精度等)统一消费此能力表做降级,
 * 不满足要求时降级(如 BatchedMesh→InstancedMesh→Mesh)而不是报错。
 * 结果按 gl 上下文缓存, 同一上下文只探测一次。
 */
const _cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null

// 部分真机声明支持 OES_texture_float 但 float 纹理不可作为渲染目标,
// 必须实际创建 FBO 验证
function probeFloatRenderable(gl) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.FLOAT, null)

    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

    const renderable = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)

    return renderable
}

export default function detectCapabilities(gl) {
    if (!gl || typeof gl.getExtension !== 'function') {
        throw new Error('detectCapabilities: need a WebGL rendering context')
    }

    if (_cache && _cache.has(gl)) {
        return _cache.get(gl)
    }

    const floatTexture = !!gl.getExtension('OES_texture_float')

    const capabilities = {
        instancing: !!gl.getExtension('ANGLE_instanced_arrays'),
        floatTexture: floatTexture,
        halfFloatTexture: !!gl.getExtension('OES_texture_half_float'),
        floatRenderable: floatTexture && probeFloatRenderable(gl),
        sRGB: !!gl.getExtension('EXT_sRGB'),
        depthTexture: !!gl.getExtension('WEBGL_depth_texture'),
        vertexTextures: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0,
        // BatchedMesh 单次多段提交依赖; 无扩展时渲染器自动走循环 fallback
        multiDraw: !!gl.getExtension('WEBGL_multi_draw')
    }

    if (_cache) {
        _cache.set(gl, capabilities)
    }

    return capabilities
}
