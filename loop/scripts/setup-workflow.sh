#!/bin/bash
# ============================================================
# Setup Workflow — Sainskerta Loop Workflow
# ============================================================
# Script untuk meng-inisialisasi workflow Sainskerta di project.
# 
# Usage:
#   bash setup-workflow.sh                  # Setup di direktori saat ini
#   bash setup-workflow.sh /path/to/project # Setup di direktori tertentu
#   bash setup-workflow.sh --force          # Force overwrite existing files
# ============================================================

set -e

# ------ CONFIG ------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default target
TARGET_DIR="${1:-$(pwd)}"
FORCE=false

# Parse flags
if [ "$1" = "--force" ]; then
    FORCE=true
    TARGET_DIR="$(pwd)"
elif [ "$2" = "--force" ]; then
    FORCE=true
fi

# ===== FUNCTIONS =====

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Sainskerta Loop Workflow — Setup       ║${NC}"
    echo -e "${CYAN}║      Build. Audit. Iterate. Deploy.         ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

check_target() {
    if [ ! -d "$TARGET_DIR" ]; then
        echo -e "${YELLOW}⚠️  Direktori '$TARGET_DIR' tidak ditemukan.${NC}"
        read -p "Buat direktori? (Y/n): " create
        if [ "$create" != "n" ] && [ "$create" != "N" ]; then
            mkdir -p "$TARGET_DIR"
            echo -e "${GREEN}✓ Direktori dibuat: $TARGET_DIR${NC}"
        else
            echo -e "${RED}❌ Setup dibatalkan.${NC}"
            exit 1
        fi
    fi
}

check_dependencies() {
    local missing=false
    
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}⚠️  Git tidak terinstall. Disarankan untuk install Git.${NC}"
    fi
    
    # Check for common package managers
    if command -v composer &> /dev/null; then
        echo -e "${GREEN}✓ Composer terdeteksi${NC}"
    fi
    
    if command -v npm &> /dev/null; then
        echo -e "${GREEN}✓ npm terdeteksi${NC}"
    fi
    
    if command -v node &> /dev/null; then
        echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
    fi
    
    if command -v php &> /dev/null; then
        echo -e "${GREEN}✓ PHP $(php -v | head -1 | awk '{print $2}')${NC}"
    fi
}

