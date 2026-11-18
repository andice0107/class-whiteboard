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
      groups: {}, students: {}, penAll: true, wallShow: false, show: {}
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
  function gname(gid) { var m = members(gid); return m.length > 1 ? (S.groups[gid].name || '第 ' + gid + ' 組') : (m[0] || gid); }
  function objsOf(bid) {
    if (!bid) return null;
    if (bid.slice(0, 2) === 'P:') { var p = page(bid.slice(2)); return p ? p.objs : null; }
    var g = S.groups[bid.slice(2)]; return g && g.cur ? g.boards[g.cur] : null;
  }
  function penOK(sid) { var st = S.students[sid]; if (!st) return false; return st.pen == null ? S.penAll : st.pen; }

  /* ---------- 學生看到的畫面 ---------- */
  function viewFor(sid) {
    var st = S.students[sid], g = S.groups[st.gid];
    if (S.mode === 'work' && g && g.cur && page(g.cur)) return { bid: 'G:' + st.gid, editable: penOK(sid), title: '✏️ 作業時間・第 ' + pageNo(g.cur) + ' 頁' + (members(st.gid).length > 1 ? '（' + gname(st.gid) + '）' : ''), mode: 'work' };
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
      if (s === 'online') { if (S.broker !== net.broker) { S.broker = net.broker; save(); if (!$('modal').hidden && $('modal-box').classList.contains('join-box')) $('b-join').click(); } net.send({ t: 'hostup' }, '*'); }
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
    onOp: function (bid, op) {
      WB.applyOp(objsOf(bid) || [], op);
      distribute(bid, { t: 'op', op: op });
      boardChanged(bid); save(); renderTools();
    },
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
  function renderTools() {
    var t = $('toolbar'); t.innerHTML = '';
    t.appendChild(btn('tb' + (tool.mode === 'pen' ? ' on' : ''), '✏️<small>畫筆</small>', function () { tool.mode = 'pen'; V.setTool(tool); renderTools(); }));
    var cs = el('div', 'colors');
    COLORS.forEach(function (c) { var b = btn('sw' + (tool.mode === 'pen' && tool.color === c ? ' on' : ''), '', function () { tool.mode = 'pen'; tool.color = c; V.setTool(tool); renderTools(); }); b.style.background = c; b.title = c; cs.appendChild(b); });
    t.appendChild(cs);
    var ws = el('div', 'widths');
    WIDTHS.forEach(function (w) { var b = btn('wd' + (tool.width === w ? ' on' : ''), '<i style="width:' + (w + 4) + 'px;height:' + (w + 4) + 'px"></i>', function () { tool.width = w; if (tool.mode !== 'pen') tool.mode = 'pen'; V.setTool(tool); renderTools(); }); ws.appendChild(b); });
    t.appendChild(ws);
    t.appendChild(btn('tb' + (tool.mode === 'erase' ? ' on' : ''), '🧽<small>橡皮擦</small>', function () { tool.mode = 'erase'; V.setTool(tool); renderTools(); }));
    var u = btn('tb', '↩️<small>上一步</small>', function () { V.undo(); renderTools(); }); u.disabled = !V.canUndo(); t.appendChild(u);
    t.appendChild(btn('tb', '🗑️<small>全消除</small>', function () {
      confirmBox('要把這一頁的筆劃全部擦掉嗎？（含學生的筆劃，按「上一步」可以救回來）', '全部擦掉', function () { V.clear(true); renderTools(); });
    }));
  }
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); V.undo(); renderTools(); } });

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
  function drawThumb(cv, objs) { WB.render(cv.getContext('2d'), objs || [], cv.width / WB.W); }
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
  function renderRoster() {
    var ids = Object.keys(S.students).sort();
    $('h-count').textContent = ids.filter(function (s) { return online[s]; }).length + '/' + ids.length;
    var side = $('side'); if (side.hidden) return;
    side.innerHTML = '';
    var h = el('div', 'side-h'); h.appendChild(el('b', '', '👥 學生名單')); h.appendChild(btn('x', '✕', function () { side.hidden = true; })); side.appendChild(h);
    var pr = el('div', 'pen-all'); pr.appendChild(el('span', '', '全部學生的畫筆'));
    pr.appendChild(btn('btn sm' + (S.penAll ? ' primary' : ''), '全開', function () { setPenAll(true); }));
    pr.appendChild(btn('btn sm' + (!S.penAll ? ' danger' : ''), '全關', function () { setPenAll(false); }));
    side.appendChild(pr);
    if (!ids.length) side.appendChild(el('p', 'empty', '還沒有學生加入。按上方「教室代碼」顯示 QR code 給學生掃。'));
    ids.forEach(function (s) {
      var r = el('div', 'stu' + (online[s] ? '' : ' off'));
      r.appendChild(el('span', 'dot ' + (online[s] ? 'online' : 'offline')));
      r.appendChild(el('b', '', s));
      r.appendChild(el('span', 'grow'));
      var pb = btn('pen-tg' + (penOK(s) ? ' on' : ''), penOK(s) ? '✏️ 可畫' : '🚫 不可畫', function () { togglePen(s); });
      r.appendChild(pb);
      side.appendChild(r);
    });
    side.appendChild(el('p', 'hint', '畫筆權限只在「作業模式」有作用；簡報模式時學生一律只能看。'));
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
    var gids = Object.keys(S.groups).filter(function (g) { return members(g).length; }).sort(function (a, b) { return members(a)[0] < members(b)[0] ? -1 : 1; });
    if (!gids.length) grid.appendChild(el('p', 'empty', '還沒有學生加入教室。'));
    gids.forEach(function (gid) {
      var g = S.groups[gid], ms = members(gid), on = ms.some(function (s) { return online[s]; });
      var shown = S.show[gid] != null ? S.show[gid] : S.wallShow;
      var tile = el('div', 'tile' + (on ? '' : ' off') + (S.cast === gid ? ' casting' : ''));
      var th = el('div', 'tile-h');
      th.appendChild(el('span', 'dot ' + (on ? 'online' : 'offline')));
      th.appendChild(el('b', '', gname(gid)));
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
      if (ms.length === 1) { var s0 = ms[0]; ft.appendChild(btn('pen-tg sm' + (penOK(s0) ? ' on' : ''), penOK(s0) ? '✏️' : '🚫', function () { togglePen(s0); })); }
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
    return base + 'play.html' + (WBNet.LOCAL ? '?local=1' : '') + '#b=' + (S.broker || 0);
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
  connect(); renderAll();
  if (!Object.keys(S.students).length) setTimeout(function () { $('b-join').click(); }, 300);
  window.__wb = { S: function () { return S; }, V: V };
})();
