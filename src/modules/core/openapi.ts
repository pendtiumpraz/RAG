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
      post: { summary: 'Re-sync manual (job, dedup otomatis)', security: [sessionAuth],
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { 202: json({ $ref: '#/components/schemas/JobStatus' }) } },
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
