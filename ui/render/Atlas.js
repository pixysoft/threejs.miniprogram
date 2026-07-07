/**
 * Atlas — 图集帧索引（移植 pixi AssetManager 的图集层, 更薄:
 * 不做网络/文件 IO, 纹理由业务用 THREE.TextureLoader 加载后注册）
 *
 * addAtlas(key, texturePackerJson, texture)   TexturePacker JSON Hash
 * addSheet(key, texture, defs, texW?, texH?)  手写切片 defs = { 帧名: {x,y,w,h,slice?} }
 * frame(name) → { texture, x, y, w, h, texW, texH, slice } | null
 * has(name) / clear()
 *
 * 帧名全局索引, 重名告警(与 pixi 相同)。slice = [l, t, r, b] 九宫格元数据。
 */

'use strict';

function textureSize(texture) {
    const img = texture && texture.image;
    return {
        w: (img && img.width) || 0,
        h: (img && img.height) || 0,
    };
}

function Atlas() {
    this._frames = {};   // name → frame
}

Atlas.prototype._register = function (key, texture, defs, texW, texH) {
    for (const name in defs) {
        if (this._frames[name]) {
            console.warn('[three-ui Atlas] duplicate frame name: ' + name + ' (atlas ' + key + ')');
        }
        const d = defs[name];
        this._frames[name] = {
            texture: texture,
            x: d.x, y: d.y, w: d.w, h: d.h,
            texW: texW, texH: texH,
            slice: d.slice || null,
        };
    }
};

/** TexturePacker JSON Hash: { frames: { 名: { frame: {x,y,w,h}, slice? } }, meta: { size: {w,h} } } */
Atlas.prototype.addAtlas = function (key, atlasJson, texture) {
    const frames = (atlasJson && atlasJson.frames) || {};
    const defs = {};
    for (const name in frames) {
        const f = frames[name];
        defs[name] = {
            x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h,
            slice: f.slice || f.frame.slice || null,
        };
    }
    const meta = (atlasJson && atlasJson.meta) || {};
    const size = meta.size || textureSize(texture);
    this._register(key, texture, defs, size.w, size.h);
};

/** 手写切片 */
Atlas.prototype.addSheet = function (key, texture, defs, texW, texH) {
    const size = textureSize(texture);
    this._register(key, texture, defs, texW || size.w, texH || size.h);
};

Atlas.prototype.frame = function (name) {
    return this._frames[name] || null;
};

Atlas.prototype.has = function (name) {
    return !!this._frames[name];
};

Atlas.prototype.clear = function () {
    this._frames = {};   // 纹理归业务管理, 不 dispose
};

module.exports = Atlas;
