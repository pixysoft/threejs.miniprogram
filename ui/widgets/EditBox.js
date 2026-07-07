/**
 * EditBox — 输入框（对标 cocos minigame EditBox: wx.showKeyboard 分流）
 *
 * WebGL 内只画显示框, 输入本体走注入的 keyboard 接口(createUI opts.keyboard):
 *   { show(opts), hide(), onInput/offInput, onConfirm/offConfirm, onComplete/offComplete }
 * 未注入 keyboard 时退化为只读显示框。
 *
 * opts: { w=400, h=72, text, placeholder, maxLength=140, multiple=false,
 *         confirmType='done', password=false, skin,
 *         onChange(text), onConfirm(text), onBlur(text) }
 * API: getText() / setText(v) / focus() / blur() / setEnabled(bool)
 * 单实例约束(cocos _currentEditBoxImpl): 新实例 focus 时自动 blur 旧实例。
 */

'use strict';

const UINode = require('../core/UINode');
const UILabel = require('../render/UILabel');
const skinMod = require('../render/skin');

let _current = null;   // 当前 editing 实例(全局单例约束)

const PAD_X = 16;

function EditBox(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 400;
    const h = opts.h || 72;
    this._skinOverride = opts.skin || null;
    this._text = opts.text || '';
    this._placeholder = opts.placeholder || '';
    this._maxLength = opts.maxLength === undefined ? 140 : opts.maxLength;
    this._multiple = !!opts.multiple;
    this._confirmType = opts.confirmType || 'done';
    this._password = !!opts.password;
    this._onChange = opts.onChange;
    this._onConfirm = opts.onConfirm;
    this._onBlur = opts.onBlur;
    this.editing = false;
    this._handlers = null;

    this.bgHolder = new UINode(ctx);
    this.addChild(this.bgHolder);
    this.bg = null;

    this.textLabel = new UILabel(ctx, { text: '' });
    this.textLabel.anchorY = 0.5;
    this.addChild(this.textLabel);

    this.placeholderLabel = new UILabel(ctx, { text: this._placeholder });
    this.placeholderLabel.anchorY = 0.5;
    this.addChild(this.placeholderLabel);

    this.setSize(w, h);

    const self = this;
    ctx.events.makePressable(this, { onTap: function () { self.focus(); } });

    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
    this._syncText();
}

EditBox.prototype = Object.create(UINode.prototype);
EditBox.prototype.constructor = EditBox;

/* ---------------- 渲染 ---------------- */

EditBox.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('EditBox', this._skinOverride);
    this._skin = skin;

    const cfg = (this.editing && skin.bgFocus) ? skin.bgFocus : (skin.bg || {});
    if (this.bg) this.bg.destroy();
    this.bg = skinMod.makeBg(this.ctx, cfg, this.width, this.height);
    this.bgHolder.addChild(this.bg);

    const txt = skin.text || {};
    if (txt.color !== undefined) this.textLabel.setColor(txt.color);
    const ph = skin.placeholder || {};
    if (ph.color !== undefined) this.placeholderLabel.setColor(ph.color);

    this.textLabel.setPosition(PAD_X, this.height / 2);
    this.placeholderLabel.setPosition(PAD_X, this.height / 2);
};

/** 显示文本: 密码打点 + 超宽尾部截断(保留最近输入) */
EditBox.prototype._syncText = function () {
    const empty = this._text.length === 0;
    this.placeholderLabel.visible = empty;
    this.textLabel.visible = !empty;
    if (empty) return;

    let display = this._password
        ? new Array(this._text.length + 1).join('\u2022')
        : this._text;
    const avail = this.width - PAD_X * 2;
    this.textLabel.setText(display);
    while (this.textLabel.width > avail && display.length > 1) {
        display = display.slice(1);
        this.textLabel.setText('\u2026' + display);
    }
    this.textLabel.setPosition(PAD_X, this.height / 2);
};

/* ---------------- 文本 ---------------- */

EditBox.prototype.getText = function () { return this._text; };

EditBox.prototype.setText = function (v) {
    v = String(v === undefined || v === null ? '' : v);
    if (this._maxLength >= 0) v = v.slice(0, this._maxLength);
    if (v === this._text) return;
    this._text = v;
    this._syncText();
};

/* ---------------- 键盘协议 ---------------- */

EditBox.prototype.focus = function () {
    const kb = this.ctx.keyboard;
    if (!kb || this.editing || this.destroyed) return;
    if (_current && _current !== this) _current.blur();

    const self = this;
    this._handlers = {
        input: function (res) {
            if (res && res.value !== undefined && res.value !== self._text) {
                self.setText(res.value);
                if (self._onChange) self._onChange(self._text);
            }
        },
        confirm: function (res) {
            if (res && res.value !== undefined) self.setText(res.value);
            if (self._onConfirm) self._onConfirm(self._text);
        },
        complete: function (res) {
            if (res && res.value !== undefined && res.value !== self._text) self.setText(res.value);
            self._finishEditing();
        },
    };
    if (kb.onInput) kb.onInput(this._handlers.input);
    if (kb.onConfirm) kb.onConfirm(this._handlers.confirm);
    if (kb.onComplete) kb.onComplete(this._handlers.complete);

    kb.show({
        defaultValue: this._text,
        maxLength: this._maxLength,
        multiple: this._multiple,
        confirmHold: false,
        confirmType: this._confirmType,
    });

    this.editing = true;
    _current = this;
    this._applySkin();
    this.emit('focus');
};

EditBox.prototype.blur = function () {
    if (!this.editing) return;
    const kb = this.ctx.keyboard;
    if (kb && kb.hide) kb.hide();
    this._finishEditing();
};

/** 结束编辑(幂等): 注销回调 + 皮肤还原 + onBlur */
EditBox.prototype._finishEditing = function () {
    if (!this.editing) return;
    this.editing = false;
    if (_current === this) _current = null;

    const kb = this.ctx.keyboard;
    if (kb && this._handlers) {
        if (kb.offInput) kb.offInput(this._handlers.input);
        if (kb.offConfirm) kb.offConfirm(this._handlers.confirm);
        if (kb.offComplete) kb.offComplete(this._handlers.complete);
    }
    this._handlers = null;

    if (!this.destroyed) this._applySkin();
    if (this._onBlur) this._onBlur(this._text);
    this.emit('blur');
};

EditBox.prototype._onResize = function () {
    if (this.bg) {
        this._applySkin();
        this._syncText();
    }
};

EditBox.prototype._disposeSelf = function () {
    this.blur();
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = EditBox;
