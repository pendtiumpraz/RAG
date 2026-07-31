/**
 * Nalar embed widget — production.
 *
 * DUA MODE, dipilih lewat data-mode:
 *
 *   bubble (bawaan)  gelembung mengambang di sudut halaman. Untuk chatbot
 *                    yang menemani isi situs — dibuka sambil lalu, satu sesi
 *                    berjalan, ditutup dan dilupakan.
 *     <script src=".../embed.js" data-chatbot="cb_live_xxx"></script>
 *
 *   inline           chat memenuhi sebuah elemen di halaman, lengkap dengan
 *                    DAFTAR SESI di samping. Untuk halaman yang chat-nya
 *                    memang isi utamanya — halaman bantuan, portal internal,
 *                    tautan yang dibagikan.
 *     <div id="chat" style="height:600px"></div>
 *     <script src=".../embed.js" data-chatbot="cb_live_xxx"
 *             data-mode="inline" data-target="#chat"></script>
 *
 * Mode inline sengaja memuat /c/<key> di dalam IFRAME, bukan menggambar
 * ulang seluruh antarmuka di sini. Halaman itu sudah ada, sudah membawa
 * daftar sesi, dan sudah memakai endpoint yang sama; menyalinnya ke JavaScript
 * biasa berarti dua antarmuka yang harus diperbaiki dua kali setiap kali ada
 * yang berubah — dan yang satu pasti tertinggal. Iframe juga memberi isolasi
 * gaya yang sempurna, hal yang di mode gelembung harus dikejar dengan
 * meng-scope setiap selektor ke #nalar-embed.
 *
 * Boot: GET /api/chat/<key> → themeConfig (white-label) → render launcher +
 * panel. Kirim: POST /api/chat/<key> (SSE) → jawaban streaming + sitasi.
 * API key TIDAK pernah ada di sini — hanya public key.
 */
