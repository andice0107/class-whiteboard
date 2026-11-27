/* 共用畫板繪圖核心：固定 1600x900 畫布、物件模型、畫筆、局部橡皮擦、上一步 */
window.WB = (function () {
  'use strict';
  var W = 1600, H = 900;
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 筆種：t 空白=原子筆、hl=螢光筆（半透明）、mk=麥克筆、lz=雷射筆（不存檔，幾秒後消失） */
  function drawStroke(ctx, o, fade) {
    var p = o.p, n = p.length / 2;
    ctx.save();
    if (o.t === 'hl') { ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'multiply'; }
    if (o.t === 'lz') { ctx.globalAlpha = fade == null ? 1 : fade; ctx.shadowColor = o.c; ctx.shadowBlur = 14; }
    ctx.strokeStyle = o.c; ctx.lineWidth = o.w; ctx.lineCap = o.t === 'hl' || o.t === 'mk' ? 'square' : 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (n === 1) { ctx.fillStyle = o.c; ctx.arc(p[0], p[1], o.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    ctx.moveTo(p[0], p[1]);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i * 2] + p[i * 2 + 2]) / 2, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mx, my);
    }
    ctx.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
    ctx.stroke();
    if (o.t === 'lz') { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, o.w / 3); ctx.stroke(); }
    ctx.restore();
  }
  /* 圖片庫：id → dataURL；所有畫板共用 */
  var imgs = {}, imgEls = {}, imgWait = [];
  var fontSt = {};
  function ensureFont(id) {
    if (!id || fontSt[id] || !imgs[id]) return; fontSt[id] = 1;
    try { var ff = new FontFace('wbf-' + id, 'url(' + imgs[id] + ')'); ff.load().then(function () { document.fonts.add(ff); fontSt[id] = 2; imgWait.forEach(function (f) { f(id); }); }).catch(function () { fontSt[id] = 3; }); } catch (e) { fontSt[id] = 3; }
  }
  function ffam(id) { return /^fn[A-Za-z0-9_]+$/.test(id || '') ? "'wbf-" + id + "',sans-serif" : ''; }
  function ffs(o) { return o && /^fn[A-Za-z0-9_]+$/.test(o.ff || '') && typeof document !== 'undefined' && document.fonts ? '"wbf-' + o.ff + '",' : ''; }
  function setImg(id, d) { imgs[id] = d; delete imgEls[id]; if (/^fn/.test(id)) ensureFont(id); imgWait.forEach(function (f) { f(id); }); }
  function imgEl(id) {
    if (imgEls[id]) return imgEls[id];
    if (!imgs[id]) return null;
    var im = new Image(); im.onload = function () { imgWait.forEach(function (f) { f(id); }); }; im.src = imgs[id]; imgEls[id] = im; return im;
  }
  function missingImgs(objs) { var m = {}; objs.forEach(function (o) { if (o.k === 'i' && !imgs[o.src]) m[o.src] = 1; if (o.ff && !imgs[o.ff]) m[o.ff] = 1; if (o.rt) o.rt.forEach(function (ln) { (ln || []).forEach(function (r) { if (r.f && !imgs[r.f]) m[r.f] = 1; }); }); }); return Object.keys(m); }
  var URL_RE = /(https?:\/\/[^\s<>"'，。、；！？）」』]+|www\.[^\s<>"'，。、；！？）」』]+)/g;
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function linkify(t) {
    return esc(t || '').replace(URL_RE, function (u) { var h = /^www\./.test(u) ? 'https://' + u : u; return '<a href="' + h + '" target="_blank" rel="noopener">' + u + '</a>'; }).replace(/\n/g, '<br>');
  }
  /* 逐行對齊：o.als 是每一段（以換行分開）的對齊，'l' 靠左、'c' 置中、'r' 靠右、'' 跟著整個框 */
  var ALM = { l: 'left', c: 'center', r: 'right' };
  function okColor(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : ''; }
  function runHtml(r) {
    var h = linkify(r.t), st = [];
    if (r.b) st.push('font-weight:700'); if (r.i) st.push('font-style:italic'); if (r.u) st.push('text-decoration:underline'); if (okColor(r.c)) st.push('color:' + r.c); if (okColor(r.h)) st.push('background-color:' + r.h + ';border-radius:3px'); if (/^fn[A-Za-z0-9_]+$/.test(r.f || '')) { st.push('font-family:' + ffam(r.f)); ensureFont(r.f); }
    return st.length ? '<span style="' + st.join(';') + '">' + h + '</span>' : h;
  }
  function lineHtml(o) {
    var ps = String(o.txt || '').split('\n');
    return '<div class="lns">' + ps.map(function (p, i) {
      var a = o.als && o.als[i], runs = o.rt && Array.isArray(o.rt[i]) ? o.rt[i] : null;
      var inner = runs && runs.length ? runs.map(function (r) { return runHtml({ t: String(r.t == null ? '' : r.t), b: r.b, i: r.i, u: r.u, c: r.c, h: r.h, f: r.f }); }).join('') : linkify(p);
      return '<div class="ln"' + (a && ALM[a] ? ' data-al="' + a + '" style="text-align:' + ALM[a] + '"' : '') + '>' + (inner || '<br>') + '</div>';
    }).join('') + '</div>';
  }
  function lineAl(o, i, def) { var a = o.als && o.als[i]; return a && ALM[a] ? ALM[a] : def; }
  /* 幾何圖形：在 0..w,0..h 的框內產生點 */
  function shapeGeo(o) {
    var w = o.w, h = o.h, sh = o.shape, L = [];
    function poly(pts, closed) { var it = { t: 'p', pts: pts, c: closed !== false }; L.push(it); return it; }
    if (sh === 'rect' || sh === 'square') poly([[0, 0], [w, 0], [w, h], [0, h]]);
    else if (sh === 'ellipse' || sh === 'circle') L.push({ t: 'e' });
    else if (sh === 'tri') poly([[w / 2, 0], [w, h], [0, h]]);
    else if (sh === 'rtri') poly([[0, 0], [w, h], [0, h]]);
    else if (sh === 'trap') poly([[w * 0.25, 0], [w * 0.75, 0], [w, h], [0, h]]);
    else if (sh === 'para') poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]);
    else if (sh === 'rhom') poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    else if (sh === 'poly') { var n = o.n || 5, pts = []; for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]); } poly(pts); }
    else if (sh === 'line' || sh === 'arrow') {
      var a0 = o.dir === -1 ? [0, h] : [0, 0], a1 = o.dir === -1 ? [w, 0] : [w, h];
      poly([a0, a1], false);
      if (sh === 'arrow') { var ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), hl = Math.max(14, (o.sw || 3) * 4); poly([[a1[0] - hl * Math.cos(ang - 0.45), a1[1] - hl * Math.sin(ang - 0.45)], a1, [a1[0] - hl * Math.cos(ang + 0.45), a1[1] - hl * Math.sin(ang + 0.45)]], false); }
    } else if (sh === 'grid') {
      poly([[0, 0], [w, 0], [w, h], [0, h]]);
      var r = o.rows || 2, c = o.cols || 2;
      for (var y = 1; y < r; y++) poly([[0, h * y / r], [w, h * y / r]], false);
      for (var x = 1; x < c; x++) poly([[w * x / c, 0], [w * x / c, h]], false);
    }
    else if (sh === 'ruler') {
      var rn = o.n || 15, fsr = Math.max(10, Math.min(28, h * 0.26));
      poly([[0, 0], [w, 0], [w, h], [0, h]]);
      for (var ri = 0; ri <= rn * 10; ri++) {
        var rx = w * ri / (rn * 10), rl = ri % 10 === 0 ? h * 0.5 : ri % 5 === 0 ? h * 0.36 : h * 0.22;
        poly([[rx, 0], [rx, rl]], false);
        if (ri % 10 === 0) L.push({ t: 'x', x: rx, y: h * 0.5 + fsr * 0.8, s: String(ri / 10), fs: fsr });
      }
    } else if (sh === 'protr') {
      var pcx = w / 2, pcy = h, R = Math.min(w / 2, h), arc = [], pd, fsp = Math.max(9, Math.min(20, R * 0.075));
      for (pd = 0; pd <= 180; pd += 3) arc.push([pcx + R * Math.cos(pd * Math.PI / 180), pcy - R * Math.sin(pd * Math.PI / 180)]);
      poly(arc);
      for (pd = 0; pd <= 180; pd += 2) {
        var pl = pd % 10 === 0 ? R * 0.14 : pd % 5 === 0 ? R * 0.1 : R * 0.06, pc = Math.cos(pd * Math.PI / 180), ps = Math.sin(pd * Math.PI / 180);
        poly([[pcx + R * pc, pcy - R * ps], [pcx + (R - pl) * pc, pcy - (R - pl) * ps]], false);
        if (pd % 10 === 0) {
          L.push({ t: 'x', x: pcx + R * 0.8 * pc, y: pcy - R * 0.8 * ps, s: String(pd), fs: fsp, halo: 1 });
          L.push({ t: 'x', x: pcx + R * 0.62 * pc, y: pcy - R * 0.62 * ps, s: String(180 - pd), fs: fsp * 0.85, halo: 1 });
        }
      }
      for (pd = 0; pd <= 180; pd += 10) poly([[pcx, pcy], [pcx + R * Math.cos(pd * Math.PI / 180), pcy - R * Math.sin(pd * Math.PI / 180)]], false).sw = Math.max(0.6, (o.sw || 3) * 0.45);
      poly([[pcx - R * 0.06, pcy], [pcx + R * 0.06, pcy]], false); poly([[pcx, pcy - R * 0.06], [pcx, pcy]], false);
    } else if (sh === 'zycell') {
      var zr = Math.max(1, o.rows || 1), zc = h / zr, zi, zd;
      poly([[0, 0], [w, 0], [w, h], [0, h]]);
      poly([[zc, 0], [zc, h]], false);
      for (zi = 1; zi < zr; zi++) poly([[0, zc * zi], [w, zc * zi]], false).sw = Math.max(1, (o.sw || 3) * 0.7);
      for (zi = 0; zi < zr; zi++) {
        zd = poly([[zc / 2, zc * zi], [zc / 2, zc * (zi + 1)]], false); zd.sw = 1; zd.dash = '7 6';
        zd = poly([[0, zc * (zi + 0.5)], [zc, zc * (zi + 0.5)]], false); zd.sw = 1; zd.dash = '7 6';
      }
    } else if (sh === 'sq45' || sh === 'sq30') {
      var TP = [[0, 0], [0, h], [w, h]];
      poly(TP);
      var ta = Math.hypot(w, 0), tb = Math.hypot(w, h), tc = h, tp = ta + tb + tc, icx = (w * TP[0][0] + tb * TP[1][0] + tc * TP[2][0]) / tp, icy = (w * TP[0][1] + tb * TP[1][1] + tc * TP[2][1]) / tp;
      poly(TP.map(function (v) { return [icx + (v[0] - icx) * 0.5, icy + (v[1] - icy) * 0.5]; })).sw = Math.max(0.8, (o.sw || 3) * 0.5);
      var ucm = 40 * w / (o.n ? o.n * 40 : 600), tk;
      for (tk = 0; tk * ucm / 2 <= w + 0.01; tk++) { var tx = tk * ucm / 2, tl = tk % 2 === 0 ? 14 : 8; poly([[tx, h], [tx, h - tl]], false).sw = 1; if (tk % 2 === 0 && tk > 0) L.push({ t: 'x', x: tx, y: h - 24, s: String(tk / 2), fs: 12, halo: 1 }); }
      for (tk = 1; tk * ucm / 2 <= h + 0.01; tk++) { var ty = h - tk * ucm / 2, tl2 = tk % 2 === 0 ? 14 : 8; poly([[0, ty], [tl2, ty]], false).sw = 1; }
      poly([[0, h - 18], [18, h - 18], [18, h]], false).sw = 1;
    } else if (sh === 'numline') {
      var nmin = o.nmin == null ? 0 : o.nmin, nmax = o.nmax == null ? 10 : o.nmax, st = o.st || 1, mg = w * 0.05, ly = h * 0.4, fsn = Math.max(12, Math.min(34, h * 0.3));
      if (nmax <= nmin) nmax = nmin + 1;
      poly([[0, ly], [w, ly]], false); poly([[w - 14, ly - 8], [w, ly], [w - 14, ly + 8]], false); poly([[14, ly - 8], [0, ly], [14, ly + 8]], false);
      var cnt = Math.min(60, Math.floor((nmax - nmin) / st + 1e-9));
      for (var ni = 0; ni <= cnt; ni++) {
        var nv = nmin + ni * st, nx = mg + (w - 2 * mg) * (nv - nmin) / (nmax - nmin);
        poly([[nx, ly - h * 0.16], [nx, ly + h * 0.16]], false);
        L.push({ t: 'x', x: nx, y: ly + h * 0.16 + fsn * 0.9, s: String(Math.round(nv * 100) / 100), fs: fsn });
      }
    } else if (sh === 'clock') {
      var ccx = w / 2, ccy = h / 2, CR = Math.min(w, h) / 2, hh = (o.hh == null ? 3 : o.hh) % 12, mm = o.mm == null ? 0 : o.mm, ck, fsc = Math.max(12, CR * 0.2);
      L.push({ t: 'e' });
      for (ck = 0; ck < 60; ck++) { var ca = ck * 6 * Math.PI / 180, cl = ck % 5 === 0 ? CR * 0.09 : CR * 0.04; poly([[ccx + CR * 0.97 * Math.sin(ca), ccy - CR * 0.97 * Math.cos(ca)], [ccx + (CR * 0.97 - cl) * Math.sin(ca), ccy - (CR * 0.97 - cl) * Math.cos(ca)]], false); }
      for (ck = 1; ck <= 12; ck++) { var na = ck * 30 * Math.PI / 180; L.push({ t: 'x', x: ccx + CR * 0.76 * Math.sin(na), y: ccy - CR * 0.76 * Math.cos(na), s: String(ck), fs: fsc }); }
      var ha = (hh * 30 + mm * 0.5) * Math.PI / 180, ma = mm * 6 * Math.PI / 180;
      L.push({ t: 'p', pts: [[ccx, ccy], [ccx + CR * 0.45 * Math.sin(ha), ccy - CR * 0.45 * Math.cos(ha)]], c: false, sw: Math.max(5, CR * 0.04) });
      L.push({ t: 'p', pts: [[ccx, ccy], [ccx + CR * 0.68 * Math.sin(ma), ccy - CR * 0.68 * Math.cos(ma)]], c: false, sw: Math.max(3, CR * 0.025) });
      L.push({ t: 'p', pts: [[ccx, ccy], [ccx + 0.1, ccy]], c: false, sw: Math.max(8, CR * 0.07) });
    }
    return L;
  }
  function shapeSvg(o) {
    var g = shapeGeo(o), fill = o.fill ? (o.fc || '#ffd6e0') : 'none', sw = o.sw || 3, out = '';
    g.forEach(function (it, i) {
      var f = (i === 0 && it.c !== false) ? fill : 'none';
      if (it.t === 'x') { out += '<text x="' + it.x.toFixed(1) + '" y="' + it.y.toFixed(1) + '" font-size="' + it.fs.toFixed(1) + '" text-anchor="middle" dominant-baseline="central" stroke="' + (it.halo ? '#fff' : 'none') + '" stroke-width="3" stroke-linejoin="round" paint-order="stroke" fill="' + (o.sc || '#111') + '">' + it.s + '</text>'; return; }
      if (it.t === 'e') out += '<ellipse cx="' + o.w / 2 + '" cy="' + o.h / 2 + '" rx="' + o.w / 2 + '" ry="' + o.h / 2 + '" fill="' + fill + '"/>';
      else out += '<polyline points="' + it.pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + (it.c ? ' ' + it.pts[0][0].toFixed(1) + ',' + it.pts[0][1].toFixed(1) : '') + '" fill="' + f + '"' + (it.sw ? ' stroke-width="' + it.sw.toFixed(1) + '"' : '') + (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '/>';
    });
    return '<svg width="' + o.w + '" height="' + o.h + '" viewBox="0 0 ' + o.w + ' ' + o.h + '" style="overflow:visible;opacity:' + (o.op == null ? 1 : o.op) + '" stroke="' + (o.sc || '#111') + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round">' + out + '</svg>';
  }
  function drawShape(ctx, o) {
    ctx.save(); ctx.translate(-o.w / 2, -o.h / 2); ctx.globalAlpha = o.op == null ? 1 : o.op;
    ctx.strokeStyle = o.sc || '#111'; ctx.lineWidth = o.sw || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    shapeGeo(o).forEach(function (it, i) {
      if (it.t === 'x') { ctx.save(); ctx.fillStyle = o.sc || '#111'; ctx.font = it.fs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (it.halo) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeText(it.s, it.x, it.y); } ctx.fillText(it.s, it.x, it.y); ctx.restore(); return; }
      ctx.lineWidth = it.sw || o.sw || 3; ctx.setLineDash(it.dash ? it.dash.split(' ').map(Number) : []);
      ctx.beginPath();
      if (it.t === 'e') ctx.ellipse(o.w / 2, o.h / 2, Math.max(1, o.w / 2), Math.max(1, o.h / 2), 0, 0, Math.PI * 2);
      else { ctx.moveTo(it.pts[0][0], it.pts[0][1]); for (var j = 1; j < it.pts.length; j++) ctx.lineTo(it.pts[j][0], it.pts[j][1]); if (it.c) ctx.closePath(); }
      if (i === 0 && o.fill && it.c !== false) { ctx.fillStyle = o.fc || '#ffd6e0'; ctx.fill(); }
      ctx.stroke();
    });
    ctx.restore();
  }
  function imgFilter(o) { var f = o.fl; if (!f) return ''; var r = []; if (f.b != null && f.b !== 100) r.push('brightness(' + f.b + '%)'); if (f.c != null && f.c !== 100) r.push('contrast(' + f.c + '%)'); if (f.g) r.push('grayscale(100%)'); return r.join(' '); }
  function drawObj(ctx, o) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate((o.r || 0) * Math.PI / 180); if (o.fx) ctx.scale(-1, 1);
    if (o.k === 'i') { var im = imgEl(o.src); if (im && im.complete && im.naturalWidth) { var cr = o.cr || [0, 0, 0, 0], nw = im.naturalWidth, nh = im.naturalHeight, fs = imgFilter(o); if (fs) { try { ctx.filter = fs; } catch (x) {} } var rd = Math.min(o.rd || 0, o.w / 2, o.h / 2); if (o.op != null) ctx.globalAlpha *= o.op;
            if (rd > 0) { ctx.beginPath(); ctx.moveTo(-o.w / 2 + rd, -o.h / 2); ctx.arcTo(o.w / 2, -o.h / 2, o.w / 2, o.h / 2, rd); ctx.arcTo(o.w / 2, o.h / 2, -o.w / 2, o.h / 2, rd); ctx.arcTo(-o.w / 2, o.h / 2, -o.w / 2, -o.h / 2, rd); ctx.arcTo(-o.w / 2, -o.h / 2, o.w / 2, -o.h / 2, rd); ctx.closePath(); ctx.save(); ctx.clip(); }
            ctx.drawImage(im, cr[0] * nw, cr[1] * nh, nw * (1 - cr[0] - cr[2]), nh * (1 - cr[1] - cr[3]), -o.w / 2, -o.h / 2, o.w, o.h);
            if (rd > 0) ctx.restore();
            if (o.bd) { try { ctx.filter = 'none'; } catch (x) {} var bw = o.bw || 4; ctx.lineWidth = bw; ctx.strokeStyle = o.bd; if (rd > 0) { ctx.stroke(); } else ctx.strokeRect(-o.w / 2 + bw / 2, -o.h / 2 + bw / 2, o.w - bw, o.h - bw); } } else { ctx.fillStyle = '#eef1f7'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); } }
    else if (o.k === 'g') { drawShape(ctx, o); if (o.txt) { var gfs = o.fs || 32; ctx.globalAlpha = 1; ctx.fillStyle = o.tc || '#111'; ctx.font = gfs + 'px ' + ffs(o) + '"PingFang TC","Noto Sans TC",sans-serif'; ctx.textBaseline = 'middle'; var gl = String(o.txt).split('\n'); gl.forEach(function (l, i) { var gal = lineAl(o, i, o.al || 'center'); ctx.textAlign = gal; var gx = gal === 'center' ? 0 : gal === 'right' ? o.w / 2 - 8 : -o.w / 2 + 8; ctx.fillText(l, gx, (i - (gl.length - 1) / 2) * gfs * (o.lh || 1.3), o.w - 12); }); } }
    else if (o.k === 'v') { ctx.fillStyle = '#111'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.fillStyle = '#e53935'; var r0 = Math.min(o.w, o.h) * 0.14; ctx.beginPath(); ctx.moveTo(-r0 * 0.7, -r0); ctx.lineTo(r0 * 1.1, 0); ctx.lineTo(-r0 * 0.7, r0); ctx.closePath(); ctx.fill(); }
    else if (o.k === 'n') {
      ctx.fillStyle = o.c || '#fff3a6'; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.shadowColor = 'transparent';
      var nfs = o.fs || 28; ctx.fillStyle = '#333'; ctx.font = nfs + 'px ' + ffs(o) + '"PingFang TC","Noto Sans TC",sans-serif'; ctx.textBaseline = 'top';
      String(o.txt || '').split('\n').forEach(function (l, i) { var nal = lineAl(o, i, o.al || 'left'); ctx.textAlign = nal; var nx = nal === 'center' ? 0 : nal === 'right' ? o.w / 2 - 12 : -o.w / 2 + 12; ctx.fillText(l, nx, -o.h / 2 + 12 + i * nfs * (o.lh || 1.35), o.w - 24); });
    }
    else if (o.k === 't') {
      if (o.bd) { ctx.strokeStyle = o.bd; ctx.lineWidth = o.bw || 3; ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); }
      var fs = o.fs || 36; ctx.fillStyle = o.c || '#111'; ctx.font = fs + 'px ' + ffs(o) + '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif'; ctx.textBaseline = 'top';
      var lines = String(o.txt || '').split('\n');
      if (!o.v) { lines.forEach(function (l, i) { var tal = lineAl(o, i, o.al || 'left'); ctx.textAlign = tal; var tx = tal === 'center' ? 0 : tal === 'right' ? o.w / 2 - 8 : -o.w / 2 + 8; ctx.fillText(l, tx, -o.h / 2 + 6 + i * fs * (o.lh || 1.35), o.w - 16); }); }
      else lines.forEach(function (l, i) { var x = o.w / 2 - 8 - (i + 1) * fs * (o.lh || 1.35); Array.from(l).forEach(function (ch, j) { ctx.fillText(ch, x, -o.h / 2 + 6 + j * fs * 1.1); }); });
    }
    ctx.restore();
  }
  /* 畫整張畫板；scale = 畫布像素 / 1600；full=true 時連圖片文字一起畫（縮圖用） */
  function render(ctx, objs, scale, bg, full, vp) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); } else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, vp ? -vp.x * scale : 0, vp ? -vp.y * scale : 0);
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
    return segs.filter(function (s) { return s.length >= 4; }).map(function (s) { var f = { id: uid(), k: 's', by: o.by, c: o.c, w: o.w, p: s }; if (o.t) f.t = o.t; return f; });
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
    if (op.ord) applyOrd(objs, op.ord);
    return objs;
  }
  /* 圖層順序：只重排「物件」（非筆劃），筆劃的位置不動 */
  function applyOrd(objs, ids) {
    var slots = [], map = {};
    objs.forEach(function (o, i) { if (o.k !== 's') { slots.push(i); map[o.id] = o; } });
    var seq = ids.filter(function (id) { return map[id]; });
    if (seq.length !== slots.length) { var have = {}; seq.forEach(function (id) { have[id] = 1; }); slots.forEach(function (i) { if (!have[objs[i].id]) seq.push(objs[i].id); }); }
    var objsCopy = seq.map(function (id) { return map[id]; });
    slots.forEach(function (i, j) { objs[i] = objsCopy[j]; });
  }
  /* 互動畫板 */
  function view(host, opt) {
    var stage = document.createElement('div'); stage.className = 'wb-stage';
    var base = document.createElement('canvas'), top = document.createElement('canvas');
    base.className = 'wb-base'; top.className = 'wb-top';
    var bgl = document.createElement('div'); bgl.className = 'wb-bgl';
    var layer = document.createElement('div'); layer.className = 'wb-objs';
    var sel = document.createElement('div'); sel.className = 'wb-sel';
    var vlayer = document.createElement('div'); vlayer.className = 'wb-objs wb-vids';
    stage.appendChild(bgl); stage.appendChild(layer); stage.appendChild(base); stage.appendChild(top); stage.appendChild(vlayer); stage.appendChild(sel); host.appendChild(stage);
    var bctx = base.getContext('2d'), tctx = top.getContext('2d');
    var V = { objs: [], bid: null, tool: { mode: 'pen', color: '#111', width: 4 }, editable: false, hist: {} };
    var scale = 1, dpr = 1, dirty = true, lives = {}, mine = null, erasing = null, shaping = null, zooming = null, lasso = null, lassoPid = null, lassoBase = null;
    V.vp = { x: 0, y: 0, z: 1 };
    function S_() { return scale * V.vp.z; }
    function applyVp() {
      var s = S_();
      [bgl, layer, vlayer, sel].forEach(function (l) { l.style.transform = 'scale(' + s + ') translate(' + (-V.vp.x) + 'px,' + (-V.vp.y) + 'px)'; });
      stage.style.setProperty('--inv', 1 / s);
      stage.classList.toggle('zoomed', V.vp.z > 1.001);
      dirty = true;
    }
    /* 背景：'' 空白、'dots' 格點、'grid' 格線（每格 40） */
    V.bg = '';
    V.bc = ''; V.setBc = function (c) { V.bc = okColor(c); bgl.style.backgroundColor = V.bc; dirty = true; };
    V.setBg = function (b) { V.bg = b || ''; bgl.className = 'wb-bgl' + (V.bg ? ' bg-' + V.bg : ''); dirty = true; };
    V.setViewport = function (vp) {
      vp = vp || { x: 0, y: 0, z: 1 }; var z = Math.max(1, Math.min(8, +vp.z || 1));
      V.vp = { z: z, x: Math.max(0, Math.min(W - W / z, +vp.x || 0)), y: Math.max(0, Math.min(H - H / z, +vp.y || 0)) };
      applyVp();
    };

    function fit() {
      var cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
      scale = Math.min(cw / W, ch / H); dpr = window.devicePixelRatio || 1;
      var w = Math.floor(W * scale), h = Math.floor(H * scale);
      stage.style.width = w + 'px'; stage.style.height = h + 'px';
      [base, top].forEach(function (c) { c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; });
      applyVp();
    }
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(host); else window.addEventListener('resize', fit);
    function frame() {
      var sd = S_() * dpr;
      if (dirty) { dirty = false; render(bctx, V.objs, sd, null, false, V.vp); drawObjs(); }
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, top.width, top.height);
      tctx.setTransform(sd, 0, 0, sd, -V.vp.x * sd, -V.vp.y * sd);
      var now = Date.now();
      for (var k in lives) {
        var lv = lives[k], age = now - lv.t, lz = lv.o.t === 'lz';
        if (age > (lz ? 3000 : 4000)) delete lives[k];
        else drawStroke(tctx, lv.o, lz ? Math.min(1, (3000 - age) / 800) : null);
      }
      if (mine) drawStroke(tctx, mine);
      if (shaping && shaping.o) { var so = shaping.o; tctx.save(); tctx.translate(so.x + so.w / 2, so.y + so.h / 2); drawShape(tctx, so); tctx.restore(); }
      if (lasso && lasso.length > 2) { tctx.save(); tctx.strokeStyle = '#3157d5'; tctx.lineWidth = 2 / S_(); tctx.setLineDash([8 / S_(), 5 / S_()]); tctx.fillStyle = 'rgba(49,87,213,.08)'; tctx.beginPath(); tctx.moveTo(lasso[0], lasso[1]); for (var li = 2; li < lasso.length; li += 2) tctx.lineTo(lasso[li], lasso[li + 1]); tctx.closePath(); tctx.fill(); tctx.stroke(); tctx.restore(); }
      if (V.multi && (V.tool.mode === 'lasso' || V.tool.mode === 'select')) { tctx.save(); tctx.strokeStyle = 'rgba(49,87,213,.55)'; tctx.lineWidth = 1.5 / S_(); tctx.setLineDash([4 / S_(), 4 / S_()]); members().forEach(function (o) { var q = bboxOf(o); tctx.strokeRect(q[0], q[1], q[2] - q[0], q[3] - q[1]); }); tctx.restore(); }
      if (zooming && zooming.b) { var zb = zooming.b; tctx.strokeStyle = '#3157d5'; tctx.lineWidth = 2 / S_(); tctx.setLineDash([8 / S_(), 5 / S_()]); tctx.strokeRect(zb[0], zb[1], zb[2], zb[3]); tctx.fillStyle = 'rgba(49,87,213,.08)'; tctx.fillRect(zb[0], zb[1], zb[2], zb[3]); tctx.setLineDash([]); }
      if (erasing && erasing.cx != null) { tctx.strokeStyle = '#e44'; tctx.lineWidth = 2 / S_(); tctx.setLineDash([6, 4]); tctx.beginPath(); tctx.arc(erasing.cx, erasing.cy, erasing.r, 0, Math.PI * 2); tctx.stroke(); tctx.setLineDash([]); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);


    /* ---------- 圖片、文字框（DOM 圖層，連結可以點） ---------- */
    var els = {}, editing = null;
    imgWait.push(function () { dirty = true; });
    function drawObjs() {
      var seen = {}, prevL = null, prevV = null;
      V.objs.forEach(function (o) {
        if (o.k === 's') return;
        seen[o.id] = 1;
        var e = els[o.id];
        if (!e) {
          e = document.createElement('div'); e.className = 'wb-obj wb-' + o.k; e.dataset.id = o.id;
          if (o.k === 'i') e.appendChild(document.createElement('img'));
          else if (o.k === 'g') e.appendChild(document.createElement('div')).className = 'wb-svg';
          else if (o.k === 'v') {
            var fr = document.createElement('iframe'); fr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; fr.allowFullscreen = true;
            fr.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(o.yt) + '?enablejsapi=1&playsinline=1&rel=0&modestbranding=1' + (o.st ? '&start=' + o.st : '') + '&origin=' + encodeURIComponent(location.origin);
            fr.onload = function () { try { fr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: o.id, channel: 'widget' }), '*'); } catch (x) {} };
            e.appendChild(fr);
            var cv = document.createElement('div'); cv.className = 'wb-vcover'; cv.style.backgroundImage = 'url(https://i.ytimg.com/vi/' + encodeURIComponent(o.yt) + '/hqdefault.jpg)';
            cv.textContent = '🔒 老師還沒開放播放'; e.appendChild(cv);
            e.appendChild(document.createElement('div')).className = 'wb-vbar';
            e.lastChild.textContent = '🖐️ 拖這條移動影片';
          }
          else e.appendChild(document.createElement('div')).className = 'wb-txt';
          if (o.k === 'g') e.appendChild(document.createElement('div')).className = 'wb-txt wb-gt';
          els[o.id] = e;
        }
        e.style.left = o.x + 'px'; e.style.top = o.y + 'px'; e.style.width = o.w + 'px'; e.style.height = o.h + 'px';
        e.style.transform = 'rotate(' + (o.r || 0) + 'deg)' + (o.fx ? ' scaleX(-1)' : '');
        e.classList.toggle('sel', V.sel === o.id);
        e.classList.toggle('mine', !!(opt.canEdit && opt.canEdit(o)));
        e.classList.toggle('lk', !!o.lk);
        e.classList.toggle('hd', !!o.hd && !!opt.showHidden); e.style.display = (o.hd && !opt.showHidden) ? 'none' : '';
        if (o.k === 'i') { var im = e.firstChild, src = imgs[o.src] || ''; if (o.an) gifRender(e, o, im, src); else if (im.getAttribute('src') !== src) { if (src) im.src = src; else im.removeAttribute('src'); } e.classList.toggle('loading', !src);
          var cr = o.cr, st = im.style;
          if (cr && (cr[0] || cr[1] || cr[2] || cr[3])) { var fw = o.w / (1 - cr[0] - cr[2]), fh = o.h / (1 - cr[1] - cr[3]); st.position = 'absolute'; st.width = fw + 'px'; st.height = fh + 'px'; st.left = (-cr[0] * fw) + 'px'; st.top = (-cr[1] * fh) + 'px'; }
          else { st.position = ''; st.width = ''; st.height = ''; st.left = ''; st.top = ''; }
          st.filter = imgFilter(o);
          e.style.opacity = o.op != null ? o.op : ''; e.style.borderRadius = o.rd ? o.rd + 'px' : '';
          var bd = e.querySelector('.wb-ibd');
          if (o.bd) { if (!bd) { bd = document.createElement('div'); bd.className = 'wb-ibd'; e.appendChild(bd); } bd.style.border = (o.bw || 4) + 'px solid ' + o.bd; bd.style.borderRadius = o.rd ? o.rd + 'px' : ''; }
          else if (bd) bd.remove(); }
        else if (o.k === 'v') { e.classList.toggle('sp', !!o.sp); var vc = e.querySelector('.wb-vcover'); if (vc) vc.style.display = (opt.lockVideos && !o.sp && !e._tplay) ? '' : 'none'; /* iframe 不重建，避免影片重新載入 */ }
        else {
          if (o.k === 'g') { var sv = shapeSvg(o); if (e.firstChild._h !== sv) { e.firstChild.innerHTML = sv; e.firstChild._h = sv; } }
          var t = o.k === 'g' ? e.lastChild : e.firstChild; t.style.fontSize = (o.fs || (o.k === 'n' ? 28 : o.k === 'g' ? 32 : 36)) + 'px';
          if (o.k === 't') e.style.border = o.bd ? (o.bw || 3) + 'px solid ' + o.bd : '';
          if (o.k === 'g') t.style.color = o.tc || '#111'; else
          if (o.k === 'n') { e.style.background = o.c || '#fff3a6'; t.style.color = '#333'; } else t.style.color = o.c || '#111';
          t.classList.toggle('vert', !!o.v); t.style.fontFamily = ffam(o.ff); if (o.ff) ensureFont(o.ff); t.style.lineHeight = o.lh > 0 ? String(o.lh) : '';
          var al = o.al || (o.k === 'g' ? 'center' : 'left'); t.style.textAlign = al; if (o.k === 'g') t.style.justifyContent = al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center';
          if (editing !== o.id) { var h = ((o.als || o.rt) && !o.v && o.txt ? lineHtml(o) : linkify(o.txt)) || (o.k === 'g' ? '' : '<span class="ph">' + (o.k === 'n' ? '（點兩下寫字）' : '（點兩下輸入文字）') + '</span>'); if (t._h !== h) { t.innerHTML = h; t._h = h; } }
        }
        var L = o.k === 'v' ? vlayer : layer, pv = o.k === 'v' ? prevV : prevL, want = pv ? pv.nextSibling : L.firstChild;
        if (want !== e) L.insertBefore(e, want); /* 只有順序不對才移動，避免打字時失去焦點 */
        if (o.k === 'v') prevV = e; else prevL = e;
      });
      for (var id in els) if (!seen[id]) { els[id].remove(); delete els[id]; if (V.sel === id) select(null); }
      drawSel();
    }
    function find(id) { for (var i = 0; i < V.objs.length; i++) if (V.objs[i].id === id) return V.objs[i]; return null; }
    function select(id) { if (V.sel === id) return; finishEdit(); if (id && V.multi) V.setMulti(null); V.sel = id; dirty = true; opt.onSelect && opt.onSelect(id ? find(id) : null); }
    V.select = select;
    function drawSel() {
      if (V.multi && (V.tool.mode === 'lasso' || V.tool.mode === 'select')) {
        var list = members(); if (!list.length) { V.setMulti(null); sel.innerHTML = ''; return; }
        var lk = list.some(function (o) { return o.lk; }), gk = 'G' + (lk ? 'L' : '') + V.multi.join(',');
        if (sel._id !== gk) {
          sel.innerHTML = '<div class="box mgrp' + (lk ? ' lk' : '') + '"><i class="gm" data-h="gmove"></i>' + (lk ? '<i class="lkb" data-h="gmenu">🔒</i>' : '<i class="h nw" data-h="gnw"></i><i class="h ne" data-h="gne"></i><i class="h sw" data-h="gsw"></i><i class="h se" data-h="gse"></i><i class="rot" data-h="grot">⟳</i>') + '<i class="mnu" data-h="gmenu">⋯</i><span class="szl"></span></div>';
          sel._id = gk;
        }
        var gb = groupBox(list), bx = sel.firstChild, pad = 6;
        bx.style.left = (gb[0] - pad) + 'px'; bx.style.top = (gb[1] - pad) + 'px'; bx.style.width = (gb[2] - gb[0] + pad * 2) + 'px'; bx.style.height = (gb[3] - gb[1] + pad * 2) + 'px'; bx.style.transform = '';
        bx.querySelector('.szl').textContent = '已圈選 ' + list.length + ' 個' + (lk ? '（有鎖定）' : '');
        return;
      }
      var o = V.sel && find(V.sel);
      if (!o || V.tool.mode !== 'select') { sel.innerHTML = ''; sel._id = null; return; }
      var key = o.id + (o.lk ? 'L' : '') + (opt.onContext ? 'M' : '');
      if (sel._id !== key) {
        sel.innerHTML = o.lk ? '<div class="box lk"><i class="lkb" data-h="menu">🔒</i>' + (opt.onContext ? '<i class="mnu" data-h="menu">⋯</i>' : '') + '<span class="szl"></span></div>'
          : '<div class="box"><i class="h nw" data-h="nw"></i><i class="h ne" data-h="ne"></i><i class="h sw" data-h="sw"></i><i class="h se" data-h="se"></i>' + (o.k === 't' ? '<i class="h eg-n" data-h="n"></i><i class="h eg-s" data-h="s"></i><i class="h eg-e" data-h="e"></i><i class="h eg-w" data-h="w"></i>' : '') + (o.shape === 'numline' ? '<i class="h nl" data-h="nl" title="往左右拉：增加或減少左邊的數字"></i><i class="h nr" data-h="nr" title="往左右拉：增加或減少右邊的數字"></i>' : '') + '<i class="rot" data-h="rot">⟳</i>' + (opt.onContext ? '<i class="mnu" data-h="menu">⋯</i>' : '') + '<span class="szl"></span></div>';
        sel._id = key;
      }
      var b = sel.firstChild;
      b.style.left = o.x + 'px'; b.style.top = o.y + 'px'; b.style.width = o.w + 'px'; b.style.height = o.h + 'px';
      b.style.transform = 'rotate(' + (o.r || 0) + 'deg)';
      var lb = b.querySelector('.szl');
      if (lb) lb.textContent = V.bg ? '寬 ' + +(o.w / 40).toFixed(1) + ' 格 × 高 ' + +(o.h / 40).toFixed(1) + ' 格　位置 (' + +(o.x / 40).toFixed(1) + ', ' + +(o.y / 40).toFixed(1) + ')' : '';
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
    V.deleteSel = function () { if (V.multi) return V.groupOp('del'); var o = V.sel && find(V.sel); if (!o || o.lk) return; select(null); applyOp(V.objs, { del: [o.id] }); dirty = true; commit([], [o]); };
    /* ---------- 圈選：多個物件一起操作 ---------- */
    V.multi = null;
    var DEF_FS = { t: 36, n: 28, g: 32 };
    function bboxOf(o) {
      if (o.k === 's') {
        var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9, p = o.p, hw = (o.w || 4) / 2;
        for (var i = 0; i < p.length; i += 2) { if (p[i] < x1) x1 = p[i]; if (p[i] > x2) x2 = p[i]; if (p[i + 1] < y1) y1 = p[i + 1]; if (p[i + 1] > y2) y2 = p[i + 1]; }
        return [x1 - hw, y1 - hw, x2 + hw, y2 + hw];
      }
      var cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (o.r || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      var hw2 = (o.w * c + o.h * sn) / 2, hh = (o.w * sn + o.h * c) / 2;
      return [cx - hw2, cy - hh, cx + hw2, cy + hh];
    }
    function members() { if (!V.multi) return []; var r = []; V.multi.forEach(function (id) { var o = find(id); if (o) r.push(o); }); return r; }
    function groupBox(list) {
      list = list || members(); if (!list.length) return null;
      var b = [1e9, 1e9, -1e9, -1e9];
      list.forEach(function (o) { var q = bboxOf(o); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); });
      return b;
    }
    V.groupBox = function () { return groupBox(); };
    V.members = members;
    /* T = { cx, cy, k(縮放), a(旋轉度), dx, dy, flip } */
    function xform(o, T) {
      var k = T.k == null ? 1 : T.k, a = (T.a || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      function mp(x, y) {
        if (T.flip) x = 2 * T.cx - x;
        var dx = (x - T.cx) * k, dy = (y - T.cy) * k;
        return [T.cx + dx * ca - dy * sa + (T.dx || 0), T.cy + dx * sa + dy * ca + (T.dy || 0)];
      }
      var n = clone(o);
      if (o.k === 's') {
        var np = []; for (var i = 0; i < o.p.length; i += 2) { var q = mp(o.p[i], o.p[i + 1]); np.push(Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10); }
        n.p = np; if (k !== 1) n.w = Math.max(0.5, Math.round(o.w * k * 10) / 10);
        return n;
      }
      var c = mp(o.x + o.w / 2, o.y + o.h / 2), w = o.w * k, h = o.h * k;
      n.x = Math.round(c[0] - w / 2); n.y = Math.round(c[1] - h / 2); n.w = Math.max(1, Math.round(w)); n.h = Math.max(1, Math.round(h));
      var r = o.r || 0; if (T.flip) { r = -r; n.fx = !o.fx; }
      n.r = Math.round((((r + (T.a || 0)) % 360) + 360) % 360);
      if (k !== 1) {
        if (DEF_FS[o.k]) n.fs = Math.max(6, Math.round((o.fs || DEF_FS[o.k]) * k));
        if (o.k === 'g' && o.sw) n.sw = Math.max(1, Math.round(o.sw * k * 10) / 10);
        if (o.k === 't' && o.bd) n.bw = Math.max(1, Math.round((o.bw || 3) * k * 10) / 10);
      }
      return n;
    }
    function replaceAll(news) { news.forEach(function (n) { for (var i = 0; i < V.objs.length; i++) if (V.objs[i].id === n.id) { V.objs[i] = n; break; } }); dirty = true; }
    function groupCommit(news, origs) {
      replaceAll(news);
      hist().push({ add: news, rem: origs }); if (hist().length > 80) hist().shift();
      opt.onOp && opt.onOp(V.bid, { del: news.map(function (o) { return o.id; }), add: news });
    }
    /* 群組：同一個 gp 的物件一起被選取、一起動 */
    function expand(ids) {
      if (!ids || !ids.length) return ids;
      var gs = {}, out = ids.slice(); ids.forEach(function (id) { var o = find(id); if (o && o.gp) gs[o.gp] = 1; });
      if (!Object.keys(gs).length) return out;
      V.objs.forEach(function (o) { if (o.gp && gs[o.gp] && out.indexOf(o.id) < 0) out.push(o.id); });
      return out;
    }
    V.expandGroup = expand;
    V.setMulti = function (ids) { ids = expand(ids); V.multi = ids && ids.length ? ids : null; sel._id = null; dirty = true; opt.onMulti && opt.onMulti(V.multi ? V.multi.length : 0); };
    V.groupOp = function (kind, val) {
      var list = members(); if (!list.length) return;
      var b = groupBox(list), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, locked = list.some(function (o) { return o.lk; });
      if (kind === 'grp') { if (list.length < 2) return; var gid = 'G' + uid(); groupCommit(list.map(function (o) { var n = clone(o); n.gp = gid; return n; }), list); return; }
      if (kind === 'ungrp') { groupCommit(list.filter(function (o) { return o.gp; }).map(function (o) { var n = clone(o); delete n.gp; return n; }), list.filter(function (o) { return o.gp; })); return; }
      if (kind === 'mv') { groupCommit(list.filter(function (o) { return o.k !== 's' && o.k !== 'v'; }).map(function (o) { var n = clone(o); if (val) n.mv = true; else delete n.mv; return n; }), list.filter(function (o) { return o.k !== 's' && o.k !== 'v'; })); return; }
      if (kind === 'lock') { groupCommit(list.map(function (o) { var n = clone(o); if (val) n.lk = true; else delete n.lk; return n; }), list); sel._id = null; return; }
      if (kind === 'hide') { groupCommit(list.filter(function (o) { return o.k !== 's'; }).map(function (o) { var n = clone(o); if (val) n.hd = true; else delete n.hd; return n; }), list.filter(function (o) { return o.k !== 's'; })); return; }
      if (kind === 'dup') {
        var gmap = {};
        var cp = list.map(function (o) { var n = xform(o, { cx: 0, cy: 0, dx: 40, dy: 40 }); n.id = uid(); delete n.lk; if (o.gp) { gmap[o.gp] = gmap[o.gp] || ('G' + uid()); n.gp = gmap[o.gp]; } return n; });
        cp.forEach(function (n) { V.objs.push(n); }); dirty = true; commit(cp, []); V.setMulti(cp.map(function (n) { return n.id; })); return;
      }
      if (locked) return opt.onLockedHint && opt.onLockedHint();
      if (kind === 'del') { V.setMulti(null); applyOp(V.objs, { del: list.map(function (o) { return o.id; }) }); dirty = true; commit([], list); return; }
      var T = { cx: cx, cy: cy };
      if (kind === 'rot') T.a = val; else if (kind === 'flip') T.flip = true; else if (kind === 'scale') T.k = val;
      if (kind === 'color') { groupCommit(list.map(function (o) { var n = clone(o); if (o.k === 's' && o.t !== 'hl') n.c = val; else if (o.k === 't') n.c = val; else if (o.k === 'g' && o.shape !== 'zycell') { if (o.txt) n.tc = val; else n.sc = val; } return n; }), list); return; }
      groupCommit(list.map(function (o) { return xform(o, T); }), list);
    };
    var gdrag = null;
    function groupDown(e, h) {
      if (h === 'gmenu') { if (opt.onGroupMenu) opt.onGroupMenu(e.clientX, e.clientY); return; }
      var list = members(); if (!list.length) return;
      if (V.locked || list.some(function (o) { return o.lk; })) {
        /* 鎖住時不能拖動：但「點一下」要能取消多選，或改選底下那一個物件 */
        if (h !== 'gmove') { opt.onLockedHint && opt.onLockedHint(); return; }
        if (e.button !== 0) return;
        var st = { pid: e.pointerId, p: pos(e), t: Date.now() };
        var up = function (ev) {
          if (ev.pointerId !== st.pid) return; window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
          var q = pos(ev); if (ev.type === 'pointerup' && Math.hypot(q[0] - st.p[0], q[1] - st.p[1]) < 6) { if (Date.now() - st.t < 450) clickGroup(st.p); } else opt.onLockedHint && opt.onLockedHint();
        };
        window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); return;
      }
      var b = groupBox(list), origs = {}; list.forEach(function (o) { origs[o.id] = o; });
      var anc = { gnw: [b[2], b[3]], gne: [b[0], b[3]], gsw: [b[2], b[1]], gse: [b[0], b[1]] }[h];
      var cor = { gnw: [b[0], b[1]], gne: [b[2], b[1]], gsw: [b[0], b[3]], gse: [b[2], b[3]] }[h];
      gdrag = { btn: e.button, t0: Date.now(), h: h, p: pos(e), b: b, origs: origs, anc: anc, cor: cor, id: e.pointerId, moved: false, cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    }
    function groupMove(e) {
      var G = gdrag, p = pos(e);
      if (!G.moved && Math.abs(p[0] - G.p[0]) + Math.abs(p[1] - G.p[1]) < 4) return;
      G.moved = true; var T;
      if (G.h === 'gmove') {
        var dx = p[0] - G.p[0], dy = p[1] - G.p[1];
        if (V.bg) { dx = Math.round((G.b[0] + dx) / 20) * 20 - G.b[0]; dy = Math.round((G.b[1] + dy) / 20) * 20 - G.b[1]; }
        T = { cx: 0, cy: 0, dx: dx, dy: dy };
      } else if (G.h === 'grot') {
        var a = (Math.atan2(p[1] - G.cy, p[0] - G.cx) - Math.atan2(G.p[1] - G.cy, G.p[0] - G.cx)) * 180 / Math.PI;
        var sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 3) a = sn;
        T = { cx: G.cx, cy: G.cy, a: Math.round(a) };
      } else {
        var vx = G.cor[0] - G.anc[0], vy = G.cor[1] - G.anc[1], L = vx * vx + vy * vy || 1;
        var k = Math.max(0.08, ((p[0] - G.anc[0]) * vx + (p[1] - G.anc[1]) * vy) / L);
        T = { cx: G.anc[0], cy: G.anc[1], k: k };
      }
      G.T = T;
      var news = []; for (var id in G.origs) news.push(xform(G.origs[id], T));
      replaceAll(news); G.news = news;
      if (Date.now() - lastSync > 150) { lastSync = Date.now(); opt.onOp && opt.onOp(V.bid, { del: news.map(function (o) { return o.id; }), add: news }, true); }
    }
    /* 多選時在選取範圍裡「點一下」：點到物件就只選那一個，點到空白處就取消多選 */
    function clickGroup(p) {
      var hit = objAt(p[0], p[1]) || strokeAt(p[0], p[1]);
      if (hit && opt.canEdit && !opt.canEdit(hit)) hit = null;
      V.setMulti(null); sel._id = null;
      if (hit) { if (hit.k === 's' || hit.gp) V.setMulti([hit.id]); else select(hit.id); }
      dirty = true;
    }
    function groupUp() {
      var G = gdrag; gdrag = null; if (!G.moved && G.h === 'gmove') { if (G.btn === 0 && Date.now() - G.t0 < 450) clickGroup(G.p); return; } if (!G.moved || !G.news) return;
      var origs = []; for (var id in G.origs) origs.push(G.origs[id]);
      groupCommit(G.news, origs); sel._id = null;
    }
    var lastSync = 0;
    function addHeld(e) { var k = V.addKey || 'shift'; return k === 'shift' ? e.shiftKey : k === 'ctrl' ? e.ctrlKey : k === 'meta' ? e.metaKey : k === 'alt' ? e.altKey : false; }
    function onDown(e) {
      if (opt.mergedSelect && V.tool.mode === 'select' && V.editable && !V.locked && addHeld(e) && !(e.target.dataset && /^(g?(nw|ne|sw|se|rot|menu)|gmenu)$/.test(e.target.dataset.h || ''))) {
        e.preventDefault();
        var ap = pos(e), aoe = e.target.closest && e.target.closest('.wb-obj');
        var ao = aoe ? find(aoe.dataset.id) : (objAt(ap[0], ap[1]) || strokeAt(ap[0], ap[1]));
        if (ao && opt.canEdit && !opt.canEdit(ao)) ao = null;
        var base = V.multi ? V.multi.slice() : (V.sel ? [V.sel] : []);
        if (ao) {
          var ix = base.indexOf(ao.id); if (ix >= 0) base.splice(ix, 1); else base.push(ao.id);
          if (V.sel) select(null);
          V.setMulti(base);
        } else {
          if (V.sel) select(null);
          lassoBase = base; lasso = [ap[0], ap[1]]; lassoPid = e.pointerId;
          try { stage.setPointerCapture(e.pointerId); } catch (x) {}
        }
        return;
      }
      var gh = e.target.dataset && e.target.dataset.h;
      if (gh && gh.charAt(0) === 'g' && V.multi) { e.preventDefault(); groupDown(e, gh); return; }
      if (V.tool.mode !== 'select' || V.locked) return;
      var h = e.target.dataset && e.target.dataset.h, oe = e.target.closest('.wb-obj');
      var o = h ? find(V.sel) : (oe ? find(oe.dataset.id) : null);
      if (o && opt.canEdit && !opt.canEdit(o)) o = null;
      if (!o) {
        select(null);
        if (opt.mergedSelect && !h && V.editable) {
          var pp = pos(e), so = strokeAt(pp[0], pp[1]);
          e.preventDefault();
          if (so) { V.setMulti([so.id]); groupDown(e, 'gmove'); return; }
          V.setMulti(null); lasso = [pp[0], pp[1]]; lassoPid = e.pointerId;
          try { stage.setPointerCapture(e.pointerId); } catch (x) {}
        }
        return;
      }
      if (o.gp && !h && V.editable && !V.locked && editing !== o.id) {
        var gm = V.multi && V.multi.indexOf(o.id) >= 0 ? V.multi : expand([o.id]);
        if (gm.length > 1 && gm.every(function (id) { var q = find(id); return q && (!opt.canEdit || opt.canEdit(q)); })) { e.preventDefault(); if (V.sel) select(null); if (gm !== V.multi) V.setMulti(gm); groupDown(e, 'gmove'); return; }
      }
      if (editing === o.id) return;
      e.preventDefault();
      if (h === 'menu') { if (opt.onContext) opt.onContext(o, e.clientX, e.clientY); return; }
      if (!h) select(o.id);
      if (o.lk) { if ((o.an || ((o.k === 't' || o.k === 'n' || o.k === 'g') && o.txt && opt.onTextClick)) && !h && e.button === 0 && !V.locked && (!opt.canEdit || opt.canEdit(o))) { var lp = pos(e); lkTap = { id: o.id, pid: e.pointerId, x: lp[0], y: lp[1] }; } return; }
      var p = pos(e), cx = o.x + o.w / 2, cy = o.y + o.h / 2, th = (o.r || 0) * Math.PI / 180;
      dragStart = { o: o, orig: o, h: h || 'move', p: p, cx: cx, cy: cy, th: th, moved: false, link: e.target.closest('a'), id: e.pointerId };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    }
    var lkTap = null;
    function onMove(e) {
      if (gdrag && e.pointerId === gdrag.id) return groupMove(e);
      if (lassoPid != null && e.pointerId === lassoPid) { var lp = pos(e), ln = lasso.length; if (Math.abs(lasso[ln - 2] - lp[0]) + Math.abs(lasso[ln - 1] - lp[1]) >= 3) lasso.push(lp[0], lp[1]); dirty = true; return; }
      if (opt.mergedSelect && !dragStart && V.tool.mode === 'select' && e.pointerType === 'mouse' && !e.buttons) {
        var hp = pos(e), onObj = e.target.closest && e.target.closest('.wb-obj,.wb-sel i');
        stage.style.cursor = !onObj && strokeAt(hp[0], hp[1]) ? 'pointer' : '';
      }
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
      } else if (D.h === 'nl' || D.h === 'nr') {
        var O = D.orig, nm0 = O.nmin == null ? 0 : O.nmin, nx0 = O.nmax == null ? 10 : O.nmax, st0 = O.st || 1, n0 = Math.max(1, Math.round((nx0 - nm0) / st0)), sp = (O.w * 0.9) / n0;
        var ddx = p[0] - D.cx, ddy = p[1] - D.cy, lx2 = ddx * Math.cos(-D.th) - ddy * Math.sin(-D.th);
        var kk = D.h === 'nr' ? Math.round((lx2 - O.w / 2) / sp) : Math.round((-lx2 - O.w / 2) / sp);
        var nn = Math.max(1, Math.min(60, n0 + kk)), nw2 = Math.round(sp * nn / 0.9), off = (nw2 - O.w) / 2 * (D.h === 'nr' ? 1 : -1);
        var ncx2 = D.cx + off * Math.cos(D.th), ncy2 = D.cy + off * Math.sin(D.th);
        patch = { x: Math.round(ncx2 - nw2 / 2), y: Math.round(ncy2 - O.h / 2), w: nw2 };
        if (D.h === 'nr') patch.nmax = nm0 + nn * st0; else patch.nmin = nx0 - nn * st0;
      } else if (D.orig.k === 't' && /^[nsew]$/.test(D.h)) {
        /* 文字框的邊中間控制點：只改框的大小，字不動 */
        var ddx2 = p[0] - D.cx, ddy2 = p[1] - D.cy, cc = Math.cos(-D.th), ss = Math.sin(-D.th), lx3 = ddx2 * cc - ddy2 * ss, ly3 = ddx2 * ss + ddy2 * cc;
        var ew = D.h === 'e' || D.h === 'w', sgn = (D.h === 'e' || D.h === 's') ? 1 : -1, nW = D.orig.w, nH = D.orig.h, mx3 = 0, my3 = 0;
        if (ew) { var o3 = -sgn * D.orig.w / 2; nW = Math.max(30, sgn * (lx3 - o3)); mx3 = o3 + sgn * nW / 2; }
        else { var o4 = -sgn * D.orig.h / 2; nH = Math.max(30, sgn * (ly3 - o4)); my3 = o4 + sgn * nH / 2; }
        var ncx3 = D.cx + mx3 * Math.cos(D.th) - my3 * Math.sin(D.th), ncy3 = D.cy + mx3 * Math.sin(D.th) + my3 * Math.cos(D.th);
        patch = { x: Math.round(ncx3 - nW / 2), y: Math.round(ncy3 - nH / 2), w: Math.round(nW), h: Math.round(nH) };
      } else {
        var sx = D.h.indexOf('e') >= 0 ? 1 : -1, sy = D.h.indexOf('s') >= 0 ? 1 : -1;
        var dx = p[0] - D.cx, dy = p[1] - D.cy, c = Math.cos(-D.th), s2 = Math.sin(-D.th);
        var lx = dx * c - dy * s2, ly = dx * s2 + dy * c;
        var ox = -sx * D.orig.w / 2, oy = -sy * D.orig.h / 2;
        var mn = D.orig.k === 'g' ? 2 : 30, w = Math.max(mn, sx * (lx - ox)), hh = Math.max(mn, sy * (ly - oy));
        if (D.orig.k === 'i' || D.orig.k === 't' || D.orig.ar || (D.orig.k === 'g' && (D.orig.shape === 'square' || D.orig.shape === 'circle'))) { var k = Math.max(w / D.orig.w, hh / D.orig.h); w = D.orig.w * k; hh = D.orig.h * k; }
        var mx = ox + sx * w / 2, my = oy + sy * hh / 2, c2 = Math.cos(D.th), s3 = Math.sin(D.th);
        var ncx = D.cx + mx * c2 - my * s3, ncy = D.cy + mx * s3 + my * c2;
        patch = { x: Math.round(ncx - w / 2), y: Math.round(ncy - hh / 2), w: Math.round(w), h: Math.round(hh) };
        if (D.orig.k === 't') patch.fs = Math.max(6, Math.round((D.orig.fs || 36) * w / D.orig.w));
      }
      if (V.bg && D.h !== 'rot' && D.h !== 'nl' && D.h !== 'nr' && !(D.orig.k === 't' && /^(nw|ne|sw|se)$/.test(D.h))) {
        var G = 20, sn = function (v) { return Math.round(v / G) * G; };
        if (D.h === 'move') { patch.x = sn(patch.x); patch.y = sn(patch.y); }
        else if (D.orig.k !== 'i' && !D.orig.r && !D.orig.ar) { var x2 = sn(patch.x + patch.w), y2 = sn(patch.y + patch.h); patch.x = sn(patch.x); patch.y = sn(patch.y); patch.w = Math.max(G, x2 - patch.x); patch.h = Math.max(G, y2 - patch.y); }
      }
      var sync = Date.now() - lastSync > 150; if (sync) lastSync = Date.now();
      D.o = change(o, patch, false, null, !sync);
    }
    function onUp(e) {
      if (gdrag && e.pointerId === gdrag.id) return groupUp();
      if (lassoPid != null && e.pointerId === lassoPid) { lassoPid = null; var poly = lasso; lasso = null; dirty = true; var lb = lassoBase; lassoBase = null; if (poly && poly.length >= 6) { var got = lassoPick(poly); if (lb) got.forEach(function (id) { if (lb.indexOf(id) < 0) lb.push(id); }); V.setMulti(lb || got); } else if (lb) V.setMulti(lb); return; }
      if (lkTap && e.pointerId === lkTap.pid) { var lt = lkTap, lq = pos(e); lkTap = null; var lo = find(lt.id); if (lo && lo.lk && Math.hypot(lq[0] - lt.x, lq[1] - lt.y) < 8) { if (lo.an) gifToggle(lo); else if (opt.onTextClick) opt.onTextClick(lo); } return; }
      var D = dragStart; if (!D || e.pointerId !== D.id) return; dragStart = null;
      var o = find(D.o.id);
      if (!D.moved) { if (D.link && D.h === 'move') window.open(D.link.href, '_blank', 'noopener'); else if (o && o.an && D.h === 'move' && e.button === 0) gifToggle(o); else if (o && (o.k === 't' || o.k === 'n' || o.k === 'g') && o.txt && D.h === 'move' && e.button === 0 && opt.onTextClick) opt.onTextClick(o); return; }
      if (o) change(o, {}, true, D.orig);
    }
    /* 學生：沒有拖拉權限時，點一下動圖在自己這邊播放／暫停 */
    stage.addEventListener('click', function (e) {
      if (!opt.gifLocal) return;
      var p = pos(e), o = objAt(p[0], p[1], ['i']); if (!o || !o.an || !o.sp || (opt.canEdit && opt.canEdit(o))) return;
      gifToggle(o);
    });
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
    /* 物件命中測試（含旋轉） */
    function objAt(x, y, kinds) {
      for (var i = V.objs.length - 1; i >= 0; i--) {
        var o = V.objs[i]; if (o.k === 's' || (kinds && kinds.indexOf(o.k) < 0)) continue;
        var cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = -(o.r || 0) * Math.PI / 180, dx = x - cx, dy = y - cy;
        var lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a), m = 6;
        if (Math.abs(lx) <= o.w / 2 + m && Math.abs(ly) <= o.h / 2 + m) return o;
      }
      return null;
    }
    V.objAt = objAt;
    function strokeAt(x, y) {
      for (var i = V.objs.length - 1; i >= 0; i--) {
        var o = V.objs[i]; if (o.k !== 's' || (opt.canEdit && !opt.canEdit(o))) continue;
        var p = o.p, r = (o.w || 4) / 2 + 7;
        if (p.length === 2 && Math.hypot(p[0] - x, p[1] - y) <= r) return o;
        for (var j = 0; j + 3 < p.length; j += 2) {
          var ax = p[j], ay = p[j + 1], bx = p[j + 2], by = p[j + 3], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
          if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= r) return o;
        }
      }
      return null;
    }
    function lassoPick(poly) {
      return V.objs.filter(function (o) {
        if (opt.canEdit && !opt.canEdit(o)) return false;
        if (o.k === 's') { var inn = 0, tot = 0; for (var i = 0; i < o.p.length; i += 2) { tot++; if (inPoly(o.p[i], o.p[i + 1], poly)) inn++; } return tot && inn / tot >= 0.5; }
        return inPoly(o.x + o.w / 2, o.y + o.h / 2, poly);
      }).map(function (o) { return o.id; });
    }
    /* GIF 動圖：預設停在畫面上，點一下才播放，再點一下就暫停（停在當時那一格） */
    function gifPlaying(e, o) { return e._lp != null ? e._lp : !!o.pl; }
    function gifRender(e, o, im, src) {
      if (e._osp !== !!o.sp) { e._osp = !!o.sp; if (!o.sp) e._lp = null; }
      if (e._opl !== !!o.pl) { e._opl = !!o.pl; e._lp = null; } /* 老師改了狀態：以老師為準 */
      var want = gifPlaying(e, o);
      if (e._gsrc !== src) {
        e._gsrc = src; e._poster = null; e._want = null; im.removeAttribute('src');
        if (src) { var t = new Image(); t.onload = function () { try { var cv = document.createElement('canvas'); cv.width = t.naturalWidth; cv.height = t.naturalHeight; cv.getContext('2d').drawImage(t, 0, 0); e._poster = cv.toDataURL('image/png'); } catch (x) {} if (e._gsrc === src && !e._want) { e._want = false; if (e._poster) im.src = e._poster; else im.src = src; } }; t.src = src; }
      }
      if (!src) { e.classList.toggle('loading', true); return; }
      if (e._want == null) { if (want) { e._want = true; im.src = src; } } /* 還沒做好第一格封面時，先等 */
      else if (want !== e._want) {
        if (want) { e._want = true; im.removeAttribute('src'); im.src = src; }
        else { try { var cv2 = document.createElement('canvas'); cv2.width = im.naturalWidth || 1; cv2.height = im.naturalHeight || 1; cv2.getContext('2d').drawImage(im, 0, 0); e._poster = cv2.toDataURL('image/png'); } catch (x) {} e._want = false; if (e._poster) im.src = e._poster; }
      }
      e.classList.toggle('gif-paused', !want); e.classList.add('gif');
    }
    function gifToggle(o) {
      if (opt.gifLocal) { var e = els[o.id]; if (!e) return; e._lp = !gifPlaying(e, o); dirty = true; V.render && V.render(); }
      else change(o, { pl: !o.pl }, true);
    }
    var taps = [];
    var lastDbl = 0, lastTap = null;
    stage.addEventListener('dblclick', function (e) { if (Date.now() - lastDbl < 800) return; dbl(e); });
    /* iPad／手機：瀏覽器常常不會送出 dblclick，所以自己判斷「連點兩下」 */
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !V.editable || V.locked || !e.isPrimary) return;
      var p = pos(e), now = Date.now(), oo = objAt(p[0], p[1], ['t', 'n', 'g']);
      if (oo && (oo.lk || (opt.canEdit && !opt.canEdit(oo)))) oo = null;
      if (lastTap && oo && now - lastTap.t < 450 && lastTap.id === oo.id && Math.hypot(p[0] - lastTap.x, p[1] - lastTap.y) < 40) {
        lastTap = null; lastDbl = now; e.preventDefault(); e.stopImmediatePropagation();
        /* iPad 要在手指「放開」的那一刻才允許跳出鍵盤，所以等 pointerup 再開始編輯 */
        var pe = e, go = function () { window.removeEventListener('pointerup', go, true); window.removeEventListener('pointercancel', go, true); dbl(pe, oo); };
        window.addEventListener('pointerup', go, true); window.addEventListener('pointercancel', go, true); return;
      }
      lastTap = oo ? { id: oo.id, t: now, x: p[0], y: p[1] } : null;
    }, true);
    function dbl(e, oo) {
      if (!V.editable || V.locked) return;
      var p = pos(e), oe = e.target.closest && e.target.closest('.wb-t,.wb-n,.wb-g');
      var o = oo || (oe ? find(oe.dataset.id) : objAt(p[0], p[1], ['t', 'n', 'g']));
      if (!o || o.lk || (opt.canEdit && !opt.canEdit(o))) return;
      /* 用畫筆點兩下時，先把點出來的小點收回 */
      var now = Date.now(), tid = taps.filter(function (t) { return now - t.t < 900; }).map(function (t) { return t.id; }); taps = [];
      if (tid.length) {
        applyOp(V.objs, { del: tid }); var h = hist();
        while (h.length && h[h.length - 1].add.length === 1 && tid.indexOf(h[h.length - 1].add[0].id) >= 0) h.pop();
        opt.onOp && opt.onOp(V.bid, { del: tid, add: [] }, true); dirty = true;
      }
      if (V.tool.mode !== 'select' && opt.onWantSelect) opt.onWantSelect();
      V.editText(o.id);
    }
    stage.addEventListener('contextmenu', function (e) {
      if (!opt.onContext) return;
      e.preventDefault();
      if (!V.editable) return;
      var p = pos(e);
      if (V.multi && opt.onGroupMenu) { var gb = groupBox(); if (gb && p[0] >= gb[0] - 8 && p[0] <= gb[2] + 8 && p[1] >= gb[1] - 8 && p[1] <= gb[3] + 8) return opt.onGroupMenu(e.clientX, e.clientY); }
      var o = objAt(p[0], p[1]);
      if (o && opt.canEdit && !opt.canEdit(o)) o = null;
      if (o && o.gp && opt.onGroupMenu) { var gm2 = expand([o.id]); if (gm2.length > 1) { select(null); V.setMulti(gm2); return opt.onGroupMenu(e.clientX, e.clientY); } }
      opt.onContext(o, e.clientX, e.clientY);
    });
    var zHeld = false;
    window.addEventListener('keydown', function (e) { if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test(e.target.tagName) && !e.target.isContentEditable) zHeld = true; });
    window.addEventListener('keyup', function (e) { if (e.key === 'z' || e.key === 'Z') zHeld = false; });
    window.addEventListener('blur', function () { zHeld = false; });
    if (opt.wheelZoom) stage.addEventListener('wheel', function (e) {
      var r = top.getBoundingClientRect();
      var zk = V.zoomKey || 'ctrl';
      if (e.ctrlKey || V.wheelPlain || (zk === 'alt' && e.altKey) || (zk === 'meta' && e.metaKey) || (zk === 'shift' && e.shiftKey) || (zk === 'z' && zHeld)) {
        e.preventDefault();
        var p = pos(e), z = Math.max(1, Math.min(8, V.vp.z * Math.exp(-e.deltaY * 0.0022)));
        var ox = (e.clientX - r.left) / scale, oy = (e.clientY - r.top) / scale;
        V.setViewport({ z: z, x: p[0] - ox / z, y: p[1] - oy / z });
      } else if (V.vp.z > 1.001) {
        e.preventDefault();
        var dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
        V.setViewport({ z: V.vp.z, x: V.vp.x + dx / S_(), y: V.vp.y + dy / S_() });
      } else return;
      opt.onViewport && opt.onViewport(V.vp);
    }, { passive: false });
    /* 局部放大時移動畫布：按住「移動鍵」＋滑鼠拖曳（滑鼠中鍵也行）；觸控用兩指拖曳 */
    var panHeld = false, pan = null, touches = {};
    function typing(e) { return /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable; }
    function isPanKey(e) { var k = V.panKey || 'space'; return k === 'space' ? e.code === 'Space' : k === 'alt' ? e.key === 'Alt' : (e.key || '').toLowerCase() === 'x'; }
    function setPanHeld(b) { panHeld = b; stage.classList.toggle('pan-ready', b && V.vp.z > 1.001); }
    function stopPan() { pan = null; stage.classList.remove('panning'); }
    if (opt.wheelZoom) {
      window.addEventListener('keydown', function (e) { if (!typing(e) && isPanKey(e) && !e.ctrlKey && !e.metaKey) { if (V.vp.z > 1.001 && e.code === 'Space') e.preventDefault(); setPanHeld(true); } });
      window.addEventListener('keyup', function (e) { if (isPanKey(e)) setPanHeld(false); });
      window.addEventListener('blur', function () { setPanHeld(false); stopPan(); });
      stage.addEventListener('pointerdown', function (e) {
        if (V.vp.z <= 1.001) return;
        if (e.pointerType === 'touch') {
          touches[e.pointerId] = [e.clientX, e.clientY];
          var ids = Object.keys(touches);
          if (ids.length >= 2) {
            /* 第二根手指放下：放掉手上正在畫的，改成移動畫布 */
            mine = null; erasing = null; shaping = null; zooming = null; lasso = null; gdrag = null; pid = null; dirty = true;
            e.stopPropagation(); e.preventDefault();
            var a = touches[ids[0]], b = touches[ids[1]];
            pan = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, vx: V.vp.x, vy: V.vp.y, touch: true };
            stage.classList.add('panning');
          }
          return;
        }
        if ((panHeld && e.button === 0) || e.button === 1) {
          e.stopPropagation(); e.preventDefault();
          pan = { x: e.clientX, y: e.clientY, vx: V.vp.x, vy: V.vp.y };
          stage.classList.add('panning');
        }
      }, true);
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch' && touches[e.pointerId]) touches[e.pointerId] = [e.clientX, e.clientY];
        if (!pan) return;
        var cx = e.clientX, cy = e.clientY;
        if (pan.touch) { var ks = Object.keys(touches); if (ks.length < 2) return; cx = (touches[ks[0]][0] + touches[ks[1]][0]) / 2; cy = (touches[ks[0]][1] + touches[ks[1]][1]) / 2; }
        V.setViewport({ z: V.vp.z, x: pan.vx - (cx - pan.x) / S_(), y: pan.vy - (cy - pan.y) / S_() });
        opt.onViewport && opt.onViewport(V.vp);
      });
      function upP(e) { delete touches[e.pointerId]; if (pan && (!pan.touch || Object.keys(touches).length < 2)) stopPan(); }
      window.addEventListener('pointerup', upP); window.addEventListener('pointercancel', upP);
    }
    stage.addEventListener('click', function (e) { if (V.tool.mode === 'select' && e.target.closest('a')) e.preventDefault(); });
    V.editText = function (id) {
      if (!els[id]) drawObjs();
      var o = find(id), e = els[id]; if (!o || (o.k !== 't' && o.k !== 'n' && o.k !== 'g') || !e) return;
      select(id); editing = id; var t = o.k === 'g' ? e.lastChild : e.firstChild;
      t.contentEditable = 'true'; t._h = null; e.classList.add('editing');
      var tail = t;
      if (o.v) t.textContent = o.txt || '';
      else {
        t.innerHTML = o.txt ? lineHtml(o) : '<div class="lns"><div class="ln"><br></div></div>'; tail = t.querySelector('.lns').lastChild;
        var bar = document.createElement('div'); bar.className = 'edit-al';
        var hold = false;
        function mk(tag, cls, txt, title) { var x = document.createElement(tag); if (cls) x.className = cls; if (txt) x.textContent = txt; if (title) x.title = title; return x; }
        function keep(x) { x.onmousedown = function (ev) { if (x.tagName !== 'INPUT') ev.preventDefault(); ev.stopPropagation(); }; x.onpointerdown = function (ev) { ev.stopPropagation(); }; return x; }
        function cmd(c, v) { try { document.execCommand('styleWithCSS', false, true); } catch (x) {} document.execCommand(c, false, v); }
        var saved = null;
        function saveSel() { var sl2 = getSelection(); saved = sl2 && sl2.rangeCount && t.contains(sl2.getRangeAt(0).commonAncestorContainer) ? sl2.getRangeAt(0).cloneRange() : null; }
        function restoreSel() { t.focus(); if (saved) { var sl3 = getSelection(); sl3.removeAllRanges(); sl3.addRange(saved); } }
        function colorize(c) { restoreSel(); cmd('foreColor', c); saveSel(); }
        var r1 = mk('div', 'eal-r');
        r1.appendChild(mk('span', 'eal-l', '選取文字：'));
        [['bold', 'B', '粗體（Ctrl+B）', 'eb'], ['italic', 'I', '斜體（Ctrl+I）', 'ei'], ['underline', 'U', '底線（Ctrl+U）', 'eu']].forEach(function (z) {
          var b = keep(mk('button', z[3], z[1], z[2])); b.type = 'button'; b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); cmd(z[0]); }; r1.appendChild(b);
        });
        r1.appendChild(mk('span', 'eal-l', '　整行：'));
        [['l', '⬅'], ['c', '↔'], ['r', '➡']].forEach(function (z) {
          var b = keep(mk('button', '', z[1], { l: '這幾行靠左', c: '這幾行置中', r: '這幾行靠右' }[z[0]])); b.type = 'button';
          b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); alignLines(t, z[0]); }; r1.appendChild(b);
        });
        bar.appendChild(r1);
        var r2 = mk('div', 'eal-r'); r2.appendChild(mk('span', 'eal-l', '字色：'));
        ['#111111', '#555555', '#e53935', '#f08c00', '#f5c400', '#16a34a', '#1e63d6', '#8e44ad', '#ff4fa3', '#8b5a2b', '#ffffff'].forEach(function (c) {
          var b = keep(mk('button', 'eal-dot', '', c)); b.type = 'button'; b.style.background = c; b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); cmd('foreColor', c); }; r2.appendChild(b);
        });
        var ci = keep(mk('input', 'eal-pick', '', '自選顏色')); ci.type = 'color'; ci.value = '#3157d5';
        ci.onmousedown = function (ev) { ev.stopPropagation(); saveSel(); hold = true; };   /* 按下去就要先鎖住編輯狀態，不然游標一離開文字框，工具列就消失、調色盤打不開 */
        ci.onclick = function () { saveSel(); hold = true; };
        ci.onchange = function () { hold = false; colorize(ci.value); };
        window.addEventListener('focus', function fb() { window.removeEventListener('focus', fb); setTimeout(function () { if (hold) { hold = false; restoreSel(); } }, 400); });
        r2.appendChild(ci);
        if (window.EyeDropper) { var eb = keep(mk('button', 'eal-eye', '💧吸色', '吸取畫面上任何地方的顏色，套用到選取的文字')); eb.type = 'button'; eb.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); saveSel(); hold = true; new window.EyeDropper().open().then(function (rs) { hold = false; colorize(rs.sRGBHex); }).catch(function () { hold = false; restoreSel(); }); }; r2.appendChild(eb); }
        bar.appendChild(r2);
        var r3 = mk('div', 'eal-r'); r3.appendChild(mk('span', 'eal-l', '底色：'));
        function hilite(c) { restoreSel(); cmd('hiliteColor', c); saveSel(); }
        ['#fff176', '#b9f6ca', '#a5d8ff', '#ffc2d6', '#ffd8a8', '#e0e0e0'].forEach(function (c) {
          var b = keep(mk('button', 'eal-dot', '', '標示底色')); b.type = 'button'; b.style.background = c; b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); cmd('hiliteColor', c); }; r3.appendChild(b);
        });
        var hi = keep(mk('input', 'eal-pick', '', '自選底色')); hi.type = 'color'; hi.value = '#fff176';
        hi.onmousedown = function (ev) { ev.stopPropagation(); saveSel(); hold = true; };
        hi.onclick = function () { saveSel(); hold = true; };
        hi.onchange = function () { hold = false; hilite(hi.value); };
        window.addEventListener('focus', function fb2() { window.removeEventListener('focus', fb2); setTimeout(function () { if (hold) { hold = false; restoreSel(); } }, 400); });
        r3.appendChild(hi);
        var hn = keep(mk('button', '', '✕ 去除底色', '把選取文字的底色拿掉')); hn.type = 'button'; hn.style.fontSize = '12px'; hn.style.padding = '0 8px'; hn.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); cmd('hiliteColor', 'transparent'); }; r3.appendChild(hn);
        bar.appendChild(r3);
        var r4 = mk('div', 'eal-r'); r4.appendChild(mk('span', 'eal-l', '字型：'));
        var fpop = null;
        function closeFpop() { if (fpop) { fpop.remove(); fpop = null; } }
        var fbtn = keep(mk('button', '', '選字型 ▾', '選取的文字改用這個字型（每個字型都有範字）')); fbtn.type = 'button'; fbtn.style.fontSize = '12px'; fbtn.style.padding = '0 8px';
        fbtn.onclick = function (ev) {
          ev.preventDefault(); ev.stopPropagation(); if (fpop) return closeFpop();
          saveSel(); if (!saved || saved.collapsed) { opt.toast && opt.toast('請先用滑鼠反白要換字型的文字，再按「選字型」'); return; }
          fpop = mk('div', 'fl-pop'); fpop.onmousedown = function (e2) { e2.preventDefault(); e2.stopPropagation(); }; fpop.onpointerdown = function (e2) { e2.stopPropagation(); };
          if (opt.fontList) opt.fontList(fpop, '', function (fv) {
            function go(ok) { hold = false; if (ok) { restoreSel(); cmd('fontName', fv ? 'wbf-' + fv : 'sans-serif'); opt.toast && opt.toast('已套用字型'); } else restoreSel(); }
            closeFpop(); if (fv && opt.ensureFont) { hold = true; opt.ensureFont(fv, go); } else go(true);
          });
          document.body.appendChild(fpop);
          var br = bar.getBoundingClientRect(), ph = fpop.offsetHeight, top = br.top - ph - 6; if (top < 6) top = br.bottom + 6;
          fpop.style.left = Math.max(6, Math.min(innerWidth - fpop.offsetWidth - 6, br.left)) + 'px'; fpop.style.top = Math.max(6, Math.min(innerHeight - ph - 6, top)) + 'px';
        };
        r4.appendChild(fbtn);
        var fclose = bar.remove.bind(bar); bar.remove = function () { closeFpop(); fclose(); };
        if (opt.uploadFont) {
          var ub = keep(mk('button', '', '⬆ 上傳字型', '上傳字型檔（.ttf .otf .woff .woff2），上傳後就能選')); ub.type = 'button'; ub.style.fontSize = '12px'; ub.style.padding = '0 8px';
          ub.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); saveSel(); hold = true; opt.uploadFont(function (f) { hold = false; if (f) { restoreSel(); cmd('fontName', 'wbf-' + f.id); } else restoreSel(); }); };
          r4.appendChild(ub);
        }
        bar.appendChild(r4);
        t._hold = function () { return hold; };
        document.body.appendChild(bar); e._bar = bar;
        try { document.execCommand('styleWithCSS', false, true); } catch (x) {}
        var rr = e.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight; bar.style.left = Math.max(6, Math.min(innerWidth - bw - 6, rr.left)) + 'px'; bar.style.top = (rr.top - bh - 8 < 6 ? Math.min(innerHeight - bh - 6, rr.bottom + 8) : rr.top - bh - 8) + 'px';
      }
      t.focus();
      var r = document.createRange(); r.selectNodeContents(tail); r.collapse(false); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
      t.onblur = function () { if (t._hold && t._hold()) return; finishEdit(); };
      t.onpaste = function (ev) { var tx = (ev.clipboardData || window.clipboardData).getData('text/plain'); ev.preventDefault(); document.execCommand('insertText', false, tx); };
      t.onkeydown = function (k) { if (k.key === 'Escape') t.blur(); k.stopPropagation(); };
    };
    function alignLines(t, a) {
      var w = t.querySelector('.lns'); if (!w) return;
      var sl = getSelection(), rg = sl && sl.rangeCount ? sl.getRangeAt(0) : null, inside = rg && w.contains(rg.commonAncestorContainer);
      Array.prototype.forEach.call(w.childNodes, function (c) {
        if (c.nodeType !== 1) return;
        if (!inside || rg.intersectsNode(c)) { c.dataset.al = a; c.style.textAlign = ALM[a]; }
      });
    }
    var colorCtx = null;
    function hexOf(c) { try { colorCtx = colorCtx || document.createElement('canvas').getContext('2d'); colorCtx.fillStyle = '#000000'; colorCtx.fillStyle = c; var v = colorCtx.fillStyle; return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ''; } catch (x) { return ''; } }
    /* 把編輯中的畫面讀回「每一段、每一小段文字的樣式」 */
    function readRich(w) {
      var paras = [], cur = null, brk = false;
      function start(al) { cur = { runs: [], al: al || '' }; paras.push(cur); brk = false; }
      function push(text, st) {
        if (!text) return; if (brk || !cur) start(cur ? cur.al : '');
        var l = cur.runs[cur.runs.length - 1];
        if (l && !!l.b === !!st.b && !!l.i === !!st.i && !!l.u === !!st.u && (l.c || '') === (st.c || '') && (l.h || '') === (st.h || '') && (l.f || '') === (st.f || '')) l.t += text;
        else { var r = { t: text }; if (st.b) r.b = 1; if (st.i) r.i = 1; if (st.u) r.u = 1; if (st.c) r.c = st.c; if (st.h) r.h = st.h; if (st.f) r.f = st.f; cur.runs.push(r); }
      }
      function styleOf(n, st) {
        var q = { b: st.b, i: st.i, u: st.u, c: st.c, h: st.h, f: st.f }, tg = n.tagName;
        if (tg === 'B' || tg === 'STRONG') q.b = 1; if (tg === 'I' || tg === 'EM') q.i = 1; if (tg === 'U') q.u = 1;
        if (tg === 'FONT' && n.getAttribute('color')) q.c = hexOf(n.getAttribute('color'));
        var cs = n.style; if (cs) {
          if (cs.fontWeight) q.b = (cs.fontWeight === 'bold' || +cs.fontWeight >= 600) ? 1 : 0;
          if (cs.fontStyle) q.i = cs.fontStyle === 'italic' ? 1 : 0;
          var td = cs.textDecorationLine || cs.textDecoration || ''; if (td) q.u = td.indexOf('underline') >= 0 ? 1 : 0;
          if (cs.color) q.c = hexOf(cs.color);
          if (cs.backgroundColor) q.h = hexOf(cs.backgroundColor);
          if (cs.fontFamily) { var fm = /wbf-(fn[A-Za-z0-9_]+)/.exec(cs.fontFamily); q.f = fm ? fm[1] : ''; }
        }
        return q;
      }
      function walk(n, st) {
        Array.prototype.forEach.call(n.childNodes, function (c) {
          if (c.nodeType === 3) { c.textContent.split('\n').forEach(function (part, k) { if (k > 0) brk = true; push(part, st); }); }
          else if (c.nodeType === 1) {
            if (c.tagName === 'BR') { if (c.nextSibling) brk = true; }
            else if (c.tagName === 'DIV' || c.tagName === 'P') { if (cur && cur.runs.length) brk = true; walk(c, styleOf(c, st)); brk = true; }
            else walk(c, styleOf(c, st));
          }
        });
      }
      Array.prototype.forEach.call(w.childNodes, function (c) {
        start(c.nodeType === 1 && c.dataset ? c.dataset.al : '');
        if (c.nodeType === 3) push(c.textContent, {});
        else if (c.nodeType === 1) walk(c, styleOf(c, {}));
      });
      return paras;
    }
    function finishEdit() {
      if (!editing) return; var id = editing; editing = null;
      var e = els[id], o = find(id); if (!e || !o) return;
      var t = o.k === 'g' ? e.lastChild : e.firstChild; t.contentEditable = 'false'; e.classList.remove('editing'); t.onblur = null;
      if (e._bar) { e._bar.remove(); e._bar = null; }
      var w = o.v ? null : t.querySelector('.lns'), txt, als = null, rt = null;
      if (w) {
        var rd = readRich(w);
        while (rd.length > 1 && !rd[rd.length - 1].runs.length) rd.pop();
        txt = rd.map(function (q) { return q.runs.map(function (r) { return r.t; }).join(''); }).join('\n');
        var as = rd.map(function (q) { return q.al; }); if (as.some(function (x) { return x; })) als = as;
        if (rd.some(function (q) { return q.runs.some(function (r) { return r.b || r.i || r.u || r.c || r.h || r.f; }); })) rt = rd.map(function (q) { return q.runs; });
      } else txt = t.innerText.replace(/\n$/, '');
      t._h = null;
      var alsOld = JSON.stringify(o.als || null), alsNew = JSON.stringify(als), rtOld = JSON.stringify(o.rt || null), rtNew = JSON.stringify(rt);
      if (txt !== (o.txt || '') || alsOld !== alsNew || rtOld !== rtNew) change(o, { txt: txt, als: als, rt: rt }, true); else dirty = true;
    }
    V.finishEdit = finishEdit;
    /* YouTube 影片控制 */
    V.vt = {};
    function frameOf(id) { var e = els[id]; return e && e.querySelector('iframe'); }
    var vpend = {}, vready = {};
    V.video = function (id, cmd, at) {
      if (cmd === 'play' && els[id] && !els[id]._tplay) { els[id]._tplay = true; dirty = true; }
      var f = frameOf(id);
      if (!f || !vready[id]) { vpend[id] = { cmd: cmd, at: at, ts: Date.now() }; if (!f) dirty = true; return; }
      function post(func, args) { try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (x) {} }
      if (at != null) post('seekTo', [at, true]);
      if (cmd === 'play') { post('playVideo'); } else if (cmd === 'pause') post('pauseVideo');
    };
    window.addEventListener('message', function (ev) {
      if (!/youtube/.test(ev.origin)) return;
      var d; try { d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch (x) { return; }
      if (!d || (!d.info && d.event !== 'onReady')) return;
      for (var id in els) {
        var f = els[id].querySelector('iframe');
        if (f && f.contentWindow === ev.source) {
          if (!vready[id]) {
            vready[id] = 1;
            var pd = vpend[id]; delete vpend[id];
            if (pd) { var at = pd.at; if (pd.cmd === 'play' && at != null) at += (Date.now() - pd.ts) / 1000; V.video(id, pd.cmd, at); }
          }
          if (!d.info) break;
          var st = V.vt[id] || (V.vt[id] = {}), now2 = Date.now();
          if (d.info.currentTime != null) {
            var exp = st.t == null ? null : st.s === 1 ? st.t + (now2 - (st.at || now2)) / 1000 : st.t;
            var ps = d.info.playerState == null ? st.s : d.info.playerState;
            if (opt.onVideo && exp != null && Math.abs(d.info.currentTime - exp) > 2 && (ps === 1 || ps === 2) && ps === st.s) opt.onVideo(id, ps === 1 ? 'play' : 'pause', d.info.currentTime);
            st.t = d.info.currentTime; st.at = now2;
          }
          if (d.info.playerState != null && d.info.playerState !== st.s) {
            var prev = st.s; st.s = d.info.playerState;
            if (opt.onVideo && !st.mute && (st.s === 1 || (st.s === 2 && prev === 1))) opt.onVideo(id, st.s === 1 ? 'play' : 'pause', st.t || 0);
          }
          break;
        }
      }
    });

    function pos(e) { var r = top.getBoundingClientRect(), s = S_(); return [Math.round((e.clientX - r.left) / s + V.vp.x), Math.round((e.clientY - r.top) / s + V.vp.y)]; }
    V.redoH = {};
    function redoS() { return V.redoH[V.bid] || (V.redoH[V.bid] = []); }
    function hist() { return V.hist[V.bid] || (V.hist[V.bid] = []); }
    function commit(add, rem) {
      if (!add.length && !rem.length) return;
      hist().push({ add: add, rem: rem }); if (hist().length > 80) hist().shift();
      V.redoH[V.bid] = [];
      opt.onOp && opt.onOp(V.bid, { del: rem.map(function (o) { return o.id; }), add: add });
    }
    var lastLive = 0, pid = null;
    top.addEventListener('pointerdown', function (e) {
      if (!V.editable || pid != null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pid = e.pointerId; top.setPointerCapture(pid); e.preventDefault();
      var p = pos(e);
      if (V.tool.mode === 'pen') {
        var pt = V.tool.pen || '', bw = V.tool.width;
        mine = { id: uid(), k: 's', by: opt.me, c: V.tool.color, w: pt === 'hl' ? bw * 3 + 6 : pt === 'mk' ? bw * 2 + 2 : pt === 'lz' ? Math.max(4, bw) : bw, p: p };
        if (pt) mine.t = pt;
      } else if (V.tool.mode === 'erase') {
        erasing = { r: V.tool.eraser || 18, orig: {}, made: {}, removed: [], cx: p[0], cy: p[1] };
        eraseAt(p[0], p[1]);
      } else if (V.tool.mode === 'shape') {
        shaping = { p: p, o: null };
      } else if (V.tool.mode === 'zoom') {
        zooming = { p: p, b: null };
      } else if (V.tool.mode === 'lasso') {
        V.setMulti(null); lasso = [p[0], p[1]];
      }
    });
    function inPoly(x, y, P) {
      var c = false; for (var i = 0, j = P.length - 2; i < P.length; j = i, i += 2) { var xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
      return c;
    }
    function shapeFrom(a, b) {
      var T = V.tool.shape || {}, sh = T.shape || 'rect', dx = b[0] - a[0], dy = b[1] - a[1];
      if (sh === 'square' || sh === 'circle' || (sh === 'poly' && T.even !== false)) { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * m; dy = (dy < 0 ? -1 : 1) * m; }
      var x = Math.min(a[0], a[0] + dx), y = Math.min(a[1], a[1] + dy), w = Math.abs(dx), h = Math.abs(dy);
      var o = { id: uid(), k: 'g', by: opt.me, shape: sh, x: x, y: y, w: Math.max(1, w), h: Math.max(1, h), r: 0, fx: false, sc: T.sc || '#111111', sw: T.sw || 3, fill: !!T.fill, fc: T.fc || '#ffd6e0', op: T.op == null ? 1 : T.op };
      if (sh === 'poly') o.n = T.n || 5;
      if (sh === 'grid') { o.rows = T.rows || 3; o.cols = T.cols || 3; }
      if (sh === 'line' || sh === 'arrow') o.dir = dx * dy >= 0 ? 1 : -1;
      return o;
    }
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
        if (lasso) { var ln = lasso.length; if (Math.abs(lasso[ln - 2] - p[0]) + Math.abs(lasso[ln - 1] - p[1]) >= 3) lasso.push(p[0], p[1]); }
        else if (shaping) { shaping.o = shapeFrom(shaping.p, p); }
        else if (zooming) { zooming.b = [Math.min(zooming.p[0], p[0]), Math.min(zooming.p[1], p[1]), Math.abs(p[0] - zooming.p[0]), Math.abs(p[1] - zooming.p[1])]; }
        else if (mine) { var n = mine.p.length; if (Math.abs(mine.p[n - 2] - p[0]) + Math.abs(mine.p[n - 1] - p[1]) >= 2) mine.p.push(p[0], p[1]); }
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
      if (lasso) {
        var poly = lasso; lasso = null; dirty = true;
        if (poly.length < 6) return;
        V.setMulti(lassoPick(poly));
        return;
      }
      if (shaping) {
        var so = shaping.o; shaping = null;
        if (so && (so.w > 6 || so.h > 6)) { V.objs.push(so); dirty = true; commit([so], []); }
        return;
      }
      if (zooming) {
        var zb = zooming.b, zp = zooming.p; zooming = null; var nv;
        if (zb && zb[2] > 20 && zb[3] > 20) { var z = Math.min(W / zb[2], H / zb[3]); z = Math.min(8, V.vp.z > 0 ? z : 1); nv = { z: z, x: zb[0] + zb[2] / 2 - W / z / 2, y: zb[1] + zb[3] / 2 - H / z / 2 }; }
        else { var z2 = Math.min(8, V.vp.z * 2); nv = { z: z2, x: zp[0] - W / z2 / 2, y: zp[1] - H / z2 / 2 }; }
        V.setViewport(nv); opt.onViewport && opt.onViewport(V.vp);
        return;
      }
      if (mine && mine.t === 'lz') {
        var lo = mine; mine = null; lives[lo.id] = { o: lo, t: Date.now() };
        opt.onLive && opt.onLive(V.bid, lo);
      } else if (mine) {
        var o = mine; mine = null; o.p = densify(o.p, 5);
        var xs = o.p.filter(function (v, i) { return i % 2 === 0; }), ys = o.p.filter(function (v, i) { return i % 2 === 1; });
        if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 10 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 10) taps.push({ id: o.id, t: Date.now() });
        V.objs.push(o); dirty = true; commit([o], []);
      } else if (erasing) {
        var E = erasing; erasing = null;
        var add = Object.keys(E.made).map(function (k) { return E.made[k]; });
        commit(add, E.removed);
      }
    }
    top.addEventListener('pointerup', end); top.addEventListener('pointercancel', end);
    top.addEventListener('touchstart', function (e) { if (V.editable) e.preventDefault(); }, { passive: false });

    V.load = function (bid, objs) { finishEdit(); V.sel = null; V.multi = null; lasso = null; gdrag = null; dragStart = null; opt.onMulti && opt.onMulti(0); if (opt.onSelect) opt.onSelect(null); V.bid = bid; V.objs = objs; lives = {}; mine = null; erasing = null; shaping = null; zooming = null; dirty = true; };
    V.find = find;
    V.apply = function (bid, op) { if (bid !== V.bid) return; applyOp(V.objs, op); (op.add || []).forEach(function (o) { delete lives[o.id]; }); dirty = true; if (opt.canEdit) cancelDragIfDenied(); };
    V.live = function (bid, o) { if (bid !== V.bid) return; lives[o.id] = { o: o, t: Date.now() }; };
    V.clearLives = function () { lives = {}; };
    V.undo = function () {
      var h = hist(), e;
      while ((e = h.pop())) {
        if (e.ord) { applyOrd(V.objs, e.ord.a); dirty = true; opt.onOp && opt.onOp(V.bid, { ord: e.ord.a }); redoS().push(e); return true; }
        var ids = {}; V.objs.forEach(function (o) { ids[o.id] = 1; });
        var del = e.add.filter(function (o) { return ids[o.id]; });
        if (!del.length && !e.rem.length) continue;
        applyOp(V.objs, { del: del.map(function (o) { return o.id; }), add: e.rem }); dirty = true;
        opt.onOp && opt.onOp(V.bid, { del: del.map(function (o) { return o.id; }), add: e.rem });
        redoS().push({ add: del, rem: e.rem });
        return true;
      }
      return false;
    };
    /* 下一步：把剛剛「上一步」復原的動作重做回來 */
    V.redo = function () {
      var rs = redoS(), e;
      while ((e = rs.pop())) {
        if (e.ord) { applyOrd(V.objs, e.ord.b); dirty = true; opt.onOp && opt.onOp(V.bid, { ord: e.ord.b }); hist().push(e); return true; }
        var ids = {}; V.objs.forEach(function (o) { ids[o.id] = 1; });
        var del = e.rem.filter(function (o) { return ids[o.id]; });
        if (!del.length && !e.add.length) continue;
        applyOp(V.objs, { del: del.map(function (o) { return o.id; }), add: e.add }); dirty = true;
        opt.onOp && opt.onOp(V.bid, { del: del.map(function (o) { return o.id; }), add: e.add });
        hist().push({ add: e.add, rem: e.rem });
        return true;
      }
      return false;
    };
    V.canRedo = function () { return redoS().length > 0; };
    /* 圖層：mode = front 置頂／back 置底／up 上移一層／down 下移一層；ids 可以是多個物件 */
    V.layerIds = function () { return V.objs.filter(function (o) { return o.k !== 's'; }).map(function (o) { return o.id; }); };
    V.reorder = function (ids, mode) {
      var old = V.layerIds(), sel = {}; ids.forEach(function (i) { sel[i] = 1; });
      var picked = old.filter(function (i) { return sel[i]; }); if (!picked.length) return false;
      var cur = old.slice(), n;
      if (mode === 'front') cur = old.filter(function (i) { return !sel[i]; }).concat(picked);
      else if (mode === 'back') cur = picked.concat(old.filter(function (i) { return !sel[i]; }));
      else if (mode === 'up') { for (n = cur.length - 2; n >= 0; n--) if (sel[cur[n]] && !sel[cur[n + 1]]) { var t = cur[n]; cur[n] = cur[n + 1]; cur[n + 1] = t; } }
      else if (mode === 'down') { for (n = 1; n < cur.length; n++) if (sel[cur[n]] && !sel[cur[n - 1]]) { var t2 = cur[n]; cur[n] = cur[n - 1]; cur[n - 1] = t2; } }
      if (cur.join() === old.join()) return false;
      applyOrd(V.objs, cur); dirty = true;
      hist().push({ ord: { a: old, b: cur } }); if (hist().length > 80) hist().shift(); V.redoH[V.bid] = [];
      opt.onOp && opt.onOp(V.bid, { ord: cur });
      return true;
    };
    V.canUndo = function () { return hist().length > 0; };
    /* 全消除：老師清全部筆劃；學生只清自己的 */
    V.clear = function (all) {
      var rem = V.objs.filter(function (o) { return o.k === 's' && (all || o.by === opt.me); });
      if (!rem.length) return false;
      applyOp(V.objs, { del: rem.map(function (o) { return o.id; }) }); dirty = true; commit([], rem); return true;
    };
    V.clearAll = function () {
      var rem = V.objs.slice(); if (!rem.length) return false;
      select(null); applyOp(V.objs, { del: rem.map(function (o) { return o.id; }) }); dirty = true; commit([], rem); return true;
    };
    /* 權限被收回時：馬上中斷正在進行的拖動（手指還按著也一樣），並請外面重新同步 */
    function dragAllowed() {
      var ids = dragStart ? [dragStart.o.id] : gdrag ? Object.keys(gdrag.origs) : [];
      return ids.every(function (id) { var q = find(id); return q && (!opt.canEdit || opt.canEdit(q)); });
    }
    function cancelDragIfDenied() {
      if (!(dragStart || gdrag)) return;
      if (V.editable && dragAllowed()) return;
      dragStart = null; gdrag = null; dirty = true; if (V.sel) select(null); if (V.multi) V.setMulti(null);
      opt.onDragCancel && opt.onDragCancel();
    }
    V.setEditable = function (b) {
      V.editable = b; cancelDragIfDenied(); var m = V.tool.mode, draw = b && (m === 'pen' || m === 'erase' || m === 'shape' || m === 'zoom' || m === 'lasso');
      top.style.pointerEvents = draw ? 'auto' : 'none';
      top.style.cursor = m === 'erase' ? 'cell' : m === 'zoom' ? 'zoom-in' : 'crosshair'; top.style.touchAction = draw ? 'none' : 'auto';
      stage.classList.toggle('selecting', b && m === 'select' && !V.locked);
      stage.classList.toggle('own-select', b && m === 'select' && !!opt.canEdit);
      stage.style.touchAction = b && m === 'select' ? 'none' : '';
      if (m !== 'select') { finishEdit(); if (V.sel) select(null); }
      if (m !== 'lasso' && m !== 'select' && V.multi) V.setMulti(null);
      dirty = true;
    };
    V.setLocked = function (b) { V.locked = b; if (b) select(null); V.setEditable(V.editable); };
    V.setTool = function (t) { for (var k in t) V.tool[k] = t[k]; V.setEditable(V.editable); };
    V.refit = fit;
    fit();
    return V;
  }
  return { ensureFont: ensureFont, ffam: ffam, W: W, H: H, uid: uid, clone: clone, render: render, applyOp: applyOp, view: view, imgs: imgs, setImg: setImg, missingImgs: missingImgs, onImg: function (f) { imgWait.push(f); }, linkify: linkify, shapeSvg: shapeSvg };
})();
