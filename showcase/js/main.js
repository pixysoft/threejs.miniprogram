/**
 * main — 演示站主壳：左侧菜单 / 右侧演示区 + 概述页 + hash 路由
 */
(function () {
  'use strict';

  var demos = [];
  var demosById = {};

  window.Showcase = {
    register: function (demo) {
      demos.push(demo);
      demosById[demo.id] = demo;
    }
  };

  var GROUPS = [
    { key: 'three', label: '3D 渲染', tag: 'three.weapp', tagClass: 'core' },
    { key: 'ui', label: '2D UI 层', tag: 'three-ui', tagClass: 'fw' },
    { key: 'mix', label: '3D + UI 混合', tag: 'overlay', tagClass: 'mix' }
  ];

  var current = null;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined) { e.innerHTML = html; }
    return e;
  }

  function buildMenu() {
    var menu = document.getElementById('menu');
    var home = el('button', 'item home');
    home.innerHTML = '总览';
    home.addEventListener('click', function () { location.hash = ''; });
    menu.appendChild(home);

    GROUPS.forEach(function (g) {
      var title = el('div', 'group-title',
        g.label + ' <span class="tag ' + g.tagClass + '">' + g.tag + '</span>');
      menu.appendChild(title);
      demos.filter(function (d) { return d.group === g.key; }).forEach(function (d) {
        var btn = el('button', 'item');
        btn.innerHTML = d.title + (d.menuNote ? '<small>' + d.menuNote + '</small>' : '');
        btn.dataset.demo = d.id;
        btn.addEventListener('click', function () { location.hash = '#' + d.id; });
        menu.appendChild(btn);
      });
    });
  }

  function markActive(id) {
    var items = document.querySelectorAll('#menu .item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].dataset.demo === id);
    }
  }

  function teardown() {
    if (current && current.env) {
      current.env._cleanup(current.handle);
    }
    current = null;
  }

  function showDemo(demo) {
    teardown();
    markActive(demo.id);
    var content = document.getElementById('content');
    content.innerHTML = '';
    content.scrollTop = 0;

    content.appendChild(el('h2', 'demo-title', demo.title));
    if (demo.subtitle) { content.appendChild(el('div', 'demo-subtitle', demo.subtitle)); }

    var toolbar = el('div', '');
    toolbar.id = 'toolbar';
    content.appendChild(toolbar);

    var stage = el('div', '');
    stage.id = 'stage';
    content.appendChild(stage);

    if (demo.desc) {
      content.appendChild(el('div', 'section-label', '使用说明'));
      var doc = el('div', '');
      doc.id = 'doc';
      doc.innerHTML = demo.desc;
      content.appendChild(doc);
    }

    if (demo.code) {
      content.appendChild(el('div', 'section-label', '代码片段'));
      var codeBox = el('div', '');
      codeBox.id = 'code';
      var pre = document.createElement('pre');
      pre.textContent = demo.code.trim();
      codeBox.appendChild(pre);
      content.appendChild(codeBox);
    }

    var env = ShowcaseHarness.createEnv(
      { stage: stage, toolbar: toolbar },
      { width: demo.width, height: demo.height }
    );
    current = { demo: demo, env: env, handle: null };

    Promise.resolve()
      .then(function () { return demo.run(env); })
      .then(function (handle) {
        if (current && current.env === env) {
          current.handle = handle || null;
        } else if (handle) {
          env._cleanup(handle);
        }
      })
      .catch(function (err) {
        console.error('[showcase] demo failed', err);
        stage.appendChild(el('div', 'error-box',
          '<b>演示初始化失败</b><br>' + String(err && err.message || err) +
          '<br><span style="color:var(--text-dim)">请查看浏览器控制台；单个演示失败不影响其他演示。</span>'));
      });
  }

  function showHome() {
    teardown();
    markActive(null);
    var content = document.getElementById('content');
    content.innerHTML =
      '<h2 class="demo-title">threejs.miniprogram Showcase</h2>' +
      '<div class="demo-subtitle">微信小程序版 Three.js（r110 + miniapp-adapter）+ three-ui 2D UI 层 · PC 演示站</div>' +
      '<div id="doc">' +
      '<p>本站把小程序产物 <code>build/three.weapp.js</code> 与 <code>ui/</code> <b>零修改</b>搬进浏览器演示：</p>' +
      '<ul>' +
      '<li><b>js/wx-polyfill.js</b> — 模拟 wx.*（系统信息 / performance / request / 文件系统转 fetch）</li>' +
      '<li><b>js/loader.js</b> — 迷你 CommonJS 加载器，支持 ui/ 多文件相对 require</li>' +
      '<li><b>js/harness.js</b> — 伪小程序 canvas（_canvasId / createImage / rAF）+ 鼠标→wx 触摸桥 + 生命周期</li>' +
      '</ul>' +
      '<p>触摸链路与小程序完全同路：鼠标事件被转成 <code>{ touches, changedTouches }</code> 结构，' +
      '先经 <code>ui.dispatchTouch(e)</code>，UI 未消费再透传给 3D 控制（与小程序页面 bindtouch* 的推荐接法一致）。</p>' +
      '<p>UI 架构对标 Cocos Creator（Canvas OVERLAY / UITransform / Widget / ScrollView 体系），' +
      '实现细节参考 pixi-miniprogram framework。设计文档见 <code>docs/fable5/three-ui-design.md</code>。</p>' +
      '<p>从左侧选择演示开始。</p>' +
      '</div>';
  }

  function route() {
    var id = location.hash.replace('#', '');
    if (id && demosById[id]) {
      showDemo(demosById[id]);
    } else {
      showHome();
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', function () {
    buildMenu();
    route();
  });
})();
