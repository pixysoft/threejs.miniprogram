/**
 * Theme — JSON 皮肤（对标 pixi Theme, 本质是 cocos 皮肤思想的 JSON 化）
 *
 * 组件按名称键取皮肤: theme.get('Button') / theme.resolve('Button', override)
 * theme.set(json) 深合并进当前主题并通知订阅者(已存在控件重绘)。
 * 第一版全部走程序化纹理, 无图集依赖。
 */

'use strict';

const DEFAULTS = {
    Label:       { color: 0xFFFFFF, size: 28 },
    Panel:       { bg: { color: 0x14171F, alpha: 0.96, radius: 12 } },
    Button:      {
        bg: { color: 0x3B72B0, radius: 0.28 },
        bgDown: null,              // 无独立 down 皮肤 → 缩放 0.95 回退(cocos zoomScale)
        bgDisabled: { color: 0x555A63, radius: 0.28 },
        label: { color: 0xFFFFFF, size: 30 },
        zoomDown: 0.95,
    },
    ProgressBar: {
        bg: { color: 0x2A2E38, radius: 0.5 },
        fill: { color: 0x5CB85C, radius: 0.5 },
        label: { color: 0xFFFFFF, size: 22 },
    },
    Toggle: {
        bgOff: { color: 0x555A63, radius: 0.5 },
        bgOn: { color: 0x5CB85C, radius: 0.5 },
        knob: { color: 0xFFFFFF },
    },
    Slider: {
        track: { color: 0x2A2E38, radius: 0.5 },
        fill: { color: 0x3B72B0, radius: 0.5 },
        knob: { color: 0xFFFFFF },
    },
    TabBar: {
        bg: { color: 0x14171F, radius: 0 },
        item: { color: 0x8A8F99, size: 26 },
        itemActive: { color: 0xFFFFFF, size: 26 },
        indicator: { color: 0x3B72B0, radius: 2 },
    },
    Modal: {
        mask: { color: 0x000000, alpha: 0.6 },
        panel: { color: 0x1B1F29, alpha: 1, radius: 16 },
        title: { color: 0xFFFFFF, size: 32, bold: true },
        close: { color: 0x8A8F99, size: 36 },
    },
    Toast: {
        bg: { color: 0x000000, alpha: 0.75, radius: 0.5 },
        label: { color: 0xFFFFFF, size: 26 },
    },
    EditBox: {
        bg: { color: 0x2A2E38, radius: 8 },
        bgFocus: { color: 0x2A2E38, radius: 8, borderColor: 0x3B72B0, borderWidth: 2 },
        text: { color: 0xFFFFFF, size: 26 },
        placeholder: { color: 0x8A8F99, size: 26 },
    },
    ScrollBar: {
        bar: { color: 0xFFFFFF, alpha: 0.35, radius: 3 },
    },
};

function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(dst, src) {
    for (const key in src) {
        if (isPlainObject(src[key]) && isPlainObject(dst[key])) {
            deepMerge(dst[key], src[key]);
        } else {
            dst[key] = src[key];
        }
    }
    return dst;
}

function deepClone(obj) {
    if (!isPlainObject(obj)) return obj;
    const out = {};
    for (const key in obj) out[key] = isPlainObject(obj[key]) ? deepClone(obj[key]) : obj[key];
    return out;
}

function Theme() {
    this._data = deepClone(DEFAULTS);
    this._subscribers = [];
}

Theme.prototype.get = function (name) {
    return this._data[name] || {};
};

/** 实例级覆盖: 皮肤 = 主题[name] ⊕ override */
Theme.prototype.resolve = function (name, override) {
    const base = deepClone(this.get(name));
    return override ? deepMerge(base, deepClone(override)) : base;
};

/** 深合并进当前主题并通知订阅控件 */
Theme.prototype.set = function (json) {
    deepMerge(this._data, deepClone(json || {}));
    const subs = this._subscribers.slice();
    for (let i = 0; i < subs.length; i++) subs[i]();
};

Theme.prototype.subscribe = function (fn) {
    this._subscribers.push(fn);
    const self = this;
    return function unsubscribe() {
        const i = self._subscribers.indexOf(fn);
        if (i !== -1) self._subscribers.splice(i, 1);
    };
};

module.exports = Theme;
