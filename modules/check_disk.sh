#!/usr/bin/env bash
# check_disk.sh — Disk space check for all real mount points
# Defines check_disk(); outputs one line per mount point.
# Sourced by health_monitor.sh. Standalone: ./modules/check_disk.sh
set -euo pipefail

check_disk() {
    if [[ -z "${DISK_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        # shellcheck source=../config.conf
        source "$_cfg"
    fi

    # Build exclusion pattern from DISK_EXCLUDE config
    local exclude_pat
    exclude_pat=$(echo "${DISK_EXCLUDE:-tmpfs devtmpfs squashfs}" | tr ' ' '|')

    # Read df output: Filesystem, Size, Used, Avail, Use%, Mounted-on
    while IFS= read -r line; do
        # Skip header and excluded filesystem types
        [[ "$line" =~ ^Filesystem ]] && continue
        local fs_type mount_point use_pct fs_size fs_avail
        fs_type=$(echo "$line" | awk '{print $1}')
        use_pct=$(echo "$line" | awk '{print $5}' | tr -d '%')
        fs_size=$(echo "$line" | awk '{print $2}')
        fs_avail=$(echo "$line" | awk '{print $4}')
        mount_point=$(echo "$line" | awk '{print $6}')

        # Skip excluded filesystem types (check /proc/mounts for type)
        local real_type
        real_type=$(awk -v mp="$mount_point" '$2==mp{print $3; exit}' /proc/mounts 2>/dev/null || echo "unknown")
        if echo "$real_type" | grep -qwE "$exclude_pat"; then
            continue
        fi

        # Skip pseudo/kernel mounts
        [[ "$mount_point" =~ ^(/proc|/sys|/dev|/run|/snap) ]] && continue

        local detail
        detail="${mount_point}: ${use_pct}% used (${fs_avail} free of ${fs_size}) | Threshold: ${DISK_THRESHOLD}%"

        if [[ "$use_pct" -ge "$DISK_THRESHOLD" ]]; then
            echo "ALERT|${detail}"
        else
            echo "OK|${detail}"
        fi
    done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null || df -h)
}

# ── Standalone execution ───────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    _cfg="$(cd "$(dirname "$0")/.." && pwd)/config.conf"
    [[ -f "$_cfg" ]] && source "$_cfg"
    while IFS= read -r result; do
        status="${result%%|*}"; detail="${result#*|}"
        case "$status" in
            OK)    echo -e "\033[0;32m[ OK ] [DISK] ${detail}\033[0m" ;;
            ALERT) echo -e "\033[0;31m[ALRT] [DISK] ${detail}\033[0m" ;;
        esac
    done < <(check_disk)
fi
