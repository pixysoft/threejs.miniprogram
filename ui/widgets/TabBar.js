/**
 * TabBar — 标签栏（选中态切换不重建; Theme 键 TabBar）
 * opts: { w, h=88, items: ['a','b',...], index=0, onChange(index), skin }
 * API: setIndex(i, silent) / getIndex()
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');

function TabBar(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 750;
    const h = opts.h || 88;
    this._skinOverride = opts.skin || null;
    this._items = opts.items || [];
    this._index = opts.index || 0;
    this._onChange = opts.onChange;

    this.bg = new UISprite(ctx, { w: w, h: h });
    this.addChild(this.bg);

    this.indicator = new UISprite(ctx, { w: 0, h: 4 });
    this.addChild(this.indicator);

    this._labels = [];
    this._cells = [];
    const self = this;
    const cellW = w / Math.max(1, this._items.length);

    for (let i = 0; i < this._items.length; i++) {
        (function (idx) {
            const cell = new UINode(ctx);
            cell.setSize(cellW, h);
            cell.setPosition(idx * cellW, 0);
            ctx.events.makePressable(cell, {
                onTap: function () { self.setIndex(idx); },
            });
            self.addChild(cell);
            self._cells.push(cell);

            const lbl = new UILabel(ctx, { text: self._items[idx] });
            lbl.anchorX = 0.5;
            lbl.anchorY = 0.5;
            lbl.setPosition(cellW / 2, h / 2);
            cell.addChild(lbl);
            self._labels.push(lbl);
        })(i);
    }

    this.setSize(w, h);
    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
}

TabBar.prototype = Object.create(UINode.prototype);
TabBar.prototype.constructor = TabBar;

TabBar.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('TabBar', this._skinOverride);
    this.bg.setTexture(this.ctx.textures.roundRect(this.width, this.height, skin.bg || {}));

    const cellW = this.width / Math.max(1, this._items.length);
    for (let i = 0; i < this._labels.length; i++) {
        const style = i === this._index ? (skin.itemActive || {}) : (skin.item || {});
        if (style.color !== undefined) this._labels[i].setColor(style.color);
    }

    const indW = cellW * 0.5;
    this.indicator.setSize(indW, 4);
    this.indicator.setTexture(this.ctx.textures.roundRect(indW, 4, skin.indicator || {}));
    this.indicator.setPosition(this._index * cellW + (cellW - indW) / 2, this.height - 6);
};

TabBar.prototype.setIndex = function (index, silent) {
    index = Math.max(0, Math.min(index, this._items.length - 1));
    if (index === this._index) return;
    this._index = index;
    this._applySkin();
    if (!silent && this._onChange) this._onChange(index);
    this.emit('change', index);
};

TabBar.prototype.getIndex = function () { return this._index; };

TabBar.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = TabBar;