copy_workflow_files() {
    local files_copied=0
    local files_skipped=0
    
    echo ""
    echo -e "${BLUE}📁 Menyalin file workflow...${NC}"
    
    # Buat folder target
    mkdir -p "$TARGET_DIR/.claude"
    mkdir -p "$TARGET_DIR/phases"
    mkdir -p "$TARGET_DIR/templates"
    mkdir -p "$TARGET_DIR/standards"
    mkdir -p "$TARGET_DIR/scripts"
    
    # Copy phases
    for file in "$WORKFLOW_DIR/phases/"*.md; do
        basename=$(basename "$file")
        if [ ! -f "$TARGET_DIR/phases/$basename" ] || [ "$FORCE" = true ]; then
            cp "$file" "$TARGET_DIR/phases/$basename"
            echo -e "  ${GREEN}✓${NC} phases/$basename"
            ((files_copied++))
        else
            echo -e "  ${YELLOW}−${NC} phases/$basename (sudah ada, skip)"
            ((files_skipped++))
        fi
    done
    
    # Copy standards
    for file in "$WORKFLOW_DIR/standards/"*.md; do
        basename=$(basename "$file")
        if [ ! -f "$TARGET_DIR/standards/$basename" ] || [ "$FORCE" = true ]; then
            cp "$file" "$TARGET_DIR/standards/$basename"
            echo -e "  ${GREEN}✓${NC} standards/$basename"
            ((files_copied++))
        else
            echo -e "  ${YELLOW}−${NC} standards/$basename (sudah ada, skip)"
            ((files_skipped++))
        fi
    done
    
    # Copy templates (kecuali claude-workflow.sh)
    for file in "$WORKFLOW_DIR/templates/"*.md; do
        basename=$(basename "$file")
        if [ ! -f "$TARGET_DIR/templates/$basename" ] || [ "$FORCE" = true ]; then
            cp "$file" "$TARGET_DIR/templates/$basename"
            echo -e "  ${GREEN}✓${NC} templates/$basename"
            ((files_copied++))
        else
            echo -e "  ${YELLOW}−${NC} templates/$basename (sudah ada, skip)"
            ((files_skipped++))
        fi
    done
    
    # Copy workflow script
    if [ ! -f "$TARGET_DIR/templates/claude-workflow.sh" ] || [ "$FORCE" = true ]; then
        cp "$WORKFLOW_DIR/templates/claude-workflow.sh" "$TARGET_DIR/templates/claude-workflow.sh"
        chmod +x "$TARGET_DIR/templates/claude-workflow.sh"
        echo -e "  ${GREEN}✓${NC} templates/claude-workflow.sh"
        ((files_copied++))
    else
        echo -e "  ${YELLOW}−${NC} templates/claude-workflow.sh (sudah ada, skip)"
        ((files_skipped++))
    fi
    
    # Copy main files
    for file in "README.md" "RULES-OF-THE-GAME.md" "TEMPLATE-ARCHITECTURE.md" "CLI.md"; do
        if [ ! -f "$TARGET_DIR/$file" ] || [ "$FORCE" = true ]; then
            cp "$WORKFLOW_DIR/$file" "$TARGET_DIR/$file"
            echo -e "  ${GREEN}✓${NC} $file"
            ((files_copied++))
        else
            echo -e "  ${YELLOW}−${NC} $file (sudah ada, skip)"
            ((files_skipped++))
        fi
    done
    
    # Copy setup script
    if [ ! -f "$TARGET_DIR/scripts/setup-workflow.sh" ] || [ "$FORCE" = true ]; then
        cp "$WORKFLOW_DIR/scripts/setup-workflow.sh" "$TARGET_DIR/scripts/setup-workflow.sh"
        chmod +x "$TARGET_DIR/scripts/setup-workflow.sh"
        echo -e "  ${GREEN}✓${NC} scripts/setup-workflow.sh"
        ((files_copied++))
    else
        echo -e "  ${YELLOW}−${NC} scripts/setup-workflow.sh (sudah ada, skip)"
        ((files_skipped++))
    fi
    
    echo ""
    echo -e "${GREEN}✅ $files_copied file disalin, $files_skipped file di-skip.${NC}"
}

init_loop_state() {
    # Buat loop.md jika belum ada
    if [ ! -f "$TARGET_DIR/.claude/loop.md" ] || [ "$FORCE" = true ]; then
        cat > "$TARGET_DIR/.claude/loop.md" << 'LOOPEOF'
# Loop Status

## Status Loop

status: "active"
current_phase: "00-PREREQUISITES"
started_at: "___STARTED_AT___"
completed_at: ""

## Phase History
  - phase: "00-PREREQUISITES"
    status: "pending"
    started_at: ""
    completed_at: ""
LOOPEOF
        # Replace placeholder
        sed -i "s/___STARTED_AT___/$(date '+%Y-%m-%d %H:%M')/g" "$TARGET_DIR/.claude/loop.md"
        echo -e "${GREEN}✓ Loop state di-init di .claude/loop.md${NC}"
    else
        echo -e "${YELLOW}− .claude/loop.md sudah ada, skip${NC}"
    fi
}

init_requirement_file() {
    if [ ! -f "$TARGET_DIR/user_requirement.md" ] || [ "$FORCE" = true ]; then
        cp "$WORKFLOW_DIR/templates/user_requirement.md" "$TARGET_DIR/user_requirement.md"
        # Sesuaikan nama project
        local project_name=$(basename "$TARGET_DIR")
        sed -i "s/\[Nama Project\]/$project_name/g" "$TARGET_DIR/user_requirement.md"
        echo -e "${GREEN}✓ user_requirement.md dibuat${NC}"
    else
        echo -e "${YELLOW}− user_requirement.md sudah ada, skip${NC}"
    fi
}

