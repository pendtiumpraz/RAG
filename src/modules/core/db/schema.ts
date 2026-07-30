import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, jsonb, vector, index, uniqueIndex, boolean, real, integer, smallint,
  customType,
} from 'drizzle-orm/pg-core';

/** tsvector — tak ada tipe bawaan drizzle; hanya perlu dikenali, tak pernah ditulis dari aplikasi. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/*
 * PENTING — index dari migrasi SQL mentah WAJIB dideklarasikan juga di sini.
 *
 * `drizzle-kit push` menyamakan database dengan berkas ini: index yang hanya
 * dibuat lewat migrations/*.sql dan tidak dideklarasikan di schema DIHAPUS
 * diam-diam oleh push berikutnya. Ini kejadian nyata di produksi 2026-07-27 —
 * push untuk kolom baru ikut menghapus SEMUA unique index parsial (kunci
 * upsert usage_counters, kunci publicKey chatbot, dst.) dan chat langsung
 * gagal mencatat pemakaian. Pemulihannya `npm run db:migrate` (idempotent);
 * pencegahannya deklarasi di bawah, namanya PERSIS sama dengan di migrasi.
 *
 * LEBIH GAWAT LAGI — RLS: drizzle-kit juga mengelola row level security.
 * Tabel yang TIDAK ditandai `.enableRLS()` di sini akan di-DISABLE RLS-nya
 * oleh push. Kejadian nyata 2026-07-28: seluruh isolasi tenant produksi
 * sempat MATI (smoke melaporkan "bocor ke B=YA") gara-gara push kolom biasa.
 * Setiap tabel ber-`tenant_id` di bawah WAJIB diakhiri `.enableRLS()`;
 * policy + FORCE-nya tetap milik migrations/*.sql.
 */

/**
 * Nalar schema — Sainskerta-compliant (RULES-OF-THE-GAME).
 *
 *  • Rule #2 (No Foreign Keys): NO `.references()`. Relations are plain *_id
 *    columns + index; referential integrity lives in the Service layer
 *    (src/modules/x/x.service.ts).
 *  • Rule #3 (Soft delete): every table has `deleted_at` (+ index); rows are
 *    never hard-deleted. Repositories filter `deleted_at IS NULL` and expose
 *    trashed()/restore().
 *  • Timestamps everywhere; snake_case; idx_ index naming.
 *
 * Tenant isolation: Postgres RLS keyed on `tenant_id`
 * (migrations/0001_rls.sql) via withTenant() — orthogonal to soft delete.
 */

/* ── shared column helpers ─────────────────────────────────────────── */
const stamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
};

/* ── tenant ────────────────────────────────────────────────────────── */
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').default('free').notNull(),
  /**
   * Plan berlaku sampai kapan. NULL = tanpa batas waktu.
   *
   * Sengaja tidak terikat penyedia pembayaran mana pun: penagihan manual
   * (transfer → admin mengaktifkan sampai tanggal tertentu) sudah bisa jalan,
   * dan integrasi gateway kelak tinggal mengisi kolom yang sama.
   *
   * Lewat tanggal ini plan EFEKTIF turun ke `free` — penegakannya di
   * usageService.snapshot(), bukan sekadar hiasan di UI.
   */
  planExpiresAt: timestamp('plan_expires_at'),
  /**
   * Workspace OPERATOR PLATFORM (memuat superadmin) — bukan pelanggan.
   *
   * Kuota, batas chatbot, batas anggota, dan laju permintaannya selalu tanpa
   * batas, dan ia tak pernah ditagih. Ditandai sebagai kolom alih-alih
   * disimpulkan dari peran saat query karena `users` ada di bawah RLS;
   * membacanya lintas tenant menuntut escape hatch GUC, dan jalur kuota
   * dipanggil pada tiap giliran chat.
   */
  isPlatform: boolean('is_platform').default(false).notNull(),
  ...stamps,
}, (t) => ({
  delIdx: index('idx_tenants_deleted_at').on(t.deletedAt),
  planExpIdx: index('idx_tenants_plan_expires_at').on(t.planExpiresAt),
  platformIdx: index('idx_tenants_is_platform').on(t.isPlatform).where(sql`is_platform`),
}));

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),          // no FK — Rule #2
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').default('member').notNull(), // 'superadmin' | 'admin' | 'member'
  /** scrypt hash utk login kredensial; NULL utk user OAuth. */
  passwordHash: text('password_hash'),
  /**
   * Gerbang pendaftaran: siapa pun boleh mendaftar, tapi TIDAK bisa login
   * sampai superadmin memverifikasi.
   *   pending  — baru daftar, belum bisa masuk
   *   active   — diverifikasi, boleh masuk
   *   rejected — ditolak superadmin
   * Default 'pending' berlaku untuk SEMUA jalur pendaftaran, termasuk OAuth —
   * kalau tidak, orang tinggal lewat Google dan gerbangnya bocor.
   */
  status: text('status').default('pending').notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by'),                // tanpa FK (Rule #2)
  /**
   * D13 — verifikasi kepemilikan email. NULL = belum klik tautan verifikasi.
   * Hanya ditegakkan bila SMTP dikonfigurasi; user OAuth & user lama
   * (backfill 0020) otomatis terverifikasi.
   */
  emailVerifiedAt: timestamp('email_verified_at'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_users_tenant_id').on(t.tenantId),
  statusIdx: index('idx_users_status').on(t.status),
  delIdx: index('idx_users_deleted_at').on(t.deletedAt),
})).enableRLS();

