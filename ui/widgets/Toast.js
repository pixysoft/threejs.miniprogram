/**
 * Toast — 顶部浮层提示（对标 pixi Toast: 队列 + 自动淡出, 不挡触摸）
 *
 * createToast(ctx) 返回 { show(msg, duration=1800) }
 * 同屏一条, 新消息顶替旧消息。
 */

'use strict';

const UISprite = require('../render/UISprite');
const UILabel = require('../render/UILabel');

function createToast(ctx) {
    let current = null;

    function dismiss(bg) {
        if (bg._toastRelayout) {
            ctx.root.off('resize', bg._toastRelayout);
            bg._toastRelayout = null;
        }
        if (current === bg) current = null;
        bg.destroy();
    }

    function show(msg, duration) {
        duration = duration || 1800;
        const skin = ctx.theme.resolve('Toast');
        const view = ctx.view;

        if (current) dismiss(current);

        const label = new UILabel(ctx, { text: msg, size: skin.label.size, color: skin.label.color });
        const padX = 32, padY = 16;
        const w = label.width + padX * 2;
        const h = label.height + padY * 2;

        const bg = new UISprite(ctx, { w: w, h: h });
        bg.setTexture(ctx.textures.roundRect(w, h, skin.bg));
        // 不设 interactive/blockInput: 不挡触摸
        label.setPosition(padX, padY);
        bg.addChild(label);

        // 顶部居中(高度 12% 处), 横竖屏切换自动重算
        const relayout = function () {
            bg.setPosition((view.width - w) / 2, view.height * 0.12);
        };
        relayout();
        ctx.root.on('resize', relayout);
        bg._toastRelayout = relayout;

        ctx.root.addChild(bg);
        current = bg;

        bg.alpha = 0;
        ctx.api.tween(bg)
            .to({ alpha: 1 }, 160, 'quadOut')
            .delay(duration)
            .to({ alpha: 0 }, 240, 'quadOut')
            .call(function () { dismiss(bg); });
        return bg;
    }

    return { show: show };
}

module.exports = { createToast: createToast };
