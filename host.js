/* 共用畫板・老師端：老師這台是總管，保存所有頁面、小組畫板與學生名單 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'wb-host-v1';
  var COLORS = ['#111111', '#e53935', '#1e63d6', '#16a34a', '#f08c00', '#8e44ad', '#ff4fa3', '#ffffff'];
  var WIDTHS = [3, 6, 12];
  var S, net, tv = { kind: 'page' }, online = {}, lastSent = {};

  function fresh(keepPages) {
    var p = { id: WB.uid(), objs: [] };
    return {
      code: WBNet.code(), broker: null,
      pages: keepPages && S ? S.pages : [p], cur: keepPages && S ? S.cur : p.id,
      mode: 'present', cast: null, assignAll: null,
      groups: {}, students: {}, penAll: true, wallShow: false, show: {}, lock: keepPages && S ? S.lock : false
    };
  }
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.pages) S = fresh(false);
  var saveT = null;
  function save() { if (saveT) return; saveT = setTimeout(function () { saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ 這台裝置的儲存空間滿了，內容可能沒有存到'); } }, 500); }

  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 2600); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(cls, html, fn) { var b = el('button', cls, html); b.onclick = fn; return b; }
  function page(pid) { for (var i = 0; i < S.pages.length; i++) if (S.pages[i].id === pid) return S.pages[i]; return null; }
  function pageNo(pid) { for (var i = 0; i < S.pages.length; i++) if (S.pages[i].id === pid) return i + 1; return '?'; }
  function groupOf(sid) { var st = S.students[sid]; return st ? S.groups[st.gid] : null; }
  function members(gid) { return Object.keys(S.students).filter(function (s) { return S.students[s].gid === gid; }).sort(); }
  function objsOf(bid) {
    if (!bid) return null;
    if (bid.slice(0, 2) === 'P:') { var p = page(bid.slice(2)); return p ? p.objs : null; }
    var g = S.groups[bid.slice(2)]; return g && g.cur ? g.boards[g.cur] : null;
  }
  function penOK(sid) { var st = S.students[sid]; if (!st) return false; return st.pen == null ? S.penAll : st.pen; }

  /* ---------- 學生看到的畫面 ---------- */
  function viewFor(sid) {
    var st = S.students[sid], g = S.groups[st.gid];
    if (S.mode === 'work' && g && g.cur && page(g.cur)) return { bid: 'G:' + st.gid, editable: penOK(sid), title: '✏️ 作業時間・第 ' + pageNo(g.cur) + ' 頁' + (g.custom ? '（' + gname(st.gid) + '）' : ''), mode: 'work' };
    if (S.mode === 'present' && S.cast && S.groups[S.cast] && S.groups[S.cast].cur) return { bid: 'G:' + S.cast, editable: false, title: '📽️ 老師正在分享 ' + gname(S.cast) + ' 的畫面', mode: 'present' };
    return { bid: 'P:' + S.cur, editable: false, title: S.mode === 'work' ? '⏳ 老師還沒有指派畫板給你，先看老師的畫面' : '📽️ 上課中：看老師的畫面', mode: S.mode };
  }
  function refresh(sid, force) {
    var st = S.students[sid]; if (!st || !online[sid]) return;
    var v = viewFor(sid), L = lastSent[sid];
    if (force || !L || L.bid !== v.bid || L.gen !== genOf(v.bid)) {
      net.send({ t: 'view', cid: st.cid, bid: v.bid, objs: objsOf(v.bid) || [], editable: v.editable, title: v.title, mode: v.mode, gen: genOf(v.bid) }, sid);
    } else if (L.editable !== v.editable || L.title !== v.title) {
      net.send({ t: 'meta', cid: st.cid, bid: v.bid, editable: v.editable, title: v.title, mode: v.mode }, sid);
    }
    lastSent[sid] = { bid: v.bid, editable: v.editable, title: v.title, gen: genOf(v.bid) };
  }
  /* 組別換畫板時 bid 不變，用 gen 判斷要不要重送 */
  function genOf(bid) { if (bid.slice(0, 2) === 'G:') { var g = S.groups[bid.slice(2)]; return g ? g.cur : ''; } return ''; }
  function refreshAll(force) { Object.keys(S.students).forEach(function (s) { refresh(s, force); }); }
  function viewers(bid) { return Object.keys(S.students).filter(function (s) { return online[s] && lastSent[s] && lastSent[s].bid === bid; }); }
  function distribute(bid, msg, except) {
    var vs = viewers(bid).filter(function (s) { return s !== except; });
    if (!vs.length) return;
    if (except) msg.from = except;
    if (vs.length > 3) { msg.bid = bid; net.send(msg, '*'); return; }
    vs.forEach(function (s) { var m = JSON.parse(JSON.stringify(msg)); m.bid = bid; net.send(m, s); });
  }

  /* ---------- 連線 ---------- */
  function connect() {
    if (net) net.close();
    online = {}; lastSent = {};
    net = WBNet.open({ code: S.code, role: 'host', broker: S.broker, onMessage: onMsg, onStatus: function (s) {
      $('h-net').className = 'dot ' + s;
      if (s === 'online' && WBNet.LOCAL) net.send({ t: 'hostup' }, '*');
    }, onLine: function () { setTimeout(function () { net.send({ t: 'hostup' }, '*'); }, 300);
    } });
    $('h-code').textContent = S.code;
  }
  function onMsg(d) {
    if (!d || !d.sid || !/^\d{1,6}$/.test(d.sid)) return;
    var sid = d.sid, st = S.students[sid];
    if (d.t === 'join') {
      if (!st) {
        var gid = 'g' + sid;
        st = S.students[sid] = { gid: gid, pen: null, cid: d.cid };
        if (!S.groups[gid]) S.groups[gid] = { name: '', boards: {}, cur: null };
        if (S.assignAll && page(S.assignAll) && !S.groups[gid].cur) assign(gid, S.assignAll, true);
      } else if (st.cid !== d.cid) {
        net.send({ t: 'replaced', cid: st.cid }, sid);
        st.cid = d.cid;
      }
      online[sid] = Date.now(); delete lastSent[sid];
      net.send({ t: 'welcome', cid: d.cid, sid: sid }, sid);
      refresh(sid, true); save(); renderRoster(); renderWall(); return;
    }
    if (!st || st.cid !== d.cid) { if (st) net.send({ t: 'replaced', cid: d.cid }, sid); return; }
    var was = online[sid]; online[sid] = Date.now();
    if (!was) { refresh(sid, true); renderRoster(); renderWall(); }
    if (d.t === 'op') {
      var v = viewFor(sid);
      if (!v.editable || d.bid !== v.bid) { refresh(sid, true); return; }
      var objs = objsOf(d.bid), op = d.op || {};
      var byId = {}; objs.forEach(function (o) { byId[o.id] = o; });
      var del = (op.del || []).filter(function (id) { return byId[id] && byId[id].by !== 'T'; });
      var add = (op.add || []).filter(function (o) { return o && o.k === 's' && o.by !== 'T' && Array.isArray(o.p) && o.p.length < 20000; })
        .map(function (o) { return { id: String(o.id), k: 's', by: String(o.by), c: '#111111', w: Math.min(12, Math.max(1, +o.w || 4)), p: o.p }; });
      var clean = { del: del, add: add };
      WB.applyOp(objs, clean);
      if (V.bid === d.bid) V.apply(d.bid, clean);
      distribute(d.bid, { t: 'op', op: clean }, sid);
      boardChanged(d.bid); save();
    } else if (d.t === 'live') {
      var v2 = viewFor(sid); if (!v2.editable || d.bid !== v2.bid || !d.o) return;
      d.o.c = '#111111';
      distribute(d.bid, { t: 'live', o: d.o }, sid);
      if (V.bid === d.bid) V.live(d.bid, d.o);
    } else if (d.t === 'needimg' && Array.isArray(d.ids)) {
      d.ids.slice(0, 20).forEach(function (id) { if (WB.imgs[id]) net.send({ t: 'img', cid: st.cid, id: id, d: WB.imgs[id] }, sid); });
    } else if (d.t === 'sync') {
      refresh(sid, true);
    }
  }
  setInterval(function () {
    var now = Date.now(), ch = false;
    for (var s in online) if (now - online[s] > 25000) { delete online[s]; delete lastSent[s]; ch = true; }
    if (ch) { renderRoster(); renderWall(); }
  }, 5000);

  /* ---------- 老師的畫板 ---------- */
  var V = WB.view($('board-host'), {
    me: 'T', canErase: function () { return true; },
    onOp: function (bid, op, temp) {
      WB.applyOp(objsOf(bid) || [], op);
      distribute(bid, { t: 'op', op: op });
      boardChanged(bid); save(); if (!temp) renderTools();
    },
    onSelect: function () { renderObjBar(); },
    onLive: function (bid, o) { distribute(bid, { t: 'live', o: o }); }
  });
  var tool = { mode: 'pen', color: COLORS[1], width: WIDTHS[1] };
  V.setTool(tool); V.setEditable(true);

  function curBid() { return tv.kind === 'group' ? 'G:' + tv.gid : 'P:' + S.cur; }
  function showBoard() {
    if (tv.kind === 'group' && !(S.groups[tv.gid] && S.groups[tv.gid].cur)) tv = { kind: 'page' };
    var bid = curBid();
    V.load(bid, objsOf(bid));
    renderCtx(); renderPages(); renderTools();
  }
  function renderCtx() {
    var c = $('ctx-bar'); c.innerHTML = '';
    if (tv.kind === 'group') {
      var g = S.groups[tv.gid];
      c.className = 'ctx-bar collab';
      c.appendChild(el('span', '', '🤝 正在和 <b>' + gname(tv.gid) + '</b> 一起畫（第 ' + pageNo(g.cur) + ' 頁）'));
      c.appendChild(btn('btn sm', '⬅️ 回到我的畫板', function () { tv = { kind: 'page' }; showBoard(); }));
    } else {
      c.className = 'ctx-bar';
      var txt = S.mode === 'present'
        ? (S.cast ? '📽️ 全班正在看 <b>' + gname(S.cast) + '</b> 的畫面' : '📽️ 簡報模式：全班正在看這一頁（第 ' + pageNo(S.cur) + ' 頁）')
        : '✏️ 作業模式：有指派畫板的學生可以作答；你現在看的是第 ' + pageNo(S.cur) + ' 頁';
      c.appendChild(el('span', '', txt));
      if (S.cast) c.appendChild(btn('btn sm', '⏹ 停止分享，改回看老師', function () { S.cast = null; save(); refreshAll(); renderCtx(); renderWall(); }));
    }
  }
  function setMode(m) { tool.mode = m; V.setTool(tool); renderTools(); }
  function renderTools() {
    var t = $('toolbar'); t.innerHTML = '';
    var g1 = el('div', 'tgrp');
    g1.appendChild(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '✏️<small>畫筆</small>', function () { setMode('pen'); }));
    var cs = el('div', 'colors');
    COLORS.forEach(function (c) { var b = btn('sw' + (tool.mode === 'pen' && tool.color === c ? ' on' : ''), '', function () { tool.color = c; setMode('pen'); }); b.style.background = c; b.title = c; cs.appendChild(b); });
    g1.appendChild(cs);
    var ws = el('div', 'widths');
    WIDTHS.forEach(function (w) { var b = btn('wd' + (tool.width === w ? ' on' : ''), '<i style="width:' + (w + 4) + 'px;height:' + (w + 4) + 'px"></i>', function () { tool.width = w; setMode('pen'); }); ws.appendChild(b); });
    g1.appendChild(ws);
    g1.appendChild(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { setMode('erase'); }));
    t.appendChild(g1);
    var g2 = el('div', 'tgrp');
    g2.appendChild(btn('tb' + (tool.mode === 'select' ? ' on' : ''), '🖐️<small>移動物件</small>', function () { setMode('select'); if (S.lock) toast('🔒 物件目前是鎖定的，要先按「解鎖物件」才能移動'); }));
    g2.appendChild(btn('tb', '🖼️<small>圖片</small>', function () { $('file-in').click(); }));
    g2.appendChild(btn('tb', '📋<small>貼上</small>', pasteButton));
    g2.appendChild(btn('tb', '🔤<small>橫式文字</small>', function () { addText('', false); }));
    g2.appendChild(btn('tb', '↕️<small>直式文字</small>', function () { addText('', true); }));
    g2.appendChild(btn('tb', '🔗<small>連結</small>', addLinkBox));
    g2.appendChild(btn('tb' + (S.lock ? ' on warn' : ''), (S.lock ? '🔒' : '🔓') + '<small>' + (S.lock ? '物件已鎖定' : '鎖定物件') + '</small>', function () {
      S.lock = !S.lock; save(); V.setLocked(S.lock); renderTools();
      toast(S.lock ? '🔒 已鎖定所有物件，不會被不小心移動' : '🔓 已解鎖，可以用「移動物件」調整');
    }));
    t.appendChild(g2);
    var g3 = el('div', 'tgrp');
    var u = btn('tb', '↩️<small>上一步</small>', function () { V.undo(); renderTools(); }); u.disabled = !V.canUndo(); g3.appendChild(u);
    g3.appendChild(btn('tb', '🗑️<small>全消除</small>', function () {
      confirmBox('要把這一頁的筆劃全部擦掉嗎？（含學生的筆劃，圖片和文字框不會被擦掉；按「上一步」可以救回來）', '全部擦掉', function () { V.clear(true); renderTools(); });
    }));
    t.appendChild(g3);
    renderObjBar();
  }
  /* 選到物件時出現的調整列 */
  function renderObjBar() {
    var b = $('objbar'), o = V.sel && V.objs.filter(function (x) { return x.id === V.sel; })[0];
    if (!o || tool.mode !== 'select') { b.hidden = true; return; }
    b.hidden = false; b.innerHTML = '';
    b.appendChild(el('b', '', o.k === 'i' ? '🖼️ 圖片' : '🔤 文字框'));
    var ang = el('label', 'ang', '旋轉 '); var ai = el('input'); ai.type = 'number'; ai.min = 0; ai.max = 360; ai.value = o.r || 0;
    ai.onchange = function () { var v = Math.round(+ai.value) || 0; v = ((v % 360) + 360) % 360; if (v === 0 && +ai.value === 360) v = 360; V.change({ r: v }); };
    ang.appendChild(ai); ang.appendChild(document.createTextNode(' 度')); b.appendChild(ang);
    [[-15, '↺15°'], [15, '↻15°'], [90, '↻90°']].forEach(function (a) { b.appendChild(btn('btn sm', a[1], function () { V.change({ r: (((o.r || 0) + a[0]) % 360 + 360) % 360 }); })); });
    b.appendChild(btn('btn sm' + (o.fx ? ' primary' : ''), '🪞 鏡像翻面', function () { V.change({ fx: !o.fx }); }));
    if (o.k === 't') {
      b.appendChild(btn('btn sm', '✏️ 編輯文字', function () { V.editText(o.id); }));
      b.appendChild(btn('btn sm' + (!o.v ? ' primary' : ''), '橫式', function () { if (o.v) V.change({ v: false, w: o.h, h: o.w }); }));
      b.appendChild(btn('btn sm' + (o.v ? ' primary' : ''), '直式', function () { if (!o.v) V.change({ v: true, w: o.h, h: o.w }); }));
      b.appendChild(btn('btn sm', 'A－', function () { V.change({ fs: Math.max(14, (o.fs || 36) - 6) }); }));
      b.appendChild(btn('btn sm', 'A＋', function () { V.change({ fs: Math.min(160, (o.fs || 36) + 6) }); }));
      var cs = el('span', 'colors mini');
      COLORS.slice(0, 7).forEach(function (c) { var x = btn('sw' + ((o.c || '#111111') === c ? ' on' : ''), '', function () { V.change({ c: c }); }); x.style.background = c; cs.appendChild(x); });
      b.appendChild(cs);
    }
    b.appendChild(el('span', 'grow'));
    b.appendChild(btn('btn sm danger', '🗑 刪除', function () { V.deleteSel(); renderTools(); }));
  }
  document.addEventListener('keydown', function (e) {
    var ed = document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !ed) { e.preventDefault(); V.undo(); renderTools(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !ed && V.sel) { e.preventDefault(); V.deleteSel(); renderTools(); }
  });

  /* ---------- 加入圖片、文字、連結 ---------- */
  function center(w, h) { return { x: Math.round((WB.W - w) / 2 + (Math.random() * 60 - 30)), y: Math.round((WB.H - h) / 2 + (Math.random() * 40 - 20)) }; }
  function afterAdd() { tool.mode = 'select'; V.setTool(tool); if (S.lock) { S.lock = false; save(); V.setLocked(false); } renderTools(); }
  function addText(txt, vert) {
    var w = vert ? 140 : 520, h = vert ? 420 : 120, c = center(w, h);
    V.setTool({ mode: 'select' }); tool.mode = 'select';
    if (S.lock) { S.lock = false; save(); V.setLocked(false); }
    V.addObj({ id: WB.uid(), k: 't', by: 'T', x: c.x, y: c.y, w: w, h: h, r: 0, fx: false, txt: txt, v: !!vert, fs: 36, c: '#111111' });
    renderTools();
    if (!txt) setTimeout(function () { V.editText(V.sel); }, 30);
  }
  function addLinkBox() {
    modal(function (box) {
      box.appendChild(el('h3', '', '🔗 加入連結'));
      box.appendChild(el('p', '', '把網址貼在下面，畫板上會出現可以點的連結。'));
      var i = el('input', 'wide-in'); i.placeholder = 'https://…'; box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '加入', function () {
        var u = i.value.trim(); if (!u) return; if (!/^https?:\/\//.test(u) && !/^www\./.test(u)) u = 'https://' + u;
        closeModal(); addText(u, false);
      }));
      box.appendChild(row); setTimeout(function () { i.focus(); }, 30);
    });
  }
  /* 圖片壓縮：最長邊 1600、JPEG，太大再降畫質 */
  function addImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return toast('這不是圖片檔');
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1600 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h);
        var q = 0.85, d = cv.toDataURL('image/jpeg', q);
        while (d.length > 450000 && q > 0.4) { q -= 0.12; d = cv.toDataURL('image/jpeg', q); }
        var id = 'im' + WB.uid(); WB.setImg(id, d); idbPut(id, d);
        var f = Math.min(1, (WB.W * 0.7) / w, (WB.H * 0.7) / h), ww = Math.round(w * f), hh = Math.round(h * f), c = center(ww, hh);
        V.setTool({ mode: 'select' }); tool.mode = 'select'; if (S.lock) { S.lock = false; save(); V.setLocked(false); }
        V.addObj({ id: WB.uid(), k: 'i', by: 'T', x: c.x, y: c.y, w: ww, h: hh, r: 0, fx: false, src: id });
        renderTools(); toast('🖼️ 已加入圖片，可以拖角落調整大小');
      };
      im.onerror = function () { toast('這張圖片打不開'); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function addPastedText(t) {
    t = (t || '').trim(); if (!t) return;
    addText(t, false);
  }
  document.addEventListener('paste', function (e) {
    var a = document.activeElement; if (a && (a.isContentEditable || /INPUT|TEXTAREA/.test(a.tagName))) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].type.indexOf('image/') === 0) { e.preventDefault(); addImageFile(items[i].getAsFile()); return; }
    var t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); addPastedText(t); }
  });
  function pasteButton() {
    if (!navigator.clipboard || !navigator.clipboard.read) { toast('這台裝置請直接按 Ctrl+V（Mac 按 ⌘+V）貼上'); return; }
    navigator.clipboard.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i], img = it.types.filter(function (t) { return t.indexOf('image/') === 0; })[0];
        if (img) return it.getType(img).then(function (b) { addImageFile(new File([b], 'paste', { type: img })); });
      }
      for (var j = 0; j < items.length; j++) if (items[j].types.indexOf('text/plain') >= 0) return items[j].getType('text/plain').then(function (b) { return b.text(); }).then(addPastedText);
      toast('剪貼簿裡沒有圖片或文字');
    }).catch(function () { toast('沒有權限讀取剪貼簿，請改按 Ctrl+V（Mac 按 ⌘+V）'); });
  }
  $('file-in').onchange = function () { [].forEach.call(this.files, addImageFile); this.value = ''; };
  $('board-host').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('board-host').addEventListener('drop', function (e) { e.preventDefault(); [].forEach.call(e.dataTransfer.files || [], addImageFile); });

  /* 圖片存在這台裝置的 IndexedDB（容量比較大） */
  var idb = null;
  function idbOpen(cb) {
    if (idb) return cb(idb);
    try { var r = indexedDB.open('wb-imgs', 1); r.onupgradeneeded = function () { r.result.createObjectStore('i'); }; r.onsuccess = function () { idb = r.result; cb(idb); }; r.onerror = function () { cb(null); }; } catch (e) { cb(null); }
  }
  function idbPut(id, d) { idbOpen(function (db) { if (db) try { db.transaction('i', 'readwrite').objectStore('i').put(d, id); } catch (e) {} }); }
  function idbLoadAll(cb) {
    idbOpen(function (db) {
      if (!db) return cb();
      var st = db.transaction('i').objectStore('i'), rq = st.openCursor();
      rq.onsuccess = function () { var c = rq.result; if (c) { WB.imgs[c.key] = c.value; c.continue(); } else cb(); };
      rq.onerror = function () { cb(); };
    });
  }
  WB.onImg(function () { boardChanged('P:' + S.cur); for (var g in wallThumbs) boardChanged('G:' + g); S.pages.forEach(function (p) { boardChanged('P:' + p.id); }); });

  /* ---------- 頁面 ---------- */
  var thumbs = {};
  function renderPages() {
    var box = $('pages'); box.innerHTML = '';
    box.appendChild(el('div', 'pages-h', '畫板頁面'));
    S.pages.forEach(function (p, i) {
      var card = el('div', 'pg' + (p.id === S.cur && tv.kind === 'page' ? ' on' : '') + (p.id === S.cur ? ' live' : ''));
      var cv = el('canvas'); cv.width = 160; cv.height = 90; thumbs[p.id] = cv; drawThumb(cv, p.objs);
      card.appendChild(el('span', 'pg-no', i + 1));
      card.appendChild(cv);
      if (p.id === S.cur) card.appendChild(el('span', 'pg-tag', S.mode === 'present' && !S.cast ? '學生看這頁' : '顯示中'));
      card.onclick = function () { S.cur = p.id; tv = { kind: 'page' }; save(); refreshAll(); showBoard(); };
      if (S.pages.length > 1) {
        var x = btn('pg-del', '✕', function (e) { e.stopPropagation(); confirmBox('要刪除第 ' + (i + 1) + ' 頁嗎？（刪掉就救不回來）', '刪除', function () { delPage(p.id); }); });
        x.title = '刪除這一頁'; card.appendChild(x);
      }
      box.appendChild(card);
    });
    box.appendChild(btn('pg-add', '＋ 新增一頁', function () {
      var np = { id: WB.uid(), objs: [] }, idx = S.pages.findIndex(function (p) { return p.id === S.cur; });
      S.pages.splice(idx + 1, 0, np); S.cur = np.id; tv = { kind: 'page' }; save(); refreshAll(); showBoard();
      setTimeout(function () { var on = box.querySelector('.pg.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }, 30);
    }));
  }
  function delPage(pid) {
    var i = S.pages.findIndex(function (p) { return p.id === pid; }); if (i < 0 || S.pages.length < 2) return;
    S.pages.splice(i, 1);
    if (S.cur === pid) S.cur = S.pages[Math.max(0, i - 1)].id;
    if (S.assignAll === pid) S.assignAll = null;
    for (var g in S.groups) { delete S.groups[g].boards[pid]; if (S.groups[g].cur === pid) S.groups[g].cur = null; }
    save(); refreshAll(); showBoard(); renderWall();
  }
  function drawThumb(cv, objs) { WB.render(cv.getContext('2d'), objs || [], cv.width / WB.W, '#fff', true); }
  var pend = {}, pendT = null;
  function boardChanged(bid) {
    pend[bid] = 1; if (pendT) return;
    pendT = setTimeout(function () {
      pendT = null; var b = pend; pend = {};
      for (var k in b) {
        if (k.slice(0, 2) === 'P:') { var cv = thumbs[k.slice(2)], p = page(k.slice(2)); if (cv && p) drawThumb(cv, p.objs); }
        else { var tc = wallThumbs[k.slice(2)]; if (tc) drawThumb(tc, objsOf(k)); }
      }
    }, 400);
  }

  /* ---------- 模式 ---------- */
  function renderMode() {
    [].forEach.call($('mode-seg').children, function (b) { b.classList.toggle('on', b.dataset.m === S.mode); });
    document.body.classList.toggle('mode-work', S.mode === 'work');
  }
  $('mode-seg').onclick = function (e) {
    var m = e.target.closest('button'); if (!m) return; m = m.dataset.m;
    if (m === S.mode) return;
    if (m === 'work') {
      var any = Object.keys(S.groups).some(function (g) { return S.groups[g].cur; });
      if (!any) {
        assignBox(function () { S.mode = 'work'; S.cast = null; save(); renderMode(); refreshAll(); renderCtx(); renderPages(); renderWall(); });
        return;
      }
      S.cast = null;
    }
    S.mode = m; save(); renderMode(); refreshAll(); renderCtx(); renderPages(); renderWall();
    toast(m === 'work' ? '✏️ 作業模式：被指派畫板的學生可以開始畫了' : '📽️ 簡報模式：全班都只能看老師的畫面');
  };
  function assign(gid, pid, quiet) {
    var g = S.groups[gid], p = page(pid); if (!g || !p) return;
    if (!g.boards[pid]) g.boards[pid] = WB.clone(p.objs).map(function (o) { o.by = 'T'; o.id = WB.uid(); return o; });
    g.cur = pid;
    if (!quiet) { save(); members(gid).forEach(function (s) { refresh(s); }); boardChanged('G:' + gid); }
    if (tv.kind === 'group' && tv.gid === gid) showBoard();
  }
  function assignBox(after) {
    modal(function (box) {
      box.appendChild(el('h3', '', '📋 指派畫板'));
      box.appendChild(el('p', '', '要把 <b>第 ' + pageNo(S.cur) + ' 頁</b> 指派給全部組別嗎？每一組會拿到一份自己的畫板（老師畫好的內容學生擦不掉）。之後新加入的學生也會自動拿到這一頁。<br>想讓不同組拿不同頁，可以到「📺 監控牆」每一組的選單另外指定。'));
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '✅ 指派給全部組別', function () {
        S.assignAll = S.cur;
        Object.keys(S.groups).forEach(function (g) { if (members(g).length) assign(g, S.cur, true); });
        save(); closeModal(); after && after(); refreshAll(); renderWall();
        toast('已把第 ' + pageNo(S.cur) + ' 頁指派給全部組別');
      }));
      box.appendChild(row);
    });
  }

  /* ---------- 學生名單與畫筆權限 ---------- */
  function setPenAll(b) { S.penAll = b; for (var s in S.students) S.students[s].pen = null; save(); refreshAll(); renderRoster(); renderWall(); toast(b ? '✏️ 已開放全部學生的畫筆' : '🚫 已關閉全部學生的畫筆'); }
  function togglePen(sid) { S.students[sid].pen = !penOK(sid); if (S.students[sid].pen === S.penAll) S.students[sid].pen = null; save(); refresh(sid); renderRoster(); renderWall(); }
  /* ---------- 分組 ---------- */
  var picked = {};
  function customGroups() { return Object.keys(S.groups).filter(function (g) { return S.groups[g].custom; }).sort(function (a, b) { return (+a.slice(1)) - (+b.slice(1)); }); }
  function gname(gid) {
    var g = S.groups[gid]; if (!g) return gid;
    if (g.custom) return g.name || ('第 ' + gid.slice(1) + ' 組');
    var m = members(gid); return m[0] || gid;
  }
  function newGroup() {
    var cg = customGroups(); if (cg.length >= 30) { toast('最多只能有 30 組'); return null; }
    var n = 1; while (S.groups['c' + n]) n++;
    S.groups['c' + n] = { name: '第 ' + n + ' 組', boards: {}, cur: null, custom: true };
    return 'c' + n;
  }
  function moveTo(sids, gid) {
    var g = S.groups[gid]; if (!g) return;
    var room = 30 - members(gid).filter(function (s) { return sids.indexOf(s) < 0; }).length, moved = 0;
    sids.forEach(function (s) {
      if (moved >= room) return;
      S.students[s].gid = gid; moved++;
    });
    if (moved < sids.length) toast('一組最多 30 人，有 ' + (sids.length - moved) + ' 位沒有移過去');
    if (!g.cur && S.mode === 'work' && S.assignAll && page(S.assignAll)) assign(gid, S.assignAll, true);
    if (S.cast && !members(S.cast).length) S.cast = null;
    save(); refreshAll(); renderRoster(); renderWall(); renderCtx();
  }
  function personalAll() {
    Object.keys(S.students).forEach(function (s) {
      var gid = 'g' + s; S.students[s].gid = gid;
      if (!S.groups[gid]) S.groups[gid] = { name: '', boards: {}, cur: null };
      if (!S.groups[gid].cur && S.mode === 'work' && S.assignAll && page(S.assignAll)) assign(gid, S.assignAll, true);
    });
    customGroups().forEach(function (g) { delete S.groups[g]; });
    if (S.cast && !S.groups[S.cast]) S.cast = null;
    if (tv.kind === 'group' && !S.groups[tv.gid]) tv = { kind: 'page' };
    save(); refreshAll(); renderRoster(); renderWall(); showBoard();
  }
  function autoGroups(n) {
    customGroups().forEach(function (g) { delete S.groups[g]; });
    var ids = Object.keys(S.students).sort(), on = ids.filter(function (s) { return online[s]; });
    if (on.length) ids = on.concat(ids.filter(function (s) { return !online[s]; }));
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var gs = []; for (var k = 0; k < n; k++) gs.push(newGroup());
    ids.forEach(function (s, i) { S.students[s].gid = gs[i % n]; });
    gs.forEach(function (g) { if (S.mode === 'work' && S.assignAll && page(S.assignAll)) assign(g, S.assignAll, true); });
    if (S.cast && !S.groups[S.cast]) S.cast = null;
    if (tv.kind === 'group' && !S.groups[tv.gid]) tv = { kind: 'page' };
    save(); refreshAll(); renderRoster(); renderWall(); showBoard();
  }
  function autoBox() {
    modal(function (box) {
      var total = Object.keys(S.students).length;
      box.appendChild(el('h3', '', '🎲 自動分組'));
      box.appendChild(el('p', '', '把 ' + total + ' 位學生隨機分成幾組？（原本的分組會被取消，各組畫板會清空重來）'));
      var i = el('input', 'wide-in'); i.type = 'number'; i.min = 1; i.max = 30; i.value = Math.min(30, Math.max(1, Math.ceil(total / 4))); box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '開始分組', function () { var n = Math.round(+i.value); if (!(n >= 1 && n <= 30)) return toast('組數要在 1～30 之間'); if (Math.ceil(total / n) > 30) return toast('這樣一組會超過 30 人，請多分幾組'); closeModal(); autoGroups(n); toast('已分成 ' + n + ' 組'); }));
      box.appendChild(row);
    });
  }
  function setPen(sids, b) { sids.forEach(function (s) { S.students[s].pen = b === S.penAll ? null : b; }); save(); sids.forEach(function (s) { refresh(s); }); renderRoster(); renderWall(); }
  function renameGroup(gid) {
    modal(function (box) {
      box.appendChild(el('h3', '', '✏️ 組名'));
      var i = el('input', 'wide-in'); i.value = gname(gid); i.maxLength = 12; box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '確定', function () { S.groups[gid].name = i.value.trim() || gname(gid); save(); closeModal(); refreshAll(); renderRoster(); renderWall(); }));
      box.appendChild(row); setTimeout(function () { i.select(); }, 30);
    });
  }

  function renderRoster() {
    var ids = Object.keys(S.students).sort();
    $('h-count').textContent = ids.filter(function (s) { return online[s]; }).length + '/' + ids.length;
    var side = $('side'); if (side.hidden) return;
    var sc = side.scrollTop; side.innerHTML = '';
    for (var k in picked) if (!S.students[k]) delete picked[k];
    var h = el('div', 'side-h'); h.appendChild(el('b', '', '👥 學生與分組')); h.appendChild(btn('x', '✕', function () { side.hidden = true; V.refit(); })); side.appendChild(h);
    var pr = el('div', 'pen-all'); pr.appendChild(el('span', '', '全部學生的畫筆'));
    pr.appendChild(btn('btn sm' + (S.penAll ? ' primary' : ''), '全開', function () { setPenAll(true); }));
    pr.appendChild(btn('btn sm' + (!S.penAll ? ' danger' : ''), '全關', function () { setPenAll(false); }));
    side.appendChild(pr);
    var ga = el('div', 'grp-acts');
    ga.appendChild(btn('btn sm', '＋ 新增一組', function () { if (newGroup()) { save(); renderRoster(); renderWall(); } }));
    ga.appendChild(btn('btn sm', '🎲 自動分組', autoBox));
    ga.appendChild(btn('btn sm', '↺ 恢復一人一組', function () { confirmBox('要取消所有分組、恢復成一人一組嗎？（各組共用的畫板會被刪除）', '恢復一人一組', personalAll); }));
    side.appendChild(ga);
    var pk = Object.keys(picked);
    if (pk.length) {
      var bar = el('div', 'bulk');
      bar.appendChild(el('b', '', '已勾選 ' + pk.length + ' 人'));
      bar.appendChild(btn('btn sm primary', '✏️ 開畫筆', function () { setPen(pk, true); }));
      bar.appendChild(btn('btn sm danger', '🚫 關畫筆', function () { setPen(pk, false); }));
      var sel = el('select'); sel.appendChild(new Option('移到…', ''));
      customGroups().forEach(function (g) { sel.appendChild(new Option(gname(g) + '（' + members(g).length + '人）', g)); });
      sel.appendChild(new Option('＋ 新的一組', '_new'));
      sel.appendChild(new Option('各自一人一組', '_self'));
      sel.onchange = function () {
        var v = sel.value; if (!v) return;
        if (v === '_self') { pk.forEach(function (s) { var gid = 'g' + s; if (!S.groups[gid]) S.groups[gid] = { name: '', boards: {}, cur: null }; S.students[s].gid = gid; if (!S.groups[gid].cur && S.mode === 'work' && S.assignAll) assign(gid, S.assignAll, true); }); picked = {}; save(); refreshAll(); renderRoster(); renderWall(); return; }
        if (v === '_new') { v = newGroup(); if (!v) return; }
        picked = {}; moveTo(pk, v);
      };
      bar.appendChild(sel);
      bar.appendChild(btn('btn sm', '取消勾選', function () { picked = {}; renderRoster(); }));
      side.appendChild(bar);
    }
    if (!ids.length) side.appendChild(el('p', 'empty', '還沒有學生加入。按上方「教室代碼」顯示 QR code 給學生掃。'));
    function row(s) {
      var r = el('div', 'stu' + (online[s] ? '' : ' off') + (picked[s] ? ' picked' : ''));
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!picked[s]; cb.onchange = function () { if (cb.checked) picked[s] = 1; else delete picked[s]; renderRoster(); };
      r.appendChild(cb);
      r.appendChild(el('span', 'dot ' + (online[s] ? 'online' : 'offline')));
      r.appendChild(el('b', '', s));
      r.appendChild(el('span', 'grow'));
      r.appendChild(btn('pen-tg' + (penOK(s) ? ' on' : ''), penOK(s) ? '✏️ 可畫' : '🚫 不可畫', function () { togglePen(s); }));
      return r;
    }
    customGroups().forEach(function (g) {
      var ms = members(g), sec = el('div', 'grp');
      var gh = el('div', 'grp-h');
      var all = el('input'); all.type = 'checkbox'; all.checked = ms.length > 0 && ms.every(function (s) { return picked[s]; });
      all.onchange = function () { ms.forEach(function (s) { if (all.checked) picked[s] = 1; else delete picked[s]; }); renderRoster(); };
      gh.appendChild(all);
      var nm = btn('gname', '👥 ' + gname(g), function () { renameGroup(g); }); nm.title = '點一下改組名'; gh.appendChild(nm);
      gh.appendChild(el('span', 'cnt', ms.length + ' 人'));
      gh.appendChild(el('span', 'grow'));
      if (ms.length) {
        var on = ms.every(penOK);
        gh.appendChild(btn('pen-tg' + (on ? ' on' : ''), on ? '✏️ 整組可畫' : '🚫 整組', function () { setPen(ms, !on); }));
      } else gh.appendChild(btn('ic', '🗑', function () { delete S.groups[g]; save(); renderRoster(); renderWall(); }));
      sec.appendChild(gh);
      if (!ms.length) sec.appendChild(el('p', 'empty sm', '還沒有人。勾選學生後用「移到…」放進這一組。'));
      ms.forEach(function (s) { sec.appendChild(row(s)); });
      side.appendChild(sec);
    });
    var solo = ids.filter(function (s) { var g = S.groups[S.students[s].gid]; return !g || !g.custom; });
    if (solo.length) {
      var sec = el('div', 'grp solo');
      var gh = el('div', 'grp-h');
      var all = el('input'); all.type = 'checkbox'; all.checked = solo.every(function (s) { return picked[s]; });
      all.onchange = function () { solo.forEach(function (s) { if (all.checked) picked[s] = 1; else delete picked[s]; }); renderRoster(); };
      gh.appendChild(all); gh.appendChild(el('b', '', '🙋 一人一組')); gh.appendChild(el('span', 'cnt', solo.length + ' 人'));
      sec.appendChild(gh);
      solo.forEach(function (s) { sec.appendChild(row(s)); });
      side.appendChild(sec);
    }
    side.appendChild(el('p', 'hint', '畫筆權限只在「作業模式」有作用；簡報模式時學生一律只能看。同一組的人會一起畫同一塊畫板。'));
    side.scrollTop = sc;
  }
  $('b-roster').onclick = function () { $('side').hidden = !$('side').hidden; renderRoster(); V.refit(); };

  /* ---------- 監控牆 ---------- */
  var wallThumbs = {};
  function renderWall() {
    var w = $('wall'); if (w.hidden) return;
    w.innerHTML = ''; wallThumbs = {};
    var h = el('div', 'wall-h');
    h.appendChild(el('b', '', '📺 監控牆'));
    h.appendChild(btn('btn sm' + (S.wallShow ? ' primary' : ''), '👁 全開', function () { S.wallShow = true; S.show = {}; save(); renderWall(); }));
    h.appendChild(btn('btn sm' + (!S.wallShow ? ' primary' : ''), '🙈 全關', function () { S.wallShow = false; S.show = {}; save(); renderWall(); }));
    var pr = el('span', 'pen-all'); pr.appendChild(el('span', '', '畫筆'));
    pr.appendChild(btn('btn sm' + (S.penAll ? ' primary' : ''), '全開', function () { setPenAll(true); }));
    pr.appendChild(btn('btn sm' + (!S.penAll ? ' danger' : ''), '全關', function () { setPenAll(false); }));
    h.appendChild(pr);
    h.appendChild(btn('btn sm', '📋 把目前頁指派給全部', function () { assignBox(); }));
    h.appendChild(el('span', 'grow'));
    h.appendChild(btn('btn', '✕ 關閉監控牆', function () { w.hidden = true; }));
    w.appendChild(h);
    var grid = el('div', 'wall-grid');
    var gids = customGroups().filter(function (g) { return members(g).length; }).concat(Object.keys(S.groups).filter(function (g) { return !S.groups[g].custom && members(g).length; }).sort(function (a, b) { return members(a)[0] < members(b)[0] ? -1 : 1; }));
    if (!gids.length) grid.appendChild(el('p', 'empty', '還沒有學生加入教室。'));
    gids.forEach(function (gid) {
      var g = S.groups[gid], ms = members(gid), on = ms.some(function (s) { return online[s]; });
      var shown = S.show[gid] != null ? S.show[gid] : S.wallShow;
      var tile = el('div', 'tile' + (on ? '' : ' off') + (S.cast === gid ? ' casting' : ''));
      var th = el('div', 'tile-h');
      th.appendChild(el('span', 'dot ' + (on ? 'online' : 'offline')));
      th.appendChild(el('b', '', gname(gid)));
      if (g.custom) th.appendChild(el('span', 'mems', ms.join('、')));
      th.appendChild(el('span', 'grow'));
      var eye = btn('ic', shown ? '👁' : '🙈', function (e) { e.stopPropagation(); S.show[gid] = !shown; save(); renderWall(); }); eye.title = shown ? '蓋住這一格' : '打開這一格'; th.appendChild(eye);
      tile.appendChild(th);
      var body = el('div', 'tile-b');
      if (!g.cur) body.appendChild(el('div', 'tile-msg', '尚未指派畫板'));
      else if (!shown) body.appendChild(el('div', 'tile-msg mask', '🙈 已蓋住'));
      else { var cv = el('canvas'); cv.width = 320; cv.height = 180; wallThumbs[gid] = cv; drawThumb(cv, g.boards[g.cur]); body.appendChild(cv); }
      body.onclick = function () { if (!g.cur) return toast('這一組還沒有指派畫板，先在下方選一頁指派'); tv = { kind: 'group', gid: gid }; w.hidden = true; showBoard(); };
      tile.appendChild(body);
      var ft = el('div', 'tile-f');
      var sel = el('select'); sel.title = '指派哪一頁給這一組';
      sel.appendChild(new Option('未指派', ''));
      S.pages.forEach(function (p, i) { sel.appendChild(new Option('第 ' + (i + 1) + ' 頁', p.id)); });
      sel.value = g.cur || '';
      sel.onclick = function (e) { e.stopPropagation(); };
      sel.onchange = function () { if (sel.value) assign(gid, sel.value); else { g.cur = null; save(); ms.forEach(function (s) { refresh(s); }); } renderWall(); };
      ft.appendChild(sel);
      var pon = ms.every(penOK); ft.appendChild(btn('pen-tg sm' + (pon ? ' on' : ''), pon ? '✏️' : '🚫', function () { setPen(ms, !pon); }));
      var cb = btn('ic', '📽️', function () {
        if (!g.cur) return toast('這一組還沒有畫板可以分享');
        S.cast = S.cast === gid ? null : gid; if (S.cast) S.mode = 'present';
        save(); renderMode(); refreshAll(); renderCtx(); renderPages(); renderWall();
        toast(S.cast ? '📽️ 全班改看 ' + gname(gid) + ' 的畫面（已切回簡報模式）' : '已停止分享');
      });
      cb.title = S.cast === gid ? '停止分享' : '把這一組的畫面分享給全班看'; ft.appendChild(cb);
      tile.appendChild(ft);
      grid.appendChild(tile);
    });
    w.appendChild(grid);
  }
  $('b-wall').onclick = function () { $('wall').hidden = false; renderWall(); };

  /* ---------- 加入 / QR / 開新教室 ---------- */
  function joinUrl() {
    var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return base + 'play.html' + (WBNet.LOCAL ? '?local=1' : '');
  }
  function copy(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {}); else { var a = el('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); } }
  $('b-join').onclick = function () {
    modal(function (box) {
      box.classList.add('join-box');
      var q = qrcode(0, 'M'); q.addData(joinUrl()); q.make();
      box.appendChild(el('div', 'qr', q.createSvgTag({ cellSize: 6, margin: 1, scalable: true })));
      var r = el('div', 'join-r');
      r.appendChild(el('div', 'lbl', '① 掃 QR code 或打開連結'));
      var u = btn('url', '<span>' + joinUrl() + '</span><em>📋 點一下複製連結</em>', function () { copy(joinUrl()); u.querySelector('em').textContent = '✅ 已複製，可以貼給學生了'; });
      r.appendChild(u);
      r.appendChild(el('div', 'lbl', '② 輸入教室代碼'));
      r.appendChild(el('div', 'big-code', S.code));
      r.appendChild(el('div', 'lbl', '③ 輸入自己的學號（只能打數字，最多 6 位）'));
      r.appendChild(btn('btn', '關閉', closeModal));
      box.appendChild(r);
    });
  };
  $('b-new').onclick = function () {
    confirmBox('要開一間新教室嗎？會換一組新的教室代碼，學生需要重新加入；畫板頁面會保留。', '開新教室', function () {
      var old = net; S = fresh(true); tv = { kind: 'page' }; save(); old && old.send({ t: 'closed' }, '*'); connect(); renderAll(); $('b-join').click();
    });
  };

  /* ---------- 對話框 ---------- */
  function modal(build) { var m = $('modal'), b = $('modal-box'); b.className = 'modal-box'; b.innerHTML = ''; build(b); m.hidden = false; }
  function closeModal() { $('modal').hidden = true; }
  $('modal').onclick = function (e) { if (e.target.id === 'modal') closeModal(); };
  function confirmBox(msg, ok, fn) {
    modal(function (box) {
      box.appendChild(el('p', '', msg));
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn danger', ok, function () { closeModal(); fn(); }));
      box.appendChild(row);
    });
  }

  function renderAll() { renderMode(); showBoard(); renderRoster(); renderWall(); }
  V.setLocked(!!S.lock);
  idbLoadAll(function () { connect(); renderAll(); });
  if (!Object.keys(S.students).length) setTimeout(function () { $('b-join').click(); }, 300);
  window.__wb = { S: function () { return S; }, V: V };
})();
