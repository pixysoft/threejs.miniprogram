/**
 * ScrollView — 滚动容器（算法移植 pixi-miniprogram, 手感参数源自 cocos/egret;
 * 拦截协议对标 cocos ViewGroup capture）
 *
 * opts: { w, h, direction='y'|'x', onScroll(pos), snapInterval, onSnap(index) }
 * API: content(内容节点) setContentSize(len) scrollTo(pos) scrollPos()
 *      snapTo(index, animated) refresh() update(dt)
 * 惯性/回弹/磁吸由 root ticker 自动驱动; 子控件按下后滚动超阈值 → cancelPress。
 * 裁剪: RectMask(clippingPlanes), 每帧跟随容器世界位置。
 */

'use strict';

const UINode = require('../core/UINode');
const RectMask = require('../render/Mask');

const CFG = {
    cancelOffset: 10,      // 滚动方向位移超此值取消子控件点击(cocos 7pt≈10px)
    overDrag: 0.5,         // 越界拖动阻尼(cocos/egret 一致)
    frictionBase: 0.992,   // 惯性摩擦(每 ms)
    overBrake: 0.85,       // 越界惯性额外制动
    minVelocity: 0.02,     // ui/ms, 低于即停
    bounceMs: 300,         // 回弹时长(egret finishScrolling)
    snapMs: 300,           // 磁吸吸附时长(quintOut)
    snapVelocity: 0.3,     // ui/ms, 超过即翻向速度方向的下一页
    sampleCount: 5,        // 速度采样帧数(cocos)
    sampleWeights: [1, 1.33, 1.66, 2, 2.33],  // 越新权重越大(egret 加权)
};

function quintOut(t) { const p = t - 1; return p * p * p * p * p + 1; }

function ScrollView(ctx, opts) {
    UINode.call(this, ctx);
    opts = opts || {};

    this.interactive = true;
    this._opts = opts;
    this._axis = opts.direction === 'x' ? 'x' : 'y';
    this._viewLen = this._axis === 'x' ? opts.w : opts.h;
    this._snapInterval = opts.snapInterval || 0;

    this.setSize(opts.w, opts.h);

    this.content = new UINode(ctx);
    this.addChild(this.content);

    this._mask = new RectMask(ctx);
    this.content.setClipPlanes(this._mask.planes);

    this._contentLen = 0;
    this._dragging = false;
    this._scrolling = false;
    this._pressedChild = null;
    this._startPos = 0;
    this._lastPos = 0;
    this._velocity = 0;
    this._samples = [];
    this._lastMoveTs = 0;
    this._inertia = false;
    this._bounce = null;
    this._snapIndex = -1;

    this._bindEvents();

    const self = this;
    this._ticker = ctx.root.addTicker(function (dt) { self.update(dt); });
    this._syncMask();
}

ScrollView.prototype = Object.create(UINode.prototype);
ScrollView.prototype.constructor = ScrollView;
ScrollView.CFG = CFG;

/* ---------------- 内部状态 ---------------- */

ScrollView.prototype._maxScroll = function () {
    return Math.max(0, this._contentLen - this._viewLen);
};

ScrollView.prototype._overshoot = function () {
    const pos = this.content[this._axis];
    if (pos > 0) return pos;
    const min = -this._maxScroll();
    if (pos < min) return pos - min;
    return 0;
};

ScrollView.prototype._clampHard = function () {
    this.content[this._axis] = Math.min(0, Math.max(-this._maxScroll(), this.content[this._axis]));
};

ScrollView.prototype._emitScroll = function () {
    if (this._opts.onScroll) this._opts.onScroll(-this.content[this._axis]);
};

ScrollView.prototype._emitSnap = function (idx) {
    if (idx !== this._snapIndex) {
        this._snapIndex = idx;
        if (this._opts.onSnap) this._opts.onSnap(idx);
    }
};

ScrollView.prototype._startBounce = function () {
    const over = this._overshoot();
    if (!over) return;
    this._bounce = {
        from: this.content[this._axis],
        to: over > 0 ? 0 : -this._maxScroll(),
        t: 0, dur: CFG.bounceMs,
    };
};

ScrollView.prototype._startSnap = function () {
    const snapInterval = this._snapInterval;
    const pos = -this.content[this._axis];
    let idx = Math.round(pos / snapInterval);
    if (Math.abs(this._velocity) > CFG.snapVelocity) {
        idx = this._velocity < 0 ? Math.ceil(pos / snapInterval) : Math.floor(pos / snapInterval);
    }
    idx = Math.max(0, Math.min(idx, Math.floor(this._maxScroll() / snapInterval)));
    this._bounce = { from: this.content[this._axis], to: -idx * snapInterval + 0, t: 0, dur: CFG.snapMs, snap: idx };
};

