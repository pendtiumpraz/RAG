/**
 * Nalar embed widget — production.
 * <script src="https://app.nalar.id/embed.js" data-chatbot="cb_live_xxx"></script>
 *
 * Boot: GET /api/chat/<key> → themeConfig (white-label) → render launcher +
 * panel. Kirim: POST /api/chat/<key> (SSE) → jawaban streaming + sitasi.
 * API key TIDAK pernah ada di sini — hanya public key. Semua style di-scope
 * ke #nalar-embed agar tidak bentrok dengan situs host.
 */
(function () {
  var script = document.currentScript || document.querySelector('script[data-chatbot]');
  var key = script && script.getAttribute('data-chatbot');
  var host = new URL(script.src).origin;
  if (!key) { console.error('[nalar] data-chatbot wajib'); return; }

  var visitorId = localStorage.getItem('nalar_visitor') ||
    (function () { var v = 'v_' + Math.random().toString(36).slice(2); localStorage.setItem('nalar_visitor', v); return v; })();
  var conversationId = null;

  // default brand resmi; ditimpa themeConfig dari server.
  // logoUrl default = favicon N (mark konstelasi) — bukan huruf "N" polos.
  // Tenant yang menyetel brand.logo (huruf) sendiri kembali ke mode huruf;
  // brand.logoUrl memakai gambarnya sendiri.
  var T = { signal: '#2563EB', signalStrong: '#1D4EDB', source: '#F59E0B', radius: '12px',
    mode: 'light', position: 'right', name: 'Nalar', logo: 'N',
    logoUrl: host + '/brand/favicon-48.png', showTrace: true, greeting: null };

  fetch(host + '/api/chat/' + encodeURIComponent(key))
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (cfg) {
      var t = (cfg && cfg.themeConfig) || {};
      // sapaan datang dari kolom chatbot, di luar themeConfig
      if (cfg && cfg.greeting) T.greeting = cfg.greeting;
      if (t.brand) {
        if (t.brand.name) T.name = t.brand.name;
        if (t.brand.logo) { T.logo = t.brand.logo; T.logoUrl = null; } // huruf kustom = mode huruf
        if (t.brand.logoUrl) T.logoUrl = t.brand.logoUrl;              // gambar kustom menang
      }
      if (t.theme) {
        var th = t.theme;
        if (th.signal) T.signal = th.signal;
        if (th.source) T.source = th.source;
        if (th.radius) T.radius = th.radius;
        if (th.mode) T.mode = th.mode;
        if (th.position) T.position = th.position;
        if (th.showTrace === false) T.showTrace = false;
      }
      render();
    })
    .catch(render);

  function render() {
    var dark = T.mode === 'dark';
    var bg = dark ? '#0F172A' : '#FFFFFF', panel = dark ? '#1E293B' : '#F8FAFC',
        card = dark ? '#1E293B' : '#FFFFFF', ink = dark ? '#F1F5F9' : '#0F172A',
        mut = dark ? '#94A3B8' : '#475569', line = dark ? '#334155' : '#D8E0EA',
        onSignal = '#FFFFFF';
    var rs = 'calc(' + T.radius + ' - 4px)';
    var side = T.position === 'left' ? 'left:20px;' : 'right:20px;';

    var css = document.createElement('style');
    css.textContent =
      '#nalar-embed *{box-sizing:border-box;font-family:Inter,"Segoe UI",system-ui,sans-serif}' +
      '#nalar-launch{position:fixed;bottom:20px;' + side + 'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;' +
        'display:grid;place-items:center;color:' + onSignal + ';background:' + T.signal + ';box-shadow:0 8px 26px rgba(15,23,42,.28)}' +
      '#nalar-panel{position:fixed;bottom:88px;' + side + 'width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);' +
        'background:' + bg + ';color:' + ink + ';border:1px solid ' + line + ';border-radius:' + T.radius + ';z-index:2147483000;display:none;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(15,23,42,.28)}' +
      '#nalar-panel.open{display:flex}' +
      '.nl-head{display:flex;align-items:center;gap:10px;padding:13px 15px;background:' + panel + ';border-bottom:1px solid ' + line + '}' +
      '.nl-logo{width:30px;height:30px;border-radius:' + rs + ';background:' + T.signal + ';color:' + onSignal + ';display:grid;place-items:center;font-weight:800}' +
      /* mode gambar: mark N biru butuh latar terang, bukan kotak biru */
      '.nl-logo.im{background:#fff;border:1px solid ' + line + '}' +
      '.nl-logo img{width:20px;height:20px;display:block}' +
      '.nl-title{font-weight:700;font-size:14px}.nl-title small{display:block;font-size:9.5px;color:' + mut + ';font-family:ui-monospace,monospace;letter-spacing:.1em}' +
      '.nl-x{margin-left:auto;background:none;border:1px solid ' + line + ';color:' + mut + ';width:28px;height:28px;border-radius:6px;cursor:pointer}' +
      '.nl-msgs{flex:1;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:11px}' +
      '.nl-m{font-size:13.5px;line-height:1.55}' +
      '.nl-u{align-self:flex-end;max-width:85%;background:' + T.signal + ';color:' + onSignal + ';padding:9px 12px;border-radius:' + rs + ';border-bottom-right-radius:3px}' +
      '.nl-a{align-self:stretch;background:' + card + ';border:1px solid ' + line + ';padding:11px 13px;border-radius:' + rs + '}' +
      '.nl-cite{font-family:ui-monospace,monospace;font-size:.7em;font-weight:700;color:' + T.source + ';border:1px solid ' + T.source + '55;border-radius:3px;padding:0 4px;margin:0 2px}' +
      /* footnote dokumen rujukan (jejak retrieval — motif brand) */
      '.nl-src{margin-top:10px;padding-top:8px;border-top:1px dashed ' + line + '}' +
      '.nl-src .r{display:flex;align-items:center;gap:7px;padding:2px 0;font-family:ui-monospace,monospace;font-size:10.5px;color:' + mut + '}' +
      '.nl-src .n{color:' + T.source + ';font-weight:700}' +
      '.nl-src .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.nl-src .s{color:' + T.source + '}' +
      /* indikator mengetik (titik tiga berdenyut) */
      '.nl-typing{display:inline-flex;gap:4px;padding:3px 0}' +
      '.nl-typing i{width:6px;height:6px;border-radius:50%;background:' + mut + ';animation:nlPulse 1.2s infinite}' +
      '.nl-typing i:nth-child(2){animation-delay:.2s}.nl-typing i:nth-child(3){animation-delay:.4s}' +
      '@keyframes nlPulse{0%,100%{opacity:1}50%{opacity:.3}}' +
      '@media (prefers-reduced-motion: reduce){.nl-typing i{animation:none;opacity:.6}}' +
      /* blok jawaban terstruktur (renderBlock) */
      '.nl-blk{margin:0 0 9px}.nl-blk:last-child{margin-bottom:0}' +
      '.nl-bt{margin:0}' +
      '.nl-bl{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:5px}' +
      '.nl-bc{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}' +
      '.nl-bcard{background:' + panel + ';border:1px solid ' + line + ';border-radius:' + rs + ';padding:9px 11px;display:flex;flex-direction:column;gap:3px}' +
      '.nl-bcard small{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:' + mut + '}' +
      '.nl-bcard b{font-size:14.5px;overflow-wrap:anywhere}' +
      '.nl-bcard p{margin:0;font-size:11.5px;color:' + mut + ';line-height:1.45}' +
      '.nl-bch{display:flex;flex-direction:column;gap:6px;background:' + panel + ';border:1px solid ' + line + ';border-radius:' + rs + ';padding:10px 12px}' +
      '.nl-bch .t{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:' + mut + '}' +
      '.nl-bch .r{display:grid;grid-template-columns:minmax(56px,32%) 1fr auto;align-items:center;gap:8px}' +
      '.nl-bch .l{font-size:10.5px;color:' + mut + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.nl-bch .tr{position:relative;height:10px;border-left:2px solid ' + line + '}' +
      '.nl-bch .b{display:block;height:100%;min-width:2px;background:' + T.signal + ';border-radius:0 3px 3px 0}' +
      '.nl-bch .v{font-family:ui-monospace,monospace;font-size:10px;color:' + ink + '}' +
      '.nl-inp{display:flex;gap:8px;padding:11px;border-top:1px solid ' + line + ';background:' + panel + '}' +
      '.nl-inp input{flex:1;background:' + bg + ';border:1px solid ' + line + ';color:' + ink + ';font-size:13.5px;padding:10px 12px;border-radius:' + rs + ';outline:none}' +
      '.nl-send{width:42px;border:none;border-radius:' + rs + ';background:' + T.signal + ';color:' + onSignal + ';cursor:pointer}' +
      '.nl-foot{text-align:center;font-family:ui-monospace,monospace;font-size:9px;color:' + mut + ';padding:6px 0 9px;background:' + panel + '}';
    document.head.appendChild(css);

    var wrap = document.createElement('div'); wrap.id = 'nalar-embed';
    var launch = document.createElement('button'); launch.id = 'nalar-launch';
    launch.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>';
    var panelEl = document.createElement('div'); panelEl.id = 'nalar-panel';
    panelEl.innerHTML =
      '<div class="nl-head"><div class="nl-logo' + (T.logoUrl ? ' im' : '') + '">' +
        (T.logoUrl ? '<img src="' + esc(T.logoUrl) + '" alt=""/>' : esc(T.logo)) + '</div>' +
        '<div class="nl-title">' + esc(T.name) + '<small>REASONING · SOURCED</small></div>' +
        '<button class="nl-x" aria-label="Tutup">&times;</button></div>' +
      '<div class="nl-msgs" id="nl-msgs"></div>' +
      '<div class="nl-inp"><input id="nl-input" placeholder="Tulis pertanyaan…" aria-label="Pesan"/>' +
        '<button class="nl-send" aria-label="Kirim"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></div>' +
      '<div class="nl-foot">🔒 SERVER-TO-SERVER · POWERED BY NALAR</div>';

    wrap.appendChild(launch); wrap.appendChild(panelEl); document.body.appendChild(wrap);
    var msgs = panelEl.querySelector('#nl-msgs');
    var input = panelEl.querySelector('#nl-input');
    // gambar logo gagal dimuat → jatuh mulus ke mode huruf, jangan kotak pecah
    var lg = panelEl.querySelector('.nl-logo img');
    if (lg) lg.onerror = function () {
      var box = lg.parentNode; box.className = 'nl-logo'; box.textContent = T.logo;
    };

    if (T.greeting) bubble('a', T.greeting);
    launch.onclick = function () { panelEl.classList.toggle('open'); if (panelEl.classList.contains('open')) input.focus(); };
    panelEl.querySelector('.nl-x').onclick = function () { panelEl.classList.remove('open'); };
    panelEl.querySelector('.nl-send').onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

    function bubble(role, text) {
      var d = document.createElement('div'); d.className = 'nl-m nl-' + role; d.textContent = text || '';
      msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
    }

    function send() {
      var v = input.value.trim(); if (!v) return; input.value = '';
      bubble('u', v);
      var el = bubble('a', '');
      /* Indikator mengetik: hidup sejak kirim, MENETAP di bawah blok yang
         sudah tampil (jawaban antar-blok bisa berjeda beberapa detik), dan
         baru lenyap saat `done`/error. Tanpanya bubble kosong terasa mati. */
      var typing = document.createElement('span');
      typing.className = 'nl-typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      el.appendChild(typing);
      function stopTyping() { if (typing.parentNode) typing.parentNode.removeChild(typing); }
      /* dokumen rujukan — ditampung dulu, dirender sebagai footnote saat done
         (chip [n] di jawaban menunjuk ke daftar ini). showTrace=false = sembunyi. */
      var sources = [];
      function renderSources() {
        if (!T.showTrace || !sources.length) return;
        var d = document.createElement('div'); d.className = 'nl-src';
        d.innerHTML = sources.map(function (s) {
          return '<div class="r"><span class="n">[' + s.n + ']</span>' +
            '<span class="t">' + esc(s.title || 'dokumen') + '</span>' +
            (typeof s.score === 'number' ? '<span class="s">' + s.score.toFixed(2) + '</span>' : '') + '</div>';
        }).join('');
        el.appendChild(d);
        msgs.scrollTop = msgs.scrollHeight;
      }
      fetch(host + '/api/chat/' + encodeURIComponent(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: v, conversationId: conversationId, visitorId: visitorId })
      }).then(function (res) {
        if (res.status === 429) { stopTyping(); el.textContent = 'Batas permintaan tercapai. Coba lagi sebentar.'; return; }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) { stopTyping(); return; }
            buf += dec.decode(r.value, { stream: true });
            var parts = buf.split('\n\n'); buf = parts.pop();
            parts.forEach(function (p) {
              var ev = (p.match(/event: (.*)/) || [])[1];
              var data = {}; try { data = JSON.parse((p.match(/data: (.*)/) || [])[1]); } catch (e) {}
              /* `meta` datang lebih dulu: simpan conversationId supaya seluruh
                 sesi widget jadi SATU riwayat percakapan (sebelumnya variabel
                 ini null selamanya dan tiap pesan jadi conversation baru). */
              if (ev === 'meta' && data.conversationId) { conversationId = data.conversationId; }
              else if (ev === 'sources') { sources = data || []; }
              /* jawaban tiba BLOK demi BLOK (text/list/cards/chart) — sudah
                 tervalidasi & bebas Markdown dari server; di sini murni render.
                 Blok masuk SEBELUM indikator agar titik-tiga tetap paling bawah. */
              else if (ev === 'block') { el.insertBefore(renderBlock(data), typing); msgs.scrollTop = msgs.scrollHeight; }
              else if (ev === 'done') { stopTyping(); renderSources(); }
              else if (ev === 'error') { stopTyping(); el.textContent = '⚠ ' + data.message; }
            });
            pump();
          });
        })();
      }).catch(function () { stopTyping(); el.textContent = '⚠ Gagal terhubung.'; });
    }
    function fmt(t) { return esc(t).replace(/\[(\d+)\]/g, '<span class="nl-cite">$1</span>'); }

    /* ── renderer blok (padanan vanilla dari answer-blocks.tsx) ──────
       text → paragraf · list → ol/ul · cards → kartu fakta ·
       chart → bar horizontal (satu seri, satu warna) / garis mini SVG. */
    function renderBlock(b) {
      var d = document.createElement('div'); d.className = 'nl-blk';
      if (b.type === 'text') {
        d.innerHTML = '<p class="nl-bt">' + fmt(b.text) + '</p>';
      } else if (b.type === 'list' && b.items) {
        var tag = b.ordered ? 'ol' : 'ul';
        d.innerHTML = '<' + tag + ' class="nl-bl">' + b.items.map(function (it) {
          return '<li>' + fmt(it) + '</li>';
        }).join('') + '</' + tag + '>';
      } else if (b.type === 'cards' && b.items) {
        d.innerHTML = '<div class="nl-bc">' + b.items.map(function (c) {
          return '<div class="nl-bcard">' +
            (c.title ? '<small>' + esc(c.title) + '</small>' : '') +
            '<b>' + fmt(c.value) + '</b>' +
            (c.desc ? '<p>' + fmt(c.desc) + '</p>' : '') + '</div>';
        }).join('') + '</div>';
      } else if (b.type === 'chart' && b.labels && b.values) {
        var max = 0; b.values.forEach(function (v) { max = Math.max(max, Math.abs(v)); }); max = max || 1;
        var unit = b.unit ? ' ' + esc(b.unit) : '';
        d.innerHTML = '<div class="nl-bch">' +
          (b.title ? '<small class="t">' + esc(b.title) + '</small>' : '') +
          b.labels.map(function (l, i) {
            var v = b.values[i];
            return '<div class="r" title="' + esc(l) + ': ' + v + unit + '">' +
              '<span class="l">' + esc(l) + '</span>' +
              '<span class="tr"><span class="b" style="width:' + (Math.abs(v) / max * 100) + '%"></span></span>' +
              '<span class="v">' + v + unit + '</span></div>';
          }).join('') + '</div>';
      } else {
        d.textContent = '';
      }
      return d;
    }
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
})();
