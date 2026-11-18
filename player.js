/* 共用畫板・學生端 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'wb-stu-v1';
  function hashArg(k) { var m = location.hash.match(new RegExp('[#&]' + k + '=([^&]+)')); return m ? decodeURIComponent(m[1]) : null; }
  var broker = hashArg('b'); broker = broker == null ? null : (+broker || 0);
  var store = WBNet.LOCAL ? sessionStorage : localStorage; /* 測試模式各分頁各自記 */
  var me = {}; try { me = JSON.parse(store.getItem(KEY)) || {}; } catch (e) {}
  var net = null, V = null, joined = false, joinT = null, pingT = null, cur = { editable: false, title: '' };
  var tool = { mode: 'pen', color: '#111111', width: 4 };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(cls, html, fn) { var b = el('button', cls, html); b.onclick = fn; return b; }
  function toast(t) { var x = $('toast'); x.textContent = t; x.classList.add('on'); clearTimeout(x._t); x._t = setTimeout(function () { x.classList.remove('on'); }, 2600); }
  function saveMe() { try { store.setItem(KEY, JSON.stringify(me)); } catch (e) {} }
  function digits(inp, max) {
    function f() { var v = inp.value.replace(/\D/g, '').slice(0, max); if (v !== inp.value) { inp.value = v; inp.classList.add('shake'); setTimeout(function () { inp.classList.remove('shake'); }, 300); } }
    inp.addEventListener('input', function (e) { if (!e.isComposing) f(); });
    inp.addEventListener('compositionend', f);
    inp.addEventListener('keydown', function (e) { if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); });
  }

  /* ---------- 加入畫面 ---------- */
  function joinScreen(msg) {
    stop();
    var app = $('app'); app.innerHTML = ''; app.className = 'join-wrap';
    var card = el('div', 'join-card');
    card.appendChild(el('div', 'join-logo', '🖍️'));
    card.appendChild(el('h1', '', '加入共用畫板'));
    if (msg) card.appendChild(el('div', 'join-err', msg));
    card.appendChild(el('label', '', '教室代碼（看大螢幕）'));
    var ci = el('input', 'big-in'); ci.inputMode = 'numeric'; ci.pattern = '[0-9]*'; ci.autocomplete = 'off'; ci.maxLength = 6; ci.placeholder = '6 位數字'; ci.value = me.code || ''; digits(ci, 6);
    card.appendChild(ci);
    card.appendChild(el('label', '', '我的學號（只能打數字，最多 6 位）'));
    var si = el('input', 'big-in'); si.inputMode = 'numeric'; si.pattern = '[0-9]*'; si.autocomplete = 'off'; si.maxLength = 6; si.placeholder = '例如 4506'; si.value = me.sid || ''; digits(si, 6);
    card.appendChild(si);
    var go = btn('btn primary big', '進入教室 ➜', function () {
      var c = ci.value, s = si.value;
      if (!/^\d{6}$/.test(c)) { toast('教室代碼是 6 位數字'); ci.focus(); return; }
      if (!/^\d{1,6}$/.test(s)) { toast('請輸入學號（只能是數字）'); si.focus(); return; }
      if (me.code !== c || me.sid !== s) me.cid = null;
      me.code = c; me.sid = s; if (!me.cid) me.cid = Math.random().toString(36).slice(2, 10); saveMe();
      connect();
    });
    card.appendChild(go);
    [ci, si].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); }); });
    app.appendChild(card);
    setTimeout(function () { (ci.value ? si : ci).focus(); }, 50);
  }
  function waitScreen(t) {
    var app = $('app'); app.innerHTML = ''; app.className = 'join-wrap';
    var card = el('div', 'join-card');
    card.appendChild(el('div', 'spin'));
    card.appendChild(el('p', '', t));
    card.appendChild(btn('btn', '取消', function () { joinScreen(); }));
    app.appendChild(card);
  }
  function stop() { if (net) { net.close(); net = null; } clearTimeout(joinT); clearInterval(pingT); joined = false; V = null; }

  /* ---------- 連線 ---------- */
  function connect() {
    stop();
    waitScreen('正在進入教室 ' + me.code + '…');
    net = WBNet.open({ code: me.code, role: 'student', sid: me.sid, broker: broker, onMessage: onMsg, onStatus: function (s) {
      var d = document.querySelector('.st-net'); if (d) d.className = 'st-net dot ' + s;
      if (s === 'online') send({ t: 'join' });
    } });
    joinT = setTimeout(function () { if (!joined) joinScreen('找不到這間教室。請確認教室代碼有沒有打錯，或請老師確認教室已經打開。'); }, 12000);
    pingT = setInterval(function () { if (joined) send({ t: 'ping' }); }, 8000);
  }
  function send(d) { if (!net) return; d.sid = me.sid; d.cid = me.cid; net.send(d); }
  function onMsg(d) {
    if (d.cid && d.cid !== me.cid && d.t !== 'replaced') return;
    switch (d.t) {
      case 'welcome': if (!joined) { joined = true; clearTimeout(joinT); boardScreen(); } break;
      case 'view':
        if (!joined) { joined = true; clearTimeout(joinT); boardScreen(); }
        V.load(d.bid, d.objs || []); setMeta(d); break;
      case 'meta': setMeta(d); break;
      case 'op': if (V && d.from !== me.sid) V.apply(d.bid, d.op); break;
      case 'live': if (V && d.from !== me.sid && d.o && d.o.by !== me.sid) V.live(d.bid, d.o); break;
      case 'hostup': send({ t: 'join' }); break;
      case 'replaced': if (d.cid === me.cid) { stop(); infoScreen('這個學號已經在另一台裝置登入了。', '在這台繼續用', function () { connect(); }); } break;
      case 'closed': stop(); infoScreen('老師已經關閉這間教室了。', '加入新的教室', function () { joinScreen(); }); break;
    }
  }
  function infoScreen(t, label, fn) {
    var app = $('app'); app.innerHTML = ''; app.className = 'join-wrap';
    var card = el('div', 'join-card'); card.appendChild(el('div', 'join-logo', '📴')); card.appendChild(el('p', '', t));
    card.appendChild(btn('btn primary big', label, fn)); app.appendChild(card);
  }

  /* ---------- 畫板畫面 ---------- */
  function boardScreen() {
    var app = $('app'); app.innerHTML = ''; app.className = 'stu-app';
    var top = el('div', 'stu-top');
    top.appendChild(el('span', 'st-net dot online'));
    top.appendChild(el('span', 'stu-title', ''));
    top.appendChild(el('span', 'grow'));
    top.appendChild(el('span', 'stu-id', '學號 ' + me.sid));
    top.appendChild(btn('ic', '🚪', function () { if (confirm('要離開教室嗎？')) { me.cid = null; saveMe(); joinScreen(); } }));
    app.appendChild(top);
    var bh = el('div', 'board-host'); app.appendChild(bh);
    var tb = el('div', 'toolbar stu-tools'); app.appendChild(tb);
    V = WB.view(bh, {
      me: me.sid,
      canErase: function (o) { return o.by !== 'T'; },
      onOp: function (bid, op) { send({ t: 'op', bid: bid, op: op }); renderTools(); },
      onLive: function (bid, o) { send({ t: 'live', bid: bid, o: o }); }
    });
    V.setTool(tool);
    renderTools();
  }
  function setMeta(d) {
    cur = d;
    var t = document.querySelector('.stu-title'); if (t) t.textContent = d.title || '';
    V.setEditable(!!d.editable);
    document.body.classList.toggle('can-draw', !!d.editable);
    renderTools();
  }
  function renderTools() {
    var tb = document.querySelector('.stu-tools'); if (!tb) return;
    tb.innerHTML = '';
    if (!cur.editable) {
      tb.appendChild(el('span', 'lock-note', cur.mode === 'work' ? '🚫 老師目前沒有開放你的畫筆' : '👀 上課中，請看老師的畫面'));
      return;
    }
    tb.appendChild(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '✏️<small>黑筆</small>', function () { tool.mode = 'pen'; V.setTool(tool); renderTools(); }));
    tb.appendChild(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { tool.mode = 'erase'; V.setTool(tool); renderTools(); }));
    var u = btn('tb', '↩️<small>上一步</small>', function () { V.undo(); renderTools(); }); u.disabled = !V.canUndo(); tb.appendChild(u);
    tb.appendChild(btn('tb', '🗑️<small>全消除</small>', function () { if (confirm('要把你自己畫的全部擦掉嗎？')) { V.clear(false); renderTools(); } }));
  }

  if (me.code && me.sid && me.cid) connect(); else joinScreen();
})();
