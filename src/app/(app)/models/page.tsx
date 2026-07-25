'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, ErrorState, useToast } from '../../_components/ui';

interface LlmModel { id: string; label: string; provider: string }
interface EmbModel { id: string; label: string; bucket: string }
interface Catalog {
  llmModels: LlmModel[]; embeddingModels: EmbModel[]; providers: string[];
  active: { activeLlmModel: string; activeEmbeddingModel: string; systemPrompt: string | null } | null;
}

export default function ModelsPage() {
  const { data, loading, error, refetch } = useApi<Catalog>('/api/settings');
  const [llm, setLlm] = useState(''); const [emb, setEmb] = useState('');
  const [prompt, setPrompt] = useState(''); const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!data) return;
    setLlm(data.active?.activeLlmModel ?? data.llmModels[0]?.id ?? '');
    setEmb(data.active?.activeEmbeddingModel ?? data.embeddingModels[0]?.id ?? '');
    setPrompt(data.active?.systemPrompt ?? '');
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({
        activeLlmModel: llm, activeEmbeddingModel: emb, systemPrompt: prompt,
        apiKeys: Object.fromEntries(Object.entries(keys).filter(([, v]) => v)),
      }) });
      toast('Pengaturan tersimpan'); setKeys({}); refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (loading || !data) return <div className="card"><Skeleton rows={4} /></div>;

  const buckets = { small: [] as EmbModel[], large: [] as EmbModel[], api: [] as EmbModel[] };
  data.embeddingModels.forEach((m) => buckets[m.bucket as keyof typeof buckets]?.push(m));

  return (
    <>
      <div className="page-head">
        <div><h1>Models &amp; Keys</h1><p className="sub">Satu model chat &amp; satu embedding aktif per tenant. API key disimpan terenkripsi, dipakai server-to-server.</p></div>
        <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} onClick={save} disabled={busy}>Simpan</button>
      </div>

      <div className="grid g2">
        <div className="stack gap-4">
          <div className="card"><div className="panel-head"><span className="t">model chat aktif</span><span className="badge badge-signal">1 aktif</span></div>
            <div className="card-pad"><div className="field"><label>Model</label>
              <select className="select" value={llm} onChange={(e) => setLlm(e.target.value)}>
                {data.llmModels.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>)}
              </select></div></div></div>

          <div className="card"><div className="panel-head"><span className="t">model embedding aktif</span><span className="badge badge-source">1 aktif</span></div>
            <div className="card-pad"><div className="field"><label>Model</label>
              <select className="select" value={emb} onChange={(e) => setEmb(e.target.value)}>
                {/* Ukuran nyata ada di label tiap model (dari registry) — jangan
                    menuliskannya lagi di sini supaya tak pernah bertentangan. */}
                <optgroup label="Lokal — ringan">{buckets.small.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
                <optgroup label="Lokal — akurasi tinggi">{buckets.large.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
                <optgroup label="API">{buckets.api.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              </select></div></div></div>

          <div className="card"><div className="panel-head"><span className="t">system prompt</span></div>
            <div className="card-pad"><div className="field"><label>Instruksi</label>
              <textarea className="textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div></div></div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="panel-head"><span className="t">provider api keys</span><span className="microlabel">AES-256 · SERVER-ONLY</span></div>
          <div className="card-pad stack gap-4">
            {data.providers.map((p) => (
              <div className="field" key={p}><label>{p}</label>
                <input className="input mono" type="password" placeholder="tambah / ganti key…"
                  value={keys[p] ?? ''} onChange={(e) => setKeys({ ...keys, [p]: e.target.value })} /></div>
            ))}
            <p className="microlabel">KOSONGKAN UNTUK TIDAK MENGUBAH KEY YANG ADA.</p>
          </div>
        </div>
      </div>
    </>
  );
}
