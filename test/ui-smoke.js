/**
 * ui/ (three-ui) 冒烟测试(Node 环境 + wx stub + 2D canvas stub)
 * 用法: node test/ui-smoke.js
 * 按里程碑分节: M1 核心 / M2 布局与基础控件 / M3 容器 / M4 扩展
 */

'use strict';

let failures = 0;

function assert(name, condition) {
    if (condition) {
        console.log('  ok  ' + name);
    } else {
        failures++;
        console.error('FAIL  ' + name);
    }
}

function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

/* ---- wx stub(与 weapp-smoke 一致) ---- */

global.wx = {
    getSystemInfoSync() {
        return {
            platform: 'devtools', system: 'iOS 15.0', language: 'zh_CN',
            screenWidth: 375, screenHeight: 667, devicePixelRatio: 2
        };
    },
    getPerformance() { return { now() { return Date.now(); } }; },
    getFileSystemManager() { return { readFile(o) { o.fail({ errMsg: 'stub' }); } }; },
    request() {}
};

/* ---- 2D canvas stub(measureText 按 0.5em/字估宽, 记录绘制调用) ---- */

function createCanvas2DStub() {
    const canvas = {
        width: 1, height: 1,
        _ctx: null,
        getContext(type) {
            if (type !== '2d') return null;
            if (!this._ctx) {
                const self = this;
                this._ctx = {
                    canvas: self,
                    font: '10px sans-serif',
                    fillStyle: '', strokeStyle: '', lineWidth: 1,
                    textBaseline: '', textAlign: '',
                    calls: [],
                    measureText(str) {
                        const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
                        const size = m ? parseFloat(m[1]) : 10;
                        return { width: str.length * size * 0.5 };
                    },
                    fillText(str) { this.calls.push(['fillText', str]); },
                    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
                    arcTo() {}, arc() {}, fill() {}, stroke() {},
                    clearRect() {}, drawImage() {},
                };
            }
            return this._ctx;
        }
    };
    return canvas;
}

const THREE = require('../build/three.weapp.js');
const { createUI } = require('../ui/index.js');

function makeUI(opts) {
    opts = opts || {};
    return createUI(THREE, {
        screenWidth: opts.screenWidth || 375,
        screenHeight: opts.screenHeight || 667,
        designWidth: 750,
        safeArea: opts.safeArea || null,
        createCanvas2D: createCanvas2DStub,
        keyboard: opts.keyboard || null,
        batch: !!opts.batch,
        cache: !!opts.cache,
    });
}

/* ---- 键盘 stub(与 wx.showKeyboard 系接口同形) ---- */

function createKeyboardStub() {
    const listeners = { input: [], confirm: [], complete: [] };
    function fire(type, res) {
        listeners[type].slice().forEach(function (fn) { fn(res); });
    }
    function off(type, fn) {
        const i = listeners[type].indexOf(fn);
        if (i !== -1) listeners[type].splice(i, 1);
    }
    return {
        shown: [], hideCount: 0,
        show(o) { this.shown.push(o); },
        hide() { this.hideCount++; },
        onInput(fn) { listeners.input.push(fn); },
        offInput(fn) { off('input', fn); },
        onConfirm(fn) { listeners.confirm.push(fn); },
        offConfirm(fn) { off('confirm', fn); },
        onComplete(fn) { listeners.complete.push(fn); },
        offComplete(fn) { off('complete', fn); },
        emitInput(v) { fire('input', { value: v }); },
        emitConfirm(v) { fire('confirm', { value: v }); },
        emitComplete(v) { fire('complete', { value: v }); },
        listenerCount() { return listeners.input.length + listeners.confirm.length + listeners.complete.length; },
    };
}

function touch(type, x, y) {
    return { type: type, touches: [{ x: x, y: y }], changedTouches: [{ x: x, y: y }] };
}

/* ==================== M1 核心 ==================== */

console.log('\n---- M1: View 适配 ----');

const ui = makeUI();

assert('竖屏 fitWidth: ui 宽 = 750', ui.view.width === 750);
assert('竖屏高按比例伸展 (667/375*750)', near(ui.view.height, 667 * 750 / 375));
assert('触摸换算: (375,0) → ui x=750', near(ui.view.toUI(375, 0).x, 750));

ui.onResize(667, 375);   // 转横屏
assert('横屏 fitHeight: ui 高 = 750', ui.view.height === 750);
assert('横屏宽按比例伸展', near(ui.view.width, 667 * 750 / 375));
assert('横屏 landscape 标记', ui.view.landscape === true);
ui.onResize(375, 667);   // 转回竖屏

const uiSafe = makeUI({ safeArea: { top: 44, bottom: 633, left: 0, right: 375 } });
assert('safeArea top 换算为 ui 单位', near(uiSafe.view.safeArea.top, 44 * 2));
assert('safeArea bottom 内缩量', near(uiSafe.view.safeArea.bottom, (667 - 633) * 2));

console.log('\n---- M1: UINode 树与 transform ----');

const parent = ui.node();
parent.setSize(400, 300);
parent.setPosition(100, 50);
ui.root.addChild(parent);

const child = ui.sprite({ w: 100, h: 60, color: 0xFF0000 });
child.setPosition(20, 30);
parent.addChild(child);

assert('addChild 建立父子关系', child.parent === parent && parent.children[0] === child);
assert('obj3d 同步挂树', child.obj3d.parent === parent.obj3d);

let aabb = child.worldAABB();
assert('worldAABB 级联位移 (120,80)', near(aabb.x, 120) && near(aabb.y, 80));
assert('worldAABB 尺寸', near(aabb.w, 100) && near(aabb.h, 60));

parent.scale = 2;
aabb = child.worldAABB();
assert('父 scale 级联进 AABB', near(aabb.x, 100 + 40) && near(aabb.w, 200));
parent.scale = 1;

child.anchorX = 0.5;
child.anchorY = 0.5;
child.setPosition(70, 60);
aabb = child.worldAABB();
assert('anchor(0.5,0.5) 定位: 左上 = pos - size/2', near(aabb.x, 100 + 70 - 50) && near(aabb.y, 50 + 60 - 30));
child.anchorX = 0; child.anchorY = 0;
child.setPosition(20, 30);

assert('y 向下映射到 THREE y 取负', near(child.obj3d.position.y, -30));

parent.alpha = 0.5;
child.alpha = 0.5;
assert('alpha 级联相乘 0.25', near(child.worldAlpha(), 0.25));
assert('alpha 写入材质 opacity', near(child.material.opacity, 0.25));
parent.alpha = 1; child.alpha = 1;

console.log('\n---- M1: hitTest 与事件 ----');

