/**
 * 演示 — UI 容器：ScrollView 惯性/回弹 + 子控件拦截 / List 虚拟化 / PageView / Modal 防穿透
 */
(function () {
  'use strict';

  Showcase.register({
    id: 'ui-containers',
    group: 'ui',
    title: '容器：ScrollView / List / PageView / Modal',
    menuNote: '惯性回弹 · 虚拟化 · 防穿透',
    subtitle: 'ScrollView 手感参数移植 cocos/egret；List 用 EUI DataGroup 复用池滚千条数据',
    width: 400, height: 700,
    desc:
      '<ul>' +
      '<li><b>左列 ScrollView</b>：拖动体验惯性与顶底回弹；列表里的按钮「按下后拖动」会被 cancelPress 拦截 —— 可点可滚互不冲突</li>' +
      '<li><b>右列 List</b>：1000 条数据仅 <b>可视区+2</b> 个实例（顶部计数），clippingPlanes 矩形裁剪</li>' +
      '<li><b>底部 PageView</b>：水平拖动整页磁吸</li>' +
      '<li><b>Modal</b>：工具栏打开，遮罩 blockInput 吞触摸不穿透，点遮罩关闭</li>' +
      '</ul>',
    code:
      "const sv = ui.scrollView({ w: 320, h: 760 });\n" +
      "sv.setContentSize(rows * rowH);   // 内容高\n" +
      "sv.content.addChild(itemButton);  // 子按钮自动被滚动拦截\n" +
      "\n" +
      "const list = ui.list({\n" +
      "  w: 320, h: 760, itemHeight: 96,\n" +
      "  createItem: () => makeRow(),                 // 实例数 = 可视区+2\n" +
      "  updateItem: (node, i, data) => node.bind(data),\n" +
      "});\n" +
      "list.setData(rows1000);\n" +
      "\n" +
      "const modal = ui.modal({ w: 560, h: 400, title: '标题' });\n" +
      "modal.show();   // 遮罩 blockInput, 不穿透到底层",
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

        var view = ui.view;

        /* ================= 左列: ScrollView ================= */
        var svTitle = ui.label('ScrollView', { size: 28, bold: true });
        svTitle.setPosition(30, 24);
        ui.root.addChild(svTitle);

        var svPanel = ui.panel({ w: 330, h: 720 });
        svPanel.setPosition(20, 70);
        ui.root.addChild(svPanel);

        var sv = ui.scrollView({ w: 310, h: 700 });
        sv.setPosition(30, 80);
        ui.root.addChild(sv);

        var ROWS = 30;
        var ROW_H = 100;
        for (var i = 0; i < ROWS; i++) {
          (function (idx) {
            var b = ui.button('条目 ' + (idx + 1), {
              w: 280, h: 84,
              onTap: function () { ui.toast.show('点了条目 ' + (idx + 1)); }
            });
            b.setPosition(8, idx * ROW_H);
            sv.content.addChild(b);
          })(i);
        }
        sv.setContentSize(ROWS * ROW_H);

        /* ================= 右列: List 虚拟化 ================= */
        var listCounter = ui.label('', { size: 22, color: 0x8a93a5 });
        listCounter.setPosition(390, 30);
        ui.root.addChild(listCounter);

        var listTitle = ui.label('List ×1000', { size: 28, bold: true });
        listTitle.setPosition(390, 60);
        ui.root.addChild(listTitle);

        var listPanel = ui.panel({ w: 330, h: 680 });
        listPanel.setPosition(385, 110);
        ui.root.addChild(listPanel);

        var list = ui.list({
          w: 310, h: 660, itemHeight: 88, gap: 8,
          createItem: function () {
            var row = ui.node();
            row.setSize(300, 88);
            var bg = ui.sprite({ w: 300, h: 88 });
            bg.setTexture(ui.textures.roundRect(300, 88, { color: 0x1d2430, radius: 10 }));
            row.addChild(bg);
            row.lbl = ui.label('', { size: 26 });
            row.lbl.setPosition(20, 28);
            row.addChild(row.lbl);
            return row;
          },
          updateItem: function (row, i, data) { row.lbl.setText(data); }
        });
        list.setPosition(395, 120);
        ui.root.addChild(list);

        var data = [];
        for (var d = 0; d < 1000; d++) { data.push('数据行 #' + (d + 1)); }
        list.setData(data);
        listCounter.setText('实例池 ' + list.poolCount() + ' 个 / 数据 1000 条');

        /* ================= 底部: PageView ================= */
        var pvLabel = ui.label('PageView 第 1/3 页(横向拖动)', { size: 24, color: 0x8a93a5 });
        pvLabel.setPosition(30, 830);
        ui.root.addChild(pvLabel);

        var pv = ui.pageView({
          w: 690, h: 280,
          onPage: function (i) { pvLabel.setText('PageView 第 ' + (i + 1) + '/3 页(横向拖动)'); }
        });
        pv.setPosition(30, 870);
        ui.root.addChild(pv);

        var PAGE_COLORS = [0x3b72b0, 0x2f9e68, 0x8a5cf6];
        for (var p = 0; p < 3; p++) {
          var page = ui.node();
          page.setSize(690, 280);
          var bg = ui.sprite({ w: 690, h: 280 });
          bg.setTexture(ui.textures.roundRect(690, 280, { color: PAGE_COLORS[p], alpha: 0.35, radius: 16 }));
          page.addChild(bg);
          var lab = ui.label('Page ' + (p + 1), { size: 56, bold: true });
          lab.anchorX = 0.5;
          lab.anchorY = 0.5;
          lab.setPosition(345, 140);
          page.addChild(lab);
          pv.addPage(page);
        }

        /* ================= Modal ================= */
        var modal = ui.modal({ w: 560, h: 420, title: '弹窗标题' });
        var body = ui.label('遮罩 blockInput 防穿透:\n弹窗打开时点任意处\n都不会触发底层按钮。\n\n点遮罩或 × 关闭。', {
          size: 28, wrap: true, maxWidth: 480
        });
        modal.body.addChild(body);

        env.button('打开 Modal', function () { modal.show(); });
        env.note('列表内按钮: 点=tap, 拖=滚动(cancelPress 拦截)');

        env.bindTouch(canvas, function (e) { ui.dispatchTouch(e); });

        env.loop(function (dt) {
          renderer.clear();
          ui.render(dt);
        });

        return { dispose: function () { modal.destroy(); ui.destroy(); } };
      });
    }
  });
})();
