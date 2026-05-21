#!/usr/bin/env bash
# check_ram.sh — RAM and swap utilisation check module
# Defines check_ram(); sourced by health_monitor.sh.
# Standalone: ./modules/check_ram.sh
set -euo pipefail

check_ram() {
    if [[ -z "${RAM_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        # shellcheck source=../config.conf
        source "$_cfg"
    fi

    # Parse free -m output
    local mem_total mem_used mem_avail swap_total swap_used
    mem_total=$(free -m | awk '/^Mem:/{print $2}')
    mem_used=$(free -m  | awk '/^Mem:/{print $3}')
    mem_avail=$(free -m | awk '/^Mem:/{print $7}')
    swap_total=$(free -m | awk '/^Swap:/{print $2}')
    swap_used=$(free -m  | awk '/^Swap:/{print $3}')

    # Guard: mem_total must be non-zero
    [[ "$mem_total" -gt 0 ]] || { echo "ALERT|Could not read memory stats"; return 1; }

    local ram_pct swap_pct="0"
    ram_pct=$(awk -v u="$mem_used" -v t="$mem_total" 'BEGIN{printf "%d", u/t*100+0.5}')
    [[ "$swap_total" -gt 0 ]] && \
        swap_pct=$(awk -v u="$swap_used" -v t="$swap_total" 'BEGIN{printf "%d", u/t*100+0.5}')

    local detail
    detail="RAM: ${ram_pct}% (${mem_used}M/${mem_total}M used, ${mem_avail}M avail)"
    detail+=" | Swap: ${swap_pct}% (${swap_used}M/${swap_total}M) | Threshold: ${RAM_THRESHOLD}%"

    # Alert on RAM or Swap threshold breach
    if [[ "$ram_pct" -ge "$RAM_THRESHOLD" ]] || \
       { [[ "$swap_total" -gt 0 ]] && [[ "$swap_pct" -ge "${SWAP_THRESHOLD:-50}" ]]; }; then
        echo "ALERT|${detail}"
    else
        echo "OK|${detail}"
    fi
}

# ── Standalone execution ───────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    _cfg="$(cd "$(dirname "$0")/.." && pwd)/config.conf"
    [[ -f "$_cfg" ]] && source "$_cfg"
    result=$(check_ram)
    status="${result%%|*}"; detail="${result#*|}"
    case "$status" in
        OK)    echo -e "\033[0;32m[ OK ] [RAM] ${detail}\033[0m" ;;
        ALERT) echo -e "\033[0;31m[ALRT] [RAM] ${detail}\033[0m"; exit 1 ;;
    esac
fi
