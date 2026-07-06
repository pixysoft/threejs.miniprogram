/**
 * Slider — 滑杆（Theme 键 Slider; 拖拽逻辑对标 pixi Slider 按世界 x 取值）
 * opts: { w=300, h=40, min=0, max=100, step=0, value=min, onChange(v), skin }
 * API: setValue(v, silent) / getValue()
 */

'use strict';

const UINode = require('../core/UINode');
const UISprite = require('../render/UISprite');

function Slider(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    const w = opts.w || 300;
    const h = opts.h || 40;
    this._skinOverride = opts.skin || null;
    this._min = opts.min === undefined ? 0 : opts.min;
    this._max = opts.max === undefined ? 100 : opts.max;
    this._step = opts.step || 0;
    this._value = opts.value === undefined ? this._min : opts.value;
    this._onChange = opts.onChange;
    this._trackH = Math.min(12, h);

    this.track = new UISprite(ctx, { w: w, h: this._trackH });
    this.addChild(this.track);

    this.fill = new UISprite(ctx, { w: 0, h: this._trackH });
    this.addChild(this.fill);

    this.knob = new UISprite(ctx, { w: h, h: h });
    this.addChild(this.knob);

    this.setSize(w, h);
    this.interactive = true;

    const self = this;
    this.on('pointerdown', function (ev) { self._pick(ev.x); });
    this.on('pointermove', function (ev) { self._pick(ev.x); });

    this._unsubscribe = ctx.theme.subscribe(function () { self._applySkin(); });
    this._applySkin();
}

Slider.prototype = Object.create(UINode.prototype);
Slider.prototype.constructor = Slider;

Slider.prototype._pick = function (worldX) {
    const b = this.worldAABB();
    const ratio = Math.max(0, Math.min(1, (worldX - b.x) / b.w));
    let v = this._min + ratio * (this._max - this._min);
    if (this._step > 0) v = Math.round(v / this._step) * this._step;
    this.setValue(v);
};

Slider.prototype._applySkin = function () {
    const skin = this.ctx.theme.resolve('Slider', this._skinOverride);
    const trackY = (this.height - this._trackH) / 2;

    this.track.setSize(this.width, this._trackH);
    this.track.setTexture(this.ctx.textures.roundRect(this.width, this._trackH, skin.track || {}));
    this.track.setPosition(0, trackY);

    const ratio = (this._max === this._min) ? 0 : (this._value - this._min) / (this._max - this._min);
    const fillW = Math.max(1, Math.round(this.width * ratio));
    if (ratio > 0) {
        this.fill.visible = true;
        this.fill.setSize(fillW, this._trackH);
        this.fill.setTexture(this.ctx.textures.roundRect(fillW, this._trackH, skin.fill || {}));
        this.fill.setPosition(0, trackY);
    } else {
        this.fill.visible = false;
    }

    this.knob.setSize(this.height, this.height);
    this.knob.setTexture(this.ctx.textures.circle(this.height, skin.knob || {}));
    this.knob.setPosition(ratio * (this.width - this.height), 0);
};

Slider.prototype.setValue = function (v, silent) {
    v = Math.max(this._min, Math.min(this._max, v));
    if (v === this._value) return;
    this._value = v;
    this._applySkin();
    if (!silent && this._onChange) this._onChange(v);
    this.emit('change', v);
};

Slider.prototype.getValue = function () { return this._value; };

Slider.prototype._disposeSelf = function () {
    if (this._unsubscribe) this._unsubscribe();
};

module.exports = Slider;
