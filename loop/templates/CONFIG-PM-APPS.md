# Integrasi PM Apps dengan Claude Code

PM Apps (ProjectHub) — `pm.sainskerta.net` — nyediakno API buat nge-monitoring aktivitas Claude Code agent secara real-time.

## Setup Awal

### 1. Buat Agent
Buka **pm.sainskerta.net/agents** → klik "Create Agent" → isi nama → **SIMPAN API KEY** (cuma muncul sekali).

### 2. Set Environment Variable
```bash
# Di project Claude Code (.env atau langsung di prompt)
PM_API_URL=https://pm.sainskerta.net
PM_API_KEY=sk_agent_xxx...
PM_PROJECT_ID=project_id_dari_pm_apps
```

### 3. Dapetin Project ID
Buka project di pm.sainskerta.net → URL e `pm.sainskerta.net/projects/[id]` → ambil `[id]` kui.

---

## API Endpoints

Kabeh endpoint pake `Content-Type: application/json` + header `x-api-key: sk_agent_xxx...`

### START Task — POST /api/agent/runs
```json
POST https://pm.sainskerta.net/api/agent/runs
x-api-key: sk_agent_xxx

{
  "projectId": "PROJECT_ID",
  "phase": "BACKEND",
  "step": "Buat migration database",
  "status": "IN_PROGRESS",
  "message": "Mulai ngerjain migration..."
}
```
Response: `{ "success": true, "data": { "id": "run_id_123", ... } }` → **simpan `data.id`** kanggo update berikutnya.

### UPDATE Progress — POST /api/agent/runs (pake `id`)
```json
POST https://pm.sainskerta.net/api/agent/runs
x-api-key: sk_agent_xxx

{
  "id": "run_id_123",
  "phase": "BACKEND",
  "step": "Buat migration database",
  "status": "IN_PROGRESS",
  "progress": 50,
  "message": "80% - tinggal foreign key"
}
```

### COMPLETE Task
```json
POST https://pm.sainskerta.net/api/agent/runs
x-api-key: sk_agent_xxx

{
  "id": "run_id_123",
  "phase": "BACKEND",
  "step": "Buat migration database",
  "status": "COMPLETED",
  "progress": 100,
  "message": "Migration selesai ✅"
}
```

### FAILED Task
```json
POST https://pm.sainskerta.net/api/agent/runs
x-api-key: sk_agent_xxx

{
  "id": "run_id_123",
  "phase": "BACKEND",
  "step": "Buat migration database",
  "status": "FAILED",
  "progress": 30,
  "message": "Error: constraint violation"
}
```

### CREATE Project — POST /api/agent/projects
Buat project sekaligus backlog tasks dari hasil planning:
```json
POST https://pm.sainskerta.net/api/agent/projects
x-api-key: sk_agent_xxx

{
  "name": "AI Sales System",
  "description": "Chrome Extension crawler",
  "status": "ACTIVE",
  "priority": 1,
  "stack": "Next.js + Prisma + PostgreSQL",
  "backlog": [
    { "title": "Setup database schema", "priority": "HIGH" },
    { "title": "Buat API CRUD leads", "priority": "HIGH" },
    { "title": "Chrome Extension popup", "priority": "MEDIUM" }
  ]
}
```

### GET Dashboard — GET /api/agent/dashboard
```bash
curl -H "x-api-key: sk_agent_xxx" \
  https://pm.sainskerta.net/api/agent/dashboard
```
Response: active runs, recent completes, per-project progress, agent stats.

### GET Runs — GET /api/agent/runs?projectId=xxx
```bash
curl -H "x-api-key: sk_agent_xxx" \
  https://pm.sainskerta.net/api/agent/runs?projectId=xxx
```

---

## Integrasi di .claude/loop.md

Tambahke aturan iki nang `.claude/loop.md`:

```markdown
## PM Apps Monitoring

### Wajib:
1. Sub-agent WAJIB call API START → UPDATE → COMPLETE utowo FAILED
2. Format: POST /api/agent/runs dengan x-api-key header
3. Simpen `data.id` dari START response kanggo UPDATE lan COMPLETE
4. Kalo API gagal → tetep lanjut kerja, catet error nang audit-logs.md
5. Jangan sampe API call nge-block pekerjaan utama

### Contoh inline (pake curl):
curl -s -X POST https://pm.sainskerta.net/api/agent/runs \
  -H "x-api-key: sk_agent_xxx" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"xxx","phase":"BACKEND","step":"...","status":"IN_PROGRESS"}'
```

---

## Auto Script (simpen nang scripts/pm-report.sh)

```bash
#!/bin/bash
# Usage: pm-report.sh start|update|complete|failed <run_id> <project_id> <phase> <step> <message> <progress>
PM_URL="https://pm.sainskerta.net"
KEY="${PM_API_KEY}"

CMD=$1; RID=$2; PID=$3; PHASE=$4; STEP=$5; MSG=$6; PROG=${7:-0}

case $CMD in
  start)
    curl -s -X POST "$PM_URL/api/agent/runs" \
      -H "x-api-key: $KEY" -H "Content-Type: application/json" \
      -d "{\"projectId\":\"$PID\",\"phase\":\"$PHASE\",\"step\":\"$STEP\",\"status\":\"IN_PROGRESS\",\"message\":\"$MSG\"}"
    ;;
  update)
    curl -s -X POST "$PM_URL/api/agent/runs" \
      -H "x-api-key: $KEY" -H "Content-Type: application/json" \
      -d "{\"id\":\"$RID\",\"phase\":\"$PHASE\",\"step\":\"$STEP\",\"status\":\"IN_PROGRESS\",\"progress\":$PROG,\"message\":\"$MSG\"}"
    ;;
  complete)
    curl -s -X POST "$PM_URL/api/agent/runs" \
      -H "x-api-key: $KEY" -H "Content-Type: application/json" \
      -d "{\"id\":\"$RID\",\"phase\":\"$PHASE\",\"step\":\"$STEP\",\"status\":\"COMPLETED\",\"progress\":100,\"message\":\"$MSG\"}"
    ;;
  failed)
    curl -s -X POST "$PM_URL/api/agent/runs" \
      -H "x-api-key: $KEY" -H "Content-Type: application/json" \
      -d "{\"id\":\"$RID\",\"phase\":\"$PHASE\",\"step\":\"$STEP\",\"status\":\"FAILED\",\"progress\":$PROG,\"message\":\"$MSG\"}"
    ;;
esac
```
