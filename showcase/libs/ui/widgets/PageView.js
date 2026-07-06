/**
 * PageView — 水平磁吸翻页（= 水平 ScrollView + 页宽 snapInterval, 手感对齐 cocos PageView）
 *
 * opts: { w, h, pageWidth=w, onPage(index) }
 * API: addPage(node) setPage(index, animated) currentPage()
 */

'use strict';

const ScrollView = require('./ScrollView');

function PageView(ctx, opts) {
    opts = opts || {};
    const pageWidth = opts.pageWidth || opts.w;

    ScrollView.call(this, ctx, {
        w: opts.w,
        h: opts.h,
        direction: 'x',
        snapInterval: pageWidth,
        onSnap: opts.onPage,
        onScroll: opts.onScroll,
    });

    this._pageWidth = pageWidth;
    this._pageCount = 0;
    this._current = 0;

    const self = this;
    const userOnPage = opts.onPage;
    this._opts.onSnap = function (idx) {
        self._current = idx;
        if (userOnPage) userOnPage(idx);
    };
}

PageView.prototype = Object.create(ScrollView.prototype);
PageView.prototype.constructor = PageView;

PageView.prototype.addPage = function (node) {
    node.setPosition(this._pageCount * this._pageWidth, 0);
    this.content.addChild(node);
    this._pageCount++;
    this.setContentSize(this._pageCount * this._pageWidth);
    return node;
};

PageView.prototype.setPage = function (index, animated) {
    this.snapTo(index, animated);
    if (animated === false) this._current = Math.max(0, Math.min(index, this._pageCount - 1));
};

PageView.prototype.currentPage = function () { return this._current; };

module.exports = PageView;
