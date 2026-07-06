/**
 * Layout — 容器内子节点排列（对标 cocos Layout 的 H/V/Grid 三模式）
 *
 * apply(container, opts)
 *   opts: { mode: 'horizontal'|'vertical'|'grid', gap=0, gapX, gapY,
 *           cols(grid 必填), padding=0, resizeContainer=true }
 * 按子节点当前 width/height 顺序摆放; 完成后可选把容器 setSize 为包围尺寸。
 * 不做脏检测, 子节点变化后调用方重新 apply(保持简单)。
 */

'use strict';

function apply(container, opts) {
    opts = opts || {};
    const mode = opts.mode || 'vertical';
    const padding = opts.padding || 0;
    const gapX = opts.gapX !== undefined ? opts.gapX : (opts.gap || 0);
    const gapY = opts.gapY !== undefined ? opts.gapY : (opts.gap || 0);
    const children = container.children;

    let maxX = 0, maxY = 0;

    if (mode === 'horizontal') {
        let x = padding;
        for (let i = 0; i < children.length; i++) {
            const c = children[i];
            if (!c.visible) continue;
            c.setPosition(x + c.anchorX * c.width * c.scale, padding + c.anchorY * c.height * c.scale);
            x += c.width * c.scale + gapX;
            maxY = Math.max(maxY, c.height * c.scale);
        }
        maxX = Math.max(0, x - gapX);
        maxY += padding;
    } else if (mode === 'vertical') {
        let y = padding;
        for (let i = 0; i < children.length; i++) {
            const c = children[i];
            if (!c.visible) continue;
            c.setPosition(padding + c.anchorX * c.width * c.scale, y + c.anchorY * c.height * c.scale);
            y += c.height * c.scale + gapY;
            maxX = Math.max(maxX, c.width * c.scale);
        }
        maxY = Math.max(0, y - gapY);
        maxX += padding;
    } else if (mode === 'grid') {
        const cols = opts.cols || 1;
        let col = 0, x = padding, y = padding, rowH = 0;
        for (let i = 0; i < children.length; i++) {
            const c = children[i];
            if (!c.visible) continue;
            c.setPosition(x + c.anchorX * c.width * c.scale, y + c.anchorY * c.height * c.scale);
            rowH = Math.max(rowH, c.height * c.scale);
            maxX = Math.max(maxX, x + c.width * c.scale);
            col++;
            if (col >= cols) {
                col = 0;
                x = padding;
                y += rowH + gapY;
                rowH = 0;
            } else {
                x += c.width * c.scale + gapX;
            }
        }
        maxY = y + rowH;
    }

    if (opts.resizeContainer !== false) {
        container.setSize(maxX + padding, maxY + padding);
    }
}

module.exports = { apply: apply };
