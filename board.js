/* 共用畫板繪圖核心：固定 1600x900 畫布、物件模型、畫筆、局部橡皮擦、上一步 */
window.WB = (function () {
  'use strict';
  var W = 1600, H = 900;
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function drawStroke(ctx, o) {
    var p = o.p, n = p.length / 2;
    ctx.strokeStyle = o.c; ctx.lineWidth = o.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (n === 1) { ctx.fillStyle = o.c; ctx.arc(p[0], p[1], o.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.moveTo(p[0], p[1]);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i * 2] + p[i * 2 + 2]) / 2, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mx, my);
    }
    ctx.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
    ctx.stroke();
  }
  /* 圖片庫：id → dataURL；所有畫板共用 */
  var imgs = {}, imgEls = {}, imgWait = [];
  function setImg(id, d) { imgs[id] = d; delete imgEls[id]; imgWait.forEach(function (f) { f(id); }); }
  function imgEl(id) {
    if (imgEls[id]) return imgEls[id];
    if (!imgs[id]) return null;
    var im = new Image(); im.onload = function () { imgWait.forEach(function (f) { f(id); }); }; im.src = imgs[id]; imgEls[id] = im; return im;
  }
  function missingImgs(objs) { var m = {}; objs.forEach(function (o) { if (o.k === 'i' && !imgs[o.src]) m[o.src] = 1; }); return Object.keys(m); }
  var URL_RE = /(https?:\/\/[^\s<>"'，。、；！？）」』]+|www\.[^\s<>"'，。、；！？）」』]+)/g;
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function linkify(t) {
    return esc(t || '').replace(URL_RE, function (u) { var h = /^www\./.test(u) ? 'https://' + u : u; return '<a href="' + h + '" target="_blank" rel="noopener">' + u + '</a>'; }).replace(/\n/g, '<br>');
  }
  function drawObj(ctx, o) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate((o.r || 0) * Math.PI / 180); if (o.fx) ctx.scale(-1, 1);
    if (o.k === 'i') { var im = imgEl(o.src); if (im && im.complete && im.naturalWidth) ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h); else { ctx.fillStyle = '#eef1f7'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); } }
    else if (o.k === 't') {
      var fs = o.fs || 36; ctx.fillStyle = o.c || '#111'; ctx.font = fs + 'px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textBaseline = 'top';
      var lines = String(o.txt || '').split('\n');
      if (!o.v) lines.forEach(function (l, i) { ctx.fillText(l, -o.w / 2 + 8, -o.h / 2 + 6 + i * fs * 1.35, o.w - 16); });
      else lines.forEach(function (l, i) { var x = o.w / 2 - 8 - (i + 1) * fs * 1.35; Array.from(l).forEach(function (ch, j) { ctx.fillText(ch, x, -o.h / 2 + 6 + j * fs * 1.1); }); });
    }
    ctx.restore();
  }
  /* 畫整張畫板；scale = 畫布像素 / 1600；full=true 時連圖片文字一起畫（縮圖用） */
  function render(ctx, objs, scale, bg, full) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); } else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (full) for (var j = 0; j < objs.length; j++) if (objs[j].k !== 's') drawObj(ctx, objs[j]);
    for (var i = 0; i < objs.length; i++) { var o = objs[i]; if (o.k === 's') drawStroke(ctx, o); }
  }
  /* 把稀疏的點補密，讓局部擦除準確 */
  function densify(p, step) {
    if (p.length <= 2) return p.slice();
    var out = [p[0], p[1]];
    for (var i = 2; i < p.length; i += 2) {
      var x0 = out[out.length - 2], y0 = out[out.length - 1], x1 = p[i], y1 = p[i + 1];
      var d = Math.hypot(x1 - x0, y1 - y0), k = Math.floor(d / step);
      for (var j = 1; j <= k; j++) { var t = j * step / d; if (t < 1) out.push(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)); }
      if (out[out.length - 2] !== x1 || out[out.length - 1] !== y1) out.push(x1, y1);
    }
    return out;
  }
  /* 用圓形 (x,y,r) 擦一條筆劃，回傳 null(沒碰到) 或剩下的片段陣列 */
  function eraseStroke(o, x, y, r) {
    var p = o.p, rr = r + o.w / 2, hit = false, segs = [], cur = [];
    for (var i = 0; i < p.length; i += 2) {
      var inside = (p[i] - x) * (p[i] - x) + (p[i + 1] - y) * (p[i + 1] - y) <= rr * rr;
      if (inside) { hit = true; if (cur.length) { segs.push(cur); cur = []; } }
      else cur.push(p[i], p[i + 1]);
    }
    if (!hit) return null;
    if (cur.length) segs.push(cur);
    return segs.filter(function (s) { return s.length >= 4; }).map(function (s) { return { id: uid(), k: 's', by: o.by, c: o.c, w: o.w, p: s }; });
  }
  /* del 和 add 有同一個 id 時是「修改」，原地替換、不改變上下層順序 */
  function applyOp(objs, op) {
    var addIds = {}; (op.add || []).forEach(function (o) { addIds[o.id] = o; });
    if (op.del && op.del.length) {
      var dm = {}; op.del.forEach(function (id) { if (!addIds[id]) dm[id] = 1; });
      for (var i = objs.length - 1; i >= 0; i--) if (dm[objs[i].id]) objs.splice(i, 1);
    }
    (op.add || []).forEach(function (o) {
      for (var j = 0; j < objs.length; j++) if (objs[j].id === o.id) { objs[j] = o; return; }
      objs.push(o);
    });
    return objs;
  }
  /* 互動畫板 */
  function view(host, opt) {
    var stage = document.createElement('div'); stage.className = 'wb-stage';
    var base = document.createElement('canvas'), top = document.createElement('canvas');
    base.className = 'wb-base'; top.className = 'wb-top';
    var layer = document.createElement('div'); layer.className = 'wb-objs';
    var sel = document.createElement('div'); sel.className = 'wb-sel';
    stage.appendChild(layer); stage.appendChild(base); stage.appendChild(top); stage.appendChild(sel); host.appendChild(stage);
    var bctx = base.getContext('2d'), tctx = top.getContext('2d');
    var V = { objs: [], bid: null, tool: { mode: 'pen', color: '#111', width: 4 }, editable: false, hist: {} };
    var scale = 1, dpr = 1, dirty = true, lives = {}, mine = null, erasing = null;

    function fit() {
      var cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      scale = Math.min(cw / W, ch / H); dpr = window.devicePixelRatio || 1;
      var w = Math.floor(W * scale), h = Math.floor(H * scale);
      stage.style.width = w + 'px'; stage.style.height = h + 'px';
      [base, top].forEach(function (c) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; });
      [layer, sel].forEach(function (l) { l.style.transform = 'scale(' + scale + ')'; });
      stage.style.setProperty('--inv', 1 / scale);
      dirty = true;
    }
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(host); else window.addEventListener('resize', fit);
    function frame() {
      if (dirty) { dirty = false; render(bctx, V.objs, scale * dpr, null, false); drawObjs(); }
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, top.width, top.height);
      tctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      var now = Date.now();
      for (var k in lives) { if (now - lives[k].t > 4000) delete lives[k]; else drawStroke(tctx, lives[k].o); }
      if (mine) drawStroke(tctx, mine);
      if (erasing && erasing.cx != null) { tctx.strokeStyle = '#e44'; tctx.lineWidth = 2 / scale; tctx.setLineDash([6, 4]); tctx.beginPath(); tctx.arc(erasing.cx, erasing.cy, erasing.r, 0, Math.PI * 2); tctx.stroke(); tctx.setLineDash([]); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);


    /* ---------- 圖片、文字框（DOM 圖層，連結可以點） ---------- */
    var els = {}, editing = null;
    imgWait.push(function () { dirty = true; });
    function drawObjs() {
      var seen = {};
      V.objs.forEach(function (o) {
        if (o.k === 's') return;
        seen[o.id] = 1;
        var e = els[o.id];
        if (!e) {
          e = document.createElement('div'); e.className = 'wb-obj wb-' + o.k; e.dataset.id = o.id;
          if (o.k === 'i') e.appendChild(document.createElement('img'));
          else e.appendChild(document.createElement('div')).className = 'wb-txt';
          els[o.id] = e;
        }
        e.style.left = o.x + 'px'; e.style.top = o.y + 'px'; e.style.width = o.w + 'px'; e.style.height = o.h + 'px';
        e.style.transform = 'rotate(' + (o.r || 0) + 'deg)' + (o.fx ? ' scaleX(-1)' : '');
        e.classList.toggle('sel', V.sel === o.id);
        if (o.k === 'i') { var im = e.firstChild, src = imgs[o.src] || ''; if (im.getAttribute('src') !== src) { if (src) im.src = src; else im.removeAttribute('src'); } e.classList.toggle('loading', !src); }
        else {
          var t = e.firstChild; t.style.fontSize = (o.fs || 36) + 'px'; t.style.color = o.c || '#111';
          t.classList.toggle('vert', !!o.v);
          if (editing !== o.id) { var h = linkify(o.txt) || '<span class="ph">（點兩下輸入文字）</span>'; if (t._h !== h) { t.innerHTML = h; t._h = h; } }
        }
        layer.appendChild(e);
      });
      for (var id in els) if (!seen[id]) { els[id].remove(); delete els[id]; if (V.sel === id) select(null); }
      drawSel();
    }
    function find(id) { for (var i = 0; i < V.objs.length; i++) if (V.objs[i].id === id) return V.objs[i]; return null; }
    function select(id) { if (V.sel === id) return; finishEdit(); V.sel = id; dirty = true; opt.onSelect && opt.onSelect(id ? find(id) : null); }
    V.select = select;
    function drawSel() {
      var o = V.sel && find(V.sel);
      if (!o || V.tool.mode !== 'select') { sel.innerHTML = ''; sel._id = null; return; }
      if (sel._id !== o.id) {
        sel.innerHTML = '<div class="box"><i class="h nw" data-h="nw"></i><i class="h ne" data-h="ne"></i><i class="h sw" data-h="sw"></i><i class="h se" data-h="se"></i><i class="rot" data-h="rot">⟳</i></div>';
        sel._id = o.id;
      }
      var b = sel.firstChild;
      b.style.left = o.x + 'px'; b.style.top = o.y + 'px'; b.style.width = o.w + 'px'; b.style.height = o.h + 'px';
      b.style.transform = 'rotate(' + (o.r || 0) + 'deg)';
    }
    /* 改物件：final=false 只同步不記上一步 */
    var dragStart = null;
    function change(o, patch, final, orig, noSend) {
      var n = {}; for (var k in o) n[k] = o[k]; for (var k2 in patch) n[k2] = patch[k2];
      var i = V.objs.indexOf(o); V.objs[i] = n; dirty = true;
      if (final) { var before = orig || o; if (opt.onOp) { hist().push({ add: [n], rem: [before] }); opt.onOp(V.bid, { del: [n.id], add: [n] }); } }
      else if (opt.onOp && !noSend) opt.onOp(V.bid, { del: [n.id], add: [n] }, true);
      opt.onSelect && V.sel === n.id && opt.onSelect(n);
      return n;
    }
    V.change = function (patch) { var o = V.sel && find(V.sel); if (o) change(o, patch, true); };
    V.addObj = function (o) { V.objs.push(o); dirty = true; commit([o], []); select(o.id); };
    V.deleteSel = function () { var o = V.sel && find(V.sel); if (!o) return; select(null); applyOp(V.objs, { del: [o.id] }); dirty = true; commit([], [o]); };
    var lastSync = 0;
    function onDown(e) {
      if (V.tool.mode !== 'select' || V.locked) return;
      var h = e.target.dataset && e.target.dataset.h, oe = e.target.closest('.wb-obj');
      var o = h ? find(V.sel) : (oe ? find(oe.dataset.id) : null);
      if (!o) { select(null); return; }
      if (editing === o.id) return;
      e.preventDefault();
      if (!h) select(o.id);
      var p = pos(e), cx = o.x + o.w / 2, cy = o.y + o.h / 2, th = (o.r || 0) * Math.PI / 180;
      dragStart = { o: o, orig: o, h: h || 'move', p: p, cx: cx, cy: cy, th: th, moved: false, link: e.target.closest('a'), id: e.pointerId };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    }
    function onMove(e) {
      var D = dragStart; if (!D || e.pointerId !== D.id) return;
      var p = pos(e), o = find(D.o.id); if (!o) { dragStart = null; return; }
      if (!D.moved && Math.abs(p[0] - D.p[0]) + Math.abs(p[1] - D.p[1]) < 4) return;
      D.moved = true;
      var patch;
      if (D.h === 'move') patch = { x: D.orig.x + p[0] - D.p[0], y: D.orig.y + p[1] - D.p[1] };
      else if (D.h === 'rot') {
        var a = Math.atan2(p[1] - D.cy, p[0] - D.cx) * 180 / Math.PI + 90; a = (a + 360) % 360;
        var sn = Math.round(a / 45) * 45; if (Math.abs(a - sn) < 4) a = sn % 360;
        patch = { r: Math.round(a) };
      } else {
        var sx = D.h.indexOf('e') >= 0 ? 1 : -1, sy = D.h.indexOf('s') >= 0 ? 1 : -1;
        var dx = p[0] - D.cx, dy = p[1] - D.cy, c = Math.cos(-D.th), s2 = Math.sin(-D.th);
        var lx = dx * c - dy * s2, ly = dx * s2 + dy * c;
        var ox = -sx * D.orig.w / 2, oy = -sy * D.orig.h / 2;
        var w = Math.max(30, sx * (lx - ox)), hh = Math.max(30, sy * (ly - oy));
        if (D.orig.k === 'i') { var k = Math.max(w / D.orig.w, hh / D.orig.h); w = D.orig.w * k; hh = D.orig.h * k; }
        var mx = ox + sx * w / 2, my = oy + sy * hh / 2, c2 = Math.cos(D.th), s3 = Math.sin(D.th);
        var ncx = D.cx + mx * c2 - my * s3, ncy = D.cy + mx * s3 + my * c2;
        patch = { x: Math.round(ncx - w / 2), y: Math.round(ncy - hh / 2), w: Math.round(w), h: Math.round(hh) };
      }
      var sync = Date.now() - lastSync > 150; if (sync) lastSync = Date.now();
      D.o = change(o, patch, false, null, !sync);
    }
    function onUp(e) {
      var D = dragStart; if (!D || e.pointerId !== D.id) return; dragStart = null;
      var o = find(D.o.id);
      if (!D.moved) { if (D.link && D.h === 'move') window.open(D.link.href, '_blank', 'noopener'); return; }
      if (o) change(o, {}, true, D.orig);
    }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('dblclick', function (e) { if (V.tool.mode !== 'select' || V.locked) return; var oe = e.target.closest('.wb-t'); if (oe) V.editText(oe.dataset.id); });
    stage.addEventListener('click', function (e) { if (V.tool.mode === 'select' && e.target.closest('a')) e.preventDefault(); });
    V.editText = function (id) {
      if (!els[id]) drawObjs();
      var o = find(id), e = els[id]; if (!o || o.k !== 't' || !e) return;
      select(id); editing = id; var t = e.firstChild;
      t.contentEditable = 'true'; t.textContent = o.txt || ''; t._h = null; e.classList.add('editing'); t.focus();
      var r = document.createRange(); r.selectNodeContents(t); r.collapse(false); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
      t.onblur = finishEdit;
      t.onkeydown = function (k) { if (k.key === 'Escape') t.blur(); k.stopPropagation(); };
    };
    function finishEdit() {
      if (!editing) return; var id = editing; editing = null;
      var e = els[id], o = find(id); if (!e || !o) return;
      var t = e.firstChild; t.contentEditable = 'false'; e.classList.remove('editing'); t.onblur = null;
      var txt = t.innerText.replace(/\n$/, ''); t._h = null;
      if (txt !== (o.txt || '')) change(o, { txt: txt }, true); else dirty = true;
    }
    V.finishEdit = finishEdit;

    function pos(e) { var r = top.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)]; }
    function hist() { return V.hist[V.bid] || (V.hist[V.bid] = []); }
    function commit(add, rem) {
      if (!add.length && !rem.length) return;
      hist().push({ add: add, rem: rem }); if (hist().length > 80) hist().shift();
      opt.onOp && opt.onOp(V.bid, { del: rem.map(function (o) { return o.id; }), add: add });
    }
    var lastLive = 0, pid = null;
    top.addEventListener('pointerdown', function (e) {
      if (!V.editable || pid != null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pid = e.pointerId; top.setPointerCapture(pid); e.preventDefault();
      var p = pos(e);
      if (V.tool.mode === 'pen') {
        mine = { id: uid(), k: 's', by: opt.me, c: V.tool.color, w: V.tool.width, p: p };
      } else if (V.tool.mode === 'erase') {
        erasing = { r: V.tool.eraser || 18, orig: {}, made: {}, removed: [], cx: p[0], cy: p[1] };
        eraseAt(p[0], p[1]);
      }
    });
    function eraseAt(x, y) {
      var E = erasing, changed = false;
      for (var i = V.objs.length - 1; i >= 0; i--) {
        var o = V.objs[i]; if (o.k !== 's' || !(opt.canErase ? opt.canErase(o) : true)) continue;
        var res = eraseStroke(o, x, y, E.r); if (!res) continue;
        changed = true;
        V.objs.splice(i, 1);
        if (E.made[o.id]) delete E.made[o.id]; else E.removed.push(o);
        res.forEach(function (f) { E.made[f.id] = f; V.objs.splice(i, 0, f); });
      }
      if (changed) dirty = true;
    }
    top.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) { if (erasing == null && V.editable && V.tool.mode === 'erase') {} return; }
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
      evs.forEach(function (ev) {
        var p = pos(ev);
        if (mine) { var n = mine.p.length; if (Math.abs(mine.p[n - 2] - p[0]) + Math.abs(mine.p[n - 1] - p[1]) >= 2) mine.p.push(p[0], p[1]); }
        else if (erasing) {
          var px = erasing.cx, py = erasing.cy, d = Math.hypot(p[0] - px, p[1] - py), st = Math.max(1, Math.ceil(d / (erasing.r / 2)));
          for (var j = 1; j <= st; j++) eraseAt(px + (p[0] - px) * j / st, py + (p[1] - py) * j / st);
          erasing.cx = p[0]; erasing.cy = p[1];
        }
      });
      if (mine && Date.now() - lastLive > 90) { lastLive = Date.now(); opt.onLive && opt.onLive(V.bid, mine); }
    });
    function end(e) {
      if (e.pointerId !== pid) return; pid = null;
      if (mine) {
        var o = mine; mine = null; o.p = densify(o.p, 5);
        V.objs.push(o); dirty = true; commit([o], []);
      } else if (erasing) {
        var E = erasing; erasing = null;
        var add = Object.keys(E.made).map(function (k) { return E.made[k]; });
        commit(add, E.removed);
      }
    }
    top.addEventListener('pointerup', end); top.addEventListener('pointercancel', end);
    top.addEventListener('touchstart', function (e) { if (V.editable) e.preventDefault(); }, { passive: false });

    V.load = function (bid, objs) { finishEdit(); V.sel = null; if (opt.onSelect) opt.onSelect(null); V.bid = bid; V.objs = objs; lives = {}; mine = null; erasing = null; dirty = true; };
    V.apply = function (bid, op) { if (bid !== V.bid) return; applyOp(V.objs, op); (op.add || []).forEach(function (o) { delete lives[o.id]; }); dirty = true; };
    V.live = function (bid, o) { if (bid !== V.bid) return; lives[o.id] = { o: o, t: Date.now() }; };
    V.undo = function () {
      var h = hist(), e;
      while ((e = h.pop())) {
        var ids = {}; V.objs.forEach(function (o) { ids[o.id] = 1; });
        var del = e.add.filter(function (o) { return ids[o.id]; });
        if (!del.length && !e.rem.length) continue;
        applyOp(V.objs, { del: del.map(function (o) { return o.id; }), add: e.rem }); dirty = true;
        opt.onOp && opt.onOp(V.bid, { del: del.map(function (o) { return o.id; }), add: e.rem });
        return true;
      }
      return false;
    };
    V.canUndo = function () { return hist().length > 0; };
    /* 全消除：老師清全部筆劃；學生只清自己的 */
    V.clear = function (all) {
      var rem = V.objs.filter(function (o) { return o.k === 's' && (all || o.by === opt.me); });
      if (!rem.length) return false;
      applyOp(V.objs, { del: rem.map(function (o) { return o.id; }) }); dirty = true; commit([], rem); return true;
    };
    V.setEditable = function (b) {
      V.editable = b; var m = V.tool.mode, draw = b && (m === 'pen' || m === 'erase');
      top.style.pointerEvents = draw ? 'auto' : 'none';
      top.style.cursor = m === 'erase' ? 'cell' : 'crosshair'; top.style.touchAction = draw ? 'none' : 'auto';
      stage.classList.toggle('selecting', b && m === 'select' && !V.locked);
      stage.style.touchAction = b && m === 'select' ? 'none' : '';
      if (m !== 'select') { finishEdit(); if (V.sel) select(null); }
      dirty = true;
    };
    V.setLocked = function (b) { V.locked = b; if (b) select(null); V.setEditable(V.editable); };
    V.setTool = function (t) { for (var k in t) V.tool[k] = t[k]; V.setEditable(V.editable); };
    V.refit = fit;
    fit();
    return V;
  }
  return { W: W, H: H, uid: uid, clone: clone, render: render, applyOp: applyOp, view: view, imgs: imgs, setImg: setImg, missingImgs: missingImgs, onImg: function (f) { imgWait.push(f); }, linkify: linkify };
})();
