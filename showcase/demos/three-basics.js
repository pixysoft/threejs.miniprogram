/**
 * 演示 — 3D 基础：three.weapp.js 在浏览器跑通（registerCanvas + 拖拽旋转 + Raycaster）
 */
(function () {
  'use strict';

  Showcase.register({
    id: 'three-basics',
    group: 'three',
    title: '3D 基础渲染',
    menuNote: 'registerCanvas / 拖拽 / Raycaster',
    subtitle: '小程序产物 three.weapp.js 原样运行：registerCanvas 注册伪小程序 canvas，触摸链路与小程序同路',
    width: 640, height: 480,
    desc:
      '<p>拖拽旋转场景；<b>点击立方体</b>触发 Raycaster 命中并随机换色。</p>' +
      '<ul>' +
      '<li>canvas 带 <code>_canvasId</code>，经 <code>THREE.global.registerCanvas()</code> 注册（与小程序完全一致）</li>' +
      '<li>DOM canvas 的 tagName 是 CANVAS，adapter 跳过原型混入，不污染浏览器原型</li>' +
      '<li>鼠标事件 → wx 触摸结构 → 演示内的旋转/点击处理</li>' +
      '</ul>',
    code:
      "const THREE = require('libs/three.weapp.js');\n" +
      "THREE.global.registerCanvas(canvas);   // canvas 需带 _canvasId\n" +
      "const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });\n" +
      "const scene = new THREE.Scene();\n" +
      "const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);\n" +
      "// 触摸: bindtouchstart → 转 wx 结构 → 自定义旋转 / Raycaster 点选\n" +
      "raycaster.setFromCamera(ndc, camera);\n" +
      "const hits = raycaster.intersectObjects(cubes);",
    run: function (env) {
      return env.lib().then(function (lib) {
        var THREE = lib.THREE;
        var canvas = env.makeCanvas(THREE, 640, 480);
        var renderer = env.makeRenderer(THREE, canvas);
        renderer.setClearColor(0x10141c);

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 100);
        camera.position.set(0, 2.4, 6);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.45));
        var dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(3, 5, 4);
        scene.add(dir);

        var pivot = new THREE.Group();
        scene.add(pivot);

        var cubes = [];
        var COLORS = [0x4f8cff, 0x3fb970, 0xe8a33d, 0xd45d79, 0x9b6ef3];
        for (var i = 0; i < 5; i++) {
          var mesh = new THREE.Mesh(
            new THREE.BoxBufferGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: COLORS[i] })
          );
          var a = (i / 5) * Math.PI * 2;
          mesh.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2);
          pivot.add(mesh);
          cubes.push(mesh);
        }
        var ground = new THREE.Mesh(
          new THREE.PlaneBufferGeometry(12, 12),
          new THREE.MeshStandardMaterial({ color: 0x1a2130 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        scene.add(ground);

        // 拖拽旋转 + 点选
        var raycaster = new THREE.Raycaster();
        var down = null;
        var moved = false;

        env.bindTouch(canvas, function (e) {
          var t = e.changedTouches[0];
          if (e.type === 'touchstart') {
            down = { x: t.x, y: t.y };
            moved = false;
          } else if (e.type === 'touchmove' && down) {
            var dx = t.x - down.x;
            var dy = t.y - down.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; }
            pivot.rotation.y += dx * 0.008;
            camera.position.y = Math.max(0.5, Math.min(6, camera.position.y + dy * 0.01));
            camera.lookAt(0, 0, 0);
            down = { x: t.x, y: t.y };
          } else if (e.type === 'touchend') {
            if (down && !moved) {
              var ndc = new THREE.Vector2(
                (t.x / canvas.width) * 2 - 1,
                -(t.y / canvas.height) * 2 + 1
              );
              raycaster.setFromCamera(ndc, camera);
              var hits = raycaster.intersectObjects(cubes);
              if (hits.length) {
                hits[0].object.material.color.setHex(Math.random() * 0xffffff | 0);
              }
            }
            down = null;
          }
        });

        env.note('拖拽旋转 · 点击立方体换色');

        env.loop(function (dt) {
          pivot.rotation.y += dt * 0.0002;
          for (var i = 0; i < cubes.length; i++) {
            cubes[i].rotation.x += dt * 0.0006;
            cubes[i].rotation.y += dt * 0.0004;
          }
          renderer.render(scene, camera);
        });

        return {
          dispose: function () {
            cubes.forEach(function (c) { c.geometry.dispose(); c.material.dispose(); });
            ground.geometry.dispose();
            ground.material.dispose();
          }
        };
      });
    }
  });
})();
