/**
 * Panel — 圆角底面板容器（Theme 键 Panel）
 * opts: { w, h, skin(实例级皮肤覆盖) }
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');

function Panel(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    this._skinOverride = opts.skin || null;
    this.bg = new UISprite(ctx, { w: opts.w || 100, h: opts.h || 100 });
    this.addChild(this.bg);
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
    this.bg.setTexture(this.ctx.textures.roundRect(this.width, this.height, bg));
    this.bg.alpha = bg.alpha === undefined ? 1 : bg.alpha;
};

Panel.prototype._onResize = function () {
    if (this.bg) {
        this.bg.setSize(this.width, this.height);
        this._applySkin();
    }
};

Panel.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Panel;
