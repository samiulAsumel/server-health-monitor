#!/usr/bin/env bash
# check_cpu.sh — CPU utilisation + load average check module
# Defines check_cpu(); sourced by health_monitor.sh.
# Standalone: ./modules/check_cpu.sh
set -euo pipefail

check_cpu() {
    # Resolve config when running standalone (not sourced)
    if [[ -z "${CPU_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        # shellcheck source=../config.conf
        source "$_cfg"
    fi

    # Extract idle% from top and calculate usage
    local idle usage load1
    idle=$(top -bn1 2>/dev/null | grep -E '^(%Cpu|Cpu)' | \
           awk '{for(i=1;i<=NF;i++) if($i~/id,?$/ || $(i+1)~/id,?$/) {gsub(/[^0-9.]/,"",$i); print $i; exit}}')

    # Fallback: /proc/stat snapshot delta (more accurate, needs 2 reads)
    if [[ -z "${idle:-}" ]]; then
        local s1 s2 idle1 total1 idle2 total2
        read -r _ s1 < /proc/stat
        sleep 0.5
        read -r _ s2 < /proc/stat
        idle1=$(awk '{print $4}' <<< "$s1")
        total1=$(awk '{n=0; for(i=1;i<=NF;i++) n+=$i; print n}' <<< "$s1")
        idle2=$(awk '{print $4}' <<< "$s2")
        total2=$(awk '{n=0; for(i=1;i<=NF;i++) n+=$i; print n}' <<< "$s2")
        usage=$(awk -v i1="$idle1" -v t1="$total1" -v i2="$idle2" -v t2="$total2" \
                    'BEGIN{d=t2-t1; printf "%d", (d-(i2-i1))/d*100+0.5}')
    else
        usage=$(awk -v i="$idle" 'BEGIN{printf "%d", 100-i+0.5}')
    fi

    load1=$(awk '{print $1}' /proc/loadavg)
    local core_count
    core_count=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo)
    local detail="Usage: ${usage}% | Load(1m): ${load1} | Cores: ${core_count} | Threshold: ${CPU_THRESHOLD}%"

    if [[ "$usage" -ge "$CPU_THRESHOLD" ]]; then
        echo "ALERT|${detail}"
    else
        echo "OK|${detail}"
    fi
}

# ── Standalone execution ───────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    _cfg="$(cd "$(dirname "$0")/.." && pwd)/config.conf"
    [[ -f "$_cfg" ]] && source "$_cfg"
    result=$(check_cpu)
    status="${result%%|*}"; detail="${result#*|}"
    case "$status" in
        OK)    echo -e "\033[0;32m[ OK ] [CPU] ${detail}\033[0m" ;;
        ALERT) echo -e "\033[0;31m[ALRT] [CPU] ${detail}\033[0m"; exit 1 ;;
    esac
fi
