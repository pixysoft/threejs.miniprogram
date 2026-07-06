/**
 * Mask — 轴对齐矩形裁剪（材质 clippingPlanes, WebGL1 单 pass 可用）
 *
 * RectMask 持有 4 个 THREE.Plane(原地更新, 子树材质共享引用),
 * setRect(x, y, w, h) 传世界 ui 坐标(左上原点 y 向下), 内部换算 THREE 空间。
 * 子树材质挂载由 UINode.setClipPlanes 传播(新增子节点自动继承)。
 */

'use strict';

function RectMask(ctx) {
    const THREE = ctx.THREE;
    this.planes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),    // left
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),   // right
        new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),   // top
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),    // bottom
    ];
}

/** (x,y,w,h): 世界 ui 坐标; THREE 空间 y = -ui y */
RectMask.prototype.setRect = function (x, y, w, h) {
    this.planes[0].constant = -x;         // p.x >= x
    this.planes[1].constant = x + w;      // p.x <= x+w
    this.planes[2].constant = -y;         // p.y(three) <= -y
    this.planes[3].constant = y + h;      // p.y(three) >= -(y+h)
};

module.exports = RectMask;
