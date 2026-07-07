/**
 * 演示 — P2 性能：UIBatcher 同纹理合批 / CharAtlas 文本图集 / RT 缓存跳 pass
 *
 * 工具栏三个开关实时重建同一场景，右上角实测数据对比:
 *   合批   → UI pass draw call 数骤降(纯色 sprite 全并成 1 段)
 *   缓存   → 静止时每帧只合成 1 张 RT 贴图(重绘计数不再增长)
 *   动画   → 动起来时缓存每帧重绘(演示 cache 的适用边界)
 */
(function () {
  'use strict';

  var GRID_COLORS = [0x4f8cff, 0x3fb970, 0xe8a33d, 0xe05b4b, 0x8a5cf6];

  Showcase.register({
    id: 'ui-p2',
    group: 'ui',
    title: 'P2 性能：合批 / 字符图集 / RT 缓存',
    menuNote: 'UIBatcher · CharAtlas · cache',
    subtitle: '对标 Cocos Batcher2D/DynamicAtlas 的最小实现：210 个方块实测 draw call 与 RT 重绘次数',
    width: 400, height: 700,
    desc:
      '<ul>' +
      '<li><b>合批开关</b>：210 个纯色方块(5 色混排)走 1×1 白纹理 + 顶点色，开合批后 UI pass 从 200+ 次 draw call 并成个位数(树序切段，画序不变)</li>' +
      '<li><b>缓存开关</b>：UI 画进 RenderTarget，静止时「RT 重绘」计数停住，每帧只花 1 次合成 draw call；把「动画」打开可看到重绘计数随帧增长 —— 这就是 cache 只适合静态 HUD 的原因</li>' +
      '<li><b>计分板</b>：<code>label(\'0\', { atlas: true })</code> 走预烘焙字符图集，高频 setText 不再重绘 canvas/重传纹理(cocos DynamicAtlas 思路)</li>' +
      '</ul>' +
      '<p>三个开关任意组合，场景重建但视觉结果完全一致 —— 合批/缓存是纯渲染层优化，不改变画面。</p>',
    code:
      "// 合批与缓存都是 createUI 的可选项, 默认关闭\n" +
      "const ui = createUI(THREE, { ..., batch: true, cache: true });\n" +
      "\n" +
      "// 字符图集: 预烘焙数字, 高频文本 setText 零 canvas 重绘\n" +
      "ui.charAtlas.bake('0123456789', { size: 44, color: 0xFFD24D, bold: true });\n" +
      "const score = ui.label('0', { atlas: true, size: 44, color: 0xFFD24D, bold: true });\n" +
      "score.setText(String(++n));   // 只改顶点/UV\n" +
      "\n" +
      "// 实测: UI pass 的 draw call 数\n" +
      "renderer.clear(); ui.render(dt);\n" +
      "console.log(renderer.info.render.calls);",
    run: function (env) {
      return env.lib().then(function (lib) {
        var THREE = lib.THREE;
        var canvas = env.makeCanvas(THREE, 400, 700);
        var renderer = env.makeRenderer(THREE, canvas);
        renderer.setClearColor(0x10141c);

        // 支持 URL 参数预置开关: ?batch=1&cache=1&anim=0
        var qs = {};
        location.search.replace(/[?&]([^=&]+)=([^&]*)/g, function (m, k, v) { qs[k] = v; });
        var flags = {
          batch: qs.batch === '1',
          cache: qs.cache === '1',
          anim: qs.anim !== '0'
        };
        var state = null;   // { ui, sprites, score, scoreVal, rtRedraws }

        function build() {
          if (state) { state.ui.destroy(); }

          var ui = lib.createUI(THREE, {
            renderer: renderer,
            screenWidth: canvas.width,
            screenHeight: canvas.height,
            createCanvas2D: function () { return document.createElement('canvas'); },
            batch: flags.batch,
            cache: flags.cache
          });

          var title = ui.label('合批: ' + (flags.batch ? '开' : '关') +
            '   缓存: ' + (flags.cache ? '开' : '关'), { size: 30, bold: true });
          ui.root.addChild(title);
          ui.widget(title, { left: 40, top: 28 });

          /* 计分板: CharAtlas 字符图集 */
          ui.charAtlas.bake('0123456789', { size: 44, color: 0xffd24d, bold: true });
          var scoreTag = ui.label('SCORE(字符图集)', { size: 22, color: 0x8a93a5 });
          ui.root.addChild(scoreTag);
          ui.widget(scoreTag, { right: 40, top: 28 });
          var score = ui.label('0', { atlas: true, size: 44, color: 0xffd24d, bold: true });
          ui.root.addChild(score);
          ui.widget(score, { right: 40, top: 60 });

          /* 210 个纯色方块(5 色混排, 合批后 1 段) */
          var sprites = [];
          var COLS = 14, ROWS = 15;
          var cell = 46, gap = 4;
          var originX = (ui.view.width - COLS * (cell + gap)) / 2;
          var originY = 150;
          for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
              var sp = ui.sprite({
                w: cell, h: cell,
                color: GRID_COLORS[(r * COLS + c) % GRID_COLORS.length]
              });
              sp.setPosition(originX + c * (cell + gap), originY + r * (cell + gap));
              sp._baseY = sp.y;
              sp._phase = (r + c) * 0.35;
              ui.root.addChild(sp);
              sprites.push(sp);
            }
          }

          var hint = ui.label('拖动/点击均正常响应(合批不改交互)', { size: 24, color: 0x8a93a5 });
          ui.root.addChild(hint);
          ui.widget(hint, { centerX: 0, bottom: 40 });

          state = { ui: ui, sprites: sprites, score: score, scoreVal: 0, rtRedraws: 0 };
        }

        build();

        /* ---- 工具栏开关 ---- */
        function toggleBtn(name, key) {
          var btn = env.button(name + ': ' + (flags[key] ? '开' : '关'), function () {
            flags[key] = !flags[key];
            btn.textContent = name + ': ' + (flags[key] ? '开' : '关');
            if (key === 'anim') { return; }   // 动画开关不需重建
            build();
          });
        }
        toggleBtn('合批', 'batch');
        toggleBtn('缓存', 'cache');
        toggleBtn('动画', 'anim');
        var stats = env.note('');

        env.bindTouch(canvas, function (e) { state.ui.dispatchTouch(e); });

        /* ---- 帧循环 + 实测统计 ---- */
        var t = 0, statTimer = 0;
        env.loop(function (dt) {
          t += dt;
          var ui = state.ui;

          if (flags.anim) {
            for (var i = 0; i < state.sprites.length; i++) {
              var sp = state.sprites[i];
              sp.y = sp._baseY + Math.sin(t * 0.003 + sp._phase) * 10;
            }
            state.scoreVal += 1;
            state.score.setText(String(state.scoreVal));
          }

          var willRedrawRT = flags.cache && ui.root._dirty;
          renderer.clear();
          ui.render(dt);
          if (willRedrawRT) { state.rtRedraws++; }

          statTimer += dt;
          if (statTimer > 250) {
            statTimer = 0;
            stats.textContent =
              'UI pass draw calls: ' + renderer.info.render.calls +
              (flags.cache ? ' (RT 合成) · RT 重绘累计: ' + state.rtRedraws : '') +
              (flags.batch && state.ui.root.batcher ? ' · 合批段数: ' + state.ui.root.batcher.segmentCount : '');
          }
        });

        return { dispose: function () { if (state) { state.ui.destroy(); } } };
      });
    }
  });
})();
