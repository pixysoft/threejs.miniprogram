/**
 * UIEventSystem — 触摸接入 / 命中 / 冒泡 / 按压协议
 * （对标 cocos PointerEventDispatcher + pixi Widget.makePressable）
 *
 * dispatchTouch(e): 接收 wx 触摸事件(或 adapter TouchEvent), 返回是否被 UI 消费。
 * 命中: 逆 DFS(后渲染者优先), visible && (interactive || blockInput) && hitTest。
 * 冒泡: 命中节点向上 emit 'pointerdown/move/up' + 'tap', stopPropagation 截断。
 */

'use strict';

function UIEventSystem(ctx) {
    this.ctx = ctx;
    this._activeTarget = null;    // pointerdown 命中的节点(后续 move/up 跟随)
    this._downPoint = null;
}

/* ---------------- 命中 ---------------- */

UIEventSystem.prototype.hitTest = function (ux, uy) {
    return (function walk(node) {
        if (!node.visible) return null;
        // 后添加者渲染在上, 逆序优先
        for (let i = node.children.length - 1; i >= 0; i--) {
            const hit = walk(node.children[i]);
            if (hit) return hit;
        }
        if ((node.interactive || node.blockInput) && node.hitTest(ux, uy)) return node;
        return null;
    })(this.ctx.root);
};

/* ---------------- 分发 ---------------- */

UIEventSystem.prototype._bubble = function (node, type, ev) {
    let cur = node;
    ev.target = node;
    ev.stopped = false;
    ev.stopPropagation = function () { ev.stopped = true; };
    while (cur && !ev.stopped) {
        ev.currentTarget = cur;
        cur.emit(type, ev);
        cur = cur.parent;
    }
};

function firstTouch(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return null;
    // adapter TouchEvent 的 Touch 有 clientX/clientY; 原始 wx 触点是 x/y
    return {
        x: t.clientX !== undefined ? t.clientX : t.x,
        y: t.clientY !== undefined ? t.clientY : t.y,
    };
}

/**
 * @param e wx 触摸事件或 adapter TouchEvent(type: touchstart/touchmove/touchend/touchcancel)
 * @returns {boolean} UI 是否消费了该事件
 */
UIEventSystem.prototype.dispatchTouch = function (e) {
    const pt = firstTouch(e);
    if (!pt) return false;

    const view = this.ctx.view;
    const ui = view.toUI(pt.x, pt.y);
    const ev = { x: ui.x, y: ui.y, raw: e };

    const type = e.type;
    if (type === 'touchstart') {
        const hit = this.hitTest(ui.x, ui.y);
        this._activeTarget = hit;
        this._downPoint = ui;
        if (hit) this._bubble(hit, 'pointerdown', ev);
        return !!hit;
    }

    if (type === 'touchmove') {
        if (!this._activeTarget) return false;
        this._bubble(this._activeTarget, 'pointermove', ev);
        return true;
    }

    if (type === 'touchend' || type === 'touchcancel') {
        const target = this._activeTarget;
        this._activeTarget = null;
        this._downPoint = null;
        if (!target) return false;
        this._bubble(target, type === 'touchend' ? 'pointerup' : 'pointercancel', ev);
        return true;
    }

    return false;
};

/* ---------------- 按压协议 ---------------- */

/**
 * makePressable(node, opts) — 三态按压 + 位移取消(14px) + cancelPress 协议
 * opts: { onTap, onStateChange(state), moveCancelPx=14, enabled=true }
 * 挂载: node.cancelPress() / node.setEnabled(bool) / node.isEnabled()
 */
UIEventSystem.prototype.makePressable = function (node, opts) {
    opts = opts || {};
    const moveCancelPx = opts.moveCancelPx === undefined ? 14 : opts.moveCancelPx;
    let enabled = opts.enabled === undefined ? true : !!opts.enabled;
    let downPos = null;
    let isDown = false;

    node.interactive = true;

    function setState(s) {
        if (opts.onStateChange) opts.onStateChange(s);
    }

    node.cancelPress = function () {
        if (isDown) {
            isDown = false;
            downPos = null;
            setState(enabled ? 'up' : 'disabled');
        }
    };

    node.setEnabled = function (v) {
        enabled = !!v;
        isDown = false;
        downPos = null;
        setState(enabled ? 'up' : 'disabled');
    };

    node.isEnabled = function () { return enabled; };

    node.on('pointerdown', function (ev) {
        if (!enabled || ev.target !== node) return;
        downPos = { x: ev.x, y: ev.y };
        isDown = true;
        setState('down');
    });

    node.on('pointermove', function (ev) {
        if (!isDown || !downPos) return;
        const dx = ev.x - downPos.x;
        const dy = ev.y - downPos.y;
        if (dx * dx + dy * dy > moveCancelPx * moveCancelPx) node.cancelPress();
    });

    node.on('pointerup', function () {
        if (!isDown) return;
        isDown = false;
        downPos = null;
        setState('up');
        if (opts.onTap) opts.onTap();
        node.emit('tap');
    });

    node.on('pointercancel', function () { node.cancelPress(); });

    return node;
};

module.exports = UIEventSystem;
