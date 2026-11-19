/* Andice的共用畫板・老師端：老師這台是總管，保存所有頁面、小組畫板與學生名單 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var COLORS = ['#111111', '#e53935', '#1e63d6', '#16a34a', '#f08c00', '#8e44ad', '#ff4fa3', '#ffffff'];
  var PALETTE = ['#111111', '#555555', '#e53935', '#f08c00', '#f5c400', '#16a34a', '#1e63d6', '#8e44ad', '#ff4fa3', '#8b5a2b', '#ffffff',
    '#ffd6e0', '#ffe5c2', '#fff3a6', '#d9f5d0', '#cfe8ff', '#e6d9ff', '#ffcccc', '#c8f0ec'];
  var NOTE_COLORS = [['#fff3a6', '黃'], ['#ffd6e5', '粉紅'], ['#cfe8ff', '藍'], ['#d4f5d0', '綠'], ['#e6d9ff', '紫'], ['#ffe0c2', '橙']];
  var WIDTHS = [3, 6, 12];
  var PENS = [['', '✏️', '原子筆'], ['hl', '🖍️', '螢光筆'], ['mk', '🖊️', '麥克筆'], ['lz', '🔴', '雷射筆']];
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
        if (online[sid] && Date.now() - online[sid] < 20000) { net.send({ t: 'taken', cid: d.cid }, sid); return; }
        net.send({ t: 'replaced', cid: st.cid }, sid);
        st.cid = d.cid;
      }
      online[sid] = Date.now(); delete lastSent[sid];
      net.send({ t: 'welcome', cid: d.cid, sid: sid }, sid);
      if (CD) cdSend(sid);
      if (POLL) pollSend(sid);
      refresh(sid, true); save(); renderRoster(); renderTask(); return;
    }
    if (!st || st.cid !== d.cid) { if (st) net.send({ t: 'replaced', cid: d.cid }, sid); return; }
    var was = online[sid]; online[sid] = Date.now();
    if (!was) { refresh(sid, true); renderRoster(); renderTask(); }
    if (d.t === 'vote') { pollVote(sid, d); return; }
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
      if (layerBox && !temp) layersDraw();
    },
    onSelect: function (o) { if (pop && pop._obj && (!o || pop._obj !== o.id)) closePop(); if (layerBox) layersDraw(); },
    onContext: function (o, x, y) { if (S.mode === 'show') return; objMenu(o, x, y); },
    onWantSelect: function () { setMode('select'); },
    onGroupMenu: function (x, y) { if (S.mode === 'show') return; groupMenu(x, y); },
    onLockedHint: function () { toast(S.lock ? '🔒 物件目前全部鎖定，要先按「全部鎖定」解鎖' : '🔒 圈到的物件裡有鎖定的，按「⋯」可以一次解除鎖定'); },
    onMulti: function (n) { if (n) toast('⭕ 圈到 ' + n + ' 個物件：拖曳移動、拉角落等比例縮放、⟳ 旋轉，按「⋯」或右鍵有更多功能'); },
    wheelZoom: true, mergedSelect: true, showHidden: true,
    onLive: function (bid, o) { distribute(bid, { t: 'live', o: o }); },
    onVideo: function (id, cmd, at) { distribute(V.bid, { t: 'vid', id: id, cmd: cmd, at: at }); },
    onViewport: function (vp) {
      if (tv.kind !== 'page') return;
      S.zoom = vp.z > 1.001 ? { x: Math.round(vp.x), y: Math.round(vp.y), z: +vp.z.toFixed(3) } : null; save();
      if (!vpT) vpT = setTimeout(function () { vpT = null; refreshAll(); renderCtx(); }, 120);
    }
  });
  var vpT = null;
  var tool = { mode: 'pen', pen: '', color: COLORS[1], width: WIDTHS[1], shape: { shape: 'rect', sc: '#111111', sw: 3, fill: false, fc: '#ffd6e0', op: 1, n: 5, rows: 3, cols: 3 } };
  V.setTool(tool); V.setEditable(true);
  /* 放大鏡快捷鍵：Mac 預設 Option（Ctrl 會被 Mac 系統拿去放大螢幕），Windows 預設 Ctrl */
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var ZKEYS = IS_MAC ? [['alt', '⌥ Option'], ['meta', '⌘ Command'], ['shift', '⇧ Shift'], ['z', 'Z 鍵'], ['ctrl', '⌃ Control']] : [['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['z', 'Z 鍵']];
  var ZK_TEST = {}; try { ZK_TEST = JSON.parse(localStorage.getItem('wb-zktest') || '{}') || {}; } catch (e) {}
  /* 已知的衝突：這個畫板自己或瀏覽器常用的組合 */
  var APP_USED = IS_MAC ? { ctrl: '可能被系統縮放佔用', shift: '瀏覽器拿來左右捲動' } : { shift: '瀏覽器拿來左右捲動' };
  var SEL_IC = '<svg class="sel-ic" viewBox="0 0 32 32" width="26" height="26"><rect x="3" y="3" width="17" height="15" fill="none" stroke="#c62828" stroke-width="2.4" stroke-dasharray="4 2.6"/><path d="M12 10 L28 22 L21 23 L25 30 L22 31.5 L18 24.5 L13 29 Z" fill="#a31515" stroke="#fff" stroke-width="1"/></svg>';
  var AKEYS = IS_MAC ? [['shift', '⇧ Shift'], ['meta', '⌘ Command'], ['alt', '⌥ Option']] : [['shift', 'Shift'], ['ctrl', 'Ctrl'], ['alt', 'Alt']];
  function akName(k) { var f = AKEYS.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : k; }
  try { V.addKey = localStorage.getItem('wb-addkey') || ''; } catch (e) { V.addKey = ''; }
  if (!AKEYS.some(function (x) { return x[0] === V.addKey; })) V.addKey = 'shift';
  function selPanel(anchor) {
    if (!anchor) return;
    openPop(anchor, function (p) {
      p.appendChild(el('div', 'pop-h', '選取工具'));
      p.appendChild(el('p', 'hint', '👆 物件上按住左鍵：拖拉移動<br>⬚ 空白處按住拖曳：圈選多個物件（含筆劃）<br>➕ 按住多選鍵再點物件：一個一個加進來，再點一次會取消；按住多選鍵圈選會加到原本選的裡面'));
      p.appendChild(el('div', 'pop-l tag t1', '➕ 多選鍵：按住這個鍵再點物件'));
      var r = el('div', 'pop-row');
      AKEYS.forEach(function (k) { r.appendChild(btn('btn sm' + (V.addKey === k[0] ? ' primary' : ''), k[1], function () { V.addKey = k[0]; try { localStorage.setItem('wb-addkey', k[0]); } catch (e) {} toast('➕ 多選鍵改成：按住 ' + k[1] + ' 再點物件'); renderTools(); selPanel($('toolbar').querySelector('[data-selb]')); })); });
      p.appendChild(r);
      p.appendChild(el('p', 'hint', '這個設定只存在這台電腦。'));
      p.appendChild(el('div', 'pop-l tag t2', '🗂 圖層：調整物件的上下關係'));
      p.appendChild(btn('btn', '🗂 開啟圖層面板', function () { closePop(); if (!layerBox) layersPanel(); }));
    });
  }
  function zkName(k) { var f = ZKEYS.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : k; }
  try { V.zoomKey = localStorage.getItem('wb-zoomkey') || ''; } catch (e) { V.zoomKey = ''; }
  try { V.panKey = localStorage.getItem('wb-pankey') || 'space'; } catch (e) { V.panKey = 'space'; }
  if (!ZKEYS.some(function (x) { return x[0] === V.zoomKey; })) V.zoomKey = IS_MAC ? 'alt' : 'ctrl';

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
      c.appendChild(btn('btn sm', '◀', function () { stepGroup(-1); })); c.appendChild(btn('btn sm', '▶', function () { stepGroup(1); }));
      c.appendChild(el('span', '', '🤝 正在和 <b>' + esc(groupLabel(tv.gid)) + '</b> 一起畫（第 ' + pageNo(g.cur) + ' 頁）・學生看到的畫面不會因此改變'));
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
    if (anchor.closest('.toolbar')) { x = r.left > innerWidth / 2 ? r.left - pw - 10 : r.right + 10; y = r.top + r.height / 2 - ph / 2; }
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
    var sw = add(btn('tb-swap', '⇄', function () { setSwap(!document.body.classList.contains('swap')); }), '工具欄和頁面欄左右互換');
    var pk = PENS.filter(function (x) { return x[0] === (tool.pen || ''); })[0] || PENS[0];
    var pb = add(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '<span class="pen-ic" style="--c:' + tool.color + '">' + pk[1] + '</span><small>' + pk[2] + ' ▾</small>', function () { if (tool.mode !== 'pen') setMode('pen'); penPanel(pb); }), '點一下選筆種、顏色、粗細'); pb.dataset.pop = 1;
    var cs = el('div', 'tcell colors three');
    COLORS.slice(0, 3).forEach(function (c) { var b = btn('sw' + (tool.mode === 'pen' && tool.color === c ? ' on' : ''), '', function () { tool.color = c; if (tool.pen === 'lz' || tool.pen === 'hl') tool.pen = ''; setMode('pen'); }); b.style.background = c; b.title = { '#111111': '黑', '#e53935': '紅', '#1e63d6': '藍' }[c]; cs.appendChild(b); });
    t.appendChild(cs);
    add(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { setMode('erase'); }));
    add(btn('tb', '🧹<small>清除筆劃</small>', function () {
      if (!V.objs.some(function (o) { return o.k === 's'; })) return toast('這一頁沒有筆劃');
      V.clear(true); renderTools(); toast('🧹 已清除這一頁所有筆劃（按「上一步」可以復原）');
    }), '只清除筆劃，圖片、文字、圖形會留著');
    add(btn('tb' + (tool.mode === 'select' || tool.mode === 'lasso' ? ' on' : ''), SEL_IC + '<small>選取 ▾</small>', function () {
      var was = tool.mode === 'select'; setMode('select');
      if (was) return selPanel($('toolbar').querySelector('[data-selb]'));
      if (S.lock) toast('🔒 物件目前全部鎖定，要先按「全部鎖定」解鎖'); else toast('👆 物件上按住可拖拉；空白處拖曳可圈選；按住 ' + akName(V.addKey) + ' 點物件可以多選（再點一次「選取」可設定）');
    }), '選取：點物件拖拉、空白處拖曳圈選、按住 ' + akName(V.addKey) + ' 點物件多選'); var sbx = $('toolbar').lastChild; sbx.dataset.selb = 1; sbx.dataset.pop = 1;
    var sb = add(btn('tb' + (tool.mode === 'shape' ? ' on' : ''), '🔷<small>圖形</small>', function () { shapePanel(sb); })); sb.dataset.pop = 1;
    var ib = add(btn('tb', '➕<small>插入 ▾</small>', function () { insertPanel(ib); }), '便利貼、文字、連結、影片、圖片、貼上、背景'); ib.dataset.pop = 1;
    add(btn('tb' + (S.lock ? ' on warn' : ''), (S.lock ? '🔒' : '🔓') + '<small>' + (S.lock ? '全部已鎖' : '全部鎖定') + '</small>', function () {
      S.lock = !S.lock; save(); V.setLocked(S.lock); renderTools();
      toast(S.lock ? '🔒 已鎖定所有物件，不會被不小心移動' : '🔓 已解除全部鎖定');
    }), '鎖定或解鎖這一頁所有物件（單一物件請按右鍵鎖定）');
    if (tv.kind === 'page') { var zb = add(btn('tb' + (tool.mode === 'zoom' ? ' on' : ''), '🔍<small>放大鏡</small>', function () { setMode('zoom'); zoomPanel($('toolbar').querySelector('[data-zoom]')); }), '快捷鍵：按住 ' + zkName(V.zoomKey) + '＋滑鼠滾輪'); zb.dataset.pop = 1; zb.dataset.zoom = 1; }
    var cb = add(btn('tb', '🎲<small>課堂 ▾</small>', function () { classPanel(cb); }), '隨機點名、抽籤、分組抽籤、倒數計時、隱藏與揭曉'); cb.dataset.pop = 1;
    var ab = add(btn('tb', '🎬<small>動作 ▾</small>', function () { actionPanel(ab); }), '上一步、下一步（滑鼠移上來就會展開；平板按一下）'); ab.dataset.pop = 1; ab.dataset.act = 1;
    ab.disabled = false; ab.classList.toggle('dim', !V.canUndo() && !V.canRedo());
    if (CAN_HOVER) { ab.onmouseenter = function () { actionPanel(ab, true); }; ab.onmouseleave = function () { actionLeave(); }; }
    add(btn('tb danger', '🗑️<small>全清除</small>', function () {
      if (!V.objs.length) return toast('這一頁已經是空白的');
      confirmBox('要把這一頁全部清空嗎？（筆劃、圖片、文字、圖形、便利貼、影片都會清掉；按「上一步」可以復原）', '全部清除', function () { V.clearAll(); renderTools(); });
    }));
    orderTools();
  }
  /* 工具欄順序：預設照下面的排，可以在「🎨 顯示設定」調整；登入 Google 後跟著帳號走 */
  var TB_DEF = [['pen', '✏️ 筆'], ['colors', '🎨 黑紅藍三色'], ['erase', '🧽 橡皮擦'], ['clearpen', '🧹 清除筆劃'], ['select', '選取（移動／圈選）'], ['shape', '🔷 圖形'], ['insert', '➕ 插入'], ['lock', '🔓 全部鎖定'], ['zoom', '🔍 放大鏡'], ['class', '🎲 課堂'], ['action', '🎬 動作（上一步／下一步）'], ['clearall', '🗑️ 全清除']];
  var TBO = []; try { TBO = JSON.parse(localStorage.getItem('wb-tborder') || '[]') || []; } catch (e) { TBO = []; }
  function tbOrder() {
    var keys = TB_DEF.map(function (x) { return x[0]; }), out = TBO.filter(function (k) { return keys.indexOf(k) >= 0; });
    keys.forEach(function (k, i) { if (out.indexOf(k) < 0) { var prev = i ? out.indexOf(keys[i - 1]) : -1; out.splice(prev + 1, 0, k); } });
    return out;
  }
  function orderTools() {
    var t = $('toolbar'), ch = Array.prototype.slice.call(t.children), ks = TB_DEF.map(function (x) { return x[0]; }).filter(function (k) { return k !== 'zoom' || tv.kind === 'page'; });
    var rest = ch.filter(function (c) { return !c.classList.contains('tb-swap'); }); /* swap 鍵永遠在最上面 */
    if (rest.length !== ks.length) return;
    var byK = {}; rest.forEach(function (c, i) { byK[ks[i]] = c; });
    tbOrder().forEach(function (k) { if (byK[k]) t.appendChild(byK[k]); });
  }
  function savePrefs() {
    try { localStorage.setItem('wb-tborder', JSON.stringify(TBO)); } catch (e) {}
    if (fbUser && fbApp) { try { myRef('prefs').set({ tborder: TBO, ui: UI, at: Date.now() }); } catch (e) {} }
  }
  function loadPrefs(u) {
    if (!u || !fbApp) return;
    fbApp.database().ref('wbu/' + u.uid + '/prefs').once('value').then(function (s) {
      var v = s.val();
      if (!v) { savePrefs(); return; }  /* 雲端還沒有設定：把這台的設定存上去 */
      if (Array.isArray(v.tborder)) TBO = v.tborder; else TBO = [];
      if (v.ui && typeof v.ui === 'object') UI = v.ui;
      try { localStorage.setItem('wb-tborder', JSON.stringify(TBO)); localStorage.setItem('wb-ui', JSON.stringify(UI)); } catch (e) {}
      applyUI(); renderTools(); toast('☁️ 已載入你的工具欄順序與顯示設定');
    }).catch(function () {});
  }
  function orderPanel(wrap) {
    wrap.innerHTML = '';
    var cur = tbOrder(), names = {}; TB_DEF.forEach(function (x) { names[x[0]] = x[1]; });
    cur.forEach(function (k, i) {
      var r = el('div', 'ord-row'); r.appendChild(el('span', 'ord-n', names[k]));
      var up = btn('btn sm', '▲', function () { if (i < 1) return; cur.splice(i - 1, 0, cur.splice(i, 1)[0]); TBO = cur; savePrefs(); renderTools(); orderPanel(wrap); }); up.disabled = i === 0;
      var dn = btn('btn sm', '▼', function () { if (i >= cur.length - 1) return; cur.splice(i + 1, 0, cur.splice(i, 1)[0]); TBO = cur; savePrefs(); renderTools(); orderPanel(wrap); }); dn.disabled = i === cur.length - 1;
      r.appendChild(up); r.appendChild(dn); wrap.appendChild(r);
    });
    wrap.appendChild(btn('btn', '↺ 恢復預設順序', function () { TBO = []; savePrefs(); renderTools(); orderPanel(wrap); }));
  }
  var CAN_HOVER = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  var actT = null;
  function actionLeave() { clearTimeout(actT); actT = setTimeout(function () { if (pop && pop.classList.contains('act-pop')) closePop(); }, 350); }
  function actionPanel(anchor, hover) {
    clearTimeout(actT);
    if (hover && pop && pop.classList.contains('act-pop')) return;
    openPop(anchor, function (p) {
      p.classList.add('act-pop');
      var r = el('div', 'act-row');
      var u = btn('btn act-b', '↩️ 上一步', function () { V.undo(); renderTools(); actionPanel(ab_()); });
      var d = btn('btn act-b', '↪️ 下一步', function () { V.redo(); renderTools(); actionPanel(ab_()); });
      u.disabled = !V.canUndo(); d.disabled = !V.canRedo();
      r.appendChild(u); r.appendChild(d); p.appendChild(r);
      if (CAN_HOVER) { p.onmouseenter = function () { clearTimeout(actT); }; p.onmouseleave = actionLeave; }
    });
  }
  function ab_() { return $('toolbar').querySelector('[data-act]'); }
  function penPanel(anchor) {
    openPop(anchor, function (p) {
      p.appendChild(el('div', 'pop-h', '✏️ 選筆'));
      var r = el('div', 'pop-row pen-types');
      PENS.forEach(function (x) {
        r.appendChild(btn('shp' + ((tool.pen || '') === x[0] ? ' on' : ''), '<span>' + x[1] + '</span><small>' + x[2] + '</small>', function () {
          tool.pen = x[0];
          if (x[0] === 'hl' && ['#fff35c', '#7dff8a', '#7fd8ff', '#ff9ad5', '#ffb347'].indexOf(tool.color) < 0) tool.color = '#fff35c';
          if (x[0] === 'lz' && tool.color !== '#ff2a2a' && tool.color !== '#16a34a' && tool.color !== '#1e63d6') tool.color = '#ff2a2a';
          if ((x[0] === '' || x[0] === 'mk') && ['#fff35c', '#7dff8a', '#7fd8ff', '#ff9ad5', '#ffb347', '#ff2a2a'].indexOf(tool.color) >= 0) tool.color = '#111111';
          setMode('pen'); penPanel(anchor);
        }));
      });
      p.appendChild(r);
      if (tool.pen === 'lz') p.appendChild(el('div', 'pop-l', '雷射筆畫過的線會留約 3 秒後消失，學生畫面也看得到，不會留在畫板上。'));
      p.appendChild(el('div', 'pop-l', '顏色'));
      var list = tool.pen === 'hl' ? ['#fff35c', '#7dff8a', '#7fd8ff', '#ff9ad5', '#ffb347'] : tool.pen === 'lz' ? ['#ff2a2a', '#16a34a', '#1e63d6'] : PALETTE;
      p.appendChild(swatches(list, tool.color, function (c) { tool.color = c; setMode('pen'); penPanel(anchor); }));
      p.appendChild(el('div', 'pop-l', '粗細'));
      var ws = el('div', 'pop-row');
      WIDTHS.forEach(function (w, i) { ws.appendChild(btn('btn sm' + (tool.width === w ? ' primary' : ''), ['細', '中', '粗'][i], function () { tool.width = w; setMode('pen'); penPanel(anchor); })); });
      p.appendChild(ws);
    });
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
  function zoomPanel(anchor) {
    if (!anchor) return;
    openPop(anchor, function (p) {
      p.appendChild(el('div', 'pop-h', '🔍 放大鏡'));
      p.appendChild(el('p', 'hint', '在畫板上框出要放大的地方（點一下是放大兩倍）' + (S.mode !== 'work' ? '，學生畫面會一起放大' : '') + '。'));
      p.appendChild(el('div', 'pop-l tag t2', '⌨️ 快捷鍵：按住這個鍵＋轉滑鼠滾輪'));
      var r = el('div', 'pop-row zk-row'), bt = {};
      function badge(k) { var st = ZK_TEST[k], c = APP_USED[k]; return st === 'ok' ? '<i class="zk ok">✅ 可用</i>' : st === 'bad' ? '<i class="zk bad">⛔ 被佔用</i>' : c ? '<i class="zk warn">⚠️ ' + c + '</i>' : '<i class="zk">未測試</i>'; }
      ZKEYS.forEach(function (k) { bt[k[0]] = r.appendChild(btn('btn sm zk-b' + (V.zoomKey === k[0] ? ' primary' : ''), k[1] + badge(k[0]), function () { V.zoomKey = k[0]; try { localStorage.setItem('wb-zoomkey', k[0]); } catch (e) {} toast('🔍 快捷鍵改成：按住 ' + k[1] + '＋滑鼠滾輪' + (ZK_TEST[k[0]] === 'bad' ? '（這個鍵剛剛測出來被佔用了）' : '')); renderTools(); zoomPanel($('toolbar').querySelector('[data-zoom]')); })); });
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t3', '✋ 放大後移動畫布：按住這個鍵＋拖曳畫布（平板用兩根手指拖）'));
      var pr = el('div', 'pop-row');
      [['space', '空白鍵'], ['alt', IS_MAC ? 'Option' : 'Alt'], ['x', 'X 鍵']].forEach(function (k) { pr.appendChild(btn('btn sm' + ((V.panKey || 'space') === k[0] ? ' primary' : ''), k[1], function () { V.panKey = k[0]; try { localStorage.setItem('wb-pankey', k[0]); } catch (e) {} toast('✋ 移動畫布的鍵：' + k[1]); zoomPanel(anchor); })); });
      p.appendChild(pr);
      /* 自動偵測：按住某個鍵在測試框轉滾輪，網頁收得到就是可用；按住了卻收不到滾輪，就是被系統或其他程式佔用 */
      var pad = el('div', 'zk-pad', '🧪 <b>自動偵測</b>：把滑鼠移到這個框裡，按住上面任一個鍵，轉一下滾輪再放開。<br>網頁收得到就標「✅ 可用」；收不到（被 Mac／Windows 或其他程式拿走）就標「⛔ 被佔用」。');
      var held = null, got = false, heldAt = 0;
      function keyOf(e) { return e.key === 'Control' ? 'ctrl' : e.key === 'Alt' ? 'alt' : e.key === 'Meta' ? 'meta' : e.key === 'Shift' ? 'shift' : (e.key === 'z' || e.key === 'Z') ? 'z' : null; }
      function mark(k, v) { ZK_TEST[k] = v; try { localStorage.setItem('wb-zktest', JSON.stringify(ZK_TEST)); } catch (x) {} var f = ZKEYS.filter(function (x) { return x[0] === k; })[0]; if (f && bt[k]) bt[k].innerHTML = f[1] + badge(k); }
      function kd(e) { var k = keyOf(e); if (!k || !bt[k] || !pad.matches(':hover')) return; if (held !== k) { held = k; got = false; heldAt = Date.now(); pad.classList.add('on'); pad.dataset.k = '按住 ' + zkName(k) + ' 中…現在轉一下滾輪'; } }
      function ku(e) { var k = keyOf(e); if (!k || k !== held) return; pad.classList.remove('on'); held = null; if (!got && Date.now() - heldAt < 700) { pad.dataset.k = '按住久一點，一邊按住一邊轉滾輪'; } else if (!got) { mark(k, 'bad'); pad.dataset.k = '⛔ 按住 ' + zkName(k) + ' 時網頁收不到滾輪，被佔用了' + (V.zoomKey === k ? '，請換一個鍵' : ''); } }
      pad.addEventListener('wheel', function (e) {
        e.preventDefault();
        var k = held || (e.ctrlKey ? 'ctrl' : e.altKey ? 'alt' : e.metaKey ? 'meta' : e.shiftKey ? 'shift' : null);
        if (!k || !bt[k]) { pad.dataset.k = '先按住一個鍵再轉滾輪'; return; }
        var ok = k === 'z' ? !!held : (k === 'ctrl' ? e.ctrlKey : k === 'alt' ? e.altKey : k === 'meta' ? e.metaKey : e.shiftKey);
        if (ok) { got = true; mark(k, 'ok'); pad.dataset.k = '✅ ' + zkName(k) + '＋滾輪可以用'; }
      }, { passive: false });
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
      var mo = new MutationObserver(function () { if (!document.body.contains(pad)) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); mo.disconnect(); } });
      mo.observe(document.body, { childList: true });
      p.appendChild(pad);
      p.appendChild(el('p', 'hint', (IS_MAC ? 'Mac 的 Control＋滾輪會被系統拿去放大整個螢幕，所以預設用 Option。觸控板兩指開合也可以放大。' : '') + '放大後直接轉滾輪可以上下移動畫面。這個設定只存在這台電腦。'));
    });
  }
  function groupMenu(x, y) {
    var list = V.members(); if (!list.length) return;
    var lk = list.some(function (o) { return o.lk; });
    openPopAt(x, y, function (p) {
      p.classList.add('objmenu');
      p.appendChild(el('div', 'pop-h', '⭕ 已圈選 ' + list.length + ' 個物件'));
      function mi(h, fn, cls) { var b = btn('mi' + (cls ? ' ' + cls : ''), h, function () { fn(); }); p.appendChild(b); return b; }
      mi(lk ? '🔓 全部解除鎖定' : '🔒 全部鎖定', function () { closePop(); V.groupOp('lock', !lk); renderTools(); });
      var lids = list.filter(function (o) { return o.k !== 's'; }).map(function (o) { return o.id; });
      if (lids.length) { var lr = el('div', 'pop-row'); lr.appendChild(el('span', '', '圖層')); [['⤒ 置頂', 'front'], ['↑ 上移', 'up'], ['↓ 下移', 'down'], ['⤓ 置底', 'back']].forEach(function (z) { lr.appendChild(btn('btn sm', z[0], function () { V.reorder(lids, z[1]); })); }); p.appendChild(lr); }
      var hdn = list.some(function (o) { return o.hd; });
      mi(hdn ? '👁 全部揭曉給學生看' : '🙈 全部先隱藏（學生看不到）', function () { closePop(); V.groupOp('hide', !hdn); renderTools(); });

      if (!lk) {
        p.appendChild(el('div', 'pop-l', '大小（整組等比例縮放）'));
        var r = el('div', 'pop-row');
        [['縮小 20%', 0.8], ['縮小 10%', 0.9], ['放大 10%', 1.1], ['放大 20%', 1.2]].forEach(function (z) { r.appendChild(btn('btn sm', z[0], function () { V.groupOp('scale', z[1]); renderTools(); })); });
        p.appendChild(r);
        p.appendChild(el('div', 'pop-l', '旋轉'));
        r = el('div', 'pop-row');
        [['↺ 15°', -15], ['↻ 15°', 15], ['↻ 90°', 90], ['↻ 180°', 180]].forEach(function (z) { r.appendChild(btn('btn sm', z[0], function () { V.groupOp('rot', z[1]); renderTools(); })); });
        r.appendChild(btn('btn sm', '↔️ 鏡像', function () { V.groupOp('flip'); renderTools(); }));
        p.appendChild(r);
        p.appendChild(el('div', 'pop-l', '顏色（筆劃、文字、圖形線條一起換）'));
        p.appendChild(swatches(PALETTE, null, function (c) { V.groupOp('color', c); renderTools(); }));
      }
      mi('📄 複製一份', function () { closePop(); V.groupOp('dup'); renderTools(); });
      if (!lk) mi('🗑️ 全部刪除', function () { closePop(); V.groupOp('del'); renderTools(); }, 'danger');
    });
  }
  var IC_PROTR = '<svg width="26" height="16" viewBox="0 0 26 16" style="vertical-align:-2px"><path d="M1 15A12 12 0 0 1 25 15Z" fill="#d0ebff" stroke="#1c3d6e" stroke-width="1.5"/><path d="M13 15V4M13 15L5 6.5M13 15L21 6.5M13 15L2.5 11M13 15L23.5 11" stroke="#1c3d6e" stroke-width="1"/></svg>';
  var IC_SQ45 = '<svg width="20" height="20" viewBox="0 0 20 20" style="vertical-align:-3px"><path d="M2 2V18H18Z" fill="#ffe8cc" stroke="#333" stroke-width="1.5"/><path d="M2 14H6V18" fill="none" stroke="#333" stroke-width="1"/></svg>';
  var IC_SQ30 = '<svg width="26" height="16" viewBox="0 0 26 16" style="vertical-align:-2px"><path d="M1.5 1.5V14.5H24.5Z" fill="#d3f9d8" stroke="#333" stroke-width="1.5"/><path d="M1.5 11H5V14.5" fill="none" stroke="#333" stroke-width="1"/></svg>';
  var BGS = [['', '⬜ 空白'], ['dots', '⁙ 格點'], ['grid', '▦ 格線'], ['tian', '田 田字格'], ['zy', 'ㄅ 國字注音格'], ['paper', '✎ 作文稿紙'], ['ruled', '≡ 橫線']];
  var ZYN = 1;
  function addZyCell(n) {
    var cs = Math.min(110, Math.floor(800 / n)), w = Math.round(cs * 1.35), hh = cs * n, c = center(w, hh); toSelect();
    V.addObj({ id: WB.uid(), k: 'g', by: 'T', shape: 'zycell', rows: n, ar: true, x: c.x, y: Math.max(20, c.y), w: w, h: hh, r: 0, fx: false, sc: '#2f9e44', sw: 3, fill: false, op: 1 }); renderTools();
  }
  function addAid(kind) {
    var D = {
      ruler: { w: 900, h: 90, n: 15, fill: true, fc: '#fff3bf', op: 0.92, sc: '#333333', sw: 1.5 },
      protr: { w: 640, h: 330, fill: true, fc: '#d0ebff', op: 0.8, sc: '#1c3d6e', sw: 1.5 },
      sq45: { w: 560, h: 560, ar: true, n: 14, fill: true, fc: '#ffe8cc', op: 0.8, sc: '#333333', sw: 2 },
      sq30: { w: 640, h: 370, ar: true, n: 16, fill: true, fc: '#d3f9d8', op: 0.8, sc: '#333333', sw: 2 },
      numline: { w: 1000, h: 110, nmin: 0, nmax: 10, st: 1, fill: false, op: 1, sc: '#111111', sw: 3 },
      clock: { w: 380, h: 380, hh: 3, mm: 0, fill: true, fc: '#ffffff', op: 1, sc: '#111111', sw: 3 }
    }[kind], c = center(D.w, D.h); toSelect();
    var o = { id: WB.uid(), k: 'g', by: 'T', shape: kind, x: c.x, y: c.y, r: 0, fx: false };
    for (var k in D) o[k] = D[k];
    V.addObj(o); renderTools();
  }
  function insertPanel(anchor) {
    openPop(anchor, function (p) {
      p.classList.add('ins-pop');
      p.appendChild(el('div', 'pop-l tag t1', '📝 便利貼（點顏色就貼上）'));
      var r = el('div', 'pop-row');
      NOTE_COLORS.forEach(function (c) { var b = btn('note-sw', c[1], function () { closePop(); addNote(c[0]); }); b.style.background = c[0]; r.appendChild(b); });
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t2', '🔤 文字・連結・影片'));
      r = el('div', 'pop-row');
      r.appendChild(btn('btn', '🔤 橫式文字', function () { closePop(); addText('', false); }));
      r.appendChild(btn('btn', '↕️ 直式文字', function () { closePop(); addText('', true); }));
      r.appendChild(btn('btn', '🔗 連結', function () { closePop(); addLinkBox(); }));
      r.appendChild(btn('btn', '🎬 影片', function () { closePop(); addLinkBox(true); }));
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t3', '🖼️ 圖片'));
      r = el('div', 'pop-row');
      r.appendChild(btn('btn', '🖼️ 選擇圖片檔', function () { closePop(); $('file-in').click(); }));
      r.appendChild(btn('btn', '📋 貼上（Ctrl+V）', function () { closePop(); pasteButton(); }));
      r.appendChild(btn('btn', '📄 匯入 PDF／多張圖片成頁面', function () { closePop(); $('pdf-in').click(); }));
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t5', '📐 教具（放上去可以拖、縮放、旋轉）'));
      r = el('div', 'pop-row');
      [['ruler', '📏 直尺'], ['protr', IC_PROTR + ' 量角器'], ['sq45', IC_SQ45 + ' 三角板 45°'], ['sq30', IC_SQ30 + ' 三角板 30°60°'], ['numline', '↔️ 數線'], ['clock', '🕒 時鐘']].forEach(function (b) { r.appendChild(btn('btn', b[1], function () { closePop(); addAid(b[0]); })); });
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t5', '🈶 國字注音格（綠線，只能等比縮放）'));
      r = el('div', 'pop-row');
      r.appendChild(btn('btn sm', '－', function () { ZYN = Math.max(1, ZYN - 1); insertPanel(anchor); }));
      r.appendChild(el('b', 'zyn', ZYN + ' 格'));
      r.appendChild(btn('btn sm', '＋', function () { ZYN = Math.min(12, ZYN + 1); insertPanel(anchor); }));
      r.appendChild(btn('btn primary', '貼上', function () { closePop(); addZyCell(ZYN); }));
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l tag t4', '▦ 畫布背景（移動物件時會對齊格子）'));
      r = el('div', 'pop-row');
      BGS.forEach(function (b) { r.appendChild(btn('btn' + ((V.bg || '') === b[0] ? ' primary' : ''), b[1], function () { closePop(); setBg(b[0]); })); });
      p.appendChild(r);
      p.appendChild(el('div', 'pop-l', '學生能不能貼便利貼，在「📋 任務指派」每一組設定。'));
    });
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
      var lyr = row(); lyr.appendChild(el('span', '', '圖層'));
      [['⤒ 置頂', 'front'], ['↑ 上移', 'up'], ['↓ 下移', 'down'], ['⤓ 置底', 'back']].forEach(function (z) { lyr.appendChild(btn('btn sm', z[0], function () { V.reorder([o.id], z[1]); again(); })); });
      lyr.appendChild(btn('btn sm', '🗂', function () { closePop(); if (!layerBox) layersPanel(); }));
      if (o.k !== 's') m.appendChild(btn('mi' + (o.hd ? ' on' : ''), o.hd ? '👁 揭曉給學生看' : '🙈 先隱藏（學生看不到，之後再揭曉）', function () { chg({ hd: o.hd ? false : true }); }));
      if (o.lk) { m.appendChild(el('div', 'pop-l', '解除鎖定後才能移動、縮放、修改。')); return; }
      if (o.k === 'g' && (o.shape === 'clock' || o.shape === 'numline')) {
        m.appendChild(el('div', 'pop-l', o.shape === 'clock' ? '時間' : '數線範圍'));
        var ra = row();
        if (o.shape === 'clock') {
          ra.appendChild(btn('btn sm', '時－', function () { chg({ hh: ((o.hh == null ? 3 : o.hh) + 11) % 12 }); }));
          ra.appendChild(btn('btn sm', '時＋', function () { chg({ hh: ((o.hh == null ? 3 : o.hh) + 1) % 12 }); }));
          ra.appendChild(btn('btn sm', '分－5', function () { chg({ mm: ((o.mm || 0) + 55) % 60 }); }));
          ra.appendChild(btn('btn sm', '分＋5', function () { chg({ mm: ((o.mm || 0) + 5) % 60 }); }));
          ra.appendChild(btn('btn sm', '分＋1', function () { chg({ mm: ((o.mm || 0) + 1) % 60 }); }));
        } else {
          var nn = o.nmin == null ? 0 : o.nmin, nx = o.nmax == null ? 10 : o.nmax, ns = o.st || 1;
          ra.appendChild(btn('btn sm', '起點－', function () { chg({ nmin: nn - ns }); }));
          ra.appendChild(btn('btn sm', '起點＋', function () { if (nn + ns < nx) chg({ nmin: nn + ns }); }));
          ra.appendChild(btn('btn sm', '終點－', function () { if (nx - ns > nn) chg({ nmax: nx - ns }); }));
          ra.appendChild(btn('btn sm', '終點＋', function () { chg({ nmax: nx + ns }); }));
          var rb = row();
          [['每格 1', 1], ['每格 2', 2], ['每格 5', 5], ['每格 10', 10], ['每格 0.5', 0.5], ['每格 0.1', 0.1]].forEach(function (z) { rb.appendChild(btn('btn sm' + (ns === z[1] ? ' primary' : ''), z[0], function () { chg({ st: z[1] }); })); });
        }
      }
      if (o.k === 'g' && o.shape === 'zycell') {
        m.appendChild(el('div', 'pop-l', '格數（往下增減，格子大小不變，框線固定綠色）'));
        var rz2 = row(), zr = o.rows || 1, cs0 = o.h / zr;
        rz2.appendChild(btn('btn sm', '－ 少一格', function () { if (zr > 1) chg({ rows: zr - 1, h: Math.round(cs0 * (zr - 1)) }); }));
        rz2.appendChild(el('b', '', zr + ' 格'));
        rz2.appendChild(btn('btn sm', '＋ 多一格', function () { if (zr < 20) chg({ rows: zr + 1, h: Math.round(cs0 * (zr + 1)) }); }));
      }
      if (o.k === 't' || o.k === 'n' || (o.k === 'g' && o.shape !== 'zycell')) {
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
      if (o.k === 'g' && o.shape !== 'zycell') {
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
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) && !ed) { e.preventDefault(); V.redo(); renderTools(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !ed) { e.preventDefault(); V.undo(); renderTools(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !ed && (V.sel || V.multi)) { e.preventDefault(); if (V.multi) { closePop(); V.groupOp('del'); renderTools(); return; } var so = V.find(V.sel); if (so && so.lk) return toast('🔒 這個物件鎖定了，要先解除鎖定'); closePop(); V.deleteSel(); renderTools(); }
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
  $('pdf-in').onchange = function () { importPages(this.files); this.value = ''; };
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
    h.appendChild(btn('ic swap-b', '⇄', function () { setSwap(!document.body.classList.contains('swap')); })).title = '頁面欄和工具欄左右互換';
    h.appendChild(btn('ic', document.body.classList.contains('swap') ? '▶' : '◀', function () { S.pagesOpen = false; save(); renderPages(); setTimeout(V.refit, 50); })).title = '收起頁面欄';
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
  function setSwap(b) { document.body.classList.toggle('swap', b); try { localStorage.setItem('wb-swap', b ? '1' : ''); } catch (e) {} $('pages-open').firstChild.textContent = b ? '◀' : '▶'; renderPages(); closePop(); setTimeout(V.refit, 50); toast(b ? '⇄ 頁面欄在右邊、工具欄在左邊' : '⇄ 頁面欄在左邊、工具欄在右邊'); }
  try { if (localStorage.getItem('wb-swap')) { document.body.classList.add('swap'); $('pages-open').firstChild.textContent = '◀'; } } catch (e) {}
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
      item('▦ 背景：' + (BGS.filter(function (x) { return x[0] === (p.bg || ''); })[0] || ['', '空白'])[1].replace(/^\S+ /, '') + '（點一下換）', function () { var bi = 0; BGS.forEach(function (x, ix) { if (x[0] === (p.bg || '')) bi = ix; }); p.bg = BGS[(bi + 1) % BGS.length][0]; save(); if (curBid() === 'P:' + p.id) V.setBg(p.bg); refreshAll(); boardChanged('P:' + p.id); renderTools(); });
      item('🧹 清除這一頁的筆劃', function () { confirmBox('要清除第 ' + (i + 1) + ' 頁的所有筆劃嗎？（圖片、文字、圖形、便利貼會保留）', '清除', function () { var rem = p.objs.filter(function (o) { return o.k === 's'; }).map(function (o) { return o.id; }); WB.applyOp(p.objs, { del: rem }); distribute('P:' + p.id, { t: 'op', op: { del: rem, add: [] } }); if (V.bid === 'P:' + p.id) V.apply(V.bid, { del: rem }); save(); boardChanged('P:' + p.id); }); });
      item('💾 這一頁另存成圖片', function () { var cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900; WB.render(cv.getContext('2d'), p.objs, 1, '#fff', true); var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'Andice的共用畫板_第' + (i + 1) + '頁.png'; a.click(); });
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
    ga.appendChild(btn('btn sm', '📋 匯入名單', rosterModal));
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
      r.appendChild(el('b', '', s + (ROSTER[s] ? ' ' + esc(ROSTER[s]) : '')));
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
    if (!d || d.app !== 'class-whiteboard' || !Array.isArray(d.pages) || !d.pages.length) { toast('這不是「Andice的共用畫板」的專案檔'); return false; }
    Object.keys(d.imgs || {}).forEach(function (id) { if (d.imgs[id]) { WB.setImg(id, d.imgs[id]); idbPut('i', id, d.imgs[id]); } });
    S.pages = d.pages.map(function (p) { return { id: p.id || WB.uid(), objs: p.objs || [], bg: p.bg || '' }; });
    S.cur = S.pages[0].id; S.projName = d.name || ''; S.zoom = null; S.assignAll = null; S.cast = null; S.cloudKey = null; S.myPid = null;
    for (var g in S.groups) { S.groups[g].boards = {}; S.groups[g].cur = null; }
    if (S.mode === 'work') { S.mode = 'present'; S.workEnd = null; }
    tv = { kind: 'page' }; V.hist = {}; save(); renderAll(); refreshAll(true);
    return true;
  }
  function stamp() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2); }
  function saveProjectFile() {
    var blob = new Blob([JSON.stringify(projectData())], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.projName || 'Andice的共用畫板專案') + '_' + stamp() + '.wbproj.json'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 4000);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); toast('💾 已下載專案檔');
  }
  var CLOUD = 'https://yining-med-tracker-default-rtdb.firebaseio.com/wb/';
  function newKey() { var a = 'abcdefghijkmnpqrstuvwxyz23456789', k = '', r = new Uint32Array(20); crypto.getRandomValues(r); for (var i = 0; i < 20; i++) k += a[r[i] % a.length]; return k; }
  function fmtKey(k) { return String(k).match(/.{1,5}/g).join('-'); }
  function cleanKey(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function cloudSave(fresh) {
    var key = (!fresh && S.cloudKey) || newKey(), data = projectData();
    toast('☁️ 正在存到雲端…');
    fetch(CLOUD + key + '.json', { method: 'PUT', body: JSON.stringify(data) }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      S.cloudKey = key; save();
      modal(function (box) {
        box.appendChild(el('h3', '', '☁️ 已存到雲端'));
        box.appendChild(el('p', '', '在別台電腦打開老師端，按「💾 專案」→「🔑 用金鑰開啟」，輸入這組金鑰就能打開這份專案。之後再按「更新雲端存檔」會存在同一組金鑰。'));
        var kb = btn('cloud-key big', '<span>' + fmtKey(key) + '</span><em>📋 點一下複製金鑰</em>', function () { copy(fmtKey(key)); kb.querySelector('em').textContent = '✅ 已複製，記得收好（例如貼到備忘錄）'; });
        box.appendChild(kb);
        box.appendChild(el('p', 'hint', '⚠️ 拿到金鑰的人都能打開和修改這份專案，請不要公開分享。'));
        var row = el('div', 'modal-btns'); row.appendChild(btn('btn primary', '好', closeModal)); box.appendChild(row);
      });
    }).catch(function () { toast('☁️ 存到雲端失敗，請檢查網路後再試一次'); });
  }
  function cloudOpenBox() {
    modal(function (box) {
      box.appendChild(el('h3', '', '🔑 用金鑰開啟雲端專案'));
      box.appendChild(el('p', '', '輸入存到雲端時拿到的金鑰（有沒有打 - 都可以）。目前的畫板頁面會被取代，需要的話請先存檔。'));
      var i = el('input', 'wide-in'); i.placeholder = '例如 ab3de-fgh45-…'; i.autocomplete = 'off'; box.appendChild(i);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      row.appendChild(btn('btn primary', '開啟', function () {
        var key = cleanKey(i.value); if (key.length < 16) return toast('金鑰不對，請再檢查一次');
        toast('☁️ 正在讀取…');
        fetch(CLOUD + key + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
          if (!d) return toast('找不到這組金鑰的專案，請再檢查一次');
          if (loadProject(d)) { S.cloudKey = key; save(); closeModal(); toast('☁️ 已打開雲端專案「' + (d.name || '未命名') + '」'); }
        }).catch(function () { toast('讀取失敗，請檢查網路或金鑰'); });
      }));
      box.appendChild(row); setTimeout(function () { i.focus(); }, 30);
    });
  }
  /* ---------- 我的專案：Google 登入，每台電腦都看得到 ---------- */
  var FB_CFG = { apiKey: 'AIzaSyC5qwepU0PnotyRXzD4S0iTBZhHSiW-pus', authDomain: 'yining-med-tracker.firebaseapp.com', databaseURL: 'https://yining-med-tracker-default-rtdb.firebaseio.com', projectId: 'yining-med-tracker', appId: '1:733833835927:web:72727f17a5aa0cec4d00d2' };
  var fbApp = null, fbUser = null, fbReady = false;
  function fb() {
    if (fbApp || !window.firebase) return fbApp;
    try {
      fbApp = firebase.initializeApp(FB_CFG, 'wb');
      fbApp.auth().onAuthStateChanged(function (u) { fbUser = u; fbReady = true; loadPrefs(u); var pb = document.querySelector('.my-proj'); if (pb) pb.replaceWith(myProjectsSection()); $('b-proj').innerHTML = '💾 專案' + (u ? ' <span class="me-dot" title="已登入 Google">●</span>' : ''); });
    } catch (e) { fbApp = null; }
    return fbApp;
  }
  (function tryFb(n) { if (!fb() && n < 40) setTimeout(function () { tryFb(n + 1); }, 500); })(0);
  function myRef(path) { return fbApp.database().ref('wbu/' + fbUser.uid + '/' + path); }
  function myProjectsSection() {
    var sec = el('div', 'cloud-box my-proj');
    sec.appendChild(el('div', 'pop-h', '☁️ 我的專案（用 Google 登入，每台電腦都看得到）'));
    if (!fb()) { sec.appendChild(el('p', 'hint', '雲端功能載入中，或這台裝置連不到 Google，請稍後再試。')); return sec; }
    if (!fbReady) { sec.appendChild(el('p', 'hint', '讀取登入狀態中…')); return sec; }
    if (!fbUser) {
      sec.appendChild(btn('btn primary g-login', '<b>G</b> 用 Google 帳號登入', function () {
        var pv = new firebase.auth.GoogleAuthProvider(); pv.setCustomParameters({ prompt: 'select_account' });
        fbApp.auth().signInWithPopup(pv).catch(function (e) { var c = e.code || ''; if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') { toast('登入視窗被擋住，改用整頁登入…'); save(); setTimeout(function () { fbApp.auth().signInWithRedirect(pv); }, 600); } else if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') toast('登入沒有完成，請再試一次'); });
      }));
      sec.appendChild(el('p', 'hint', '登入後，在任何一台電腦用同一個 Google 帳號登入，就能看到、打開你存過的專案。只有你自己看得到。'));
      return sec;
    }
    var who = el('div', 'pop-row'); who.appendChild(el('span', '', '👤 ' + (fbUser.displayName || fbUser.email || '已登入')));
    who.appendChild(el('span', 'grow')); who.appendChild(btn('btn sm', '登出', function () { fbApp.auth().signOut(); }));
    sec.appendChild(who);
    var acts = el('div', 'proj-acts');
    acts.appendChild(btn('btn primary', S.myPid ? '☁️ 存回「' + (S.projName || '未命名') + '」' : '☁️ 存到我的專案', function () { mySave(false); }));
    if (S.myPid) acts.appendChild(btn('btn', '另存成一份新的', function () { mySave(true); }));
    sec.appendChild(acts);
    var list = el('div', 'my-list'); list.appendChild(el('p', 'hint', '讀取專案清單中…')); sec.appendChild(list);
    myRef('list').once('value').then(function (snap) {
      var v = snap.val() || {}, ids = Object.keys(v).sort(function (a, b) { return (v[b].at || 0) - (v[a].at || 0); });
      list.innerHTML = '';
      if (!ids.length) { list.appendChild(el('p', 'hint', '還沒有存過專案。')); return; }
      ids.forEach(function (id) {
        var it = v[id], row = el('div', 'my-item' + (id === S.myPid ? ' on' : ''));
        row.appendChild(el('b', '', esc(it.name || '未命名')));
        row.appendChild(el('span', 'hint', (it.n || 0) + ' 頁・' + new Date(it.at || 0).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
        row.appendChild(el('span', 'grow'));
        row.appendChild(btn('btn sm', '開啟', function () { confirmBox('要開啟「' + esc(it.name || '未命名') + '」嗎？目前的畫板頁面會被取代。', '開啟', function () { myOpen(id); }); }));
        row.appendChild(btn('btn sm ghost del', '🗑', function () { confirmBox('要刪除雲端上的「' + esc(it.name || '未命名') + '」嗎？刪掉就救不回來。', '刪除', function () { myRef('proj/' + id).remove(); myRef('list/' + id).remove().then(function () { if (S.myPid === id) { S.myPid = null; save(); } toast('已刪除'); $('b-proj').click(); }); }); }));
        list.appendChild(row);
      });
    }).catch(function () { list.innerHTML = ''; list.appendChild(el('p', 'hint', '讀不到專案清單，請檢查網路。')); });
    return sec;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mySave(asNew) {
    if (!fbUser) return;
    if (!S.projName) S.projName = '未命名 ' + stamp();
    var pid = (!asNew && S.myPid) || WB.uid(), d = projectData();
    toast('☁️ 正在存到我的專案…');
    myRef('proj/' + pid).set(JSON.parse(JSON.stringify(d))).then(function () {
      return myRef('list/' + pid).set({ name: S.projName, at: Date.now(), n: S.pages.length });
    }).then(function () { S.myPid = pid; save(); toast('☁️ 已存到我的專案「' + S.projName + '」'); $('b-proj').click(); })
      .catch(function () { toast('存檔失敗，請檢查網路後再試一次'); });
  }
  function myOpen(pid) {
    toast('☁️ 正在打開…');
    myRef('proj/' + pid).once('value').then(function (snap) {
      var d = snap.val(); if (!d) return toast('找不到這份專案');
      if (loadProject(d)) { S.myPid = pid; save(); closeModal(); toast('☁️ 已打開「' + (d.name || '未命名') + '」'); }
    }).catch(function () { toast('打開失敗，請檢查網路'); });
  }
  function hasContent() { return S.pages.length > 1 || S.pages.some(function (p) { return p.objs.length; }); }
  $('b-proj').onclick = function () {
    modal(function (box) {
      box.classList.add('proj-box');
      box.appendChild(el('h3', '', '💾 專案'));
      box.appendChild(el('p', 'hint', '專案包含所有畫板頁面、圖片、文字、圖形、便利貼和影片（不含學生名單和作答）。'));
      var nm = el('input', 'wide-in'); nm.placeholder = '專案名稱（例如：三上數學第5課）'; nm.value = S.projName || ''; nm.oninput = function () { S.projName = nm.value.trim(); save(); };
      box.appendChild(nm);
      box.appendChild(myProjectsSection());
      box.appendChild(el('div', 'pop-l sec', '📁 專案檔（存在這台電腦）'));
      var r = el('div', 'proj-acts');
      r.appendChild(btn('btn primary', '💾 存成專案檔', saveProjectFile));
      r.appendChild(btn('btn', '📂 開啟專案檔', function () { $('proj-in').click(); }));
      r.appendChild(btn('btn', '📄 開新的空白專案', function () {
        confirmBox('要開一個新的空白專案嗎？目前的畫板頁面會全部清空（建議先存成專案檔）。', '開新專案', function () { loadProject({ app: 'class-whiteboard', pages: [{ id: WB.uid(), objs: [] }], imgs: {} }); toast('已開新的空白專案'); });
      }));
      box.appendChild(r);
      var cl = el('div', 'cloud-box');
      cl.appendChild(el('div', 'pop-h', '🔑 用金鑰分享：把金鑰給別人（或別台電腦）就能打開這一份'));
      if (S.cloudKey) {
        var kb = btn('cloud-key', '<span>' + fmtKey(S.cloudKey) + '</span><em>📋 點一下複製金鑰</em>', function () { copy(fmtKey(S.cloudKey)); kb.querySelector('em').textContent = '✅ 已複製，記得收好'; });
        cl.appendChild(el('div', 'pop-l', '這份專案的金鑰'));
        cl.appendChild(kb);
      }
      var cr = el('div', 'proj-acts');
      cr.appendChild(btn('btn primary', S.cloudKey ? '☁️ 更新雲端存檔' : '☁️ 存到雲端（產生金鑰）', function () { cloudSave(false); }));
      if (S.cloudKey) cr.appendChild(btn('btn', '☁️ 另存成新的金鑰', function () { cloudSave(true); }));
      cr.appendChild(btn('btn', '🔑 用金鑰開啟', cloudOpenBox));
      cl.appendChild(cr);
      box.appendChild(cl);
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
  function newClassroom() {
    S = fresh(false); tv = { kind: 'page' }; V.hist = {}; save(); connect(); renderAll();
    setTimeout(function () { $('b-join').click(); }, 200);
  }
  $('b-end').onclick = function () {
    var n = Object.keys(S.students).length;
    modal(function (box) {
      box.appendChild(el('h3', '', '🚪 結束上課'));
      box.appendChild(el('p', '', (n ? '教室裡的 ' + n + ' 位學生都會被請出教室，' : '') + '畫板會清空，下次上課是新的教室和新的代碼。' + (hasContent() ? '<br><b>畫板內容要留著的話，請先按「💾 先存專案檔」。</b>' : '')));
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn', '取消', closeModal));
      if (hasContent()) row.appendChild(btn('btn', '💾 先存專案檔', saveProjectFile));
      row.appendChild(btn('btn danger', '🚪 結束上課', function () {
        closeModal(); net && net.send({ t: 'closed' }, '*');
        setTimeout(function () {
          S = fresh(false); tv = { kind: 'page' }; V.hist = {}; save(); connect(); renderAll();
          modal(function (b2) {
            b2.appendChild(el('h3', '', '🚪 已結束上課'));
            b2.appendChild(el('p', '', '學生都已離開。現在是新的教室（代碼 <b>' + S.code + '</b>）和空白畫板，可以直接開始下一堂課。'));
            var r2 = el('div', 'modal-btns'); r2.appendChild(btn('btn', '好', closeModal)); r2.appendChild(btn('btn primary', '顯示 QR code', function () { $('b-join').click(); })); b2.appendChild(r2);
          });
        }, 400);
      }));
      box.appendChild(row);
    });
  };
  $('b-full').onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { toast('這台裝置不支援全螢幕'); });
    else toast('這台裝置不支援全螢幕');
  };
  document.addEventListener('fullscreenchange', function () { $('b-full').innerHTML = document.fullscreenElement ? '🗗 退出' : '⛶ 全螢幕'; setTimeout(V.refit, 100); });

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
    var had = Object.keys(S.students).length || hasContent();
    if (!had) { S = fresh(false); connect(); renderAll(); save(); setTimeout(function () { $('b-join').click(); }, 300); return; }
    /* 每次打開都是新教室；要接續剛剛的才選「接續」 */
    renderAll(); $('h-code').textContent = '------';
    modal(function (box) {
      box.appendChild(el('h3', '', '🖍️ 要開始新的一堂課嗎？'));
      box.appendChild(el('p', '', '開新教室會有新的教室代碼和空白畫板。如果剛剛是不小心關掉或重新整理，可以選「接續剛剛的教室」（代碼 ' + S.code + '，學生和畫板都還在）。'));
      var row = el('div', 'modal-btns col');
      row.appendChild(btn('btn big primary', '🆕 開新教室（新代碼、空白畫板）', function () { closeModal(); newClassroom(); }));
      if (hasContent()) row.appendChild(btn('btn', '💾 先把剛剛的畫板存成專案檔', saveProjectFile));
      row.appendChild(btn('btn', '↩️ 接續剛剛的教室', function () { closeModal(); connect(); renderAll(); save(); }));
      box.appendChild(row);
    });
    $('modal').onclick = function (e) { if (e.target.id === 'modal' && net) closeModal(); };
  }
  /* ---------- 🗂 圖層：調整物件的上下關係 ---------- */
  var layerBox = null;
  function layerLabel(o) {
    var base = KIND[o.k] || '物件', txt = '';
    if (o.k === 'g') { var sn = { rect: '長方形', square: '正方形', circle: '圓形', ellipse: '橢圓', tri: '三角形', rtri: '直角三角形', trap: '梯形', para: '平行四邊形', rhom: '菱形', line: '直線', arrow: '箭頭', grid: '格子', poly: '多邊形', ruler: '直尺', protr: '量角器', sq45: '三角板 45°', sq30: '三角板 30°60°', numline: '數線', clock: '時鐘', zycell: '國字注音格' }[o.shape]; base = '🔷 ' + (sn || '圖形'); }
    if (o.txt) txt = String(o.txt).replace(/\s+/g, ' ').slice(0, 12);
    return base + (txt ? '：' + txt : '');
  }
  function layersDraw() {
    if (!layerBox) return;
    var ids = V.layerIds().slice().reverse(), list = layerBox.querySelector('.lay-list'); list.innerHTML = '';
    if (!ids.length) list.appendChild(el('p', 'empty', '這一頁還沒有物件。'));
    ids.forEach(function (id, i) {
      var o = V.find(id); if (!o) return;
      var r = el('div', 'lay-row' + (V.sel === id || (V.multi && V.multi.indexOf(id) >= 0) ? ' on' : '') + (o.hd ? ' hid' : ''));
      var nm = btn('lay-n', (i === 0 ? '▲頂 ' : i === ids.length - 1 ? '▼底 ' : '') + esc(layerLabel(o)), function () { tool.mode !== 'select' && setMode('select'); V.select(id); layersDraw(); }); r.appendChild(nm);
      [['⤒', 'front', '置頂'], ['↑', 'up', '上移一層'], ['↓', 'down', '下移一層'], ['⤓', 'back', '置底']].forEach(function (z) { var b = btn('btn sm', z[0], function () { V.reorder([id], z[1]); layersDraw(); }); b.title = z[2]; r.appendChild(b); });
      list.appendChild(r);
    });
  }
  function layersPanel() {
    if (layerBox) { layerBox.parentNode.removeChild(layerBox); layerBox = null; return; }
    layerBox = el('div', 'layer-panel');
    var hd = el('div', 'lay-h'); hd.appendChild(el('b', '', '🗂 圖層（上面的蓋住下面的）')); hd.appendChild(btn('btn sm', '✕', function () { layerBox.parentNode.removeChild(layerBox); layerBox = null; })); layerBox.appendChild(hd);
    layerBox.appendChild(el('p', 'hint', '點一列可以選取那個物件；⤒置頂 ↑上移 ↓下移 ⤓置底。筆跡永遠在物件的上面，影片永遠在最上層。'));
    layerBox.appendChild(el('div', 'lay-list')); document.body.appendChild(layerBox); layersDraw();
  }
  /* ---------- 🎲 課堂工具：點名、抽籤、分組抽籤、倒數計時、隱藏／揭曉 ---------- */
  function stuLabel(sid) { var n = ROSTER[sid]; return n ? n + '（' + sid + '）' : '學號 ' + sid; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var drawnPool = { stu: [], lot: [] };
  /* 抽的動畫：名字快速跳動，越跳越慢，最後停在結果 */
  function spin(names, result, show, done) {
    var n = 0, total = 22;
    (function step() {
      if (n >= total) { show(result, true); done && done(); return; }
      show(names[Math.floor(Math.random() * names.length)], false); n++;
      setTimeout(step, 40 + n * n * 0.45);
    })();
  }
  function drawModal(kind) {
    var isStu = kind === 'stu', title = isStu ? '🎯 隨機點名' : '🎟️ 抽籤';
    modal(function (box) {
      box.classList.add('draw-box');
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', title)); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      var optNo = true, optOnline = true, ta = null;
      if (!isStu) {
        var saved = ''; try { saved = localStorage.getItem('wb-lottery') || ''; } catch (e) {}
        box.appendChild(el('p', 'hint', '一行一個項目（可以是名字、題號、小組…）：'));
        ta = el('textarea', 'help-ta'); ta.style.height = '110px'; ta.value = saved; ta.placeholder = '例如：\n第1題\n第2題\n第3題'; box.appendChild(ta);
        ta.oninput = function () { try { localStorage.setItem('wb-lottery', ta.value); } catch (e) {} drawnPool.lot = []; upd(); };
      }
      var opts = el('div', 'draw-opts');
      var c1 = el('label', '', '<input type="checkbox" checked> 抽過的不再抽'); c1.firstChild.onchange = function () { optNo = this.checked; if (!optNo) drawnPool[kind] = []; upd(); };
      opts.appendChild(c1);
      if (isStu) { var c2 = el('label', '', '<input type="checkbox" checked> 只抽目前在線的學生'); c2.firstChild.onchange = function () { optOnline = this.checked; upd(); }; opts.appendChild(c2); }
      box.appendChild(opts);
      var big = el('div', 'draw-big', '？'); box.appendChild(big);
      var info = el('div', 'hint draw-info'); box.appendChild(info);
      var row = el('div', 'modal-btns');
      var go = btn('btn primary draw-go', '🎲 抽！', function () {
        var pool = poolNow(); if (!pool.length) return;
        go.disabled = true; big.classList.remove('win');
        var r = pool[Math.floor(Math.random() * pool.length)];
        spin(pool.map(lab), r, function (v, fin) { big.textContent = fin ? lab(v) : v; big.classList.toggle('win', !!fin); }, function () {
          if (optNo) drawnPool[kind].push(r); go.disabled = false; upd();
        });
      });
      row.appendChild(go);
      row.appendChild(btn('btn', '🔄 重新開始（全部可再抽）', function () { drawnPool[kind] = []; big.textContent = '？'; big.classList.remove('win'); upd(); }));
      box.appendChild(row);
      function lab(v) { return isStu ? stuLabel(v) : v; }
      function all() {
        if (isStu) { var u = {}; Object.keys(S.students).forEach(function (s) { u[s] = 1; }); if (!optOnline) Object.keys(ROSTER).forEach(function (s) { u[s] = 1; }); return Object.keys(u).filter(function (s) { return !optOnline || online[s]; }).sort(); }
        return ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      }
      function poolNow() { var d = drawnPool[kind]; return all().filter(function (v) { return !optNo || d.indexOf(v) < 0; }); }
      function upd() {
        var a = all(), p = poolNow();
        info.textContent = !a.length ? (isStu ? '目前沒有學生（還沒有人加入，或取消「只抽在線」）' : '請先在上面輸入要抽的項目') : p.length ? '還有 ' + p.length + ' / ' + a.length + ' 個可以抽' + (drawnPool[kind].length ? '；已抽過：' + drawnPool[kind].map(lab).join('、') : '') : '都抽完了！按「重新開始」可以再抽';
        go.disabled = !p.length;
      }
      upd();
    });
  }
  function groupDrawModal() {
    modal(function (box) {
      box.classList.add('draw-box');
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '👥 分組抽籤')); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      var mode = 'n', num = 4, onlyOn = true, res = null;
      var r1 = el('div', 'draw-opts');
      var sel = el('select', 'wide-in'); sel.style.width = 'auto'; sel.innerHTML = '<option value="n">分成幾組</option><option value="m">每組幾人</option>'; sel.onchange = function () { mode = sel.value; };
      var inp = el('input', 'wide-in'); inp.type = 'number'; inp.min = 1; inp.max = 30; inp.value = num; inp.style.width = '80px'; inp.oninput = function () { num = Math.max(1, Math.min(30, +inp.value || 1)); };
      r1.appendChild(sel); r1.appendChild(inp);
      var c2 = el('label', '', '<input type="checkbox" checked> 只分目前在線的學生'); c2.firstChild.onchange = function () { onlyOn = this.checked; }; r1.appendChild(c2);
      box.appendChild(r1);
      var out = el('div', 'draw-groups'); box.appendChild(out);
      var msg = el('div', 'hint'); box.appendChild(msg);
      var row = el('div', 'modal-btns');
      var apply = btn('btn primary', '✅ 套用成分組（真的分到各組）', function () {
        if (!res) return;
        customGroups().forEach(function (g) { delete S.groups[g]; });
        res.forEach(function (list) { var g = newGroup(); if (g) moveTo(list, g); });
        closeModal(); toast('✅ 已分好 ' + res.length + ' 組，可在「👥 學生」看到');
      });
      apply.disabled = true;
      row.appendChild(btn('btn', '🎲 抽籤分組', function () {
        var ids = shuffle(Object.keys(S.students).filter(function (s) { return !onlyOn || online[s]; }));
        if (!ids.length) { msg.textContent = '沒有可以分組的學生。'; return; }
        var k = mode === 'n' ? Math.min(num, ids.length) : Math.max(1, Math.ceil(ids.length / num));
        res = []; for (var i = 0; i < k; i++) res.push([]);
        ids.forEach(function (s, i) { res[i % k].push(s); });
        res.forEach(function (l) { l.sort(); });
        out.innerHTML = ''; res.forEach(function (l, i) { out.appendChild(el('div', 'draw-g', '<b>第 ' + (i + 1) + ' 組</b>（' + l.length + ' 人）<br>' + l.map(stuLabel).join('、'))); });
        msg.textContent = '這只是抽籤結果；按「套用成分組」才會真的分組（會取代目前自訂的分組）。'; apply.disabled = false;
      }));
      row.appendChild(apply); box.appendChild(row);
    });
  }
  /* 倒數計時器：老師畫面和學生畫面都會顯示 */
  var CD = null, cdBox = null;
  function cdLeft() { return !CD ? 0 : CD.paused ? CD.left : Math.max(0, CD.end - Date.now()); }
  function cdMsg() { return CD ? { t: 'cd', total: CD.total, left: cdLeft(), paused: !!CD.paused } : { t: 'cd', off: 1 }; }
  function cdSend(sid) { if (net) net.send(cdMsg(), sid || '*'); }
  function beep(n) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext, c = new AC();
      for (var i = 0; i < (n || 3); i++) { var o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime + i * 0.35); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.35 + 0.3); o.start(c.currentTime + i * 0.35); o.stop(c.currentTime + i * 0.35 + 0.32); }
    } catch (e) {}
  }
  function cdFmt(ms) { var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function cdDraw() {
    if (!CD) { if (cdBox) { cdBox.remove(); cdBox = null; } return; }
    if (!cdBox) {
      cdBox = el('div', 'cd-host'); document.body.appendChild(cdBox);
      cdBox.innerHTML = '<span class="cd-t"></span><button class="cd-b" data-a="p" title="暫停／繼續">⏸</button><button class="cd-b" data-a="r" title="重來">↺</button><button class="cd-b" data-a="x" title="關掉計時器">✕</button>';
      cdBox.onclick = function (e) {
        var a = e.target.dataset && e.target.dataset.a; if (!a) return;
        if (a === 'x') { CD = null; cdSend(); cdDraw(); return; }
        if (a === 'r') { cdStart(CD.total); return; }
        if (CD.paused) { CD.paused = false; CD.end = Date.now() + CD.left; } else { CD.left = cdLeft(); CD.paused = true; }
        cdSend(); cdDraw();
      };
    }
    var l = cdLeft();
    cdBox.querySelector('.cd-t').textContent = (l <= 0 ? '⏰ 時間到！' : '⏱ ' + cdFmt(l));
    cdBox.querySelector('[data-a="p"]').textContent = CD.paused ? '▶' : '⏸';
    cdBox.classList.toggle('hurry', l > 0 && l <= 10000); cdBox.classList.toggle('done', l <= 0);
  }
  function cdStart(ms) { CD = { total: ms, left: ms, end: Date.now() + ms, paused: false, fired: false }; cdSend(); cdDraw(); }
  setInterval(function () { if (!CD) return; if (!CD.paused && !CD.fired && cdLeft() <= 0) { CD.fired = true; beep(3); } cdDraw(); }, 250);
  function timerModal() {
    modal(function (box) {
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '⏱️ 倒數計時')); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      box.appendChild(el('p', 'hint', '計時器會出現在畫面上方，學生的畫面也會同步顯示；時間到會響三聲（學生那邊的聲音依裝置而定）。'));
      var r = el('div', 'proj-acts');
      [1, 2, 3, 5, 10, 15, 20].forEach(function (m) { r.appendChild(btn('btn', m + ' 分鐘', function () { closeModal(); cdStart(m * 60000); })); });
      box.appendChild(r);
      var c = el('div', 'draw-opts'); c.innerHTML = '自訂：<input class="wide-in cd-m" type="number" min="0" max="180" value="0" style="width:80px"> 分 <input class="wide-in cd-s" type="number" min="0" max="59" value="30" style="width:80px"> 秒';
      c.appendChild(btn('btn primary', '▶ 開始', function () { var ms = ((+c.querySelector('.cd-m').value || 0) * 60 + (+c.querySelector('.cd-s').value || 0)) * 1000; if (ms <= 0) return toast('請輸入大於 0 的時間'); closeModal(); cdStart(ms); }));
      box.appendChild(c);
    });
  }
  /* 隱藏／揭曉：隱藏的物件學生看不到，老師這邊會半透明加虛線框 */
  function hiddenCount() { return V.objs.filter(function (o) { return o.hd; }).length; }
  function revealAll() {
    var list = V.objs.filter(function (o) { return o.hd; }); if (!list.length) return toast('這一頁沒有隱藏的物件');
    V.setMulti(list.map(function (o) { return o.id; })); V.groupOp('hide', false); V.setMulti(null); toast('👁 已揭曉 ' + list.length + ' 個物件，學生看得到了');
  }
  function classPanel(anchor) {
    openPop(anchor, function (p) {
      p.appendChild(el('div', 'pop-h', '🎲 課堂工具'));
      function mi(h, fn) { p.appendChild(btn('mi', h, function () { closePop(); fn(); })); }
      mi('🎯 隨機點名', function () { drawModal('stu'); });
      mi('🎟️ 抽籤（自己輸入名單）', function () { drawModal('lot'); });
      mi('👥 分組抽籤', groupDrawModal);
      mi('⏱️ 倒數計時' + (CD ? '（進行中）' : ''), timerModal);
      mi('📊 投票／選擇題' + (POLL ? '（進行中）' : ''), function () { if (POLL) { pollDraw(); toast('投票進行中，看畫面左下角；要出新題請先按「✕ 關閉投票」'); } else pollModal(); });
      mi('👀 作業一覽（看每個人的畫板）', overviewModal);
      p.appendChild(el('div', 'pop-l', '隱藏與揭曉：先把答案或內容藏起來，要用時再給學生看'));
      mi('🙈 隱藏目前選取的物件', function () {
        var ids = V.multi && V.multi.length ? V.multi : V.sel ? [V.sel] : [];
        if (!ids.length) return toast('請先用「選取」點一個物件（或圈選多個），再按這個');
        if (!V.multi || !V.multi.length) V.setMulti(ids);
        V.groupOp('hide', true); toast('🙈 已隱藏，學生看不到；你這邊是半透明虛線框');
      });
      mi('👁 揭曉這一頁所有隱藏的物件（' + hiddenCount() + '）', revealAll);
    });
  }
  /* ---------- 學生名單（預先匯入，之後點名、分組都會顯示名字） ---------- */
  var ROSTER = {}; try { ROSTER = JSON.parse(localStorage.getItem('wb-roster') || '{}') || {}; } catch (e) { ROSTER = {}; }
  function saveRoster() { try { localStorage.setItem('wb-roster', JSON.stringify(ROSTER)); } catch (e) {} }
  function rosterModal() {
    modal(function (box) {
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '📋 匯入學生名單')); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      box.appendChild(el('p', 'hint', '一行一位，格式是「學號 姓名」，中間用空白、逗號或 Tab 隔開（可以從 Excel 直接複製貼上兩欄）。例如：<br>101 王小明<br>102 李小華<br>匯入後，點名、抽籤、分組抽籤和學生名單都會顯示名字。名單會記在這台電腦，每堂課都在。'));
      var ta = el('textarea', 'help-ta'); ta.style.height = '220px';
      ta.value = Object.keys(ROSTER).sort(function (a, b) { return a - b; }).map(function (k) { return k + ' ' + ROSTER[k]; }).join('\n'); box.appendChild(ta);
      var msg = el('div', 'hint'); box.appendChild(msg);
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn primary', '💾 儲存名單', function () {
        var R = {}, bad = 0;
        ta.value.split('\n').forEach(function (ln) { ln = ln.trim(); if (!ln) return; var m = ln.match(/^(\d{1,6})[\s,，、.\t]+(.+)$/); if (m) R[m[1]] = m[2].trim(); else bad++; });
        ROSTER = R; saveRoster(); closeModal(); renderRoster(); toast('✅ 已儲存 ' + Object.keys(R).length + ' 位學生' + (bad ? '，有 ' + bad + ' 行格式不對沒有匯入' : ''));
      }));
      row.appendChild(btn('btn', '🗑 清除名單', function () { ROSTER = {}; saveRoster(); closeModal(); renderRoster(); toast('已清除名單'); }));
      box.appendChild(row);
    });
  }
  /* ---------- 即時投票／選擇題 ---------- */
  var POLL = null, pollBox = null;
  var LET = 'ABCDEF';
  function pollCounts() { var c = POLL.opts.map(function () { return 0; }); Object.keys(POLL.votes).forEach(function (s) { c[POLL.votes[s]]++; }); return c; }
  function pollMsg() {
    if (!POLL) return { t: 'poll', off: 1 };
    var m = { t: 'poll', id: POLL.id, q: POLL.q, opts: POLL.opts, open: POLL.open };
    if (POLL.show) m.res = { counts: pollCounts(), ans: POLL.ans };
    return m;
  }
  function pollSend(sid) { if (net) net.send(pollMsg(), sid || '*'); }
  function pollVote(sid, d) {
    if (!POLL || !POLL.open || d.pid !== POLL.id) return;
    var o = +d.o; if (!(o >= 0 && o < POLL.opts.length)) return;
    POLL.votes[sid] = o; pollDraw(); if (POLL.show) pollSend();
  }
  function pollDraw() {
    if (!POLL) { if (pollBox) { pollBox.parentNode.removeChild(pollBox); pollBox = null; } return; }
    if (!pollBox) { pollBox = el('div', 'poll-host'); document.body.appendChild(pollBox); }
    var c = pollCounts(), tot = Object.keys(POLL.votes).length, mx = Math.max.apply(null, c.concat([1])), onl = Object.keys(S.students).filter(function (s) { return online[s]; });
    var miss = onl.filter(function (s) { return POLL.votes[s] == null; });
    var h = '<div class="ph-q">📊 ' + esc(POLL.q || '投票') + '</div>';
    POLL.opts.forEach(function (t, i) {
      h += '<div class="ph-row' + (POLL.ans === i ? ' ok' : '') + '"><span class="ph-l">' + LET[i] + '</span><span class="ph-t">' + esc(t) + '</span><span class="ph-bar"><i style="width:' + Math.round(c[i] / mx * 100) + '%"></i></span><b>' + c[i] + '</b>' + (POLL.ans === i ? '<em>✓ 正確</em>' : '') + '</div>';
    });
    h += '<div class="ph-m">已答 ' + tot + ' 人・在線 ' + onl.length + ' 人' + (miss.length && miss.length <= 12 ? '・還沒答：' + miss.map(stuLabel).join('、') : '') + '</div>';
    h += '<div class="ph-b"><button data-a="o">' + (POLL.open ? '⏹ 結束作答' : '▶ 重新開放') + '</button><button data-a="s">' + (POLL.show ? '🙈 隱藏結果' : '📢 公布結果給學生') + '</button><button data-a="x">✕ 關閉投票</button></div>';
    pollBox.innerHTML = h;
    pollBox.onclick = function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'x') { POLL = null; pollSend(); pollDraw(); return; }
      if (a === 'o') POLL.open = !POLL.open; else POLL.show = !POLL.show;
      pollSend(); pollDraw();
    };
  }
  function pollModal() {
    modal(function (box) {
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '📊 投票／選擇題')); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      box.appendChild(el('p', 'hint', '學生的畫面會跳出作答按鈕，你這邊即時看到每個選項有幾人選、還有誰沒答。題目可以空白（口頭出題時用）。'));
      var q = el('input', 'wide-in'); q.placeholder = '題目（可以空白）'; box.appendChild(q);
      var n = 4, tf = false, ans = -1, listEl = el('div', 'poll-opts'); box.appendChild(listEl);
      var texts = [];
      function build() {
        listEl.innerHTML = '';
        var top = el('div', 'draw-opts');
        [['選擇題', false], ['是非題（⭕ ❌）', true]].forEach(function (z) { top.appendChild(btn('btn sm' + (tf === z[1] ? ' primary' : ''), z[0], function () { tf = z[1]; ans = -1; build(); })); });
        if (!tf) { top.appendChild(el('span', '', '選項數：')); [2, 3, 4, 5, 6].forEach(function (k) { top.appendChild(btn('btn sm' + (n === k ? ' primary' : ''), String(k), function () { n = k; if (ans >= n) ans = -1; build(); })); }); }
        listEl.appendChild(top);
        var cnt = tf ? 2 : n;
        for (var i = 0; i < cnt; i++) (function (i) {
          var r = el('div', 'draw-opts'); r.appendChild(el('b', '', tf ? (i ? '❌' : '⭕') : LET[i] + '.'));
          if (!tf) { var t = el('input', 'wide-in'); t.placeholder = '選項 ' + LET[i] + '（可以空白，只用字母）'; t.value = texts[i] || ''; t.oninput = function () { texts[i] = t.value; }; t.style.flex = '1'; r.appendChild(t); }
          r.appendChild(btn('btn sm' + (ans === i ? ' primary' : ''), ans === i ? '✓ 正確答案' : '設為正確答案', function () { ans = ans === i ? -1 : i; build(); }));
          listEl.appendChild(r);
        })(i);
        listEl.appendChild(el('p', 'hint', '正確答案可以不設；設了也要等你按「公布結果」學生才看得到。'));
      }
      build();
      var row = el('div', 'modal-btns');
      row.appendChild(btn('btn primary', '▶ 開始投票', function () {
        var cnt = tf ? 2 : n, opts = [];
        for (var i = 0; i < cnt; i++) opts.push(tf ? (i ? '❌' : '⭕') : (texts[i] || '').trim());
        POLL = { id: WB.uid(), q: q.value.trim(), opts: opts, votes: {}, open: true, show: false, ans: ans };
        closeModal(); pollSend(); pollDraw();
      }));
      box.appendChild(row);
    });
  }
  /* ---------- 作業一覽：每個人／組的畫板縮圖，點一下進去看 ---------- */
  function groupLabel(gid) { var g = S.groups[gid]; if (g && g.custom) return gname(gid) + '（' + members(gid).length + ' 人）'; var m = members(gid)[0]; return m ? stuLabel(m) : gname(gid); }
  function overviewModal() {
    modal(function (box) {
      box.classList.add('ov-box');
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '👀 作業一覽')); hd.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(hd);
      var gs = liveGroups();
      if (!gs.length) { box.appendChild(el('p', 'empty', '還沒有學生加入。')); return; }
      box.appendChild(el('p', 'hint', '點縮圖就會進到那個人（組）的畫板，可以直接和他們一起寫；進去後上方有 ◀ ▶ 可以逐一翻看。要有指派畫板（「📋 任務」）才看得到內容。'));
      var picks = [], cmpBtn = btn('btn primary', '🆚 並排比較選取的（0）', function () { compareModal(picks.slice()); }); cmpBtn.disabled = true; box.appendChild(cmpBtn);
      var grid = el('div', 'ov-grid'); box.appendChild(grid);
      gs.forEach(function (gid) {
        var g = S.groups[gid], card = el('button', 'ov-card'), cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
        var objs = g.cur ? objsOf('G:' + gid) : null, info = '';
        if (objs) {
          WB.render(cv.getContext('2d'), objs, 320 / 1600, '#fff', true);
          var mine = objs.filter(function (o) { return o.by !== 'T'; }).length;
          info = mine ? '✏️ 已寫（' + mine + '）' : '⚪ 還沒動筆';
        } else { var x = cv.getContext('2d'); x.fillStyle = '#eef1f7'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#9aa3b8'; x.font = '20px sans-serif'; x.textAlign = 'center'; x.fillText('未指派畫板', 160, 95); info = '⏳ 未指派'; }
        card.appendChild(cv);
        var on = members(gid).some(function (s) { return online[s]; });
        card.appendChild(el('div', 'ov-l', '<span class="dot ' + (on ? 'online' : 'offline') + '"></span> ' + esc(groupLabel(gid)) + ' <small>' + info + '</small>'));
        var pk = el('label', 'ov-pick'); pk.innerHTML = '<input type="checkbox"> 比較'; pk.onclick = function (e) { e.stopPropagation(); }; pk.firstChild.onchange = function () { if (this.checked) picks.push(gid); else picks.splice(picks.indexOf(gid), 1); cmpBtn.disabled = picks.length < 2 || picks.length > 6; cmpBtn.textContent = '🆚 並排比較選取的（' + picks.length + '）'; }; card.appendChild(pk);
        card.onclick = function () { if (!g.cur) return toast('這位（組）還沒有指派畫板，先到「📋 任務」指派頁面'); tv = { kind: 'group', gid: gid }; closeModal(); showBoard(); };
        grid.appendChild(card);
      });
    });
  }
  function stepGroup(d) {
    var gs = liveGroups().filter(function (g) { return S.groups[g].cur; }); if (!gs.length) return;
    var i = gs.indexOf(tv.gid); i = (i + d + gs.length) % gs.length; tv = { kind: 'group', gid: gs[i] }; showBoard();
  }
  /* ---------- 匯入 PDF／多張圖片：每一頁變成一頁畫板（可以直接在上面寫） ---------- */
  function loadPdfJs() {
    return new Promise(function (ok, bad) {
      if (window.pdfjsLib) return ok(window.pdfjsLib);
      var s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { bad(new Error('pdf.js 載入失敗')); }; document.head.appendChild(s);
    });
  }
  function canvasJpeg(cv) {
    var q = 0.88, d = cv.toDataURL('image/jpeg', q);
    while (d.length > 450000 && q > 0.4) { q -= 0.1; d = cv.toDataURL('image/jpeg', q); }
    return d;
  }
  function pageObjFromCanvas(cv) {
    var id = 'im' + WB.uid(), d = canvasJpeg(cv); WB.setImg(id, d); idbPut('i', id, d);
    var f = Math.min(WB.W / cv.width, WB.H / cv.height), ww = Math.round(cv.width * f), hh = Math.round(cv.height * f);
    return { id: WB.uid(), k: 'i', by: 'T', x: Math.round((WB.W - ww) / 2), y: Math.round((WB.H - hh) / 2), w: ww, h: hh, r: 0, fx: false, src: id, lk: true };
  }
  function readImageCanvas(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height); ok(cv);
        };
        im.onerror = function () { bad(new Error('圖片讀不出來')); }; im.src = fr.result;
      };
      fr.onerror = function () { bad(new Error('讀檔失敗')); }; fr.readAsDataURL(file);
    });
  }
  function importPages(files) {
    files = [].slice.call(files); if (!files.length) return;
    var made = [], MAXP = 40;
    function stop(e) { toast('匯入沒有完成：' + (e && e.message ? e.message : '請換一個檔案再試')); }
    function finish() {
      if (!made.length) return;
      var after = S.cur; made.forEach(function (o) { after = newPage(after, [o]).id; });
      S.cur = made.length ? S.pages[pageIdx(after) - made.length + 1].id : S.cur; save(); refreshAll(); showBoard();
      toast('✅ 已匯入 ' + made.length + ' 頁，放在目前這頁的後面（圖片已鎖定，要移動請在物件上按右鍵解鎖）');
    }
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        if (made.length >= MAXP) return;
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          toast('正在讀取 PDF…');
          return loadPdfJs().then(function (lib) { return f.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); }).then(function (doc) {
            var n = Math.min(doc.numPages, MAXP - made.length), p = Promise.resolve();
            if (doc.numPages > n) toast('PDF 有 ' + doc.numPages + ' 頁，一次最多匯入 ' + MAXP + ' 頁，先匯入前 ' + n + ' 頁');
            for (var i = 1; i <= n; i++) (function (i) {
              p = p.then(function () { return doc.getPage(i); }).then(function (pg) {
                var vp0 = pg.getViewport({ scale: 1 }), sc = 1600 / Math.max(vp0.width, vp0.height), vp = pg.getViewport({ scale: sc });
                var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
                var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
                toast('正在轉換 PDF 第 ' + i + ' / ' + n + ' 頁…');
                return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () { made.push(pageObjFromCanvas(cv)); });
              });
            })(i);
            return p;
          });
        }
        if (/^image\//.test(f.type)) return readImageCanvas(f).then(function (cv) { made.push(pageObjFromCanvas(cv)); });
        toast('「' + f.name + '」不是 PDF 或圖片，已略過（簡報請先另存成 PDF）');
      });
    });
    chain.then(finish, function (e) { stop(e); finish(); });
  }
  /* ---------- 並排比較幾位學生的畫板 ---------- */
  var cmpTimer = null;
  function compareModal(gids) {
    modal(function (box) {
      box.classList.add('cmp-box');
      var hd = el('div', 'help-top'); hd.appendChild(el('h3', '', '🆚 並排比較（' + gids.length + ' 個）')); hd.appendChild(btn('btn', '✕ 關閉', function () { clearInterval(cmpTimer); closeModal(); })); box.appendChild(hd);
      box.appendChild(el('p', 'hint', '畫面會隨學生書寫自動更新。要進去看或一起寫，請先關閉，再到「作業一覽」點那一個。'));
      var grid = el('div', 'cmp-grid cols' + (gids.length <= 2 ? gids.length : gids.length <= 4 ? 2 : 3)); box.appendChild(grid);
      var cvs = gids.map(function (gid) { var c = el('div', 'cmp-cell'), cv = document.createElement('canvas'); cv.width = 800; cv.height = 450; c.appendChild(cv); c.appendChild(el('div', 'ov-l', esc(groupLabel(gid)))); grid.appendChild(c); return cv; });
      function draw() {
        if ($('modal').hidden || !$('modal-box').classList.contains('cmp-box')) { clearInterval(cmpTimer); return; }
        gids.forEach(function (gid, i) { var g = S.groups[gid], objs = g && g.cur ? objsOf('G:' + gid) : null, cx = cvs[i].getContext('2d'); if (objs) WB.render(cx, objs, 800 / 1600, '#fff', true); else { cx.fillStyle = '#eef1f7'; cx.fillRect(0, 0, 800, 450); } });
      }
      draw(); clearInterval(cmpTimer); cmpTimer = setInterval(draw, 1500);
    });
  }
  /* ---------- ❓ 如何使用（給使用者／給AI） ---------- */
  var UI = {}; try { UI = JSON.parse(localStorage.getItem('wb-ui') || '{}') || {}; } catch (e) { UI = {}; }
  function applyUI() { document.body.classList.toggle('dark', !!UI.dark); document.body.classList.toggle('ui-big', UI.size === 'big'); document.body.classList.toggle('ui-xl', UI.size === 'xl'); setTimeout(function () { V.refit && V.refit(); }, 50); }
  function saveUI() { try { localStorage.setItem('wb-ui', JSON.stringify(UI)); } catch (e) {} applyUI(); if (typeof savePrefs === 'function' && fbUser) savePrefs(); }
  applyUI();
  var HELP_SAMPLE = {
    app: 'class-whiteboard', v: 1, name: '範本：三上國語第一課',
    pages: [
      { id: 'p1', bg: '', objs: [
        { id: 'a1', k: 't', by: 'T', x: 200, y: 280, w: 1200, h: 140, r: 0, fx: false, txt: '第一課　春天來了', v: false, fs: 80, c: '#111111' },
        { id: 'a2', k: 't', by: 'T', x: 200, y: 450, w: 1200, h: 80, r: 0, fx: false, txt: '今天我們要學：生字、造詞、朗讀', v: false, fs: 40, c: '#555555' }
      ] },
      { id: 'p2', bg: 'dots', objs: [
        { id: 'b1', k: 't', by: 'T', x: 80, y: 40, w: 900, h: 90, r: 0, fx: false, txt: '一、生字教學', v: false, fs: 56, c: '#d9480f' },
        { id: 'b2', k: 'g', by: 'T', shape: 'rect', x: 100, y: 180, w: 520, h: 300, r: 0, fx: false, sc: '#1971c2', sw: 4, fill: true, fc: '#d0ebff', op: 1, txt: '春', tc: '#111111', fs: 160 },
        { id: 'b3', k: 'n', by: 'T', x: 700, y: 180, w: 340, h: 300, r: 0, fx: false, c: '#fff3a6', txt: '想一想：春天有哪些東西？', fs: 32 }
      ] }
    ],
    imgs: {}
  };
  var HELP_PROMPT = [
    '你要幫我建立或修改「Andice的共用畫板」的專案檔（一個 JSON 檔，副檔名 .wbproj.json）。我會用畫板的「💾 專案 → 📂 開啟專案檔」直接打開它來上課，所以請只輸出一份「完整、合法、可以直接存檔」的 JSON，放在一個程式碼區塊裡，前後不要加多餘的說明（有想提醒的事請寫在區塊外的一兩句話）。',
    '',
    '【整體結構】',
    '{ "app":"class-whiteboard", "v":1, "name":"專案名稱", "pages":[ {"id":"p1","bg":"","objs":[ …物件… ]}, … ], "imgs":{} }',
    '- app 必須是 "class-whiteboard"，pages 至少一頁。',
    '- 每頁：id（本專案內不重複的短字串）、bg（背景："" 空白、"dots" 格點、"grid" 格線、"tian" 田字格、"zy" 國字注音格、"paper" 作文稿紙、"ruled" 橫線）、objs（物件陣列，越後面的越在上層）。',
    '- 畫布固定 1600 × 900（左上角是 0,0，x 向右、y 向下）。物件請放在這個範圍內，四周留 40～80 的邊。',
    '',
    '【物件通用欄位】id（全專案不重複）、k（種類）、by 固定寫 "T"、x、y、w、h（位置與大小）、r（旋轉角度，通常 0）、fx（左右翻轉，通常 false）。可選 lk:true 鎖定（學生與老師都不能誤拖）；可選 hd:true 先隱藏（學生看不到，老師按揭曉才會出現，適合放答案）。',
    '',
    '【物件種類 k】',
    '1. 文字 k:"t"：txt（文字，\\n 換行）、v（true 為直式文字）、fs（字級，18～120，標題 56～80、內文 32～44）、c（文字顏色，如 "#111111"）。可選 bd（外框顏色）與 bw（外框粗細）。w、h 要夠大：高度約 ≥ 字級 ×1.4 ×行數。',
    '2. 便利貼 k:"n"：c 只能是這六色之一 "#fff3a6"黃 "#ffd6e5"粉 "#cfe8ff"藍 "#d4f5d0"綠 "#e6d9ff"紫 "#ffe0c2"橙；txt、fs（14～80）。常用大小 w:220～340,h:220～300。',
    '3. 圖形 k:"g"：shape 可為 rect、square、circle、ellipse、tri、rtri、trap、para、rhom、line、arrow、grid、poly，以及教具 ruler（直尺，n=公分數，預設 15）、protr（量角器）、numline（數線，nmin／nmax／st 為起點、終點、每格）、clock（時鐘，hh 時 0-11、mm 分 0-59，w 與 h 要相同）、sq45／sq30（三角板，要加 ar:true、n:公分數）、zycell（國字注音格，rows 為格數，h＝格數×單格高，w＝單格高×1.35，ar:true，sc 固定 \"#2f9e44\"）；sc（線色）、sw（線粗，1～12）、fill（是否填色）、fc（填色）、op（透明度 0～1，通常 1）。poly 要加 n（邊數 3～12）；grid 要加 rows、cols；line／arrow 要加 dir（1 或 -1）。圖形內可放字：txt、tc（字色）、fs。',
    '4. YouTube 影片 k:"v"：yt（11 碼影片代號，例如網址 youtu.be/dQw4w9WgXcQ 的 dQw4w9WgXcQ）、st（起始秒數，預設 0）。建議 w:640,h:360。',
    '5. 圖片 k:"i"：src 是圖片代號，圖片本身的 data URL 要放在最上層 imgs 裡，例如 "imgs":{"im1":"data:image/jpeg;base64,…"}。你若拿不到圖片就不要放圖片物件，改用文字或圖形，並在區塊外提醒我之後自己用「➕插入 → 圖片」補上。',
    '6. 連結：用文字物件（k:"t"），txt 直接寫完整網址（https://…）即可，畫板會變成可以點的連結。',
    '',
    '【排版原則】每頁只放一個重點；標題在上方（y 約 40～120）；內容分區擺放，物件之間不要重疊；字要大，教室後排也看得到；顏色不超過 3～4 種，對比要清楚（淺底配深字）。',
    '',
    '【修改既有專案時】我會貼上現有的專案 JSON。請保留所有未提到的頁面與物件原封不動（含 id），只改我說的部分；新增物件的 id 不可與現有的重複；最後仍然輸出完整的 JSON。',
    '',
    '【完整範本（照這個格式寫）】',
    JSON.stringify(HELP_SAMPLE, null, 1),
    '',
    '現在請依我的需求製作：'
  ].join('\n');
  function downloadSample() {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(HELP_SAMPLE, null, 1)], { type: 'application/json' }));
    a.download = '範本專案.wbproj.json'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 3000);
  }
  function helpModal(tab) {
    modal(function (box) {
      box.classList.add('help-box');
      var h = el('div', 'help-top');
      h.appendChild(el('h3', '', '❓ 如何使用 Andice的共用畫板'));
      h.appendChild(btn('btn', '✕ 關閉', closeModal)); box.appendChild(h);
      var tabs = el('div', 'help-tabs'), body = el('div', 'help-body');
      var tU = btn('btn', '📖 基本功能介紹', function () { helpModal('u'); });
      var tA = btn('btn', '🤖 給AI的說明', function () { helpModal('a'); });
      var tS = btn('btn', '🎨 顯示設定', function () { helpModal('s'); });
      (tab === 'a' ? tA : tab === 's' ? tS : tU).classList.add('primary'); tabs.appendChild(tU); tabs.appendChild(tA); tabs.appendChild(tS);
      box.appendChild(tabs); box.appendChild(body);
      if (tab === 's') {
        body.appendChild(el('p', 'hint', '這些設定只影響<b>老師這台電腦／平板</b>，學生的畫面不會變。設定會記在這個瀏覽器。'));
        body.appendChild(el('div', 'pop-l tag t2', '🔠 字體大小（工具欄文字、選單、說明視窗）'));
        var r1 = el('div', 'proj-acts');
        [['', '標準'], ['big', '大'], ['xl', '特大']].forEach(function (z) { r1.appendChild(btn('btn' + ((UI.size || '') === z[0] ? ' primary' : ''), z[1], function () { UI.size = z[0]; saveUI(); helpModal('s'); })); });
        body.appendChild(r1);
        body.appendChild(el('div', 'pop-l tag t4', '🧰 工具欄順序（常用的放上面；「⇄」鍵固定在最上面）'));
        var ow = el('div', 'ord-wrap'); body.appendChild(ow); orderPanel(ow);
        body.appendChild(el('p', 'hint', '登入 Google（「💾 專案」→ 我的專案）後，順序和顯示設定會存在你的帳號，換電腦登入也會一樣。'));
        body.appendChild(el('div', 'pop-l tag t3', '🌙 顏色'));
        var r2 = el('div', 'proj-acts');
        [[false, '☀️ 淺色'], [true, '🌙 深色（工具欄、選單變暗；畫布維持白色，筆跡才看得清楚）']].forEach(function (z) { r2.appendChild(btn('btn' + (!!UI.dark === z[0] ? ' primary' : ''), z[1], function () { UI.dark = z[0]; saveUI(); helpModal('s'); })); });
        body.appendChild(r2);
        return;
      }
      if (tab === 'a') {
        body.appendChild(el('p', 'hint', '想請 AI（Claude、ChatGPT、Gemini 都可以）幫你做或改上課內容時：<b>① 按下面的「複製提示詞」→ ② 貼給 AI，再接著寫你要的課程內容 → ③ 把 AI 給你的 JSON 存成檔案（副檔名要是 .wbproj.json，或直接用「💾 專案」裡的開啟）→ ④ 用「💾 專案 → 📂 開啟專案檔」打開。</b>要請 AI 修改現有專案：先用「💾 存成專案檔」下載，把檔案內容一起貼給 AI。'));
        var r = el('div', 'proj-acts');
        r.appendChild(btn('btn primary', '📋 複製給AI的提示詞（含範本）', function () { copy(HELP_PROMPT); toast('✅ 已複製，貼給 AI 就可以了'); }));
        r.appendChild(btn('btn', '⬇ 下載範本專案檔', downloadSample));
        r.appendChild(btn('btn', '📂 直接開啟範本看效果', function () { confirmBox('開啟範本會取代目前畫板的所有頁面（建議先存成專案檔）。要開啟嗎？', '開啟範本', function () { loadProject(JSON.parse(JSON.stringify(HELP_SAMPLE))); toast('已開啟範本'); }); }));
        body.appendChild(r);
        body.appendChild(el('div', 'pop-l sec', '提示詞全文（給 AI 看的；可以先預覽）'));
        var ta = el('textarea', 'help-ta'); ta.readOnly = true; ta.value = HELP_PROMPT; ta.onclick = function () { ta.select(); }; body.appendChild(ta);
        return;
      }
      body.innerHTML = HELP_USER;
    });
  }
  var HELP_USER =
    '<h4>🚀 一堂課的流程</h4><ol><li>打開老師端，看到上方的 <b>教室代碼</b>；按它會出現 QR code 和加入網址。</li><li>學生用平板／手機掃 QR code，或到學生網址輸入「教室代碼 + 學號」就能加入（學號只能數字，同一個學號不能同時在兩台裝置登入）。</li><li>你在畫板上寫、貼圖、放影片，學生的畫面會<b>即時同步</b>。</li><li>下課按「🚪 結束上課」，學生會被請出教室，下次上課是新的教室代碼。<b>要留的內容請先存成專案檔</b>。</li></ol>' +
    '<h4>🔀 三種模式（上方中間）</h4><ul><li><b>🧑‍🏫 上課模式</b>：你可以用所有工具，學生只能看（或依你開的權限寫）。</li><li><b>📽️ 簡報模式</b>：像 PPT 放映，只能翻頁（鍵盤 ← →、空白鍵，或畫面上的按鈕）、播放影片。</li><li><b>✏️ 作業模式</b>：學生在你指派的頁面上作答，有倒數計時，時間到會提醒。可以按「▶ 繼續作業」再給時間。</li></ul>' +
    '<h4>🛠️ 工具欄（畫面側邊，可按「⇄」換左右）</h4><ul><li><b>筆</b>：原子筆、螢光筆、麥克筆、雷射筆（雷射筆 3 秒後消失，適合指重點）；黑／紅／藍三色快選，旁邊可選更多顏色與粗細。</li><li><b>橡皮擦</b>；<b>清除筆劃</b>（只清手寫）；<b>全清除</b>（整頁清空，可用「上一步」救回）。</li><li><b>選取</b>：點物件可移動、縮放、旋轉；在空白處拖一圈可<b>圈選多個</b>（含筆劃），一起搬、縮放、複製、刪除。按住 Shift（可在選取面板改鍵）再點，可一個一個加選。</li><li><b>圖形</b>：長方形、圓、三角、箭頭、格子、多邊形等，可填色、可在裡面打字。</li><li><b>➕插入</b>：便利貼、文字（橫／直式）、連結、YouTube 影片、圖片（選檔或直接貼上；也能<b>匯入 PDF 或多張圖片，每一頁變成一頁畫板</b>，可以直接在上面寫，簡報請先另存成 PDF，一次最多 40 頁）、<b>教具</b>（直尺、量角器、兩種三角板、數線、時鐘、國字注音格；數線選取後，拖兩端的黃色圓點可增減左右的數字；時鐘和數線在物件右鍵選單可以調整時間和範圍）、背景（空白、格點、格線、田字格、國字注音格、作文稿紙、橫線）。</li><li><b>全部鎖定</b>：鎖住後不會誤拖物件；單一物件也可以在右鍵選單鎖定。</li><li><b>🎲 課堂</b>：<b>隨機點名</b>（從在線學生抽，抽過的不再抽）、<b>抽籤</b>（自己輸入名單）、<b>分組抽籤</b>（分成幾組或每組幾人，可一鍵套用成分組）、<b>倒數計時</b>（老師和學生畫面都會顯示，時間到響聲）、<b>隱藏／揭曉</b>（把物件先藏起來學生看不到，要用時再揭曉；物件右鍵也有「🙈 先隱藏」）、<b>投票／選擇題</b>（學生畫面跳出作答按鈕，你即時看到每個選項幾人選、誰還沒答，可設正確答案再公布）、<b>作業一覽</b>（每位學生／每組畫板的縮圖，點進去可一起寫，上方 ◀ ▶ 逐一翻看；勾選「比較」可以把 2～6 位的畫板並排看）。</li><li><b>放大鏡</b>：按住快捷鍵＋滑鼠滾輪放大畫面，學生同步看到；快捷鍵可自訂，並會偵測有沒有被電腦系統佔用。放大後，<b>按住空白鍵（可改）再拖曳畫布</b>，上下左右都能移動；滑鼠中鍵拖曳也可以；平板用<b>兩根手指</b>拖曳。</li><li><b>動作 ▾</b>：<b>上一步</b>和<b>下一步</b>（復原與重做）。電腦上滑鼠移上去就會展開，平板和手機按一下展開；鍵盤 Ctrl／⌘+Z 是上一步，Ctrl／⌘+Y 是下一步。</li></ul>' +
    '<h4>🖱️ 小技巧</h4><ul><li>在物件上<b>按右鍵</b>（平板長按）會有選單：複製、刪除、鎖定、旋轉、顏色等。</li><li>連按兩下文字、便利貼、圖形可以直接編輯內容。</li><li>YouTube 影片框你按播放／暫停／拖時間，學生那邊會一起動。</li><li>左邊的頁面欄可以新增、複製、排序、刪除頁面，每頁可以換背景。</li></ul>' +
    '<h4>👥 學生與分組（上方「👥 學生名單」「📋 任務指派」）</h4><ul><li>「👥 學生」裡的「📋 匯入名單」可以貼上「學號 姓名」，之後點名、分組、學生名單都會顯示名字（名單記在這台電腦）。</li><li>學生名單可以分組（最多 30 人、30 組）、移出學生。</li><li>「任務指派」可以勾選要指派的頁面給各組，設定每組能不能寫、能不能貼便利貼，也能把某一位學生或某一組的畫面投到全班。</li></ul>' +
    '<h4>🗂 圖層</h4><p>物件重疊時，在物件上按右鍵可以「置頂、上移、下移、置底」；按「選取」兩下打開選單，點「開啟圖層面板」，會列出這一頁所有物件由上到下的順序，每一列也能調整。筆跡永遠在物件的上面，影片永遠在最上層。</p><h4>🎨 顯示設定</h4><p>在這個視窗上方的「🎨 顯示設定」：字體可以調成標準／大／特大（工具欄文字、選單、說明視窗），也可以切換深色模式（只有老師的介面變暗，畫布維持白色），還能用 ▲▼ 調整工具欄按鈕的上下順序（登入 Google 後，順序會跟著帳號走）。這些只影響這台電腦，學生不受影響。工具欄放不下時，用滑鼠滾輪或手指上下滑就能找到下面的按鈕。</p><h4>💾 存檔與換電腦（上方「💾 專案」）</h4><ul><li><b>我的專案</b>：用 Google 帳號登入後存起來，在任何電腦登入都看得到、可再開啟。</li><li><b>📁 專案檔</b>：存成檔案（.wbproj.json）放在這台電腦，需要時再「開啟專案檔」。</li><li><b>🔑 用金鑰分享</b>：存到雲端得到一串金鑰，輸入金鑰就能在別台電腦或給同事開啟。</li><li>專案內容包含所有頁面、圖片、文字、圖形、便利貼、影片，<b>不含</b>學生名單和學生作答。</li></ul>' +
    '<h4>🤖 想請 AI 幫你做課程內容？</h4><p>切換到上面的「給AI的說明」分頁，複製提示詞貼給任何 AI，它就能幫你產出可以直接打開的專案檔。</p>';
  $('b-help').onclick = function () { helpModal('u'); };

  idbLoadImgs(function () { idbGet('s', 'S', boot); });
  window.__wb = { S: function () { return S; }, V: V };
})();
