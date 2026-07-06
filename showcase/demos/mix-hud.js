/**
 * 演示 — 3D + UI 混合：双 pass 渲染 + UICoordinateTracker 血条 + HUD
 */
(function () {
  'use strict';

  Showcase.register({
    id: 'mix-hud',
    group: 'mix',
    title: '3D 场景 + HUD + 血条跟踪',
    menuNote: 'OVERLAY 双 pass · UICoordinateTracker',
    subtitle: '对标 Cocos Canvas OVERLAY：先渲染 3D 场景，再渲染 UI 正交相机；血条用 Vector3.project 跟随 3D 单位',
    width: 640, height: 520,
    desc:
      '<ul>' +
      '<li>三个 3D 单位绕场巡游，头顶血条是 <b>UI 层的 ProgressBar</b>，位置由 <code>UICoordinateTracker</code> 每帧投影</li>' +
      '<li>点「攻击」随机单位掉血 + 飘字（tween）；单位转到相机背面时血条自动隐藏</li>' +
      '<li>拖拽 3D 区域旋转相机 —— 触摸先经 <code>ui.dispatchTouch</code>，UI 未消费才透传给 3D（与小程序推荐接法一致）</li>' +
      '</ul>',
    code:
      "// 帧循环: 3D pass → UI pass(不清颜色)\n" +
      "renderer.render(scene3d, camera3d);\n" +
      "ui.render(dt);\n" +
      "\n" +
      "// 血条跟随 3D 单位\n" +
      "const hp = ui.progressBar({ w: 120, h: 16, ratio: 1 });\n" +
      "ui.tracker(unit3d, camera3d, hp, { offsetX: -60, offsetY: -90 });\n" +
      "\n" +
      "// 触摸: UI 优先, 未消费透传 3D\n" +
      "onTouch(e) { if (!ui.dispatchTouch(e)) rotateCamera(e); }",
    run: function (env) {
      return env.lib().then(function (lib) {
        var THREE = lib.THREE;
        var canvas = env.makeCanvas(THREE, 640, 520);
        var renderer = env.makeRenderer(THREE, canvas);
        renderer.setClearColor(0x10141c);

        /* ---------- 3D 场景 ---------- */
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 100);
        var camAngle = 0.6;
        function placeCamera() {
          camera.position.set(Math.sin(camAngle) * 9, 4.5, Math.cos(camAngle) * 9);
          camera.lookAt(0, 0.5, 0);
        }
        placeCamera();

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        var dl = new THREE.DirectionalLight(0xffffff, 0.8);
        dl.position.set(4, 8, 3);
        scene.add(dl);

        var ground = new THREE.Mesh(
          new THREE.CircleBufferGeometry(6, 48),
          new THREE.MeshStandardMaterial({ color: 0x1a2130 })
        );
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        /* ---------- UI ---------- */
        var ui = lib.createUI(THREE, {
          renderer: renderer,
          screenWidth: canvas.width,
          screenHeight: canvas.height,
          createCanvas2D: function () { return document.createElement('canvas'); }
        });

        /* ---------- 单位 + 血条 ---------- */
        var UNIT_DEFS = [
          { color: 0x4f8cff, name: '骑士', speed: 0.0004, radius: 3.4 },
          { color: 0x3fb970, name: '弓手', speed: -0.00055, radius: 2.2 },
          { color: 0xe8a33d, name: '法师', speed: 0.0007, radius: 4.4 }
        ];
        var units = [];

        UNIT_DEFS.forEach(function (def, i) {
          var mesh = new THREE.Mesh(
            new THREE.BoxBufferGeometry(0.8, 1.4, 0.8),
            new THREE.MeshStandardMaterial({ color: def.color })
          );
          mesh.position.y = 0.7;
          scene.add(mesh);

          var hp = ui.progressBar({ w: 130, h: 18, ratio: 1, text: def.name });
          ui.root.addChild(hp);
          var tracker = ui.tracker(mesh, camera, hp, { offsetX: -65, offsetY: -80 });

          units.push({
            def: def, mesh: mesh, hp: hp, tracker: tracker,
            life: 1, phase: i * 2.1
          });
        });

        /* ---------- HUD ---------- */
        var hudTitle = ui.label('战场 HUD', { size: 34, bold: true });
        ui.root.addChild(hudTitle);
        ui.widget(hudTitle, { left: 30, top: 24 });

        var killLabel = ui.label('击倒: 0', { size: 26, color: 0x8a93a5 });
        ui.root.addChild(killLabel);
        ui.widget(killLabel, { right: 30, top: 30 });
        var kills = 0;

        var atkBtn = ui.button('攻击随机单位', {
          w: 320, h: 92,
          onTap: function () {
            var alive = units.filter(function (u) { return u.life > 0; });
            if (!alive.length) {
              units.forEach(function (u) {
                u.life = 1;
                u.hp.setRatio(1);
                u.hp.setText(u.def.name);
              });
              atkBtn.setLabel('攻击随机单位');
              ui.toast.show('全体复活');
              return;
            }
            var u = alive[Math.random() * alive.length | 0];
            var dmg = 0.2 + Math.random() * 0.25;
            u.life = Math.max(0, u.life - dmg);
            u.hp.setRatio(u.life);

            // 飘字
            var fx = ui.label('-' + Math.round(dmg * 100), { size: 34, bold: true, color: 0xff5d6c });
            fx.setPosition(u.hp.x + 40, u.hp.y - 10);
            ui.root.addChild(fx);
            ui.tween(fx).to({ y: fx.y - 70, alpha: 0 }, 700, 'quadOut').call(function () { fx.destroy(); });

            if (u.life <= 0) {
              u.hp.setText('K.O.');
              u.mesh.material.color.setHex(0x333a45);
              kills++;
              killLabel.setText('击倒: ' + kills);
              killLabel.relayout();
              if (units.every(function (x) { return x.life <= 0; })) {
                atkBtn.setLabel('全体复活');
              }
            }
          }
        });
        ui.root.addChild(atkBtn);
        ui.widget(atkBtn, { centerX: 0, bottom: 30 });

        /* ---------- 触摸: UI 优先, 未消费透传 3D ---------- */
        var drag = null;
        env.bindTouch(canvas, function (e) {
          var consumed = ui.dispatchTouch(e);
          var t = e.changedTouches[0];
          if (e.type === 'touchstart') {
            drag = consumed ? null : { x: t.x };
          } else if (e.type === 'touchmove' && drag) {
            camAngle += (t.x - drag.x) * 0.006;
            placeCamera();
            drag = { x: t.x };
          } else if (e.type === 'touchend') {
            drag = null;
          }
        });

        env.note('拖 3D 区域转相机 · 点按钮攻击');

        /* ---------- 帧循环: 双 pass ---------- */
        env.loop(function (dt, now) {
          units.forEach(function (u) {
            if (u.life > 0) {
              u.phase += dt * u.def.speed * 1000;
              u.mesh.position.x = Math.cos(u.phase) * u.def.radius;
              u.mesh.position.z = Math.sin(u.phase) * u.def.radius;
              u.mesh.rotation.y = -u.phase;
            }
          });
          renderer.render(scene, camera);   // 3D pass
          ui.render(dt);                    // UI pass(不清颜色)
        });

        return {
          dispose: function () {
            ui.destroy();
            units.forEach(function (u) { u.mesh.geometry.dispose(); u.mesh.material.dispose(); });
            ground.geometry.dispose();
            ground.material.dispose();
          }
        };
      });
    }
  });
})();
