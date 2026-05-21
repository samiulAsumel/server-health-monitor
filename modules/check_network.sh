#!/usr/bin/env bash
# check_network.sh — Network connectivity and DNS resolution check
# Defines check_network(); sourced by health_monitor.sh.
# Standalone: ./modules/check_network.sh
set -euo pipefail

check_network() {
    if [[ -z "${PING_HOST:-}" ]]; then
        local _cfg
        _cfg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        # shellcheck source=../config.conf
        source "$_cfg"
    fi

    local ping_host="${PING_HOST:-8.8.8.8}"
    local dns_host="${DNS_HOST:-1.1.1.1}"
    local failures=() ok_msgs=()

    # ── ICMP connectivity ─────────────────────────────────────────────────────
    local ping_ms="timeout"
    if ping -c 3 -W 3 "$ping_host" &>/dev/null; then
        ping_ms=$(ping -c 3 -W 3 "$ping_host" 2>/dev/null | \
                  awk -F'/' '/rtt|round-trip/{print $5"ms"}' | head -1)
        ok_msgs+=("ICMP ${ping_host}: OK (avg ${ping_ms:-<1ms})")
    else
        failures+=("ICMP to ${ping_host}: UNREACHABLE")
    fi

    # ── DNS resolution ────────────────────────────────────────────────────────
    if host -W 3 "google.com" "$dns_host" &>/dev/null 2>&1 || \
       nslookup -timeout=3 "google.com" "$dns_host" &>/dev/null 2>&1; then
        ok_msgs+=("DNS ${dns_host}: resolving google.com OK")
    else
        failures+=("DNS via ${dns_host}: resolution FAILED")
    fi

    # ── Default gateway reachability ──────────────────────────────────────────
    local gw
    gw=$(ip route show default 2>/dev/null | awk '/default/{print $3; exit}')
    if [[ -n "$gw" ]]; then
        if ping -c 2 -W 2 "$gw" &>/dev/null; then
            ok_msgs+=("Gateway ${gw}: OK")
        else
            failures+=("Gateway ${gw}: UNREACHABLE")
        fi
    fi

    local summary
    summary=$(IFS=', '; echo "${ok_msgs[*]:-no checks passed}")
    if [[ ${#failures[@]} -gt 0 ]]; then
        local fail_detail
        fail_detail=$(IFS='; '; echo "${failures[*]}")
        echo "ALERT|Network failures — ${fail_detail}"
    else
        echo "OK|${summary}"
    fi
}

# ── Standalone execution ───────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    _cfg="$(cd "$(dirname "$0")/.." && pwd)/config.conf"
    [[ -f "$_cfg" ]] && source "$_cfg"
    result=$(check_network)
    status="${result%%|*}"; detail="${result#*|}"
    case "$status" in
        OK)    echo -e "\033[0;32m[ OK ] [NET] ${detail}\033[0m" ;;
        ALERT) echo -e "\033[0;31m[ALRT] [NET] ${detail}\033[0m"; exit 1 ;;
    esac
fi
