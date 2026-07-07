/**
 * UIRoot — UI 根（对标 cocos Canvas/RenderRoot2D + OVERLAY 相机）
 *
 * 独立 Scene + 正交相机(左上原点 y 向下), 作为第二个 render pass。
 * 职责: renderOrder DFS 编号 / update 循环(tween、ScrollView、tracker) / resize。
 *
 * cache 模式(P2-3, createUI({ cache: true })): UI 画进 RenderTarget,
 * 脏了才重绘 RT, 每帧只合成一张全屏贴图(1 draw call)。
 * 置脏入口 invalidate(), 由 UINode transform/visible/alpha 与纹理级变化调用。
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
    this.batcher = null;     // UIBatcher(可选, createUI({ batch: true }))

    this._cacheEnabled = false;
    this._dirty = true;
    this._rt = null;
    this._compScene = null;
    this._compCamera = null;
    this._compMaterial = null;

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
    if (this._rt) {   // drawingBuffer 变了, RT 下帧按新尺寸重建
        this._rt.dispose();
        this._rt = null;
    }
    this.invalidate();
    this.emit('resize', { width: this.ctx.view.width, height: this.ctx.view.height });
};

UIRoot.prototype.markOrderDirty = function () {
    this._orderDirty = true;
    this._dirty = true;
};

/** cache 模式置脏(非 cache 模式为纯标记, 零开销) */
UIRoot.prototype.invalidate = function () {
    this._dirty = true;
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

/** 每帧: 驱动 tickers + 重排 renderOrder + 合批 */
UIRoot.prototype.update = function (dt) {
    const list = this._tickers.slice();
    for (let i = 0; i < list.length; i++) list[i](dt);
    if (this._orderDirty) this._reorder();
    if (this.batcher) this.batcher.rebuild(this);
};

/** 完整 UI pass: update + render(不清颜色, 清深度); cache 模式走 RT 缓存 */
UIRoot.prototype.render = function (renderer, dt) {
    this.update(dt || 0);
    if (this._cacheEnabled) {
        this._renderCached(renderer);
        return;
    }
    this._renderDirect(renderer, this.scene, this.camera);
};

UIRoot.prototype._renderDirect = function (renderer, scene, camera) {
    const prevAutoClear = renderer.autoClear;
    const prevAutoClearColor = renderer.autoClearColor;
    renderer.autoClear = false;
    if (renderer.clearDepth) renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = prevAutoClear;
    renderer.autoClearColor = prevAutoClearColor;
};

/* ---------------- cache 模式(P2-3) ---------------- */

UIRoot.prototype.enableCache = function () {
    this._cacheEnabled = true;
    this._dirty = true;
};

UIRoot.prototype._initCache = function (renderer) {
    const THREE = this.ctx.THREE;
    let w = this.ctx.view.width, h = this.ctx.view.height;
    if (renderer.getDrawingBufferSize) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        w = size.x || w;
        h = size.y || h;
    }
    this._rt = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
    });

    if (!this._compScene) {
        this._compCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._compScene = new THREE.Scene();
        this._compMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        const quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this._compMaterial);
        quad.frustumCulled = false;
        this._compScene.add(quad);
    }
    this._compMaterial.map = this._rt.texture;
    this._compMaterial.needsUpdate = true;
};

UIRoot.prototype._renderCached = function (renderer) {
    if (!this._rt) this._initCache(renderer);

    if (this._dirty) {
        const prevTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
        const prevAutoClear = renderer.autoClear;
        const prevAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
        const prevColor = renderer.getClearColor ? renderer.getClearColor().getHex() : 0;

        renderer.setRenderTarget(this._rt);
        renderer.autoClear = false;
        if (renderer.setClearColor) renderer.setClearColor(0x000000, 0);   // 透明清 RT
        if (renderer.clear) renderer.clear(true, true, false);
        renderer.render(this.scene, this.camera);

        renderer.setRenderTarget(prevTarget);
        renderer.autoClear = prevAutoClear;
        if (renderer.setClearColor) renderer.setClearColor(prevColor, prevAlpha);
        this._dirty = false;
    }

    // 每帧只合成缓存贴图(1 draw call)
    this._renderDirect(renderer, this._compScene, this._compCamera);
};

module.exports = UIRoot;
