#!/bin/bash
# ============================================================
# Claude Workflow Script — Sainskerta Loop Workflow
# ============================================================
# Script utama untuk menjalankan workflow Sainskerta.
# Bisa dijalankan manual di terminal atau via OpenClaw.
#
# Usage:
#   bash claude-workflow.sh start [--fase FASE]
#   bash claude-workflow.sh status
#   bash claude-workflow.sh pause
#   bash claude-workflow.sh resume [--fase FASE]
#   bash claude-workflow.sh kill
#   bash claude-workflow.sh inject FILE
#   bash claude-workflow.sh jump --fase FASE
#   bash claude-workflow.sh reset
#   bash claude-workflow.sh debug
#   bash claude-workflow.sh export
#   bash claude-workflow.sh import FILE
# ============================================================

set -e

# ------ CONFIG ------
WORKFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(pwd)"
LOOP_FILE="$PROJECT_DIR/.claude/loop.md"
PROGRESS_FILE="$PROJECT_DIR/progress.md"
REQUIREMENT_FILE="$PROJECT_DIR/user_requirement.md"

# Warna output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ------ FUNCTIONS ------

print_usage() {
    echo ""
    echo "Sainskerta Loop Workflow — CLI"
    echo ""
    echo "Usage:"
    echo "  $0 start [--fase FASE]       Mulai/melanjutkan loop"
    echo "  $0 status                     Cek status loop"
    echo "  $0 pause                      Pause loop"
    echo "  $0 resume [--fase FASE]       Resume loop"
    echo "  $0 kill                       Hentikan loop permanen"
    echo "  $0 inject FILE                Inject requirement dari file"
    echo "  $0 jump --fase FASE           Langsung ke fase tertentu"
    echo "  $0 reset                      Reset loop ke awal"
    echo "  $0 debug                      Lihat semua state"
    echo "  $0 export                     Export state ke JSON"
    echo "  $0 import FILE                Import state dari JSON"
    echo ""
    echo "Fase yang tersedia:"
    echo "  00-PREREQUISITES   01-PLANNING    02-WIREFRAME-AUDIT"
    echo "  03-BACKEND         04-FRONTEND    05-AUDIT"
    echo "  06-DEPLOYMENT      07-IMPROVEMENT"
    echo ""
}

init_loop() {
    # Buat folder .claude jika belum ada
    mkdir -p "$PROJECT_DIR/.claude"
    
    # Buat loop.md jika belum ada
    if [ ! -f "$LOOP_FILE" ]; then
        cat > "$LOOP_FILE" << 'LOOPEOF'
# Loop Status

## Status Loop

status: "active"
current_phase: "00-PREREQUISITES"
started_at: "___STARTED_AT___"
completed_at: ""
phase_history:
  - phase: "00-PREREQUISITES"
    status: "in_progress"
    started_at: "___STARTED_AT___"
    completed_at: ""
LOOPEOF
        # Replace placeholder
        NOW=$(date '+%Y-%m-%d %H:%M')
        sed -i "s/___STARTED_AT___/$NOW/g" "$LOOP_FILE"
        
        echo -e "${GREEN}✓ Loop initialized at fase 00-PREREQUISITES${NC}"
    fi
    
    # Buat progress.md jika belum ada
    if [ ! -f "$PROGRESS_FILE" ]; then
        cp "$WORKFLOW_DIR/templates/progress.md" "$PROGRESS_FILE"
        echo -e "${GREEN}✓ Progress file created${NC}"
    fi
    
    # Buat user_requirement.md jika belum ada
    if [ ! -f "$REQUIREMENT_FILE" ]; then
        cp "$WORKFLOW_DIR/templates/user_requirement.md" "$REQUIREMENT_FILE"
        echo -e "${GREEN}✓ User requirement file created${NC}"
    fi
}

get_current_phase() {
    if [ ! -f "$LOOP_FILE" ]; then
        echo "NOT_INITIALIZED"
        return
    fi
    grep "current_phase:" "$LOOP_FILE" | head -1 | awk '{print $2}' | tr -d '"'
}

