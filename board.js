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
  /* 畫整張畫板；scale = 畫布像素 / 1600 */
  function render(ctx, objs, scale, bg) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg || '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
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
  function applyOp(objs, op) {
    if (op.del && op.del.length) {
      var dm = {}; op.del.forEach(function (id) { dm[id] = 1; });
      for (var i = objs.length - 1; i >= 0; i--) if (dm[objs[i].id]) objs.splice(i, 1);
    }
    if (op.add) op.add.forEach(function (o) { if (!objs.some(function (x) { return x.id === o.id; })) objs.push(o); });
    return objs;
  }

  /* 互動畫板 */
  function view(host, opt) {
    var stage = document.createElement('div'); stage.className = 'wb-stage';
    var base = document.createElement('canvas'), top = document.createElement('canvas');
    base.className = 'wb-base'; top.className = 'wb-top';
    stage.appendChild(base); stage.appendChild(top); host.appendChild(stage);
    var bctx = base.getContext('2d'), tctx = top.getContext('2d');
    var V = { objs: [], bid: null, tool: { mode: 'pen', color: '#111', width: 4 }, editable: false, hist: {} };
    var scale = 1, dpr = 1, dirty = true, lives = {}, mine = null, erasing = null;

    function fit() {
      var cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      scale = Math.min(cw / W, ch / H); dpr = window.devicePixelRatio || 1;
      var w = Math.floor(W * scale), h = Math.floor(H * scale);
      stage.style.width = w + 'px'; stage.style.height = h + 'px';
      [base, top].forEach(function (c) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; });
      dirty = true;
    }
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(host); else window.addEventListener('resize', fit);
    function frame() {
      if (dirty) { dirty = false; render(bctx, V.objs, scale * dpr); }
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, top.width, top.height);
      tctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      var now = Date.now();
      for (var k in lives) { if (now - lives[k].t > 4000) delete lives[k]; else drawStroke(tctx, lives[k].o); }
      if (mine) drawStroke(tctx, mine);
      if (erasing && erasing.cx != null) { tctx.strokeStyle = '#e44'; tctx.lineWidth = 2 / scale; tctx.setLineDash([6, 4]); tctx.beginPath(); tctx.arc(erasing.cx, erasing.cy, erasing.r, 0, Math.PI * 2); tctx.stroke(); tctx.setLineDash([]); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

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

    V.load = function (bid, objs) { V.bid = bid; V.objs = objs; lives = {}; mine = null; erasing = null; dirty = true; };
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
    V.setEditable = function (b) { V.editable = b; top.style.cursor = b ? (V.tool.mode === 'erase' ? 'cell' : 'crosshair') : 'default'; top.style.touchAction = b ? 'none' : 'auto'; };
    V.setTool = function (t) { for (var k in t) V.tool[k] = t[k]; V.setEditable(V.editable); };
    V.refit = fit;
    fit();
    return V;
  }
  return { W: W, H: H, uid: uid, clone: clone, render: render, applyOp: applyOp, view: view };
})();
