/* Andice的共用畫板・學生端 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'wb-stu-v1';
  function hashArg(k) { var m = location.hash.match(new RegExp('[#&]' + k + '=([^&]+)')); return m ? decodeURIComponent(m[1]) : null; }
  var broker = hashArg('b'); broker = broker == null ? null : (+broker || 0);
  var store = WBNet.LOCAL ? sessionStorage : localStorage; /* 測試模式各分頁各自記 */
  var me = {}; try { me = JSON.parse(store.getItem(KEY)) || {}; } catch (e) {}
  var net = null, V = null, joined = false, joinT = null, pingT = null, cur = { pen: false, note: false, title: '' };
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
    card.appendChild(el('h1', '', '加入 Andice的共用畫板'));
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
      if (me.code !== c) me.b = null; me.code = c; me.sid = s; if (!me.cid) me.cid = Math.random().toString(36).slice(2, 10); saveMe();
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
  /* 依序試每個中繼站：連上後送出加入，等不到老師回應就換下一個 */
  function connect(tryNo, first) {
    tryNo = tryNo || 0;
    stop();
    if (first == null) first = me.b != null ? me.b : (broker || 0);
    var b = (first + tryNo) % WBNet.N;
    waitScreen('正在進入教室 ' + me.code + '…' + (tryNo ? '（換一條線路再試）' : ''));
    net = WBNet.open({ code: me.code, role: 'student', sid: me.sid, broker: b, onMessage: onMsg, onStatus: function (s) {
      var d = document.querySelector('.st-net'); if (d) d.className = 'st-net dot ' + s;
      if (s === 'online') {
        send({ t: 'join' });
        if (!joined) { clearTimeout(joinT); joinT = setTimeout(fail, 7000); }
      }
    } });
    function fail() {
      if (joined) return;
      if (tryNo < WBNet.N * 2 - 1) connect(tryNo + 1, first);
      else joinScreen('找不到這間教室。請確認教室代碼有沒有打錯，或請老師確認教室已經打開。');
    }
    joinT = setTimeout(fail, 15000);
    pingT = setInterval(function () { if (joined) send({ t: 'ping' }); }, 8000);
    connect.b = b;
  }
  function send(d) { if (!net) return; d.sid = me.sid; d.cid = me.cid; net.send(d); }
  function onMsg(d) {
    if (d.cid && d.cid !== me.cid && d.t !== 'replaced') return;
    switch (d.t) {
      case 'welcome': if (!joined) { joined = true; clearTimeout(joinT); me.b = connect.b; saveMe(); boardScreen(); } break;
      case 'view':
        if (!joined) { joined = true; clearTimeout(joinT); me.b = connect.b; saveMe(); boardScreen(); }
        V.load(d.bid, d.objs || []); setMeta(d); needImgs(d.objs || []); break;
      case 'meta': setMeta(d); break;
      case 'cd': cdSet(d); break;
      case 'nudge': nudge(); break;
      case 'poll': pollSet(d); break;
      case 'op': if (V && d.from !== me.sid) { V.apply(d.bid, d.op); needImgs(d.op.add || []); } break;
      case 'vid': if (V && d.bid === V.bid && d.id) V.video(d.id, d.cmd, d.at); break;
      case 'img': if (d.id && d.d) { delete asked[d.id]; WB.setImg(d.id, d.d); } break;
      case 'live': if (V && d.from !== me.sid && d.o && d.o.by !== me.sid) V.live(d.bid, d.o); break;
      case 'hostup': send({ t: 'join' }); break;
      case 'taken': if (d.cid === me.cid) { stop(); me.cid = null; saveMe(); infoScreen('學號 ' + me.sid + ' 已經有人在使用了，不能重複登入。<br>請確認學號有沒有打錯；如果是你換了裝置，請老師在學生名單按 ✕ 把舊的移出，或等舊裝置關掉約 20 秒後再加入。', '重新輸入', function () { joinScreen(); }); } break;
      case 'replaced': if (d.cid === me.cid) { stop(); infoScreen('這個學號已經在另一台裝置登入了。', '在這台繼續用', function () { connect(0); }); } break;
      case 'closed': stop(); me.cid = null; saveMe(); infoScreen('老師已經結束這堂課，關閉教室了。', '加入新的教室', function () { joinScreen(); }); break;
      case 'kicked': if (d.cid === me.cid) { stop(); me.cid = null; saveMe(); infoScreen('老師已經把你移出這間教室。', '重新加入', function () { joinScreen(); }); } break;
    }
  }
  var asked = {};
  function needImgs(objs) {
    var ids = WB.missingImgs(objs).filter(function (id) { return !asked[id] || Date.now() - asked[id] > 15000; });
    if (!ids.length) return; ids.forEach(function (id) { asked[id] = Date.now(); }); send({ t: 'needimg', ids: ids });
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
    var ck = el('span', 'stu-clock'); ck.hidden = true; top.appendChild(ck);
    top.appendChild(el('span', 'stu-id', '學號 ' + me.sid));
    top.appendChild(btn('ic', '🚪', function () { if (confirm('要離開教室嗎？')) { me.cid = null; saveMe(); joinScreen(); } }));
    app.appendChild(top);
    var bh = el('div', 'board-host'); app.appendChild(bh);
    var tb = el('div', 'toolbar stu-tools'); app.appendChild(tb);
    V = WB.view(bh, {
      me: me.sid,
      canErase: function (o) { return o.by !== 'T'; },
      canEdit: function (o) { return o && o.k === 'n' && o.by === me.sid && !!cur.note; },
      lockVideos: true,
      onSelect: function () { renderTools(); },
      onOp: function (bid, op) { send({ t: 'op', bid: bid, op: op }); renderTools(); },
      onLive: function (bid, o) { send({ t: 'live', bid: bid, o: o }); },
      onWantSelect: function () { if (cur.note) setTool('select'); }
    });
    V.setTool(tool);
    renderTools();
  }
  var NOTE_COLORS = [['#fff3a6', '黃'], ['#ffd6e5', '粉紅'], ['#cfe8ff', '藍'], ['#d4f5d0', '綠'], ['#e6d9ff', '紫'], ['#ffe0c2', '橙']];
  var endAt = null;
  /* 老師指派多頁時：顯示目前第幾頁；老師開放時學生可以自己換頁 */
  function pgBar(d) {
    var bx = document.getElementById('stu-pg');
    if (!d.pgt || d.pgt < 2) { if (bx) bx.remove(); return; }
    if (!bx) { bx = document.createElement('div'); bx.id = 'stu-pg'; bx.className = 'stu-pg'; (document.querySelector('.board-host') || document.body).appendChild(bx); }
    bx.innerHTML = '';
    function mk(t, f, dis) { var b = document.createElement('button'); b.textContent = t; b.disabled = dis; b.onclick = f; bx.appendChild(b); }
    if (d.pgf) mk('‹', function () { send({ t: 'goto', d: -1 }); }, d.pgn <= 1);
    var s = document.createElement('span'); s.textContent = '第 ' + d.pgn + ' / ' + d.pgt + ' 頁' + (d.pgf ? '' : '（老師會帶你換頁）'); bx.appendChild(s);
    if (d.pgf) mk('›', function () { send({ t: 'goto', d: 1 }); }, d.pgn >= d.pgt);
  }
  function setMeta(d) {
    cur = d;
    var t = document.querySelector('.stu-title'); if (t) t.textContent = d.title || '';
    endAt = d.left != null ? Date.now() + d.left : null;
    var can = !!(d.pen || d.note);
    if (!d.pen && (tool.mode === 'pen' || tool.mode === 'erase')) tool.mode = d.note ? 'select' : 'none';
    if (!d.note && tool.mode === 'select') tool.mode = d.pen ? 'pen' : 'none';
    if (d.pen && !d.note && tool.mode === 'none' && !cur._seen) tool.mode = 'pen';
    cur._seen = true;
    V.setTool(tool); V.setEditable(can);
    V.setBg(d.bg || '');
    V.setViewport(d.vp || null);
    document.body.classList.toggle('can-draw', can);
    pgBar(d);
    tick(); renderTools();
  }
  function tick() {
    var c = document.querySelector('.stu-clock'); if (!c) return;
    if (endAt && cur.mode === 'work') { var s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000)); c.hidden = false; c.textContent = '⏱ ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); c.classList.toggle('hurry', s <= 30); }
    else c.hidden = true;
  }
  /* 老師的投票／選擇題 */
  var poll = null, pollEl = null, myVote = {}, pollMin = false;
  function pollSet(d) {
    if (d.off) { poll = null; } else { if (!poll || poll.id !== d.id) pollMin = false; poll = d; }
    pollDraw();
  }
  function pollDraw() {
    if (!poll) { if (pollEl) { pollEl.parentNode.removeChild(pollEl); pollEl = null; } return; }
    if (!pollEl) { pollEl = document.createElement('div'); pollEl.className = 'poll-stu'; document.body.appendChild(pollEl); }
    var LT = 'ABCDEF', mine = myVote[poll.id], h = '<div class="ps-top"><b>📊 ' + (poll.q ? poll.q.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) : '請作答') + '</b><button class="ps-min" data-a="m">' + (pollMin ? '⌃ 展開' : '⌄ 收起') + '</button></div>';
    if (!pollMin) {
      h += '<div class="ps-opts">';
      poll.opts.forEach(function (t, i) {
        var res = poll.res, extra = '';
        if (res) extra = '<span class="ps-n">' + res.counts[i] + ' 人' + (res.ans === i ? '・✓ 正確答案' : '') + '</span>';
        h += '<button class="ps-o' + (mine === i ? ' on' : '') + (res && res.ans === i ? ' ok' : '') + '" data-i="' + i + '"' + (poll.open ? '' : ' disabled') + '><b>' + (poll.opts.length === 2 && /[⭕❌]/.test(t) ? '' : LT[i] + '.') + '</b> ' + (t.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; })) + extra + '</button>';
      });
      h += '</div><div class="ps-m">' + (!poll.open ? '⏹ 作答已結束' + (mine != null ? '・你選了 ' + (poll.opts.length === 2 && /[⭕❌]/.test(poll.opts[mine]) ? poll.opts[mine] : LT[mine]) : '') : mine != null ? '✅ 已送出，可以改選別的' : '點一個答案送出') + '</div>';
    }
    pollEl.innerHTML = h;
    pollEl.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'm') { pollMin = !pollMin; pollDraw(); return; }
      if (b.dataset.i == null || !poll || !poll.open) return;
      var i = +b.dataset.i; myVote[poll.id] = i; send({ t: 'vote', pid: poll.id, o: i }); pollDraw();
    };
  }
  /* 老師的倒數計時器 */
  var cdS = null, cdEl = null, cdFired = false;
  /* 離開畫布提醒：切到別的分頁／app、鎖螢幕時通知老師；老師可以叫我回來 */
  document.addEventListener('visibilitychange', function () { if (joined) send({ t: 'away', a: document.hidden ? 1 : 0 }); });
  window.addEventListener('pagehide', function () { if (joined) send({ t: 'away', a: 1 }); });
  var nudgeEl = null;
  function nudge() {
    if (nudgeEl) nudgeEl.remove();
    nudgeEl = document.createElement('div'); nudgeEl.className = 'nudge'; nudgeEl.textContent = '👆 老師請你回到畫布，專心上課！（點一下關掉）';
    nudgeEl.onclick = function () { nudgeEl.remove(); nudgeEl = null; };
    document.body.appendChild(nudgeEl);
    /* 響鈴與震動持續 3 秒；文字會一直留著，等學生自己點掉 */
    try { if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400, 100, 400, 100, 400, 100, 400]); } catch (e) {}
    var k = 0, bt = setInterval(function () {
      try { var AC = window.AudioContext || window.webkitAudioContext, c = new AC(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = k % 2 ? 660 : 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.3, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35); o.start(); o.stop(c.currentTime + 0.37); setTimeout(function () { try { c.close(); } catch (e) {} }, 700); } catch (e) {}
      if (++k >= 6) clearInterval(bt);
    }, 500);
  }
  function cdSet(d) {
    cdFired = false;
    if (d.off) { cdS = null; } else { cdS = { total: d.total, paused: !!d.paused, left: d.left, end: Date.now() + d.left }; }
    cdTick();
  }
  function cdTick() {
    if (!cdS) { if (cdEl) { cdEl.parentNode.removeChild(cdEl); cdEl = null; } return; }
    if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd-stu'; document.body.appendChild(cdEl); }
    var l = cdS.paused ? cdS.left : Math.max(0, cdS.end - Date.now()), s = Math.ceil(l / 1000);
    cdEl.textContent = l <= 0 ? '⏰ 時間到！' : '⏱ ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + (cdS.paused ? '（暫停）' : '');
    cdEl.classList.toggle('hurry', l > 0 && l <= 10000); cdEl.classList.toggle('done', l <= 0);
    if (l <= 0 && !cdFired && !cdS.paused) {
      cdFired = true; var k = 0, bt = setInterval(function () {
        try { var AC = window.AudioContext || window.webkitAudioContext, c = new AC(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = k % 2 ? 660 : 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3); o.start(); o.stop(c.currentTime + 0.32); setTimeout(function () { try { c.close(); } catch (e) {} }, 600); } catch (e) {}
        if (++k >= 14 || !cdS || cdS.paused || Math.max(0, cdS.end - Date.now()) > 0) clearInterval(bt);
      }, 400);
    }
  }
  setInterval(cdTick, 250);
  setInterval(tick, 500);
  function setTool(m) { tool.mode = m; V.setTool(tool); renderTools(); }
  function renderTools() {
    var tb = document.querySelector('.stu-tools'); if (!tb) return;
    tb.innerHTML = '';
    if (!cur.pen && !cur.note) {
      tb.appendChild(el('span', 'lock-note', cur.mode === 'work' || /作業/.test(cur.title || '') ? (/🔒|暫停/.test(cur.title || '') ? '🔒 老師暫停了你們的操作' : '🚫 老師目前沒有開放畫筆') : '👀 請看老師的畫面'));
      return;
    }
    if (cur.pen) {
      tb.appendChild(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '✏️<small>黑筆</small>', function () { setTool('pen'); }));
      tb.appendChild(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { setTool('erase'); }));
    }
    if (cur.note) {
      var nb = btn('tb', '📝<small>便利貼</small>', function () {
        var box = document.querySelector('.note-pick'); if (box) { box.remove(); return; }
        box = el('div', 'note-pick');
        NOTE_COLORS.forEach(function (c) { var b = btn('note-sw', c[1], function () { box.remove(); addNote(c[0]); }); b.style.background = c[0]; box.appendChild(b); });
        tb.appendChild(box);
      });
      tb.appendChild(nb);
      tb.appendChild(btn('tb' + (tool.mode === 'select' ? ' on' : ''), '🖐️<small>移動便利貼</small>', function () { setTool('select'); }));
    }
    tb.appendChild(btn('tb' + (tool.mode === 'none' ? ' on' : ''), '👆<small>點連結</small>', function () { setTool('none'); }));
    var u = btn('tb', '↩️<small>上一步</small>', function () { V.undo(); renderTools(); }); u.disabled = !V.canUndo(); tb.appendChild(u);
    if (cur.pen) tb.appendChild(btn('tb', '🗑️<small>全消除</small>', function () { if (confirm('要把你自己畫的筆劃全部擦掉嗎？')) { V.clear(false); renderTools(); } }));
    var o = V.sel && V.find(V.sel);
    if (o && o.k === 'n' && tool.mode === 'select') {
      var bar = el('div', 'stu-objbar');
      NOTE_COLORS.forEach(function (c) { var b = btn('sw' + (o.c === c[0] ? ' on' : ''), '', function () { V.change({ c: c[0] }); }); b.style.background = c[0]; bar.appendChild(b); });
      bar.appendChild(btn('btn sm', '✏️ 寫字', function () { V.editText(o.id); }));
      bar.appendChild(btn('btn sm danger', '🗑', function () { V.deleteSel(); renderTools(); }));
      tb.appendChild(bar);
    }
  }
  function addNote(c) {
    var vp = V.vp, x = vp.x + WB.W / vp.z / 2 - 110 + (Math.random() * 80 - 40), y = vp.y + WB.H / vp.z / 2 - 110 + (Math.random() * 60 - 30);
    tool.mode = 'select'; V.setTool(tool);
    V.addObj({ id: WB.uid(), k: 'n', by: me.sid, x: Math.round(x), y: Math.round(y), w: 220, h: 220, r: 0, fx: false, c: c, txt: '', fs: 28 });
    renderTools(); setTimeout(function () { V.editText(V.sel); }, 40);
  }

  if (me.code && me.sid && me.cid) connect(0); else joinScreen();
})();
