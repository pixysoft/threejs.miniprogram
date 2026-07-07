/**
 * RichLabel — 分段着色富文本（移植 pixi widgets.richLabel）
 *
 * segments: [{ text, color?, size?, bold? }, ...]
 * opts: { size, color, bold, wrapWidth, lineGap=6 }
 * 贪心换行: wrapWidth 给定且当前行放不下整段时换行, 段内不拆字。
 * API: setSegments(segs); 尺寸自动 = (最宽行, 总高)。
 */

'use strict';

const UINode = require('../core/UINode');
const UILabel = require('./UILabel');

function RichLabel(ctx, segments, opts) {
    UINode.call(this, ctx);
    this._opts = opts || {};
    this._labels = [];
    this.setSegments(segments || []);
}

RichLabel.prototype = Object.create(UINode.prototype);
RichLabel.prototype.constructor = RichLabel;

RichLabel.prototype.setSegments = function (segments) {
    const ctx = this.ctx;
    const opts = this._opts;
    const themeLabel = ctx.theme.get('Label');
    const lineGap = opts.lineGap === undefined ? 6 : opts.lineGap;
    const wrapWidth = opts.wrapWidth || 0;

    for (let i = 0; i < this._labels.length; i++) this._labels[i].destroy();
    this._labels = [];

    let x = 0, y = 0, lineH = 0, maxW = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const label = new UILabel(ctx, {
            text: seg.text,
            size: seg.size || opts.size || themeLabel.size,
            color: seg.color !== undefined ? seg.color
                : (opts.color !== undefined ? opts.color : themeLabel.color),
            bold: seg.bold !== undefined ? !!seg.bold : !!opts.bold,
        });
        if (wrapWidth && x > 0 && x + label.width > wrapWidth) {
            x = 0;
            y += lineH + lineGap;
            lineH = 0;
        }
        label.setPosition(x, y);
        this.addChild(label);
        this._labels.push(label);
        x += label.width;
        if (label.height > lineH) lineH = label.height;
        if (x > maxW) maxW = x;
    }
    this.setSize(maxW, segments.length ? y + lineH : 0);
};

module.exports = RichLabel;
