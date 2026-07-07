/**
 * skin — 皮肤背景构建（回退链, 对标 pixi widgets.makeBg）
 *
 *   cfg.frame 且图集帧可用
 *     ├─ 有 slice(cfg.slice 或帧元数据) → NineSlice(帧九宫格)
 *     └─ 无 slice                      → UISprite.setFrame(帧拉伸)
 *   否则 → UISprite + TextureFactory.roundRect(程序化, 现状行为)
 *
 * cfg: { frame?, slice?, color, alpha, radius, borderColor, borderWidth }
 * resizeBg(ctx, node, cfg, w, h): 尺寸变化时原地更新(NineSlice 改顶点,
 * 程序化重生成纹理), 避免整节点重建。
 */

'use strict';

const UISprite = require('./UISprite');
const NineSlice = require('./NineSlice');

function makeBg(ctx, cfg, w, h) {
    cfg = cfg || {};
    if (cfg.frame && ctx.atlas && ctx.atlas.has(cfg.frame)) {
        const frame = ctx.atlas.frame(cfg.frame);
        const slice = cfg.slice || frame.slice;
        if (slice) {
            return new NineSlice(ctx, {
                frame: frame,
                left: slice[0], top: slice[1], right: slice[2], bottom: slice[3],
                w: w, h: h,
            });
        }
        const sp = new UISprite(ctx, { w: w, h: h });
        sp.setFrame(frame);
        return sp;
    }
    const sprite = new UISprite(ctx, { w: w, h: h });
    sprite.setTexture(ctx.textures.roundRect(w, h, cfg));
    return sprite;
}

function resizeBg(ctx, node, cfg, w, h) {
    node.setSize(w, h);
    // 程序化路径: 圆角随尺寸变化, 需重生成纹理; 帧路径只动顶点/UV
    if (!(cfg && cfg.frame && ctx.atlas && ctx.atlas.has(cfg.frame))) {
        node.setTexture(ctx.textures.roundRect(w, h, cfg || {}));
    }
}

module.exports = { makeBg: makeBg, resizeBg: resizeBg };
