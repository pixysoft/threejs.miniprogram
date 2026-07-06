/**
 * wx-polyfill — 在浏览器中模拟小程序 wx API（演示站专用，不修改内核）
 *
 * three.weapp.js 内嵌的 miniapp-adapter 在模块求值时就会调用：
 *   wx.getSystemInfoSync / wx.getPerformance / wx.onWindowResize
 *   wx.onShow / wx.onHide / wx.onNetworkStatusChange
 * 运行期还会用到：
 *   wx.request(FileLoader/TextureLoader) / wx.getFileSystemManager(本地路径)
 *   wx.base64ToArrayBuffer / wx.arrayBufferToBase64
 * 全部用浏览器等价物一一承接。platform 返回 'devtools'，
 * 让 adapter 的 performance 走毫秒路径、不去改写 console.time。
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || window.wx) { return; }

  var resizeHandlers = [];
  window.addEventListener('resize', function () {
    var res = { windowWidth: window.innerWidth, windowHeight: window.innerHeight };
    resizeHandlers.forEach(function (fn) { fn(res); });
  });

  window.wx = {
    getSystemInfoSync: function () {
      return {
        platform: 'devtools',
        system: 'browser',
        language: navigator.language || 'zh_CN',
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      };
    },

    getPerformance: function () { return window.performance; },

    onWindowResize: function (fn) { resizeHandlers.push(fn); },

    onShow: function (fn) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { fn(); }
      });
    },
    onHide: function (fn) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { fn(); }
      });
    },
    onNetworkStatusChange: function () {},

    /* FileLoader 相对路径会走这里(小程序本地文件系统); 演示站直接转 fetch */
    getFileSystemManager: function () {
      return {
        readFile: function (opts) {
          fetch(opts.filePath)
            .then(function (resp) {
              if (!resp.ok) { throw new Error('HTTP ' + resp.status); }
              return opts.encoding ? resp.text() : resp.arrayBuffer();
            })
            .then(function (data) { opts.success && opts.success({ data: data }); })
            .catch(function (err) { opts.fail && opts.fail({ errMsg: String(err) }); });
        }
      };
    },

    request: function (opts) {
      opts = opts || {};
      var wantBuffer = opts.responseType === 'arraybuffer' || opts.dataType === 'arraybuffer';
      fetch(opts.url, {
        method: opts.method || 'GET',
        headers: opts.header || undefined,
        body: opts.data !== undefined && opts.method && opts.method !== 'GET' ? opts.data : undefined
      }).then(function (resp) {
        var header = {};
        resp.headers.forEach(function (v, k) { header[k] = v; });
        return (wantBuffer ? resp.arrayBuffer() : resp.text()).then(function (data) {
          opts.success && opts.success({ data: data, statusCode: resp.status, header: header });
        });
      }).catch(function (err) {
        opts.fail && opts.fail({ errMsg: String(err) });
      });
    },

    base64ToArrayBuffer: function (b64) {
      var bin = atob(b64);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) { buf[i] = bin.charCodeAt(i); }
      return buf.buffer;
    },
    arrayBufferToBase64: function (buffer) {
      var bytes = new Uint8Array(buffer);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
      return btoa(bin);
    },

    env: { USER_DATA_PATH: '/tmp' }
  };
})();
