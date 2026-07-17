/**
 * 高德地图 AMap Mock —— 用于在 E2E 测试中替代 CDN 脚本。
 *
 * <p>通过 {@code page.addInitScript} 在页面加载前注入，
 * 记录所有关键操作（Marker 创建/销毁、setCenter 调用、setFitView 调用），
 * 使测试能够确定性验证 {@code CheckinMap.tsx} 的 bug-fix 行为。
 *
 * <p>在 window 上暴露 {@code __AMAP_MOCK__} 状态对象供测试断言。
 */

export const AMAP_MOCK_JS = `
(function () {
  'use strict';

  // Marker 实例计数器，每个 Marker 实例拥有唯一 id，用于区分身份保留 vs 重建。
  var _nextMarkerId = 1;
  var _nextMapId = 1;
  var _nextPolylineId = 1;

  function _positionKey(pos) {
    if (!pos) return 'null';
    return pos[0] + ',' + pos[1];
  }

  function MockMarker(opts) {
    opts = opts || {};
    this._id = _nextMarkerId++;
    this._isMarker = true;
    this._position = opts.position ? opts.position.slice() : [0, 0];
    this._title = opts.title || '';
    this._draggable = !!opts.draggable;
    this._cursor = opts.cursor || 'pointer';
    this._clickHandlers = [];
    this._dragEndHandlers = [];
    this._top = false;
    // 内容文字（HTML 字符串），用于状态图标就地更新检测
    this._content = opts.content || '<div></div>';
    // 附加 label（圆形序号徽章），由父级组件通过 setLabel 设定
    this._label = null;
  }
  MockMarker.prototype.on = function (evt, cb) {
    if (evt === 'click') this._clickHandlers.push(cb);
    else if (evt === 'dragend') this._dragEndHandlers.push(cb);
    return this;
  };
  MockMarker.prototype.off = function () {
    this._clickHandlers = [];
    this._dragEndHandlers = [];
    return this;
  };
  MockMarker.prototype.getPosition = function () {
    return { lng: this._position[0], lat: this._position[1] };
  };
  MockMarker.prototype.setPosition = function (pos) {
    this._position = pos ? pos.slice() : [0, 0];
    __AMAP_MOCK__.moves.push({ id: this._id, to: _positionKey(pos) });
    return this;
  };
  MockMarker.prototype.setTop = function (v) {
    this._top = !!v;
    return this;
  };
  MockMarker.prototype.setDraggable = function (v) {
    this._draggable = !!v;
    return this;
  };
  MockMarker.prototype.setContent = function (html) {
    this._content = html;
    __AMAP_MOCK__.setContentCalls.push({ id: this._id, html: html });
    return this;
  };
  MockMarker.prototype.getContent = function () {
    return this._content;
  };
  MockMarker.prototype.setLabel = function (opts) {
    this._label = opts || null;
    __AMAP_MOCK__.setLabelCalls.push({ id: this._id, opts: opts || null });
    return this;
  };
  MockMarker.prototype.getLabel = function () {
    return this._label;
  };
  MockMarker.prototype.setIcon = function () { return this; };
  MockMarker.prototype.setOffset = function () { return this; };
  // 便利方法：测试触发点击
  MockMarker.prototype.__emitClick = function () {
    var self = this;
    this._clickHandlers.forEach(function (h) { h({ target: self, type: 'click' }); });
  };
  MockMarker.prototype.__emitDragEnd = function (lnglat) {
    var self = this;
    this._dragEndHandlers.forEach(function (h) {
      h({ target: self, type: 'dragend', lnglat: lnglat });
    });
  };

  function MockMap(el, opts) {
    this._id = _nextMapId++;
    this._el = el;
    this._opts = opts || {};
    this._overlays = new Set();
    this._destroyed = false;
    this._listeners = [];
    // 暴露确定性的地图就绪信号，E2E 可等待真实实例创建，而不是猜测 SDK 初始化耗时。
    if (this._el) this._el.setAttribute('data-amap-ready', 'true');
  }
  MockMap.prototype.on = function (evt, cb) {
    if (evt !== 'click' || !this._el || typeof cb !== 'function') return this;
    var self = this;
    var listener = function () {
      var center = self._opts.center || [104.06, 30.67];
      cb({ lnglat: { lng: center[0], lat: center[1] }, type: 'click', target: self });
    };
    this._el.addEventListener('click', listener);
    this._listeners.push({ evt: evt, listener: listener });
    return this;
  };
  MockMap.prototype.off = function () {
    var self = this;
    this._listeners.forEach(function (entry) {
      self._el.removeEventListener(entry.evt, entry.listener);
    });
    this._listeners = [];
    return this;
  };
  MockMap.prototype.add = function (overlay) {
    this._overlays.add(overlay);
    // 记录覆盖物归属，Strict Mode 销毁首轮地图时可同步清理对应探针数据。
    overlay.__mapId = this._id;
    // 仅记录 Marker 操作（通过 _isMarker 标记区分 Polyline）
    if (overlay._isMarker) {
      __AMAP_MOCK__.addCalls.push(overlay._id);
    }
    return this;
  };
  MockMap.prototype.remove = function (overlay) {
    this._overlays.delete(overlay);
    if (overlay._isMarker) {
      __AMAP_MOCK__.removeCalls.push(overlay._id);
    }
    return this;
  };
  MockMap.prototype.setCenter = function (pos) {
    __AMAP_MOCK__.setCenterCalls.push(pos ? _positionKey(pos) : null);
    return this;
  };
  MockMap.prototype.setFitView = function (overlays) {
    var coordinates = [];
    if (Array.isArray(overlays)) {
      overlays.forEach(function (overlay) {
        if (overlay && Array.isArray(overlay._position)) {
          coordinates.push(_positionKey(overlay._position));
        }
        var path = overlay && overlay._opts && overlay._opts.path;
        if (Array.isArray(path)) {
          path.forEach(function (position) {
            coordinates.push(_positionKey(position));
          });
        }
      });
    }
    __AMAP_MOCK__.setFitViewCalls.push({
      t: Date.now(),
      overlayCount: Array.isArray(overlays) ? overlays.length : null,
      coordinates: coordinates
    });
    return this;
  };
  MockMap.prototype.setZoom = function () { return this; };
  MockMap.prototype.getZoom = function () { return 14; };
  MockMap.prototype.destroy = function () {
    this.off();
    this._destroyed = true;
    if (this._el) this._el.removeAttribute('data-amap-ready');
    // React Strict Mode 会执行一次 setup → cleanup → setup。销毁地图后，首轮
    // 覆盖物已不再是活动实例，探针也应移除它们，避免把资源释放误判为重复渲染。
    var mapId = this._id;
    var markerIds = __AMAP_MOCK__.markers
      .filter(function (marker) { return marker.__mapId === mapId; })
      .map(function (marker) { return marker._id; });
    __AMAP_MOCK__.markers = __AMAP_MOCK__.markers
      .filter(function (marker) { return marker.__mapId !== mapId; });
    __AMAP_MOCK__.texts = __AMAP_MOCK__.texts
      .filter(function (text) { return text.__mapId !== mapId; });
    __AMAP_MOCK__.addCalls = __AMAP_MOCK__.addCalls
      .filter(function (id) { return markerIds.indexOf(id) === -1; });
    __AMAP_MOCK__.removeCalls = __AMAP_MOCK__.removeCalls
      .filter(function (id) { return markerIds.indexOf(id) === -1; });
    this._overlays.clear();
    return this;
  };

  function MockPolyline(opts) {
    this._id = _nextPolylineId++;
    this._opts = opts || {};
  }

  var _nextTextId = 1;
  function MockText(opts) {
    this._id = _nextTextId++;
    this._isText = true;
    this._opts = opts || {};
    this._text = opts.text || '';
    this._position = opts.position ? opts.position.slice() : [0, 0];
  }
  MockText.prototype.setText = function (s) { this._text = s; return this; };
  MockText.prototype.getText = function () { return this._text; };

  function MockScale() {}
  function MockToolBar() {}

  function MockInfoWindow(opts) {
    this._opts = opts || {};
    this._content = '';
    this._opened = false;
  }
  MockInfoWindow.prototype.setContent = function (content) {
    this._content = content;
    return this;
  };
  MockInfoWindow.prototype.open = function () {
    this._opened = true;
    return this;
  };
  MockInfoWindow.prototype.close = function () {
    this._opened = false;
    return this;
  };

  // 简易逆地理编码 Mock：根据坐标返回预设地址表中的地址；不在表中则返回通用占位
  var _geocodeResults = {};
  function MockGeocoder(opts) {
    this._opts = opts || {};
  }
  MockGeocoder.prototype.getAddress = function (lnglat, cb) {
    var key = lnglat ? lnglat[0] + ',' + lnglat[1] : '';
    var addr = _geocodeResults[key];
    if (!addr) {
      // 通用兜底格式：用经纬度反推"XX市XX区(经纬度)"
      addr = '中国 (' + lnglat[1].toFixed(4) + ', ' + lnglat[0].toFixed(4) + ')';
    }
    if (typeof cb === 'function') {
      setTimeout(function () {
        cb('complete', { regeocode: { formattedAddress: addr } });
      }, 10);
    }
    return this;
  };
  MockGeocoder.prototype.setCity = function (c) { this._opts.city = c; return this; };

  window.__AMAP_MOCK__ = {
    mapCount: 0,
    map: null,            // 当前地图实例（用于查询 _overlays 大小）
    markers: [],          // 当前地图生命周期内创建的 marker 实例（按创建顺序）
    texts: [],            // 所有创建过的 Text 实例（路线交通工具标注）
    addCalls: [],         // 每次 map.add(overlay) 时记录 overlay._id
    removeCalls: [],      // 每次 map.remove(overlay) 时记录 overlay._id
    setCenterCalls: [],   // 每次 setCenter 调用记录
    setFitViewCalls: [],  // 每次 setFitView 调用记录
    setContentCalls: [],  // 每次 marker.setContent 调用记录 { id, html }
    setLabelCalls: [],    // 每次 marker.setLabel 调用记录 { id, opts }
    geocoderResults: _geocodeResults,
    setGeocodeResult: function (lng, lat, addr) {
      _geocodeResults[lng + ',' + lat] = addr;
    },
    reset: function () {
      _nextMarkerId = 1;
      _nextMapId = 1;
      _nextPolylineId = 1;
      _nextTextId = 1;
      _geocodeResults = {};
      window.__AMAP_MOCK__.mapCount = 0;
      window.__AMAP_MOCK__.markers = [];
      window.__AMAP_MOCK__.texts = [];
      window.__AMAP_MOCK__.addCalls = [];
      window.__AMAP_MOCK__.removeCalls = [];
      window.__AMAP_MOCK__.setCenterCalls = [];
      window.__AMAP_MOCK__.setFitViewCalls = [];
      window.__AMAP_MOCK__.setContentCalls = [];
      window.__AMAP_MOCK__.setLabelCalls = [];
    }
  };

  window.AMap = {
    Map: function (el, opts) {
      var m = new MockMap(el, opts);
      window.__AMAP_MOCK__.mapCount++;
      window.__AMAP_MOCK__.map = m;
      return m;
    },
    Marker: function (opts) {
      var mk = new MockMarker(opts);
      window.__AMAP_MOCK__.markers.push(mk);
      return mk;
    },
    Polyline: function (opts) { return new MockPolyline(opts); },
    Text: function (opts) {
      var t = new MockText(opts);
      __AMAP_MOCK__.texts.push(t);
      return t;
    },
    Scale: MockScale,
    ToolBar: MockToolBar,
    InfoWindow: MockInfoWindow,
    Geocoder: MockGeocoder,
    Pixel: function (x, y) { this.x = x; this.y = y; },
    Size: function (w, h) { this.width = w; this.height = h; }
  };

  // 确保 useAMapLoader 检测到核心与插件均已就绪，跳过 CDN 请求。
  window.__AMAP_PLUGINS_READY__ = true;
  if (typeof window.__AMAP_MOCK_LOADED__ === 'undefined') {
    window.__AMAP_MOCK_LOADED__ = true;
  }
  console.log('[AMap Mock] injected, window.AMap =', typeof window.AMap);
})();
`;