/** Per-tenant settings: single active LLM + embedding model + dashboard theme. */
export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  activeLlmModel: text('active_llm_model').default('claude-sonnet-5').notNull(),
  activeEmbeddingModel: text('active_embedding_model').default('all-MiniLM-L6-v2').notNull(),
  systemPrompt: text('system_prompt'),
  /** White-label theme for the tenant dashboard (brand, colors, radius, font…). */
  themeConfig: jsonb('theme_config').$type<ThemeConfig>(),
  ...stamps,
}).enableRLS();

/**
 * Bentuk tema white-label — HARUS cocok dengan yang dibaca `public/embed.js`.
 *
 * Nama field di sini adalah kontrak: widget hanya menghormati kunci di bawah.
 * (Versi sebelumnya menyebut `primary`/`accent`/`answerFont`/`button` yang tak
 * pernah dibaca siapa pun, sementara `signal`/`source`/`showTrace` yang justru
 * dipakai tidak terdaftar — akibatnya kode yang menuruti tipe ini menghasilkan
 * pengaturan yang diam-diam tak berefek.)
 */
export interface ThemeConfig {
  brand?: {
    /** Nama yang tampil di kepala widget. */
    name?: string;
    /** Satu-dua huruf untuk kotak logo. */
    logo?: string;
    logoUrl?: string;
  };
  theme?: {
    /** Warna interaktif utama (tombol, bubble pengguna). */
    signal?: string;
    /** Warna sitasi/sumber. */
    source?: string;
    /** CSS length, mis. "12px". */
    radius?: string;
    mode?: 'light' | 'dark';
    position?: 'left' | 'right';
    /** Tampilkan jejak retrieval di widget. */
    showTrace?: boolean;
  };
}

/* ── undangan anggota tim ──────────────────────────────────────────── */
/**
 * Undangan bergabung ke tenant yang SUDAH ADA.
 *
 * Bedanya dengan pendaftaran biasa: signup publik selalu membuat tenant baru,
 * sedangkan undangan menempelkan user ke tenant pengundang. Karena itu
 * penerimaannya punya jalur sendiri, bukan lewat /api/auth/signup.
 *
 * `token_hash` = SHA-256 dari token. Token aslinya hanya pernah ada di layar
 * pengundang; bocornya isi tabel ini tidak memberi siapa pun akses masuk.
 * SHA-256 (bukan scrypt) karena tokennya sudah 256-bit acak — tak ada yang
 * bisa ditebak — dan pencarian harus deterministik.
 */
export const invitations = pgTable('invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  email: text('email').notNull(),
  role: text('role').default('member').notNull(),   // 'admin' | 'member'
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by').notNull(),          // tanpa FK (Rule #2)
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  acceptedUserId: uuid('accepted_user_id'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_invitations_tenant_id').on(t.tenantId),
  tokenIdx: index('idx_invitations_token_hash').on(t.tokenHash),
  delIdx: index('idx_invitations_deleted_at').on(t.deletedAt),
})).enableRLS();

