/**
 * Modal — 遮罩 + 居中面板（对标 pixi Modal; 遮罩 blockInput 防穿透）
 *
 * opts: { w=560, h=400, title, closable=true, onClose, maskTap='close'|'none', skin }
 * API: body(内容容器) show() hide() close()
 * show/hide 带淡入淡出(依赖 ctx.api.tween)。
 * mask/panel 挂 Widget: 横竖屏切换自动铺满/居中; title/close/body 为 panel 子节点。
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');
const Widget = require('../core/Widget');
const skinMod = require('../render/skin');

function Modal(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const view = ctx.view;
    const w = opts.w || 560;
    const h = opts.h || 400;
    this._skinOverride = opts.skin || null;

    const skin = ctx.theme.resolve('Modal', this._skinOverride);
    const self = this;
    this._detachers = [];

    // 全屏遮罩: blockInput 吞掉所有触摸; Widget 双边拉伸跟随视口
    this.mask = new UISprite(ctx, { w: view.width, h: view.height, color: skin.mask.color });
    this.mask.alpha = skin.mask.alpha;
    this.mask.blockInput = true;
    if (opts.maskTap !== 'none') {
        ctx.events.makePressable(this.mask, { onTap: function () { self.close(); } });
    }
    this.addChild(this.mask);
    this._detachers.push(Widget.attach(this.mask, { left: 0, right: 0, top: 0, bottom: 0 }, ctx));

    // 居中面板(Widget 居中); 背景走 makeBg 回退链(支持图集帧);
    // title/close/body 挂在 panel 下相对定位
    this.panel = new UINode(ctx);
    this.panel.setSize(w, h);
    this.panel.blockInput = true;   // 面板区域不透传给遮罩(防误关)
    this.panelBg = skinMod.makeBg(ctx, skin.panel || {}, w, h);
    this.panel.addChild(this.panelBg);
    this.addChild(this.panel);
    this._detachers.push(Widget.attach(this.panel, { centerX: 0, centerY: 0, w: w, h: h }, ctx));

    if (opts.title) {
        this.titleLabel = new UILabel(ctx, {
            text: opts.title,
            size: skin.title.size, color: skin.title.color, bold: skin.title.bold,
        });
        this.titleLabel.anchorX = 0.5;
        this.titleLabel.setPosition(w / 2, 24);
        this.panel.addChild(this.titleLabel);
    }

    if (opts.closable !== false) {
        this.closeBtn = new UILabel(ctx, { text: '\u00d7', size: skin.close.size, color: skin.close.color });
        this.closeBtn.setPosition(w - 56, 16);
        ctx.events.makePressable(this.closeBtn, { onTap: function () { self.close(); } });
        this.panel.addChild(this.closeBtn);
    }

    // 内容容器(面板内边距)
    this.body = new UINode(ctx);
    this.body.setPosition(32, opts.title ? 88 : 32);
    this.body.setSize(w - 64, h - (opts.title ? 120 : 64));
    this.panel.addChild(this.body);

    this._onClose = opts.onClose;
    this.setSize(view.width, view.height);
    this._detachers.push(Widget.attach(this, { left: 0, right: 0, top: 0, bottom: 0 }, ctx));
    this.visible = false;
    this.alpha = 0;
}

Modal.prototype = Object.create(UINode.prototype);
Modal.prototype.constructor = Modal;

Modal.prototype.show = function () {
    if (this.parent === null) this.ctx.root.addChild(this);
    this.visible = true;
    this.ctx.api.tween(this).to({ alpha: 1 }, 160, 'quadOut');
    return this;
};

Modal.prototype.hide = function () {
    const self = this;
    this.ctx.api.tween(this).to({ alpha: 0 }, 160, 'quadOut').call(function () {
        self.visible = false;
    });
    return this;
};

Modal.prototype.close = function () {
    this.hide();
    if (this._onClose) this._onClose();
    this.emit('close');
};

Modal.prototype._disposeSelf = function () {
    for (let i = 0; i < this._detachers.length; i++) this._detachers[i]();
    this._detachers = [];
};

module.exports = Modal;