set_phase() {
    local fase="$1"
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Error: Loop belum di-init. Jalankan 'start' dulu.${NC}"
        exit 1
    fi
    
    # Validasi fase
    case "$fase" in
        00-PREREQUISITES|01-PLANNING|02-WIREFRAME-AUDIT|03-BACKEND|04-FRONTEND|05-AUDIT|06-DEPLOYMENT|07-IMPROVEMENT)
            ;;
        *)
            echo -e "${RED}Error: Fase '$fase' tidak valid.${NC}"
            echo "Fase yang valid: 00-PREREQUISITES, 01-PLANNING, 02-WIREFRAME-AUDIT, 03-BACKEND, 04-FRONTEND, 05-AUDIT, 06-DEPLOYMENT, 07-IMPROVEMENT"
            exit 1
            ;;
    esac
    
    # Update loop.md
    sed -i "s/current_phase: \".*\"/current_phase: \"$fase\"/" "$LOOP_FILE"
    echo -e "${GREEN}✓ Fase diubah ke: $fase${NC}"
}

cmd_start() {
    local fase="${1:-}"
    
    init_loop
    
    if [ -n "$fase" ]; then
        set_phase "$fase"
    fi
    
    local current=$(get_current_phase)
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Sainskerta Loop Workflow — START${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  Fase aktif: ${BLUE}$current${NC}"
    echo -e "  File progress: ${BLUE}$PROGRESS_FILE${NC}"
    echo -e "  Requirement: ${BLUE}$REQUIREMENT_FILE${NC}"
    echo ""
    echo -e "  ${YELLOW}Petunjuk:${NC}"
    echo -e "  - Buka $REQUIREMENT_FILE untuk lihat task"
    echo -e "  - Buka $WORKFLOW_DIR/phases/$current.md untuk panduan fase"
    echo -e "  - Update $PROGRESS_FILE saat task selesai"
    echo -e "  - Jalankan 'status' untuk cek progress"
    echo ""
    
    # Tampilkan file panduan fase yang sesuai
    local phase_file="$WORKFLOW_DIR/phases/$current.md"
    if [ -f "$phase_file" ]; then
        echo -e "${BLUE}=== Panduan Fase $current ===${NC}"
        head -20 "$phase_file"
        echo "..."
        echo -e "${BLUE}Baca selengkapnya di: $phase_file${NC}"
    fi
}

cmd_status() {
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Loop belum di-init. Jalankan 'start' dulu.${NC}"
        exit 1
    fi
    
    local current=$(get_current_phase)
    local status=$(grep "status:" "$LOOP_FILE" | head -1 | awk '{print $2}' | tr -d '"')
    
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Sainskerta Loop — STATUS${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  Status loop: ${BLUE}$status${NC}"
    echo -e "  Fase aktif: ${BLUE}$current${NC}"
    echo ""
    
    if [ -f "$PROGRESS_FILE" ]; then
        grep -A 2 "### Fase\|^###" "$PROGRESS_FILE" | head -20
    fi
}

cmd_pause() {
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Error: Loop belum di-init.${NC}"
        exit 1
    fi
    
    sed -i 's/status: "active"/status: "paused"/' "$LOOP_FILE"
    echo -e "${YELLOW}⏸️  Loop di-pause. Jalankan 'resume' untuk melanjutkan.${NC}"
}

cmd_resume() {
    local fase="${1:-}"
    
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Error: Loop belum di-init.${NC}"
        exit 1
    fi
    
    if [ -n "$fase" ]; then
        set_phase "$fase"
    fi
    
    sed -i 's/status: "paused"/status: "active"/' "$LOOP_FILE"
    
    local current=$(get_current_phase)
    echo -e "${GREEN}▶️  Loop di-resume. Fase: $current${NC}"
}

cmd_kill() {
    echo -e "${RED}⚠️  PERINGATAN: Ini akan menghentikan loop secara permanen untuk sesi ini.${NC}"
    echo -e "${RED}   Project TIDAK akan dihapus.${NC}"
    read -p "Lanjutkan? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        if [ -f "$LOOP_FILE" ]; then
            sed -i 's/status: "active"/status: "killed"/' "$LOOP_FILE"
            sed -i 's/status: "paused"/status: "killed"/' "$LOOP_FILE"
        fi
        echo -e "${RED}🛑 Loop dihentikan.${NC}"
    else
        echo "Dibatalkan."
    fi
}

cmd_inject() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: File '$file' tidak ditemukan.${NC}"
        exit 1
    fi
    
    # Copy ke user_requirement.md
    cp "$file" "$REQUIREMENT_FILE"
    echo -e "${GREEN}✓ Requirement di-inject ke $REQUIREMENT_FILE${NC}"
}

cmd_jump() {
    local fase="$1"
    if [ -z "$fase" ]; then
        echo -e "${RED}Error: --fase diperlukan. Contoh: jump --fase 06-DEPLOYMENT${NC}"
        exit 1
    fi
    set_phase "$fase"
    echo -e "${GREEN}✓ Langsung loncat ke fase $fase${NC}"
}

cmd_reset() {
    echo -e "${RED}⚠️  PERINGATAN: Ini akan reset loop ke fase awal!${NC}"
    read -p "Lanjutkan? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        set_phase "00-PREREQUISITES"
        echo -e "${GREEN}✓ Loop di-reset ke fase 00-PREREQUISITES${NC}"
    fi
}

cmd_debug() {
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Loop belum di-init.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}=== DEBUG: Project State ===${NC}"
    echo ""
    echo -e "  PROJECT_DIR: $PROJECT_DIR"
    echo -e "  WORKFLOW_DIR: $WORKFLOW_DIR"
    echo ""
    echo -e "${YELLOW}--- Loop File ---${NC}"
    cat "$LOOP_FILE"
    echo ""
    echo -e "${YELLOW}--- Direktori ---${NC}"
    ls -la "$PROJECT_DIR"
}

