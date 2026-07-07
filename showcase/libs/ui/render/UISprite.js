/**
 * UISprite — 四边形渲染元件（纯色 tint 或贴图）
 *
 * 共享单位 PlaneBufferGeometry(原点在左上角, y 向下展开)。
 * 材质 depthTest=false + transparent, 层级由 renderOrder 决定。
 */

'use strict';

const UINode = require('../core/UINode');

let _sharedGeo = null;

function getSharedGeometry(THREE) {
    if (!_sharedGeo) {
        // 单位四边形: (0,0)-(1,-1), 即左上原点 y 向下
        _sharedGeo = new THREE.PlaneBufferGeometry(1, 1);
        _sharedGeo.translate(0.5, -0.5, 0);
    }
    return _sharedGeo;
}

function UISprite(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const THREE = ctx.THREE;
    this.material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    if (opts.texture) {
        this.material.map = opts.texture;
    } else {
        this.material.color.setHex(opts.color === undefined ? 0xFFFFFF : opts.color);
    }

    this.mesh = new THREE.Mesh(getSharedGeometry(THREE), this.material);
    this.obj3d.add(this.mesh);

    this.setSize(opts.w || 0, opts.h || 0);
    if (opts.alpha !== undefined) this.alpha = opts.alpha;
}

UISprite.prototype = Object.create(UINode.prototype);
UISprite.prototype.constructor = UISprite;

UISprite.prototype._onResize = function () {
    this.mesh.scale.set(Math.max(this.width, 0.0001), Math.max(this.height, 0.0001), 1);
};

UISprite.prototype._applyAlpha = function (worldAlpha) {
    this.material.opacity = worldAlpha;
};

UISprite.prototype.setTexture = function (texture) {
    this.material.map = texture;
    this.material.color.setHex(0xFFFFFF);
    this.material.needsUpdate = true;
    if (this.ctx.root) this.ctx.root.invalidate();
};

/**
 * 图集帧: 共享纹理 + UV 子矩形(Atlas.frame() 的返回值)。
 * 首次调用时克隆共享几何为实例几何(仅改 uv)。
 */
UISprite.prototype.setFrame = function (frame) {
    if (!this._ownGeo) {
        this._ownGeo = this.mesh.geometry.clone();
        this.mesh.geometry = this._ownGeo;
    }
    const u0 = frame.x / frame.texW;
    const u1 = (frame.x + frame.w) / frame.texW;
    const vTop = 1 - frame.y / frame.texH;
    const vBottom = 1 - (frame.y + frame.h) / frame.texH;

    // 共享几何 uv 为 0/1 角点, 按角点值映射进帧矩形
    const shared = getSharedGeometry(this.ctx.THREE).attributes.uv.array;
    const uv = this._ownGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
        uv.array[i * 2] = u0 + shared[i * 2] * (u1 - u0);
        uv.array[i * 2 + 1] = vBottom + shared[i * 2 + 1] * (vTop - vBottom);
    }
    uv.needsUpdate = true;

    this.frame = frame;
    this.setTexture(frame.texture);
};

UISprite.prototype.setColor = function (color) {
    this.material.map = null;
    this.material.color.setHex(color);
    this.material.needsUpdate = true;
    if (this.ctx.root) this.ctx.root.invalidate();
};

UISprite.prototype._disposeSelf = function () {
    this.material.dispose();  // 共享几何不 dispose; 纹理归 TextureFactory/调用方管理
    if (this._ownGeo) this._ownGeo.dispose();
};

UISprite.getSharedGeometry = getSharedGeometry;

module.exports = UISprite;