// child 世界区域 (120,80)-(220,140); 屏幕 px = ui / 2
child.interactive = true;
assert('hitTest 命中', ui.events.hitTest(150, 100) === child);
assert('hitTest 未命中(区域外)', ui.events.hitTest(500, 500) === null);

child.visible = false;
assert('visible=false 不命中', ui.events.hitTest(150, 100) === null);
child.visible = true;

// 覆盖测试: 后添加者优先
const cover = ui.sprite({ w: 100, h: 60, color: 0x00FF00 });
cover.setPosition(20, 30);
cover.interactive = true;
parent.addChild(cover);
assert('后添加者(渲染在上)优先命中', ui.events.hitTest(150, 100) === cover);
cover.destroy();

let downCount = 0, bubbleHit = false, consumed;
child.on('pointerdown', function () { downCount++; });
parent.on('pointerdown', function (ev) { bubbleHit = (ev.target === child); });

consumed = ui.dispatchTouch(touch('touchstart', 75, 50));  // px(75,50) → ui(150,100)
assert('touchstart 被 UI 消费', consumed === true);
assert('pointerdown 命中 child', downCount === 1);
assert('事件冒泡到 parent 且 target 正确', bubbleHit === true);
ui.dispatchTouch(touch('touchend', 75, 50));

consumed = ui.dispatchTouch(touch('touchstart', 350, 600));
assert('空白处 touchstart 不消费(可透给 3D)', consumed === false);
ui.dispatchTouch(touch('touchend', 350, 600));

// stopPropagation
let parentGot = 0;
const stopper = function (ev) { ev.stopPropagation(); };
child.on('pointerdown', stopper);
const parentCounter = function () { parentGot++; };
parent.on('pointerdown', parentCounter);
ui.dispatchTouch(touch('touchstart', 75, 50));
ui.dispatchTouch(touch('touchend', 75, 50));
assert('stopPropagation 截断冒泡', parentGot === 0);
child.off('pointerdown', stopper);
parent.off('pointerdown', parentCounter);

console.log('\n---- M1: makePressable 按压协议 ----');

let taps = 0;
const states = [];
const btnNode = ui.sprite({ w: 200, h: 80, color: 0x3B72B0 });
btnNode.setPosition(0, 400);
ui.root.addChild(btnNode);
ui.makePressable(btnNode, {
    onTap: function () { taps++; },
    onStateChange: function (s) { states.push(s); },
});

// px 坐标: ui(100,440) → px(50,220)
ui.dispatchTouch(touch('touchstart', 50, 220));
assert('按下进 down 态', states[states.length - 1] === 'down');
ui.dispatchTouch(touch('touchend', 50, 220));
assert('抬起触发 tap', taps === 1);
assert('抬起回 up 态', states[states.length - 1] === 'up');

ui.dispatchTouch(touch('touchstart', 50, 220));
ui.dispatchTouch(touch('touchmove', 50, 240));   // 位移 20px*2=40ui > 14
assert('位移超阈值取消按压', states[states.length - 1] === 'up');
ui.dispatchTouch(touch('touchend', 50, 240));
assert('取消后抬起不触发 tap', taps === 1);

btnNode.setEnabled(false);
ui.dispatchTouch(touch('touchstart', 50, 220));
ui.dispatchTouch(touch('touchend', 50, 220));
assert('disabled 态不响应 tap', taps === 1);
btnNode.setEnabled(true);

console.log('\n---- M1: UILabel ----');

const lbl = ui.label('hello', { size: 28 });
assert('label 宽度按文本测量 (5字*14)', near(lbl.width, 5 * 28 * 0.5));
assert('label 高度 = size*lineHeight', near(lbl.height, Math.ceil(28 * 1.3)));
const w1 = lbl.width;
lbl.setText('hello world');
assert('setText 后尺寸更新', lbl.width > w1);
assert('texture needsUpdate 置位', lbl.texture.needsUpdate === true || lbl.texture.version > 0);

const wrapped = ui.label('aaaaaaaaaaaaaaaaaaaa', { size: 28, wrap: true, maxWidth: 100 });
assert('wrap 换行后高度为多行', wrapped.height >= Math.ceil(28 * 1.3 * 2));

console.log('\n---- M1: TextureFactory 缓存 ----');

const t1 = ui.textures.roundRect(100, 50, { color: 0x123456, radius: 8 });
const t2 = ui.textures.roundRect(100, 50, { color: 0x123456, radius: 8 });
const t3 = ui.textures.roundRect(100, 50, { color: 0x654321, radius: 8 });
assert('同参数命中缓存', t1 === t2);
assert('不同参数不同纹理', t1 !== t3);
assert('circle 生成纹理', !!ui.textures.circle(40, { color: 0xFF0000 }));

console.log('\n---- M1: renderOrder DFS ----');

ui.update(16);
assert('update 后 order 不再脏', ui.root._orderDirty === false);
assert('child mesh renderOrder < btnNode mesh(树序)', child.mesh.renderOrder < btnNode.mesh.renderOrder);

/* ==================== M2 布局与基础控件 ==================== */

console.log('\n---- M2: Widget 锚点对齐 ----');

// view: 750 x 1334
const n1 = ui.sprite({ w: 100, h: 50 });
ui.root.addChild(n1);
ui.widget(n1, { right: 20, bottom: 10 });
assert('right/bottom 贴边', near(n1.x, 750 - 20 - 100) && near(n1.y, ui.view.height - 10 - 50));

const n2 = ui.sprite({ w: 100, h: 50 });
ui.root.addChild(n2);
ui.widget(n2, { centerX: 0, left: 10, top: 30 });
assert('centerX 优先于 left', near(n2.x, (750 - 100) / 2) && near(n2.y, 30));

const n3 = ui.sprite({ w: 10, h: 40 });
ui.root.addChild(n3);
ui.widget(n3, { left: 20, right: 20, top: 0 });
assert('left+right 无 w 拉伸', near(n3.width, 750 - 40));

const n4 = ui.sprite({ w: 10, h: 10 });
ui.root.addChild(n4);
ui.widget(n4, { w: 0.5, h: 100, centerX: 0, centerY: 0 });
assert('w<=1 视为比例 (375)', near(n4.width, 375) && near(n4.height, 100));
assert('centerY 居中', near(n4.y, (ui.view.height - 100) / 2));

// resize 自动重算
ui.onResize(667, 375);   // 横屏: view 高 750, 宽 667*2
assert('横屏后 right/bottom 重新贴边', near(n1.x, ui.view.width - 20 - 100) && near(n1.y, 750 - 10 - 50));
ui.onResize(375, 667);
assert('回竖屏再次重算', near(n1.x, 750 - 120));

