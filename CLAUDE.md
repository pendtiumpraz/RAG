# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Nalar** — multi-tenant RAG engine (SaaS + on-prem). Next.js 15 App Router + React 19, Drizzle ORM, Postgres + pgvector. Production runs on Vercel + Neon (`rag.sainskerta.net`); on-prem via `docker-compose.yml`. Much of the docs/comments are in Indonesian — keep that bilingual style when editing them.

## Commands

```bash
npm run dev            # Next.js dev server
npm run build          # production build (also the typecheck gate)
npm run lint           # next lint
npm test               # unit tests: node --import tsx --test tests/*.test.ts (no DB needed)
node --import tsx --test tests/core.test.ts --test-name-pattern "crypto"   # single test
npm run smoke          # scripts/smoke.ts against a real DB (needs .env)
npm run db:push        # drizzle-kit push (schema)
npm run db:migrate     # runs raw SQL in migrations/ (pgvector, RLS, …) — required after db:push
npm run db:setup-role  # creates NOBYPASSRLS role `nalar_app` (RLS only works via this role)
```

Unit tests stub `DATABASE_URL`/`CREDENTIALS_ENCRYPTION_KEY` at the top of the test file before dynamic-importing modules — follow that pattern for new tests.

## Hard rules (loop/RULES-OF-THE-GAME.md — mandatory, no exceptions)

The project follows the "Sainskerta Loop" workflow in `loop/`. The rules that shape all code here:

- **No foreign key constraints.** Relations are plain `*_id` columns + index (never `.references()` in `schema.ts`); referential integrity and cascade deletes live in the Service layer.
- **Soft delete everywhere.** Every table has `deleted_at`; repositories filter `deleted_at IS NULL` and every resource exposes `GET /api/{resource}/trashed` and `PATCH /api/{resource}/{id}/restore`. Never hard-delete.
- **No dummy/hardcoded data in the frontend.** Pages call real APIs (`src/app/_lib/api.ts` `useApi` hook) with honest loading/empty/error states.
- **CRUD in one page** with a **right-side drawer** (400px) for create/edit forms; sidebar icons are single solid-color inline SVGs.
- **snake_case** for all DB tables/columns; migrations only (never edit schema manually in the DB).
- **Architecture decisions are the user's.** Record them in `architecture-decisions.md` (Decision → Context → Status) and get approval before big changes.
- **`progress.md` is the single source of truth for project status** — update it when phase/status changes. (`.claude/loop.md` is the loop state file but lags behind; trust `progress.md`.)

## Architecture

Modular monolith under `src/modules/{core,auth,chatbot,chat,knowledge,connections,memory,settings,usage}`, each with Repository + Service. Modules do not cross-import services for side-effects — they dispatch typed events on the in-process bus (`src/modules/core/events.ts`, `NalarEvents` map); background work runs through the job runner `src/modules/core/jobs.ts`. API routes in `src/app/api/*` are thin wrappers over services. UI pages live in `src/app/(app)/*` behind `src/middleware.ts` (embed/chat routes stay public).

### Tenant isolation (the load-bearing invariant)

Postgres **Row-Level Security** keyed on `tenant_id`, enforced by `withTenant(tenantId, fn)` in `src/modules/core/db/tenant-context.ts` — it pins `app.current_tenant` inside a transaction so cross-tenant leaks are impossible even with buggy queries. All tenant-scoped DB access must go through `withTenant()`. RLS policies are in `migrations/0001_rls.sql`. Critically, the app must connect as the `nalar_app` role (NOBYPASSRLS) — connecting as the DB owner silently bypasses RLS (this was a real bug, see `audit-report.md`).

### Chat request flow

`public/embed.js` (embeddable widget) → `POST /api/chat/[chatbotId]` with the chatbot's `publicKey` (`cb_live_…`) → `resolveChatbotByPublicKey` (runs outside tenant scope) + allowed-origins check → `withTenant()` → retrieval (`chat/retrieval.service.ts`, pgvector filtered by `chatbot_id` + embedding model) + conversation history → `chat/chat.service.ts` streams SSE from the active LLM. The pipeline passes through 5-layer guardrails (`core/guardrails.ts`: input sanitize, anti prompt-injection, execution budget, secret redaction + citation enforcement, audit log) and 2-layer rate limiting + monthly quota (`core/limits.ts`, `modules/usage/`).

### Models & embeddings

`src/modules/core/registry.ts` is the **single source** for all selectable LLM and embedding models — adding a model = adding one row there (README still points to the old `src/lib/` paths; the code moved to `src/modules/`). One active LLM + one active embedding model per tenant (`tenant_settings`). Embeddings are local ONNX via `@xenova/transformers` or API (OpenAI/Cohere). The `documents.embedding` column is `vector(1536)`; smaller models are zero-padded (`padVector`) — pgvector HNSW caps at 2000 dims, so never register a model above 1536.

