/**
 * UIRoot — UI 根（对标 cocos Canvas/RenderRoot2D + OVERLAY 相机）
 *
 * 独立 Scene + 正交相机(左上原点 y 向下), 作为第二个 render pass。
 * 职责: renderOrder DFS 编号 / update 循环(tween、ScrollView、tracker) / resize。
 */

'use strict';

const UINode = require('./UINode');

function UIRoot(ctx) {
    UINode.call(this, ctx);
    const THREE = ctx.THREE;

    this.scene = new THREE.Scene();
    this.scene.add(this.obj3d);

    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
    this._orderDirty = true;
    this._tickers = [];      // fn(dt) 集合: tween/ScrollView/tracker 注册进来

    this.syncViewport();
}

UIRoot.prototype = Object.create(UINode.prototype);
UIRoot.prototype.constructor = UIRoot;

UIRoot.prototype.syncViewport = function () {
    const view = this.ctx.view;
    this.setSize(view.width, view.height);
    this.camera.left = 0;
    this.camera.right = view.width;
    this.camera.top = 0;
    this.camera.bottom = -view.height;
    this.camera.updateProjectionMatrix();
};

UIRoot.prototype.onResize = function (screenWidth, screenHeight) {
    this.ctx.view.refresh(screenWidth, screenHeight);
    this.syncViewport();
    this.emit('resize', { width: this.ctx.view.width, height: this.ctx.view.height });
};

UIRoot.prototype.markOrderDirty = function () {
    this._orderDirty = true;
};

UIRoot.prototype._reorder = function () {
    let order = 0;
    (function walk(node) {
        const objs = node.obj3d.children;
        for (let i = 0; i < objs.length; i++) {
            if (objs[i].isMesh) objs[i].renderOrder = order;
        }
        order++;
        for (let i = 0; i < node.children.length; i++) walk(node.children[i]);
    })(this);
    this._orderDirty = false;
};

UIRoot.prototype.addTicker = function (fn) {
    this._tickers.push(fn);
    return fn;
};

UIRoot.prototype.removeTicker = function (fn) {
    const i = this._tickers.indexOf(fn);
    if (i !== -1) this._tickers.splice(i, 1);
};

/** 每帧: 驱动 tickers + 重排 renderOrder */
UIRoot.prototype.update = function (dt) {
    const list = this._tickers.slice();
    for (let i = 0; i < list.length; i++) list[i](dt);
    if (this._orderDirty) this._reorder();
};

/** 完整 UI pass: update + render(不清颜色, 清深度) */
UIRoot.prototype.render = function (renderer, dt) {
    this.update(dt || 0);
    const prevAutoClear = renderer.autoClear;
    const prevAutoClearColor = renderer.autoClearColor;
    renderer.autoClear = false;
    if (renderer.clearDepth) renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
    renderer.autoClearColor = prevAutoClearColor;
};

module.exports = UIRoot;