const uiSafe2 = makeUI({ safeArea: { top: 44, bottom: 633, left: 0, right: 375 } });
const nSafe = uiSafe2.sprite({ w: 100, h: 50 });
uiSafe2.root.addChild(nSafe);
uiSafe2.widget(nSafe, { top: 0, left: 0, safe: true });
assert('safe:true 对齐边界内缩到安全区', near(nSafe.y, 88) && near(nSafe.x, 0));

console.log('\n---- M2: Layout 容器排列 ----');

const box = ui.node();
ui.root.addChild(box);
for (let i = 0; i < 5; i++) {
    box.addChild(ui.sprite({ w: 100, h: 40 }));
}
ui.layout(box, { mode: 'vertical', gap: 10 });
assert('vertical 排列: 第3个 y = 2*(40+10)', near(box.children[2].y, 100));
assert('容器包围尺寸 (100 x 240)', near(box.width, 100) && near(box.height, 5 * 40 + 4 * 10));

ui.layout(box, { mode: 'horizontal', gap: 6 });
assert('horizontal 排列: 第3个 x = 2*(100+6)', near(box.children[2].x, 212));

ui.layout(box, { mode: 'grid', cols: 2, gap: 10 });
assert('grid 2列: 第3个(索引2)换行到 (0, 50)', near(box.children[2].x, 0) && near(box.children[2].y, 50));
assert('grid: 第4个(索引3)在第二行第二列', near(box.children[3].x, 110) && near(box.children[3].y, 50));

console.log('\n---- M2: Theme ----');

assert('默认 Button 皮肤', ui.theme.get('Button').bg.color === 0x3B72B0);
ui.theme.set({ Button: { bg: { color: 0xFF0000 } } });
assert('set 深合并: color 覆盖', ui.theme.get('Button').bg.color === 0xFF0000);
assert('set 深合并: 未覆盖字段保留 (radius)', ui.theme.get('Button').bg.radius === 0.28);
assert('label 子键不受影响', ui.theme.get('Button').label.color === 0xFFFFFF);
const resolved = ui.theme.resolve('Button', { bg: { color: 0x00FF00 } });
assert('resolve 实例级覆盖', resolved.bg.color === 0x00FF00 && ui.theme.get('Button').bg.color === 0xFF0000);
ui.theme.set({ Button: { bg: { color: 0x3B72B0 } } });

console.log('\n---- M2: Button ----');

let btnTaps = 0;
const btn = ui.button('OK', { w: 200, h: 80, onTap: function () { btnTaps++; } });
btn.setPosition(0, 800);
ui.root.addChild(btn);

assert('Button 含背景与文字', !!btn.bg.material.map && btn.labelNode.text === 'OK');
assert('文字居中', near(btn.labelNode.x, 100) && near(btn.labelNode.y, 40));

// ui(100,840) → px(50,420)
ui.dispatchTouch(touch('touchstart', 50, 420));
assert('down 态背景缩放 0.95(无 down 皮肤回退)', near(btn.bg.scale, 0.95));
ui.dispatchTouch(touch('touchend', 50, 420));
assert('tap 触发', btnTaps === 1);
assert('抬起恢复缩放 1', near(btn.bg.scale, 1));

ui.dispatchTouch(touch('touchstart', 50, 420));
ui.dispatchTouch(touch('touchmove', 50, 450));   // 位移 60ui > 14
ui.dispatchTouch(touch('touchend', 50, 450));
assert('位移取消不触发 tap', btnTaps === 1);

btn.setEnabled(false);
ui.dispatchTouch(touch('touchstart', 50, 420));
ui.dispatchTouch(touch('touchend', 50, 420));
assert('disabled 不触发 tap', btnTaps === 1);
btn.setEnabled(true);

btn.setLabel('GO');
assert('setLabel 更新文本并保持居中', btn.labelNode.text === 'GO' && near(btn.labelNode.x, 100));

// 主题热更
const texBefore = btn.bg.material.map;
ui.theme.set({ Button: { bg: { color: 0x123123 } } });
assert('theme.set 触发按钮重绘(纹理更换)', btn.bg.material.map !== texBefore);
ui.theme.set({ Button: { bg: { color: 0x3B72B0 } } });

console.log('\n---- M2: Panel / ProgressBar ----');

const pnl = ui.panel({ w: 300, h: 200 });
ui.root.addChild(pnl);
assert('Panel 背景铺满', near(pnl.bg.width, 300) && near(pnl.bg.height, 200));
pnl.setSize(400, 250);
assert('Panel resize 背景跟随', near(pnl.bg.width, 400));

const bar = ui.progressBar({ w: 300, h: 24, ratio: 0.5, text: '50%' });
ui.root.addChild(bar);
assert('ratio 0.5 填充半宽', near(bar.fill.width, 150));
bar.setRatio(1.5);
assert('ratio 钳制到 1', near(bar.getRatio(), 1) && near(bar.fill.width, 300));
bar.setRatio(0);
assert('ratio 0 隐藏填充', bar.fill.visible === false);
bar.setText('done');
assert('setText 更新', bar.labelNode.text === 'done');

/* ==================== M3 容器 ==================== */

console.log('\n---- M3: ScrollView 拖拽与拦截 ----');

// 独立 ui 实例避免前面节点干扰命中
const ui3 = makeUI();

let scrollPos = -1;
const sv = ui3.scrollView({ w: 300, h: 400, onScroll: function (p) { scrollPos = p; } });
sv.setPosition(0, 0);
ui3.root.addChild(sv);
sv.setContentSize(800);

const svBtnStates = [];
let svBtnTaps = 0;
const svBtn = ui3.button('item', { w: 200, h: 80, onTap: function () { svBtnTaps++; } });
svBtn.setPosition(20, 40);
sv.content.addChild(svBtn);

assert('content 子树挂了裁剪平面', svBtn.bg.material.clippingPlanes === sv._mask.planes);

// ui(100,300) → px(50,150); 拖动 -80ui
ui3.dispatchTouch(touch('touchstart', 50, 150));
ui3.dispatchTouch(touch('touchmove', 50, 130));   // -40ui, 超阈值进入滚动
ui3.dispatchTouch(touch('touchmove', 50, 110));   // 再 -40ui
assert('拖拽滚动 content 上移 80', near(sv.content.y, -80));
assert('onScroll 报告位置 80', near(scrollPos, 80));
ui3.dispatchTouch(touch('touchend', 50, 110));

