/**
 * List — 虚拟化等高列表（EUI DataGroup 复用池思路; cocos ListView 无复用故取 EUI 方案）
 *
 * opts: { w, h, itemHeight, gap=0, createItem() → UINode, updateItem(node, index, data) }
 * API(继承 ScrollView): setData(arr) refresh() scrollTo ...
 * 实例数恒为「可视区 + 2」, 滚动时重定位重绑定。
 */

'use strict';

const ScrollView = require('./ScrollView');

function List(ctx, opts) {
    const self = this;
    const userOnScroll = opts.onScroll;
    opts.onScroll = function (pos) {
        self._bind();
        if (userOnScroll) userOnScroll(pos);
    };
    ScrollView.call(this, ctx, opts);

    this._itemHeight = opts.itemHeight;
    this._gap = opts.gap || 0;
    this._rowH = this._itemHeight + this._gap;
    this._createItem = opts.createItem;
    this._updateItem = opts.updateItem;
    this._data = [];
    this._pool = [];       // { node, index }
    this._poolSize = Math.ceil(opts.h / this._rowH) + 2;
}

List.prototype = Object.create(ScrollView.prototype);
List.prototype.constructor = List;

List.prototype._ensurePool = function () {
    while (this._pool.length < this._poolSize) {
        const node = this._createItem();
        node.visible = false;
        this.content.addChild(node);
        this._pool.push({ node: node, index: -1 });
    }
};

List.prototype._bind = function () {
    const pool = this._pool;
    if (!this._data.length) {
        for (let k = 0; k < pool.length; k++) { pool[k].node.visible = false; pool[k].index = -1; }
        return;
    }
    const top = this.scrollPos();
    const first = Math.max(0, Math.floor(top / this._rowH));
    const last = Math.min(this._data.length - 1, first + this._poolSize - 1);

    const free = [];
    const used = {};
    for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.index < first || p.index > last) {
            p.index = -1;
            p.node.visible = false;
            free.push(p);
        } else {
            used[p.index] = p;
        }
    }
    for (let i = first; i <= last; i++) {
        let slot = used[i];
        if (!slot) {
            slot = free.pop();
            if (!slot) break;
            slot.index = i;
            this._updateItem(slot.node, i, this._data[i]);
        }
        slot.node.y = i * this._rowH;
        slot.node.visible = true;
    }
};

List.prototype.setData = function (arr) {
    this._data = arr || [];
    this.setContentSize(this._data.length * this._rowH - (this._data.length ? this._gap : 0));
    this._ensurePool();
    for (let i = 0; i < this._pool.length; i++) { this._pool[i].index = -1; this._pool[i].node.visible = false; }
    this._bind();
};

List.prototype.refresh = function () {
    ScrollView.prototype.refresh.call(this);
    for (let i = 0; i < this._pool.length; i++) { this._pool[i].index = -1; this._pool[i].node.visible = false; }
    this._bind();
};

List.prototype.poolCount = function () { return this._pool.length; };

module.exports = List;
