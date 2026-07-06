/**
 * UILabel — 文本元件（2D canvas 绘字 → CanvasTexture）
 *
 * opts: { text, size=28, color=0xFFFFFF, bold, align='left',
 *         wrap=false, maxWidth, lineHeight=1.3 }
 * 尺寸由文本内容决定(width/height 自动), 亦可 maxWidth 换行。
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

UILabel.prototype._redraw = function () {
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
};

UILabel.prototype._onResize = function () {
    this.mesh.scale.set(Math.max(this.width, 0.0001), Math.max(this.height, 0.0001), 1);
};

UILabel.prototype._applyAlpha = function (worldAlpha) {
    this.material.opacity = worldAlpha;
};

UILabel.prototype._disposeSelf = function () {
    this.material.dispose();
    this.texture.dispose();
};

module.exports = UILabel;