/* ── settings / credentials ────────────────────────────────────────── */
export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  provider: text('provider').notNull(),          // 'openai' | 'anthropic' | …
  encryptedKey: text('encrypted_key').notNull(), // AES-256-GCM ciphertext
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_provider_credentials_tenant_id').on(t.tenantId),
  delIdx: index('idx_provider_credentials_deleted_at').on(t.deletedAt),
})).enableRLS();

/* ── chatbot ───────────────────────────────────────────────────────── */
export const chatbots = pgTable('chatbots', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull().unique(), // "cb_live_xxx" — safe to expose
  allowedOrigins: jsonb('allowed_origins').$type<string[]>().default([]).notNull(),
  greeting: text('greeting').default('Halo! Ada yang bisa dibantu?'),
  /**
   * D11 — konteks kepemilikan/persona chatbot ("Chatbot divisi HR, menjawab
   * kebijakan karyawan; gaya formal"). Disuntikkan ke system prompt CHATBOT
   * INI SAJA, di atas system prompt tenant. Enterprise: tiap divisi punya
   * chatbot dengan watak dan lingkupnya sendiri.
   */
  context: text('context'),
  /**
   * Logo unggahan (data URL base64, cap ±300KB di service). Di DB — bukan
   * blob storage — agar identik di SaaS & on-prem dan ikut RLS/backup.
   * Dilayani via /api/chat/{publicKey}/logo; theme JSON tetap ringan.
   */
  logo: text('logo'),
  /** Per-chatbot white-label theme served to embed.js. */
  themeConfig: jsonb('theme_config').$type<ThemeConfig>(),
  enabled: boolean('enabled').default(true).notNull(),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_chatbots_tenant_id').on(t.tenantId),
  ownerIdx: index('idx_chatbots_owner_id').on(t.ownerId),
  delIdx: index('idx_chatbots_deleted_at').on(t.deletedAt),
  /** Lookup embed publik (migrasi 0013) — versi parsial agar publicKey bisa
   *  dipakai ulang setelah chatbot di-soft-delete. */
  uqPublicKey: uniqueIndex('uq_chatbots_public_key')
    .on(t.publicKey).where(sql`deleted_at IS NULL`),
})).enableRLS();

/* ── knowledge ─────────────────────────────────────────────────────── */
/**
 * D11 — KB adalah ENTITAS MANDIRI per tenant, bukan milik satu chatbot.
 * Sumber & dokumen menempel ke KB; chatbot memakainya lewat assignment N:M
 * (`chatbot_knowledge_bases`). Satu folder Drive di-ingest SEKALI, dipakai
 * berapa pun chatbot — tanpa duplikasi embedding.
 */
export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_knowledge_bases_tenant_id').on(t.tenantId),
  delIdx: index('idx_knowledge_bases_deleted_at').on(t.deletedAt),
})).enableRLS();

/** Assignment N:M chatbot ↔ KB. Baris hidup = KB aktif utk chatbot itu. */
export const chatbotKnowledgeBases = pgTable('chatbot_knowledge_bases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  knowledgeBaseId: uuid('knowledge_base_id').notNull(),
  ...stamps,
}, (t) => ({
  chatbotIdx: index('idx_ckb_chatbot').on(t.chatbotId),
  kbIdx: index('idx_ckb_kb').on(t.knowledgeBaseId),
  delIdx: index('idx_ckb_deleted_at').on(t.deletedAt),
  uqPair: uniqueIndex('uq_ckb_chatbot_kb')
    .on(t.chatbotId, t.knowledgeBaseId).where(sql`deleted_at IS NULL`),
})).enableRLS();

