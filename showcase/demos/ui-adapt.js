/**
 * 演示 — 横竖屏适配：View fitWidth/fitHeight 切换 + Widget 自动重排
 */
(function () {
  'use strict';

  Showcase.register({
    id: 'ui-adapt',
    group: 'ui',
    title: '横竖屏适配 Widget',
    menuNote: 'fitWidth / fitHeight · 一套 UI',
    subtitle: '竖屏 UI 宽恒 750、横屏 UI 高恒 750；贴边元素用 Widget 声明，切方向自动重排 —— 一套 UI 双方向',
    width: 400, height: 700,
    desc:
      '<p>点工具栏「切换横/竖屏」改变 canvas 尺寸并调用 <code>ui.onResize(w, h)</code>，' +
      '模拟真机 <code>wx.onWindowResize</code>。四角与中央元素全部用 Widget 锚点声明，无需两套布局。</p>' +
      '<ul>' +
      '<li>左上 / 右上 / 左下 / 右下：<code>{ left/right, top/bottom }</code> 贴边</li>' +
      '<li>顶部横条：<code>{ left: 0, right: 0, top: 0 }</code> 双边拉伸</li>' +
      '<li>中央面板：<code>{ centerX: 0, centerY: 0 }</code> 居中</li>' +
      '</ul>',
    code:
      "ui.widget(topBar, { left: 0, right: 0, top: 0, h: 90 });   // 拉伸\n" +
      "ui.widget(coin, { right: 20, top: 110 });                  // 贴边\n" +
      "ui.widget(menuBtn, { left: 20, bottom: 20 });\n" +
      "ui.widget(centerPanel, { centerX: 0, centerY: 0 });        // 居中\n" +
      "\n" +
      "// 真机: wx.onWindowResize(res => ui.onResize(res.windowWidth, res.windowHeight))\n" +
      "ui.onResize(newW, newH);   // 所有 Widget 自动重算",
    run: function (env) {
      return env.lib().then(function (lib) {
        var THREE = lib.THREE;
        var PORTRAIT = { w: 360, h: 640 };
        var LANDSCAPE = { w: 640, h: 360 };
        var landscape = false;

        var canvas = env.makeCanvas(THREE, PORTRAIT.w, PORTRAIT.h);
        var renderer = env.makeRenderer(THREE, canvas);
        renderer.setClearColor(0x10141c);

        var ui = lib.createUI(THREE, {
          renderer: renderer,
          screenWidth: canvas.width,
          screenHeight: canvas.height,
          createCanvas2D: function () { return document.createElement('canvas'); }
        });

        /* 顶部拉伸横条 */
        var topBar = ui.sprite({ w: 10, h: 90 });
        topBar.setTexture(ui.textures.roundRect(750, 90, { color: 0x1d2430, radius: 0 }));
        ui.root.addChild(topBar);
        ui.widget(topBar, { left: 0, right: 0, top: 0, h: 90 });

        var barTitle = ui.label('顶栏 left+right 拉伸', { size: 30, bold: true });
        ui.root.addChild(barTitle);
        ui.widget(barTitle, { left: 24, top: 24 });

        var orientLabel = ui.label('竖屏 fitWidth', { size: 26, color: 0x4f8cff });
        ui.root.addChild(orientLabel);
        ui.widget(orientLabel, { right: 24, top: 28 });

        /* 四角元素 */
        function cornerChip(text, color) {
          var chip = ui.node();
          chip.setSize(190, 70);
          var bg = ui.sprite({ w: 190, h: 70 });
          bg.setTexture(ui.textures.roundRect(190, 70, { color: color, alpha: 0.9, radius: 14 }));
          chip.addChild(bg);
          var lbl = ui.label(text, { size: 24 });
          lbl.anchorX = 0.5; lbl.anchorY = 0.5;
          lbl.setPosition(95, 35);
          chip.addChild(lbl);
          ui.root.addChild(chip);
          return chip;
        }
        ui.widget(cornerChip('left+top', 0x3b72b0), { left: 20, top: 120 });
        ui.widget(cornerChip('right+top', 0x2f9e68), { right: 20, top: 120 });
        ui.widget(cornerChip('left+bottom', 0x8a5cf6), { left: 20, bottom: 20 });
        ui.widget(cornerChip('right+bottom', 0xd45d79), { right: 20, bottom: 20 });

        /* 中央面板 */
        var center = ui.panel({ w: 420, h: 260 });
        ui.root.addChild(center);
        ui.widget(center, { centerX: 0, centerY: 0 });

        var centerLabel = ui.label('centerX + centerY\n始终居中', { size: 30, wrap: true, maxWidth: 360, align: 'center' });
        ui.root.addChild(centerLabel);
        ui.widget(centerLabel, { centerX: 0, centerY: 0 });

        var sizeLabel = ui.label('', { size: 22, color: 0x8a93a5 });
        ui.root.addChild(sizeLabel);
        ui.widget(sizeLabel, { centerX: 0, bottom: 110 });

        function refreshInfo() {
          orientLabel.setText(ui.view.landscape ? '横屏 fitHeight' : '竖屏 fitWidth');
          sizeLabel.setText('view: ' + Math.round(ui.view.width) + ' × ' + Math.round(ui.view.height) + ' ui 单位');
          if (orientLabel.relayout) { orientLabel.relayout(); }
          if (sizeLabel.relayout) { sizeLabel.relayout(); }
        }
        refreshInfo();

        env.button('切换横/竖屏', function () {
          landscape = !landscape;
          var size = landscape ? LANDSCAPE : PORTRAIT;
          canvas.width = size.w;
          canvas.height = size.h;
          canvas.style.width = size.w + 'px';
          canvas.style.height = size.h + 'px';
          renderer.setSize(size.w, size.h, false);
          ui.onResize(size.w, size.h);   // = wx.onWindowResize
          refreshInfo();
        });
        env.note('模拟 wx.onWindowResize → ui.onResize');

        env.bindTouch(canvas, function (e) { ui.dispatchTouch(e); });

        env.loop(function (dt) {
          renderer.clear();
          ui.render(dt);
        });

        return { dispose: function () { ui.destroy(); } };
      });
    }
  });
})();
