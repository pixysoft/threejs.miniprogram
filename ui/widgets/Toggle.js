/**
 * Toggle — 开关（Theme 键 Toggle）
 * opts: { w=100, h=56, checked=false, onChange(checked), skin }
 * API: setChecked(bool, silent) / isChecked()
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');

function Toggle(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 100;
    const h = opts.h || 56;
    this._skinOverride = opts.skin || null;
    this._checked = !!opts.checked;
    this._onChange = opts.onChange;

    this.bg = new UISprite(ctx, { w: w, h: h });
    this.addChild(this.bg);

    const knobSize = h - 8;
    this.knob = new UISprite(ctx, { w: knobSize, h: knobSize });
    this.addChild(this.knob);

    this.setSize(w, h);

    const self = this;
    ctx.events.makePressable(this, {
        onTap: function () { self.setChecked(!self._checked); },
    });

    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
}

Toggle.prototype = Object.create(UINode.prototype);
Toggle.prototype.constructor = Toggle;

Toggle.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('Toggle', this._skinOverride);
    const bg = this._checked ? (skin.bgOn || {}) : (skin.bgOff || {});
    this.bg.setSize(this.width, this.height);
    this.bg.setTexture(this.ctx.textures.roundRect(this.width, this.height, bg));

    const knobSize = this.height - 8;
    this.knob.setSize(knobSize, knobSize);
    this.knob.setTexture(this.ctx.textures.circle(knobSize, skin.knob || {}));
    this.knob.setPosition(this._checked ? this.width - knobSize - 4 : 4, 4);
};

Toggle.prototype.setChecked = function (checked, silent) {
    checked = !!checked;
    if (checked === this._checked) return;
    this._checked = checked;
    this._applySkin();
    if (!silent && this._onChange) this._onChange(checked);
    this.emit('change', checked);
};

Toggle.prototype.isChecked = function () { return this._checked; };

Toggle.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Toggle;
