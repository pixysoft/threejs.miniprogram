/**
 * UICoordinateTracker — 3D 世界坐标 → UI 坐标（对标 cocos UICoordinateTracker）
 *
 * createTrackerManager(ctx) 返回工厂:
 *   const t = tracker(object3d, camera3d, uiNode, { offsetX, offsetY });
 *   t.dispose();
 * 每帧: object3d 世界位置 project(camera3d) → NDC → UI 坐标; 相机背面自动隐藏。
 */

'use strict';

function createTrackerManager(ctx) {
    const THREE = ctx.THREE;
    const trackers = [];
    const _v = new THREE.Vector3();

    ctx.root.addTicker(function () {
        const view = ctx.view;
        for (let i = trackers.length - 1; i >= 0; i--) {
            const t = trackers[i];
            if (t.node.destroyed) { trackers.splice(i, 1); continue; }

            t.target.getWorldPosition ? t.target.getWorldPosition(_v) : _v.setFromMatrixPosition(t.target.matrixWorld);
            _v.project(t.camera);

            // NDC z > 1 或 w 反向: 相机背面
            if (_v.z > 1 || _v.z < -1) {
                t.node.visible = false;
                continue;
            }
            t.node.visible = true;
            t.node.setPosition(
                (_v.x + 1) / 2 * view.width + t.offsetX,
                (1 - _v.y) / 2 * view.height + t.offsetY
            );
        }
    });

    return function tracker(object3d, camera3d, uiNode, opts) {
        opts = opts || {};
        const t = {
            target: object3d,
            camera: camera3d,
            node: uiNode,
            offsetX: opts.offsetX || 0,
            offsetY: opts.offsetY || 0,
            dispose: function () {
                const i = trackers.indexOf(t);
                if (i !== -1) trackers.splice(i, 1);
            },
        };
        trackers.push(t);
        return t;
    };
}

module.exports = { createTrackerManager: createTrackerManager };