cmd_export() {
    if [ ! -f "$LOOP_FILE" ]; then
        echo -e "${RED}Loop belum di-init.${NC}"
        exit 1
    fi
    
    # Format JSON sederhana
    local project_name=$(basename "$PROJECT_DIR")
    local phase=$(get_current_phase)
    local status=$(grep "status:" "$LOOP_FILE" | head -1 | awk '{print $2}' | tr -d '"')
    
    cat << JSONEOF
{
  "project": "$project_name",
  "phase": "$phase",
  "status": "$status",
  "exported_at": "$(date '+%Y-%m-%d %H:%M')"
}
JSONEOF
}

cmd_import() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: File '$file' tidak ditemukan.${NC}"
        exit 1
    fi
    
    # Baca JSON dan set phase
    local phase=$(grep '"phase"' "$file" | awk -F'"' '{print $4}')
    if [ -n "$phase" ]; then
        set_phase "$phase"
        echo -e "${GREEN}✓ State di-import. Fase: $phase${NC}"
    fi
}

# ------ MAIN ------

# Parse arguments
COMMAND="${1:-help}"
shift 2>/dev/null || true

# Parse optional flags
FASE=""
FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --fase)
            FASE="$2"
            shift 2
            ;;
        --file)
            FILE="$2"
            shift 2
            ;;
        *)
            # Bisa juga positional arg untuk inject
            if [ -f "$1" ]; then
                FILE="$1"
            fi
            shift
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    start)
        cmd_start "$FASE"
        ;;
    status)
        cmd_status
        ;;
    pause)
        cmd_pause
        ;;
    resume)
        cmd_resume "$FASE"
        ;;
    kill)
        cmd_kill
        ;;
    inject)
        cmd_inject "$FILE"
        ;;
    jump)
        cmd_jump "$FASE"
        ;;
    reset)
        cmd_reset
        ;;
    debug)
        cmd_debug
        ;;
    export)
        cmd_export
        ;;
    import)
        cmd_import "$FILE"
        ;;
    help|*)
        print_usage
        ;;
esac
