/**
 * UINode — UI 节点基类（对标 cocos Node + UITransform + UIOpacity）
 *
 * 坐标系: 左上原点, y 向下(ui 单位)。内部 THREE.Group 的 y 取负映射。
 * anchor: 0~1, 决定 (x,y) 对应自身的哪个点, 默认 (0,0) 左上。
 * alpha: 级联相乘, 由子类 _applyAlpha 写入材质。
 */

'use strict';

let _idSeed = 1;

function UINode(ctx) {
    this.ctx = ctx;                    // { THREE, root, view, theme, ... }
    this.id = _idSeed++;
    this.obj3d = new ctx.THREE.Group();
    this.obj3d.userData.uiNode = this;

    this.parent = null;
    this.children = [];

    this._x = 0;
    this._y = 0;
    this.width = 0;
    this.height = 0;
    this.anchorX = 0;
    this.anchorY = 0;
    this._scale = 1;
    this._rotation = 0;
    this._alpha = 1;
    this._visible = true;

    this.interactive = false;          // 是否参与命中
    this.blockInput = false;           // 命中即消费(Modal 遮罩)
    this._listeners = {};
    this.destroyed = false;
}

/* ---------------- transform ---------------- */

Object.defineProperty(UINode.prototype, 'x', {
    get: function () { return this._x; },
    set: function (v) { this._x = v; this._syncTransform(); }
});

Object.defineProperty(UINode.prototype, 'y', {
    get: function () { return this._y; },
    set: function (v) { this._y = v; this._syncTransform(); }
});

Object.defineProperty(UINode.prototype, 'scale', {
    get: function () { return this._scale; },
    set: function (v) { this._scale = v; this._syncTransform(); }
});

Object.defineProperty(UINode.prototype, 'rotation', {
    get: function () { return this._rotation; },
    set: function (v) { this._rotation = v; this._syncTransform(); }
});

Object.defineProperty(UINode.prototype, 'visible', {
    get: function () { return this._visible; },
    set: function (v) {
        this._visible = v;
        this.obj3d.visible = v;
        if (this.ctx.root) this.ctx.root.invalidate();
    }
});

Object.defineProperty(UINode.prototype, 'alpha', {
    get: function () { return this._alpha; },
    set: function (v) { this._alpha = v; this._propagateAlpha(); }
});

UINode.prototype.setPosition = function (x, y) {
    this._x = x;
    this._y = y;
    this._syncTransform();
};

UINode.prototype.setSize = function (w, h) {
    this.width = w;
    this.height = h;
    this._onResize();
    this._syncTransform();
};

/** 子类覆盖: 尺寸变化时更新 mesh */
UINode.prototype._onResize = function () {};

UINode.prototype._syncTransform = function () {
    // (x,y) 是锚点位置; group 原点定在自身左上角
    const ox = this._x - this.anchorX * this.width * this._scale;
    const oy = this._y - this.anchorY * this.height * this._scale;
    this.obj3d.position.set(ox, -oy, 0);
    this.obj3d.scale.set(this._scale, this._scale, 1);
    this.obj3d.rotation.z = -this._rotation;
    if (this.ctx.root) this.ctx.root.invalidate();
};

/* ---------------- alpha 级联 ---------------- */

UINode.prototype.worldAlpha = function () {
    let a = this._alpha;
    let p = this.parent;
    while (p) { a *= p._alpha; p = p.parent; }
    return a;
};

UINode.prototype._propagateAlpha = function () {
    this._applyAlpha(this.worldAlpha());
    for (let i = 0; i < this.children.length; i++) {
        this.children[i]._propagateAlpha();
    }
    if (this.ctx.root) this.ctx.root.invalidate();
};

/** 子类覆盖: 把 worldAlpha 写入材质 */
UINode.prototype._applyAlpha = function (worldAlpha) {}; // eslint-disable-line no-unused-vars

/* ---------------- 树 ---------------- */

UINode.prototype.addChild = function (child) {
    if (child.parent) child.removeFromParent();
    child.parent = this;
    this.children.push(child);
    this.obj3d.add(child.obj3d);
    child._propagateAlpha();
    if (this._clipPlanes) child.setClipPlanes(this._clipPlanes);
    if (this.ctx.root) this.ctx.root.markOrderDirty();
    return child;
};

/** 矩形裁剪传播(ScrollView 用): planes 为共享引用, 原地更新即可移动裁剪窗 */
UINode.prototype.setClipPlanes = function (planes) {
    this._clipPlanes = planes;
    const objs = this.obj3d.children;
    for (let i = 0; i < objs.length; i++) {
        if (objs[i].isMesh && objs[i].material) {
            objs[i].material.clippingPlanes = planes;
        }
    }
    for (let i = 0; i < this.children.length; i++) {
        this.children[i].setClipPlanes(planes);
    }
};

UINode.prototype.removeChild = function (child) {
    const i = this.children.indexOf(child);
    if (i === -1) return;
    this.children.splice(i, 1);
    child.parent = null;
    this.obj3d.remove(child.obj3d);
    if (this.ctx.root) this.ctx.root.markOrderDirty();
};

UINode.prototype.removeFromParent = function () {
    if (this.parent) this.parent.removeChild(this);
};

UINode.prototype.destroy = function () {
    this.removeFromParent();
    const kids = this.children.slice();
    for (let i = 0; i < kids.length; i++) kids[i].destroy();
    this._listeners = {};
    this._disposeSelf();
    this.destroyed = true;
};

/** 子类覆盖: 释放 geometry/material/texture */
UINode.prototype._disposeSelf = function () {};

/* ---------------- 世界坐标与命中 ---------------- */

/** 自身左上角的世界 ui 坐标与有效缩放 */
UINode.prototype.worldAABB = function () {
    let x = this._x - this.anchorX * this.width * this._scale;
    let y = this._y - this.anchorY * this.height * this._scale;
    let s = this._scale;
    let p = this.parent;
    while (p) {
        x = p._x - p.anchorX * p.width * p._scale + x * p._scale;
        y = p._y - p.anchorY * p.height * p._scale + y * p._scale;
        s *= p._scale;
        p = p.parent;
    }
    return { x: x, y: y, w: this.width * s, h: this.height * s };
};

UINode.prototype.hitTest = function (ux, uy) {
    if (this.width <= 0 || this.height <= 0) return false;
    const b = this.worldAABB();
    return ux >= b.x && ux <= b.x + b.w && uy >= b.y && uy <= b.y + b.h;
};

/* ---------------- 事件 ---------------- */

UINode.prototype.on = function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
    return this;
};

UINode.prototype.off = function (type, fn) {
    const list = this._listeners[type];
    if (!list) return this;
    if (!fn) { delete this._listeners[type]; return this; }
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
    return this;
};

UINode.prototype.emit = function (type, ev) {
    const list = this._listeners[type];
    if (!list) return;
    const copy = list.slice();
    for (let i = 0; i < copy.length; i++) copy[i](ev);
};

module.exports = UINode;