// 子按钮按下后滚动 → cancelPress
sv.scrollTo(0);
ui3.dispatchTouch(touch('touchstart', 60, 40));    // ui(120,80) 命中按钮
assert('按钮先进 down 态(bg 缩放)', near(svBtn.bg.scale, 0.95));
ui3.dispatchTouch(touch('touchmove', 60, 20));     // 位移 40ui 超滚动阈值
assert('滚动接管后按钮取消按压', near(svBtn.bg.scale, 1));
ui3.dispatchTouch(touch('touchend', 60, 20));
assert('被拦截的按钮不触发 tap', svBtnTaps === 0);
assert('内容跟随滚动', sv.content.y < 0);

console.log('\n---- M3: ScrollView 回弹与钳制 ----');

sv.scrollTo(9999);
assert('scrollTo 越界钳制到 maxScroll(400)', near(sv.scrollPos(), 400));
sv.scrollTo(0);

// 向下拉出顶部越界 → 阻尼 + 回弹(阻尼在已越界后的增量上生效, 同 pixi/cocos)
ui3.dispatchTouch(touch('touchstart', 50, 150));
ui3.dispatchTouch(touch('touchmove', 50, 160));    // +20ui, 进入越界
ui3.dispatchTouch(touch('touchmove', 50, 170));    // 再 +20ui, 阻尼 0.5 → +10
assert('越界拖动带阻尼 (20+10=30)', near(sv.content.y, 30));
ui3.dispatchTouch(touch('touchend', 50, 170));
// 释放後可能有惯性/回弹, 步进至稳定
for (let i = 0; i < 200; i++) ui3.update(16);
assert('回弹结束回到 0', near(sv.content.y, 0, 0.5));

console.log('\n---- M3: ScrollView 磁吸 ----');

let snapped = -1;
const svSnap = ui3.scrollView({ w: 300, h: 300, snapInterval: 300, onSnap: function (i) { snapped = i; } });
svSnap.setPosition(0, 500);
ui3.root.addChild(svSnap);
svSnap.setContentSize(900);

svSnap.snapTo(1, false);
assert('snapTo(1, false) 立即到页 1', near(svSnap.scrollPos(), 300) && snapped === 1);
svSnap.snapTo(2);   // 动画吸附
for (let i = 0; i < 40; i++) ui3.update(16);
assert('动画磁吸到页 2', near(svSnap.scrollPos(), 600, 0.5) && snapped === 2);

console.log('\n---- M3: Mask 跟随 ----');

ui3.update(16);
assert('mask 左边界 = 容器世界 x', near(sv._mask.planes[0].constant, 0));
sv.setPosition(50, 100);
ui3.update(16);
assert('容器移动后 mask 跟随 (left=-50)', near(sv._mask.planes[0].constant, -50));
assert('mask 上边界跟随 (top: -y=−100)', near(sv._mask.planes[2].constant, -100));
sv.setPosition(0, 0);

console.log('\n---- M3: List 虚拟化 ----');

let created = 0;
const list = ui3.list({
    w: 300, h: 400, itemHeight: 100,
    createItem: function () {
        created++;
        const n = ui3.node();
        n.setSize(300, 100);
        n.labelRef = ui3.label('', { size: 24 });
        n.addChild(n.labelRef);
        return n;
    },
    updateItem: function (n, idx, d) { n.labelRef.setText(d); },
});
list.setPosition(400, 0);
ui3.root.addChild(list);

const bigData = [];
for (let i = 0; i < 1000; i++) bigData.push('row-' + i);
list.setData(bigData);

assert('复用池 = 可视区+2 = 6', list.poolCount() === 6 && created === 6);
const visible0 = list._pool.filter(function (p) { return p.node.visible; });
assert('初始绑定前 6 条', visible0.length === 6 && visible0.some(function (p) { return p.index === 0; }));

list.scrollTo(999999);   // 钳制到底部(maxScroll = 100000-400 = 99600)
assert('钳制到 maxScroll', near(list.scrollPos(), 99600));
assert('滚到底不再新建实例(仍 6 个)', created === 6);
const bottomBound = list._pool.filter(function (p) { return p.index === 999; });
assert('底部最后一条已绑定', bottomBound.length === 1);
assert('绑定内容正确', bottomBound[0].node.labelRef.text === 'row-999');

list.scrollTo(1000);    // 第 10 行起
const midIndices = list._pool.map(function (p) { return p.index; }).sort(function (a, b) { return a - b; });
assert('中段窗口 [10..15]', midIndices[0] === 10 && midIndices[midIndices.length - 1] === 15);

console.log('\n---- M3: PageView ----');

let pageIdx = -1;
const pv = ui3.pageView({ w: 300, h: 200, onPage: function (i) { pageIdx = i; } });
pv.setPosition(0, 900);
ui3.root.addChild(pv);
for (let i = 0; i < 3; i++) {
    pv.addPage(ui3.sprite({ w: 300, h: 200, color: 0x101010 * (i + 1) }));
}

assert('addPage 页位铺排', near(pv.content.children[2].x, 600));
pv.setPage(2, false);
assert('setPage(2) 立即翻页', near(pv.scrollPos(), 600) && pv.currentPage() === 2 && pageIdx === 2);
pv.setPage(0);
for (let i = 0; i < 40; i++) ui3.update(16);
assert('动画翻回页 0', near(pv.scrollPos(), 0, 0.5) && pv.currentPage() === 0);

/* ==================== M4 扩展 ==================== */

console.log('\n---- M4: tween ----');

const ui4 = makeUI();
const tnode = ui4.sprite({ w: 100, h: 100 });
ui4.root.addChild(tnode);

let tweenDone = false;
ui4.tween(tnode).to({ x: 200, alpha: 0.5 }, 300, 'linear').call(function () { tweenDone = true; });
for (let i = 0; i < 10; i++) ui4.update(15);   // 150ms = 一半
assert('tween 中点插值 x≈100', near(tnode.x, 100, 5));
for (let i = 0; i < 15; i++) ui4.update(15);
assert('tween 完成 x=200 alpha=0.5', near(tnode.x, 200) && near(tnode.alpha, 0.5));
assert('call 回调触发', tweenDone === true);

ui4.tween(tnode).delay(100).to({ y: 50 }, 100, 'linear');
for (let i = 0; i < 5; i++) ui4.update(15);    // 75ms 仍在 delay
assert('delay 期间不动', near(tnode.y, 0));
for (let i = 0; i < 12; i++) ui4.update(15);
assert('delay 后到位 y=50', near(tnode.y, 50));

// 同节点新 tween 顶替旧 tween
ui4.tween(tnode).to({ x: 0 }, 1000, 'linear');
ui4.tween(tnode).to({ x: 300 }, 100, 'linear');
for (let i = 0; i < 12; i++) ui4.update(15);
assert('新 tween 顶替旧 tween', near(tnode.x, 300));

