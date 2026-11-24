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
    var sent = {}, sentKeys = [];   /* 老師端：最近送出的大訊息分段，學生說漏收時補送 */
    function recv(txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { return; }
      if (d && d.t === '_c') { /* 大訊息分段重組 */
        if (window.__wbDrop && Math.random() < window.__wbDrop) return;   /* 測試用：模擬掉封包 */
        var P = parts[d.k] || (parts[d.k] = { n: d.n, got: 0, a: [], at: Date.now() });
        P.last = Date.now();
        if (P.a[d.i] == null) { P.a[d.i] = d.s; P.got++; }
        if (P.got === P.n) { delete parts[d.k]; recv(P.a.join('')); }
        for (var k in parts) if (Date.now() - parts[k].at > 240000) delete parts[k];
        return;
      }
      if (d && d.t === '_r') { /* 學生說有幾段沒收到：補送 */
        var arr = sent[d.k]; if (!arr || !Array.isArray(d.miss)) return;
        d.miss.slice(0, 80).forEach(function (i, j) { if (arr[i]) later(j, function () { rawSend(topicFor(d.s), arr[i]); }); });
        return;
      }
      opt.onMessage(d);
    }
    var tail = 0;
    /* 大訊息分段慢慢送（約每 25 毫秒一段），免得公共中繼站嫌太快而丟掉 */
    function later(j, fn) { var now = Date.now(); tail = Math.max(tail, now) + 25; var w = tail - now; if (w <= 5) fn(); else setTimeout(fn, w); }
    var rawSend = function () {};
    function retry(pub) {
      if (opt.role === 'host') return null;
      return setInterval(function () {
        for (var k in parts) { var P = parts[k]; if (Date.now() - P.last < 3000) continue; var miss = []; for (var i = 0; i < P.n && miss.length < 80; i++) if (P.a[i] == null) miss.push(i); P.last = Date.now(); if (miss.length) pub(JSON.stringify({ t: '_r', k: k, miss: miss, s: opt.sid })); }
      }, 1500);
    }
    var CH = 48000;
    function pack(d) {
      var m = JSON.stringify(d); if (m.length <= CH) return [m];
      var k = Math.random().toString(36).slice(2, 10), n = Math.ceil(m.length / CH), out = [];
      for (var i = 0; i < n; i++) out.push(JSON.stringify({ t: '_c', k: k, i: i, n: n, s: m.slice(i * CH, (i + 1) * CH) }));
      if (opt.role === 'host') { sent[k] = out; sentKeys.push(k); while (sentKeys.length > 4) delete sent[sentKeys.shift()]; }
      return out;
    }
    function topicFor(to) { return opt.role === 'host' ? (to === '*' ? R + 'all' : R + 's/' + to) : R + 'up'; }
    if (LOCAL) {
      var bc = new BroadcastChannel('wb-' + opt.code);
      bc.onmessage = function (e) { if (subs.indexOf(e.data.t) >= 0) recv(e.data.m); };
      rawSend = function (t, m) { bc.postMessage({ t: t, m: m }); };
      api.send = function (d, to) { var ms = pack(d); ms.forEach(function (m, i) { if (ms.length > 1) later(i, function () { rawSend(topicFor(to), m); }); else rawSend(topicFor(to), m); }); };
      var rt0 = retry(function (m) { rawSend(topicFor('*'), m); });
      api.close = function () { clearInterval(rt0); bc.close(); };
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
      rawSend = function (t, m) { cs.forEach(function (c) { if (c.connected) c.publish(t, m, { qos: 0 }); }); };
      api.send = function (d, to) { var ms = pack(d); ms.forEach(function (m, i) { if (ms.length > 1) later(i, function () { rawSend(topicFor(to), m); }); else rawSend(topicFor(to), m); }); };
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
    rawSend = function (t, m) { client.publish(t, m, { qos: 0 }); };
    api.send = function (d, to) { if (client && client.connected) { var ms = pack(d); ms.forEach(function (m, i) { if (ms.length > 1) later(i, function () { rawSend(topicFor(to), m); }); else rawSend(topicFor(to), m); }); } else if (queue.length < 200) queue.push([d, to]); };
    /* 學生端：大訊息（例如圖片）有幾段沒收到就向老師要 */
    var rt = retry(function (m) { if (client && client.connected) client.publish(topicFor('*'), m, { qos: 0 }); });
    api.close = function () { if (rt) clearInterval(rt); try { client.end(true); } catch (e) {} };
    return api;
  }
  return { open: open, code: code, LOCAL: LOCAL, N: BROKERS.length };
})();
