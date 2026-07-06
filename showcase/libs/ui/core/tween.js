/**
 * tween — 轻量 UI 动效（pixi actions 的裁剪版）
 *
 * createTweenManager(root) 返回工厂:
 *   tween(node).delay(200).to({ x: 100, alpha: 0 }, 300, 'quadOut').call(fn)
 * 属性集: x y scale rotation alpha width height
 * 节点销毁自动停止; 由 root ticker 驱动。
 */

'use strict';

const EASING = {
    linear: function (t) { return t; },
    quadIn: function (t) { return t * t; },
    quadOut: function (t) { return 1 - (1 - t) * (1 - t); },
    quadInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); },
    quintOut: function (t) { const p = t - 1; return p * p * p * p * p + 1; },
    backOut: function (t) { const s = 1.70158; const p = t - 1; return p * p * ((s + 1) * p + s) + 1; },
};

const SIZE_KEYS = { width: true, height: true };

function Tween(node, manager) {
    this.node = node;
    this.manager = manager;
    this.queue = [];      // { type: 'to'|'delay'|'call', ... }
    this.current = null;
    this.done = false;
}

Tween.prototype.to = function (props, duration, easing) {
    this.queue.push({ type: 'to', props: props, dur: Math.max(1, duration || 1), ease: EASING[easing] || EASING.quadOut });
    return this;
};

Tween.prototype.delay = function (ms) {
    this.queue.push({ type: 'delay', dur: ms });
    return this;
};

Tween.prototype.call = function (fn) {
    this.queue.push({ type: 'call', fn: fn });
    return this;
};

Tween.prototype.stop = function () {
    this.done = true;
};

Tween.prototype._advance = function () {
    while (this.queue.length) {
        const step = this.queue.shift();
        if (step.type === 'call') {
            step.fn();
            continue;
        }
        step.t = 0;
        if (step.type === 'to') {
            step.from = {};
            let resize = false;
            for (const key in step.props) {
                step.from[key] = this.node[key];
                if (SIZE_KEYS[key]) resize = true;
            }
            step.resize = resize;
        }
        this.current = step;
        return;
    }
    this.current = null;
    this.done = true;
};

Tween.prototype.update = function (dt) {
    if (this.done || this.node.destroyed) { this.done = true; return; }
    if (!this.current) {
        this._advance();
        if (!this.current) return;
    }

    const step = this.current;
    step.t += dt;
    const t = Math.min(1, step.t / step.dur);

    if (step.type === 'to') {
        const r = step.ease(t);
        let w = this.node.width, h = this.node.height;
        for (const key in step.props) {
            const v = step.from[key] + (step.props[key] - step.from[key]) * r;
            if (key === 'width') w = v;
            else if (key === 'height') h = v;
            else this.node[key] = v;
        }
        if (step.resize) this.node.setSize(w, h);
    }

    if (t >= 1) {
        this.current = null;
        if (!this.queue.length) this.done = true;
    }
};

function createTweenManager(root) {
    const tweens = [];

    root.addTicker(function (dt) {
        for (let i = tweens.length - 1; i >= 0; i--) {
            tweens[i].update(dt);
            if (tweens[i].done) tweens.splice(i, 1);
        }
    });

    return function tween(node) {
        // 同节点旧 tween 停止, 避免属性抢写
        for (let i = 0; i < tweens.length; i++) {
            if (tweens[i].node === node) tweens[i].done = true;
        }
        const t = new Tween(node);
        tweens.push(t);
        return t;
    };
}

module.exports = { createTweenManager: createTweenManager, EASING: EASING };
