/**
 * 演示 — P1 体验件：RichLabel 分段富文本 / Atlas 图集帧皮肤 / EditBox 输入框 / ScrollBar
 *
 * EditBox 的键盘在浏览器用悬浮 DOM input 模拟（接口与 wx.showKeyboard 系同形），
 * 小程序侧换成 wx.showKeyboard / wx.onKeyboardInput 即可，组件代码零改动。
 */
(function () {
  'use strict';

  /* 程序化画一张按钮图集(两帧: up/down), 模拟 TexturePacker 产物 */
  function makeAtlasTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;

    function drawBtn(g, x, top, bottom, border) {
      var r = 18, w = 124, h = 60;
      g.save();
      g.translate(x + 2, 2);
      g.beginPath();
      g.moveTo(r, 0);
      g.lineTo(w - r, 0); g.arcTo(w, 0, w, r, r);
      g.lineTo(w, h - r); g.arcTo(w, h, w - r, h, r);
      g.lineTo(r, h); g.arcTo(0, h, 0, h - r, r);
      g.lineTo(0, r); g.arcTo(0, 0, r, 0, r);
      g.closePath();
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = border;
      g.stroke();
      g.restore();
    }

    var g = c.getContext('2d');
    drawBtn(g, 0, '#5fa2ff', '#2b5da8', '#9cc4ff');     // btn_up
    drawBtn(g, 128, '#24457a', '#16294a', '#5fa2ff');   // btn_down

    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  /* 浏览器键盘: 悬浮 DOM input, 接口与 wx.showKeyboard 系同形 */
  function makeBrowserKeyboard(env) {
    var listeners = { input: [], confirm: [], complete: [] };
    var active = false;

    var el = document.createElement('input');
    el.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
      'width:320px;padding:12px 16px;font-size:16px;z-index:99;display:none;' +
      'border-radius:10px;border:1px solid #3b72b0;background:#1b1f29;color:#fff;outline:none;';
    document.body.appendChild(el);
    env.track(function () { if (el.parentNode) { el.parentNode.removeChild(el); } });

    function fire(type, res) {
      listeners[type].slice().forEach(function (fn) { fn(res); });
    }
    function off(type, fn) {
      var i = listeners[type].indexOf(fn);
      if (i !== -1) { listeners[type].splice(i, 1); }
    }
    function hide() {
      if (!active) { return; }
      active = false;
      el.style.display = 'none';
      fire('complete', { value: el.value });
    }

    el.addEventListener('input', function () { fire('input', { value: el.value }); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        fire('confirm', { value: el.value });
        hide();
      }
    });
    el.addEventListener('blur', function () { hide(); });

    return {
      show: function (opts) {
        active = true;
        el.value = opts.defaultValue || '';
        el.maxLength = opts.maxLength || 140;
        el.placeholder = '输入后回车确认(模拟 wx 键盘)';
        el.style.display = 'block';
        setTimeout(function () { el.focus(); }, 0);
      },
      hide: hide,
      onInput: function (fn) { listeners.input.push(fn); },
      offInput: function (fn) { off('input', fn); },
      onConfirm: function (fn) { listeners.confirm.push(fn); },
      offConfirm: function (fn) { off('confirm', fn); },
      onComplete: function (fn) { listeners.complete.push(fn); },
      offComplete: function (fn) { off('complete', fn); }
    };
  }

  Showcase.register({
    id: 'ui-p1',
    group: 'ui',
    title: 'P1 体验件：富文本 / 图集皮肤 / 输入框',
    menuNote: 'RichLabel · Atlas 帧 · EditBox · ScrollBar',
    subtitle: '对齐 Cocos/pixi 的体验补齐：分段富文本、图集帧三态皮肤(缺帧自动回退程序化)、wx 键盘分流输入框、滚动指示条',
    width: 400, height: 700,
    desc:
      '<ul>' +
      '<li><b>RichLabel</b>：分段着色 + 贪心换行(段内不拆字)，「刷新战报」随机重建段落</li>' +
      '<li><b>图集皮肤按钮</b>：皮肤来自程序化图集(模拟 TexturePacker 两帧 + slice 九宫格)，按下切 <code>btn_down</code> 帧；右侧按钮故意配了不存在的帧 → 自动回退程序化圆角</li>' +
      '<li><b>EditBox</b>：点击呼出悬浮输入框(浏览器模拟 wx.showKeyboard)，输入实时上屏，回车确认；两个输入框互斥，密码框打点</li>' +
      '<li><b>List + ScrollBar</b>：拖动列表右缘出现滚动指示条，静止 1s 自动淡出(cocos autoHideTime)</li>' +
      '</ul>',
    code:
      "// 图集: 业务用 TextureLoader 拿到纹理后注册, UI 不做 IO\n" +
      "ui.atlas.addSheet('demo', texture, {\n" +
      "  btn_up:   { x: 0,   y: 0, w: 128, h: 64, slice: [24, 24, 24, 24] },\n" +
      "  btn_down: { x: 128, y: 0, w: 128, h: 64, slice: [24, 24, 24, 24] },\n" +
      "});\n" +
      "ui.button('图集按钮', { skin: { bg: { frame: 'btn_up' }, bgDown: { frame: 'btn_down' } } });\n" +
      "\n" +
      "ui.richLabel([\n" +
      "  { text: '获得 ' }, { text: '×100 金币', color: 0xFFD24D, bold: true },\n" +
      "], { size: 26, wrapWidth: 600 });\n" +
      "\n" +
      "// 小程序: keyboard 传 wx.showKeyboard / wx.onKeyboardInput 封装\n" +
      "const ui = createUI(THREE, { ..., keyboard });\n" +
      "ui.editBox({ w: 560, h: 76, placeholder: '输入昵称', onConfirm: t => save(t) });\n" +
      "\n" +
      "ui.list({ w: 660, h: 420, itemHeight: 84, scrollBar: true, ... });",
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
          createCanvas2D: function () { return document.createElement('canvas'); },
          keyboard: makeBrowserKeyboard(env)
        });

        /* ---- 图集注册 ---- */
        ui.atlas.addSheet('demo', makeAtlasTexture(THREE), {
          btn_up: { x: 0, y: 0, w: 128, h: 64, slice: [24, 24, 24, 24] },
          btn_down: { x: 128, y: 0, w: 128, h: 64, slice: [24, 24, 24, 24] }
        });

        /* ================= RichLabel ================= */
        var t1 = ui.label('RichLabel 分段富文本', { size: 30, bold: true });
        ui.root.addChild(t1);
        ui.widget(t1, { left: 40, top: 28 });

        var REPORTS = [
          [{ text: '击败 ' }, { text: '暗影龙', color: 0xE05B4B, bold: true },
           { text: '，获得 ' }, { text: '×100 金币', color: 0xFFD24D, bold: true },
           { text: ' 与 ' }, { text: '稀有皮肤', color: 0x8A5CF6, bold: true },
           { text: '，连击 ' }, { text: '12 次', color: 0x5CB85C, size: 32, bold: true }],
          [{ text: '任务完成 ' }, { text: '+800 经验', color: 0x5CB85C, bold: true },
           { text: '，排名上升至 ' }, { text: '第 3 名', color: 0xFFD24D, size: 32, bold: true },
           { text: '，继续加油！' }],
          [{ text: '警告：', color: 0xE05B4B, bold: true, size: 30 },
           { text: '体力不足 ' }, { text: '10 点', color: 0xFFD24D, bold: true },
           { text: '，无法进入 ' }, { text: '深渊副本', color: 0x8A5CF6, bold: true }]
        ];
        var reportIdx = 0;
        var rich = ui.richLabel(REPORTS[0], { size: 26, wrapWidth: 600, lineGap: 8 });
        ui.root.addChild(rich);
        ui.widget(rich, { left: 40, top: 84 });

        var refreshBtn = ui.button('刷新战报', {
          w: 200, h: 64,
          onTap: function () {
            reportIdx = (reportIdx + 1) % REPORTS.length;
            rich.setSegments(REPORTS[reportIdx]);
          }
        });
        ui.root.addChild(refreshBtn);
        ui.widget(refreshBtn, { right: 40, top: 24 });

        /* ================= 图集帧皮肤 ================= */
        var t2 = ui.label('Atlas 图集帧皮肤(按下换帧)', { size: 30, bold: true });
        ui.root.addChild(t2);
        ui.widget(t2, { left: 40, top: 220 });

        var frameBtn = ui.button('图集按钮', {
          w: 300, h: 88,
          skin: {
            bg: { frame: 'btn_up' },
            bgDown: { frame: 'btn_down' },
            label: { color: 0xFFFFFF }
          },
          onTap: function () { ui.toast.show('九宫格帧皮肤'); }
        });
        ui.root.addChild(frameBtn);
        ui.widget(frameBtn, { left: 40, top: 274 });

        var fallbackBtn = ui.button('缺帧回退', {
          w: 300, h: 88,
          skin: { bg: { frame: 'btn_missing', color: 0x2F9E68, radius: 0.28 } },
          onTap: function () { ui.toast.show('帧不存在 → 程序化圆角回退'); }
        });
        ui.root.addChild(fallbackBtn);
        ui.widget(fallbackBtn, { right: 40, top: 274 });

        /* ================= EditBox ================= */
        var t3 = ui.label('EditBox(wx.showKeyboard 分流)', { size: 30, bold: true });
        ui.root.addChild(t3);
        ui.widget(t3, { left: 40, top: 404 });

        var nameBox = ui.editBox({
          w: 400, h: 76, placeholder: '点击输入昵称', maxLength: 12,
          onConfirm: function (text) { ui.toast.show('昵称已保存: ' + text); }
        });
        ui.root.addChild(nameBox);
        ui.widget(nameBox, { left: 40, top: 458 });

        var pwdBox = ui.editBox({
          w: 250, h: 76, placeholder: '密码', password: true, maxLength: 8
        });
        ui.root.addChild(pwdBox);
        ui.widget(pwdBox, { right: 40, top: 458 });

        /* ================= List + ScrollBar ================= */
        var t4 = ui.label('List + ScrollBar(静止 1s 淡出)', { size: 30, bold: true });
        ui.root.addChild(t4);
        ui.widget(t4, { left: 40, top: 578 });

        var listPanel = ui.panel({ w: 680, h: 640 });
        ui.root.addChild(listPanel);
        ui.widget(listPanel, { centerX: 0, top: 632 });

        var list = ui.list({
          w: 660, h: 620, itemHeight: 84, gap: 4, scrollBar: true,
          createItem: function () {
            var row = ui.node();
            row.setSize(660, 84);
            var txt = ui.label('', { size: 26 });
            txt.setPosition(28, 26);
            row.addChild(txt);
            row._txt = txt;
            return row;
          },
          updateItem: function (row, i, data) { row._txt.setText(data); }
        });
        var listData = [];
        for (var i = 0; i < 200; i++) { listData.push('战报记录 #' + (i + 1)); }
        list.setData(listData);
        listPanel.addChild(list);
        list.setPosition(10, 10);

        /* ---- 接线 ---- */
        env.bindTouch(canvas, function (e) { ui.dispatchTouch(e); });
        env.note('点输入框呼出悬浮键盘(模拟 wx)，回车确认；拖列表看右缘滚动条');

        env.loop(function (dt) {
          renderer.clear();
          ui.render(dt);
        });

        return { dispose: function () { ui.destroy(); } };
      });
    }
  });
})();
