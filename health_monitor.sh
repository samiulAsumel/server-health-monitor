#!/usr/bin/env bash
# health_monitor.sh — Server Health Monitor  Orchestrator v1.0.0
# Runs all checks every 5 min via cron, logs results, triggers alerts.
# Usage: ./health_monitor.sh [--dry-run] [--verbose]
# Cron:  */5 * * * * /usr/local/bin/healthmonitor/health_monitor.sh
set -euo pipefail
trap 'echo "[$(date "+%Y-%m-%d %H:%M:%S")] [MONITOR] [ERROR] Script failed at line ${LINENO}: ${BASH_COMMAND}" >&2; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Source configuration ──────────────────────────────────────────────────────
CONFIG_FILE="${SCRIPT_DIR}/config.conf"
[[ -f "$CONFIG_FILE" ]] || { echo "[FATAL] config.conf not found at ${CONFIG_FILE}" >&2; exit 1; }
# shellcheck source=config.conf
source "$CONFIG_FILE"

# ── Source all modules ────────────────────────────────────────────────────────
for _mod in check_cpu check_ram check_disk check_services check_network send_alert; do
    _path="${SCRIPT_DIR}/modules/${_mod}.sh"
    [[ -f "$_path" ]] || { echo "[FATAL] Module missing: ${_path}" >&2; exit 1; }
    # shellcheck disable=SC1090
    source "$_path"
done

# ── Runtime flags ─────────────────────────────────────────────────────────────
DRY_RUN=false; VERBOSE=false
for _arg in "$@"; do
    case "$_arg" in
        --dry-run) DRY_RUN=true  ;;
        --verbose) VERBOSE=true  ;;
    esac
done

# ── Colours (only when attached to a terminal) ────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Initialise directories ────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$COOLDOWN_DIR" "$REPORT_DIR"

# ── Logging ───────────────────────────────────────────────────────────────────
HOSTNAME_DISPLAY="${HOSTNAME_OVERRIDE:-$(hostname -s 2>/dev/null || echo unknown)}"

log_entry() {
    local level="$1" module="$2" msg="$3"
    local entry="[$(date '+%Y-%m-%d %H:%M:%S')] [${module}] [${level}] ${msg}"
    echo "$entry" >> "$LOG_FILE"
    [[ "$level" == "ALERT" ]] && echo "$entry" >> "$ALERT_LOG"
    if [[ -t 1 ]] || $VERBOSE; then
        case "$level" in
            OK)    echo -e "${GREEN}${entry}${RESET}" ;;
            ALERT) echo -e "${RED}${BOLD}${entry}${RESET}" ;;
            WARN)  echo -e "${YELLOW}${entry}${RESET}" ;;
            *)     echo -e "${CYAN}${entry}${RESET}" ;;
        esac
    fi
}

# ── Dry-run banner ────────────────────────────────────────────────────────────
$DRY_RUN && {
    echo -e "${YELLOW}${BOLD}╔════════════════════════════════════════════╗${RESET}"
    echo -e "${YELLOW}${BOLD}║  DRY-RUN — no alerts will be dispatched    ║${RESET}"
    echo -e "${YELLOW}${BOLD}╚════════════════════════════════════════════╝${RESET}\n"
}

# ═════════════════════════════════════════════════════════════════════════════
log_entry "INFO" "MONITOR" "=== Health check started on ${HOSTNAME_DISPLAY} (v${VERSION}) ==="
ALERT_COUNT=0

# ── CPU ───────────────────────────────────────────────────────────────────────
cpu_result=$(check_cpu)
cpu_status="${cpu_result%%|*}"; cpu_detail="${cpu_result#*|}"
log_entry "$cpu_status" "CPU" "$cpu_detail"
if [[ "$cpu_status" == "ALERT" ]]; then
    ALERT_COUNT=$((ALERT_COUNT + 1))
    $DRY_RUN || send_alert "CPU" "$cpu_detail" "WARNING" "$HOSTNAME_DISPLAY"
fi

# ── RAM ───────────────────────────────────────────────────────────────────────
ram_result=$(check_ram)
ram_status="${ram_result%%|*}"; ram_detail="${ram_result#*|}"
log_entry "$ram_status" "RAM" "$ram_detail"
if [[ "$ram_status" == "ALERT" ]]; then
    ALERT_COUNT=$((ALERT_COUNT + 1))
    $DRY_RUN || send_alert "RAM" "$ram_detail" "WARNING" "$HOSTNAME_DISPLAY"
fi

# ── DISK (one result line per mount point) ────────────────────────────────────
while IFS= read -r disk_line; do
    [[ -z "$disk_line" ]] && continue
    disk_status="${disk_line%%|*}"; disk_detail="${disk_line#*|}"
    log_entry "$disk_status" "DISK" "$disk_detail"
    if [[ "$disk_status" == "ALERT" ]]; then
        ALERT_COUNT=$((ALERT_COUNT + 1))
        $DRY_RUN || send_alert "DISK" "$disk_detail" "WARNING" "$HOSTNAME_DISPLAY"
    fi
done < <(check_disk)

# ── SERVICES ──────────────────────────────────────────────────────────────────
while IFS= read -r svc_line; do
    [[ -z "$svc_line" ]] && continue
    svc_status="${svc_line%%|*}"; svc_detail="${svc_line#*|}"
    log_entry "$svc_status" "SERVICE" "$svc_detail"
    if [[ "$svc_status" == "ALERT" ]]; then
        ALERT_COUNT=$((ALERT_COUNT + 1))
        $DRY_RUN || send_alert "SERVICE" "$svc_detail" "CRITICAL" "$HOSTNAME_DISPLAY"
    fi
done < <(check_services)

# ── NETWORK ───────────────────────────────────────────────────────────────────
net_result=$(check_network)
net_status="${net_result%%|*}"; net_detail="${net_result#*|}"
log_entry "$net_status" "NETWORK" "$net_detail"
if [[ "$net_status" == "ALERT" ]]; then
    ALERT_COUNT=$((ALERT_COUNT + 1))
    $DRY_RUN || send_alert "NETWORK" "$net_detail" "CRITICAL" "$HOSTNAME_DISPLAY"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
if [[ $ALERT_COUNT -eq 0 ]]; then
    log_entry "OK"    "MONITOR" "All checks passed — ${HOSTNAME_DISPLAY} is healthy"
    exit 0
else
    log_entry "ALERT" "MONITOR" "${ALERT_COUNT} alert(s) fired — see ${ALERT_LOG}"
    exit 1
fi
