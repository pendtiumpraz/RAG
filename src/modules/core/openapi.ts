/**
 * OpenAPI 3.1 spec — SATU sumber kebenaran dokumentasi API Nalar.
 * Dilayani di GET /api/openapi (publik). Output Fase 03 (Loop: API docs).
 */

const sessionAuth = { cookieAuth: [] as string[] };
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
    '/api/chatbots/{id}/restore': {
      patch: { summary: 'Pulihkan dari Sampah + kaskade', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 200: err('restored'), 404: err('tidak di Sampah') } },
    },

    /* ── knowledge ── */
    '/api/ingest': {
      post: { summary: 'Ingest teks → chunk → embed → KB chatbot', security: [sessionAuth],
        requestBody: json(obj({ chatbotId: uuid, title: str, text: str, sourceId: uuid },
          ['chatbotId', 'text'])),
        responses: { 200: err('{ chunks }'), 422: err('chatbot tidak valid') } },
    },
    '/api/documents/trashed': {
      get: { summary: 'Dokumen ter-soft-delete', security: [sessionAuth],
        parameters: [{ name: 'chatbotId', in: 'query', required: true, schema: uuid }],
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
        parameters: [{ name: 'chatbotId', in: 'query', required: true, schema: uuid }],
        responses: { 200: err('daftar + jobStatus') } },
      post: { summary: 'Hubungkan sumber (gdrive/onedrive/sharepoint/upload/url) → auto-sync',
        security: [sessionAuth],
        requestBody: json(obj({ chatbotId: uuid, kind: str, config: { type: 'object' } },
          ['chatbotId', 'kind'])),
        responses: { 201: err('source + jobStatus') } },
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
        ],
        responses: { 200: err('totals, topQuestions, topKeywords, topDocuments, daily') } },
    },
    '/api/connections/providers': {
      get: { summary: 'Provider storage mana yang siap dipakai (tanpa menyebut kredensial)',
        security: [sessionAuth],
        responses: { 200: err('{ google: bool, microsoft: bool }') } },
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
