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
    function recv(txt) { var d; try { d = JSON.parse(txt); } catch (e) { return; } opt.onMessage(d); }
    function topicFor(to) { return opt.role === 'host' ? (to === '*' ? R + 'all' : R + 's/' + to) : R + 'up'; }
    if (LOCAL) {
      var bc = new BroadcastChannel('wb-' + opt.code);
      bc.onmessage = function (e) { if (subs.indexOf(e.data.t) >= 0) recv(e.data.m); };
      api.send = function (d, to) { bc.postMessage({ t: topicFor(to), m: JSON.stringify(d) }); };
      api.close = function () { bc.close(); };
      setTimeout(function () { status('online'); }, 30);
      return api;
    }
    var idx = opt.broker != null ? opt.broker : 0, client = null, tried = 0, ok = false, queue = [];
    function connect() {
      status('connecting');
      client = mqtt.connect(BROKERS[idx], { clientId: 'wb_' + Math.random().toString(16).slice(2, 10), clean: true, connectTimeout: 8000, reconnectPeriod: 2000, keepalive: 30 });
      var timer = setTimeout(function () { if (!ok && opt.broker == null && tried < BROKERS.length - 1) { tried++; try { client.end(true); } catch (e) {} idx = (idx + 1) % BROKERS.length; connect(); } }, 9000);
      client.on('connect', function () {
        clearTimeout(timer); ok = true; api.broker = idx;
        client.subscribe(subs, { qos: 0 }, function () { status('online'); while (queue.length) { var q = queue.shift(); api.send(q[0], q[1]); } });
      });
      client.on('reconnect', function () { status('connecting'); });
      client.on('offline', function () { status('offline'); });
      client.on('error', function () { status('offline'); });
      client.on('message', function (t, m) { recv(m.toString()); });
    }
    api.send = function (d, to) { if (client && client.connected) client.publish(topicFor(to), JSON.stringify(d), { qos: 0 }); else if (queue.length < 200) queue.push([d, to]); };
    api.close = function () { try { client.end(true); } catch (e) {} };
    connect();
    return api;
  }
  return { open: open, code: code, LOCAL: LOCAL };
})();
