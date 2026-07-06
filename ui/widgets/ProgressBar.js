/**
 * ProgressBar — 进度条（Theme 键 ProgressBar）
 * opts: { w=300, h=24, ratio=0, text, skin }
 * API: setRatio(0~1) / setText(str)
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');

function ProgressBar(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 300;
    const h = opts.h || 24;
    this._skinOverride = opts.skin || null;
    this._ratio = 0;

    this.bg = new UISprite(ctx, { w: w, h: h });
    this.addChild(this.bg);

    this.fill = new UISprite(ctx, { w: 0, h: h });
    this.addChild(this.fill);

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
    this.bg.setTexture(this.ctx.textures.roundRect(this.width, this.height, skin.bg || {}));

    const fillW = Math.max(1, Math.round(this.width * this._ratio));
    if (this._ratio > 0) {
        this.fill.visible = true;
        this.fill.setSize(fillW, this.height);
        this.fill.setTexture(this.ctx.textures.roundRect(fillW, this.height, skin.fill || {}));
    } else {
        this.fill.visible = false;
    }

    if (this.labelNode) {
        const lbl = skin.label || {};
        if (lbl.color !== undefined) this.labelNode.setColor(lbl.color);
        this.labelNode.anchorX = 0.5;
        this.labelNode.anchorY = 0.5;
        this.labelNode.setPosition(this.width / 2, this.height / 2);
    }
};

ProgressBar.prototype.setRatio = function (ratio) {
    this._ratio = Math.max(0, Math.min(1, ratio));
    this._applySkin();
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
