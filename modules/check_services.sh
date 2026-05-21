#!/usr/bin/env bash
# check_services.sh — Systemd service health + auto-restart module
# Defines check_services(); outputs one line per service.
# Sourced by health_monitor.sh. Standalone: ./modules/check_services.sh
set -euo pipefail

check_services() {
    if [[ -z "${SERVICES:-}" ]]; then
        local _cfg
        _cfg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        # shellcheck source=../config.conf
        source "$_cfg"
    fi

    local auto_restart="${AUTO_RESTART:-true}"
    local restart_wait="${RESTART_WAIT:-5}"

    for svc in $SERVICES; do
        local state
        state=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")

        if [[ "$state" == "active" ]]; then
            local uptime_info
            uptime_info=$(systemctl show "$svc" --property=ActiveEnterTimestamp \
                          2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} '+%b %d %H:%M' 2>/dev/null \
                          || echo "unknown start time")
            echo "OK|${svc}: active (running) since ${uptime_info}"
            continue
        fi

        # Service is not active — attempt auto-restart if enabled
        local recovery="No auto-restart (AUTO_RESTART=false)"
        if $auto_restart; then
            if systemctl restart "$svc" 2>/dev/null; then
                sleep "$restart_wait"
                local recheck
                recheck=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
                if [[ "$recheck" == "active" ]]; then
                    echo "WARN|${svc}: was ${state} — restarted successfully (auto-recovery)"
                    continue
                else
                    recovery="Auto-restart attempted but service still ${recheck}"
                fi
            else
                recovery="Auto-restart failed (check journalctl -u ${svc})"
            fi
        fi

        echo "ALERT|${svc}: ${state} — ${recovery}"
    done
}

# ── Standalone execution ───────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    _cfg="$(cd "$(dirname "$0")/.." && pwd)/config.conf"
    [[ -f "$_cfg" ]] && source "$_cfg"
    while IFS= read -r result; do
        status="${result%%|*}"; detail="${result#*|}"
        case "$status" in
            OK)    echo -e "\033[0;32m[ OK ] [SVC] ${detail}\033[0m" ;;
            WARN)  echo -e "\033[1;33m[WARN] [SVC] ${detail}\033[0m" ;;
            ALERT) echo -e "\033[0;31m[ALRT] [SVC] ${detail}\033[0m" ;;
        esac
    done < <(check_services)
fi
