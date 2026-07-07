/**
 * ScrollBar — 滚动指示条（cocos ScrollBar 简化版: 只指示不拖拽）
 *
 * 由 ScrollView({ scrollBar: true }) 内部创建, 每帧宿主 update 末尾调 sync()。
 * 条长 = viewLen²/contentLen(最小 20), 位置随 scrollPos 线性映射, 越界压缩;
 * 滚动中显示, 静止 autoHideTime(1000ms) 后淡出。皮肤 Theme 'ScrollBar'。
 */

'use strict';

const UISprite = require('../render/UISprite');

const THICKNESS = 6;    // 条宽(ui 单位)
const MARGIN = 2;       // 距容器边缘
const MIN_LEN = 20;
const AUTO_HIDE_MS = 1000;   // cocos 默认 autoHideTime
const FADE_MS = 200;

function ScrollBar(ctx, host) {
    this.ctx = ctx;
    this.host = host;               // ScrollView
    this._axis = host._axis;
    this._idleMs = AUTO_HIDE_MS;    // 初始即隐藏
    this._lastPos = 0;

    const skin = ctx.theme.resolve('ScrollBar');
    this.bar = new UISprite(ctx, { w: THICKNESS, h: THICKNESS });
    this.bar.setTexture(ctx.textures.roundRect(60, THICKNESS, skin.bar || {}));
    this._barAlpha = (skin.bar && skin.bar.alpha !== undefined) ? skin.bar.alpha : 0.35;
    this.bar.alpha = 0;
    host.addChild(this.bar);
}

/** 每帧由宿主驱动 */
ScrollBar.prototype.sync = function (dt) {
    const host = this.host;
    const axis = this._axis;
    const viewLen = host._viewLen;
    const contentLen = host._contentLen;

    if (contentLen <= viewLen) {
        this.bar.visible = false;
        return;
    }
    this.bar.visible = true;

    // 活跃检测: 拖拽/惯性/回弹中, 或位置变化
    const pos = host.content[axis];
    const active = host._dragging || host._inertia || !!host._bounce || pos !== this._lastPos;
    this._lastPos = pos;

    if (active) this._idleMs = 0;
    else this._idleMs += dt || 0;

    // 淡入淡出
    if (this._idleMs < AUTO_HIDE_MS) {
        this.bar.alpha = this._barAlpha;
    } else {
        const fade = Math.min(1, (this._idleMs - AUTO_HIDE_MS) / FADE_MS);
        this.bar.alpha = this._barAlpha * (1 - fade);
    }

    // 长度: 比例映射; 越界时压缩(超出量从条长里扣)
    let len = Math.max(MIN_LEN, viewLen * viewLen / contentLen);
    const over = Math.abs(host._overshoot());
    len = Math.max(MIN_LEN, len - over);

    // 位置: scrollPos ∈ [0, maxScroll] → [0, viewLen - len]
    const maxScroll = Math.max(1, contentLen - viewLen);
    let t = Math.max(0, Math.min(1, (-pos) / maxScroll));
    const offset = t * (viewLen - len);

    if (axis === 'y') {
        this.bar.setSize(THICKNESS, len);
        this.bar.setPosition(host.width - THICKNESS - MARGIN, offset);
    } else {
        this.bar.setSize(len, THICKNESS);
        this.bar.setPosition(offset, host.height - THICKNESS - MARGIN);
    }
};

ScrollBar.prototype.destroy = function () {
    this.bar.destroy();
};

module.exports = ScrollBar;
