/**
 * NineSlice — 九宫格拉伸（对标 cocos Sprite SLICED / pixi NineSlicePlane）
 *
 * 单 mesh 实现: 4x4 顶点网格(9 个 quad), resize 时只改 position, UV 固定。
 * opts: { texture, textureW, textureH, left, right, top, bottom, w, h }
 *       或 { frame(Atlas.frame() 返回值), left..bottom?, w, h } — UV 取帧子矩形,
 *       insets 缺省取帧 slice 元数据 [l,t,r,b]。insets 单位为贴图像素。
 */

'use strict';

const UINode = require('../core/UINode');

function NineSlice(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const THREE = ctx.THREE;
    const frame = opts.frame || null;
    const slice = (frame && frame.slice) || null;
    this._insets = {
        left: opts.left !== undefined ? opts.left : (slice ? slice[0] : 0),
        top: opts.top !== undefined ? opts.top : (slice ? slice[1] : 0),
        right: opts.right !== undefined ? opts.right : (slice ? slice[2] : 0),
        bottom: opts.bottom !== undefined ? opts.bottom : (slice ? slice[3] : 0),
    };
    // 帧模式: 内容矩形 = 帧子矩形; 整图模式: 内容矩形 = 全纹理
    this._texW = frame ? frame.w
        : (opts.textureW || (opts.texture && opts.texture.image && opts.texture.image.width) || 1);
    this._texH = frame ? frame.h
        : (opts.textureH || (opts.texture && opts.texture.image && opts.texture.image.height) || 1);
    const texture = frame ? frame.texture : (opts.texture || null);

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

    // UV 固定(v 翻转: 贴图 v=1 在顶部); 帧模式换算到帧子矩形
    const iw = this._insets;
    let us = [0, iw.left / this._texW, 1 - iw.right / this._texW, 1];
    let vs = [1, 1 - iw.top / this._texH, iw.bottom / this._texH, 0];
    if (frame) {
        const fu0 = frame.x / frame.texW, fu1 = (frame.x + frame.w) / frame.texW;
        const fvTop = 1 - frame.y / frame.texH, fvBottom = 1 - (frame.y + frame.h) / frame.texH;
        us = us.map(function (u) { return fu0 + u * (fu1 - fu0); });
        vs = vs.map(function (v) { return fvBottom + v * (fvTop - fvBottom); });
    }
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const i = (row * 4 + col) * 2;
            uvs[i] = us[col];
            uvs[i + 1] = vs[row];
        }
    }

    this.material = new THREE.MeshBasicMaterial({
        map: texture,
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
    if (this.ctx.root) this.ctx.root.invalidate();
};

NineSlice.prototype._disposeSelf = function () {
    this.material.dispose();
    this.geometry.dispose();
};

module.exports = NineSlice;
