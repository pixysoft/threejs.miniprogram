/**
 * 演示 — UI 基础件：Button 三态 / Panel / ProgressBar / Toggle / Slider / TabBar / Theme 换肤 / Toast / tween
 */
(function () {
  'use strict';

  var THEMES = {
    '默认蓝': null,
    '紫色': {
      Button: { bg: { color: 0x8a5cf6, radius: 0.5 } },
      Panel: { bg: { color: 0x221b36, alpha: 0.96, radius: 18 } },
      ProgressBar: { fill: { color: 0x8a5cf6 } }
    },
    '绿色': {
      Button: { bg: { color: 0x2f9e68, radius: 0.28 } },
      Panel: { bg: { color: 0x11291c, alpha: 0.96, radius: 8 } },
      ProgressBar: { fill: { color: 0x3fb970 } }
    }
  };

  Showcase.register({
    id: 'ui-widgets',
    group: 'ui',
    title: 'UI 基础件 widgets',
    menuNote: 'Button / Slider / Theme / Toast',
    subtitle: 'three-ui 全部渲染在 WebGL 内（正交相机 overlay），程序化纹理换肤，无需美术图集',
    width: 400, height: 700,
    desc:
      '<p>所有控件走 <code>ui.dispatchTouch(e)</code> 命中与冒泡；按钮按下有 0.95 缩放反馈（cocos zoomScale 思路），' +
      '位移超 14px 自动取消点击。顶部工具栏可整体换皮（<code>theme.set(json)</code>，已存在控件自动重绘）。</p>',
    code:
      "const ui = createUI(THREE, {\n" +
      "  renderer,\n" +
      "  screenWidth: canvas.width, screenHeight: canvas.height,\n" +
      "  createCanvas2D: () => document.createElement('canvas'),  // 小程序: wx.createOffscreenCanvas\n" +
      "});\n" +
      "const btn = ui.button('点我 +1', { w: 300, h: 88, onTap: () => count++ });\n" +
      "ui.widget(btn, { centerX: 0, top: 40 });\n" +
      "ui.theme.set({ Button: { bg: { color: 0x8A5CF6 } } });  // 一行换皮\n" +
      "// 帧循环: renderer.clear(); ui.render(dt);",
    run: function (env) {
      return env.lib().then(function (lib) {
        var THREE = lib.THREE;
        var canvas = env.makeCanvas(THREE, 400, 700);
        var renderer = env.makeRenderer(THREE, canvas);
        renderer.setClearColor(0x10141c);

        var ui = lib.createUI(THREE, {
          renderer: renderer,
          screenWidth: canvas.width,
          screenHeight: canvas.height,
          createCanvas2D: function () { return document.createElement('canvas'); }
        });

        /* ---- 布局: 面板 + 控件 ---- */
        var panel = ui.panel({ w: 690, h: 1120 });
        ui.root.addChild(panel);
        ui.widget(panel, { centerX: 0, top: 30 });

        var title = ui.label('three-ui 基础件', { size: 40, bold: true });
        ui.root.addChild(title);
        ui.widget(title, { centerX: 0, top: 70 });

        var count = 0;
        var counterLabel = ui.label('点击次数: 0', { size: 28, color: 0x8a93a5 });
        ui.root.addChild(counterLabel);
        ui.widget(counterLabel, { centerX: 0, top: 150 });

        var btn = ui.button('点我 +1', {
          w: 300, h: 88,
          onTap: function () {
            count++;
            counterLabel.setText('点击次数: ' + count);
            counterLabel.relayout();   // 文本变宽后按 Widget 规则重新居中
            ui.tween(btn).to({ scale: 1.08 }, 80, 'quadOut').to({ scale: 1 }, 120, 'backOut');
          }
        });
        ui.root.addChild(btn);
        ui.widget(btn, { centerX: 0, top: 210 });

        var disabledBtn = ui.button('禁用按钮', { w: 300, h: 88, enabled: false });
        ui.root.addChild(disabledBtn);
        ui.widget(disabledBtn, { centerX: 0, top: 330 });

        /* ProgressBar 自动推进 */
        var bar = ui.progressBar({ w: 560, h: 32, ratio: 0, text: '0%' });
        ui.root.addChild(bar);
        ui.widget(bar, { centerX: 0, top: 470 });
        var barT = 0;

        /* Toggle */
        var tgLabel = ui.label('Toggle: off', { size: 26, color: 0x8a93a5 });
        ui.root.addChild(tgLabel);
        ui.widget(tgLabel, { left: 80, top: 560 });
        var tg = ui.toggle({
          w: 110, h: 60,
          onChange: function (v) { tgLabel.setText('Toggle: ' + (v ? 'on' : 'off')); }
        });
        ui.root.addChild(tg);
        ui.widget(tg, { right: 80, top: 550 });

        /* Slider */
        var slLabel = ui.label('Slider: 30', { size: 26, color: 0x8a93a5 });
        ui.root.addChild(slLabel);
        ui.widget(slLabel, { left: 80, top: 660 });
        var sl = ui.slider({
          w: 380, h: 44, min: 0, max: 100, value: 30,
          onChange: function (v) { slLabel.setText('Slider: ' + Math.round(v)); }
        });
        ui.root.addChild(sl);
        ui.widget(sl, { right: 80, top: 655 });

        /* TabBar */
        var tab = ui.tabBar({
          w: 560, h: 88, items: ['首页', '商店', '我的'],
          onChange: function (i) { ui.toast.show('切到第 ' + (i + 1) + ' 个 Tab'); }
        });
        ui.root.addChild(tab);
        ui.widget(tab, { centerX: 0, top: 760 });

        /* Toast 按钮 */
        var toastBtn = ui.button('弹个 Toast', {
          w: 300, h: 88,
          onTap: function () { ui.toast.show('已保存 ' + new Date().toLocaleTimeString()); }
        });
        ui.root.addChild(toastBtn);
        ui.widget(toastBtn, { centerX: 0, top: 900 });

        /* ---- 工具栏换肤 ---- */
        Object.keys(THEMES).forEach(function (name) {
          env.button(name, function () {
            ui.theme.set(THEMES[name] || {
              Button: { bg: { color: 0x3b72b0, radius: 0.28 } },
              Panel: { bg: { color: 0x14171f, alpha: 0.96, radius: 12 } },
              ProgressBar: { fill: { color: 0x5cb85c } }
            });
          });
        });
        env.note('theme.set(json) 一行换皮，控件订阅重绘');

        env.bindTouch(canvas, function (e) { ui.dispatchTouch(e); });

        env.loop(function (dt) {
          barT += dt * 0.0002;
          // 按 2% 步进量化, 避免每帧生成不同宽度的填充纹理撑爆缓存
          var r = Math.round((Math.sin(barT * Math.PI * 2) + 1) / 2 * 50) / 50;
          if (r !== bar.getRatio()) {
            bar.setRatio(r);
            bar.setText(Math.round(r * 100) + '%');
          }
          renderer.clear();
          ui.render(dt);
        });

        return { dispose: function () { ui.destroy(); } };
      });
    }
  });
})();