export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  knowledgeBaseId: uuid('knowledge_base_id').notNull(),
  kind: text('kind').notNull(),           // 'gdrive' | 'onedrive' | 'sharepoint' | 'upload' | 'url'
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  status: text('status').default('pending').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_data_sources_tenant_id').on(t.tenantId),
  kbIdx: index('idx_data_sources_kb').on(t.knowledgeBaseId),
  delIdx: index('idx_data_sources_deleted_at').on(t.deletedAt),
})).enableRLS();

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  knowledgeBaseId: uuid('knowledge_base_id').notNull(),
  sourceId: uuid('source_id'),
  title: text('title'),
  content: text('content').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  /**
   * Dimensi ASLI model, sebelum zero-padding ke 1536 (migrasi 0028).
   *
   * Menentukan indeks parsial mana yang dipakai. Karena paddingnya nol, jarak
   * kosinus atas N dimensi pertama IDENTIK dengan jarak atas 1536 dimensi
   * berpadding — terbukti selisih 0 terhadap data produksi — sehingga indeks
   * berdimensi asli memangkas RAM ±3,75× tanpa mengubah hasil sama sekali.
   */
  embeddingDims: smallint('embedding_dims'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  /** Delta sync: id file di storage asal (Drive fileId / Graph itemId). */
  externalId: text('external_id'),
  /** Versi upstream (Drive modifiedTime / Graph eTag) — pembanding delta sync. */
  externalVersion: text('external_version'),
  /**
   * Kaki LEKSIKAL hybrid search (migrasi 0027) — judul + isi, konfigurasi
   * `simple`. Kolom TERGENERASI: tak ada jalur tulis yang bisa lupa
   * memperbaruinya, dan aplikasi tak pernah mengisinya sendiri.
   *
   * Dinyatakan di sini semata agar `drizzle-kit push` tidak menghapusnya —
   * kolom & indeks yang hanya lahir dari migrasi SQL akan dibuang diam-diam
   * oleh push berikutnya (lihat catatan di kepala berkas ini).
   */
  fts: tsvector('fts').generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))`,
  ),
  ...stamps,
}, (t) => ({
  embIdx: index('idx_documents_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
  scopeIdx: index('idx_documents_scope').on(t.tenantId, t.knowledgeBaseId, t.embeddingModel),
  kbIdx: index('idx_documents_kb').on(t.knowledgeBaseId),
  externalIdx: index('idx_documents_external').on(t.sourceId, t.externalId),
  delIdx: index('idx_documents_deleted_at').on(t.deletedAt),
  /* Kaki leksikal hybrid search (migrasi 0027). WAJIB dideklarasikan di sini:
     drizzle-kit push menghapus indeks & kolom yang tak dinyatakan di schema. */
  ftsIdx: index('idx_documents_fts').using('gin', t.fts),
  /* Indeks vektor berdimensi asli (migrasi 0028). Ekspresi subvector-nya
     tak bisa dinyatakan drizzle, jadi hanya NAMA-nya yang didaftarkan di
     sini — cukup untuk mencegah  menghapusnya, dan itulah
     satu-satunya alasan baris ini ada. Definisi sebenarnya di migrasi. */
  dimsIdx: index('idx_documents_dims').on(t.embeddingDims),
})).enableRLS();

/* ── chat ──────────────────────────────────────────────────────────── */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  visitorId: text('visitor_id'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_conversations_tenant_id').on(t.tenantId),
  chatbotIdx: index('idx_conversations_chatbot_id').on(t.chatbotId),
  delIdx: index('idx_conversations_deleted_at').on(t.deletedAt),
})).enableRLS();

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').notNull(),           // 'user' | 'assistant' | 'system'
  /** Teks polos — dipakai analytics, estimasi token, dan riwayat prompt LLM. */
  content: text('content').notNull(),
  /** `title` disimpan ikut — riwayat harus bisa MENYEBUT dokumen rujukannya,
   *  bukan menampilkan potongan UUID (baris lama tanpa title: fallback id). */
  citations: jsonb('citations').$type<Array<{ documentId: string; score: number; title?: string | null }>>(),
  /**
   * Jawaban TERSTRUKTUR (chat/blocks.ts): [{type:'text'|'list'|'cards'|'chart',…}].
   * Frontend merender ini jadi bubble/daftar/kartu/chart; `content` tetap
   * padanan teks polosnya. NULL utk pesan user & pesan lama pra-fitur.
   */
  blocks: jsonb('blocks').$type<unknown[]>(),
  ...stamps,
}, (t) => ({
  convIdx: index('idx_messages_conversation').on(t.conversationId, t.createdAt),
  tenantIdx: index('idx_messages_tenant_id').on(t.tenantId),
  delIdx: index('idx_messages_deleted_at').on(t.deletedAt),
})).enableRLS();

/* ── usage metering (kuota per plan, dasar billing) ────────────────── */
/** Satu baris per (tenant, periode YYYY-MM). Di-increment tiap giliran chat. */
export const usageCounters = pgTable('usage_counters', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  period: text('period').notNull(),               // "2026-07"
  messages: integer('messages').default(0).notNull(),
  tokensIn: integer('tokens_in').default(0).notNull(),
  tokensOut: integer('tokens_out').default(0).notNull(),
  ...stamps,
}, (t) => ({
  scopeIdx: index('idx_usage_counters_scope').on(t.tenantId, t.period),
  delIdx: index('idx_usage_counters_deleted_at').on(t.deletedAt),
  /** Kunci upsert recordTurn — `on conflict (tenant_id, period) where …`. */
  uqScope: uniqueIndex('uq_usage_counters_tenant_period')
    .on(t.tenantId, t.period).where(sql`deleted_at IS NULL`),
})).enableRLS();

/* ── pembayaran (D12) ──────────────────────────────────────────────── */
/** SATU baris (id=1): mode deploy & harga plan — di DB, bukan env. */
export const platformSettings = pgTable('platform_settings', {
  id: smallint('id').primaryKey().default(1),
  /** 'saas' = pembayaran & kuota aktif · 'onprem' = bayar mati, SEMUA unlimited. */
  deploymentMode: text('deployment_mode').default('saas').notNull(),
  /** Harga plan IDR/bulan, diedit superadmin: { pro: 299000, enterprise: … } */
  planPrices: jsonb('plan_prices').$type<Record<string, number>>()
    .default({ pro: 299000, enterprise: 1499000 }).notNull(),
  /** D13 — SMTP: { host, port, secure, user, fromName, fromEmail }. */
  smtpConfig: jsonb('smtp_config').$type<Record<string, string | number | boolean>>(),
  /** App password SMTP (AES-256-GCM) — tak pernah dibaca balik ke browser. */
  encryptedSmtpPassword: text('encrypted_smtp_password'),
  ...stamps,
});

/** D13 — token verifikasi email & reset password (disimpan HASH-nya).
 *  Tanpa RLS: dipakai dari tautan email publik tanpa sesi. */
export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),            // 'verify' | 'reset'
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  ...stamps,
}, (t) => ({
  userIdx: index('idx_auth_tokens_user').on(t.userId),
  delIdx: index('idx_auth_tokens_deleted_at').on(t.deletedAt),
  uqHash: uniqueIndex('uq_auth_tokens_hash').on(t.tokenHash).where(sql`deleted_at IS NULL`),
}));

/** Kredensial gateway (platform, tanpa RLS — pola oauth_apps): secret AES,
 *  hanya SATU provider `active` pada satu waktu (ditegakkan service). */
export const paymentGateways = pgTable('payment_gateways', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull(),          // 'midtrans' | 'tripay' | 'xendit'
  encryptedSecret: text('encrypted_secret').notNull(),
  publicConfig: jsonb('public_config').$type<Record<string, string | boolean>>().default({}).notNull(),
  active: boolean('active').default(false).notNull(),
  ...stamps,
}, (t) => ({
  delIdx: index('idx_payment_gateways_deleted_at').on(t.deletedAt),
  uqProvider: uniqueIndex('uq_payment_gateways_provider')
    .on(t.provider).where(sql`deleted_at IS NULL`),
}));

/** Transaksi QRIS per tenant. pending → paid via webhook signature-verified. */
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  plan: text('plan').notNull(),
  months: integer('months').default(1).notNull(),
  amount: integer('amount').notNull(),           // IDR utuh
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  qrString: text('qr_string'),
  qrImageUrl: text('qr_image_url'),
  status: text('status').default('pending').notNull(), // pending|paid|expired|failed
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'),
  rawCallback: jsonb('raw_callback'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_payments_tenant_id').on(t.tenantId),
  delIdx: index('idx_payments_deleted_at').on(t.deletedAt),
  uqRef: uniqueIndex('uq_payments_provider_ref')
    .on(t.provider, t.providerRef).where(sql`deleted_at IS NULL`),
})).enableRLS();

/* ── akses programatik: API key masuk & webhook keluar ─────────────── */
/**
 * Kunci API per tenant.
 *
 * Yang tersimpan HANYA sha256 dari kunci penuh — kunci mentahnya ditampilkan
 * sekali saat dibuat lalu hilang. Dengan begitu bocornya database tidak dengan
 * sendirinya menyerahkan akses API. `prefix` disimpan terpisah agar UI tetap
 * bisa membedakan kunci tanpa menyimpan nilai yang berguna bagi penyerang.
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().default(['read']).notNull(),
  createdBy: uuid('created_by'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_api_keys_tenant').on(t.tenantId),
  delIdx: index('idx_api_keys_deleted_at').on(t.deletedAt),
  uqHash: uniqueIndex('uq_api_keys_hash').on(t.keyHash).where(sql`deleted_at IS NULL`),
})).enableRLS();

/** Webhook keluar. Body ditandatangani HMAC-SHA256 dengan `encryptedSecret`. */
export const webhooks = pgTable('webhooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  url: text('url').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  /** jejak pengiriman TERAKHIR — cukup untuk menjawab "gagal kenapa, kapan" */
  lastStatus: integer('last_status'),
  lastAttemptAt: timestamp('last_attempt_at'),
  lastError: text('last_error'),
  failCount: integer('fail_count').default(0).notNull(),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_webhooks_tenant').on(t.tenantId),
  delIdx: index('idx_webhooks_deleted_at').on(t.deletedAt),
})).enableRLS();

/* ── backlog kanban (D15) — PLATFORM, tanpa RLS ────────────────────── */
/** Papan pekerjaan produk di Dataroom. `track` memisah yang butuh manusia
 *  (kredensial/keputusan/pihak ketiga) dari yang bisa dikerjakan agen. */
export const backlogItems = pgTable('backlog_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull(),
  track: text('track').notNull(),          // 'human' | 'agent'
  dimension: text('dimension').notNull(),  // uiux | agentic | feature | launch
  title: text('title').notNull(),
  why: text('why').notNull(),
  size: text('size').default('M').notNull(),
  blocked: text('blocked'),
  status: text('status').default('todo').notNull(), // todo | doing | done
  /** P0 kerjakan dulu · P1 penting · P2 normal · P3 nanti. Terpisah dari
   *  `position` supaya menyeret kartu tak mengubah penilaian kepentingannya. */
  priority: text('priority').default('P2').notNull(),
  position: integer('position').default(0).notNull(),
  ...stamps,
}, (t) => ({
  boardIdx: index('idx_backlog_track_status').on(t.track, t.status, t.position),
  delIdx: index('idx_backlog_deleted_at').on(t.deletedAt),
  uqKey: uniqueIndex('uq_backlog_key').on(t.key).where(sql`deleted_at IS NULL`),
}));

/* ── kredensial OAuth app — PLATFORM, bukan per-tenant ─────────────── */
/**
 * Client ID & secret aplikasi OAuth (Google / Microsoft).
 *
 * PERKECUALIAN yang sama seperti `embedding_servers`: tanpa `tenant_id`, tanpa
 * RLS. Ini kredensial APLIKASI, bukan data tenant — satu pasang dipakai semua
 * tenant untuk login dan menghubungkan penyimpanan.
 *
 * Kendali aksesnya di layer aplikasi: hanya `requireRole('superadmin')`.
 * `client_secret` dienkripsi AES-256-GCM dan TAK PERNAH dikirim ke browser —
 * API hanya melaporkan ada/tidaknya.
 *
 * Kenapa di database, bukan env: mengganti kredensial lewat env menuntut
 * redeploy, dan itu membuat pemulihan saat secret Microsoft kedaluwarsa
 * (maks. 24 bulan) jadi lambat. Env tetap didukung sebagai cadangan untuk
 * on-prem/dev — lihat oauth-app.service.
 */
export const oauthApps = pgTable('oauth_apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull(),          // 'google' | 'microsoft'
  clientId: text('client_id').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  /** Microsoft saja: 'common' | 'organizations' | GUID direktori. */
  msTenantId: text('ms_tenant_id'),
  /**
   * Google saja — keputusan D10. Cara aplikasi mengakses Drive:
   *  'full'   = scan folder rekursif (scope drive.readonly — RESTRICTED di
   *             Google, memicu verifikasi berat: video demo + CASA tahunan)
   *  'picker' = pengguna memilih berkas via Google Picker (drive.file saja —
   *             bukan restricted, verifikasi ringan). Pilihan SaaS.
   */
  driveAccessMode: text('drive_access_mode').default('full').notNull(),
  /**
   * API key browser untuk Google Picker (opsional; BUKAN rahasia — key jenis
   * ini memang dipakai client-side dan dibatasi per-referrer di Console).
   */
  pickerApiKey: text('picker_api_key'),
  /**
   * Google saja — API key SERVER-SIDE untuk membaca folder publik tanpa OAuth
   * (jenis sumber `gdrive_public`). Berbeda dari `pickerApiKey`: yang itu
   * memang dikirim ke browser, yang ini tidak pernah — karena itu terenkripsi.
   */
  encryptedDriveApiKey: text('encrypted_drive_api_key'),
  enabled: boolean('enabled').default(true).notNull(),
  ...stamps,
}, (t) => ({
  providerIdx: index('idx_oauth_apps_provider').on(t.provider),
  delIdx: index('idx_oauth_apps_deleted_at').on(t.deletedAt),
  /** Satu kredensial hidup per provider (migrasi 0014). */
  uqProvider: uniqueIndex('uq_oauth_apps_provider')
    .on(t.provider).where(sql`deleted_at IS NULL`),
}));

/* ── server LLM sendiri (on-prem/VPS) — PLATFORM, bukan per-tenant ─── */
/**
 * Server LLM yang dijalankan sendiri: Ollama, vLLM, LM Studio, LocalAI,
 * llama.cpp — semuanya berbicara protokol OpenAI (`/v1/chat/completions`).
 *
 * Kenapa ada: tanpa ini, `DEPLOYMENT_MODE=onprem` sebenarnya menyesatkan.
 * Embedding sudah bisa berjalan sepenuhnya lokal, tapi jawabannya tetap harus
 * menempuh API cloud — jadi pemasangan yang benar-benar tertutup mustahil.
 *
 * Bentuknya sengaja MENIRU `embedding_servers`: tabel PLATFORM tanpa
 * `tenant_id`/RLS, token terenkripsi AES-256-GCM, hanya superadmin.
 */
export const llmServers = pgTable('llm_servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  /** Base URL sampai `/v1`, mis. http://10.0.0.5:11434/v1 */
  baseUrl: text('base_url').notNull(),
  /** Boleh kosong: Ollama/LM Studio di jaringan tertutup lazim tanpa auth. */
  encryptedToken: text('encrypted_token'),
  enabled: boolean('enabled').default(true).notNull(),
  /** Model yang dilaporkan server saat "Test koneksi". */
  models: jsonb('models').$type<Array<{ id: string }>>().default([]).notNull(),
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
  ...stamps,
}, (t) => ({
  enabledIdx: index('idx_llm_servers_enabled').on(t.enabled),
  delIdx: index('idx_llm_servers_deleted_at').on(t.deletedAt),
  /** Satu server hidup per base_url (migrasi 0015). */
  uqBaseUrl: uniqueIndex('uq_llm_servers_base_url')
    .on(t.baseUrl).where(sql`deleted_at IS NULL`),
}));

/* ── server embedding sendiri (VPS) — PLATFORM, bukan per-tenant ───── */
/**
 * PERKECUALIAN yang disengaja: tabel ini **tidak punya `tenant_id`** dan
 * **tidak dilindungi RLS**, berbeda dari semua tabel lain di skema ini.
 *
 * Alasannya: server embedding adalah INFRASTRUKTUR bersama — sama seperti
 * model host — bukan data milik tenant. Satu server melayani semua tenant;
 * yang tetap terpisah per-tenant adalah vektor hasilnya.
 *
 * Karena RLS tidak menjaga tabel ini, kendali aksesnya ada di layer aplikasi:
 * SEMUA rute yang menyentuhnya wajib `requireRole('superadmin')`. Tokennya
 * disimpan terenkripsi AES-256-GCM, jadi bocornya baris pun tak membuka token
 * tanpa CREDENTIALS_ENCRYPTION_KEY.
 */
export const embeddingServers = pgTable('embedding_servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  /** Base URL, tanpa slash akhir. Wajib https kecuali loopback. */
  baseUrl: text('base_url').notNull(),
  encryptedToken: text('encrypted_token'),
  enabled: boolean('enabled').default(true).notNull(),
  /** Model yang dilaporkan server saat "Test koneksi" — sumber dropdown. */
  models: jsonb('models').$type<DiscoveredModel[]>().default([]).notNull(),
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
  ...stamps,
}, (t) => ({
  enabledIdx: index('idx_embedding_servers_enabled').on(t.enabled),
  delIdx: index('idx_embedding_servers_deleted_at').on(t.deletedAt),
  /** Satu server hidup per base_url (migrasi 0008). */
  uqBaseUrl: uniqueIndex('uq_embedding_servers_base_url')
    .on(t.baseUrl).where(sql`deleted_at IS NULL`),
}));

/** Satu model yang dilayani sebuah server embedding. */
export interface DiscoveredModel {
  id: string;
  dimensions: number;
  dtype?: string;
  loaded?: boolean;
}

/* ── koneksi OAuth per-user (Drive/OneDrive/SharePoint) ────────────── */
/** Token OAuth user utk akses storage MEREKA sendiri. Terenkripsi AES-256-GCM. */
export const oauthConnections = pgTable('oauth_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').notNull(),           // 'google' | 'microsoft'
  /** Email akun yang terhubung — memungkinkan BANYAK akun per provider. */
  accountEmail: text('account_email').default('').notNull(),
  accountLabel: text('account_label'),            // nama tampilan opsional
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  expiresAt: timestamp('expires_at'),
  scope: text('scope'),
  ...stamps,
}, (t) => ({
  scopeIdx: index('idx_oauth_connections_scope').on(t.tenantId, t.userId, t.provider),
  delIdx: index('idx_oauth_connections_deleted_at').on(t.deletedAt),
  /** Multi-akun: satu koneksi hidup per (user, provider, email) — migrasi 0006. */
  uqAccount: uniqueIndex('uq_oauth_connections_user_provider_account')
    .on(t.userId, t.provider, t.accountEmail).where(sql`deleted_at IS NULL`),
})).enableRLS();

/* ── audit log (Guardrail L5) ──────────────────────────────────────── */
/** Jejak semua aksi penting: chat turn, auth, perubahan settings, guardrail hit. */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actor: text('actor').notNull(),           // userId | 'visitor:<id>' | 'system'
  action: text('action').notNull(),         // 'chat.turn' | 'auth.signup' | 'guardrail.block' | …
  subject: text('subject'),                 // id objek terkait (chatbotId, dsb.)
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_audit_logs_tenant_id').on(t.tenantId),
  actionIdx: index('idx_audit_logs_action').on(t.action, t.createdAt),
  delIdx: index('idx_audit_logs_deleted_at').on(t.deletedAt),
  createdIdx: index('idx_audit_logs_created_at').on(t.createdAt.desc()),
})).enableRLS();

/* ── memory (Obsidian Memory Agent) ────────────────────────────────── */
/**
 * Markdown notes with [[wikilinks]] — Obsidian-compatible. `slug` is the
 * note filename (kebab-case) inside the `_nalar-memory/` vault; `linksTo`
 * caches outgoing [[slug]] links for cheap backlink queries; `memoryEdges`
 * stores the resolved graph (wikilink + vector-similarity edges).
 */
export const memoryNotes = pgTable('memory_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  slug: text('slug').notNull(),           // e.g. "kebijakan-garansi"
  title: text('title').notNull(),
  contentMd: text('content_md').notNull(),// markdown incl. frontmatter + [[wikilinks]]
  linksTo: jsonb('links_to').$type<string[]>().default([]).notNull(),
  sourceDocumentId: uuid('source_document_id'),
  embedding: vector('embedding', { dimensions: 1536 }),
  ...stamps,
}, (t) => ({
  scopeIdx: index('idx_memory_notes_scope').on(t.tenantId, t.chatbotId, t.slug),
  delIdx: index('idx_memory_notes_deleted_at').on(t.deletedAt),
})).enableRLS();

export const memoryEdges = pgTable('memory_edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  fromNoteId: uuid('from_note_id').notNull(),
  toNoteId: uuid('to_note_id').notNull(),
  kind: text('kind').default('wikilink').notNull(), // 'wikilink' | 'similarity'
  weight: real('weight').default(1).notNull(),
  ...stamps,
}, (t) => ({
  fromIdx: index('idx_memory_edges_from').on(t.fromNoteId),
  toIdx: index('idx_memory_edges_to').on(t.toNoteId),
  scopeIdx: index('idx_memory_edges_scope').on(t.tenantId, t.chatbotId),
  delIdx: index('idx_memory_edges_deleted_at').on(t.deletedAt),
})).enableRLS();
