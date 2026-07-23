'use client';

import { useEffect, useState } from 'react';

interface Catalog {
  llmModels: Array<{ id: string; label: string; provider: string }>;
  embeddingModels: Array<{ id: string; label: string; bucket: string; provider?: string }>;
  providers: string[];
  active: { activeLlmModel: string; activeEmbeddingModel: string; systemPrompt?: string } | null;
}

export default function SettingsPage() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [llm, setLlm] = useState('');
  const [emb, setEmb] = useState('');
  const [prompt, setPrompt] = useState('');
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d: Catalog) => {
      setCat(d);
      setLlm(d.active?.activeLlmModel ?? d.llmModels[0]?.id ?? '');
      setEmb(d.active?.activeEmbeddingModel ?? d.embeddingModels[0]?.id ?? '');
      setPrompt(d.active?.systemPrompt ?? '');
    });
  }, []);

  async function save() {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeLlmModel: llm, activeEmbeddingModel: emb, systemPrompt: prompt, apiKeys: keys }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!cat) return <main style={box}>Loading…</main>;

  // group embedding models into the three buckets the user asked for
  const buckets: Record<string, typeof cat.embeddingModels> = { small: [], large: [], api: [] };
  cat.embeddingModels.forEach((m) => buckets[m.bucket].push(m));

  return (
    <main style={box}>
      <h1>Settings</h1>

      <section style={card}>
        <h3>Active chat model (only one)</h3>
        <select value={llm} onChange={(e) => setLlm(e.target.value)} style={select}>
          {cat.llmModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>
          ))}
        </select>
      </section>

      <section style={card}>
        <h3>Active embedding model (only one)</h3>
        <select value={emb} onChange={(e) => setEmb(e.target.value)} style={select}>
          <optgroup label="~80MB — fast, local">
            {buckets.small.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
          <optgroup label="~2GB — high accuracy, local">
            {buckets.large.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
          <optgroup label="API — OpenAI / Cohere">
            {buckets.api.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
        </select>
      </section>

      <section style={card}>
        <h3>Provider API keys (stored encrypted)</h3>
        {cat.providers.map((p) => (
          <div key={p} style={{ display: 'flex', gap: 8, margin: '6px 0', alignItems: 'center' }}>
            <label style={{ width: 100 }}>{p}</label>
            <input
              type="password" placeholder="sk-…"
              value={keys[p] ?? ''}
              onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
              style={{ ...select, flex: 1 }}
            />
          </div>
        ))}
      </section>

      <section style={card}>
        <h3>System prompt</h3>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} style={{ ...select, width: '100%' }} />
      </section>

      <button onClick={save} style={btn}>Save</button>
      {saved && <span style={{ marginLeft: 12, color: '#34d399' }}>Saved ✓</span>}
    </main>
  );
}

const box: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '40px 24px' };
const card: React.CSSProperties = { background: '#16161d', border: '1px solid #26262f', borderRadius: 12, padding: 18, margin: '16px 0' };
const select: React.CSSProperties = { background: '#0b0b0f', color: '#e5e7eb', border: '1px solid #333', borderRadius: 8, padding: '10px', width: '100%' };
const btn: React.CSSProperties = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', cursor: 'pointer', fontSize: 15 };
