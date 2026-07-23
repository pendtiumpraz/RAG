import {
  pgTable, uuid, text, timestamp, jsonb, vector, index, boolean,
} from 'drizzle-orm/pg-core';

/**
 * Multi-tenant schema — Sainskerta-compliant (RULES-OF-THE-GAME).
 *
 *  • Rule #2 (No Foreign Keys): NO `.references()` constraints. Relations are
 *    plain *_id columns with an index; referential integrity is enforced in
 *    the Service layer (src/modules/**).
 *  • Rule #3 (Soft delete): every table carries `deleted_at` (+ index). Rows
 *    are never hard-deleted; queries filter `deleted_at IS NULL`, and a
 *    /trashed + /:id/restore pair exposes recovery.
 *  • Timestamps: every table has `created_at` + `updated_at`.
 *  • Naming: snake_case columns, plural tables, idx_ indexes.
 *
 * Tenant isolation is still enforced by Postgres Row-Level Security keyed on
 * `tenant_id` (migrations/0001_rls.sql) — orthogonal to soft delete.
 *
 * VECTOR DIMENSIONS: pgvector columns are fixed-width; the widest local model
 * bucket is 4096 dims. Queries always filter (tenant_id, chatbot_id,
 * embedding_model) so vectors of different models are never compared.
 */

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  delIdx: index('idx_tenants_deleted_at').on(t.deletedAt),
}));

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),          // no FK — Rule #2
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').default('member').notNull(), // 'superadmin' | 'admin' | 'member'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  tenantIdx: index('idx_users_tenant_id').on(t.tenantId),
  delIdx: index('idx_users_deleted_at').on(t.deletedAt),
}));

/** Per-tenant settings: the single active LLM + embedding model. */
export const tenantSettings = pgTable('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  activeLlmModel: text('active_llm_model').default('claude-sonnet-5').notNull(),
  activeEmbeddingModel: text('active_embedding_model').default('all-MiniLM-L6-v2').notNull(),
  systemPrompt: text('system_prompt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

/** Encrypted provider API keys, one row per (tenant, provider). */
export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  provider: text('provider').notNull(),          // 'openai' | 'anthropic' | ...
  encryptedKey: text('encrypted_key').notNull(), // AES-256-GCM ciphertext
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  tenantIdx: index('idx_provider_credentials_tenant_id').on(t.tenantId),
  delIdx: index('idx_provider_credentials_deleted_at').on(t.deletedAt),
}));

/**
 * A chatbot = one embeddable ID with its OWN knowledge base.
 * One user can own many chatbots; different chatbot id ⇒ different KB.
 * `public_key` is the token embedded in customer sites (safe to expose).
 */
export const chatbots = pgTable('chatbots', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull().unique(), // e.g. "cb_live_xxx"
  allowedOrigins: jsonb('allowed_origins').$type<string[]>().default([]).notNull(),
  greeting: text('greeting').default('Hi! How can I help?'),
  themeColor: text('theme_color').default('#5B4BFF'),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  tenantIdx: index('idx_chatbots_tenant_id').on(t.tenantId),
  ownerIdx: index('idx_chatbots_owner_id').on(t.ownerId),
  delIdx: index('idx_chatbots_deleted_at').on(t.deletedAt),
}));

/** A connected data source (each user connects their OWN Drive/SharePoint). */
export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  kind: text('kind').notNull(),           // 'gdrive' | 'sharepoint' | 'upload' | 'url'
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  status: text('status').default('pending').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  tenantIdx: index('idx_data_sources_tenant_id').on(t.tenantId),
  chatbotIdx: index('idx_data_sources_chatbot_id').on(t.chatbotId),
  delIdx: index('idx_data_sources_deleted_at').on(t.deletedAt),
}));

/** Chunked + embedded documents. Vectors live here, scoped per chatbot. */
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  embIdx: index('idx_documents_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
  scopeIdx: index('idx_documents_scope').on(t.tenantId, t.chatbotId, t.embeddingModel),
  chatbotIdx: index('idx_documents_chatbot_id').on(t.chatbotId),
  delIdx: index('idx_documents_deleted_at').on(t.deletedAt),
}));

/** Conversations — full history, one row per exchanged message. */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  chatbotId: uuid('chatbot_id').notNull(),
  visitorId: text('visitor_id'),          // anonymous embed visitor
  startedAt: timestamp('started_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => ({
  convIdx: index('idx_messages_conversation').on(t.conversationId, t.createdAt),
  tenantIdx: index('idx_messages_tenant_id').on(t.tenantId),
  delIdx: index('idx_messages_deleted_at').on(t.deletedAt),
}));
