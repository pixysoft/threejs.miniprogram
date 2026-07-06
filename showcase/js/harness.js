/**
 * harness — 演示运行时（浏览器 ↔ 小程序适配层的桥）
 *
 * 职责：
 *   1. 造"伪小程序 canvas"：补 _canvasId / createImage / requestAnimationFrame，
 *      再走真实的 THREE.global.registerCanvas（DOM canvas 的 tagName 是 CANVAS，
 *      adapter 会跳过原型混入，不污染浏览器原型）
 *   2. 鼠标/触摸事件 → wx 触摸结构 { type, touches, changedTouches }，
 *      与小程序页面 bindtouch* → dispatchTouch 完全同路
 *   3. 演示生命周期：切换时停 rAF、销毁 renderer/UI、摘 DOM
 *
 * 内核（libs/three.weapp.js、libs/ui/）不做任何修改。
 */
(function () {
  'use strict';

  var libPromise = null;

  function ensureLib() {
    if (libPromise) { return libPromise; }
    libPromise = Promise.all([
      ShowcaseLoader.commonjs('libs/three.weapp.js'),
      ShowcaseLoader.commonjs('libs/ui/index.js')
    ]).then(function (mods) {
      return { THREE: mods[0], createUI: mods[1].createUI };
    });
    return libPromise;
  }

  var canvasSeq = 0;

  function createEnv(mount, opts) {
    opts = opts || {};
    var env = {
      stage: mount.stage,
      toolbar: mount.toolbar,
      width: opts.width || 375,
      height: opts.height || 600,
      _rafs: [],
      _listeners: [],
      _disposables: []
    };

    env.lib = ensureLib;

    /* ---------- 伪小程序 canvas ---------- */
    env.makeCanvas = function (THREE, w, h) {
      var canvas = document.createElement('canvas');
      canvas.width = w || env.width;
      canvas.height = h || env.height;
      canvas.className = 'demo-canvas';
      canvas._canvasId = 'showcase-' + (++canvasSeq);   // registerCanvas 必需

      canvas.createImage = function () { return new Image(); };
      canvas.requestAnimationFrame = function (cb) { return window.requestAnimationFrame(cb); };
      canvas.cancelAnimationFrame = function (id) { window.cancelAnimationFrame(id); };

      THREE.global.registerCanvas(canvas);
      env.stage.appendChild(canvas);
      env._disposables.push(function () {
        THREE.global.unregisterCanvas(canvas);
        if (canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
      });
      return canvas;
    };

    env.makeRenderer = function (THREE, canvas) {
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setSize(canvas.width, canvas.height, false);
      env._disposables.push(function () { renderer.dispose(); });
      return renderer;
    };

    /* ---------- 帧循环 ---------- */
    env.loop = function (fn) {
      var last = performance.now();
      var slot = { id: 0, dead: false };
      function tick(now) {
        if (slot.dead) { return; }
        var dt = Math.min(100, now - last);
        last = now;
        fn(dt, now);
        slot.id = window.requestAnimationFrame(tick);
      }
      slot.id = window.requestAnimationFrame(tick);
      env._rafs.push(slot);
      return function stop() { slot.dead = true; window.cancelAnimationFrame(slot.id); };
    };

    /* ---------- 鼠标/触摸 → wx 触摸事件 ---------- */
    env.bindTouch = function (canvas, dispatch) {
      var down = false;

      function touchOf(e) {
        var rect = canvas.getBoundingClientRect();
        var cx = e.clientX !== undefined ? e.clientX : (e.touches[0] || e.changedTouches[0]).clientX;
        var cy = e.clientY !== undefined ? e.clientY : (e.touches[0] || e.changedTouches[0]).clientY;
        return {
          identifier: 0,
          x: (cx - rect.left) * (canvas.width / rect.width),
          y: (cy - rect.top) * (canvas.height / rect.height)
        };
      }

      function wxEvent(type, e, ended) {
        var t = touchOf(e);
        return {
          type: type,
          timeStamp: e.timeStamp,
          touches: ended ? [] : [t],
          changedTouches: [t]
        };
      }

      function add(target, evt, fn) {
        target.addEventListener(evt, fn);
        env._listeners.push(function () { target.removeEventListener(evt, fn); });
      }

      add(canvas, 'mousedown', function (e) {
        down = true;
        dispatch(wxEvent('touchstart', e));
        e.preventDefault();
      });
      add(window, 'mousemove', function (e) {
        if (!down) { return; }
        dispatch(wxEvent('touchmove', e));
      });
      add(window, 'mouseup', function (e) {
        if (!down) { return; }
        down = false;
        dispatch(wxEvent('touchend', e, true));
      });

      // 移动浏览器真触摸
      add(canvas, 'touchstart', function (e) {
        dispatch(wxEvent('touchstart', e));
        e.preventDefault();
      });
      add(canvas, 'touchmove', function (e) {
        dispatch(wxEvent('touchmove', e));
        e.preventDefault();
      });
      add(canvas, 'touchend', function (e) {
        dispatch(wxEvent('touchend', e, true));
        e.preventDefault();
      });
    };

    /* ---------- toolbar 快捷按钮 ---------- */
    env.button = function (label, onClick) {
      var btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      env.toolbar.appendChild(btn);
      return btn;
    };

    env.note = function (html) {
      var span = document.createElement('span');
      span.className = 'tool-note';
      span.innerHTML = html;
      env.toolbar.appendChild(span);
      return span;
    };

    env.track = function (disposeFn) { env._disposables.push(disposeFn); };

    /* ---------- 清理 ---------- */
    env._cleanup = function (handle) {
      env._rafs.forEach(function (slot) { slot.dead = true; window.cancelAnimationFrame(slot.id); });
      env._listeners.forEach(function (off) { off(); });
      if (handle && handle.dispose) {
        try { handle.dispose(); } catch (e) { console.warn('demo dispose error', e); }
      }
      env._disposables.forEach(function (fn) {
        try { fn(); } catch (e) { console.warn('cleanup error', e); }
      });
      env._rafs = [];
      env._listeners = [];
      env._disposables = [];
    };

    return env;
  }

  window.ShowcaseHarness = { createEnv: createEnv };
})();
