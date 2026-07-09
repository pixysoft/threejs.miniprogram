/**
 * UIEventSystem — 触摸接入 / 命中 / 冒泡 / 按压协议
 * （对标 cocos PointerEventDispatcher + pixi Widget.makePressable）
 *
 * dispatchTouch(e): 接收 wx 触摸事件(或 adapter TouchEvent), 逐 changedTouches
 * 触点分发(多触点: 每个 identifier 独立捕获), 返回是否有触点被 UI 消费。
 * dispatchTouchPoint(type, id, px, py): 单触点分发(3D+UI 混合游戏按触点分流用),
 * 返回该触点是否被 UI 消费; owns(id) 查询触点是否已被 UI 捕获。
 * 命中: 逆 DFS(后渲染者优先), visible && (interactive || blockInput) && hitTest。
 * 冒泡: 命中节点向上 emit 'pointerdown/move/up' + 'tap', stopPropagation 截断。
 */

'use strict';

function UIEventSystem(ctx) {
    this.ctx = ctx;
    this._active = {};            // identifier → 捕获节点(pointerdown 命中, 后续 move/up 跟随)
    this._activeTarget = null;    // 兼容字段: 最近一次 touchstart 命中的节点
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

/** 触点是否已被 UI 捕获(touchstart 命中后, move/end 归 UI) */
UIEventSystem.prototype.owns = function (id) {
    return this._active[id] !== undefined;
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

function touchXY(t) {
    // adapter TouchEvent 的 Touch 有 clientX/clientY; 原始 wx 触点是 x/y
    return {
        x: t.clientX !== undefined ? t.clientX : t.x,
        y: t.clientY !== undefined ? t.clientY : t.y,
    };
}

/**
 * 单触点分发(CSS px 坐标)。
 * @param type touchstart/touchmove/touchend/touchcancel
 * @param id   触点 identifier
 * @returns {boolean} 该触点是否被 UI 消费
 */
UIEventSystem.prototype.dispatchTouchPoint = function (type, id, px, py, raw) {
    const view = this.ctx.view;
    const ui = view.toUI(px, py);
    const ev = { x: ui.x, y: ui.y, id: id, raw: raw || null };

    if (type === 'touchstart') {
        const hit = this.hitTest(ui.x, ui.y);
        if (hit) {
            this._active[id] = hit;
            this._activeTarget = hit;
            this._bubble(hit, 'pointerdown', ev);
        }
        return !!hit;
    }

    if (type === 'touchmove') {
        const target = this._active[id];
        if (!target) return false;
        this._bubble(target, 'pointermove', ev);
        return true;
    }

    if (type === 'touchend' || type === 'touchcancel') {
        const target = this._active[id];
        if (target === undefined) return false;
        delete this._active[id];
        if (this._activeTarget === target) this._activeTarget = null;
        this._bubble(target, type === 'touchend' ? 'pointerup' : 'pointercancel', ev);
        return true;
    }

    return false;
};

/**
 * @param e wx 触摸事件或 adapter TouchEvent(type: touchstart/touchmove/touchend/touchcancel)
 * @returns {boolean} 是否有触点被 UI 消费
 */
UIEventSystem.prototype.dispatchTouch = function (e) {
    const list = (e.changedTouches && e.changedTouches.length ? e.changedTouches : e.touches) || [];
    let consumed = false;
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const pt = touchXY(t);
        const id = t.identifier !== undefined ? t.identifier : 0;
        if (this.dispatchTouchPoint(e.type, id, pt.x, pt.y, e)) consumed = true;
    }
    return consumed;
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
    let downId = null;     // 多触点: 只跟踪首个按下的触点

    node.interactive = true;

    function setState(s) {
        if (opts.onStateChange) opts.onStateChange(s);
    }

    node.cancelPress = function () {
        if (isDown) {
            isDown = false;
            downPos = null;
            downId = null;
            setState(enabled ? 'up' : 'disabled');
        }
    };

    node.setEnabled = function (v) {
        enabled = !!v;
        isDown = false;
        downPos = null;
        downId = null;
        setState(enabled ? 'up' : 'disabled');
    };

    node.isEnabled = function () { return enabled; };

    node.on('pointerdown', function (ev) {
        if (!enabled || ev.target !== node || isDown) return;
        downPos = { x: ev.x, y: ev.y };
        downId = ev.id;
        isDown = true;
        setState('down');
    });

    node.on('pointermove', function (ev) {
        if (!isDown || !downPos || ev.id !== downId) return;
        const dx = ev.x - downPos.x;
        const dy = ev.y - downPos.y;
        if (dx * dx + dy * dy > moveCancelPx * moveCancelPx) node.cancelPress();
    });

    node.on('pointerup', function (ev) {
        if (!isDown || (ev && ev.id !== downId)) return;
        isDown = false;
        downPos = null;
        downId = null;
        setState('up');
        if (opts.onTap) opts.onTap();
        node.emit('tap');
    });

    node.on('pointercancel', function (ev) {
        if (ev && ev.id !== downId) return;
        node.cancelPress();
    });

    return node;
};

module.exports = UIEventSystem;
