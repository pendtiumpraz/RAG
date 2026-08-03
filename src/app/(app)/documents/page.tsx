'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Select } from '../../_components/select';
import { Skeleton, ErrorState, EmptyState, useToast, Field, Drawer } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';
import { AnswerBlocks } from '../../_components/answer-blocks';
import { plainTextToBlocks } from '@/modules/chat/blocks';
import { abstrakBersih, ringkasanBersih } from '@/modules/memory/ringkasan';

interface Doc {
  docRef: string; title: string | null;
  knowledgeBaseId: string; knowledgeBaseName: string | null;
  chunks: number; updatedAt: string | null;
  summary: string | null; category: string | null;
  noteStatus: string | null; noteId: string | null;
}
interface Page { rows: Doc[]; more: boolean; page: number; pageSize: number }
interface Kb { id: string; name: string }
interface Cat { slug: string; label: string; color: string; shape: string; status: string }

/** Penanda kategori — bentuknya SAMA dengan node di graf Memory. */
function Swatch({ color, shape, size = 11 }: { color: string; shape: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden style={{ flex: '0 0 auto' }}>
      {shape === 'square' ? <rect x="1.5" y="1.5" width="9" height="9" fill={color} />
        : shape === 'triangle' ? <polygon points="6,1 11,10.5 1,10.5" fill={color} />
        : shape === 'diamond' ? <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill={color} />
        : <circle cx="6" cy="6" r="5" fill={color} />}
    </svg>
  );
}

/* Pratinjau tabel dan isi laci kini memakai pembersih YANG SAMA
   (modules/memory/ringkasan.ts). Sebelumnya masing-masing punya aturannya
   sendiri, dan yang di tabel hanya membuang frontmatter — sehingga
   `**tebal**` dan `[[wikilink]]` lolos apa adanya ke layar. */

