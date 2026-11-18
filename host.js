/* 共用畫板・老師端：老師這台是總管，保存所有頁面、小組畫板與學生名單 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var COLORS = ['#111111', '#e53935', '#1e63d6', '#16a34a', '#f08c00', '#8e44ad', '#ff4fa3', '#ffffff'];
  var PALETTE = ['#111111', '#555555', '#e53935', '#f08c00', '#f5c400', '#16a34a', '#1e63d6', '#8e44ad', '#ff4fa3', '#8b5a2b', '#ffffff',
    '#ffd6e0', '#ffe5c2', '#fff3a6', '#d9f5d0', '#cfe8ff', '#e6d9ff', '#ffcccc', '#c8f0ec'];
  var NOTE_COLORS = [['#fff3a6', '黃'], ['#ffd6e5', '粉紅'], ['#cfe8ff', '藍'], ['#d4f5d0', '綠'], ['#e6d9ff', '紫'], ['#ffe0c2', '橙']];
  var WIDTHS = [3, 6, 12];
  var S, net, tv = { kind: 'page' }, online = {}, lastSent = {};

  function fresh(keep) {
    var p = { id: WB.uid(), objs: [], bg: '' };
    return {
      v: 2, code: WBNet.code(),
      pages: keep && S ? S.pages : [p], cur: keep && S ? S.cur : p.id,
      mode: 'present', cast: null, assignAll: null,
      groups: {}, students: {}, penAll: true, noteAll: false, wallShow: false, show: {},
      lock: keep && S ? S.lock : false, workMins: keep && S ? S.workMins : 3, workEnd: null, zoom: null,
      pagesOpen: keep && S ? S.pagesOpen : true, projName: keep && S ? S.projName : ''
    };
  }

  /* ---------- 儲存：全部存在這台裝置的 IndexedDB（容量大，頁數不設上限） ---------- */
  var idb = null;
  function idbOpen(cb) {
    if (idb) return cb(idb);
    try {
      var r = indexedDB.open('wb-imgs', 2);
      r.onupgradeneeded = function () { var db = r.result; if (!db.objectStoreNames.contains('i')) db.createObjectStore('i'); if (!db.objectStoreNames.contains('s')) db.createObjectStore('s'); };
      r.onsuccess = function () { idb = r.result; cb(idb); }; r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function idbPut(store, k, v) { idbOpen(function (db) { if (db) try { db.transaction(store, 'readwrite').objectStore(store).put(v, k); } catch (e) {} }); }
  function idbGet(store, k, cb) { idbOpen(function (db) { if (!db) return cb(null); try { var q = db.transaction(store).objectStore(store).get(k); q.onsuccess = function () { cb(q.result); }; q.onerror = function () { cb(null); }; } catch (e) { cb(null); } }); }
  function idbLoadImgs(cb) {
    idbOpen(function (db) {
      if (!db) return cb();
      var rq = db.transaction('i').objectStore('i').openCursor();
      rq.onsuccess = function () { var c = rq.result; if (c) { WB.imgs[c.key] = c.value; c.continue(); } else cb(); };
      rq.onerror = function () { cb(); };
    });
  }
  var saveT = null;
  function save() { if (saveT) return; saveT = setTimeout(function () { saveT = null; idbPut('s', 'S', JSON.stringify(S)); }, 600); }

  function toast(t) { var x = $('toast'); x.textContent = t; x.classList.add('on'); clearTimeout(x._t); x._t = setTimeout(function () { x.classList.remove('on'); }, 2800); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(cls, html, fn) { var b = el('button', cls, html); b.onclick = fn; return b; }
  function page(pid) { for (var i = 0; i < S.pages.length; i++) if (S.pages[i].id === pid) return S.pages[i]; return null; }
  function pageIdx(pid) { for (var i = 0; i < S.pages.length; i++) if (S.pages[i].id === pid) return i; return -1; }
  function pageNo(pid) { var i = pageIdx(pid); return i < 0 ? '?' : i + 1; }
  function members(gid) { return Object.keys(S.students).filter(function (s) { return S.students[s].gid === gid; }).sort(); }
  function customGroups() { return Object.keys(S.groups).filter(function (g) { return S.groups[g].custom; }).sort(function (a, b) { return (+a.slice(1)) - (+b.slice(1)); }); }
  function liveGroups() {
    return customGroups().filter(function (g) { return members(g).length; }).concat(Object.keys(S.groups).filter(function (g) { return !S.groups[g].custom && members(g).length; }).sort(function (a, b) { return members(a)[0] < members(b)[0] ? -1 : 1; }));
  }
  function gname(gid) {
    if (gid === 'T') return '老師';
    var g = S.groups[gid]; if (!g) return gid;
    if (g.custom) return g.name || ('第 ' + gid.slice(1) + ' 組');
    var m = members(gid); return m[0] || gid;
  }
  function objsOf(bid) {
    if (!bid) return null;
    if (bid.slice(0, 2) === 'P:') { var p = page(bid.slice(2)); return p ? p.objs : null; }
    var g = S.groups[bid.slice(2)]; return g && g.cur ? g.boards[g.cur] : null;
  }
  function bgOf(bid) {
    if (!bid) return '';
    if (bid.slice(0, 2) === 'P:') { var p = page(bid.slice(2)); return p ? p.bg || '' : ''; }
    var g = S.groups[bid.slice(2)], q = g && g.cur && page(g.cur); return q ? q.bg || '' : '';
  }
  function penOK(sid) { var st = S.students[sid]; if (!st) return false; return st.pen == null ? S.penAll : st.pen; }
  function noteOK(gid) { var g = S.groups[gid]; if (!g) return false; return g.note == null ? S.noteAll : g.note; }

  /* ---------- 學生看到的畫面 ---------- */
  function castBid() { if (!S.cast) return null; if (S.cast.src === 'T') return 'P:' + S.cur; var g = S.groups[S.cast.src]; return g && g.cur ? 'G:' + S.cast.src : null; }
  function viewFor(sid) {
    var st = S.students[sid], gid = st.gid, g = S.groups[gid], cb = castBid();
    var isSrc = S.cast && S.cast.src === gid;
    var target = cb && !isSrc && (!S.cast.to || S.cast.to.indexOf(gid) >= 0);
    var end = S.mode === 'work' ? S.workEnd : null;
    if (target) return { bid: cb, pen: false, note: false, title: '📽️ 老師正在分享' + (S.cast.src === 'T' ? '老師' : '「' + gname(S.cast.src) + '」') + '的畫面', mode: S.mode, end: end, vp: S.cast.src === 'T' ? S.zoom : null };
    var mayWork = g && g.cur && page(g.cur) && (S.mode === 'work' || isSrc);
    if (mayWork) {
      var free = !g.lock && !(isSrc && S.cast.pen === false);
      return { bid: 'G:' + gid, pen: free && penOK(sid), note: free && noteOK(gid), title: (isSrc ? '📽️ 你們的畫面正在分享給大家・' : '✏️ 作業時間・') + '第 ' + pageNo(g.cur) + ' 頁' + (g.custom ? '（' + gname(gid) + '）' : '') + (g.lock ? '・🔒 老師暫停操作' : ''), mode: S.mode, end: end, vp: null };
    }
    return { bid: 'P:' + S.cur, pen: false, note: false, title: S.mode === 'work' ? '⏳ 老師還沒有指派畫板給你，先看老師的畫面' : S.mode === 'show' ? '📽️ 簡報中：看老師的畫面' : '🧑‍🏫 上課中：看老師的畫面', mode: S.mode, end: end, vp: S.mode !== 'work' ? S.zoom : null };
  }
  function genOf(bid) { if (bid.slice(0, 2) === 'G:') { var g = S.groups[bid.slice(2)]; return g ? g.cur : ''; } return ''; }
  function metaKey(v) { return [v.pen, v.note, v.title, v.mode, v.end, JSON.stringify(v.vp), bgOf(v.bid)].join('|'); }
  function refresh(sid, force) {
    var st = S.students[sid]; if (!st || !online[sid]) return;
    var v = viewFor(sid), L = lastSent[sid], m = { cid: st.cid, bid: v.bid, pen: v.pen, note: v.note, title: v.title, mode: v.mode, left: v.end ? Math.max(0, v.end - Date.now()) : null, vp: v.vp, bg: bgOf(v.bid) };
    if (force || !L || L.bid !== v.bid || L.gen !== genOf(v.bid)) { m.t = 'view'; m.objs = objsOf(v.bid) || []; net.send(m, sid);
      if (V && V.bid === v.bid) m.objs.forEach(function (o) { var vs = o.k === 'v' && V.vt[o.id]; if (vs && vs.s === 1) net.send({ t: 'vid', bid: v.bid, id: o.id, cmd: 'play', at: vs.t || 0 }, sid); }); }
    else if (L.key !== metaKey(v)) { m.t = 'meta'; net.send(m, sid); }
    lastSent[sid] = { bid: v.bid, gen: genOf(v.bid), key: metaKey(v), pen: v.pen, note: v.note };
  }
  function refreshAll(force) { Object.keys(S.students).forEach(function (s) { refresh(s, force); }); }
  function viewers(bid) { return Object.keys(S.students).filter(function (s) { return online[s] && lastSent[s] && lastSent[s].bid === bid; }); }
  function distribute(bid, msg, except) {
    var vs = viewers(bid).filter(function (s) { return s !== except; });
    if (!vs.length) return;
    if (except) msg.from = except;
    msg.bid = bid;
    if (vs.length > 3) { net.send(msg, '*'); return; }
    vs.forEach(function (s) { net.send(msg, s); });
  }

  /* ---------- 連線 ---------- */
  function connect() {
    if (net) net.close();
    online = {}; lastSent = {};
    net = WBNet.open({ code: S.code, role: 'host', onMessage: onMsg, onStatus: function (s) {
      $('h-net').className = 'dot ' + s;
      if (s === 'online' && WBNet.LOCAL) net.send({ t: 'hostup' }, '*');
    }, onLine: function () { setTimeout(function () { net.send({ t: 'hostup' }, '*'); }, 300); } });
    $('h-code').textContent = S.code;
  }
  function num(v, d) { v = +v; return isFinite(v) ? Math.round(v) : d; }
  function cleanNote(o, sid) {
    var c = NOTE_COLORS.map(function (x) { return x[0]; }).indexOf(o.c) >= 0 ? o.c : NOTE_COLORS[0][0];
    return { id: String(o.id), k: 'n', by: sid, x: num(o.x, 600), y: num(o.y, 300), w: Math.max(60, Math.min(900, num(o.w, 220))), h: Math.max(60, Math.min(900, num(o.h, 220))), r: ((num(o.r, 0) % 360) + 360) % 360, fx: false, c: c, txt: String(o.txt || '').slice(0, 400), fs: Math.max(14, Math.min(80, num(o.fs, 28))) };
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
      refresh(sid, true); save(); renderRoster(); renderTask(); return;
    }
    if (!st || st.cid !== d.cid) { if (st) net.send({ t: 'replaced', cid: d.cid }, sid); return; }
    var was = online[sid]; online[sid] = Date.now();
    if (!was) { refresh(sid, true); renderRoster(); renderTask(); }
    var L = lastSent[sid];
    if (d.t === 'op') {
      if (!L || d.bid !== L.bid || (!L.pen && !L.note)) { refresh(sid, true); return; }
      var objs = objsOf(d.bid); if (!objs) return;
      var op = d.op || {}, byId = {}; objs.forEach(function (o) { byId[o.id] = o; });
      var addIds = {}; (op.add || []).forEach(function (o) { if (o && o.id) addIds[o.id] = 1; });
      var del = (op.del || []).filter(function (id) {
        var o = byId[id]; if (!o || o.by === 'T') return false;
        if (o.k === 's') return L.pen; if (o.k === 'n') return L.note && o.by === sid; return false;
      });
      var add = [];
      (op.add || []).forEach(function (o) {
        if (!o || !o.id) return;
        var ex = byId[o.id];
        if (o.k === 's' && L.pen && o.by !== 'T' && Array.isArray(o.p) && o.p.length < 20000 && (!ex || ex.k === 's'))
          add.push({ id: String(o.id), k: 's', by: String(o.by), c: '#111111', w: Math.min(12, Math.max(1, +o.w || 4)), p: o.p });
        else if (o.k === 'n' && L.note && (!ex || (ex.k === 'n' && ex.by === sid))) add.push(cleanNote(o, sid));
      });
      var clean = { del: del.filter(function (id) { return !addIds[id] || add.some(function (a) { return a.id === id; }); }), add: add };
      WB.applyOp(objs, clean);
      if (V.bid === d.bid) V.apply(d.bid, clean);
      distribute(d.bid, { t: 'op', op: clean }, sid);
      boardChanged(d.bid); save();
    } else if (d.t === 'live') {
      if (!L || !L.pen || d.bid !== L.bid || !d.o) return;
      d.o.c = '#111111';
      distribute(d.bid, { t: 'live', o: d.o }, sid);
      if (V.bid === d.bid) V.live(d.bid, d.o);
    } else if (d.t === 'needimg' && Array.isArray(d.ids)) {
      d.ids.slice(0, 20).forEach(function (id) { if (WB.imgs[id]) net.send({ t: 'img', cid: st.cid, id: id, d: WB.imgs[id] }, sid); });
    } else if (d.t === 'sync') refresh(sid, true);
  }
  setInterval(function () {
    var now = Date.now(), ch = false;
    for (var s in online) if (now - online[s] > 25000) { delete online[s]; delete lastSent[s]; ch = true; }
    if (ch) { renderRoster(); renderTask(); }
  }, 5000);

  /* ---------- 老師的畫板 ---------- */
  var V = WB.view($('board-host'), {
    me: 'T', canErase: function () { return true; },
    onOp: function (bid, op, temp) {
      WB.applyOp(objsOf(bid) || [], op);
      distribute(bid, { t: 'op', op: op });
      boardChanged(bid); save(); if (!temp) renderTools();
    },
    onSelect: function (o) { if (pop && pop._obj && (!o || pop._obj !== o.id)) closePop(); },
    onContext: function (o, x, y) { if (S.mode === 'show') return; objMenu(o, x, y); },
    onWantSelect: function () { setMode('select'); },
    wheelZoom: true,
    onLive: function (bid, o) { distribute(bid, { t: 'live', o: o }); },
    onVideo: function (id, cmd, at) { distribute(V.bid, { t: 'vid', id: id, cmd: cmd, at: at }); },
    onViewport: function (vp) {
      if (tv.kind !== 'page') return;
      S.zoom = vp.z > 1.001 ? { x: Math.round(vp.x), y: Math.round(vp.y), z: +vp.z.toFixed(3) } : null; save();
      if (!vpT) vpT = setTimeout(function () { vpT = null; refreshAll(); renderCtx(); }, 120);
    }
  });
  var vpT = null;
  var tool = { mode: 'pen', color: COLORS[1], width: WIDTHS[1], shape: { shape: 'rect', sc: '#111111', sw: 3, fill: false, fc: '#ffd6e0', op: 1, n: 5, rows: 3, cols: 3 } };
  V.setTool(tool); V.setEditable(true);

  function curBid() { return tv.kind === 'group' ? 'G:' + tv.gid : 'P:' + S.cur; }
  function showBoard() {
    if (tv.kind === 'group' && !(S.groups[tv.gid] && S.groups[tv.gid].cur)) tv = { kind: 'page' };
    var bid = curBid();
    V.load(bid, objsOf(bid));
    V.setBg(bgOf(bid));
    V.setViewport(tv.kind === 'page' ? S.zoom : null);
    renderCtx(); renderPages(); renderTools(); renderNav();
  }
  function renderCtx() {
    var c = $('ctx-bar'); c.innerHTML = '';
    if (tv.kind === 'group') {
      var g = S.groups[tv.gid];
      c.className = 'ctx-bar collab';
      c.appendChild(el('span', '', '🤝 正在和 <b>' + gname(tv.gid) + '</b> 一起畫（第 ' + pageNo(g.cur) + ' 頁）・學生看到的畫面不會因此改變'));
      c.appendChild(btn('btn sm' + (g.lock ? ' danger' : ''), g.lock ? '🔒 已鎖定這組操作' : '🔓 鎖定這組操作', function () { toggleLock(tv.gid); }));
      c.appendChild(btn('btn sm', '⬅️ 回到我的畫板', function () { tv = { kind: 'page' }; showBoard(); }));
    } else {
      c.className = 'ctx-bar';
      var txt = S.mode === 'work' ? '✏️ 學生在自己的畫板作答，你正在看第 ' + pageNo(S.cur) + ' 頁' : '全班看第 ' + pageNo(S.cur) + ' / ' + S.pages.length + ' 頁';
      c.appendChild(el('span', '', txt));
      if (S.zoom) {
        c.appendChild(el('span', 'zoom-tag', '🔍 ' + S.zoom.z.toFixed(1) + ' 倍' + (S.mode !== 'work' ? '（學生同步）' : '')));
        c.appendChild(btn('btn sm', '還原大小', function () { V.setViewport(null); S.zoom = null; save(); refreshAll(); renderCtx(); }));
      }
    }
    if (S.cast) {
      var cs = el('div', 'cast-bar');
      cs.appendChild(el('span', '', '📽️ 正在把 <b>' + gname(S.cast.src) + '</b> 的畫面投影給' + (S.cast.to ? ' ' + S.cast.to.map(gname).join('、') : (S.cast.src === 'T' ? '全部組別' : '其他組'))));
      if (S.cast.src !== 'T') cs.appendChild(btn('btn sm' + (S.cast.pen === false ? ' danger' : ' primary'), S.cast.pen === false ? '🚫 被分享的組不能畫' : '✏️ 被分享的組可以繼續畫', function () { S.cast.pen = S.cast.pen === false; save(); refreshAll(); renderCtx(); renderTask(); }));
      cs.appendChild(btn('btn sm' + (S.mode === 'work' ? ' primary' : ''), S.mode === 'work' ? '▶ 繼續作業（停止分享）' : '⏹ 停止投影', stopCast));
      c.appendChild(cs);
    }
  }

  /* ---------- 工具列 ---------- */
  function setMode(m) { tool.mode = m; V.setTool(tool); renderTools(); }
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('pointerdown', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-pop]')) closePop(); }, true);
  function openPop(anchor, build) {
    closePop(); pop = el('div', 'pop'); build(pop); document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, x, y;
    if (anchor.closest('.toolbar')) { x = r.left - pw - 10; y = r.top + r.height / 2 - ph / 2; }
    else { x = r.left + r.width / 2 - pw / 2; y = r.top - ph - 8; if (y < 8) y = r.bottom + 8; }
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, x)) + 'px'; pop.style.top = Math.max(8, Math.min(innerHeight - ph - 8, y)) + 'px';
  }
  function openPopAt(x, y, build) {
    closePop(); pop = el('div', 'pop'); build(pop); document.body.appendChild(pop);
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, x + 4)) + 'px'; pop.style.top = Math.max(8, Math.min(innerHeight - ph - 8, y + 4)) + 'px';
    return pop;
  }
  function renderTools() {
    var t = $('toolbar'); t.innerHTML = '';
    function add(b, title) { if (title) b.title = title; t.appendChild(b); return b; }
    add(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '<span class="pen-ic" style="--c:' + tool.color + '">✏️</span><small>畫筆</small>', function () { setMode('pen'); }));
    for (var i = 0; i < COLORS.length; i += 2) {
      var cs = el('div', 'tcell colors');
      COLORS.slice(i, i + 2).forEach(function (c) { var b = btn('sw' + (tool.mode === 'pen' && tool.color === c ? ' on' : ''), '', function () { tool.color = c; setMode('pen'); }); b.style.background = c; b.title = c; cs.appendChild(b); });
      t.appendChild(cs);
    }
    var ws = el('div', 'tcell widths');
    WIDTHS.forEach(function (w) { var b = btn('wd' + (tool.width === w ? ' on' : ''), '<i style="width:' + (w + 3) + 'px;height:' + (w + 3) + 'px"></i>', function () { tool.width = w; setMode('pen'); }); ws.appendChild(b); });
    t.appendChild(ws);
    add(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { setMode('erase'); }));
    add(btn('tb', '🧹<small>清除筆劃</small>', function () {
      if (!V.objs.some(function (o) { return o.k === 's'; })) return toast('這一頁沒有筆劃');
      V.clear(true); renderTools(); toast('🧹 已清除這一頁所有筆劃（按「上一步」可以復原）');
    }), '只清除筆劃，圖片、文字、圖形會留著');
    add(btn('tb' + (tool.mode === 'select' ? ' on' : ''), '🖐️<small>移動物件</small>', function () { setMode('select'); if (S.lock) toast('🔒 物件目前全部鎖定，要先按「解鎖」才能移動'); else toast('🖐️ 點物件可以移動、縮放；按右鍵或「⋯」有更多設定'); }));
    var sb = add(btn('tb' + (tool.mode === 'shape' ? ' on' : ''), '🔷<small>圖形</small>', function () { shapePanel(sb); })); sb.dataset.pop = 1;
    var nb = add(btn('tb', '📝<small>便利貼</small>', function () { notePanel(nb); })); nb.dataset.pop = 1;
    var tb2 = add(btn('tb', '🔤<small>文字</small>', function () {
      openPop(tb2, function (p) {
        p.appendChild(el('div', 'pop-h', '文字框'));
        var r = el('div', 'pop-row');
        r.appendChild(btn('btn', '🔤 橫式', function () { closePop(); addText('', false); }));
        r.appendChild(btn('btn', '↕️ 直式', function () { closePop(); addText('', true); }));
        r.appendChild(btn('btn', '🔗 連結', function () { closePop(); addLinkBox(); }));
        r.appendChild(btn('btn', '🎬 影片', function () { closePop(); addLinkBox(true); }));
        p.appendChild(r);
      });
    })); tb2.dataset.pop = 1;
    add(btn('tb', '🖼️<small>圖片</small>', function () { $('file-in').click(); }));
    add(btn('tb', '📋<small>貼上</small>', pasteButton));
    var bgb = add(btn('tb' + (V.bg ? ' on' : ''), (V.bg === 'grid' ? '▦' : V.bg === 'dots' ? '⁙' : '⬜') + '<small>背景</small>', function () {
      openPop(bgb, function (p) {
        p.appendChild(el('div', 'pop-h', '畫布背景（移動物件時會對齊格子，並顯示幾格）'));
        var r = el('div', 'pop-row');
        [['', '⬜ 空白'], ['dots', '⁙ 格點'], ['grid', '▦ 格線']].forEach(function (b) { r.appendChild(btn('btn' + (V.bg === b[0] ? ' primary' : ''), b[1], function () { closePop(); setBg(b[0]); })); });
        p.appendChild(r);
      });
    })); bgb.dataset.pop = 1;
    add(btn('tb' + (S.lock ? ' on warn' : ''), (S.lock ? '🔒' : '🔓') + '<small>' + (S.lock ? '全部已鎖' : '全部鎖定') + '</small>', function () {
      S.lock = !S.lock; save(); V.setLocked(S.lock); renderTools();
      toast(S.lock ? '🔒 已鎖定所有物件，不會被不小心移動' : '🔓 已解除全部鎖定');
    }), '鎖定或解鎖這一頁所有物件（單一物件請按右鍵鎖定）');
    if (tv.kind === 'page') add(btn('tb' + (tool.mode === 'zoom' ? ' on' : ''), '🔍<small>放大鏡</small>', function () { setMode('zoom'); toast('🔍 框出要放大的地方；也可以按住 Ctrl 再轉滑鼠滾輪' + (S.mode !== 'work' ? '，學生畫面會一起放大' : '')); }), '快捷鍵：按住 Ctrl（Mac 用 ⌘）＋滑鼠滾輪');
    var u = add(btn('tb', '↩️<small>上一步</small>', function () { V.undo(); renderTools(); })); u.disabled = !V.canUndo();
    add(btn('tb danger', '🗑️<small>全清除</small>', function () {
      if (!V.objs.length) return toast('這一頁已經是空白的');
      confirmBox('要把這一頁全部清空嗎？（筆劃、圖片、文字、圖形、便利貼、影片都會清掉；按「上一步」可以復原）', '全部清除', function () { V.clearAll(); renderTools(); });
    }));
  }
  function setBg(b) {
    var pid = tv.kind === 'group' ? S.groups[tv.gid].cur : S.cur, p = page(pid); if (!p) return;
    p.bg = b; save(); V.setBg(b); renderTools(); refreshAll(); boardChanged('P:' + pid);
  }
  function swatches(list, curC, fn, cls) {
    var w = el('div', 'swatches' + (cls ? ' ' + cls : ''));
    list.forEach(function (c) { var b = btn('sw' + (curC === c ? ' on' : ''), '', function () { fn(c); }); b.style.background = c; b.title = c; w.appendChild(b); });
    return w;
  }
  var SHAPES = [['rect', '▭', '長方形'], ['square', '□', '正方形'], ['circle', '○', '圓形'], ['ellipse', '⬭', '橢圓'], ['tri', '△', '三角形'], ['rtri', '◺', '直角三角形'], ['trap', '⏢', '梯形'], ['para', '▱', '平行四邊形'], ['rhom', '◇', '菱形'], ['line', '╱', '直線'], ['arrow', '↗', '箭頭'], ['grid', '▦', '格子']];
  function shapePanel(anchor) {
    var T = tool.shape;
    openPop(anchor, function (p) {
      p.classList.add('shape-pop');
      p.appendChild(el('div', 'pop-h', '🔷 幾何圖形（選好後在畫板上拖曳畫出來）'));
      var g = el('div', 'shape-grid');
      SHAPES.forEach(function (s) { var b = btn('shp' + (T.shape === s[0] ? ' on' : ''), '<span>' + s[1] + '</span><small>' + s[2] + '</small>', function () { T.shape = s[0]; setMode('shape'); shapePanel(anchor); }); g.appendChild(b); });
      p.appendChild(g);
      var g2 = el('div', 'shape-grid polys');
      for (var n = 3; n <= 12; n++) (function (n) { g2.appendChild(btn('shp sm' + (T.shape === 'poly' && T.n === n ? ' on' : ''), '<span>' + n + '</span><small>正' + n + '邊形</small>', function () { T.shape = 'poly'; T.n = n; setMode('shape'); shapePanel(anchor); })); })(n);
      p.appendChild(g2);
      if (T.shape === 'grid') {
        var gr = el('div', 'pop-row');
        gr.appendChild(el('span', '', '格子'));
        var ri = el('input', 'num'); ri.type = 'number'; ri.min = 1; ri.max = 20; ri.value = T.rows; ri.onchange = function () { T.rows = Math.max(1, Math.min(20, +ri.value || 1)); };
        var ci = el('input', 'num'); ci.type = 'number'; ci.min = 1; ci.max = 20; ci.value = T.cols; ci.onchange = function () { T.cols = Math.max(1, Math.min(20, +ci.value || 1)); };
        gr.appendChild(ri); gr.appendChild(el('span', '', '列 ×')); gr.appendChild(ci); gr.appendChild(el('span', '', '行'));
        p.appendChild(gr);
      }
      p.appendChild(slider('粗細', 1, 20, 1, T.sw, function (v) { T.sw = v; }));
      p.appendChild(slider('透明度', 0.1, 1, 0.05, T.op, function (v) { T.op = v; }, function (v) { return Math.round(v * 100) + '%'; }));
      p.appendChild(el('div', 'pop-l', '線條顏色'));
      p.appendChild(swatches(PALETTE, T.sc, function (c) { T.sc = c; shapePanel(anchor); }));
      var fr = el('div', 'pop-row');
      var fc = el('input'); fc.type = 'checkbox'; fc.checked = T.fill; fc.id = 'fillchk'; fc.onchange = function () { T.fill = fc.checked; shapePanel(anchor); };
      var lb = el('label', '', ' 填滿顏色'); lb.htmlFor = 'fillchk'; fr.appendChild(fc); fr.appendChild(lb); p.appendChild(fr);
      if (T.fill) p.appendChild(swatches(PALETTE, T.fc, function (c) { T.fc = c; shapePanel(anchor); }));
    });
  }
  function slider(label, mn, mx, step, val, fn, fmt) {
    var r = el('div', 'pop-row slider');
    r.appendChild(el('span', 'pop-l', label));
    var minus = btn('btn sm', '－', function () { i.value = Math.max(mn, +i.value - step); upd(); });
    var i = el('input'); i.type = 'range'; i.min = mn; i.max = mx; i.step = step; i.value = val;
    var plus = btn('btn sm', '＋', function () { i.value = Math.min(mx, +i.value + step); upd(); });
    var out = el('span', 'val');
    function upd() { var v = +i.value; out.textContent = fmt ? fmt(v) : v; fn(v); }
    i.oninput = upd; out.textContent = fmt ? fmt(+val) : val;
    r.appendChild(minus); r.appendChild(i); r.appendChild(plus); r.appendChild(out);
    return r;
  }
  function notePanel(anchor) {
    openPop(anchor, function (p) {
      p.appendChild(el('div', 'pop-h', '📝 貼一張便利貼'));
      var r = el('div', 'pop-row');
      NOTE_COLORS.forEach(function (c) { var b = btn('note-sw', c[1], function () { closePop(); addNote(c[0]); }); b.style.background = c[0]; r.appendChild(b); });
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l', '學生能不能貼便利貼，在「📋 任務指派」每一組設定。'));
    });
  }

  /* 物件右鍵選單 */
  var KIND = { i: '🖼️ 圖片', t: '🔤 文字框', g: '🔷 圖形', n: '📝 便利貼', v: '🎬 影片' };
  function objMenu(o, x, y) {
    if (!o) { closePop(); return; }
    if (tool.mode !== 'select') setMode('select');
    if (V.sel !== o.id) V.select(o.id);
    o = V.find(o.id); if (!o) return;
    var p = openPopAt(x, y, function (m) {
      m.classList.add('menu', 'objmenu');
      function row() { var r = el('div', 'pop-row'); m.appendChild(r); return r; }
      function again() { var n = V.find(o.id); if (n) objMenu(n, x, y); else closePop(); renderTools(); }
      function chg(patch) { V.change(patch); again(); }
      var h = el('div', 'pop-h'); h.appendChild(el('span', '', KIND[o.k] || '物件')); m.appendChild(h);
      m.appendChild(btn('mi' + (o.lk ? ' on' : ''), o.lk ? '🔓 解除鎖定這個物件' : '🔒 鎖定這個物件（不會被移動或修改）', function () { chg({ lk: !o.lk }); }));
      if (o.lk) { m.appendChild(el('div', 'pop-l', '解除鎖定後才能移動、縮放、修改。')); return; }
      if (o.k === 't' || o.k === 'n' || o.k === 'g') {
        var r1 = row();
        r1.appendChild(btn('btn sm primary', '✏️ ' + (o.k === 'g' ? '在圖形裡打字' : '編輯文字'), function () { closePop(); V.editText(o.id); }));
        r1.appendChild(btn('btn sm', 'A－', function () { chg({ fs: Math.max(14, (o.fs || 32) - 6) }); }));
        r1.appendChild(btn('btn sm', 'A＋', function () { chg({ fs: Math.min(160, (o.fs || 32) + 6) }); }));
        if (o.k === 't') {
          r1.appendChild(btn('btn sm' + (!o.v ? ' primary' : ''), '橫式', function () { if (o.v) chg({ v: false, w: o.h, h: o.w }); }));
          r1.appendChild(btn('btn sm' + (o.v ? ' primary' : ''), '直式', function () { if (!o.v) chg({ v: true, w: o.h, h: o.w }); }));
        }
      }
      if (o.k === 't') {
        m.appendChild(el('div', 'pop-l', '文字顏色'));
        m.appendChild(swatches(COLORS.slice(0, 7), o.c || '#111111', function (c) { chg({ c: c }); }, 'mini'));
        m.appendChild(el('div', 'pop-l', '邊框'));
        var rb = row();
        rb.appendChild(btn('btn sm' + (!o.bd ? ' primary' : ''), '無邊框', function () { chg({ bd: null }); }));
        rb.appendChild(swatches(PALETTE.slice(0, 11), o.bd, function (c) { chg({ bd: c }); }, 'mini'));
        if (o.bd) { rb.appendChild(btn('btn sm', '框－', function () { chg({ bw: Math.max(1, (o.bw || 3) - 1) }); })); rb.appendChild(btn('btn sm', '框＋', function () { chg({ bw: Math.min(20, (o.bw || 3) + 1) }); })); }
      }
      if (o.k === 'n') { m.appendChild(el('div', 'pop-l', '便利貼顏色')); m.appendChild(swatches(NOTE_COLORS.map(function (x) { return x[0]; }), o.c, function (c) { chg({ c: c }); }, 'mini')); }
      if (o.k === 'g') {
        m.appendChild(el('div', 'pop-l', '線條顏色'));
        m.appendChild(swatches(PALETTE, o.sc, function (c) { chg({ sc: c }); }, 'mini'));
        m.appendChild(el('div', 'pop-l', '填滿顏色'));
        var rf = row(); rf.appendChild(btn('btn sm' + (!o.fill ? ' primary' : ''), '不填色', function () { chg({ fill: false }); }));
        rf.appendChild(swatches(PALETTE, o.fill ? o.fc : null, function (c) { chg({ fill: true, fc: c }); }, 'mini'));
        var rl = row();
        rl.appendChild(btn('btn sm', '線－', function () { chg({ sw: Math.max(1, (o.sw || 3) - 1) }); }));
        rl.appendChild(btn('btn sm', '線＋', function () { chg({ sw: Math.min(30, (o.sw || 3) + 1) }); }));
        rl.appendChild(btn('btn sm', '淡一點', function () { chg({ op: Math.max(0.1, +((o.op == null ? 1 : o.op) - 0.15).toFixed(2)) }); }));
        rl.appendChild(btn('btn sm', '濃一點', function () { chg({ op: Math.min(1, +((o.op == null ? 1 : o.op) + 0.15).toFixed(2)) }); }));
        if (o.txt) { m.appendChild(el('div', 'pop-l', '圖形裡的文字顏色')); m.appendChild(swatches(COLORS.slice(0, 7), o.tc || '#111111', function (c) { chg({ tc: c }); }, 'mini')); }
      }
      var ra = row(); ra.appendChild(el('span', 'pop-l', '旋轉'));
      var ai = el('input', 'num'); ai.type = 'number'; ai.min = 0; ai.max = 360; ai.value = o.r || 0;
      ai.onchange = function () { var v = Math.round(+ai.value) || 0; v = +ai.value === 360 ? 360 : ((v % 360) + 360) % 360; chg({ r: v }); };
      ra.appendChild(ai); ra.appendChild(el('span', '', '度'));
      [[-15, '↺15°'], [15, '↻15°'], [90, '↻90°']].forEach(function (a) { ra.appendChild(btn('btn sm', a[1], function () { chg({ r: (((o.r || 0) + a[0]) % 360 + 360) % 360 }); })); });
      if (o.k !== 'n' && o.k !== 'v') ra.appendChild(btn('btn sm' + (o.fx ? ' primary' : ''), '🪞 鏡像', function () { chg({ fx: !o.fx }); }));
      if (o.k === 'v') m.appendChild(el('div', 'pop-l', '🎬 直接按影片上的播放、暫停或拖時間軸，學生的這部影片會跟著同步。'));
      var rz = row();
      rz.appendChild(btn('btn sm', '📄 複製', function () { var n = WB.clone(o); n.id = WB.uid(); n.x += 40; n.y += 40; delete n.lk; closePop(); V.addObj(n); renderTools(); }));
      rz.appendChild(el('span', 'grow'));
      rz.appendChild(btn('btn sm danger', '🗑 刪除', function () { closePop(); V.deleteSel(); renderTools(); }));
    });
    p._obj = o.id;
  }
  document.addEventListener('keydown', function (e) {
    var ed = document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !ed) { e.preventDefault(); V.undo(); renderTools(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !ed && V.sel) { e.preventDefault(); var so = V.find(V.sel); if (so && so.lk) return toast('🔒 這個物件鎖定了，要先解除鎖定'); closePop(); V.deleteSel(); renderTools(); }
    else if (e.key === 'Escape') { closePop(); if (document.fullscreenElement && S.mode === 'show') {} }
    else if (S.mode === 'show' && !ed && $('modal').hidden && /^(ArrowRight|ArrowDown|PageDown| )$/.test(e.key)) { e.preventDefault(); flip(1); }
    else if (S.mode === 'show' && !ed && $('modal').hidden && /^(ArrowLeft|ArrowUp|PageUp)$/.test(e.key)) { e.preventDefault(); flip(-1); }
  });

  /* ---------- 加入圖片、文字、便利貼、連結 ---------- */
  function center(w, h) {
    var vp = V.vp, cx = vp.x + WB.W / vp.z / 2, cy = vp.y + WB.H / vp.z / 2;
    return { x: Math.round(cx - w / 2 + (Math.random() * 60 - 30)), y: Math.round(cy - h / 2 + (Math.random() * 40 - 20)) };
  }
  function toSelect() { tool.mode = 'select'; V.setTool(tool); if (S.lock) { S.lock = false; save(); V.setLocked(false); } }
  function addText(txt, vert) {
    var w = vert ? 140 : 520, h = vert ? 420 : 120, c = center(w, h);
    toSelect();
    V.addObj({ id: WB.uid(), k: 't', by: 'T', x: c.x, y: c.y, w: w, h: h, r: 0, fx: false, txt: txt, v: !!vert, fs: 36, c: '#111111' });
    renderTools();
    if (!txt) setTimeout(function () { V.editText(V.sel); }, 30);
  }
  function ytId(t) {
    var m = String(t || '').trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})([^\s]*)$/);
    if (!m) return null; var st = (m[2].match(/[?&#]t=(\d+)/) || [])[1];
    return { yt: m[1], st: st ? +st : 0 };
  }
  function addSmart(t) { var y = ytId(t); if (y) addVideo(y); else addText(t, false); }
  function addVideo(y) {
    var c = center(640, 360); toSelect();
    V.addObj({ id: WB.uid(), k: 'v', by: 'T', x: c.x, y: c.y, w: 640, h: 360, r: 0, fx: false, yt: y.yt, st: y.st || 0 });
    renderTools(); toast('🎬 已加入影片。你按播放／暫停時，學生的影片會跟著同步');
  }
  function addNote(color) {
    var c = center(220, 220); toSelect();
    V.addObj({ id: WB.uid(), k: 'n', by: 'T', x: c.x, y: c.y, w: 220, h: 220, r: 0, fx: false, c: color, txt: '', fs: 28 });
    renderTools(); setTimeout(function () { V.editText(V.sel); }, 30);
  }
  function addLinkBox(video) {
    modal(function (box) {
      box.appendChild(el('h3', '', video ? '🎬 加入 YouTube 影片' : '🔗 加入連結'));
      box.appendChild(el('p', '', video ? '把 YouTube 影片網址貼在下面，畫板上會出現可以播放的影片框。（不允許嵌入的影片會變成一般連結）' : '把網址貼在下面，畫板上會出現可以點的連結；YouTube 網址會自動變成影片框。'));
      var i = el('input', 'wide-in'); i.placeholder = 'https://…'; box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '加入', function () {
        var u = i.value.trim(); if (!u) return; if (!/^https?:\/\//.test(u) && !/^www\./.test(u)) u = 'https://' + u;
        closeModal(); addSmart(u);
      }));
      box.appendChild(row); setTimeout(function () { i.focus(); }, 30);
    });
  }
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
        var id = 'im' + WB.uid(); WB.setImg(id, d); idbPut('i', id, d);
        var f = Math.min(1, (WB.W * 0.7) / w, (WB.H * 0.7) / h), ww = Math.round(w * f), hh = Math.round(h * f), c = center(ww, hh);
        toSelect();
        V.addObj({ id: WB.uid(), k: 'i', by: 'T', x: c.x, y: c.y, w: ww, h: hh, r: 0, fx: false, src: id });
        renderTools(); toast('🖼️ 已加入圖片，可以拖角落調整大小');
      };
      im.onerror = function () { toast('這張圖片打不開'); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  document.addEventListener('paste', function (e) {
    var a = document.activeElement; if (a && (a.isContentEditable || /INPUT|TEXTAREA/.test(a.tagName))) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].type.indexOf('image/') === 0) { e.preventDefault(); addImageFile(items[i].getAsFile()); return; }
    var t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t && t.trim()) { e.preventDefault(); addSmart(t.trim()); }
  });
  function pasteButton() {
    if (!navigator.clipboard || !navigator.clipboard.read) { toast('這台裝置請直接按 Ctrl+V（Mac 按 ⌘+V）貼上'); return; }
    navigator.clipboard.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i], img = it.types.filter(function (t) { return t.indexOf('image/') === 0; })[0];
        if (img) return it.getType(img).then(function (b) { addImageFile(new File([b], 'paste', { type: img })); });
      }
      for (var j = 0; j < items.length; j++) if (items[j].types.indexOf('text/plain') >= 0) return items[j].getType('text/plain').then(function (b) { return b.text(); }).then(function (t) { if (t.trim()) addSmart(t.trim()); });
      toast('剪貼簿裡沒有圖片或文字');
    }).catch(function () { toast('沒有權限讀取剪貼簿，請改按 Ctrl+V（Mac 按 ⌘+V）'); });
  }
  $('file-in').onchange = function () { [].forEach.call(this.files, addImageFile); this.value = ''; };
  $('board-host').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('board-host').addEventListener('drop', function (e) { e.preventDefault(); [].forEach.call(e.dataTransfer.files || [], addImageFile); });
  WB.onImg(function () { S.pages.forEach(function (p) { boardChanged('P:' + p.id); }); for (var g in taskThumbs) boardChanged('G:' + g); });

  /* ---------- 頁面欄（可收合，每頁有 ⋯ 選單） ---------- */
  var thumbs = {};
  function renderPages() {
    var box = $('pages'); box.innerHTML = '';
    document.body.classList.toggle('pages-closed', !S.pagesOpen);
    $('pages-open').hidden = !!S.pagesOpen;
    if (!S.pagesOpen) { V.refit(); return; }
    var h = el('div', 'pages-h'); h.appendChild(el('span', '', '畫板頁面（' + S.pages.length + '）'));
    h.appendChild(btn('ic', '◀', function () { S.pagesOpen = false; save(); renderPages(); setTimeout(V.refit, 50); })).title = '收起頁面欄';
    box.appendChild(h);
    var list = el('div', 'pg-list');
    S.pages.forEach(function (p, i) {
      var card = el('div', 'pg' + (p.id === S.cur && tv.kind === 'page' ? ' on' : ''));
      var cv = el('canvas'); cv.width = 160; cv.height = 90; thumbs[p.id] = cv; drawThumb(cv, p.objs);
      card.appendChild(el('span', 'pg-no', i + 1));
      card.appendChild(cv);
      var tags = [];
      if (p.id === S.cur) tags.push(S.mode !== 'work' ? '學生看這頁' : '老師畫面');
      var ag = liveGroups().filter(function (g) { return S.groups[g].cur === p.id; }).length;
      if (ag) tags.push('指派 ' + ag + ' 組');
      if (tags.length) card.appendChild(el('span', 'pg-tag', tags.join('・')));
      card.onclick = function (e) { if (e.target.closest('.pg-menu')) return; S.cur = p.id; S.zoom = null; tv = { kind: 'page' }; save(); refreshAll(); showBoard(); };
      var mb = btn('pg-menu', '⋯', function (e) { e.stopPropagation(); pageMenu(mb, p); }); mb.title = '更多動作'; mb.dataset.pop = 1;
      card.appendChild(mb);
      list.appendChild(card);
    });
    box.appendChild(list);
    box.appendChild(btn('pg-add', '＋ 新增一頁', function () { newPage(S.cur); }));
  }
  $('pages-open').onclick = function () { S.pagesOpen = true; save(); renderPages(); setTimeout(V.refit, 50); };
  function newPage(after, objs, bg) {
    var np = { id: WB.uid(), objs: objs || [], bg: bg || '' }, idx = pageIdx(after);
    S.pages.splice(idx + 1, 0, np); S.cur = np.id; S.zoom = null; tv = { kind: 'page' }; save(); refreshAll(); showBoard();
    setTimeout(function () { var on = $('pages').querySelector('.pg.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }, 30);
    return np;
  }
  function pageMenu(anchor, p) {
    var i = pageIdx(p.id);
    openPop(anchor, function (m) {
      m.classList.add('menu');
      m.appendChild(el('div', 'pop-h', '第 ' + (i + 1) + ' 頁'));
      function item(html, fn, cls) { m.appendChild(btn('mi' + (cls ? ' ' + cls : ''), html, function () { closePop(); fn(); })); }
      item('📽️ 顯示這一頁（老師畫面）', function () { S.cur = p.id; S.zoom = null; tv = { kind: 'page' }; save(); refreshAll(); showBoard(); });
      item('📋 指派給組別…', function () { openTask([p.id]); });
      item('📋 直接指派給全部組別', function () { assignPages([p.id], liveGroups()); S.assignAll = p.id; save(); toast('已把第 ' + (i + 1) + ' 頁指派給全部組別' + (S.mode === 'work' ? '' : '，按「作業模式」學生才能開始操作')); });
      if (liveGroups().some(function (g) { return S.groups[g].cur === p.id; })) item('⛔ 收回這一頁的指派', function () { liveGroups().forEach(function (g) { if (S.groups[g].cur === p.id) S.groups[g].cur = null; }); if (S.assignAll === p.id) S.assignAll = null; save(); refreshAll(); renderPages(); renderTask(); });
      item('📄 複製這一頁', function () { newPage(p.id, WB.clone(p.objs).map(function (o) { o.id = WB.uid(); return o; }), p.bg); toast('已複製成第 ' + (i + 2) + ' 頁'); });
      item('➕ 在後面新增空白頁', function () { newPage(p.id); });
      if (i > 0) item('⬆️ 往前移', function () { S.pages.splice(i, 1); S.pages.splice(i - 1, 0, p); save(); renderPages(); refreshAll(); });
      if (i < S.pages.length - 1) item('⬇️ 往後移', function () { S.pages.splice(i, 1); S.pages.splice(i + 1, 0, p); save(); renderPages(); refreshAll(); });
      item('▦ 背景：' + ({ '': '空白', dots: '格點', grid: '格線' }[p.bg || '']) + '（點一下換）', function () { p.bg = { '': 'dots', dots: 'grid', grid: '' }[p.bg || '']; save(); if (curBid() === 'P:' + p.id) V.setBg(p.bg); refreshAll(); boardChanged('P:' + p.id); renderTools(); });
      item('🧹 清除這一頁的筆劃', function () { confirmBox('要清除第 ' + (i + 1) + ' 頁的所有筆劃嗎？（圖片、文字、圖形、便利貼會保留）', '清除', function () { var rem = p.objs.filter(function (o) { return o.k === 's'; }).map(function (o) { return o.id; }); WB.applyOp(p.objs, { del: rem }); distribute('P:' + p.id, { t: 'op', op: { del: rem, add: [] } }); if (V.bid === 'P:' + p.id) V.apply(V.bid, { del: rem }); save(); boardChanged('P:' + p.id); }); });
      item('💾 這一頁另存成圖片', function () { var cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900; WB.render(cv.getContext('2d'), p.objs, 1, '#fff', true); var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = '畫板第' + (i + 1) + '頁.png'; a.click(); });
      if (S.pages.length > 1) item('🗑️ 刪除這一頁', function () { confirmBox('要刪除第 ' + (i + 1) + ' 頁嗎？（指派到這一頁的組別作答內容也會一起刪除，刪掉就救不回來）', '刪除', function () { delPage(p.id); }); }, 'danger');
    });
  }
  function delPage(pid) {
    var i = pageIdx(pid); if (i < 0 || S.pages.length < 2) return;
    S.pages.splice(i, 1);
    if (S.cur === pid) { S.cur = S.pages[Math.max(0, i - 1)].id; S.zoom = null; }
    if (S.assignAll === pid) S.assignAll = null;
    for (var g in S.groups) { delete S.groups[g].boards[pid]; if (S.groups[g].cur === pid) S.groups[g].cur = null; }
    save(); refreshAll(); showBoard(); renderTask();
  }
  function drawThumb(cv, objs) { WB.render(cv.getContext('2d'), objs || [], cv.width / WB.W, '#fff', true); }
  var pend = {}, pendT = null;
  function boardChanged(bid) {
    pend[bid] = 1; if (pendT) return;
    pendT = setTimeout(function () {
      pendT = null; var b = pend; pend = {};
      for (var k in b) {
        if (k.slice(0, 2) === 'P:') { var cv = thumbs[k.slice(2)], p = page(k.slice(2)); if (cv && p) drawThumb(cv, p.objs); var tp = taskPageThumbs[k.slice(2)]; if (tp && p) drawThumb(tp, p.objs); }
        else { var tc = taskThumbs[k.slice(2)]; if (tc) drawThumb(tc, objsOf(k)); }
      }
    }, 400);
  }

  /* ---------- 模式與作業計時 ---------- */
  function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function renderMode() {
    [].forEach.call($('mode-seg').children, function (b) { b.classList.toggle('on', b.dataset.m === S.mode); });
    document.body.classList.toggle('mode-work', S.mode === 'work');
    document.body.classList.toggle('mode-show', S.mode === 'show');
    V.setEditable(S.mode !== 'show');
    if (S.mode === 'show') { closePop(); if (V.sel) V.select(null); }
    renderNav();
    var tm = $('timer'); tm.innerHTML = ''; tm.className = 'timer';
    if (S.mode === 'work') {
      tm.hidden = false;
      tm.appendChild(el('span', 'clock', S.workEnd ? '⏱ ' + fmt(S.workEnd - Date.now()) : '⏱ 不限時'));
      if (S.workEnd) tm.appendChild(btn('btn sm', '＋1分', function () { S.workEnd += 60000; save(); refreshAll(); renderMode(); }));
      if (S.cast) tm.appendChild(btn('btn sm primary', '▶ 繼續作業', function () { stopCast(); })).title = '停止分享畫面，讓學生回到自己的作業';
      tm.appendChild(btn('btn sm danger', '結束作業', function () { endWork(false); }));
    } else if (canResume()) {
      tm.hidden = false; tm.className = 'timer paused';
      tm.appendChild(el('span', 'clock', '⏸ 作業暫停中' + (S.workLeft ? '（還剩 ' + fmt(S.workLeft) + '）' : '')));
      tm.appendChild(btn('btn sm primary', '▶ 繼續作業', resumeWork)).title = '讓學生回到剛剛的作業畫板繼續作答';
    } else tm.hidden = true;
  }
  setInterval(function () {
    if (S && S.mode === 'work' && S.workEnd) {
      var c = document.querySelector('#timer .clock'); if (c) c.textContent = '⏱ ' + fmt(S.workEnd - Date.now());
      if (Date.now() >= S.workEnd) endWork(true);
    }
  }, 500);
  var MODE_NAME = { present: '上課模式', show: '簡報模式', work: '作業模式' };
  function canResume() { return S.mode !== 'work' && S.workPaused && liveGroups().some(function (g) { return S.groups[g].cur; }); }
  function resumeWork() {
    var left = S.workLeft;
    S.mode = 'work'; S.workPaused = false; S.cast = null; S.zoom = null;
    S.workEnd = left && left > 30000 ? Date.now() + left : left === null ? null : (S.workMins ? Date.now() + S.workMins * 60000 : null);
    S.workLeft = null; tv = { kind: 'page' };
    save(); V.setViewport(null); renderMode(); refreshAll(); showBoard(); renderTask();
    toast('▶ 繼續作業，學生回到自己的畫板' + (S.workEnd ? '（剩 ' + fmt(S.workEnd - Date.now()) + '）' : '（不限時）'));
  }
  function endWork(auto, to) {
    var was = S.mode; to = to || 'present';
    if (was === 'work') { S.workPaused = true; S.workLeft = S.workEnd ? Math.max(0, S.workEnd - Date.now()) : null; }
    S.mode = to; S.workEnd = null;
    if (was === 'work') S.cast = null;
    if (auto) setTimeout(function () {
      modal(function (box) {
        box.appendChild(el('h3', '', '⏰ 作業時間到了'));
        box.appendChild(el('p', '', '學生已經回到老師的畫面（上課模式），他們的作答都有保留。還需要時間的話，可以讓學生繼續作業。'));
        var row = el('div', 'modal-btns');
        row.appendChild(btn('btn', '好', closeModal));
        row.appendChild(btn('btn primary', '▶ 再給 ' + (S.workMins || 3) + ' 分鐘', function () { closeModal(); S.workLeft = 0; resumeWork(); }));
        box.appendChild(row);
      });
    }, 50);
    if (to === 'show' && tv.kind !== 'page') tv = { kind: 'page' };
    save(); renderMode(); refreshAll(); showBoard(); renderTask();
    toast(was === 'work' ? (auto ? '⏰ 作業時間到了，已自動回到上課模式' : '已結束作業，切換到' + MODE_NAME[to]) : to === 'show' ? '📽️ 簡報模式：只能翻頁和播放影片，按 ← → 鍵或下方按鈕換頁' : '🧑‍🏫 上課模式：可以用所有工具，學生只能看');
  }
  function flip(d) {
    var i = pageIdx(S.cur) + d; if (i < 0 || i >= S.pages.length) return toast(d > 0 ? '已經是最後一頁' : '已經是第一頁');
    S.cur = S.pages[i].id; S.zoom = null; tv = { kind: 'page' }; save(); refreshAll(); showBoard();
  }
  function renderNav() {
    var n = $('show-nav'); if (!n) return;
    n.hidden = S.mode !== 'show'; if (n.hidden) return;
    n.innerHTML = '';
    var i = pageIdx(S.cur);
    var a = btn('btn', '◀ 上一頁', function () { flip(-1); }); a.disabled = i <= 0; n.appendChild(a);
    n.appendChild(el('b', '', (i + 1) + ' / ' + S.pages.length));
    var b = btn('btn primary', '下一頁 ▶', function () { flip(1); }); b.disabled = i >= S.pages.length - 1; n.appendChild(b);
  }
  function startWork(mins) {
    S.workMins = mins; S.workEnd = mins ? Date.now() + mins * 60000 : null; S.mode = 'work'; S.zoom = null; S.workPaused = false; S.workLeft = null;
    if (S.cast && S.cast.src !== 'T') { /* 保留分享 */ } else S.cast = null;
    save(); V.setViewport(null); renderMode(); refreshAll(); renderCtx(); renderPages(); renderTask();
    toast('✏️ 作業模式開始' + (mins ? '，' + mins + ' 分鐘後自動回到上課模式' : '（不限時）'));
  }
  $('mode-seg').onclick = function (e) {
    var m = e.target.closest('button'); if (!m) return; m = m.dataset.m;
    if (m === S.mode) return;
    if (m === 'work') workBox(); else endWork(false, m);
  };
  function workBox() {
    var any = liveGroups().some(function (g) { return S.groups[g].cur; });
    modal(function (box) {
      box.appendChild(el('h3', '', '✏️ 開始作業模式'));
      if (!any) box.appendChild(el('p', 'warn-p', '還沒有任何組別被指派畫板。按下開始時，會先把<b>第 ' + pageNo(S.cur) + ' 頁</b>指派給全部組別。'));
      box.appendChild(el('p', '', '作業時間（時間到會自動回到上課模式）：'));
      var r = el('div', 'pop-row'), val = S.workMins == null ? 3 : S.workMins;
      [1, 2, 3, 5, 8, 10, 15].forEach(function (m) { r.appendChild(btn('btn sm' + (val === m ? ' primary' : ''), m + ' 分', function () { val = m; i.value = m; [].forEach.call(r.children, function (c) { c.classList.toggle('primary', c === this); }, this); })); });
      var i = el('input', 'num'); i.type = 'number'; i.min = 0; i.max = 180; i.value = val; i.oninput = function () { val = Math.max(0, Math.min(180, +i.value || 0)); };
      r.appendChild(i); r.appendChild(el('span', '', '分鐘（0 = 不限時）'));
      box.appendChild(r);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '▶ 開始作業', function () {
        if (!any) { S.assignAll = S.cur; assignPages([S.cur], liveGroups()); }
        closeModal(); startWork(val);
      }));
      box.appendChild(row);
    });
  }

  /* ---------- 指派 ---------- */
  function assign(gid, pid, quiet) {
    var g = S.groups[gid], p = page(pid); if (!g || !p) return;
    if (!g.boards[pid]) g.boards[pid] = WB.clone(p.objs).map(function (o) { o.by = 'T'; o.id = WB.uid(); return o; });
    g.cur = pid;
    if (!quiet) { save(); members(gid).forEach(function (s) { refresh(s); }); boardChanged('G:' + gid); }
    if (tv.kind === 'group' && tv.gid === gid) showBoard();
  }
  /* 勾選多頁時依序輪流分給勾選的組別 */
  function assignPages(pids, gids) {
    gids.forEach(function (g, i) { assign(g, pids[i % pids.length], true); });
    save(); refreshAll(); renderPages(); renderTask();
    gids.forEach(function (g) { boardChanged('G:' + g); });
  }
  function toggleLock(gid) {
    var g = S.groups[gid]; g.lock = !g.lock; save(); members(gid).forEach(function (s) { refresh(s); }); renderCtx(); renderTask();
    toast(g.lock ? '🔒 已鎖定「' + gname(gid) + '」的所有操作' : '🔓 「' + gname(gid) + '」可以繼續操作');
  }
  function startCast(src, to) {
    if (src !== 'T' && !(S.groups[src] && S.groups[src].cur)) return toast('這一組還沒有畫板可以分享');
    S.cast = { src: src, pen: S.cast && S.cast.src === src ? S.cast.pen : true, to: to && to.length ? to : null };
    save(); refreshAll(); renderCtx(); renderTask(); renderPages(); renderMode();
    toast('📽️ 開始投影「' + gname(src) + '」的畫面' + (S.mode === 'work' ? '，要讓學生回去作答時按「▶ 繼續作業」' : ''));
  }
  function stopCast() { S.cast = null; save(); refreshAll(); renderCtx(); renderTask(); renderPages(); renderMode(); toast('⏹ 已停止投影，' + (S.mode === 'work' ? '各組回到自己的作業' : '大家回到老師的畫面')); }

  /* ---------- 任務指派區（含監控） ---------- */
  var taskThumbs = {}, taskPageThumbs = {}, tPick = { pages: {}, groups: {} };
  function openTask(pids) { if (pids) { tPick.pages = {}; pids.forEach(function (p) { tPick.pages[p] = 1; }); } $('task').hidden = false; renderTask(); }
  $('b-task').onclick = function () { openTask(); };
  function renderTask() {
    var w = $('task'); if (w.hidden) return;
    var sc = w.querySelector('.task-groups'); var st = sc ? sc.scrollTop : 0;
    w.innerHTML = ''; taskThumbs = {}; taskPageThumbs = {};
    var gids = liveGroups();
    for (var k in tPick.pages) if (!page(k)) delete tPick.pages[k];
    for (var k2 in tPick.groups) if (gids.indexOf(k2) < 0) delete tPick.groups[k2];
    var h = el('div', 'wall-h');
    h.appendChild(el('b', '', '📋 任務指派'));
    h.appendChild(el('span', 'sub', S.mode === 'work' ? '✏️ 作業模式中' + (S.workEnd ? '（剩 ' + fmt(S.workEnd - Date.now()) + '）' : '') : (MODE_NAME[S.mode] || '') + '中（學生只能看）'));
    var g1 = el('span', 'pen-all'); g1.appendChild(el('span', '', '畫面'));
    g1.appendChild(btn('btn sm' + (S.wallShow ? ' primary' : ''), '👁 全開', function () { S.wallShow = true; S.show = {}; save(); renderTask(); }));
    g1.appendChild(btn('btn sm' + (!S.wallShow ? ' primary' : ''), '🙈 全關', function () { S.wallShow = false; S.show = {}; save(); renderTask(); }));
    h.appendChild(g1);
    var g2 = el('span', 'pen-all'); g2.appendChild(el('span', '', '畫筆'));
    g2.appendChild(btn('btn sm' + (S.penAll ? ' primary' : ''), '全開', function () { setPenAll(true); }));
    g2.appendChild(btn('btn sm' + (!S.penAll ? ' danger' : ''), '全關', function () { setPenAll(false); }));
    h.appendChild(g2);
    var g3 = el('span', 'pen-all'); g3.appendChild(el('span', '', '便利貼'));
    g3.appendChild(btn('btn sm' + (S.noteAll ? ' primary' : ''), '全開', function () { S.noteAll = true; gids.forEach(function (g) { S.groups[g].note = null; }); save(); refreshAll(); renderTask(); }));
    g3.appendChild(btn('btn sm' + (!S.noteAll ? ' danger' : ''), '全關', function () { S.noteAll = false; gids.forEach(function (g) { S.groups[g].note = null; }); save(); refreshAll(); renderTask(); }));
    h.appendChild(g3);
    h.appendChild(el('span', 'grow'));
    h.appendChild(btn('btn', '✕ 關閉', function () { w.hidden = true; }));
    w.appendChild(h);

    var body = el('div', 'task-body');
    /* 左：畫板 */
    var left = el('div', 'task-pages');
    left.appendChild(el('div', 'task-l', '① 勾選要指派的畫板'));
    S.pages.forEach(function (p, i) {
      var r = el('label', 'tp' + (tPick.pages[p.id] ? ' on' : ''));
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!tPick.pages[p.id];
      cb.onchange = function () { if (cb.checked) tPick.pages[p.id] = 1; else delete tPick.pages[p.id]; renderTask(); };
      r.appendChild(cb); r.appendChild(el('b', '', i + 1));
      var cv = el('canvas'); cv.width = 128; cv.height = 72; taskPageThumbs[p.id] = cv; drawThumb(cv, p.objs); r.appendChild(cv);
      left.appendChild(r);
    });
    body.appendChild(left);
    /* 右：組別 */
    var right = el('div', 'task-right');
    var tl = el('div', 'task-l'); tl.appendChild(el('span', '', '② 勾選組別'));
    tl.appendChild(btn('btn sm', '全選', function () { gids.forEach(function (g) { tPick.groups[g] = 1; }); renderTask(); }));
    tl.appendChild(btn('btn sm', '全不選', function () { tPick.groups = {}; renderTask(); }));
    tl.appendChild(el('span', 'hint', '點縮圖可以進去和那一組一起畫（學生看到的畫面不會改變）'));
    right.appendChild(tl);
    var grid = el('div', 'wall-grid task-groups');
    if (!gids.length) grid.appendChild(el('p', 'empty', '還沒有學生加入教室。'));
    gids.forEach(function (gid) {
      var g = S.groups[gid], ms = members(gid), on = ms.some(function (s) { return online[s]; });
      var shown = S.show[gid] != null ? S.show[gid] : S.wallShow;
      var src = S.cast && S.cast.src === gid, tgt = S.cast && !src && (!S.cast.to || S.cast.to.indexOf(gid) >= 0);
      var tile = el('div', 'tile' + (on ? '' : ' off') + (src ? ' casting' : '') + (tPick.groups[gid] ? ' picked' : '') + (g.lock ? ' locked' : ''));
      var th = el('div', 'tile-h');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!tPick.groups[gid]; cb.onchange = function () { if (cb.checked) tPick.groups[gid] = 1; else delete tPick.groups[gid]; renderTask(); };
      th.appendChild(cb);
      th.appendChild(el('span', 'dot ' + (on ? 'online' : 'offline')));
      th.appendChild(el('b', '', gname(gid)));
      if (g.custom) th.appendChild(el('span', 'mems', ms.join('、')));
      th.appendChild(el('span', 'grow'));
      var eye = btn('ic', shown ? '👁' : '🙈', function (e) { e.stopPropagation(); S.show[gid] = !shown; save(); renderTask(); }); eye.title = shown ? '蓋住這一格' : '打開這一格'; th.appendChild(eye);
      tile.appendChild(th);
      var bd = el('div', 'tile-b');
      if (!g.cur) bd.appendChild(el('div', 'tile-msg', '尚未指派畫板'));
      else if (!shown) bd.appendChild(el('div', 'tile-msg mask', '🙈 已蓋住'));
      else { var cv = el('canvas'); cv.width = 320; cv.height = 180; taskThumbs[gid] = cv; drawThumb(cv, g.boards[g.cur]); bd.appendChild(cv); }
      if (g.cur) bd.appendChild(el('span', 'tile-pg', '第 ' + pageNo(g.cur) + ' 頁'));
      if (src) bd.appendChild(el('span', 'tile-badge', '📽️ 投影中'));
      else if (tgt) bd.appendChild(el('span', 'tile-badge gray', '正在看投影'));
      if (g.lock) bd.appendChild(el('span', 'tile-badge red', '🔒 已鎖定'));
      bd.onclick = function () { if (!g.cur) return toast('這一組還沒有指派畫板'); tv = { kind: 'group', gid: gid }; w.hidden = true; showBoard(); };
      tile.appendChild(bd);
      var ft = el('div', 'tile-f');
      var pon = ms.every(penOK);
      ft.appendChild(btn('pen-tg sm' + (pon ? ' on' : ''), pon ? '✏️ 畫筆' : '🚫 畫筆', function () { setPen(ms, !pon); })).title = '開關這一組的畫筆';
      var non = noteOK(gid);
      ft.appendChild(btn('pen-tg sm' + (non ? ' on' : ''), non ? '📝 便利貼' : '🚫 便利貼', function () { g.note = !non; if (g.note === S.noteAll) g.note = null; save(); members(gid).forEach(function (s) { refresh(s); }); renderTask(); })).title = '開關這一組的便利貼';
      ft.appendChild(btn('pen-tg sm' + (g.lock ? '' : ' on'), g.lock ? '🔒 鎖定中' : '🔓 可操作', function () { toggleLock(gid); })).title = '鎖定這一組所有操作（畫筆、便利貼）';
      ft.appendChild(btn('ic', src ? '⏹' : '📽️', function () { if (src) stopCast(); else startCast(gid, null); })).title = src ? '停止投影' : '把這一組的畫面投影給其他組看';
      tile.appendChild(ft);
      grid.appendChild(tile);
    });
    right.appendChild(grid);
    body.appendChild(right);
    w.appendChild(body);

    /* 下：動作 */
    var pk = Object.keys(tPick.pages).sort(function (a, b) { return pageIdx(a) - pageIdx(b); }), gk = gids.filter(function (g) { return tPick.groups[g]; });
    var bar = el('div', 'task-bar');
    var a1 = btn('btn primary', '③ 把勾選的 ' + pk.length + ' 頁指派給勾選的 ' + gk.length + ' 組', function () {
      assignPages(pk, gk); toast('✅ 已指派' + (S.mode === 'work' ? '，學生可以開始操作' : '；按「作業模式」學生才能開始操作'));
    });
    a1.disabled = !pk.length || !gk.length; bar.appendChild(a1);
    if (pk.length > 1) bar.appendChild(el('span', 'hint', '勾選多頁時，會依序輪流分給各組（第 1 組拿第一頁、第 2 組拿第二頁…）'));
    var a2 = btn('btn', '⛔ 收回勾選組別的指派', function () { gk.forEach(function (g) { S.groups[g].cur = null; }); save(); refreshAll(); renderPages(); renderTask(); });
    a2.disabled = !gk.length; bar.appendChild(a2);
    bar.appendChild(el('span', 'grow'));
    var cast = el('span', 'cast-ctl');
    cast.appendChild(el('span', '', '📽️ 投影：'));
    cast.appendChild(btn('btn sm' + (S.cast && S.cast.src === 'T' ? ' primary' : ''), '老師畫面 → ' + (gk.length ? '勾選的組' : '全部組'), function () { startCast('T', gk); }));
    if (gk.length === 1) cast.appendChild(btn('btn sm' + (S.cast && S.cast.src === gk[0] ? ' primary' : ''), '「' + gname(gk[0]) + '」→ 其他組', function () { startCast(gk[0], null); }));
    if (S.cast) cast.appendChild(btn('btn sm danger', '⏹ 停止投影', stopCast));
    bar.appendChild(cast);
    if (S.mode !== 'work') bar.appendChild(btn('btn warn', '▶ 開始作業模式', workBox));
    w.appendChild(bar);
    var ng = w.querySelector('.task-groups'); if (ng) ng.scrollTop = st;
  }
  setInterval(function () { var s = document.querySelector('#task .sub'); if (s && S.mode === 'work' && S.workEnd) s.textContent = '✏️ 作業模式中（剩 ' + fmt(S.workEnd - Date.now()) + '）'; }, 1000);

  /* ---------- 學生名單、分組、畫筆權限 ---------- */
  function setPenAll(b) { S.penAll = b; for (var s in S.students) S.students[s].pen = null; save(); refreshAll(); renderRoster(); renderTask(); toast(b ? '✏️ 已開放全部學生的畫筆' : '🚫 已關閉全部學生的畫筆'); }
  function kick(sid) {
    var st = S.students[sid]; if (!st) return;
    net.send({ t: 'kicked', cid: st.cid }, sid);
    var gid = st.gid; delete S.students[sid]; delete online[sid]; delete lastSent[sid]; delete picked[sid];
    if (gid === 'g' + sid && S.groups[gid]) delete S.groups[gid];
    afterRegroup(); toast('已把學號 ' + sid + ' 移出教室');
  }
  function togglePen(sid) { S.students[sid].pen = !penOK(sid); if (S.students[sid].pen === S.penAll) S.students[sid].pen = null; save(); refresh(sid); renderRoster(); renderTask(); }
  function setPen(sids, b) { sids.forEach(function (s) { S.students[s].pen = b === S.penAll ? null : b; }); save(); sids.forEach(function (s) { refresh(s); }); renderRoster(); renderTask(); }
  var picked = {};
  function newGroup() {
    if (customGroups().length >= 30) { toast('最多只能有 30 組'); return null; }
    var n = 1; while (S.groups['c' + n]) n++;
    S.groups['c' + n] = { name: '第 ' + n + ' 組', boards: {}, cur: null, custom: true };
    return 'c' + n;
  }
  function afterRegroup() {
    if (S.cast && S.cast.src !== 'T' && !(S.groups[S.cast.src] && members(S.cast.src).length)) S.cast = null;
    if (tv.kind === 'group' && !(S.groups[tv.gid] && members(tv.gid).length)) tv = { kind: 'page' };
    save(); refreshAll(); renderRoster(); renderTask(); showBoard();
  }
  function moveTo(sids, gid) {
    var g = S.groups[gid]; if (!g) return;
    var room = 30 - members(gid).filter(function (s) { return sids.indexOf(s) < 0; }).length, moved = 0;
    sids.forEach(function (s) { if (moved >= room) return; S.students[s].gid = gid; moved++; });
    if (moved < sids.length) toast('一組最多 30 人，有 ' + (sids.length - moved) + ' 位沒有移過去');
    if (!g.cur && S.assignAll && page(S.assignAll)) assign(gid, S.assignAll, true);
    afterRegroup();
  }
  function personal(sids) {
    sids.forEach(function (s) {
      var gid = 'g' + s; S.students[s].gid = gid;
      if (!S.groups[gid]) S.groups[gid] = { name: '', boards: {}, cur: null };
      if (!S.groups[gid].cur && S.assignAll && page(S.assignAll)) assign(gid, S.assignAll, true);
    });
  }
  function personalAll() { personal(Object.keys(S.students)); customGroups().forEach(function (g) { delete S.groups[g]; }); afterRegroup(); }
  function autoGroups(n) {
    customGroups().forEach(function (g) { delete S.groups[g]; });
    var ids = Object.keys(S.students).sort();
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var gs = []; for (var k = 0; k < n; k++) gs.push(newGroup());
    ids.forEach(function (s, i) { S.students[s].gid = gs[i % n]; });
    gs.forEach(function (g) { if (S.assignAll && page(S.assignAll)) assign(g, S.assignAll, true); });
    afterRegroup();
  }
  function autoBox() {
    modal(function (box) {
      var total = Object.keys(S.students).length;
      box.appendChild(el('h3', '', '🎲 自動分組'));
      box.appendChild(el('p', '', '把 ' + total + ' 位學生隨機分成幾組？（原本的分組會取消，各組畫板會清空重來）'));
      var i = el('input', 'wide-in'); i.type = 'number'; i.min = 1; i.max = 30; i.value = Math.min(30, Math.max(1, Math.ceil(total / 4))); box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '開始分組', function () { var n = Math.round(+i.value); if (!(n >= 1 && n <= 30)) return toast('組數要在 1～30 之間'); if (Math.ceil(total / n) > 30) return toast('這樣一組會超過 30 人，請多分幾組'); closeModal(); autoGroups(n); toast('已分成 ' + n + ' 組'); }));
      box.appendChild(row);
    });
  }
  function renameGroup(gid) {
    modal(function (box) {
      box.appendChild(el('h3', '', '✏️ 組名'));
      var i = el('input', 'wide-in'); i.value = gname(gid); i.maxLength = 12; box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '確定', function () { S.groups[gid].name = i.value.trim() || gname(gid); save(); closeModal(); refreshAll(); renderRoster(); renderTask(); }));
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
    ga.appendChild(btn('btn sm', '＋ 新增一組', function () { if (newGroup()) { save(); renderRoster(); renderTask(); } }));
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
        picked = {};
        if (v === '_self') { personal(pk); afterRegroup(); return; }
        if (v === '_new') { v = newGroup(); if (!v) return; }
        moveTo(pk, v);
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
      var k = btn('kick', '✕', function () { confirmBox('要把學號 ' + s + ' 移出教室嗎？（打錯學號或不在班上的人可以用這個移除；之後他用正確的教室代碼還是可以再加入）', '移出教室', function () { kick(s); }); });
      k.title = '移出教室'; r.appendChild(k);
      return r;
    }
    customGroups().forEach(function (g) {
      var ms = members(g), sec = el('div', 'grp'), gh = el('div', 'grp-h');
      var all = el('input'); all.type = 'checkbox'; all.checked = ms.length > 0 && ms.every(function (s) { return picked[s]; });
      all.onchange = function () { ms.forEach(function (s) { if (all.checked) picked[s] = 1; else delete picked[s]; }); renderRoster(); };
      gh.appendChild(all);
      var nm = btn('gname', '👥 ' + gname(g), function () { renameGroup(g); }); nm.title = '點一下改組名'; gh.appendChild(nm);
      gh.appendChild(el('span', 'cnt', ms.length + ' 人'));
      gh.appendChild(el('span', 'grow'));
      if (ms.length) { var on = ms.every(penOK); gh.appendChild(btn('pen-tg' + (on ? ' on' : ''), on ? '✏️ 整組可畫' : '🚫 整組', function () { setPen(ms, !on); })); }
      else gh.appendChild(btn('ic', '🗑', function () { delete S.groups[g]; save(); renderRoster(); renderTask(); }));
      sec.appendChild(gh);
      if (!ms.length) sec.appendChild(el('p', 'empty sm', '還沒有人。勾選學生後用「移到…」放進這一組。'));
      ms.forEach(function (s) { sec.appendChild(row(s)); });
      side.appendChild(sec);
    });
    var solo = ids.filter(function (s) { var g = S.groups[S.students[s].gid]; return !g || !g.custom; });
    if (solo.length) {
      var sec = el('div', 'grp solo'), gh = el('div', 'grp-h');
      var all = el('input'); all.type = 'checkbox'; all.checked = solo.every(function (s) { return picked[s]; });
      all.onchange = function () { solo.forEach(function (s) { if (all.checked) picked[s] = 1; else delete picked[s]; }); renderRoster(); };
      gh.appendChild(all); gh.appendChild(el('b', '', '🙋 一人一組')); gh.appendChild(el('span', 'cnt', solo.length + ' 人'));
      sec.appendChild(gh);
      solo.forEach(function (s) { sec.appendChild(row(s)); });
      side.appendChild(sec);
    }
    side.appendChild(el('p', 'hint', '按學號右邊的 ✕ 可以把那位學生移出教室。畫筆權限只在「作業模式」有作用；上課和簡報模式時學生一律只能看。同一組的人會一起畫同一塊畫板。'));
    side.scrollTop = sc;
  }
  $('b-roster').onclick = function () { $('side').hidden = !$('side').hidden; renderRoster(); setTimeout(V.refit, 30); };

  /* ---------- 專案：存檔／開啟 ---------- */
  function projectData() {
    var used = {};
    S.pages.forEach(function (p) { p.objs.forEach(function (o) { if (o.k === 'i') used[o.src] = WB.imgs[o.src]; }); });
    return { app: 'class-whiteboard', v: 1, name: S.projName || '', savedAt: new Date().toISOString(), pages: S.pages, imgs: used };
  }
  function loadProject(d) {
    if (!d || d.app !== 'class-whiteboard' || !Array.isArray(d.pages) || !d.pages.length) { toast('這不是共用畫板的專案檔'); return false; }
    Object.keys(d.imgs || {}).forEach(function (id) { if (d.imgs[id]) { WB.setImg(id, d.imgs[id]); idbPut('i', id, d.imgs[id]); } });
    S.pages = d.pages.map(function (p) { return { id: p.id || WB.uid(), objs: p.objs || [], bg: p.bg || '' }; });
    S.cur = S.pages[0].id; S.projName = d.name || ''; S.zoom = null; S.assignAll = null; S.cast = null;
    for (var g in S.groups) { S.groups[g].boards = {}; S.groups[g].cur = null; }
    if (S.mode === 'work') { S.mode = 'present'; S.workEnd = null; }
    tv = { kind: 'page' }; V.hist = {}; save(); renderAll(); refreshAll(true);
    return true;
  }
  function stamp() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2); }
  $('b-proj').onclick = function () {
    modal(function (box) {
      box.appendChild(el('h3', '', '💾 專案'));
      box.appendChild(el('p', '', '專案包含所有畫板頁面、圖片、文字、圖形和便利貼（不含學生名單和作答）。存成檔案後，可以放到雲端硬碟，在別台電腦用「開啟專案檔」繼續編輯。'));
      var nm = el('input', 'wide-in'); nm.placeholder = '專案名稱（例如：三上數學第5課）'; nm.value = S.projName || ''; nm.oninput = function () { S.projName = nm.value.trim(); save(); };
      box.appendChild(nm);
      var r = el('div', 'proj-acts');
      r.appendChild(btn('btn primary', '💾 存成專案檔', function () {
        var blob = new Blob([JSON.stringify(projectData())], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.projName || 'Andice的共用畫板專案') + '_' + stamp() + '.wbproj.json'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 4000);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); toast('💾 已下載專案檔');
      }));
      r.appendChild(btn('btn', '📂 開啟專案檔', function () { $('proj-in').click(); }));
      r.appendChild(btn('btn', '📄 開新的空白專案', function () {
        confirmBox('要開一個新的空白專案嗎？目前的畫板頁面會全部清空（建議先存成專案檔）。', '開新專案', function () { loadProject({ app: 'class-whiteboard', pages: [{ id: WB.uid(), objs: [] }], imgs: {} }); toast('已開新的空白專案'); });
      }));
      box.appendChild(r);
      box.appendChild(el('p', 'hint', '☁️ 雲端金鑰（在別台電腦輸入金鑰就能開啟）會在下一版加入。'));
      var row = el('div', 'modal-btns'); row.appendChild(btn('btn', '關閉', closeModal)); box.appendChild(row);
    });
  };
  $('proj-in').onchange = function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var d; try { d = JSON.parse(fr.result); } catch (e) { return toast('檔案讀不出來'); }
      confirmBox('要開啟「' + (d.name || f.name) + '」嗎？目前的畫板頁面會被取代（' + ((d.pages || []).length) + ' 頁）。', '開啟', function () { if (loadProject(d)) { closeModal(); toast('📂 已開啟專案'); } });
    };
    fr.readAsText(f);
  };

  /* ---------- 加入 / QR / 開新教室 ---------- */
  function joinUrl() { var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''); return base + 'play.html' + (WBNet.LOCAL ? '?local=1' : ''); }
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
  $('b-end').onclick = function () {
    var n = Object.keys(S.students).length;
    confirmBox('要結束這堂課、關閉教室嗎？' + (n ? '教室裡的 ' + n + ' 位學生都會被請出教室，學生名單和分組會清空。' : '') + '畫板頁面會保留。下次上課會換一組新的教室代碼。', '🚪 結束上課', function () {
      var old = net; old && old.send({ t: 'closed' }, '*');
      setTimeout(function () {
        S = fresh(true); tv = { kind: 'page' }; save(); connect(); renderAll();
        modal(function (box) {
          box.appendChild(el('h3', '', '🚪 已結束上課'));
          box.appendChild(el('p', '', '學生都已離開教室，畫板內容都還在。下次上課的新教室代碼是 <b>' + S.code + '</b>（按上方的教室代碼就會顯示 QR code）。'));
          var row = el('div', 'modal-btns'); row.appendChild(btn('btn primary', '好', closeModal)); box.appendChild(row);
        });
      }, 400);
    });
  };
  $('b-full').onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { toast('這台裝置不支援全螢幕'); });
    else toast('這台裝置不支援全螢幕');
  };
  document.addEventListener('fullscreenchange', function () { $('b-full').innerHTML = document.fullscreenElement ? '🗗 離開全螢幕' : '⛶ 全螢幕'; setTimeout(V.refit, 100); });

  /* ---------- 對話框 ---------- */
  function modal(build) { closePop(); var m = $('modal'), b = $('modal-box'); b.className = 'modal-box'; b.innerHTML = ''; build(b); m.hidden = false; }
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

  function renderAll() { renderMode(); showBoard(); renderRoster(); renderTask(); }
  function boot(saved) {
    if (saved) { try { S = JSON.parse(saved); } catch (e) { S = null; } }
    if (!S) { try { var old = JSON.parse(localStorage.getItem('wb-host-v1')); if (old && old.pages) S = old; } catch (e) {} }
    if (!S || !S.pages || !S.pages.length) S = fresh(false);
    if (typeof S.cast === 'string') S.cast = { src: S.cast, pen: true, to: null };
    if (S.workMins == null) S.workMins = 3; if (S.pagesOpen == null) S.pagesOpen = true; if (S.noteAll == null) S.noteAll = false;
    if (S.mode === 'work' && S.workEnd && Date.now() > S.workEnd) { S.mode = 'present'; S.workEnd = null; }
    V.setLocked(!!S.lock);
    connect(); renderAll(); save();
    if (!Object.keys(S.students).length) setTimeout(function () { $('b-join').click(); }, 300);
  }
  idbLoadImgs(function () { idbGet('s', 'S', boot); });
  window.__wb = { S: function () { return S; }, V: V };
})();
