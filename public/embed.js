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

  // default brand resmi; ditimpa themeConfig dari server
  var T = { signal: '#2563EB', signalStrong: '#1D4EDB', source: '#F59E0B', radius: '12px',
    mode: 'light', position: 'right', name: 'Nalar', logo: 'N', showTrace: true, greeting: null };

  fetch(host + '/api/chat/' + encodeURIComponent(key))
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (cfg) {
      var t = (cfg && cfg.themeConfig) || {};
      if (t.brand) { if (t.brand.name) T.name = t.brand.name; if (t.brand.logo) T.logo = t.brand.logo; }
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
      '.nl-title{font-weight:700;font-size:14px}.nl-title small{display:block;font-size:9.5px;color:' + mut + ';font-family:ui-monospace,monospace;letter-spacing:.1em}' +
      '.nl-x{margin-left:auto;background:none;border:1px solid ' + line + ';color:' + mut + ';width:28px;height:28px;border-radius:6px;cursor:pointer}' +
      '.nl-msgs{flex:1;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:11px}' +
      '.nl-m{font-size:13.5px;line-height:1.55}' +
      '.nl-u{align-self:flex-end;max-width:85%;background:' + T.signal + ';color:' + onSignal + ';padding:9px 12px;border-radius:' + rs + ';border-bottom-right-radius:3px}' +
      '.nl-a{align-self:stretch;background:' + card + ';border:1px solid ' + line + ';padding:11px 13px;border-radius:' + rs + '}' +
      '.nl-cite{font-family:ui-monospace,monospace;font-size:.7em;font-weight:700;color:' + T.source + ';border:1px solid ' + T.source + '55;border-radius:3px;padding:0 4px;margin:0 2px}' +
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
      '<div class="nl-head"><div class="nl-logo">' + esc(T.logo) + '</div>' +
        '<div class="nl-title">' + esc(T.name) + '<small>REASONING · SOURCED</small></div>' +
        '<button class="nl-x" aria-label="Tutup">&times;</button></div>' +
      '<div class="nl-msgs" id="nl-msgs"></div>' +
      '<div class="nl-inp"><input id="nl-input" placeholder="Tulis pertanyaan…" aria-label="Pesan"/>' +
        '<button class="nl-send" aria-label="Kirim"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></div>' +
      '<div class="nl-foot">🔒 SERVER-TO-SERVER · POWERED BY NALAR</div>';

    wrap.appendChild(launch); wrap.appendChild(panelEl); document.body.appendChild(wrap);
    var msgs = panelEl.querySelector('#nl-msgs');
    var input = panelEl.querySelector('#nl-input');

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
      var el = bubble('a', ''); var full = '';
      fetch(host + '/api/chat/' + encodeURIComponent(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: v, conversationId: conversationId, visitorId: visitorId })
      }).then(function (res) {
        if (res.status === 429) { el.textContent = 'Batas permintaan tercapai. Coba lagi sebentar.'; return; }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var parts = buf.split('\n\n'); buf = parts.pop();
            parts.forEach(function (p) {
              var ev = (p.match(/event: (.*)/) || [])[1];
              var data = {}; try { data = JSON.parse((p.match(/data: (.*)/) || [])[1]); } catch (e) {}
              if (ev === 'delta') { full += data.text; el.innerHTML = fmt(full); msgs.scrollTop = msgs.scrollHeight; }
              else if (ev === 'error') { el.textContent = '⚠ ' + data.message; }
            });
            pump();
          });
        })();
      }).catch(function () { el.textContent = '⚠ Gagal terhubung.'; });
    }
    function fmt(t) { return esc(t).replace(/\[(\d+)\]/g, '<span class="nl-cite">$1</span>'); }
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
})();
