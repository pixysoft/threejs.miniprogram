/**
 * TextureFactory — 程序化 UI 纹理（对标 pixi TextureCache 思路）
 *
 * 依赖注入的 2D canvas(createCanvas2D), 不直接触碰 wx API。
 * 生成: 圆角矩形 / 圆 / 圆环; 同参数带缓存。
 * 纹理以 2x 密度绘制以保证真机清晰度。
 */

'use strict';

const DENSITY = 2;

function colorToCSS(color, alpha) {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha === undefined ? 1 : alpha) + ')';
}

function TextureFactory(ctx) {
    this.ctx = ctx;
    this._cache = {};
}

TextureFactory.prototype._canvas = function (w, h) {
    const canvas = this.ctx.createCanvas2D();
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    return canvas;
};

TextureFactory.prototype._toTexture = function (canvas) {
    const THREE = this.ctx.THREE;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;   // 非 2 幂尺寸, 禁 mipmap
    tex.generateMipmaps = false;
    return tex;
};

/**
 * 圆角矩形
 * radius <= 1 视为短边比例(0.5 = 胶囊), > 1 为 ui 单位像素
 */
TextureFactory.prototype.roundRect = function (w, h, opts) {
    opts = opts || {};
    const color = opts.color === undefined ? 0xFFFFFF : opts.color;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;
    let radius = opts.radius === undefined ? 0 : opts.radius;
    if (radius <= 1) radius = radius * Math.min(w, h);
    radius = Math.min(radius, Math.min(w, h) / 2);

    const key = 'rr:' + [w, h, color, alpha, radius, opts.borderColor, opts.borderWidth].join(',');
    if (this._cache[key]) return this._cache[key];

    const cw = w * DENSITY, ch = h * DENSITY, r = radius * DENSITY;
    const canvas = this._canvas(cw, ch);
    const g = canvas.getContext('2d');

    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(cw - r, 0); g.arcTo(cw, 0, cw, r, r);
    g.lineTo(cw, ch - r); g.arcTo(cw, ch, cw - r, ch, r);
    g.lineTo(r, ch); g.arcTo(0, ch, 0, ch - r, r);
    g.lineTo(0, r); g.arcTo(0, 0, r, 0, r);
    g.closePath();

    g.fillStyle = colorToCSS(color, alpha);
    g.fill();

    if (opts.borderWidth) {
        g.lineWidth = opts.borderWidth * DENSITY;
        g.strokeStyle = colorToCSS(opts.borderColor === undefined ? 0xFFFFFF : opts.borderColor, 1);
        g.stroke();
    }

    const tex = this._toTexture(canvas);
    this._cache[key] = tex;
    return tex;
};

TextureFactory.prototype.circle = function (diameter, opts) {
    opts = opts || {};
    const color = opts.color === undefined ? 0xFFFFFF : opts.color;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;

    const key = 'c:' + [diameter, color, alpha].join(',');
    if (this._cache[key]) return this._cache[key];

    const d = diameter * DENSITY;
    const canvas = this._canvas(d, d);
    const g = canvas.getContext('2d');
    g.beginPath();
    g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2);
    g.fillStyle = colorToCSS(color, alpha);
    g.fill();

    const tex = this._toTexture(canvas);
    this._cache[key] = tex;
    return tex;
};

TextureFactory.prototype.ring = function (diameter, thickness, opts) {
    opts = opts || {};
    const color = opts.color === undefined ? 0xFFFFFF : opts.color;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;

    const key = 'ring:' + [diameter, thickness, color, alpha].join(',');
    if (this._cache[key]) return this._cache[key];

    const d = diameter * DENSITY, t = thickness * DENSITY;
    const canvas = this._canvas(d, d);
    const g = canvas.getContext('2d');
    g.beginPath();
    g.arc(d / 2, d / 2, (d - t) / 2, 0, Math.PI * 2);
    g.lineWidth = t;
    g.strokeStyle = colorToCSS(color, alpha);
    g.stroke();

    const tex = this._toTexture(canvas);
    this._cache[key] = tex;
    return tex;
};

TextureFactory.prototype.dispose = function () {
    for (const key in this._cache) this._cache[key].dispose();
    this._cache = {};
};

module.exports = TextureFactory;
