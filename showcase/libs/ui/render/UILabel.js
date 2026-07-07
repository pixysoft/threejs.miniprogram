/**
 * UILabel — 文本元件（2D canvas 绘字 → CanvasTexture）
 *
 * opts: { text, size=28, color=0xFFFFFF, bold, align='left',
 *         wrap=false, maxWidth, lineHeight=1.3, atlas=false }
 * 尺寸由文本内容决定(width/height 自动), 亦可 maxWidth 换行。
 *
 * atlas: true(P2-2) — 走 CharAtlas 逐字 quad, setText 不重绘 canvas;
 * 要求字符已 ui.charAtlas.bake 且单行, 否则自动回退 canvas 路径。
 */

'use strict';

const UINode = require('../core/UINode');

const DENSITY = 2;

function colorToCSS(color) {
    return 'rgb(' + ((color >> 16) & 0xFF) + ',' + ((color >> 8) & 0xFF) + ',' + (color & 0xFF) + ')';
}

function UILabel(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    this._text = opts.text === undefined ? '' : String(opts.text);
    this._size = opts.size || 28;
    this._color = opts.color === undefined ? 0xFFFFFF : opts.color;
    this._bold = !!opts.bold;
    this._align = opts.align || 'left';
    this._wrap = !!opts.wrap;
    this._maxWidth = opts.maxWidth || 0;
    this._lineHeight = opts.lineHeight || 1.3;
    this._atlas = !!opts.atlas;
    this._atlasMode = false;    // 当前帧实际走 atlas 路径
    this._atlasGeo = null;
    this._atlasWarned = false;

    const THREE = ctx.THREE;
    this.canvas = ctx.createCanvas2D();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.material = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });

    const UISprite = require('./UISprite');
    this.mesh = new THREE.Mesh(UISprite.getSharedGeometry(THREE), this.material);
    this.obj3d.add(this.mesh);

    this._redraw();
}

UILabel.prototype = Object.create(UINode.prototype);
UILabel.prototype.constructor = UILabel;

Object.defineProperty(UILabel.prototype, 'text', {
    get: function () { return this._text; },
    set: function (v) { this.setText(v); }
});

UILabel.prototype.setText = function (text) {
    text = String(text);
    if (text === this._text) return;
    this._text = text;
    this._redraw();
};

UILabel.prototype.setColor = function (color) {
    if (color === this._color) return;
    this._color = color;
    this._redraw();
};

UILabel.prototype._font = function (density) {
    return (this._bold ? 'bold ' : '') + (this._size * density) + 'px sans-serif';
};

UILabel.prototype._layoutLines = function (g) {
    g.font = this._font(1);
    const raw = this._text.split('\n');
    if (!this._wrap || !this._maxWidth) return raw;

    const lines = [];
    for (let i = 0; i < raw.length; i++) {
        let line = '';
        const str = raw[i];
        for (let j = 0; j < str.length; j++) {
            const test = line + str[j];
            if (line && g.measureText(test).width > this._maxWidth) {
                lines.push(line);
                line = str[j];
            } else {
                line = test;
            }
        }
        lines.push(line);
    }
    return lines;
};

/**
 * atlas 路径: 逐字 quad(共享 CharAtlas 纹理), 不触碰 canvas。
 * 命中条件: 开了 atlas + charAtlas 存在 + 单行 + 字符全部已烘焙。
 */
