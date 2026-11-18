/* 共用畫板連線：免費公開 MQTT 中繼站（不需帳號）。網址加 ?local=1 改用同電腦分頁互傳（測試用）。
   主題：<房>/up 學生→老師；<房>/all 老師→全部學生；<房>/s/<學號> 老師→某位學生 */
window.WBNet = (function () {
  'use strict';
  var BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  var PREFIX = 'classwb-andice0107/';
  var LOCAL = /[?&]local=1/.test(location.search);
  function code() { var s = '' + (1 + Math.floor(Math.random() * 9)); for (var i = 0; i < 5; i++) s += Math.floor(Math.random() * 10); return s; }
  /* opt: {code, role:'host'|'student', sid, broker, onMessage(d), onStatus(s)} */
  function open(opt) {
    var R = PREFIX + opt.code + '/';
    var subs = opt.role === 'host' ? [R + 'up'] : [R + 'all', R + 's/' + opt.sid];
    var api = { broker: 0 }, status = opt.onStatus || function () {};
    var parts = {};
    function recv(txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { return; }
      if (d && d.t === '_c') { /* 大訊息分段重組 */
        var P = parts[d.k] || (parts[d.k] = { n: d.n, got: 0, a: [], at: Date.now() });
        if (P.a[d.i] == null) { P.a[d.i] = d.s; P.got++; }
        if (P.got === P.n) { delete parts[d.k]; recv(P.a.join('')); }
        for (var k in parts) if (Date.now() - parts[k].at > 60000) delete parts[k];
        return;
      }
      opt.onMessage(d);
    }
    var CH = 48000;
    function pack(d) {
      var m = JSON.stringify(d); if (m.length <= CH) return [m];
      var k = Math.random().toString(36).slice(2, 10), n = Math.ceil(m.length / CH), out = [];
      for (var i = 0; i < n; i++) out.push(JSON.stringify({ t: '_c', k: k, i: i, n: n, s: m.slice(i * CH, (i + 1) * CH) }));
      return out;
    }
    function topicFor(to) { return opt.role === 'host' ? (to === '*' ? R + 'all' : R + 's/' + to) : R + 'up'; }
    if (LOCAL) {
      var bc = new BroadcastChannel('wb-' + opt.code);
      bc.onmessage = function (e) { if (subs.indexOf(e.data.t) >= 0) recv(e.data.m); };
      api.send = function (d, to) { pack(d).forEach(function (m) { bc.postMessage({ t: topicFor(to), m: m }); }); };
      api.close = function () { bc.close(); };
      setTimeout(function () { status('online'); }, 30);
      return api;
    }
    /* 老師端同時連上所有中繼站，哪一條線的學生都收得到；學生端只連一條 */
    if (opt.role === 'host') {
      var cs = BROKERS.map(function (url, i) {
        var c = mqtt.connect(url, { clientId: 'wbh_' + Math.random().toString(16).slice(2, 10), clean: true, connectTimeout: 20000, reconnectPeriod: 3000, keepalive: 30 });
        c.on('connect', function () { c.subscribe(subs, { qos: 0 }, function () { upd(); if (opt.onLine) opt.onLine(i); }); });
        ['reconnect', 'offline', 'error', 'close'].forEach(function (ev) { c.on(ev, upd); });
        c.on('message', function (t, m) { recv(m.toString()); });
        return c;
      });
      var last = '';
      function upd() { var n = cs.filter(function (c) { return c.connected; }).length, s = n ? 'online' : 'connecting'; api.lines = n; if (s !== last || true) { last = s; status(s); } }
      api.send = function (d, to) { var ms = pack(d); cs.forEach(function (c) { if (c.connected) ms.forEach(function (m) { c.publish(topicFor(to), m, { qos: 0 }); }); }); };
      api.close = function () { cs.forEach(function (c) { try { c.end(true); } catch (e) {} }); };
      status('connecting');
      return api;
    }
    var idx = opt.broker != null ? opt.broker : 0, client = null, queue = [];
    api.broker = idx;
    status('connecting');
    client = mqtt.connect(BROKERS[idx], { clientId: 'wb_' + Math.random().toString(16).slice(2, 10), clean: true, connectTimeout: 20000, reconnectPeriod: 2000, keepalive: 30 });
    client.on('connect', function () {
      client.subscribe(subs, { qos: 0 }, function () { status('online'); while (queue.length) { var q = queue.shift(); api.send(q[0], q[1]); } });
    });
    client.on('reconnect', function () { status('connecting'); });
    client.on('offline', function () { status('offline'); });
    client.on('error', function () { status('offline'); });
    client.on('message', function (t, m) { recv(m.toString()); });
    api.send = function (d, to) { if (client && client.connected) pack(d).forEach(function (m) { client.publish(topicFor(to), m, { qos: 0 }); }); else if (queue.length < 200) queue.push([d, to]); };
    api.close = function () { try { client.end(true); } catch (e) {} };
    return api;
  }
  return { open: open, code: code, LOCAL: LOCAL, N: BROKERS.length };
})();