console.log('\n---- M4: Toggle / Slider ----');

let toggleVal = null;
const tg = ui4.toggle({ w: 100, h: 56, onChange: function (v) { toggleVal = v; } });
tg.setPosition(0, 200);
ui4.root.addChild(tg);

assert('初始 off, knob 靠左', tg.isChecked() === false && near(tg.knob.x, 4));
// ui(50,228) → px(25,114)
ui4.dispatchTouch(touch('touchstart', 25, 114));
ui4.dispatchTouch(touch('touchend', 25, 114));
assert('tap 切换为 on', tg.isChecked() === true && toggleVal === true);
assert('knob 移到右侧', near(tg.knob.x, 100 - (56 - 8) - 4));
tg.setChecked(false, true);
assert('silent 不触发 onChange', toggleVal === true && tg.isChecked() === false);

let sliderVal = -1;
const sl = ui4.slider({ w: 300, h: 40, min: 0, max: 100, onChange: function (v) { sliderVal = v; } });
sl.setPosition(0, 300);
ui4.root.addChild(sl);

// 点在 75% 处: ui(225,320) → px(112.5,160)
ui4.dispatchTouch(touch('touchstart', 112.5, 160));
assert('按下取值 75', near(sl.getValue(), 75) && near(sliderVal, 75));
ui4.dispatchTouch(touch('touchmove', 150, 160));   // ui x=300 → 100%
assert('拖到最右取值 100', near(sl.getValue(), 100));
ui4.dispatchTouch(touch('touchend', 150, 160));

const sl2 = ui4.slider({ w: 300, h: 40, min: 0, max: 10, step: 2, value: 0 });
sl2.setPosition(0, 400);
ui4.root.addChild(sl2);
sl2._pick(90);   // 30% → 3 → step 2 取整 → 4... round(3/2)*2 = 4? round(1.5)=2 → 4
assert('step 取整', sl2.getValue() % 2 === 0);

console.log('\n---- M4: TabBar ----');

let tabIdx = -1;
const tb = ui4.tabBar({ w: 750, h: 88, items: ['首页', '商店', '我的'], onChange: function (i) { tabIdx = i; } });
tb.setPosition(0, 500);
ui4.root.addChild(tb);

assert('初始索引 0', tb.getIndex() === 0);
// 点第二格中心: ui(375,544) → px(187.5,272)
ui4.dispatchTouch(touch('touchstart', 187.5, 272));
ui4.dispatchTouch(touch('touchend', 187.5, 272));
assert('tap 切到索引 1', tb.getIndex() === 1 && tabIdx === 1);
assert('指示条移到第二格', tb.indicator.x > 250 && tb.indicator.x < 500);

console.log('\n---- M4: Modal 防穿透 ----');

const ui5 = makeUI();
let behindTaps = 0;
const behind = ui5.button('behind', { w: 200, h: 80, onTap: function () { behindTaps++; } });
behind.setPosition(275, 600);
ui5.root.addChild(behind);

let modalClosed = 0;
const md = ui5.modal({ w: 560, h: 400, title: '提示', onClose: function () { modalClosed++; } });
md.show();
for (let i = 0; i < 15; i++) ui5.update(16);
assert('show 后淡入 alpha=1', near(md.alpha, 1, 0.01));

// 点击 modal 面板中心(在 behind 按钮区域内): 不应穿透
// behind 按钮 ui(275..475, 600..680); 面板中心 ui(375, view.height/2≈667) 在按钮内
ui5.dispatchTouch(touch('touchstart', 187.5, 333.5));
ui5.dispatchTouch(touch('touchend', 187.5, 333.5));
assert('面板区域点击不穿透到底层按钮', behindTaps === 0);

// 点击遮罩空白处 → 关闭
ui5.dispatchTouch(touch('touchstart', 20, 50));
ui5.dispatchTouch(touch('touchend', 20, 50));
assert('遮罩点击触发关闭', modalClosed === 1);
for (let i = 0; i < 15; i++) ui5.update(16);
assert('hide 后不可见', md.visible === false);
assert('遮罩下按钮依旧未被穿透', behindTaps === 0);

console.log('\n---- M4: Toast ----');

const toastNode = ui5.toast.show('已保存', 500);
assert('toast 创建并挂树', toastNode.parent === ui5.root);
for (let i = 0; i < 12; i++) ui5.update(16);
assert('toast 淡入', near(toastNode.alpha, 1, 0.01));
assert('toast 不挡触摸(空白处不消费)', ui5.events.hitTest(toastNode.x + 10, toastNode.y + 10) === null);
for (let i = 0; i < 60; i++) ui5.update(16);
assert('toast 到期销毁', toastNode.destroyed === true);

console.log('\n---- M4: NineSlice ----');

const nsTex = ui4.textures.roundRect(64, 64, { color: 0xFFFFFF, radius: 16 });
const ns = ui4.nineSlice({ texture: nsTex, textureW: 64, textureH: 64, left: 16, right: 16, top: 16, bottom: 16, w: 300, h: 120 });
ui4.root.addChild(ns);

const nsPos = ns.geometry.attributes.position.array;
// 顶点网格: 第二列 x = left(16), 第三列 x = w-right(284)
assert('九宫格中间列拉伸 (x1=16, x2=284)', near(nsPos[1 * 3], 16) && near(nsPos[2 * 3], 284));
ns.setSize(600, 200);
const nsPos2 = ns.geometry.attributes.position.array;
assert('resize 只动 position (x2=584)', near(nsPos2[2 * 3], 584));
const nsUV = ns.geometry.attributes.uv.array;
assert('UV 固定不变 (u1=0.25)', near(nsUV[1 * 2], 0.25));

console.log('\n---- M4: UICoordinateTracker ----');

const cam3d = new THREE.PerspectiveCamera(60, 750 / 1334, 0.1, 100);
cam3d.position.set(0, 0, 10);
cam3d.updateMatrixWorld(true);
cam3d.updateProjectionMatrix();

const target = new THREE.Object3D();
target.position.set(0, 0, 0);   // 相机正前方 → 屏幕中心
target.updateMatrixWorld(true);

const hp = ui4.sprite({ w: 80, h: 10, color: 0xFF0000 });
ui4.root.addChild(hp);
const trk = ui4.tracker(target, cam3d, hp, { offsetY: -40 });

ui4.update(16);
assert('中心投影到 UI 中点', near(hp.x, ui4.view.width / 2) && near(hp.y, ui4.view.height / 2 - 40));

