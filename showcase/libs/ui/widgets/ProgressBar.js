/**
 * ProgressBar — 进度条（Theme 键 ProgressBar）
 * opts: { w=300, h=24, ratio=0, text, skin }
 * API: setRatio(0~1) / setText(str)
 */

'use strict';

const UINode = require('../core/UINode');
const UILabel = require('../render/UILabel');
const skinMod = require('../render/skin');

function ProgressBar(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 300;
    const h = opts.h || 24;
    this._skinOverride = opts.skin || null;
    this._ratio = 0;

    this.bgHolder = new UINode(ctx);
    this.addChild(this.bgHolder);
    this.bg = null;
    this.fill = null;

    this.labelNode = null;
    if (opts.text !== undefined) {
        this.labelNode = new UILabel(ctx, { text: opts.text, size: 22 });
        this.addChild(this.labelNode);
    }

    this.setSize(w, h);

    const self = this;
    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
    this.setRatio(opts.ratio || 0);
}

ProgressBar.prototype = Object.create(UINode.prototype);
ProgressBar.prototype.constructor = ProgressBar;

ProgressBar.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('ProgressBar', this._skinOverride);

    if (this.bg) this.bg.destroy();
    this.bg = skinMod.makeBg(this.ctx, skin.bg || {}, this.width, this.height);
    this.bgHolder.addChild(this.bg);

    if (this.fill) this.fill.destroy();
    this._fillCfg = skin.fill || {};
    this.fill = skinMod.makeBg(this.ctx, this._fillCfg, Math.max(1, Math.round(this.width * this._ratio)), this.height);
    this.bgHolder.addChild(this.fill);
    this._syncFill();

    if (this.labelNode) {
        const lbl = skin.label || {};
        if (lbl.color !== undefined) this.labelNode.setColor(lbl.color);
        this.labelNode.anchorX = 0.5;
        this.labelNode.anchorY = 0.5;
        this.labelNode.setPosition(this.width / 2, this.height / 2);
    }
};

/** ratio 变化只改 fill 尺寸, 不重建节点 */
ProgressBar.prototype._syncFill = function () {
    if (!this.fill) return;
    if (this._ratio > 0) {
        this.fill.visible = true;
        const fillW = Math.max(1, Math.round(this.width * this._ratio));
        skinMod.resizeBg(this.ctx, this.fill, this._fillCfg, fillW, this.height);
    } else {
        this.fill.visible = false;
    }
};

ProgressBar.prototype.setRatio = function (ratio) {
    this._ratio = Math.max(0, Math.min(1, ratio));
    this._syncFill();
};

ProgressBar.prototype.getRatio = function () { return this._ratio; };

ProgressBar.prototype.setText = function (text) {
    if (!this.labelNode) {
        this.labelNode = new UILabel(this.ctx, { text: text, size: 22 });
        this.addChild(this.labelNode);
    } else {
        this.labelNode.setText(text);
    }
    this._applySkin();
};

ProgressBar.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = ProgressBar;