UILabel.prototype._tryAtlasRedraw = function () {
    const ca = this.ctx.charAtlas;
    if (!ca || this._text.indexOf('\n') !== -1) return false;
    const hit = ca.lookup(this._size, this._color, this._bold, this._text);
    if (!hit) {
        if (!this._atlasWarned && this._text) {
            this._atlasWarned = true;
            console.warn('[three-ui UILabel] atlas 模式字符未烘焙, 回退 canvas 绘字: "' + this._text + '"');
        }
        return false;
    }

    const THREE = this.ctx.THREE;
    const n = hit.glyphs.length;
    const lineH = hit.lineH;

    // 容量不足时重建几何
    if (!this._atlasGeo || this._atlasCapacity < n) {
        if (this._atlasGeo) this._atlasGeo.dispose();
        const capacity = Math.max(8, n);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 4 * 3), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(capacity * 4 * 2), 2));
        const indices = new Uint16Array(capacity * 6);
        for (let q = 0; q < capacity; q++) {
            const v = q * 4, i = q * 6;
            indices[i] = v; indices[i + 1] = v + 2; indices[i + 2] = v + 1;
            indices[i + 3] = v + 2; indices[i + 4] = v + 3; indices[i + 5] = v + 1;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        this._atlasGeo = geo;
        this._atlasCapacity = capacity;
    }

    const pos = this._atlasGeo.attributes.position.array;
    const uv = this._atlasGeo.attributes.uv.array;
    let x = 0;
    for (let i = 0; i < n; i++) {
        const gl = hit.glyphs[i];
        const p = i * 12, u = i * 8;
        // 顶点序: 左上/右上/左下/右下(y 向下 → THREE y 取负)
        pos[p] = x;                pos[p + 1] = 0;      pos[p + 2] = 0;
        pos[p + 3] = x + gl.w;     pos[p + 4] = 0;      pos[p + 5] = 0;
        pos[p + 6] = x;            pos[p + 7] = -lineH; pos[p + 8] = 0;
        pos[p + 9] = x + gl.w;     pos[p + 10] = -lineH; pos[p + 11] = 0;
        uv[u] = gl.u0;     uv[u + 1] = gl.v1;
        uv[u + 2] = gl.u1; uv[u + 3] = gl.v1;
        uv[u + 4] = gl.u0; uv[u + 5] = gl.v0;
        uv[u + 6] = gl.u1; uv[u + 7] = gl.v0;
        x += gl.w;
    }
    this._atlasGeo.attributes.position.needsUpdate = true;
    this._atlasGeo.attributes.uv.needsUpdate = true;
    this._atlasGeo.setDrawRange(0, n * 6);

    this._atlasMode = true;
    this.mesh.geometry = this._atlasGeo;
    this.material.map = hit.texture;
    this.material.needsUpdate = true;
    this.setSize(x, lineH);
    return true;
};

UILabel.prototype._redraw = function () {
    if (this._atlas && this._tryAtlasRedraw()) return;

    if (this._atlasMode) {
        // 从 atlas 回退 canvas: 还原共享几何与自有纹理
        this._atlasMode = false;
        const UISprite = require('./UISprite');
        this.mesh.geometry = UISprite.getSharedGeometry(this.ctx.THREE);
        this.material.map = this.texture;
        this.material.needsUpdate = true;
    }

    const g = this.canvas.getContext('2d');
    const lines = this._layoutLines(g);

    g.font = this._font(1);
    let maxW = 1;
    for (let i = 0; i < lines.length; i++) {
        maxW = Math.max(maxW, g.measureText(lines[i]).width);
    }
    if (this._maxWidth) maxW = Math.min(maxW, this._maxWidth);

    const lineH = this._size * this._lineHeight;
    const w = Math.ceil(maxW);
    const h = Math.ceil(lineH * lines.length);

    this.canvas.width = Math.max(1, w * DENSITY);
    this.canvas.height = Math.max(1, h * DENSITY);

    g.font = this._font(DENSITY);
    g.fillStyle = colorToCSS(this._color);
    g.textBaseline = 'middle';
    g.textAlign = this._align;

    let tx = 0;
    if (this._align === 'center') tx = this.canvas.width / 2;
    else if (this._align === 'right') tx = this.canvas.width;

    for (let i = 0; i < lines.length; i++) {
        g.fillText(lines[i], tx, (i + 0.5) * lineH * DENSITY);
    }

    this.texture.needsUpdate = true;
    this.setSize(w, h);
    if (this.ctx.root) this.ctx.root.invalidate();
};

UILabel.prototype._onResize = function () {
    if (this._atlasMode) {
        this.mesh.scale.set(1, 1, 1);   // atlas 几何以 ui 单位直书, 不缩放
        return;
    }
    this.mesh.scale.set(Math.max(this.width, 0.0001), Math.max(this.height, 0.0001), 1);
};

UILabel.prototype._applyAlpha = function (worldAlpha) {
    this.material.opacity = worldAlpha;
};

UILabel.prototype._disposeSelf = function () {
    this.material.dispose();
    this.texture.dispose();
    if (this._atlasGeo) this._atlasGeo.dispose();   // atlas 纹理归 CharAtlas 管理
};

module.exports = UILabel;
