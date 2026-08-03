/**
 * OpenAPI 3.1 spec — SATU sumber kebenaran dokumentasi API Nalar.
 * Dilayani di GET /api/openapi (publik). Output Fase 03 (Loop: API docs).
 */

const sessionAuth = { cookieAuth: [] as string[] };
/** API publik pelanggan — Bearer nk_live_… (lihat /api/v1/*). */
const apiKeyAuth = { bearerAuth: [] as string[] };
const err = (desc: string) => ({ description: desc });
const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const obj = (props: Record<string, object>, required?: string[]) =>
  ({ type: 'object', properties: props, ...(required ? { required } : {}) });
const str = { type: 'string' }; const uuid = { type: 'string', format: 'uuid' };
const num = { type: 'number' }; const bool = { type: 'boolean' };

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Nalar API',
    version: '0.3.0',
    description:
      'RAG multi-tenant — reasoning, sourced. Semua endpoint ber-sesi terisolasi per tenant (RLS). ' +
      'Endpoint publik: /api/chat/{publicKey} (embed) & /api/openapi. ' +
      'Guardrails 5 lapis aktif di seluruh pipeline chat.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'next-auth.session-token',
        description: 'Sesi NextAuth (JWT berisi userId/tenantId/role).' },
      bearerAuth: { type: 'http', scheme: 'bearer',
        description: 'API key tenant: Authorization: Bearer nk_live_… (atau header X-Api-Key). Terbitkan di Settings → API key.' },
    },
    schemas: {
      Chatbot: obj({ id: uuid, name: str, publicKey: str, allowedOrigins: { type: 'array', items: str },
        greeting: str, themeConfig: { type: 'object' }, enabled: bool }),
      ThemeConfig: obj({ brand: obj({ name: str, logo: str }),
        theme: obj({ signal: str, source: str, radius: str, font: str, button: str, mode: str, position: str }) }),
      JobStatus: obj({ state: { type: 'string', enum: ['queued', 'running', 'done', 'failed'] },
        attempts: num, error: str }),
      Error: obj({ error: str }),
    },
  },
  paths: {
    /* ── publik ── */
    '/api/chat/{publicKey}': {
      get: {
        summary: 'Theme/white-label config widget (dibaca embed.js)',
        parameters: [{ name: 'publicKey', in: 'path', required: true, schema: str }],
        responses: { 200: { description: 'themeConfig chatbot', ...json({ $ref: '#/components/schemas/ThemeConfig' }) },
          403: err('Origin tidak diizinkan'), 404: err('Chatbot tidak ditemukan') },
      },
      post: {
        summary: 'Satu giliran chat RAG — jawaban distream sebagai SSE',
        description: 'Rate-limit 2 lapis (per-chatbot plan + per-IP) & kuota bulanan. ' +
          'Event SSE: delta {text}, done {}, error {message}.',
        parameters: [{ name: 'publicKey', in: 'path', required: true, schema: str }],
        requestBody: json(obj({ message: str, conversationId: uuid, visitorId: str }, ['message'])),
        responses: { 200: err('text/event-stream'), 429: err('Rate limit / kuota habis (Retry-After)'),
          413: err('Pesan > 4000 char'), 403: err('Origin tidak diizinkan') },
      },
    },
    '/api/openapi': { get: { summary: 'Spec ini', responses: { 200: err('OpenAPI JSON') } } },

    /* ── API PUBLIK PELANGGAN (v1) — auth: Bearer nk_live_… ──────────
       Permukaan stabil untuk sistem & agen milik pelanggan. Sengaja TIDAK
       memakai sesi: pemanggilnya mesin. Izin per kunci: read / write / chat
       (write sudah mencakup read).                                        */
    '/api/v1/me': {
      get: { summary: 'Identitas pemegang kunci + kuota berjalan', security: [apiKeyAuth],
        responses: { 200: err('{ tenant, key, plan, usage }'), 401: err('kunci tidak sah/dicabut/kedaluwarsa') } },
    },
    '/api/v1/chatbots': {
      get: { summary: 'Daftar chatbot tenant (termasuk publicKey)', security: [apiKeyAuth],
        responses: { 200: err('{ chatbots }'), 403: err('kunci tanpa izin read') } },
    },
    '/api/v1/conversations': {
      get: { summary: 'Daftar percakapan tenant — untuk ditarik SERVER pelanggan',
        security: [apiKeyAuth],
        description: 'Melengkapi /api/chat/{publicKey}/history, yang menuntut visitorId milik '
          + 'peramban DAN origin yang diizinkan sehingga hanya bisa dipanggil dari peramban '
          + 'pengunjung itu sendiri. Endpoint ini untuk mesin: menarik transkrip ke CRM, gudang '
          + 'data, atau arsip pelanggan. Paginasinya berbasis WAKTU (`sejak`), bukan offset — '
          + 'percakapan baru terus lahir, dan dengan offset penarik berkala melewatkan sebagian '
          + 'sambil menggandakan sebagian lain tanpa pernah tahu. Selama `adaLagi` bernilai true, '
          + 'ulangi permintaan dengan `sejak` = nilai `berikutnya`.',
        parameters: [
          { name: 'sejak', in: 'query', schema: str,
            description: 'ISO 8601. Hanya percakapan yang berubah SESUDAH waktu ini. '
              + 'Tanggal yang tak terbaca dijawab 400, bukan diabaikan — mengabaikannya '
              + 'membuat penarik yang salah format mengunduh ulang seluruh riwayat tiap kali.' },
          { name: 'chatbotId', in: 'query', schema: uuid },
          { name: 'limit', in: 'query', schema: { type: 'integer' },
            description: 'Bawaan 50, maksimum 200. Nilai di luar rentang dibulatkan, tidak ditolak.' },
        ],
        responses: { 200: err('{ conversations, adaLagi, berikutnya }'),
          400: err('parameter `sejak` bukan ISO 8601'), 403: err('kunci tanpa izin read') } },
    },
    '/api/v1/conversations/{id}': {
      get: { summary: 'Transkrip utuh satu percakapan (termasuk sitasi & blok jawaban)',
        security: [apiKeyAuth],
        description: '`citations` ikut karena jawaban tanpa rujukannya tak bisa diaudit '
          + 'belakangan — dan "kenapa ia menjawab begitu" selalu ditanyakan berbulan kemudian. '
          + 'Percakapan tenant lain dijawab 404, bukan 403: membedakan "tak ada" dari "bukan '
          + 'milikmu" membuat endpoint ini bisa dipakai memastikan sebuah id itu nyata.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ conversation }'), 404: err('tidak ditemukan') } },
    },
    '/api/v1/knowledge-bases': {
      get: { summary: 'Daftar knowledge base + jumlah potongan', security: [apiKeyAuth],
        responses: { 200: err('{ knowledgeBases }') } },
    },
    '/api/v1/documents': {
      get: { summary: 'Dokumen logis dalam KB (potongan dikelompokkan per `ref`)', security: [apiKeyAuth],
        parameters: [{ name: 'knowledgeBaseId', in: 'query', schema: uuid }],
        responses: { 200: err('{ documents: [{ ref, title, chunks, … }] }') } },
      post: { summary: 'Masukkan teks ke knowledge base (potong + embed)', security: [apiKeyAuth],
        requestBody: json(obj({
          knowledgeBaseId: uuid, text: str, title: str,
          metadata: { type: 'object' }, externalId: str, externalVersion: str,
        }, ['knowledgeBaseId', 'text'])),
        responses: { 201: err('{ ok, chunks }'), 400: err('input tidak valid'),
          403: err('kunci tanpa izin write'), 422: err('KB tidak ditemukan') } },
      delete: { summary: 'Cabut satu dokumen logis beserta seluruh potongannya', security: [apiKeyAuth],
        parameters: [{ name: 'ref', in: 'query', required: true, schema: str }],
        responses: { 200: err('{ ok, removedChunks }'), 404: err('tidak ditemukan') } },
    },
    '/api/v1/mcp': {
      post: {
        summary: 'Server MCP (Model Context Protocol) — JSON-RPC 2.0 di atas satu endpoint',
        description: 'Basis pengetahuan tenant bisa dipanggil langsung dari Claude/IDE pelanggan. '
          + 'Metode: initialize, ping, tools/list, tools/call. Alat: daftar_chatbot, cari_dokumen. '
          + 'Notifikasi (tanpa "id") dijawab 202 tanpa badan. Batch JSON-RPC TIDAK didukung '
          + '(dibuang di MCP 2025-06-18). Kegagalan ALAT dikembalikan sebagai result.isError, '
          + 'bukan sebagai error JSON-RPC — agar agen pemanggil tidak mencoba ulang selamanya. '
          + 'Cakupan "chat", sama seperti /api/v1/search, karena pencarian memuat embedding kueri.',
        security: [apiKeyAuth],
        requestBody: json(obj({ jsonrpc: str, id: str, method: str }, ['jsonrpc', 'method'])),
        responses: {
          200: err('balasan JSON-RPC { jsonrpc, id, result } atau { jsonrpc, id, error }'),
          202: err('notifikasi diterima — tanpa badan, sesuai JSON-RPC'),
        },
      },
    },
    '/api/v1/search': {
      post: {
        summary: 'Pencarian semantik MURNI — potongan + skor, tanpa LLM',
        description: 'Tak membakar token LLM dan tak memotong kuota pesan. Terikat satu chatbot ' +
          'karena chatbot-lah yang menentukan KB mana yang boleh dibaca (D11).',
        security: [apiKeyAuth],
        requestBody: json(obj({ chatbotId: uuid, query: str, k: num, minScore: num },
          ['chatbotId', 'query'])),
        responses: { 200: err('{ query, embeddingModel, results }'),
          403: err('kunci tanpa izin chat'), 404: err('chatbot tidak ditemukan') },
      },
    },

    /* ── pengelolaan kunci & webhook (ber-sesi, admin) ── */
    '/api/keys': {
      get: { summary: 'Daftar API key tenant (tanpa nilai kuncinya)', security: [sessionAuth],
        responses: { 200: err('{ keys, scopes }') } },
      post: { summary: 'Terbitkan API key — kunci mentah dibalas SEKALI', security: [sessionAuth],
        requestBody: json(obj({ name: str, scopes: { type: 'array', items: str }, expiresAt: str },
          ['name', 'scopes'])),
        responses: { 201: err('{ key, row }'), 400: err('input tidak valid') } },
      delete: { summary: 'Cabut kunci (baris tetap ada demi jejak audit)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('{ ok }') } },
    },
    '/api/webhooks': {
      get: { summary: 'Daftar webhook + kejadian yang tersedia', security: [sessionAuth],
        responses: { 200: err('{ webhooks, events }') } },
      post: { summary: 'Tambah webhook — secret dibalas SEKALI', security: [sessionAuth],
        requestBody: json(obj({ url: str, events: { type: 'array', items: str } }, ['url', 'events'])),
        responses: { 201: err('{ secret, row }'), 422: err('URL tak layak kirim (non-https / alamat internal)') } },
      patch: { summary: 'Ubah / nyalakan-matikan / kirim kejadian uji', security: [sessionAuth],
        requestBody: json(obj({ id: uuid, url: str, events: { type: 'array', items: str },
          enabled: bool, test: bool }, ['id'])),
        responses: { 200: err('{ ok } atau hasil uji { ok, status, error }') } },
      delete: { summary: 'Hapus webhook', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('{ ok }') } },
    },

    '/api/alerts': {
      get: { summary: 'Saluran peringatan tenant + 200 peringatan terakhir', security: [sessionAuth],
        responses: { 200: err('{ saluran: { email, slackTerpasang, minLevel }, riwayat[] }') } },
      patch: {
        summary: 'Simpan saluran peringatan (email / Slack / ambang tingkat)',
        description: 'URL Slack disimpan terenkripsi dan TIDAK pernah dibalas ke klien — '
          + 'respons hanya menyebut `slackTerpasang`. Menghilangkan `slackUrl` dari body berarti '
          + '"jangan sentuh yang tersimpan"; mengirimnya sebagai string kosong berarti mencabutnya.',
        security: [sessionAuth],
        requestBody: json(obj({ email: str, slackUrl: str, minLevel: str })),
        responses: {
          200: err('{ email, slackTerpasang, minLevel }'),
          400: err('Email tak sah / URL Slack tak layak kirim / tingkat tak dikenal'),
        },
      },
      post: { summary: 'Kirim peringatan UJI lewat saluran yang tersimpan', security: [sessionAuth],
        responses: { 200: err('{ email: boolean, slack: boolean, dilewati: boolean } — apa yang benar-benar sampai') } },
    },

    /* ── auth ── */
    '/api/auth/signup': {
      post: {
        summary: 'Daftar — 1 signup = 1 tenant terisolasi + user admin',
        requestBody: json(obj({ orgName: str, name: str, email: str, password: str },
          ['orgName', 'name', 'email', 'password'])),
        responses: { 201: err('Tenant & user terbuat'), 422: err('Email terdaftar'), 429: err('Rate limit') },
      },
    },

    /* ── chatbots ── */
    '/api/chatbots': {
      get: { summary: 'Daftar chatbot aktif', security: [sessionAuth],
        responses: { 200: json({ type: 'array', items: { $ref: '#/components/schemas/Chatbot' } }) } },
      post: { summary: 'Buat chatbot (+embed snippet)', security: [sessionAuth],
        requestBody: json(obj({ name: str, allowedOrigins: { type: 'array', items: str },
          greeting: str, themeConfig: { $ref: '#/components/schemas/ThemeConfig' } })),
        responses: { 201: err('chatbot + snippet'), 422: err('Limit plan / validasi') } },
    },
    '/api/chatbots/trashed': {
      get: { summary: 'Chatbot ter-soft-delete (Rule #3)', security: [sessionAuth],
        responses: { 200: err('daftar') } },
    },
    '/api/chatbots/{id}': {
      patch: { summary: 'Update chatbot', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('updated'), 404: err('tidak ditemukan') } },
      delete: { summary: 'SOFT delete + kaskade (dokumen/sumber/percakapan)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('softDeleted'), 404: err('tidak ditemukan') } },
    },
    '/api/chatbots/{id}/logo': {
      post: { summary: 'Unggah logo branding chatbot (PNG/JPEG/WebP ≤300KB, data URL; disimpan di DB — identik SaaS & on-prem)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ dataUrl: str }, ['dataUrl'])),
        responses: { 200: err('{ ok, logoUrl }'), 400: err('format/ukuran ditolak'), 404: err('tidak ditemukan') } },
      delete: { summary: 'Hapus logo (widget kembali ke inisial/default)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ ok }') } },
    },
    '/api/chat/{publicKey}/history': {
      get: {
        summary: 'PUBLIK: transkrip percakapan berjalan (widget memulihkannya saat halaman dimuat ulang)',
        description: 'Menuntut conversationId DAN visitorId yang cocok, serta origin yang diizinkan. ' +
          'Yang tak cocok dijawab daftar kosong — sama dengan yang tak ada — supaya endpoint ini tak ' +
          'bisa dipakai memastikan sebuah id percakapan itu nyata.',
        parameters: [
          { name: 'publicKey', in: 'path', required: true, schema: str },
          { name: 'conversationId', in: 'query', schema: uuid },
          { name: 'visitorId', in: 'query', schema: str },
        ],
        responses: { 200: err('{ messages: [{ role, content, blocks, citations }] }'),
          403: err('Origin tidak diizinkan'), 404: err('Chatbot tidak ditemukan') },
      },
    },
    '/api/chat/{publicKey}/sessions': {
      get: {
        summary: 'PUBLIK: daftar percakapan milik satu pengunjung (sidebar chat halaman penuh)',
        description: 'Melengkapi /history, yang hanya mengambil ISI satu percakapan yang id-nya sudah '
          + 'diketahui pemanggil — cukup untuk widget gelembung dengan satu sesi berjalan, tapi tidak '
          + 'untuk tampilan halaman penuh yang menampilkan DAFTAR sesi. Daftar itu tak bisa disusun '
          + 'dari localStorage: pengunjung yang membersihkan penyimpanan peramban akan melihat '
          + 'riwayatnya kosong padahal server menyimpan semuanya. Judul tiap sesi DITURUNKAN dari '
          + 'pesan pertama pengunjung — percakapan tak punya kolom judul, dan menambahkannya berarti '
          + 'satu panggilan model lagi per sesi hanya untuk menamai sesuatu yang pengunjung sudah '
          + 'menamainya lewat pertanyaan pembuka. Penjagaannya sama dengan /history: origin diizinkan, '
          + 'percakapan milik chatbot itu, dan visitorId cocok — yang tak cocok dijawab daftar kosong '
          + 'supaya endpoint ini tak bisa dipakai memastikan sebuah visitorId itu nyata.',
        parameters: [
          { name: 'publicKey', in: 'path', required: true, schema: str },
          { name: 'visitorId', in: 'query', schema: str },
        ],
        responses: {
          200: err('{ sessions: [{ id, title, startedAt, lastAt, messages }] } — maksimum 50, terbaru dulu'),
          403: err('Origin tidak diizinkan'), 404: err('Chatbot tidak ditemukan'),
        },
      },
    },
    '/api/chat/{publicKey}/logo': {
      get: { summary: 'Byte logo chatbot utk widget (publik, cache 1 jam)',
        parameters: [{ name: 'publicKey', in: 'path', required: true, schema: str }],
        responses: { 200: err('image/png|jpeg|webp'), 404: err('tanpa logo') } },
    },
    '/api/chatbots/{id}/restore': {
      patch: { summary: 'Pulihkan dari Sampah + kaskade', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('restored'), 404: err('tidak di Sampah') } },
    },

    /* ── knowledge (D11: KB entitas mandiri, 1 KB ↔ N chatbot) ── */
    '/api/documents/summaries': {
      get: {
        summary: 'Cari dokumen di knowledge base + ringkasannya',
        description: 'Diagregasi per `doc_ref` (identitas dokumen logis yang sama dengan '
          + '/api/v1/documents dan retrieval bertingkat), lalu di-JOIN ke catatan Memory lewat '
          + '`doc_ref`. Pencarian menyentuh JUDUL, ISI (indeks full-text), dan RINGKASAN sekaligus. '
          + 'Dokumen yang belum diringkas tetap muncul dengan `summary: null` — bukan disembunyikan. '
          + 'Satu baris lebih diambil untuk menentukan `more`, jauh lebih murah daripada COUNT(*) '
          + 'atas seluruh korpus pada tiap ketikan.',
        security: [sessionAuth],
        parameters: [
          { name: 'q', in: 'query', schema: str },
          { name: 'knowledgeBaseId', in: 'query', schema: uuid },
          { name: 'category', in: 'query', schema: str },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 0 } },
        ],
        responses: { 200: err('{ rows[], more, page }') },
      },
    },
    '/api/admin/plan-quotas': {
      get: {
        summary: 'Kuota tiap paket — default kode + penimpa yang berlaku',
        description: 'Angka kuota adalah keputusan BISNIS: berapa yang cukup menarik tanpa '
          + 'membuat orang betah gratis selamanya hanya bisa dijawab dengan mencoba lalu '
          + 'menyesuaikan. Menaruhnya di kode membuat tiap penyesuaian menuntut deploy — dan '
          + 'penyesuaian yang mahal tak pernah dilakukan. Superadmin saja.',
        security: [sessionAuth],
        responses: { 200: err('{ defaults, overrides }') },
      },
      put: {
        summary: 'Setel kuota paket (berlaku seketika)',
        description: 'Kunci yang TIDAK disebut kembali ke default kode. Nilai `null` berarti '
          + 'tanpa batas — Infinity tak punya padanan di JSON. Paket `onprem` sengaja DITOLAK '
          + 'di sini dan diabaikan saat penerapan: batasnya server milik pelanggan, dan satu '
          + 'salah ketik bisa mematikan pemasangan yang sudah mereka bayar sendiri.',
        security: [sessionAuth],
        requestBody: json(obj({
          free: { type: 'object' }, pro: { type: 'object' }, enterprise: { type: 'object' },
        })),
        responses: { 200: err('{ ok, overrides }'), 400: err('nilai tak sah') },
      },
    },
    '/api/usage/storage': {
      get: {
        summary: 'Pemakaian penyimpanan terhadap kuota paket',
        description: 'Kuota dibatasi per POTONGAN, bukan per megabyte teks: potonganlah satuan '
          + 'biaya yang nyata (8.189 byte baris + ±1.570 byte indeks vektor yang harus residen '
          + 'di RAM pada mode langsung). Membatasi "MB teks" akan menyesatkan — teks yang sama '
          + 'bisa jadi dua kali lipat potongan bila pemenggalannya berubah. `approxDocuments` '
          + 'dan `approxBytes` hanya cara membacanya, bukan kuotanya. Paket on-premise dan '
          + 'workspace operator platform mengembalikan batas tak hingga.',
        security: [sessionAuth],
        responses: { 200: err('{ plan, chunks, maxChunks, knowledgeBases, maxKnowledgeBases, approxDocuments, approxBytes, percent }') },
      },
    },
    '/api/documents/duplicates': {
      get: {
        summary: 'Berkas kembar yang dilewati saat ingest',
        description: 'Dedup berjalan dua lapis: NAMA+UKURAN dari listing (melewati berkas '
          + 'SEBELUM diunduh) dan SIDIK JARI ISI sha256 atas teks hasil ekstraksi (menangkap '
          + 'salinan yang di-rename, dan menolak false positive lapis pertama). Lingkupnya SATU '
          + 'knowledge base — men-dedup lintas KB akan mencabut dokumen dari KB milik chatbot '
          + 'divisi lain yang membutuhkannya. Baris di sini ada supaya berkas kembar tak lenyap '
          + 'diam-diam: tanpa catatan ini, "dilewati karena kembar" tak bisa dibedakan dari '
          + '"sync gagal".',
        security: [sessionAuth],
        parameters: [{ name: 'knowledgeBaseId', in: 'query', schema: uuid }],
        responses: { 200: err('daftar berkas kembar + doc_ref aslinya + alasannya') },
      },
    },
    '/api/memory/review': {
      get: { summary: 'Antrean ringkasan yang menunggu persetujuan', security: [sessionAuth],
        parameters: [{ name: 'chatbotId', in: 'query', schema: uuid }],
        responses: { 200: err('daftar ringkasan berstatus pending') } },
      post: {
        summary: 'Setujui / tolak ringkasan (satu atau seluruh antrean)',
        description: 'Hanya ringkasan berstatus `active` yang masuk graf, ikut kaki Memory saat '
          + 'menjawab, dan ikut ter-export ke vault Drive. Mode tinjau sendiri dinyalakan lewat '
          + '`tenant_settings.memory_review` dan MATI secara default: catatan lahir satu per '
          + 'dokumen, jadi korpus ribuan berkas berarti ribuan persetujuan.',
        security: [sessionAuth],
        requestBody: json(obj({
          noteId: uuid, status: { type: 'string', enum: ['active', 'rejected'] },
          all: { type: 'boolean' }, chatbotId: uuid,
        })),
        responses: { 200: err('{ id, status } atau { ok, approved }'), 400: err('argumen kurang'), 404: err('tak ditemukan') },
      },
    },
    '/api/memory/recategorize': {
      get: {
        summary: 'Berapa dokumen tersangkut di penampung "Belum dikategorikan"',
        description: 'Memisahkan dua keadaan yang mengarah ke tindakan berbeda: `siap` sudah punya '
          + 'ringkasan dan bisa dinilai ulang, `tanpaRingkasan` belum pernah disentuh agen Memory '
          + 'dan harus diringkas dulu. Ada endpoint sendiri supaya UI bisa menyebut angkanya '
          + 'SEBELUM pengguna menekan sesuatu yang memakai kuota model.',
        security: [sessionAuth],
        parameters: [{ name: 'knowledgeBaseId', in: 'query', schema: uuid }],
        responses: { 200: err('{ siap, tanpaRingkasan }') },
      },
      post: {
        summary: 'Nilai ulang kategori dari ringkasan yang sudah ada',
        description: 'HANYA menyentuh catatan yang kategorinya `belum`; kategori yang sudah punya '
          + 'nilai — apa pun asalnya, agen maupun pengguna — tak pernah dipindahkan. Tak ada berkas '
          + 'yang diunduh ulang, tak ada teks yang di-embed ulang, dan graf tidak dibangun ulang: '
          + 'yang berjalan hanya panggilan model atas ringkasan, dibundel 20 sekali kirim. '
          + 'Menilai dari ringkasan LEBIH LEMAH daripada membaca dokumennya (ringkasan sudah '
          + 'kehilangan detail) — dibenarkan di sini karena yang dibereskan adalah dokumen yang '
          + 'kategorinya tidak ada, bukan yang kategorinya salah. Kategori yang diusulkan model '
          + 'tapi belum dikenal masuk sebagai usulan; dokumennya TETAP di penampung sampai '
          + 'usulannya disetujui. Batas 200 catatan per panggilan; sisanya dilaporkan di `tersisa`.',
        security: [sessionAuth],
        requestBody: json(obj({ knowledgeBaseId: uuid })),
        responses: {
          200: err('{ diperbarui, tetapBelum, tanpaRingkasan, tersisa, usulanBaru[], perKategori[] }'),
          400: err('kunci API provider belum diisi'),
        },
      },
    },
    '/api/categories': {
      get: { summary: 'Master data kategori dokumen + jumlah catatan pemakainya', security: [sessionAuth],
        description: 'Termasuk usulan agen (status `proposed`) yang belum disetujui. ' +
          '`color` & `shape` adalah penanda visual yang diturunkan dari `slot` tersimpan — ' +
          'bukan dari urutan daftar, supaya menghapus satu kategori tak mengecat ulang sisanya.',
        responses: { 200: err('daftar kategori') } },
      post: { summary: 'Tambah kategori (langsung aktif)', security: [sessionAuth],
        requestBody: json(obj({ label: str }, ['label'])),
        responses: { 201: err('kategori terbuat'), 422: err('nama kosong / sudah ada') } },
    },
    '/api/categories/{id}': {
      patch: { summary: 'Ganti nama dan/atau setujui usulan agen', security: [sessionAuth],
        description: 'Ganti nama TIDAK mengubah `slug` — slug adalah kunci yang sudah tertulis ' +
          'di catatan Memory, dan mengubahnya akan memutus semuanya sekaligus.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ label: str, approve: { type: 'boolean' } })),
        responses: { 200: err('kategori diperbarui'), 422: err('validasi') } },
      delete: { summary: 'Soft delete kategori; catatannya pindah ke penampung', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ ok, softDeleted }'), 422: err('penampung tak bisa dihapus') } },
    },
    '/api/admin/backlog/pilihan': {
      post: { summary: 'SUPERADMIN: centang / lepas satu pilihan pada kartu backlog',
        security: [sessionAuth],
        description: 'Keputusan produk mendarat DI KARTUNYA, bukan di percakapan yang menguap. '
          + 'Opsi ditulis di dalam `why` bergaya daftar tugas Markdown: kurung bulat `- ( )` '
          + 'saling meniadakan dalam satu blok PILIHAN, kurung siku `- [ ]` boleh banyak. '
          + 'Rute TERPISAH dari PATCH (antrean) dan PUT (prioritas) supaya satu seretan kartu '
          + 'tak pernah diam-diam menulis ulang jawaban yang dipikirkan lama. Balasannya berisi '
          + '`why` yang baru — pada opsi tunggal, mencentang satu melepas saudaranya, dan klien '
          + 'yang menebak sendiri akan menampilkan dua centang sampai dimuat ulang.',
        requestBody: json(obj({ id: uuid, indeks: { type: 'integer' }, pilih: { type: 'boolean' } },
          ['id', 'indeks', 'pilih'])),
        responses: { 200: err('{ why }'), 404: err('kartu tidak ditemukan'),
          409: err('indeks bergeser — papan sudah berubah, muat ulang') } },
    },
    '/api/admin/backlog/catatan': {
      post: { summary: 'SUPERADMIN: tempelkan catatan bebas ke kartu backlog',
        security: [sessionAuth],
        description: 'Mencentang saja tidak selalu cukup: sebagian keputusan punya parameter '
          + '(angka batas, nama penyedia, alasan yang tak biasa), dan memaksanya masuk daftar '
          + 'opsi berarti menebak bentuk jawaban yang belum tentu terpikirkan. Catatan '
          + 'DITAMBAHKAN di bawah dengan tanggalnya, tak pernah menimpa — riwayat '
          + 'pertimbangan itulah yang menjelaskan kenapa sebuah kartu berbelok.',
        requestBody: json(obj({ id: uuid, teks: str }, ['id', 'teks'])),
        responses: { 200: err('{ why }'), 400: err('catatan kosong / terlalu panjang'),
          404: err('kartu tidak ditemukan') } },
    },
    '/api/chatbots/{id}/visitor-secret': {
      post: { summary: 'Nyalakan / putar / matikan identitas pengunjung dari situs pelanggan',
        security: [sessionAuth],
        description: 'Penanda pengunjung lahir dari Math.random() di localStorage, jadi riwayat '
          + 'chat mati bersama perambannya. Situs pelanggan yang penggunanya sudah LOGIN bisa '
          + 'menyebutkan penanda penggunanya sendiri lewat `data-visitor` + `data-visitor-sig` '
          + '(HMAC-SHA256 hex atas penanda mentah, dihitung SERVER pelanggan). '
          + 'Rahasianya dikembalikan SATU KALI di sini dan tak pernah bisa dibaca lagi — tak ada '
          + 'endpoint GET untuknya, dan ciphertext-nya tak pernah ikut ke peramban. '
          + 'Memutar rahasia MEMUTUS semua tanda tangan lama seketika, dan itu memang gunanya. '
          + 'Balasannya menyertakan contoh kode lima bahasa (PHP, Node, Python, Go, Java).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ nyala: { type: 'boolean' } }, ['nyala'])),
        responses: { 200: err('{ rahasia, contoh }'), 403: err('chatbot milik divisi lain'),
          404: err('chatbot tidak ditemukan') } },
    },
    '/api/graf': {
      get: { summary: 'Simpul & sisi peta pengetahuan: chatbot ↔ knowledge base',
        security: [sessionAuth],
        description: 'TIDAK menyimpulkan hubungan apa pun — sisinya adalah baris '
          + '`chatbot_knowledge_bases` apa adanya. Graf yang menyimpulkan akan memajang garis '
          + 'yang tak pernah ada, dan orang mempercayainya justru karena ia digambar. '
          + 'Disaring divisi: chatbot yang tak boleh dilihat pemanggil tak muncul, dan SISI '
          + 'miliknya ikut dibuang — sisi yang tersisa akan menunjuk id yang tak ada di daftar, '
          + 'dan dari situ jumlah chatbot tenant tetap bisa dihitung.',
        responses: { 200: err('{ chatbot, kb, sisi }') } },
    },
    '/api/connectors': {
      get: { summary: 'Konektor sumber data yang BOLEH dipakai tenant ini', security: [sessionAuth],
        description: 'Yang dimatikan superadmin tak ikut sama sekali — bukan ditandai nonaktif: '
          + 'pilihan yang terlihat tapi tak bisa dipilih membuat orang mengira produknya rusak, '
          + 'dan yang bisa dipilih lalu ditolak lebih buruk lagi. Keterangan internal '
          + '(butuh aplikasi OAuth kita, alasan belum tersedia) tak ikut — itu bahan keputusan '
          + 'platform, bukan informasi yang berguna bagi pemilik knowledge base.',
        responses: { 200: err('{ konektor: [{ jenis, label }] }') } },
    },
    '/api/admin/retrieval': {
      get: { summary: 'SUPERADMIN: saklar retrieval tingkat platform',
        security: [sessionAuth],
        description: 'Kuantisasi biner sebagai lapisan penyaring. Keputusan PEMASANGAN, bukan '
          + 'per-tenant: yang ditukar adalah waktu lawan ketepatan pada infrastruktur bersama, '
          + 'dan pemilik satu knowledge base tak punya dasar untuk menilainya.',
        responses: { 200: err('{ binaryQuantize: boolean }') } },
      put: { summary: 'SUPERADMIN: nyalakan/matikan kuantisasi biner', security: [sessionAuth],
        description: 'MATI secara bawaan. Jarak Hamming hanya mempersempit kandidat — jarak '
          + 'eksak tetap yang menentukan urutan akhir, jadi ketepatannya tidak ditukar. '
          + 'Mengabaikan dirinya sendiri pada korpus kecil, tempat ia justru merugikan.',
        requestBody: json(obj({ binaryQuantize: { type: 'boolean' } }, ['binaryQuantize'])),
        responses: { 200: err('{ ok: true }'), 400: err('input tidak valid') } },
    },
    '/api/admin/connectors': {
      get: { summary: 'SUPERADMIN: daftar konektor + saklarnya + berapa sumber masih memakainya',
        security: [sessionAuth],
        description: 'Jumlah sumber aktif ikut karena mematikan konektor TIDAK menghentikan '
          + 'sumber yang sudah ada — ia hanya menutup pembuatan yang baru. Tanpa angka itu, '
          + 'superadmin mengira mematikan Drive berarti Drive berhenti disinkronkan.',
        responses: { 200: err('{ konektor: [{ jenis, label, nyala, tersedia, sumberAktif, … }] }') } },
      put: { summary: 'SUPERADMIN: nyalakan/matikan konektor', security: [sessionAuth],
        description: 'Kunci tak dikenal dibuang, dan konektor yang belum tersedia dipaksa mati '
          + 'di sisi tulis — keadaan tak sah tak boleh sempat tersimpan. Penegakannya sendiri di '
          + 'POST /api/sources (422), bukan di UI: menyembunyikan pilihan di layar bukan penegakan.',
        requestBody: json(obj({ konektor: { type: 'object' } }, ['konektor'])),
        responses: { 200: err('{ konektor }'), 400: err('input tidak valid') } },
    },
    '/api/demo': {
      get: { summary: 'PUBLIK: apakah landing boleh menampilkan demo sekarang?',
        description: 'Dipanggil halaman depan tanpa sesi. Yang dikembalikan cuma kunci publik '
          + 'chatbot demo dan boleh-tidaknya ia dipakai — kunci itu memang dirancang untuk '
          + 'disebar. Sisa kuota TIDAK ikut: pengunjung tak bisa berbuat apa-apa dengannya, '
          + 'sementara menyebutkannya memberi tahu penyerang persis berapa permintaan lagi yang '
          + 'diperlukan untuk mematikan demo bulan berikutnya. Saat kuota habis, jawabannya '
          + '{ aktif: false } TANPA kunci — mengirim kunci sambil bilang "tak boleh" membuat '
          + 'landing memasang widget yang setiap pertanyaannya ditolak, dan itu terbaca sebagai '
          + 'produk rusak alih-alih demo yang sedang istirahat.',
        responses: { 200: err('{ aktif, publicKey? , pesan? }') } },
    },
    '/api/admin/demo': {
      get: { summary: 'SUPERADMIN: chatbot demo publik + sisa kuota bulan ini', security: [sessionAuth],
        responses: { 200: err('{ pengaturan, status, publicKey, chatbots }') } },
      put: { summary: 'SUPERADMIN: tunjuk chatbot demo & setel remnya', security: [sessionAuth],
        description: 'Rem yang dipilih pemilik produk: matikan otomatis saat kuota bulanan habis. '
          + 'Bawaan 1.000 pesan/bulan — seperlima paket Pro. NOL berarti MATI TOTAL, bukan tanpa '
          + 'batas; "matikan demo" adalah cara paling wajar orang menuliskannya, dan kebalikannya '
          + 'akan membuka keran lebar-lebar tepat saat seseorang bermaksud menutupnya.',
        requestBody: json(obj({ chatbotId: uuid, batas: { type: 'integer' } }, ['chatbotId', 'batas'])),
        responses: { 200: err('{ ok }'), 400: err('input tidak valid') } },
    },
    '/api/sso': {
      get: { summary: 'Koneksi SSO organisasi + preset penyedia + URL callback', security: [sessionAuth],
        description: 'Client secret TIDAK pernah ikut, bahkan ciphertextnya. `callbackUrl` disusun '
          + 'server: satu huruf beda membuat IdP menolak dengan galat yang tak menyebut sebabnya.',
        responses: { 200: err('{ connections, presets, callbackUrl }') } },
      post: { summary: 'Daftarkan identity provider milik organisasi (D16)', security: [sessionAuth],
        description: 'Kredensial milik PELANGGAN — kita tak mendaftarkan aplikasi apa pun. '
          + 'Isian `isian` berbeda per jenis: Directory (tenant) ID untuk entra, domain Workspace '
          + 'untuk google, URL organisasi untuk okta, issuer penuh untuk oidc. Domain email wajib '
          + 'unik SECARA GLOBAL — dua tenant yang mengaku memiliki domain sama membuat perutean '
          + 'login tak bisa ditentukan, dan menebaknya berarti mengirim karyawan satu perusahaan '
          + 'ke IdP perusahaan lain.',
        requestBody: json(obj({ kind: str, isian: str, clientId: str, clientSecret: str, domain: str },
          ['kind', 'isian', 'clientId', 'clientSecret', 'domain'])),
        responses: { 201: err('koneksi dibuat'), 422: err('konfigurasi ditolak / domain sudah dipakai') } },
      delete: { summary: 'Cabut koneksi SSO (soft delete, Rule #3)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('{ ok }'), 404: err('tidak ditemukan') } },
    },
    '/api/auth/sso/lookup': {
      post: { summary: 'PUBLIK: apakah domain email ini punya SSO?',
        description: 'Dipanggil halaman masuk sebelum ada sesi. Jawabannya SENGAJA cuma '
          + '{ sso: boolean } — nama tenant, jenis IdP, dan issuer tak pernah dikirim; semuanya '
          + 'struktur internal pelanggan, dan tak satu pun dibutuhkan peramban untuk melanjutkan. '
          + 'Koneksi yang cocok disimpan di KUKI, bukan URL, karena panggilan balik OAuth kembali '
          + 'tanpa parameter kueri kita. Dibatasi laju per IP: endpoint yang menjawab "domain ini '
          + 'punya SSO" adalah alat pemetaan pelanggan bila bisa ditanyai tanpa batas.',
        requestBody: json(obj({ email: str }, ['email'])),
        responses: { 200: err('{ sso }'), 429: err('terlalu banyak percobaan') } },
    },
    '/api/divisions': {
      get: { summary: 'Daftar divisi + jumlah anggota & chatbotnya', security: [sessionAuth],
        description: 'Boleh dibaca SEMUA anggota tenant, bukan hanya admin: form chatbot dan ' +
          'halaman tim perlu menampilkan namanya, dan daftar nama divisi bukan rahasia di dalam ' +
          'tenant sendiri. Yang dijaga divisi adalah ISI chatbotnya, bukan keberadaan divisinya.',
        responses: { 200: err('daftar divisi') } },
      post: { summary: 'Tambah divisi', security: [sessionAuth],
        requestBody: json(obj({ name: str, description: str }, ['name'])),
        responses: { 201: err('divisi terbuat'), 422: err('nama kosong / sudah dipakai') } },
    },
    '/api/divisions/{id}': {
      patch: { summary: 'Ubah nama/keterangan divisi', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ name: str, description: str })),
        responses: { 200: err('divisi diperbarui'), 422: err('validasi') } },
      delete: { summary: 'Soft delete divisi; anggota & chatbotnya DILEPAS jadi tanpa divisi',
        security: [sessionAuth],
        description: 'Pelepasan itu wajib, bukan kenyamanan: tanpa FK (Rule #2) tak ada yang ' +
          'membersihkan penunjuk ke baris terhapus, dan chatbot yang menunjuk divisi mati akan ' +
          'hilang dari layar semua orang kecuali admin — terhapus tanpa pernah dihapus.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ ok, softDeleted }'), 404: err('tidak ditemukan') } },
    },
    '/api/divisions/trashed': {
      get: { summary: 'Divisi ter-soft-delete (Rule #3)', security: [sessionAuth],
        responses: { 200: err('daftar divisi di Sampah') } },
    },
    '/api/divisions/{id}/restore': {
      patch: { summary: 'Pulihkan divisi dari Sampah — TANPA keanggotaannya', security: [sessionAuth],
        description: 'Orang & chatbot yang dulu di dalamnya bisa saja sudah dipindahkan ' +
          'sesudahnya; mengembalikan keadaan lama berarti mencabut penempatan yang dibuat ' +
          'belakangan — memulihkan satu baris sambil merusak yang lain.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('divisi pulih'), 404: err('tidak ada di Sampah') } },
    },
    '/api/knowledge-bases': {
      get: { summary: 'Daftar KB + ringkasan (sumber, chunk, chatbot ter-assign)', security: [sessionAuth],
        responses: { 200: err('daftar KB') } },
      post: { summary: 'Buat knowledge base', security: [sessionAuth],
        requestBody: json(obj({ name: str, description: str }, ['name'])),
        responses: { 201: err('KB terbuat'), 422: err('validasi') } },
    },
    '/api/knowledge-bases/{id}/upload': {
      post: {
        summary: 'Unggah berkas langsung ke KB (multipart, field `files`)',
        description: 'Ekstraksi + ingest tuntas dalam permintaan ini — unggahan TAK bisa di-sync ulang ' +
          'karena berkas aslinya tak tersimpan. Nama berkas jadi externalId, jadi mengunggah nama yang ' +
          'sama MENGGANTI isi lamanya. Batas 4 MB per permintaan berasal dari badan permintaan Vercel.',
        security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: {
          201: err('{ ok, sourceId, ingested[], skipped[{name,reason}], chunks }'),
          400: err('tak ada berkas / terlalu banyak'),
          404: err('KB tidak ditemukan'),
          413: err('melebihi batas ukuran'),
        },
      },
    },
    '/api/knowledge-bases/trashed': {
      get: { summary: 'KB ter-soft-delete', security: [sessionAuth],
        responses: { 200: err('daftar') } },
    },
    '/api/knowledge-bases/{id}': {
      patch: { summary: 'Ubah nama/deskripsi KB', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ name: str, description: str })),
        responses: { 200: err('updated'), 404: err('tidak ditemukan') } },
      delete: { summary: 'Soft delete KB + kaskade (assignment, sumber, dokumen)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('softDeleted'), 404: err('tidak ditemukan') } },
    },
    '/api/knowledge-bases/{id}/restore': {
      patch: { summary: 'Pulihkan KB + isi se-cascade', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('restored'), 404: err('tidak di Sampah') } },
    },
    '/api/knowledge-bases/{id}/assignments': {
      put: { summary: 'Setel daftar chatbot pemakai KB (deklaratif, idempotent)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ chatbotIds: { type: 'array', items: uuid } }, ['chatbotIds'])),
        responses: { 200: err('{ ok, chatbotIds }'), 422: err('KB/chatbot tidak ditemukan') } },
    },
    '/api/ingest': {
      post: { summary: 'Ingest teks → chunk → embed → KB chatbot', security: [sessionAuth],
        requestBody: json(obj({ knowledgeBaseId: uuid, title: str, text: str, sourceId: uuid },
          ['knowledgeBaseId', 'text'])),
        responses: { 200: err('{ chunks }'), 422: err('chatbot tidak valid') } },
    },
    '/api/documents/trashed': {
      get: { summary: 'Dokumen ter-soft-delete', security: [sessionAuth],
        parameters: [{ name: 'knowledgeBaseId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('daftar') } },
    },
    '/api/documents/{id}': {
      delete: { summary: 'Soft delete dokumen', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('ok') } },
    },
    '/api/documents/{id}/restore': {
      patch: { summary: 'Pulihkan dokumen', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('restored') } },
    },

    '/api/chat/internal': {
      post: { summary: 'Giliran chat dari dashboard (SSE) — sesi, bukan publicKey',
        security: [sessionAuth],
        requestBody: json(obj({ chatbotId: uuid, message: str, conversationId: uuid }, ['chatbotId', 'message'])),
        responses: { 200: err('text/event-stream'), 429: err('kuota/rate limit') } },
    },
    '/api/conversations': {
      get: { summary: 'Riwayat percakapan (berhalaman)', security: [sessionAuth],
        parameters: [
          { name: 'chatbotId', in: 'query', required: false, schema: uuid },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: { 200: err('{ rows, total, page, pageSize, pages }') } },
    },
    '/api/conversations/{id}': {
      get: { summary: 'Transkrip satu percakapan + sitasi tiap jawaban', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('daftar pesan') } },
    },
    '/api/entitlements': {
      get: { summary: 'Boleh apa: plan aktif, daftar fitur terbuka, bisa upgrade? (D14 — sumber gembok menu & gate halaman)',
        security: [sessionAuth],
        responses: { 200: err('{ plan, features[], featureMinPlan, canUpgrade, mode, planPrices, usage }') } },
    },

    /* ── email & pemulihan akun (D13: SMTP dari DB) ── */
    '/api/auth/verify-email': {
      post: { summary: 'Verifikasi email pendaftar dari tautan (publik; token sekali pakai, 24 jam)',
        requestBody: json(obj({ token: str }, ['token'])),
        responses: { 200: err('{ ok }'), 400: err('tautan tidak valid/kedaluwarsa'), 429: err('rate limit') } },
    },
    '/api/auth/forgot': {
      post: { summary: 'Minta tautan reset password (publik; balasan SELALU sama — anti enumerasi email)',
        requestBody: json(obj({ email: str }, ['email'])),
        responses: { 200: err('{ ok, message }'), 429: err('rate limit') } },
    },
    '/api/auth/reset': {
      post: { summary: 'Setel password baru dari tautan reset (publik; token sekali pakai, 1 jam)',
        requestBody: json(obj({ token: str, password: str }, ['token', 'password'])),
        responses: { 200: err('{ ok }'), 400: err('token/password tidak valid') } },
    },
    '/api/admin/mail-settings': {
      get: { summary: 'SUPERADMIN: konfigurasi SMTP platform (tanpa password)', security: [sessionAuth],
        responses: { 200: err('{ config, hasPassword, configured }') } },
      put: { summary: 'SUPERADMIN: simpan SMTP (app password terenkripsi di DB) + kirim email uji opsional', security: [sessionAuth],
        requestBody: json(obj({ config: { type: 'object' }, password: str, testTo: str }, ['config'])),
        responses: { 200: err('{ ok, testSent }') } },
    },

    /* ── papan kanban backlog (D15, Dataroom) ───────────────────────── */
    '/api/admin/backlog': {
      get: { summary: 'SUPERADMIN: seluruh kartu papan (seed disisipkan otomatis)', security: [sessionAuth],
        responses: { 200: err('{ items, labels }') } },
      patch: { summary: 'SUPERADMIN: pindahkan kartu antar kolom + tulis ulang urutan kolom tujuan', security: [sessionAuth],
        requestBody: json(obj({ id: str, status: str, order: { type: 'array', items: str } }, ['id', 'status', 'order'])),
        responses: { 200: err('{ ok }'), 400: err('input tidak valid') } },
      post: { summary: 'SUPERADMIN: tambah kartu sendiri', security: [sessionAuth],
        requestBody: json(obj({ track: str, dimension: str, title: str, why: str, size: str, blocked: str }, ['track', 'dimension', 'title'])),
        responses: { 201: err('{ item }'), 400: err('input tidak valid') } },
      delete: { summary: 'SUPERADMIN: hapus kartu (soft delete — kartu seed tak dibangkitkan lagi)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'query', required: true, schema: str }],
        responses: { 200: err('{ ok }'), 400: err('id wajib') } },
    },

    /* ── pembayaran (D12: QRIS, config di DB, halaman bayar sendiri) ── */
    '/api/payments': {
      get: { summary: 'Riwayat transaksi tenant', security: [sessionAuth],
        responses: { 200: err('daftar transaksi') } },
      post: { summary: 'Buat tagihan QRIS (admin tenant) — 409 saat mode on-premise', security: [sessionAuth],
        requestBody: json(obj({ plan: str, months: num }, ['plan'])),
        responses: { 201: err('{ id } → buka /billing/pay/{id}'), 409: err('pembayaran nonaktif (on-prem)'), 422: err('gateway/plan tidak valid') } },
    },
    '/api/payments/{id}': {
      get: { summary: 'Status transaksi utk halaman bayar (poll; menarik status provider saat pending)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ status, qrString, qrImageUrl, amount, expiresAt }') } },
    },
    '/api/payments/{id}/kuitansi': {
      get: { summary: 'Data kuitansi satu transaksi (HANYA yang sudah lunas)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: {
          200: err('{ nomor, uraian, amount, provider, paidAt, penerbit }'),
          404: err('transaksi tidak ditemukan'),
          // Kuitansi adalah bukti terima uang; menerbitkannya untuk tagihan
          // yang belum dibayar akan dipakai pelanggan persis sebagai itu.
          409: err('transaksi belum lunas'),
        } },
    },
    '/api/payments/callback/{provider}': {
      post: { summary: 'Webhook gateway (publik; otentikasi = verifikasi signature per provider)',
        parameters: [{ name: 'provider', in: 'path', required: true, schema: str }],
        responses: { 200: err('{ ok }'), 403: err('signature tidak valid') } },
    },
    '/api/admin/payment-settings': {
      get: { summary: 'SUPERADMIN: mode deploy, harga plan, status 3 gateway + URL callback tiap provider', security: [sessionAuth],
        responses: { 200: err('{ deploymentMode, planPrices, gateways[], callbackUrls }') } },
      put: { summary: 'SUPERADMIN: ubah mode/harga, simpan kredensial gateway (di DB), aktifkan SATU provider', security: [sessionAuth],
        requestBody: json(obj({ deploymentMode: str, planPrices: { type: 'object' }, gateway: { type: 'object' }, activate: str })),
        responses: { 200: err('{ ok }') } },
    },
    '/api/admin/conversations': {
      get: { summary: 'SUPERADMIN: sesi percakapan tenant mana pun (lintas-tenant, GUC 0017); chatbots=1 = daftar chatbot tenant',
        security: [sessionAuth],
        parameters: [
          { name: 'tenantId', in: 'query', required: true, schema: uuid },
          { name: 'chatbotId', in: 'query', required: false, schema: uuid },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'chatbots', in: 'query', required: false, schema: str },
        ],
        responses: { 200: err('{ rows, total, page, pages } | chatbot[]') } },
    },
    '/api/admin/conversations/{id}': {
      get: { summary: 'SUPERADMIN: transkrip satu sesi tenant mana pun', security: [sessionAuth],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: uuid },
          { name: 'tenantId', in: 'query', required: true, schema: uuid },
        ],
        responses: { 200: err('daftar pesan (blocks + citations)') } },
    },
    '/api/team/members/{id}': {
      patch: { summary: 'RBAC tenant: ubah peran anggota (admin ⇄ member; admin terakhir dilindungi)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ role: str }, ['role'])),
        responses: { 200: err('{ id, role }'), 422: err('pengaman ditolak') } },
      delete: { summary: 'Keluarkan anggota (soft delete)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('{ id }'), 422: err('pengaman ditolak') } },
    },
    '/api/usage/breakdown': {
      get: { summary: 'Monitoring pemakaian: rincian per-chatbot + tren harian (+harga model aktif utk estimasi biaya)',
        security: [sessionAuth],
        parameters: [{ name: 'days', in: 'query', required: false, schema: { type: 'integer' } }],
        responses: { 200: err('{ days, model, price, perChatbot[], daily[] }') } },
    },
    '/api/connections/{provider}/start': {
      get: { summary: 'Mulai OAuth connect akun storage → redirect ke consent',
        security: [sessionAuth],
        parameters: [{ name: 'provider', in: 'path', required: true, schema: str }],
        responses: { 302: err('redirect ke penyedia'), 400: err('OAuth belum dikonfigurasi') } },
    },
    '/api/connections/{provider}/callback': {
      get: { summary: 'Callback OAuth connect — menyimpan token terenkripsi',
        parameters: [
          { name: 'provider', in: 'path', required: true, schema: str },
          { name: 'code', in: 'query', required: false, schema: str },
          { name: 'state', in: 'query', required: false, schema: str },
        ],
        responses: { 302: err('kembali ke /knowledge') } },
    },

    /* ── sources & connections ── */
    '/api/sources': {
      get: { summary: 'Daftar sumber data + status sync', security: [sessionAuth],
        parameters: [{ name: 'knowledgeBaseId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('daftar + jobStatus') } },
      post: { summary: 'Hubungkan sumber (gdrive/onedrive/sharepoint/upload/url/s3) → auto-sync',
        security: [sessionAuth],
        description: '`config` berbeda per `kind`. Untuk `s3`: '
          + '{ bucket, region, prefix?, accessKeyId, secretAccessKey, endpoint?, gayaPath? }. '
          + '`secretAccessKey` dikirim POLOS sekali lewat HTTPS lalu disimpan TERENKRIPSI '
          + '(AES-256-GCM) sebagai `secretAccessKeyEnc`; yang polos tak pernah menyentuh basis '
          + 'data dan tak pernah dikirim balik. `endpoint` wajib https kecuali loopback — kunci '
          + 'akses dan isi dokumen menyeberangi kabel itu. `gayaPath: true` untuk MinIO dan '
          + 'sebagian besar penyimpanan swakelola, yang tak melayani gaya host virtual.',
        requestBody: json(obj({ knowledgeBaseId: uuid, kind: str, config: { type: 'object' } },
          ['knowledgeBaseId', 'kind'])),
        responses: { 201: err('source + jobStatus') } },
    },
    '/api/sources/{id}/pratinjau': {
      get: {
        summary: 'Apa yang AKAN diserap sumber ini — tanpa mengunduh satu byte pun',
        security: [sessionAuth],
        description: 'Ringkasan per folder: jumlah berkas, byte, berapa yang formatnya tak '
          + 'terbaca, dan PERKIRAAN jumlah potongan. Seluruhnya dari metadata pendaftaran '
          + 'yang memang sudah dilakukan sync di langkah pertamanya, jadi tak ada permintaan '
          + 'jaringan tambahan. Perkiraan potongannya kasar dan hanya menjanjikan URUTAN '
          + 'BESARAN — cukup untuk menjawab "folder mana yang akan menghabiskan kuota".',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: {
          200: err('{ folder: [{ jalur, berkas, byte, takTerbaca, perkiraanPotongan }], total, terpotong, folderTerpilih }'),
          422: err('pendaftaran gagal — token kedaluwarsa atau folder dihapus'),
        } },
      put: {
        summary: 'Simpan folder yang dicentang; sync berikutnya hanya menyerap itu',
        security: [sessionAuth],
        description: 'Daftar KOSONG berarti SEMUA, bukan tak satu pun — arti sebaliknya akan '
          + 'membuat setiap sumber yang sudah ada berhenti menyerap apa pun pada detik fitur '
          + 'ini dipasang. Bila pilihannya kelak tak cocok dengan satu berkas pun, sync '
          + 'BERHENTI dan berteriak alih-alih menyimpulkan seluruh isi KB lenyap dari upstream.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ folderTerpilih: { type: 'array', items: { type: 'string' } } }, ['folderTerpilih'])),
        responses: { 200: err('{ ok, folderTerpilih }'), 400: err('input tidak valid'), 404: err('sumber tidak ditemukan') } },
    },
    '/api/sources/{id}/sync': {
      post: {
        summary: 'Re-sync manual — DELTA (hanya file baru/berubah) kecuali full=1',
        security: [sessionAuth],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: uuid },
          { name: 'full', in: 'query', required: false, schema: { type: 'string', enum: ['1'] },
            description: 'Paksa ingest ulang SEMUA file (abaikan versi tersimpan)' },
        ],
        responses: { 202: json({ $ref: '#/components/schemas/JobStatus' }) } },
    },
    '/api/settings/test-key': {
      post: {
        summary: 'Uji kunci API TERSIMPAN ke penyedia (endpoint daftar model, tanpa biaya token)',
        security: [sessionAuth],
        requestBody: json(obj({ provider: str }, ['provider'])),
        responses: { 200: err('ok, message'), 429: err('terlalu sering') } },
    },
    '/api/analytics': {
      get: { summary: 'Analitik SATU chatbot: pertanyaan & dokumen sumber terbanyak', security: [sessionAuth],
        parameters: [
          { name: 'chatbotId', in: 'query', required: true, schema: uuid },
          { name: 'days', in: 'query', required: false, schema: { type: 'integer' } },
          // Rentang kustom: keduanya wajib bersamaan, `sampai` INKLUSIF.
          { name: 'dari', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'sampai', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['json', 'csv'] } },
        ],
        responses: {
          200: err('totals, topQuestions, topKeywords, topDocuments, daily, range — atau text/csv bila format=csv'),
          400: err('rentang tak sah (terbalik, satu ujung, atau melewati 365 hari)'),
        } },
    },
    /* Kontrak SSE kedua endpoint chat (internal & publik):
       event meta {conversationId} → sources [] (internal saja) →
       block {type:'text'|'list'|'cards'|'chart', …}* → done {}.
       Jawaban dikirim BLOK terstruktur (chat/blocks.ts), bukan delta teks. */
    '/api/connections/providers': {
      get: { summary: 'Provider storage mana yang siap dipakai (tanpa menyebut kredensial)',
        security: [sessionAuth],
        responses: { 200: err('{ google: bool, microsoft: bool, driveMode, picker }') } },
    },
    '/api/connections/google/picker-token': {
      get: { summary: 'Access token Google user sendiri utk Google Picker (mode picker saja; tanpa refresh token)',
        security: [sessionAuth],
        parameters: [{ name: 'accountEmail', in: 'query', required: false, schema: { type: 'string' } }],
        responses: { 200: err('{ accessToken }') } },
    },
    '/api/admin/oauth-apps': {
      get: { summary: 'Kredensial OAuth app (tanpa secret)', security: [sessionAuth],
        responses: { 200: err('provider, clientId, source, hasSecret') } },
      put: { summary: 'Simpan/ubah kredensial OAuth (secret kosong = tak diubah)', security: [sessionAuth],
        requestBody: json(obj({ provider: str, clientId: str, clientSecret: str, msTenantId: str }, ['provider', 'clientId'])),
        responses: { 200: err('kredensial tersimpan') } },
      delete: { summary: 'Hapus kredensial DB — sistem kembali memakai env bila ada',
        security: [sessionAuth],
        parameters: [{ name: 'provider', in: 'query', required: true, schema: str }],
        responses: { 200: err('dihapus') } },
    },

    /* ── billing & observability ── */
    '/api/health': {
      get: { summary: 'Health check (PUBLIK, minim) — 503 bila DB tak terjangkau',
        responses: { 200: err('ok, db.latencyMs, mode'), 503: err('database tak terjangkau') } },
    },
    '/api/billing': {
      get: { summary: 'Plan tenant, pemakaian vs kuota, katalog paket', security: [sessionAuth],
        responses: { 200: err('plan, usage, limits, plans') } },
    },
    '/api/admin/billing': {
      get: { summary: 'Semua tenant + plan & pemakaian', security: [sessionAuth],
        responses: { 200: err('tenants[], plans[]') } },
      patch: { summary: 'Setel plan sebuah tenant (+ masa berlaku)', security: [sessionAuth],
        requestBody: json(obj({ tenantId: uuid, plan: str, expiresAt: str }, ['tenantId', 'plan'])),
        responses: { 200: err('billing tenant'), 422: err('plan tak dikenal / tanggal lampau') } },
    },
    '/api/admin/ops': {
      get: { summary: 'Ringkasan operasional lintas tenant', security: [sessionAuth],
        parameters: [{ name: 'hours', in: 'query', required: false, schema: { type: 'integer' } }],
        responses: { 200: err('actions, errors, guardrail, usage, topTenants') } },
    },

    /* ── team & undangan ── */
    '/api/team/members': {
      get: { summary: 'Anggota tenant saat ini', security: [sessionAuth],
        responses: { 200: err('daftar anggota') } },
    },
    '/api/team/invitations': {
      get: { summary: 'Undangan tenant ini', security: [sessionAuth],
        responses: { 200: err('daftar undangan') } },
      post: { summary: 'Undang anggota — token & tautan dibalas SEKALI', security: [sessionAuth],
        requestBody: json(obj({ email: str, role: str }, ['email'])),
        responses: { 201: err('invitation + token + inviteUrl'), 422: err('kuota kursi penuh / sudah anggota') } },
    },
    '/api/team/invitations/{id}': {
      delete: { summary: 'Cabut undangan (soft delete)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('dicabut') } },
    },
    '/api/team/invitations/trashed': {
      get: { summary: 'Undangan yang dicabut', security: [sessionAuth],
        responses: { 200: err('daftar Sampah') } },
    },
    '/api/team/invitations/{id}/restore': {
      patch: { summary: 'Kembalikan undangan dari Sampah', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('dipulihkan') } },
    },
    '/api/invitations/{token}': {
      get: { summary: 'Pratinjau undangan (PUBLIK, tanpa sesi)',
        parameters: [{ name: 'token', in: 'path', required: true, schema: str }],
        responses: { 200: err('email, role, tenantName'), 404: err('tidak berlaku') } },
    },
    '/api/invitations/{token}/accept': {
      post: { summary: 'Terima undangan — masuk ke TENANT PENGUNDANG (PUBLIK)',
        parameters: [{ name: 'token', in: 'path', required: true, schema: str }],
        requestBody: json(obj({ name: str, password: str }, ['password'])),
        responses: { 201: err('user dibuat & langsung aktif'), 422: err('token dipakai/kedaluwarsa') } },
    },

    /* ── verifikasi pendaftaran — SUPERADMIN ── */
    '/api/auth/login-status': {
      post: {
        summary: 'Alasan login gagal (hanya menjawab setelah password benar)',
        requestBody: json(obj({ email: str, password: str }, ['email', 'password'])),
        responses: { 200: err('outcome: invalid | pending | rejected | active') } },
    },
    '/api/auth/two-factor': {
      get: {
        summary: 'Keadaan dua faktor akun yang sedang login',
        security: [sessionAuth],
        responses: { 200: err('{ aktif, sisaCadangan }') },
      },
      post: {
        summary: 'Daftarkan / konfirmasi / matikan dua faktor (TOTP)',
        description: 'Tiga aksi dalam satu endpoint karena ketiganya menyentuh SATU keadaan '
          + 'yang sama dan urutannya wajib: `mulai` membuat rahasia tapi TIDAK mengaktifkannya '
          + '(rahasia yang langsung berlaku akan mengunci orang yang salah memindai QR dari '
          + 'akunnya sendiri); `konfirmasi` mengaktifkan setelah satu kode benar membuktikan '
          + 'perangkatnya terpasang, dan mengembalikan kode cadangan SEKALI SAJA — sesudah itu '
          + 'hanya hash-nya tersimpan; `matikan` menuntut KATA SANDI, bukan sekadar sesi yang '
          + 'hidup, karena sesi yang hidup adalah persis yang dimiliki penyerang pencuri cookie. '
          + 'Seluruh aksi menyentuh akun PEMANGGIL saja — userId diambil dari sesi, tak pernah '
          + 'dari badan permintaan.',
        security: [sessionAuth],
        requestBody: json(obj({
          aksi: { type: 'string', enum: ['mulai', 'konfirmasi', 'matikan'] },
          kode: str, kataSandi: str,
        }, ['aksi'])),
        responses: {
          200: err('{ rahasia, otpauth } | { kodeCadangan[] } | { ok }'),
          400: err('kode tidak cocok / kata sandi salah / keadaan tak sesuai'),
        },
      },
    },
    '/api/admin/users': {
      get: { summary: 'Antrean verifikasi pendaftaran (lintas tenant)', security: [sessionAuth],
        parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending', 'all'] } }],
        responses: { 200: err('daftar user + organisasi') } },
    },
    '/api/admin/users/{id}/status': {
      patch: { summary: 'Verifikasi / tolak / kembalikan ke antrean', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ status: str }, ['status'])),
        responses: { 200: err('status diperbarui'), 422: err('superadmin aktif terakhir') } },
    },

    /* ── server LLM sendiri / on-premise — SUPERADMIN ── */
    '/api/admin/llm-servers': {
      get: { summary: 'Daftar server LLM sendiri (Ollama/vLLM/LM Studio)', security: [sessionAuth],
        responses: { 200: err('daftar server + model terdeteksi') } },
      post: { summary: 'Daftarkan server LLM (token opsional)', security: [sessionAuth],
        requestBody: json(obj({ name: str, baseUrl: str, token: str }, ['name', 'baseUrl'])),
        responses: { 201: err('server dibuat'), 422: err('alamat non-https / duplikat') } },
    },
    '/api/admin/llm-servers/{id}': {
      patch: { summary: 'Ubah server LLM', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ name: str, baseUrl: str, token: str, enabled: { type: 'boolean' } }, [])),
        responses: { 200: err('server diperbarui') } },
      delete: { summary: 'Soft delete server LLM', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('dipindah ke Sampah') } },
    },
    '/api/admin/llm-servers/{id}/test': {
      post: { summary: 'Uji koneksi + baca /v1/models dari server LLM', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('model terdeteksi & tersimpan'), 422: err('koneksi/token gagal') } },
    },

    /* ── server embedding sendiri (VPS) — SUPERADMIN ── */
    '/api/admin/embedding-servers': {
      get: { summary: 'Daftar server embedding VPS (tanpa token)', security: [sessionAuth],
        responses: { 200: err('daftar server + model terdeteksi') } },
      post: { summary: 'Daftarkan server embedding VPS', security: [sessionAuth],
        requestBody: json(obj({ name: str, baseUrl: str, token: str }, ['name', 'baseUrl', 'token'])),
        responses: { 201: err('server dibuat'), 422: err('alamat non-https / duplikat') } },
    },
    '/api/admin/embedding-servers/{id}': {
      patch: { summary: 'Ubah server (token kosong = tak diubah)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        requestBody: json(obj({ name: str, baseUrl: str, token: str, enabled: { type: 'boolean' } }, [])),
        responses: { 200: err('server diperbarui') } },
      delete: { summary: 'Soft delete server', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('dipindah ke Sampah') } },
    },
    '/api/admin/embedding-servers/trashed': {
      get: { summary: 'Server yang di-soft-delete', security: [sessionAuth],
        responses: { 200: err('daftar Sampah') } },
    },
    '/api/admin/embedding-servers/{id}/restore': {
      patch: { summary: 'Restore server dari Sampah', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('dipulihkan') } },
    },
    '/api/admin/embedding-servers/{id}/test': {
      post: {
        summary: 'Uji koneksi + deteksi model (memanggil /v1/models di server)',
        security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('model terdeteksi & tersimpan'), 422: err('koneksi/token gagal') } },
    },

    '/api/connections/test': {
      post: {
        summary: 'Uji koneksi storage — mengetuk penyedia sungguhan',
        description: 'Membuktikan token masih hidup, refresh berhasil, dan izinnya cukup — tiga hal ' +
          'yang bisa gagal diam-diam dan baru terasa saat sync gagal berjam-jam kemudian. Mengetuk ' +
          'Drive `about` / Graph `/me` (termurah, tak menyentuh dokumen pelanggan).',
        security: [sessionAuth],
        requestBody: json(obj({ id: uuid }, ['id'])),
        responses: {
          200: err('{ ok, account, name, quota, canPickFiles, canScanFolder } atau { ok:false, reason }'),
          400: err('id wajib'), 404: err('koneksi tidak ditemukan'),
        },
      },
    },
    '/api/connections': {
      get: { summary: 'Status koneksi storage user (tanpa token)', security: [sessionAuth],
        responses: { 200: err('provider, scope, expiresAt') } },
    },

    /* ── memory (Obsidian agent L1–L5) ── */
    '/api/memory/run': {
      post: { summary: 'Jalankan Memory Agent L1–L5 utk chatbot', security: [sessionAuth],
        requestBody: json(obj({ chatbotId: uuid }, ['chatbotId'])),
        responses: { 202: json({ $ref: '#/components/schemas/JobStatus' }) } },
      get: { summary: 'Status run terakhir', security: [sessionAuth],
        parameters: [{ name: 'chatbotId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('status') } },
    },
    '/api/memory/graph': {
      get: { summary: 'Knowledge graph (nodes+edges) utk halaman Memory', security: [sessionAuth],
        parameters: [{ name: 'chatbotId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('{ nodes, edges }') } },
    },
    '/api/memory/vault': {
      get: { summary: 'Export vault Obsidian (daftar file .md)', security: [sessionAuth],
        parameters: [{ name: 'chatbotId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('{ files[] }') } },
      post: { summary: 'Write-back vault ke Google Drive user (_nalar-memory/)', security: [sessionAuth],
        requestBody: json(obj({ chatbotId: uuid }, ['chatbotId'])),
        responses: { 200: err('{ uploaded }'), 422: err('Drive belum terhubung') } },
    },

    /* ── settings & usage ── */
    '/api/settings': {
      get: { summary: 'Katalog model + setelan aktif tenant', security: [sessionAuth],
        responses: { 200: err('llmModels, embeddingModels, providers, active') } },
      post: { summary: 'Simpan model aktif / prompt / theme / API keys (terenkripsi)',
        security: [sessionAuth],
        requestBody: json(obj({ activeLlmModel: str, activeEmbeddingModel: str,
          systemPrompt: str, themeConfig: { $ref: '#/components/schemas/ThemeConfig' },
          apiKeys: { type: 'object' } })),
        responses: { 200: err('ok'), 422: err('model tidak dikenal') } },
    },
    '/api/usage': {
      get: { summary: 'Plan, limit, pemakaian periode berjalan', security: [sessionAuth],
        responses: { 200: err('plan, period, messages{used,limit}, tokens, maxChatbots') } },
    },
  },
} as const;