target.position.set(0, 0, 20);  // 移到相机背面
target.updateMatrixWorld(true);
ui4.update(16);
assert('相机背面自动隐藏', hp.visible === false);

target.position.set(0, 0, 0);
target.updateMatrixWorld(true);
ui4.update(16);
assert('回到视野恢复显示', hp.visible === true);
trk.dispose();

/* ==================== N1: RichLabel + Modal/Toast 横竖屏 ==================== */

console.log('\n---- N1: RichLabel ----');

const ui6 = makeUI();
// stub measureText: 宽 = 字数 * size * 0.5
const rich = ui6.richLabel([
    { text: 'AAAA', size: 20 },                       // w=40
    { text: 'BBBB', size: 20, color: 0xFFD24D },      // w=40, 累计 80
    { text: 'CCCC', size: 20, bold: true },           // 80+40>100 → 换行
], { wrapWidth: 100, lineGap: 6 });
ui6.root.addChild(rich);

assert('三段生成三个子 Label', rich.children.length === 3);
assert('段2 接排在段1 之后 (x=40)', near(rich.children[1].x, 40));
assert('段3 贪心换行到第二行', near(rich.children[2].x, 0) && rich.children[2].y > 0);
assert('总宽 = 最宽行 80', near(rich.width, 80));
assert('总高 = 两行 + gap (26+6+26)', near(rich.height, 20 * 1.3 + 6 + 20 * 1.3));
assert('段2 颜色覆盖生效', rich.children[1]._color === 0xFFD24D);

rich.setSegments([{ text: 'DD', size: 20 }]);
assert('setSegments 重建 (1 段)', rich.children.length === 1 && near(rich.width, 20));
rich.setSegments([]);
assert('空段数组尺寸归零', rich.width === 0 && rich.height === 0);

console.log('\n---- N1: Modal/Toast 横竖屏重排 ----');

const md6 = ui6.modal({ w: 560, h: 400, title: '设置' });
md6.show();
assert('竖屏面板居中', near(md6.panel.x, (750 - 560) / 2) && near(md6.panel.y, (1334 - 400) / 2));
assert('title 是 panel 子节点(相对定位)', md6.titleLabel.parent === md6.panel && near(md6.titleLabel.x, 280));

const toast6 = ui6.toast.show('已保存', 99999);
const toastY0 = toast6.y;
assert('竖屏 toast 顶部 12%', near(toastY0, 1334 * 0.12));

ui6.onResize(667, 375);   // 转横屏: view = 1334 x 750
assert('横屏遮罩铺满新视口', near(md6.mask.width, 1334) && near(md6.mask.height, 750));
assert('横屏面板重新居中', near(md6.panel.x, (1334 - 560) / 2) && near(md6.panel.y, (750 - 400) / 2));
assert('title 相对面板位置不变', near(md6.titleLabel.x, 280) && near(md6.titleLabel.y, 24));
assert('横屏 toast 重算位置', near(toast6.y, 750 * 0.12) && near(toast6.x, (1334 - toast6.width) / 2));
ui6.onResize(375, 667);

/* ==================== N2: Atlas 图集与帧皮肤 ==================== */

console.log('\n---- N2: Atlas 帧索引 ----');

const ui7 = makeUI();
// 伪纹理: 256x128 图集
const atlasTex = new THREE.Texture({ width: 256, height: 128 });
ui7.atlas.addAtlas('ui', {
    frames: {
        'btn_up':   { frame: { x: 0, y: 0, w: 64, h: 32 }, slice: [8, 8, 8, 8] },
        'btn_down': { frame: { x: 64, y: 0, w: 64, h: 32 } },
        'icon':     { frame: { x: 128, y: 32, w: 32, h: 32 } },
    },
    meta: { size: { w: 256, h: 128 } },
}, atlasTex);

assert('帧索引建立', ui7.atlas.has('btn_up') && ui7.atlas.has('icon'));
assert('未注册帧不可用', ui7.atlas.has('nope') === false);
const fr = ui7.atlas.frame('icon');
assert('帧数据完整', fr.x === 128 && fr.y === 32 && fr.w === 32 && fr.texW === 256);
assert('slice 元数据', ui7.atlas.frame('btn_up').slice[0] === 8 && ui7.atlas.frame('btn_down').slice === null);

console.log('\n---- N2: UISprite.setFrame UV ----');

const spr = ui7.sprite({ w: 100, h: 100 });
spr.setFrame(fr);
const sprUV = spr.mesh.geometry.attributes.uv.array;
// icon: u ∈ [0.5, 0.625], v ∈ [1-64/128, 1-32/128] = [0.5, 0.75]
let uMin = 1, uMax = 0, vMin = 1, vMax = 0;
for (let i = 0; i < 4; i++) {
    uMin = Math.min(uMin, sprUV[i * 2]); uMax = Math.max(uMax, sprUV[i * 2]);
    vMin = Math.min(vMin, sprUV[i * 2 + 1]); vMax = Math.max(vMax, sprUV[i * 2 + 1]);
}
assert('setFrame U 范围 [0.5, 0.625]', near(uMin, 0.5) && near(uMax, 0.625));
assert('setFrame V 范围 [0.5, 0.75]', near(vMin, 0.5) && near(vMax, 0.75));
assert('setFrame 换纹理且不动共享几何', spr.material.map === atlasTex
    && spr.mesh.geometry !== ui7.sprite({ w: 1, h: 1 }).mesh.geometry);

console.log('\n---- N2: NineSlice 帧模式 ----');

const nsFrame = ui7.nineSlice({ frame: ui7.atlas.frame('btn_up'), w: 200, h: 80 });
assert('insets 取帧 slice 元数据', nsFrame._insets.left === 8 && nsFrame._insets.bottom === 8);
const nsfUV = nsFrame.geometry.attributes.uv.array;
// btn_up 帧 u ∈ [0, 0.25]; 第二列 u = (0+8)/256 = 0.03125
assert('帧内九宫格 UV (u1=8/256)', near(nsfUV[1 * 2], 8 / 256));
assert('帧右缘 UV (u3=64/256)', near(nsfUV[3 * 2], 0.25));

console.log('\n---- N2: makeBg 回退链与 Button 帧皮肤 ----');

const skinMod = require('../ui/render/skin.js');
const bgFrame = skinMod.makeBg(ui7.ctx, { frame: 'btn_up' }, 200, 80);
assert('有帧有 slice → NineSlice', !!bgFrame._insets);
const bgStretch = skinMod.makeBg(ui7.ctx, { frame: 'btn_down' }, 200, 80);
assert('有帧无 slice → UISprite 拉伸', !bgStretch._insets && bgStretch.material.map === atlasTex);
const bgProc = skinMod.makeBg(ui7.ctx, { frame: 'missing', color: 0xFF0000, radius: 8 }, 200, 80);
assert('帧缺失 → 程序化回退', !!bgProc.material.map && bgProc.material.map !== atlasTex);