/* ---------------- 事件 ---------------- */

ScrollView.prototype._bindEvents = function () {
    const self = this;
    const axis = this._axis;

    this.on('pointerdown', function (ev) {
        self._dragging = true;
        self._scrolling = false;
        self._inertia = false;
        self._bounce = null;
        self._velocity = 0;
        self._samples = [];
        self._startPos = self._lastPos = ev[axis];
        self._lastMoveTs = Date.now();
        // 冒泡目标是子控件时记下, 滚动启动时取消其按压
        self._pressedChild = (ev.target && ev.target !== self && ev.target.cancelPress) ? ev.target : null;
    });

    this.on('pointermove', function (ev) {
        if (!self._dragging) return;
        const pos = ev[axis];
        let d = pos - self._lastPos;
        self._lastPos = pos;

        if (!self._scrolling) {
            if (Math.abs(pos - self._startPos) < CFG.cancelOffset) return;
            self._scrolling = true;
            if (self._pressedChild) {
                self._pressedChild.cancelPress();
                self._pressedChild = null;
            }
        }

        if (self._overshoot() !== 0) d *= CFG.overDrag;
        self.content[axis] += d;

        const now = Date.now();
        self._samples.push({ d: d, dt: Math.max(1, now - self._lastMoveTs) });
        if (self._samples.length > CFG.sampleCount) self._samples.shift();
        self._lastMoveTs = now;
        self._emitScroll();
    });

    const onRelease = function () {
        if (!self._dragging) return;
        self._dragging = false;
        if (!self._scrolling) return;
        self._scrolling = false;

        let sumV = 0, sumW = 0;
        for (let i = 0; i < self._samples.length; i++) {
            const w = CFG.sampleWeights[i] || 1;
            sumV += (self._samples[i].d / self._samples[i].dt) * w;
            sumW += w;
        }
        self._velocity = sumW ? sumV / sumW : 0;

        if (self._snapInterval > 0) {
            self._startSnap();
        } else if (self._overshoot() !== 0) {
            self._startBounce();
        } else if (Math.abs(self._velocity) > CFG.minVelocity) {
            self._inertia = true;
        }
    };

    this.on('pointerup', onRelease);
    this.on('pointercancel', onRelease);
};

/* ---------------- 公开 API ---------------- */

ScrollView.prototype.setContentSize = function (len) { this._contentLen = len; };

ScrollView.prototype.scrollTo = function (pos) {
    this.content[this._axis] = -pos;
    this._clampHard();
    this._emitScroll();
};

ScrollView.prototype.scrollPos = function () { return -this.content[this._axis]; };

ScrollView.prototype.snapTo = function (index, animated) {
    if (!this._snapInterval) return;
    const idx = Math.max(0, Math.min(index, Math.floor(this._maxScroll() / this._snapInterval)));
    if (animated === false) {
        this.content[this._axis] = -idx * this._snapInterval + 0;
        this._emitScroll();
        this._emitSnap(idx);
        return;
    }
    this._bounce = { from: this.content[this._axis], to: -idx * this._snapInterval + 0, t: 0, dur: CFG.snapMs, snap: idx };
};

ScrollView.prototype.refresh = function () {
    this.content[this._axis] = 0;
    this._clampHard();
    this._emitScroll();
};

/* ---------------- 帧驱动 ---------------- */

ScrollView.prototype._syncMask = function () {
    const b = this.worldAABB();
    this._mask.setRect(b.x, b.y, b.w, b.h);
};

ScrollView.prototype.update = function (dt) {
    this._syncMask();

    if (this._inertia) {
        let friction = Math.pow(CFG.frictionBase, dt);
        if (this._overshoot() !== 0) friction *= Math.pow(CFG.overBrake, dt / 16);
        this._velocity *= friction;
        this.content[this._axis] += this._velocity * dt;
        this._emitScroll();
        if (Math.abs(this._velocity) < CFG.minVelocity) {
            this._inertia = false;
            this._startBounce();
        }
        return;
    }

    if (this._bounce) {
        this._bounce.t += dt;
        const t = Math.min(1, this._bounce.t / this._bounce.dur);
        // 磁吸 quintOut / 回弹 quadOut
        const r = this._bounce.snap !== undefined ? quintOut(t) : 1 - (1 - t) * (1 - t);
        this.content[this._axis] = this._bounce.from + (this._bounce.to - this._bounce.from) * r;
        this._emitScroll();
        if (t >= 1) {
            const snapped = this._bounce.snap;
            this._bounce = null;
            if (snapped !== undefined) this._emitSnap(snapped);
        }
    }
};

ScrollView.prototype._disposeSelf = function () {
    this.ctx.root.removeTicker(this._ticker);
};

module.exports = ScrollView;
