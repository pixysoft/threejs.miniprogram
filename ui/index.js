/**
 * three-ui — threejs.miniprogram 的 2D UI 层
 * 架构对标 cocos Creator(Canvas/UITransform/Widget/ScrollView 体系),
 * 实现细节参考 pixi-miniprogram framework。设计文档: docs/fable5/three-ui-design.md
 *
 * const ui = createUI(THREE, {
 *   renderer,                  // THREE.WebGLRenderer(可选, 仅 ui.render 需要)
 *   screenWidth, screenHeight, // CSS px(默认取 THREE.global.innerWidth/Height)
 *   designWidth: 750,
 *   createCanvas2D,            // () => 2D canvas(小程序: wx.createOffscreenCanvas({type:'2d'}))
 *   safeArea,                  // wx.getSystemInfoSync().safeArea(可选)
 * });
 */

'use strict';

const View = require('./core/View');
const UINode = require('./core/UINode');
const UIRoot = require('./core/UIRoot');
const UIEventSystem = require('./core/UIEventSystem');
const Widget = require('./core/Widget');
const Layout = require('./core/Layout');
const Theme = require('./core/Theme');
const TextureFactory = require('./render/TextureFactory');
const UISprite = require('./render/UISprite');
const UILabel = require('./render/UILabel');
const Panel = require('./widgets/Panel');
const Button = require('./widgets/Button');
const ProgressBar = require('./widgets/ProgressBar');
const ScrollView = require('./widgets/ScrollView');
const List = require('./widgets/List');
const PageView = require('./widgets/PageView');
const Toggle = require('./widgets/Toggle');
const Slider = require('./widgets/Slider');
const TabBar = require('./widgets/TabBar');
const Modal = require('./widgets/Modal');
const Toast = require('./widgets/Toast');
const NineSlice = require('./render/NineSlice');
const tweenModule = require('./core/tween');
const trackerModule = require('./misc/UICoordinateTracker');

function createUI(THREE, opts) {
    opts = opts || {};
    if (!opts.createCanvas2D) throw new Error('createUI: 需要注入 createCanvas2D(文本/程序化纹理依赖 2D canvas)');

    const ctx = {
        THREE: THREE,
        renderer: opts.renderer || null,
        createCanvas2D: opts.createCanvas2D,
        view: null,
        root: null,
        events: null,
        textures: null,
        theme: null,
    };

    const g = THREE.global || {};
    ctx.view = new View({
        designWidth: opts.designWidth || 750,
        screenWidth: opts.screenWidth || g.innerWidth || 375,
        screenHeight: opts.screenHeight || g.innerHeight || 667,
        safeArea: opts.safeArea || null,
    });

    ctx.root = new UIRoot(ctx);
    ctx.events = new UIEventSystem(ctx);
    ctx.textures = new TextureFactory(ctx);
    ctx.theme = new Theme();

    if (ctx.renderer && ctx.renderer.localClippingEnabled === false) {
        ctx.renderer.localClippingEnabled = true;   // Mask/ScrollView 裁剪依赖
    }

    const api = {
        ctx: ctx,
        THREE: THREE,
        root: ctx.root,
        view: ctx.view,
        events: ctx.events,
        textures: ctx.textures,
        theme: ctx.theme,

        /* ---- 元件工厂 ---- */
        node: function () { return new UINode(ctx); },
        sprite: function (o) { return new UISprite(ctx, o); },
        label: function (text, o) {
            o = o || {};
            o.text = text;
            return new UILabel(ctx, o);
        },

        /* ---- 布局 ---- */
        widget: function (node, spec) { return Widget.attach(node, spec, ctx); },
        layout: function (container, o) { return Layout.apply(container, o); },

        /* ---- 控件 ---- */
        panel: function (o) { return new Panel(ctx, o); },
        button: function (text, o) {
            o = o || {};
            o.text = text;
            return new Button(ctx, o);
        },
        progressBar: function (o) { return new ProgressBar(ctx, o); },
        scrollView: function (o) { return new ScrollView(ctx, o); },
        list: function (o) { return new List(ctx, o); },
        pageView: function (o) { return new PageView(ctx, o); },
        toggle: function (o) { return new Toggle(ctx, o); },
        slider: function (o) { return new Slider(ctx, o); },
        tabBar: function (o) { return new TabBar(ctx, o); },
        modal: function (o) { return new Modal(ctx, o); },
        nineSlice: function (o) { return new NineSlice(ctx, o); },

        /* ---- 交互 ---- */
        makePressable: function (node, o) { return ctx.events.makePressable(node, o); },
        dispatchTouch: function (e) { return ctx.events.dispatchTouch(e); },

        /* ---- 动效 / 浮层 / 3D 混合 ---- */
        tween: tweenModule.createTweenManager(ctx.root),
        tracker: trackerModule.createTrackerManager(ctx),

        /* ---- 生命周期 ---- */
        onResize: function (w, h) { ctx.root.onResize(w, h); },
        update: function (dt) { ctx.root.update(dt); },
        render: function (dt) {
            if (!ctx.renderer) throw new Error('createUI 未传 renderer');
            ctx.root.render(ctx.renderer, dt);
        },
        destroy: function () {
            ctx.root.destroy();
            ctx.textures.dispose();
        },
    };

    ctx.api = api;
    api.toast = Toast.createToast(ctx);
    return api;
}

module.exports = { createUI: createUI };