const frameBtn = ui7.button('图集按钮', {
    w: 200, h: 80,
    skin: { bg: { frame: 'btn_up' }, bgDown: { frame: 'btn_down' } },
});
ui7.root.addChild(frameBtn);
assert('Button up 态用九宫格帧皮肤', !!frameBtn.bg._insets);
frameBtn.setPosition(0, 0);
// tap: ui(100,40) → px(50,20)
ui7.dispatchTouch(touch('touchstart', 50, 20));
assert('Button down 态切独立帧(无缩放回退)', frameBtn.bg.material.map === atlasTex && near(frameBtn.bg.scale, 1) && !frameBtn.bg._insets);
ui7.dispatchTouch(touch('touchend', 50, 20));
assert('抬起回 up 帧', !!frameBtn.bg._insets);

const procBtn = ui7.button('程序化按钮', { w: 200, h: 80 });
ui7.root.addChild(procBtn);
assert('无帧配置仍程序化渲染(回退不破坏现状)', !!procBtn.bg.material.map);

/* ==================== N3: EditBox + ScrollBar ==================== */

console.log('\n---- N3: EditBox 键盘协议 ----');

const kb = createKeyboardStub();
const ui8 = makeUI({ keyboard: kb });

let ebChanged = [], ebConfirmed = null, ebBlurred = 0;
const eb = ui8.editBox({
    w: 400, h: 72, placeholder: '请输入昵称', maxLength: 10, confirmType: 'go',
    onChange: function (t) { ebChanged.push(t); },
    onConfirm: function (t) { ebConfirmed = t; },
    onBlur: function () { ebBlurred++; },
});
ui8.root.addChild(eb);

assert('初始 placeholder 显示、文本隐藏', eb.placeholderLabel.visible === true && eb.textLabel.visible === false);

eb.focus();
assert('focus 调起键盘且参数正确', kb.shown.length === 1
    && kb.shown[0].defaultValue === '' && kb.shown[0].maxLength === 10 && kb.shown[0].confirmType === 'go');
assert('进入 editing 态', eb.editing === true);

kb.emitInput('abc');
assert('onInput 驱动文本 + onChange', eb.getText() === 'abc' && ebChanged.length === 1 && ebChanged[0] === 'abc');
assert('placeholder 隐藏', eb.placeholderLabel.visible === false && eb.textLabel.visible === true);

kb.emitInput('abcdefghijKLMN');
assert('maxLength 截断到 10', eb.getText() === 'abcdefghij');

kb.emitConfirm('abcdefghij');
kb.emitComplete();
assert('confirm + complete: onConfirm/onBlur 且退出 editing', ebConfirmed === 'abcdefghij' && ebBlurred === 1 && eb.editing === false);
assert('complete 后注销键盘回调', kb.listenerCount() === 0);

console.log('\n---- N3: EditBox 单实例互斥 ----');

const eb2 = ui8.editBox({ w: 400, h: 72 });
ui8.root.addChild(eb2);
eb.focus();
eb2.focus();
assert('新实例 focus 时旧实例被 blur', eb.editing === false && eb2.editing === true);
assert('旧实例 blur 调了 hide', kb.hideCount >= 1);
eb2.blur();
assert('blur 幂等退出', eb2.editing === false && kb.listenerCount() === 0);

const ebPwd = ui8.editBox({ w: 400, h: 72, password: true, text: 'secret' });
assert('密码模式打点显示', ebPwd.textLabel.text === '\u2022\u2022\u2022\u2022\u2022\u2022');

const uiNoKb = makeUI();
const ebRo = uiNoKb.editBox({ w: 400, h: 72 });
ebRo.focus();
assert('未注入 keyboard 退化为只读(不进 editing)', ebRo.editing === false);

console.log('\n---- N3: ScrollBar ----');

const sv8 = ui8.scrollView({ w: 300, h: 400, scrollBar: true });
ui8.root.addChild(sv8);
sv8.setContentSize(800);
ui8.update(16);

assert('条长 = view²/content (400²/800=200)', near(sv8.scrollBar.bar.height, 200));
assert('条贴右缘 (300-6-2)', near(sv8.scrollBar.bar.x, 292));
assert('顶部时条在顶', near(sv8.scrollBar.bar.y, 0));

sv8.scrollTo(200);   // maxScroll=400 → t=0.5 → offset = 0.5*(400-200)=100
ui8.update(16);
assert('滚动 50% 条移到中段', near(sv8.scrollBar.bar.y, 100));
assert('滚动中条可见', sv8.scrollBar.bar.alpha > 0.3);

for (let i = 0; i < 90; i++) ui8.update(16);   // 静止 ~1.44s
assert('静止 1s 后淡出', sv8.scrollBar.bar.alpha < 0.01);

sv8.setContentSize(300);   // 内容不足一屏
ui8.update(16);
assert('内容不足一屏不显示', sv8.scrollBar.bar.visible === false);

const svh = ui8.scrollView({ w: 400, h: 100, direction: 'x', scrollBar: true });
ui8.root.addChild(svh);
svh.setContentSize(800);
ui8.update(16);
assert('水平条贴底缘', near(svh.scrollBar.bar.y, 100 - 6 - 2) && near(svh.scrollBar.bar.width, 200));

/* ==================== N4: UIBatcher 合批 ==================== */

console.log('\n---- N4: UIBatcher ----');

const ui9 = makeUI({ batch: true });
const batcher = ui9.root.batcher;
assert('batch: true 创建 batcher', !!batcher);

// 三个纯色 sprite(不同色): 共用白纹理 + 顶点色 → 1 段
const s1 = ui9.sprite({ w: 100, h: 50, color: 0xFF0000 });
s1.setPosition(0, 0);
const s2 = ui9.sprite({ w: 100, h: 50, color: 0x00FF00 });
s2.setPosition(0, 60);
const s3 = ui9.sprite({ w: 100, h: 50, color: 0x0000FF });
s3.setPosition(0, 120);
ui9.root.addChild(s1); ui9.root.addChild(s2); ui9.root.addChild(s3);

ui9.update(16);
assert('3 纯色 sprite 合成 1 段', batcher.segmentCount === 1);
assert('原 mesh 隐藏', s1.mesh.visible === false && s3.mesh.visible === false);
const bmesh = batcher._pool[0].mesh;
assert('批 mesh 可见且 drawRange = 3 quad', bmesh.visible === true && bmesh.geometry.drawRange.count === 18);

