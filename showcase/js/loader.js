/**
 * loader — 迷你 CommonJS 加载器（支持多文件相对 require）
 *
 * 与 pixi showcase 的单文件 loader 不同，本仓库的 ui/ 是多文件 CommonJS
 * （require('./core/View') 等），因此：
 *   1. fetch 源码后先正则扫描相对 require 依赖，递归预载；
 *   2. 执行时注入同步 require，从缓存取已加载模块。
 * 仅解析 './' '../' 开头的路径（three.weapp.js 是自包含 UMD，无相对依赖）。
 */
(function () {
  'use strict';

  var moduleCache = {};   // url → module.exports
  var loading = {};       // url → Promise

  function normalize(url) {
    var u = new URL(url, document.baseURI);
    var path = u.pathname;
    if (!/\.js$/.test(path)) { path += '.js'; }
    return path;
  }

  function scanDeps(code) {
    var deps = [];
    var re = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(code)) !== null) {
      if (deps.indexOf(m[1]) === -1) { deps.push(m[1]); }
    }
    return deps;
  }

  function loadModule(url) {
    var path = normalize(url);
    if (loading[path]) { return loading[path]; }

    loading[path] = fetch(path)
      .then(function (resp) {
        if (!resp.ok) { throw new Error('load failed: ' + path + ' (' + resp.status + ')'); }
        return resp.text();
      })
      .then(function (code) {
        var deps = scanDeps(code);
        var base = 'http://x' + path;   // 仅用于相对解析
        return Promise.all(deps.map(function (dep) {
          return loadModule(new URL(dep, base).pathname);
        })).then(function () {
          return execute(path, code, base);
        });
      });
    return loading[path];
  }

  function execute(path, code, base) {
    if (moduleCache[path]) { return moduleCache[path]; }
    var module = { exports: {} };
    moduleCache[path] = module.exports;   // 先占位(容忍环引用)

    var requireSync = function (dep) {
      var depPath = normalize(new URL(dep, base).pathname);
      if (!(depPath in moduleCache)) {
        throw new Error('module not preloaded: ' + dep + ' (from ' + path + ')');
      }
      return moduleCache[depPath];
    };

    var fn = new Function('module', 'exports', 'require', code + '\n//# sourceURL=' + path);
    fn.call(window, module, module.exports, requireSync);
    moduleCache[path] = module.exports;
    return module.exports;
  }

  window.ShowcaseLoader = { commonjs: loadModule };
})();
