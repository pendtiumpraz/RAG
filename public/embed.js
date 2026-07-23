/**
 * Embeddable chatbot widget.
 *
 * Drop this on ANY website:
 *   <script src="https://YOUR-RAG-HOST/embed.js"
 *           data-chatbot="cb_live_xxxxx"
 *           data-color="#4f46e5"></script>
 *
 * The `data-chatbot` value is the chatbot's public key. Different key ⇒
 * different chatbot ⇒ different, isolated knowledge base. The widget
 * streams responses from POST /api/chat/<publicKey> over SSE and renders
 * them token-by-token in the chat bubble.
 */
(function () {
  var script = document.currentScript;
  var chatbotKey = script.getAttribute('data-chatbot');
  var color = script.getAttribute('data-color') || '#4f46e5';
  var host = new URL(script.src).origin;
  if (!chatbotKey) { console.error('[rag-embed] missing data-chatbot'); return; }

  var conversationId = null;
  var visitorId = localStorage.getItem('rag_visitor') ||
    (function () { var v = 'v_' + Math.random().toString(36).slice(2); localStorage.setItem('rag_visitor', v); return v; })();

  // ── UI ────────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent =
    '.rag-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:' + color + ';color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:2147483000}' +
    '.rag-panel{position:fixed;bottom:88px;right:20px;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:system-ui,sans-serif}' +
    '.rag-panel.open{display:flex}' +
    '.rag-head{background:' + color + ';color:#fff;padding:14px 16px;font-weight:600}' +
    '.rag-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f7f7f9}' +
    '.rag-m{padding:9px 12px;border-radius:12px;max-width:82%;font-size:14px;line-height:1.4;white-space:pre-wrap}' +
    '.rag-user{align-self:flex-end;background:' + color + ';color:#fff}' +
    '.rag-bot{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;color:#111}' +
    '.rag-input{display:flex;border-top:1px solid #eee;padding:8px}' +
    '.rag-input input{flex:1;border:none;outline:none;padding:10px;font-size:14px}' +
    '.rag-input button{background:' + color + ';color:#fff;border:none;border-radius:8px;padding:0 14px;cursor:pointer}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.className = 'rag-btn'; btn.innerHTML = '&#128172;';
  var panel = document.createElement('div');
  panel.className = 'rag-panel';
  panel.innerHTML =
    '<div class="rag-head">Chat</div>' +
    '<div class="rag-msgs" id="rag-msgs"></div>' +
    '<form class="rag-input"><input placeholder="Type a message..." autocomplete="off"/><button type="submit">Send</button></form>';
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var msgs = panel.querySelector('#rag-msgs');
  var form = panel.querySelector('form');
  var input = panel.querySelector('input');

  btn.onclick = function () { panel.classList.toggle('open'); };

  function bubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'rag-m ' + cls; d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  form.onsubmit = async function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text) return;
    input.value = '';
    bubble('rag-user', text);
    var botEl = bubble('rag-bot', '');

    var res = await fetch(host + '/api/chat/' + chatbotKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, conversationId: conversationId, visitorId: visitorId }),
    });

    // Parse the SSE stream and append deltas as they arrive.
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var parts = buf.split('\n\n'); buf = parts.pop();
      for (var i = 0; i < parts.length; i++) {
        var lines = parts[i].split('\n');
        var ev = (lines[0] || '').replace('event: ', '');
        var data = {};
        try { data = JSON.parse((lines[1] || '').replace('data: ', '')); } catch (_) {}
        if (ev === 'delta') { botEl.textContent += data.text; msgs.scrollTop = msgs.scrollHeight; }
        else if (ev === 'error') { botEl.textContent = '⚠ ' + data.message; }
      }
    }
  };
})();