// 顶点数学: s2 世界矩形 (0,60)-(100,110) → THREE y 取负
const bpos = bmesh.geometry.attributes.position.array;
assert('s2 quad 顶点写入正确', near(bpos[12], 0) && near(bpos[13], -60) && near(bpos[21], 100) && near(bpos[22], -110));
// 顶点色: s1 红色
const bcol = bmesh.geometry.attributes.color.array;
assert('s1 顶点色 = 红', near(bcol[0], 1) && near(bcol[1], 0) && near(bcol[2], 0));

// 纹理 sprite 插入中间 → 打断成 3 段
const texA = ui9.textures.roundRect(50, 50, { color: 0xFFFFFF, radius: 8 });
const st = ui9.sprite({ w: 50, h: 50 });
st.setTexture(texA);
st.setPosition(200, 60);
ui9.root.addChild(st);
// 树序: s1,s2,s3(白) → st(texA); st 在尾部 → 2 段
ui9.update(16);
assert('异纹理追加 → 2 段', batcher.segmentCount === 2);

// Label 打断连续段
const lb = ui9.label('打断', { size: 20 });
ui9.root.addChild(lb);
const s4 = ui9.sprite({ w: 40, h: 40, color: 0xFFFFFF });
ui9.root.addChild(s4);
ui9.update(16);
assert('Label 打断后新起段(3 段)', batcher.segmentCount === 3);
assert('Label 不进批(mesh 可见)', lb.mesh.visible === true);

// rotation 退批
s4.rotation = 0.5;
ui9.update(16);
assert('rotation 节点退批走原 mesh', s4.mesh.visible === true && batcher.segmentCount === 2);
s4.rotation = 0;
ui9.update(16);
assert('rotation 归零重新进批', s4.mesh.visible === false && batcher.segmentCount === 3);

// 隐藏节点不进批
s2.visible = false;
ui9.update(16);
assert('隐藏节点跳过(仍 3 段)', batcher.segmentCount === 3);
s2.visible = true;

// 关闭 batch 的 ui 行为不变
const uiNoBatch = makeUI();
const sn = uiNoBatch.sprite({ w: 10, h: 10, color: 0xFF0000 });
uiNoBatch.root.addChild(sn);
uiNoBatch.update(16);
assert('未开 batch 原 mesh 直渲', sn.mesh.visible === true && !uiNoBatch.root.batcher);

/* ==================== N5: CharAtlas + RT 缓存 ==================== */

console.log('\n---- N5: CharAtlas ----');

const ui10 = makeUI();
ui10.charAtlas.bake('0123456789', { size: 32, color: 0xFFFFFF, bold: true });

const score = ui10.label('0', { atlas: true, size: 32, color: 0xFFFFFF, bold: true });
ui10.root.addChild(score);
assert('atlas 模式激活', score._atlasMode === true);

// stub measureText: 每字宽 32*2*0.5+2 = 34px(2x) → ui 17
const fillsBefore = score.canvas.getContext('2d').calls.filter(function (c) { return c[0] === 'fillText'; }).length;
score.setText('12500');
const fillsAfter = score.canvas.getContext('2d').calls.filter(function (c) { return c[0] === 'fillText'; }).length;
assert('atlas setText 不触碰自身 canvas', fillsAfter === fillsBefore);
assert('宽度 = Σ字宽 (5×17)', near(score.width, 5 * 17));
assert('drawRange = 5 quad', score.mesh.geometry.drawRange.count === 30);
assert('共享 CharAtlas 纹理', score.material.map !== score.texture);

const set1 = ui10.charAtlas.lookup(32, 0xFFFFFF, true, '123');
const score2 = ui10.label('99', { atlas: true, size: 32, color: 0xFFFFFF, bold: true });
assert('同 style 复用同一纹理', score2.material.map === set1.texture && score.material.map === set1.texture);

score.setText('12:00');   // ':' 未烘焙
assert('缺字回退 canvas 绘字', score._atlasMode === false && score.material.map === score.texture);
score.setText('4567');
assert('字符齐全恢复 atlas 模式', score._atlasMode === true);

const plain = ui10.label('12500', { size: 32, color: 0xFFFFFF, bold: true });
assert('未开 atlas 的 Label 不受影响', plain._atlasMode === false);

console.log('\n---- N5: cache 模式跳 pass ----');

function createRendererStub() {
    return {
        autoClear: true, autoClearColor: true,
        _target: null, passes: [],
        setRenderTarget(t) { this._target = t; },
        getRenderTarget() { return this._target; },
        getDrawingBufferSize(v) { v.x = 750; v.y = 1334; return v; },
        getClearColor() { return new THREE.Color(0); },
        getClearAlpha() { return 1; },
        setClearColor() {},
        clear() {},
        clearDepth() {},
        render() { this.passes.push(this._target ? 'rt' : 'screen'); },
    };
}

const uiC = makeUI({ cache: true });
const rdr = createRendererStub();
const cbox = uiC.sprite({ w: 100, h: 100, color: 0xFF0000 });
uiC.root.addChild(cbox);

uiC.root.render(rdr, 16);
assert('首帧: 重绘 RT + 合成', rdr.passes.join(',') === 'rt,screen');

rdr.passes.length = 0;
uiC.root.render(rdr, 16);
uiC.root.render(rdr, 16);
assert('静止两帧只合成不重绘', rdr.passes.join(',') === 'screen,screen');

cbox.x = 50;   // 动一下 → 置脏
rdr.passes.length = 0;
uiC.root.render(rdr, 16);
assert('transform 变化触发重绘 RT', rdr.passes.join(',') === 'rt,screen');

cbox.setColor(0x00FF00);
rdr.passes.length = 0;
uiC.root.render(rdr, 16);
assert('纹理级变化触发重绘 RT', rdr.passes.join(',') === 'rt,screen');

const rtBefore = uiC.root._rt;
uiC.onResize(667, 375);
rdr.passes.length = 0;
uiC.root.render(rdr, 16);
assert('resize 后 RT 重建并重绘', uiC.root._rt !== rtBefore && rdr.passes.join(',') === 'rt,screen');

const uiNoCache = makeUI();
const rdr2 = createRendererStub();
uiNoCache.root.render(rdr2, 16);
uiNoCache.root.render(rdr2, 16);
assert('未开 cache 每帧直渲', rdr2.passes.join(',') === 'screen,screen');

/* ==================== 收尾 ==================== */

console.log('');
if (failures) {
    console.error(failures + ' failure(s)');
    process.exit(1);
} else {
    console.log('ALL PASS');
}