(function () {
  var script = document.currentScript || document.querySelector('script[data-chatbot]');
  var key = script && script.getAttribute('data-chatbot');
  var host = new URL(script.src).origin;
  if (!key) { console.error('[nalar] data-chatbot wajib'); return; }

  /* ── MODE INLINE — pasang iframe, selesai ────────────────────────────
     Ditangani PALING AWAL supaya seluruh mesin gelembung di bawah (state
     sesi, CSS, pendengar peristiwa) tak pernah dibuat sama sekali pada
     halaman yang tak memakainya. */
  if ((script.getAttribute('data-mode') || '').toLowerCase() === 'inline') {
    var sel = script.getAttribute('data-target');
    /* Tanpa data-target, chat dipasang tepat di posisi <script>-nya. Itu
       tebakan yang benar untuk pemasangan paling sederhana, dan menolak
       memasang apa pun hanya akan membuat orang mengira embed-nya rusak. */
    var wadah = sel ? document.querySelector(sel) : null;
    if (sel && !wadah) {
      console.error('[nalar] data-target "' + sel + '" tidak ditemukan');
      return;
    }
    if (!wadah) {
      wadah = document.createElement('div');
      wadah.style.height = '600px';
      script.parentNode.insertBefore(wadah, script);
    }
    var f = document.createElement('iframe');
    f.src = host + '/c/' + encodeURIComponent(key);
    f.title = 'Chat';
    f.style.cssText = 'width:100%;height:100%;min-height:420px;border:0;display:block;'
      + 'border-radius:inherit;background:transparent';
    /* Kotak pasir dibuka seperlunya saja: skrip & form untuk antarmukanya,
       same-origin agar localStorage (visitorId) terbaca — tanpa itu setiap
       muat ulang jadi pengunjung baru dan daftar sesinya selalu kosong.
       allow-popups TIDAK diberikan: chatbot tak punya alasan membuka jendela,
       dan halaman pihak ketiga yang menyematkannya tak boleh bisa dipakai
       begitu. */
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
    f.setAttribute('loading', 'lazy');
    wadah.appendChild(f);
    return;
  }

  var visitorId = localStorage.getItem('nalar_visitor') ||
    (function () { var v = 'v_' + Math.random().toString(36).slice(2); localStorage.setItem('nalar_visitor', v); return v; })();
  /* Sesi disimpan PER CHATBOT: satu situs bisa memasang dua widget, dan
     memakai satu kunci bersama akan membuat keduanya saling menimpa
     percakapan. Umur dibatasi supaya percakapan basi tak dibangkitkan
     berbulan-bulan kemudian saat konteksnya sudah tak relevan. */
  var SESSION_KEY = 'nalar_convo_' + key;
  var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var conversationId = (function () {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.id || Date.now() - (v.at || 0) > SESSION_TTL_MS) {
        localStorage.removeItem(SESSION_KEY); return null;
      }
      return v.id;
    } catch (e) { return null; }
  })();
  function rememberSession(id) {
    conversationId = id;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, at: Date.now() })); } catch (e) {}
  }
  function forgetSession() {
    conversationId = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

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
      '.nl-new{margin-left:auto;background:none;border:1px solid ' + line + ';color:' + mut + ';width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.nl-new:hover{color:' + T.signal + ';border-color:' + T.signal + '}' +
      '.nl-x{margin-left:6px;background:none;border:1px solid ' + line + ';color:' + mut + ';width:28px;height:28px;border-radius:6px;cursor:pointer}' +
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
      /* multi-seri: batang berkelompok per label + legend wajib */
      '.nl-bch .r{grid-template-columns:minmax(56px,32%) 1fr}' +
      '.nl-bch .st{display:flex;flex-direction:column;gap:3px}' +
      '.nl-bch .st .tr{display:flex;align-items:center;gap:6px}' +
      '.nl-bch .st .b{flex:none}.nl-bch .st .v{flex:none}' +
      '.nl-blg{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:2px}' +
      '.nl-blg span{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;color:' + mut + '}' +
      '.nl-blg i{width:8px;height:8px;border-radius:2px;flex:none}' +
      /* blok tabel */
      '.nl-bcap{display:block;font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:' + mut + ';margin-bottom:6px}' +
      '.nl-btw{overflow-x:auto;border:1px solid ' + line + ';border-radius:' + rs + '}' +
      '.nl-bta{width:100%;border-collapse:collapse;font-size:11.5px}' +
      '.nl-bta th{text-align:left;font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:' + mut + ';background:' + panel + ';padding:6px 9px;border-bottom:1px solid ' + line + ';white-space:nowrap}' +
      '.nl-bta th:not(:first-child){text-align:right}' +
      '.nl-bta td{padding:6px 9px;border-bottom:1px solid ' + line + ';line-height:1.4;vertical-align:top}' +
      '.nl-bta tr:last-child td{border-bottom:0}' +
      '.nl-bta td.nm{font-weight:600}' +
      '.nl-bta td.num{text-align:right;white-space:nowrap;font-family:ui-monospace,monospace}' +
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
        '<button class="nl-new" aria-label="Mulai percakapan baru" title="Percakapan baru" style="display:none">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>' +
        '<button class="nl-x" aria-label="Tutup">&times;</button></div>' +
      '<div class="nl-msgs" id="nl-msgs"></div>' +
      '<div class="nl-inp"><input id="nl-input" placeholder="Tulis pertanyaan…" aria-label="Pesan"/>' +
        '<button class="nl-send" aria-label="Kirim"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></div>' +
      '<div class="nl-foot">🔒 SERVER-TO-SERVER · POWERED BY NALAR</div>';

    wrap.appendChild(launch); wrap.appendChild(panelEl); document.body.appendChild(wrap);
    var msgs = panelEl.querySelector('#nl-msgs');
    var input = panelEl.querySelector('#nl-input');
    var newBtn = panelEl.querySelector('.nl-new');
    // gambar logo gagal dimuat → jatuh mulus ke mode huruf, jangan kotak pecah
    var lg = panelEl.querySelector('.nl-logo img');
    if (lg) lg.onerror = function () {
      var box = lg.parentNode; box.className = 'nl-logo'; box.textContent = T.logo;
    };

    /* Riwayat dipulihkan dari SERVER, bukan dari localStorage.
       localStorage hanya menyimpan ID percakapannya. Menyimpan transkripnya
       sendiri akan menyimpang begitu ada tab kedua, dan menaruh isi
       percakapan pelanggan di penyimpanan browser situs pihak ketiga bukan
       tempat yang tepat untuk itu. */
    var restored = false;
    function restore(done) {
      if (!conversationId) { done(false); return; }
      fetch(host + '/api/chat/' + encodeURIComponent(key) + '/history'
        + '?conversationId=' + encodeURIComponent(conversationId)
        + '&visitorId=' + encodeURIComponent(visitorId))
        .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
        .then(function (j) {
          var list = (j && j.messages) || [];
          if (!list.length) { forgetSession(); done(false); return; }
          list.forEach(function (m) {
            if (m.role === 'user') { bubble('u', m.content); return; }
            var el = bubble('a', '');
            /* Jawaban lama disimpan sebagai blok terstruktur — dirender ulang
               dengan renderer yang sama persis, jadi percakapan yang dipulihkan
               tak pernah tampak berbeda dari yang baru. Pesan pra-fitur yang
               hanya punya teks polos jatuh ke teks biasa. */
            if (Array.isArray(m.blocks) && m.blocks.length) {
              m.blocks.forEach(function (b) { el.appendChild(renderBlock(b)); });
            } else { el.textContent = m.content || ''; }
          });
          restored = true;
          msgs.scrollTop = msgs.scrollHeight;
          done(true);
        })
        .catch(function () { done(false); });
    }

    restore(function (ok) {
      if (!ok && T.greeting) bubble('a', T.greeting);
      if (ok) newBtn.style.display = '';
    });

    /* Percakapan yang bertahan butuh jalan keluar: tanpa ini pengunjung
       terjebak selamanya di satu utas yang makin panjang dan makin mahal
       konteksnya. */
    function startNew() {
      forgetSession();
      msgs.innerHTML = '';
      newBtn.style.display = 'none';
      if (T.greeting) bubble('a', T.greeting);
      input.focus();
    }
    newBtn.onclick = startNew;

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
        /* 429 dipakai DUA batas yang berbeda, dan dulu keduanya dijawab
           "coba lagi sebentar". Untuk rate limit itu benar; untuk kuota
           bulanan keliru — ia tak pulih sampai tanggal 1, dan pengunjung yang
           memercayainya akan mencoba lagi sepanjang sisa bulan.

           Yang membedakan keduanya ada di SERVER (badan respons memuat `kode`
           dan kalimat yang sesuai), dan widget menampilkannya apa adanya.
           Menyalin kalimatnya ke sini berarti widget yang sudah terpasang di
           situs pelanggan tak pernah ikut berubah saat kalimatnya diperbaiki —
           dan widget itulah yang paling tak bisa kita perbarui. */
        if (res.status === 429) {
          stopTyping();
          res.json().then(function (j) {
            el.textContent = (j && j.error) || 'Batas permintaan tercapai.';
          }).catch(function () {
            el.textContent = 'Batas permintaan tercapai.';
          });
          return;
        }
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
              if (ev === 'meta' && data.conversationId) { rememberSession(data.conversationId); }
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
      } else if (b.type === 'table' && b.headers && b.rows) {
        /* Tabel bergulir DI DALAM wadahnya — panel widget sempit, dan badan
           panel tak boleh pernah bergulir mendatar. */
        d.innerHTML = (b.title ? '<small class="nl-bcap">' + esc(b.title) + '</small>' : '') +
          '<div class="nl-btw"><table class="nl-bta"><thead><tr>' +
          b.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          b.rows.map(function (r) {
            return '<tr>' + r.map(function (c, j) {
              return '<td class="' + (j === 0 ? 'nm' : 'num') + '">' + fmt(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
      } else if (b.type === 'chart' && b.labels) {
        /* Bentuk lama (satu `values`) tetap dirender: blok yang tersimpan
           sebelum multi-seri harus tampil sama seperti dulu. */
        var series = (b.series && b.series.length)
          ? b.series
          : (b.values ? [{ name: b.title || 'Nilai', values: b.values }] : []);
        if (!series.length) { d.textContent = ''; return d; }

        /* Urutan warna SAMA dengan SERIES_COLORS di answer-blocks.tsx —
           sudah lolos validator keterbacaan buta warna. */
        var COLORS = ['#3B82F6', '#D97706', '#8B5CF6', '#059669'];
        var max = 0;
        series.forEach(function (s) {
          s.values.forEach(function (v) { max = Math.max(max, Math.abs(v)); });
        });
        max = max || 1;
        var unit = b.unit ? ' ' + esc(b.unit) : '';

        /* Legend wajib begitu seri >1 — identitas tak boleh warna semata. */
        var legend = series.length > 1
          ? '<div class="nl-blg">' + series.map(function (s, si) {
              return '<span><i style="background:' + COLORS[si % COLORS.length] + '"></i>' +
                esc(s.name) + '</span>';
            }).join('') + '</div>'
          : '';

        d.innerHTML = '<div class="nl-bch">' +
          (b.title ? '<small class="t">' + esc(b.title) + '</small>' : '') + legend +
          b.labels.map(function (l, i) {
            var bars = series.map(function (s, si) {
              var v = s.values[i];
              return '<span class="tr" title="' + esc(s.name) + ' · ' + esc(l) + ': ' + v + unit + '">' +
                '<span class="b" style="width:' + (Math.abs(v) / max * 100) + '%;background:' +
                COLORS[si % COLORS.length] + '"></span>' +
                '<span class="v">' + v + unit + '</span></span>';
            }).join('');
            return '<div class="r"><span class="l">' + esc(l) + '</span>' +
              '<span class="st">' + bars + '</span></div>';
          }).join('') + '</div>';
      } else {
        d.textContent = '';
      }
      return d;
    }
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
})();
