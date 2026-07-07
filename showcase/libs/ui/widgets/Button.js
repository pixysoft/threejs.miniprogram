/**
 * Button — 三态按钮（对标 cocos Button; down 无独立皮肤时缩放回退 = zoomScale）
 *
 * opts: { text, w=200, h=80, onTap, skin, enabled=true }
 * API: setLabel(text) / setEnabled(bool) / isEnabled() / on('tap')
 * 皮肤走 skin.makeBg 回退链(图集帧 → 程序化); 三态背景预构建, 状态切换只改可见性(pixi 方案)。
 */

'use strict';

const UINode = require('../core/UINode');
const UILabel = require('../render/UILabel');
const skinMod = require('../render/skin');

function Button(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 200;
    const h = opts.h || 80;
    this._skinOverride = opts.skin || null;
    this._state = 'up';
    this._bgs = {};

    this.bgHolder = new UINode(ctx);
    this.addChild(this.bgHolder);

    this.labelNode = new UILabel(ctx, { text: opts.text || '' });
    this.addChild(this.labelNode);

    this.setSize(w, h);

    const self = this;
    ctx.events.makePressable(this, {
        enabled: opts.enabled,
        onTap: opts.onTap,
        onStateChange: function (state) {
            self._state = state;
            self._applyState();
        },
    });

    this._unsubscribe = ctx.theme.subscribe(function () { self._rebuildSkin(); });
    this._rebuildSkin();
}

Button.prototype = Object.create(UINode.prototype);
Button.prototype.constructor = Button;

/** 主题变化/resize: 重建三态背景 */
Button.prototype._rebuildSkin = function () {
    const ctx = this.ctx;
    const skin = ctx.theme.resolve('Button', this._skinOverride);
    this._skin = skin;

    const olds = this.bgHolder.children.slice();
    for (let i = 0; i < olds.length; i++) olds[i].destroy();

    this._bgs = { up: skinMod.makeBg(ctx, skin.bg || {}, this.width, this.height) };
    if (skin.bgDown) this._bgs.down = skinMod.makeBg(ctx, skin.bgDown, this.width, this.height);
    if (skin.bgDisabled) this._bgs.disabled = skinMod.makeBg(ctx, skin.bgDisabled, this.width, this.height);

    for (const key in this._bgs) {
        const bg = this._bgs[key];
        bg.anchorX = 0.5;
        bg.anchorY = 0.5;
        bg.setPosition(this.width / 2, this.height / 2);
        bg.visible = false;
        this.bgHolder.addChild(bg);
    }

    const lbl = skin.label || {};
    if (lbl.color !== undefined) this.labelNode.setColor(lbl.color);
    this._centerLabel();
    this._applyState();
};

/** 状态切换: 只改可见性/缩放, 不重建 */
Button.prototype._applyState = function () {
    const skin = this._skin || {};
    let key = 'up';
    let zoom = 1;

    if (this._state === 'disabled' && this._bgs.disabled) {
        key = 'disabled';
    } else if (this._state === 'down') {
        if (this._bgs.down) key = 'down';
        else zoom = skin.zoomDown || 0.95;   // 无 down 皮肤 → 缩放回退
    }

    for (const k in this._bgs) this._bgs[k].visible = (k === key);
    this.bg = this._bgs[key];
    this.bg.scale = zoom;
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
    if (this.bgHolder) this._rebuildSkin();
};

Button.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Button;