export default function DocumentsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kbId, setKbId] = useState('');
  const [cat, setCat] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Doc | null>(null);
  /* Urutan dikerjakan SERVER, bukan di peramban: daftar ini berhalaman, dan
     mengurutkan 20 baris yang kebetulan tampil bukan mengurutkan apa pun —
     ia hanya menata ulang potongan yang sudah dipilih server. */
  const [urut, setUrut] = useState<{ kunci: string; arah: 'naik' | 'turun' } | null>(null);

  function klikKolom(kunci: string) {
    setPage(0);
    setUrut((u) => (u?.kunci !== kunci ? { kunci, arah: 'naik' }
      : u.arah === 'naik' ? { kunci, arah: 'turun' } : null));
  }
  function KolomUrut({ kunci, children, num }: { kunci: string; children: React.ReactNode; num?: boolean }) {
    const on = urut?.kunci === kunci;
    return (
      <th className={num ? 'num' : undefined}
        aria-sort={on ? (urut!.arah === 'naik' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`th-urut${on ? ' on' : ''}`} onClick={() => klikKolom(kunci)}>
          <span>{children}</span>
          <i aria-hidden className="th-arah">{on ? (urut!.arah === 'naik' ? '▲' : '▼') : '↕'}</i>
        </button>
      </th>
    );
  }

  // Menembak satu permintaan per ketikan akan membanjiri database pada korpus
  // besar; jeda 300 ms membuat pencarian tetap terasa langsung tanpa itu.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const kbs = useApi<Kb[]>('/api/knowledge-bases');
  const cats = useApi<Cat[]>('/api/categories');
  const url = `/api/documents/summaries?page=${page}`
    + (debounced ? `&q=${encodeURIComponent(debounced)}` : '')
    + (kbId ? `&knowledgeBaseId=${kbId}` : '')
    + (cat ? `&category=${cat}` : '')
    + (urut ? `&urut=${urut.kunci}&arah=${urut.arah}` : '');
  const docs = useApi<Page>(url);
  const dups = useApi<Array<Record<string, unknown>>>(
    `/api/documents/duplicates${kbId ? `?knowledgeBaseId=${kbId}` : ''}`);

  const catBySlug = new Map((cats.data ?? []).map((c) => [c.slug, c]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dokumen</h1>
          <p className="sub">Cari berkas yang sudah masuk knowledge base, lihat ringkasannya.</p>
        </div>
      </div>

      {/* Berkas kembar DITAMPILKAN, bukan disembunyikan: kalau sebuah berkas
          hilang begitu saja, pemiliknya akan mengira sync-nya gagal — dan tak
          ada cara mengetahui bedanya. */}
      {(dups.data?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <span className="t">berkas kembar dilewati</span>
            <span className="badge">{dups.data!.length}</span>
          </div>
          <div className="card-pad stack gap-3">
            <p className="sub" style={{ margin: 0 }}>
              Berkas berikut isinya sama persis dengan berkas yang sudah lebih dulu masuk,
              jadi tidak di-ingest ulang — menghemat biaya embedding dan penyimpanan,
              sekaligus mencegah jawaban mengutip kalimat yang sama berkali-kali.
              Isinya tetap bisa ditemukan lewat berkas aslinya.
            </p>
            {/* Dulu tabel ini memotong di 50 baris dan hanya MEMBERI TAHU ada
                sisanya — tanpa satu pun jalan melihatnya. Sekarang seluruhnya
                bisa ditelusuri. */}
            <TabelKembar rows={dups.data!} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-pad stack gap-4">
          <div className="cluster gap-2">
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="input" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Cari judul, isi, atau ringkasan — mis. perjanjian sewa, NIB, cuti tahunan"
                style={{ paddingLeft: 34 }}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
                <Icon name="search" size={15} />
              </span>
            </div>
            <Select style={{ width: 190 }} value={kbId} onChange={(e) => { setKbId(e.target.value); setPage(0); }}>
              <option value="">Semua knowledge base</option>
              {(kbs.data ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
            <Select style={{ width: 190 }} value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }}>
              <option value="">Semua kategori</option>
              {(cats.data ?? []).filter((c) => c.status === 'active')
                .map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </Select>
          </div>

          {docs.error ? <ErrorState message={docs.error} onRetry={docs.refetch} />
            : docs.loading && !docs.data ? <Skeleton rows={5} />
            : !docs.data?.rows.length
              ? <EmptyState
                  title={debounced ? 'Tak ada dokumen yang cocok' : 'Belum ada dokumen'}
                  hint={debounced
                    ? 'Coba kata kunci lain, atau longgarkan penyaring knowledge base / kategori.'
                    : 'Tambahkan sumber di Knowledge Base, lalu jalankan sync.'} />
              : (
                <>
                  <div className="table-wrap"><table className="table">
                    <thead><tr>
                      <th className="col-no">#</th>
                      <KolomUrut kunci="title">Dokumen</KolomUrut>
                      <th>Ringkasan</th>
                      <KolomUrut kunci="category">Kategori</KolomUrut>
                      <KolomUrut kunci="knowledgeBaseName">Knowledge base</KolomUrut>
                      <KolomUrut kunci="chunks" num>Potongan</KolomUrut>
                      <th />
                    </tr></thead>
                    <tbody>
                      {docs.data.rows.map((d, i) => {
                        const c = d.category ? catBySlug.get(d.category) : null;
                        const abstrak = abstrakBersih(d.summary);
                        return (
                          <tr key={`${d.knowledgeBaseId}:${d.docRef}`}>
                            {/* Nomornya GLOBAL — dihitung dari halaman & besar
                                halaman yang dikirim server, bukan dari indeks
                                baris. Baris pertama halaman 2 bernomor 21. */}
                            <td className="col-no">
                              {(docs.data!.page * docs.data!.pageSize + i + 1).toLocaleString('id-ID')}
                            </td>
                            <td style={{ maxWidth: 260 }}>
                              <b style={{ wordBreak: 'break-word' }}>{d.title ?? d.docRef}</b>
                              {d.updatedAt && (
                                <div className="microlabel" style={{ marginTop: 3 }}>
                                  {new Date(d.updatedAt).toLocaleDateString('id-ID')}
                                </div>
                              )}
                            </td>
                            <td style={{ maxWidth: 380, color: abstrak ? undefined : 'var(--muted)' }}>
                              {abstrak
                                ? <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{abstrak}</span>
                                /* Dokumen tanpa ringkasan TIDAK disembunyikan — ia
                                   ada di knowledge base dan tetap bisa dicari lewat
                                   isinya; yang belum ada cuma ringkasannya. */
                                : <span className="microlabel">BELUM DIRINGKAS — JALANKAN MEMORY AGENT</span>}
                              {d.noteStatus === 'pending' && (
                                <span className="badge badge-source" style={{ marginLeft: 6 }}>menunggu tinjauan</span>
                              )}
                            </td>
                            <td>
                              {c ? (
                                <span className="cluster gap-2" style={{ display: 'inline-flex' }}>
                                  <Swatch color={c.color} shape={c.shape} />{c.label}
                                </span>
                              ) : <span className="microlabel">—</span>}
                            </td>
                            <td>{d.knowledgeBaseName ?? '—'}</td>
                            <td className="num">{d.chunks}</td>
                            <td>
                              <button className="btn btn-sm" onClick={() => setOpen(d)} disabled={!d.summary}>
                                Lihat ringkasan
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>

                  <div className="cluster" style={{ justifyContent: 'space-between' }}>
                    <span className="microlabel">HALAMAN {page + 1}</span>
                    <div className="cluster gap-2">
                      <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
                      <button className="btn btn-sm" disabled={!docs.data.more} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
                    </div>
                  </div>
                </>
              )}
        </div>
      </div>

      {open && (
        <SummaryDrawer
          doc={open} kbs={kbs.data ?? []}
          onClose={() => setOpen(null)}
          onMoved={() => { setOpen(null); docs.refetch(); kbs.refetch(); }}
        />
      )}
    </>
  );
}

type Kembar = Record<string, unknown>;
const teks = (v: unknown) => (v == null ? '' : String(v));

const OPSI_KEMBAR: OpsiTabel<Kembar> = {
  cari: (d) => [teks(d.title), teks(d.externalId), teks(d.canonicalDocRef)],
  saring: { reason: (d) => teks(d.reason) },
  urut: {
    title: (d) => teks(d.title ?? d.externalId),
    canonical: (d) => teks(d.canonicalDocRef),
    size: (d) => Number(d.sizeBytes ?? 0),
  },
};

function TabelKembar({ rows }: { rows: Kembar[] }) {
  const t = useTabel(rows, OPSI_KEMBAR);
  return (
    <div className="stack gap-3">
      <TabelAlat
        t={t} rows={rows} cariLabel="Cari berkas kembar"
        saring={[{ kunci: 'reason', label: 'Semua sebab', lebar: 170, pilihan: [
          { nilai: 'name-size', label: 'Nama + ukuran' },
          { nilai: 'content', label: 'Isi identik' },
        ] }]}
      />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="title">Berkas dilewati</Th>
          <Th t={t} kunci="canonical">Sama dengan</Th>
          <th>Terdeteksi lewat</th>
          <Th t={t} kunci="size" num>Ukuran</Th>
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={5} />
          {t.hasil.tampil.map((d, i) => (
            <tr key={teks(d.id)}>
              <TdNo n={t.nomor(i)} />
              <td style={{ wordBreak: 'break-word' }}>{teks(d.title ?? d.externalId) || '—'}</td>
              <td style={{ wordBreak: 'break-word', color: 'var(--muted)' }}>{teks(d.canonicalDocRef)}</td>
              <td>
                <span className="badge">
                  {d.reason === 'name-size' ? 'nama + ukuran' : 'isi identik'}
                </span>
              </td>
              <td className="num">{d.sizeBytes ? `${Math.round(Number(d.sizeBytes) / 1024)} KB` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="berkas" />
    </div>
  );
}

function SummaryDrawer({ doc, kbs, onClose, onMoved }: {
  doc: Doc; kbs: Kb[]; onClose: () => void; onMoved: () => void;
}) {
  const toast = useToast();
  const [tujuan, setTujuan] = useState('');
  const [pindah, setPindah] = useState(false);

  async function lakukanPindah() {
    setPindah(true);
    try {
      const r = await api<{ potongan: number; tujuan: string }>('/api/documents/move', {
        method: 'POST',
        body: JSON.stringify({ docRef: doc.docRef, dariKbId: doc.knowledgeBaseId, keKbId: tujuan }),
      });
      toast(`${r.potongan} potongan dipindah ke ${r.tujuan}`);
      onMoved();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setPindah(false); }
  }

  /* Dirender jadi BLOK, bukan ditempel sebagai teks. Sebelumnya isinya
     ditampilkan dengan white-space:pre-wrap, sehingga "# Judul", "**tebal**",
     dan "[[wikilink]]" tampil apa adanya di layar — pengguna melihat penanda
     Markdown mentah dan menyangka ringkasannya rusak. */
  const teks = ringkasanBersih(doc.summary);
  const blok = plainTextToBlocks(teks);
  return (
    <>
      <Drawer onClose={onClose} label="Ringkasan dokumen">
        <div className="dh">
          <h3 style={{ wordBreak: 'break-word' }}>{doc.title ?? doc.docRef}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button>
        </div>
        <div className="db stack gap-4">
          <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
            <span className="badge">{doc.chunks} potongan</span>
            {doc.knowledgeBaseName && <span className="badge">{doc.knowledgeBaseName}</span>}
            {doc.noteStatus === 'pending' && <span className="badge badge-source">menunggu tinjauan</span>}
          </div>
          <Field label="Ringkasan"><div className="card card-pad" style={{ background: 'var(--card-2)', lineHeight: 1.65 }}>
              {blok.length ? <AnswerBlocks blocks={blok} /> : 'Belum ada ringkasan.'}
            </div>
            <p className="microlabel" style={{ marginTop: 6 }}>
              DITULIS AI DARI ISI DOKUMEN — UNTUK GAMBARAN UMUM. ANGKA, TANGGAL, DAN NOMOR PASAL
              SELALU DIAMBIL DARI TEKS ASLI, BUKAN DARI RINGKASAN INI.
            </p></Field>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(teks); toast('Ringkasan disalin'); }}>
            Salin ringkasan
          </button>

          <Field label="Pindahkan ke knowledge base lain"
            hint="POTONGAN DAN VEKTOR LAPISAN PERTAMANYA IKUT PINDAH — ISINYA TIDAK DI-EMBED ULANG, JADI TAK ADA BIAYA TAMBAHAN.">
            <div className="cluster gap-2">
              <Select style={{ flex: 1 }} value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
                <option value="">Pilih knowledge base…</option>
                {kbs.filter((k) => k.id !== doc.knowledgeBaseId)
                  .map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </Select>
              <button className={`btn${pindah ? ' is-loading' : ''}`}
                disabled={!tujuan || pindah} onClick={lakukanPindah}>Pindahkan</button>
            </div>
            <p className="microlabel" style={{ marginTop: 6 }}>
              {/* Dikatakan DI MUKA, bukan hanya saat ditolak: yang menemukan
                  sendiri bahwa pemindahannya batal setelah sync berikutnya
                  akan menyimpulkan fiturnya rusak, bukan bahwa sumbernya yang
                  harus dipindah. */}
              DOKUMEN YANG DIMILIKI SUMBER TERSINKRON BERULANG (DRIVE, ONEDRIVE, SHAREPOINT, S3,
              URL, NOTION, SLACK) TAK BISA DIPINDAH SENDIRI — SYNC BERIKUTNYA AKAN MENARIKNYA
              KEMBALI. PINDAHKAN SUMBERNYA.
            </p>
          </Field>
        </div>
        <div className="df"><button className="btn" style={{ flex: 1 }} onClick={onClose}>Tutup</button></div>
      </Drawer>
    </>
  );
}
