/**
 * Panel — 圆角底面板容器（Theme 键 Panel）
 * opts: { w, h, skin(实例级皮肤覆盖) }
 */

'use strict';

const UINode = require('../core/UINode');
const skinMod = require('../render/skin');

function Panel(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    this._skinOverride = opts.skin || null;
    this.bgHolder = new UINode(ctx);
    this.addChild(this.bgHolder);
    this.bg = null;
    this.setSize(opts.w || 100, opts.h || 100);

    const self = this;
    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
}

Panel.prototype = Object.create(UINode.prototype);
Panel.prototype.constructor = Panel;

Panel.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('Panel', this._skinOverride);
    const bg = skin.bg || {};
    if (this.bg) this.bg.destroy();
    this.bg = skinMod.makeBg(this.ctx, bg, this.width, this.height);
    this.bg.alpha = bg.alpha === undefined ? 1 : bg.alpha;
    this.bgHolder.addChild(this.bg);
    this._bgCfg = bg;
};

Panel.prototype._onResize = function () {
    if (this.bg) {
        skinMod.resizeBg(this.ctx, this.bg, this._bgCfg, this.width, this.height);
    }
};

Panel.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Panel;
