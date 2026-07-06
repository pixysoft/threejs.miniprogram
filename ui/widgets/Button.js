/**
 * Button — 三态按钮（对标 cocos Button; down 无独立皮肤时缩放回退 = zoomScale）
 *
 * opts: { text, w=200, h=80, onTap, skin, enabled=true }
 * API: setLabel(text) / setEnabled(bool) / isEnabled() / on('tap')
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');

function Button(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 200;
    const h = opts.h || 80;
    this._skinOverride = opts.skin || null;
    this._state = 'up';

    this.bg = new UISprite(ctx, { w: w, h: h });
    this.addChild(this.bg);

    this.labelNode = new UILabel(ctx, { text: opts.text || '' });
    this.addChild(this.labelNode);

    this.setSize(w, h);

    const self = this;
    ctx.events.makePressable(this, {
        enabled: opts.enabled,
        onTap: opts.onTap,
        onStateChange: function (state) {
            self._state = state;
            self._applySkin();
        },
    });

    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
}

Button.prototype = Object.create(UINode.prototype);
Button.prototype.constructor = Button;

Button.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('Button', this._skinOverride);
    let bg = skin.bg || {};
    let zoom = 1;

    if (this._state === 'disabled' && skin.bgDisabled) {
        bg = skin.bgDisabled;
    } else if (this._state === 'down') {
        if (skin.bgDown) bg = skin.bgDown;
        else zoom = skin.zoomDown || 0.95;   // 无 down 皮肤 → 缩放回退
    }

    this.bg.setTexture(this.ctx.textures.roundRect(this.width, this.height, bg));
    this.bg.scale = zoom;
    this.bg.anchorX = 0.5;
    this.bg.anchorY = 0.5;
    this.bg.setPosition(this.width / 2, this.height / 2);

    const lbl = skin.label || {};
    if (lbl.color !== undefined) this.labelNode.setColor(lbl.color);
    this._centerLabel();
};

Button.prototype._centerLabel = function () {
    this.labelNode.anchorX = 0.5;
    this.labelNode.anchorY = 0.5;
    this.labelNode.setPosition(this.width / 2, this.height / 2);
};

Button.prototype.setLabel = function (text) {
    this.labelNode.setText(text);
    this._centerLabel();
};

Button.prototype._onResize = function () {
    if (this.bg) this._applySkin();
};

Button.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Button;