A third embedder kind, `selfhosted`, calls an **OpenAI-compatible embedding server** over HTTP (`embeddings/selfhosted.ts`, config via `EMBEDDING_SELFHOSTED_URL`/`_TOKEN`). That is the only way to use models with external weights (BGE-M3 full precision, 2.16GB) — the server in `services/embedding-server/` runs transformers **v3** with `use_external_data_format: true`, deliberately kept as a separate package so the Next.js app stays on v2. The client refuses a non-`https` URL unless it is loopback, because tenant document text crosses that wire.

Local model weights are hosted on **Vercel Blob** (`EMBEDDING_MODEL_SOURCE=blob`), laid out as `models/<hfRepo>/…` so transformers.js pulls them itself via `env.remoteHost`/`env.remotePathTemplate` — there is no bespoke download code on the read path (`storage/blob-host.ts`, wired in `embeddings/local.ts`). Superadmins upload with `npm run models:push` (CLI, multipart above 50MB; a serverless function cannot do this — Vercel caps request bodies near 4.5MB). `npm run models:verify` proves the read path without touching the real blob. Two constraints that bite: whatever ONNX variant the registry selects must be the one uploaded (`onnxFileFor` decides both), and **models with external weights (`.onnx_data`) cannot load at all** — transformers.js v2 builds sessions from an in-memory buffer, which is why the "2GB" BGE-M3 variant is deliberately not used. See `docs/MODEL-HOSTING.md`.

### Other key pieces

- **Auth**: NextAuth (`src/modules/auth/`) — credentials (scrypt) + Google + Microsoft; JWT session carries `userId`/`tenantId`/`role`; signup provisions a tenant. Signup is open but **gated**: new accounts are `pending` and cannot log in until a superadmin approves them (`users.status`). The gate is enforced on *both* paths — `verifyCredentials()` for credentials and the NextAuth `signIn` callback for OAuth; skipping the latter would let anyone walk in through Google. Login deliberately rejects pending accounts *identically* to a wrong password so the endpoint can't be used to enumerate registered emails; the real reason is only served by `POST /api/auth/login-status`, which answers only after the password checks out. The approval queue spans tenants, which RLS would normally forbid — it uses the same escape hatch as cross-tenant login (`users_platform_admin_*` policies opened by the `app.admin_context` GUC, set only in `user-approval.service` behind `requireRole('superadmin')`). OAuth Drive/Graph tokens are captured per-user into `oauth_connections` (encrypted, auto-refresh) for knowledge sync.
- **Secrets**: per-tenant provider API keys AES-256-GCM encrypted (`core/crypto.ts`, `CREDENTIALS_ENCRYPTION_KEY`); keys never reach the browser.
- **Knowledge sync**: `knowledge/sync.service.ts` crawls Google Drive/OneDrive/SharePoint, extracts text (PDF via pdf-parse, DOCX via mammoth — dynamic imports, parse failures don't kill the sync), ingests, then auto-triggers the Memory agent. Sync is **incremental**: each chunk stores `external_id` + `external_version` (Drive `modifiedTime` / Graph `eTag`), and the pure `planDelta()` diffs a cheap metadata listing against the DB manifest so only new/changed files are downloaded and embedded. Two invariants worth preserving: a truncated listing must never trigger deletions (files outside the listing window are not gone), and unsupported formats are filtered by `isExtractable()` *before* download. `?full=1` forces a full re-ingest.
- **Memory agent** (`modules/memory/`): Obsidian-style notes with `[[wikilinks]]`, distill/link/graph/self-evolve stages, exportable vault (write-back to user's Drive).
- **API contract**: OpenAPI 3.1 defined in `core/openapi.ts`, served at `GET /api/openapi`.

### Serverless constraints (Vercel)

Documented in `docs/DEPLOY-VERCEL.md`: db pool `max: 1` + `prepare: false` on Vercel; local ONNX embeddings are lazy-imported and effectively API-only on Vercel (local models are for VPS/on-prem); in-memory rate limiting doesn't share state across lambdas.

## UI / design system

Official brand (decision D4v3 in `architecture-decisions.md`): light-first, Deep Navy `#0F172A` / Royal Blue `#2563EB` / Emerald / Amber (amber = citations/sources), Manrope + Inter + JetBrains Mono via next/font, 2px outline icons. Tokens live in `src/app/nalar-ds.css`. Explicitly anti "AI-slop": no gradients, no glow, no purple heroes. The RAG machinery is part of the visual language (retrieval traces, similarity scores, citations).
