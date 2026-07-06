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
};

UISprite.prototype.setColor = function (color) {
    this.material.map = null;
    this.material.color.setHex(color);
    this.material.needsUpdate = true;
};

UISprite.prototype._disposeSelf = function () {
    this.material.dispose();  // 共享几何不 dispose; 纹理归 TextureFactory/调用方管理
};

UISprite.getSharedGeometry = getSharedGeometry;

module.exports = UISprite;