init_progress_file() {
    if [ ! -f "$TARGET_DIR/progress.md" ] || [ "$FORCE" = true ]; then
        cp "$WORKFLOW_DIR/templates/progress.md" "$TARGET_DIR/progress.md"
        local project_name=$(basename "$TARGET_DIR")
        sed -i "s/\[Nama Project\]/$project_name/g" "$TARGET_DIR/progress.md"
        echo -e "${GREEN}✓ progress.md dibuat${NC}"
    else
        echo -e "${YELLOW}− progress.md sudah ada, skip${NC}"
    fi
}

create_gitignore() {
    if [ ! -f "$TARGET_DIR/.gitignore" ]; then
        cat > "$TARGET_DIR/.gitignore" << 'GITIGNORE'
# Environment
.env
.env.local
.env.production

# Dependencies
node_modules/
vendor/

# Build
dist/
build/
*.js.map

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
storage/logs/*

# Cache
.cache/
storage/framework/cache/*
storage/framework/sessions/*
storage/framework/views/*
GITIGNORE
        echo -e "${GREEN}✓ .gitignore dibuat${NC}"
    else
        echo -e "${YELLOW}− .gitignore sudah ada, skip${NC}"
    fi
}

init_git_repo() {
    if [ ! -d "$TARGET_DIR/.git" ]; then
        echo ""
        read -p "Inisialisasi Git repository? (Y/n): " init_git
        if [ "$init_git" != "n" ] && [ "$init_git" != "N" ]; then
            cd "$TARGET_DIR"
            git init
            git add -A
            git commit -m "init: Sainskerta Loop Workflow initialized"
            echo -e "${GREEN}✓ Git repository initialized${NC}"
        fi
    else
        echo -e "${GREEN}✓ Git repository sudah ada${NC}"
    fi
}

print_summary() {
    local project_name=$(basename "$TARGET_DIR")
    
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           Setup Selesai! 🎉                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Project: ${BLUE}$project_name${NC}"
    echo -e "  Lokasi: ${BLUE}$TARGET_DIR${NC}"
    echo ""
    echo -e "  ${GREEN}Langkah selanjutnya:${NC}"
    echo -e "  1. Isi ${YELLOW}user_requirement.md${NC} dengan requirement project"
    echo -e "  2. Jalankan ${YELLOW}bash templates/claude-workflow.sh start${NC}"
    echo -e "  3. Atau langsung ke fase tertentu:"
    echo -e "     ${YELLOW}bash templates/claude-workflow.sh start --fase 01-PLANNING${NC}"
    echo ""
    echo -e "  ${YELLOW}Command yang tersedia:${NC}"
    echo -e "  ${BLUE}status${NC}    → Cek status loop"
    echo -e "  ${BLUE}pause${NC}     → Pause loop"
    echo -e "  ${BLUE}resume${NC}    → Resume loop"
    echo -e "  ${BLUE}kill${NC}      → Hentikan loop"
    echo -e "  ${BLUE}inject${NC}    → Inject requirement file"
    echo ""
    echo -e "  ${CYAN}Selamat membangun! 🚀${NC}"
    echo ""
}

# ===== MAIN =====

print_banner
check_target

echo -e "${BLUE}📍 Target: $TARGET_DIR${NC}"
echo -e "${BLUE}📦 Workflow: $WORKFLOW_DIR${NC}"
echo ""

# Cek dependencies
check_dependencies

# Setup workflow
copy_workflow_files
init_loop_state
init_requirement_file
init_progress_file
create_gitignore
init_git_repo

# Selesai
print_summary
