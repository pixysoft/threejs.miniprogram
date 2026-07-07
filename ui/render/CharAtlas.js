/**
 * CharAtlas — 文本字符图集（cocos DynamicAtlas 的预烘焙裁剪版）
 *
 * ui.charAtlas.bake('0123456789+-:', { size: 32, color: 0xFFFFFF, bold: true })
 * 一次性把字符集绘进单张 canvas 纹理; UILabel({ atlas: true }) setText 时
 * 逐字查表出 quad, 不再重绘 canvas/重传纹理。任一字符缺失 → 回退整段绘字。
 *
 * 同 style(size+color+bold) 合并进同一集合; 纹理 2x 密度。
 */

'use strict';

const DENSITY = 2;
const MAX_ROW_W = 1024;   // 图集行宽上限(2x 密度像素)

function colorToCSS(color) {
    return 'rgb(' + ((color >> 16) & 0xFF) + ',' + ((color >> 8) & 0xFF) + ',' + (color & 0xFF) + ')';
}

function styleKey(size, color, bold) {
    return size + '|' + color + '|' + (bold ? 1 : 0);
}

function CharAtlas(ctx) {
    this.ctx = ctx;
    this._sets = {};   // styleKey → { texture, glyphs: { char → {u0,v0,u1,v1,w} }, size, lineH }
}

/** 烘焙字符集(可多次调用追加新 style; 同 style 重复 bake 覆盖重建) */
CharAtlas.prototype.bake = function (chars, style) {
    style = style || {};
    const size = style.size || 28;
    const color = style.color === undefined ? 0xFFFFFF : style.color;
    const bold = !!style.bold;
    const key = styleKey(size, color, bold);

    const THREE = this.ctx.THREE;
    const canvas = this.ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const font = (bold ? 'bold ' : '') + (size * DENSITY) + 'px sans-serif';
    const cellH = Math.ceil(size * 1.3 * DENSITY);

    // 去重 + 量宽
    const list = [];
    const seen = {};
    g.font = font;
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (seen[ch]) continue;
        seen[ch] = true;
        list.push({ ch: ch, w: Math.ceil(g.measureText(ch).width) + 2 });   // +2 防溢色
    }

    // 行排布
    let x = 0, row = 0, canvasW = 1;
    const places = [];
    for (let i = 0; i < list.length; i++) {
        if (x + list[i].w > MAX_ROW_W && x > 0) { x = 0; row++; }
        places.push({ x: x, row: row });
        x += list[i].w;
        if (x > canvasW) canvasW = x;
    }
    const canvasH = (row + 1) * cellH;

    canvas.width = canvasW;
    canvas.height = canvasH;
    g.font = font;
    g.fillStyle = colorToCSS(color);
    g.textBaseline = 'middle';
    g.textAlign = 'left';

    const glyphs = {};
    for (let i = 0; i < list.length; i++) {
        const px = places[i].x;
        const py = places[i].row * cellH;
        g.fillText(list[i].ch, px + 1, py + cellH / 2);
        glyphs[list[i].ch] = {
            u0: px / canvasW,
            u1: (px + list[i].w) / canvasW,
            v0: 1 - (py + cellH) / canvasH,   // quad 底
            v1: 1 - py / canvasH,             // quad 顶
            w: list[i].w / DENSITY,           // ui 单位宽
        };
    }

    const old = this._sets[key];
    if (old) old.texture.dispose();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    this._sets[key] = { texture: texture, glyphs: glyphs, size: size, lineH: size * 1.3 };
    return this._sets[key];
};

/**
 * 查询: style 对应集合存在且 text 全部字符已烘焙
 * → { texture, lineH, glyphs: [逐字 glyph] } | null(调用方回退)
 */
CharAtlas.prototype.lookup = function (size, color, bold, text) {
    const set = this._sets[styleKey(size, color, bold)];
    if (!set) return null;
    const out = [];
    for (let i = 0; i < text.length; i++) {
        const glyph = set.glyphs[text[i]];
        if (!glyph) return null;
        out.push(glyph);
    }
    return { texture: set.texture, lineH: set.lineH, glyphs: out };
};

CharAtlas.prototype.dispose = function () {
    for (const key in this._sets) this._sets[key].texture.dispose();
    this._sets = {};
};

module.exports = CharAtlas;
