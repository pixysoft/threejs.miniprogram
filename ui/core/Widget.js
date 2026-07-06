/**
 * Widget — 锚点对齐（对标 cocos Widget; 优先级规则取 Egret BasicLayout, pixi 已验证）
 *
 * spec: { left, right, top, bottom, centerX, centerY, w, h, safe }
 *   水平优先级 centerX > left > right; left+right 且无 w → 拉伸
 *   垂直优先级 centerY > top > bottom; top+bottom 且无 h → 拉伸
 *   w/h <= 1 视为边界比例
 *   safe: true 时对齐边界收缩到安全区
 *
 * attach(node, spec, ctx): 立即对齐并订阅 root 'resize' 自动重算;
 * 返回 detach 函数。边界默认取 view(全屏), 传 spec.bounds 可自定义。
 */

'use strict';

function resolveBounds(ctx, spec) {
    const view = ctx.view;
    let x = 0, y = 0, w = view.width, h = view.height;
    if (spec.bounds) {
        x = spec.bounds.x || 0;
        y = spec.bounds.y || 0;
        w = spec.bounds.w;
        h = spec.bounds.h;
    } else if (spec.safe) {
        const sa = view.safeArea;
        x = sa.left;
        y = sa.top;
        w = view.width - sa.left - sa.right;
        h = view.height - sa.top - sa.bottom;
    }
    return { x: x, y: y, w: w, h: h };
}

function apply(node, spec, ctx) {
    const b = resolveBounds(ctx, spec);

    let w = node.width, h = node.height;
    if (spec.w !== undefined) w = spec.w <= 1 ? spec.w * b.w : spec.w;
    if (spec.h !== undefined) h = spec.h <= 1 ? spec.h * b.h : spec.h;

    // 拉伸: 双边给定且未显式给尺寸
    if (spec.left !== undefined && spec.right !== undefined && spec.w === undefined) {
        w = b.w - spec.left - spec.right;
    }
    if (spec.top !== undefined && spec.bottom !== undefined && spec.h === undefined) {
        h = b.h - spec.top - spec.bottom;
    }

    if (w !== node.width || h !== node.height) node.setSize(w, h);

    // 定位按左上角(与 anchor 解耦: Widget 直接摆放左上角再补 anchor 偏移)
    let x, y;
    if (spec.centerX !== undefined) x = b.x + (b.w - w) / 2 + spec.centerX;
    else if (spec.left !== undefined) x = b.x + spec.left;
    else if (spec.right !== undefined) x = b.x + b.w - spec.right - w;
    else x = node.x - node.anchorX * w * node.scale;

    if (spec.centerY !== undefined) y = b.y + (b.h - h) / 2 + spec.centerY;
    else if (spec.top !== undefined) y = b.y + spec.top;
    else if (spec.bottom !== undefined) y = b.y + b.h - spec.bottom - h;
    else y = node.y - node.anchorY * h * node.scale;

    node.setPosition(x + node.anchorX * w * node.scale, y + node.anchorY * h * node.scale);
}

function attach(node, spec, ctx) {
    apply(node, spec, ctx);
    const relayout = function () {
        if (!node.destroyed) apply(node, spec, ctx);
    };
    ctx.root.on('resize', relayout);
    node.relayout = relayout;
    return function detach() {
        ctx.root.off('resize', relayout);
        delete node.relayout;
    };
}

module.exports = { apply: apply, attach: attach };
