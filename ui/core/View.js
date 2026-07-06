/**
 * View — 设计分辨率与横竖屏适配（对标 cocos View）
 *
 * 竖屏: fitWidth  — ui 宽恒为 designWidth, 高按屏幕比例伸展
 * 横屏: fitHeight — ui 高恒为 designWidth, 宽按屏幕比例伸展
 *
 * screenWidth/screenHeight 为 CSS px(触摸坐标所在空间)
 * safeArea 传入 CSS px 的 { top, bottom, left, right }, 内部换算为 ui 单位
 */

'use strict';

function View(opts) {
    opts = opts || {};
    this.designWidth = opts.designWidth || 750;
    this.screenWidth = opts.screenWidth || this.designWidth;
    this.screenHeight = opts.screenHeight || this.designWidth * 16 / 9;
    this._rawSafeArea = opts.safeArea || null;

    this.width = 0;
    this.height = 0;
    this.ratio = 1;          // ui 单位 / CSS px
    this.landscape = false;
    this.safeArea = { top: 0, bottom: 0, left: 0, right: 0 };

    this.refresh(this.screenWidth, this.screenHeight);
}

View.prototype.refresh = function (screenWidth, screenHeight) {
    if (screenWidth) this.screenWidth = screenWidth;
    if (screenHeight) this.screenHeight = screenHeight;

    this.landscape = this.screenWidth > this.screenHeight;

    if (this.landscape) {
        this.height = this.designWidth;
        this.ratio = this.height / this.screenHeight;
        this.width = this.screenWidth * this.ratio;
    } else {
        this.width = this.designWidth;
        this.ratio = this.width / this.screenWidth;
        this.height = this.screenHeight * this.ratio;
    }

    const sa = this._rawSafeArea;
    if (sa) {
        // wx safeArea 给的是安全区矩形(CSS px), 换算为四边内缩量(ui 单位)
        this.safeArea.top = (sa.top || 0) * this.ratio;
        this.safeArea.left = (sa.left || 0) * this.ratio;
        this.safeArea.bottom = Math.max(0, this.screenHeight - (sa.bottom !== undefined ? sa.bottom : this.screenHeight)) * this.ratio;
        this.safeArea.right = Math.max(0, this.screenWidth - (sa.right !== undefined ? sa.right : this.screenWidth)) * this.ratio;
    }
};

View.prototype.setSafeArea = function (rawSafeArea) {
    this._rawSafeArea = rawSafeArea;
    this.refresh();
};

/** 触摸 CSS px → ui 坐标 */
View.prototype.toUI = function (px, py) {
    return { x: px * this.ratio, y: py * this.ratio };
};

module.exports = View;
