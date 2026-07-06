/**
 * NineSlice — 九宫格拉伸（对标 cocos Sprite SLICED / pixi NineSlicePlane）
 *
 * 单 mesh 实现: 4x4 顶点网格(9 个 quad), resize 时只改 position, UV 固定。
 * opts: { texture, textureW, textureH, left, right, top, bottom, w, h }
 * insets 单位为贴图像素。
 */

'use strict';

const UINode = require('../core/UINode');

function NineSlice(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const THREE = ctx.THREE;
    this._insets = {
        left: opts.left || 0,
        right: opts.right || 0,
        top: opts.top || 0,
        bottom: opts.bottom || 0,
    };
    this._texW = opts.textureW || (opts.texture && opts.texture.image && opts.texture.image.width) || 1;
    this._texH = opts.textureH || (opts.texture && opts.texture.image && opts.texture.image.height) || 1;

    // 4x4 顶点网格
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(16 * 3);
    const uvs = new Float32Array(16 * 2);
    const indices = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const a = row * 4 + col;
            const b = a + 1;
            const c = a + 4;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry = geo;

    // UV 固定(v 翻转: 贴图 v=1 在顶部)
    const iw = this._insets;
    const us = [0, iw.left / this._texW, 1 - iw.right / this._texW, 1];
    const vs = [1, 1 - iw.top / this._texH, iw.bottom / this._texH, 0];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const i = (row * 4 + col) * 2;
            uvs[i] = us[col];
            uvs[i + 1] = vs[row];
        }
    }

    this.material = new THREE.MeshBasicMaterial({
        map: opts.texture || null,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.obj3d.add(this.mesh);

    this.setSize(opts.w || this._texW, opts.h || this._texH);
}

NineSlice.prototype = Object.create(UINode.prototype);
NineSlice.prototype.constructor = NineSlice;

NineSlice.prototype._onResize = function () {
    if (!this.geometry) return;
    const iw = this._insets;
    const w = this.width, h = this.height;
    // 角尺寸超过目标时按比例压缩
    const scaleX = Math.min(1, w / Math.max(1, iw.left + iw.right));
    const scaleY = Math.min(1, h / Math.max(1, iw.top + iw.bottom));
    const xs = [0, iw.left * scaleX, w - iw.right * scaleX, w];
    const ys = [0, iw.top * scaleY, h - iw.bottom * scaleY, h];

    const pos = this.geometry.attributes.position.array;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const i = (row * 4 + col) * 3;
            pos[i] = xs[col];
            pos[i + 1] = -ys[row];   // y 向下 → THREE y 取负
            pos[i + 2] = 0;
        }
    }
    this.geometry.attributes.position.needsUpdate = true;
};

NineSlice.prototype._applyAlpha = function (worldAlpha) {
    this.material.opacity = worldAlpha;
};

NineSlice.prototype.setTexture = function (texture) {
    this.material.map = texture;
    this.material.needsUpdate = true;
};

NineSlice.prototype._disposeSelf = function () {
    this.material.dispose();
    this.geometry.dispose();
};

module.exports = NineSlice;
