/**
 * Modal — 遮罩 + 居中面板（对标 pixi Modal; 遮罩 blockInput 防穿透）
 *
 * opts: { w=560, h=400, title, closable=true, onClose, maskTap='close'|'none', skin }
 * API: body(内容容器) show() hide() close()
 * show/hide 带淡入淡出(依赖 ctx.api.tween)。
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');

function Modal(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const view = ctx.view;
    const w = opts.w || 560;
    const h = opts.h || 400;
    this._skinOverride = opts.skin || null;

    const skin = ctx.theme.resolve('Modal', this._skinOverride);
    const self = this;

    // 全屏遮罩: blockInput 吞掉所有触摸
    this.mask = new UISprite(ctx, { w: view.width, h: view.height, color: skin.mask.color });
    this.mask.alpha = skin.mask.alpha;
    this.mask.blockInput = true;
    if (opts.maskTap !== 'none') {
        ctx.events.makePressable(this.mask, { onTap: function () { self.close(); } });
    }
    this.addChild(this.mask);

    // 居中面板
    this.panel = new UISprite(ctx, { w: w, h: h });
    this.panel.setTexture(ctx.textures.roundRect(w, h, skin.panel));
    this.panel.setPosition((view.width - w) / 2, (view.height - h) / 2);
    this.panel.blockInput = true;   // 面板区域不透传给遮罩(防误关)
    this.addChild(this.panel);

    if (opts.title) {
        this.titleLabel = new UILabel(ctx, {
            text: opts.title,
            size: skin.title.size, color: skin.title.color, bold: skin.title.bold,
        });
        this.titleLabel.anchorX = 0.5;
        this.titleLabel.setPosition(this.panel.x + w / 2, this.panel.y + 24);
        this.addChild(this.titleLabel);
    }

    if (opts.closable !== false) {
        this.closeBtn = new UILabel(ctx, { text: '\u00d7', size: skin.close.size, color: skin.close.color });
        this.closeBtn.setPosition(this.panel.x + w - 56, this.panel.y + 16);
        ctx.events.makePressable(this.closeBtn, { onTap: function () { self.close(); } });
        this.addChild(this.closeBtn);
    }

    // 内容容器(相对面板内边距)
    this.body = new UINode(ctx);
    this.body.setPosition(this.panel.x + 32, this.panel.y + (opts.title ? 88 : 32));
    this.body.setSize(w - 64, h - (opts.title ? 120 : 64));
    this.addChild(this.body);

    this._onClose = opts.onClose;
    this.setSize(view.width, view.height);
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

module.exports = Modal;
