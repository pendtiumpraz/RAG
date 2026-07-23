import {
  pgTable, uuid, text, timestamp, jsonb, vector, index, boolean, real, integer,
} from 'drizzle-orm/pg-core';

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
  ...stamps,
}, (t) => ({
  delIdx: index('idx_tenants_deleted_at').on(t.deletedAt),
}));

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),          // no FK — Rule #2
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').default('member').notNull(), // 'superadmin' | 'admin' | 'member'
  /** scrypt hash utk login kredensial; NULL utk user OAuth. */
  passwordHash: text('password_hash'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_users_tenant_id').on(t.tenantId),
  delIdx: index('idx_users_deleted_at').on(t.deletedAt),
}));

/** Per-tenant settings: single active LLM + embedding model + dashboard theme. */
export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  activeLlmModel: text('active_llm_model').default('claude-sonnet-5').notNull(),
  activeEmbeddingModel: text('active_embedding_model').default('all-MiniLM-L6-v2').notNull(),
  systemPrompt: text('system_prompt'),
  /** White-label theme for the tenant dashboard (brand, colors, radius, font…). */
  themeConfig: jsonb('theme_config').$type<ThemeConfig>(),
  ...stamps,
});

/** White-label theme shape shared by tenant dashboard & chatbot widgets. */
export interface ThemeConfig {
  brand?: { name?: string; logo?: string; logoUrl?: string };
  theme?: {
    primary?: string; accent?: string; radius?: string;
    answerFont?: string; button?: 'solid' | 'soft' | 'outline';
    mode?: 'light' | 'dark'; position?: 'left' | 'right';
  };
}

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
}));

/* ── chatbot ───────────────────────────────────────────────────────── */
export const chatbots = pgTable('chatbots', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull().unique(), // "cb_live_xxx" — safe to expose
  allowedOrigins: jsonb('allowed_origins').$type<string[]>().default([]).notNull(),
  greeting: text('greeting').default('Halo! Ada yang bisa dibantu?'),
  /** Per-chatbot white-label theme served to embed.js. */
  themeConfig: jsonb('theme_config').$type<ThemeConfig>(),
  enabled: boolean('enabled').default(true).notNull(),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_chatbots_tenant_id').on(t.tenantId),
  ownerIdx: index('idx_chatbots_owner_id').on(t.ownerId),
  delIdx: index('idx_chatbots_deleted_at').on(t.deletedAt),
}));

/* ── knowledge ─────────────────────────────────────────────────────── */
export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  kind: text('kind').notNull(),           // 'gdrive' | 'onedrive' | 'sharepoint' | 'upload' | 'url'
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  status: text('status').default('pending').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  ...stamps,
}, (t) => ({
  tenantIdx: index('idx_data_sources_tenant_id').on(t.tenantId),
  chatbotIdx: index('idx_data_sources_chatbot_id').on(t.chatbotId),
  delIdx: index('idx_data_sources_deleted_at').on(t.deletedAt),
}));

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  sourceId: uuid('source_id'),
  title: text('title'),
  content: text('content').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  embedding: vector('embedding', { dimensions: 4096 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  ...stamps,
}, (t) => ({
  embIdx: index('idx_documents_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
  scopeIdx: index('idx_documents_scope').on(t.tenantId, t.chatbotId, t.embeddingModel),
  chatbotIdx: index('idx_documents_chatbot_id').on(t.chatbotId),
  delIdx: index('idx_documents_deleted_at').on(t.deletedAt),
}));

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
}));

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').notNull(),           // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  citations: jsonb('citations').$type<Array<{ documentId: string; score: number }>>(),
  ...stamps,
}, (t) => ({
  convIdx: index('idx_messages_conversation').on(t.conversationId, t.createdAt),
  tenantIdx: index('idx_messages_tenant_id').on(t.tenantId),
  delIdx: index('idx_messages_deleted_at').on(t.deletedAt),
}));

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
}));

/* ── koneksi OAuth per-user (Drive/OneDrive/SharePoint) ────────────── */
/** Token OAuth user utk akses storage MEREKA sendiri. Terenkripsi AES-256-GCM. */
export const oauthConnections = pgTable('oauth_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').notNull(),           // 'google' | 'microsoft'
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  expiresAt: timestamp('expires_at'),
  scope: text('scope'),
  ...stamps,
}, (t) => ({
  scopeIdx: index('idx_oauth_connections_scope').on(t.tenantId, t.userId, t.provider),
  delIdx: index('idx_oauth_connections_deleted_at').on(t.deletedAt),
}));

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
}));

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
  embedding: vector('embedding', { dimensions: 4096 }),
  ...stamps,
}, (t) => ({
  scopeIdx: index('idx_memory_notes_scope').on(t.tenantId, t.chatbotId, t.slug),
  delIdx: index('idx_memory_notes_deleted_at').on(t.deletedAt),
}));

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
}));
