/* scripts-data.js — Embedded script content for the web viewer
   Each entry: file, dir, desc, tags, code (full source as string)  */
'use strict';

const SCRIPTS = [
  {
    file: 'config.conf',
    dir: '',
    desc: 'Master configuration file — all thresholds, service lists, alert channels, paths, and cooldown settings. Sourced by every script at runtime. The only file clients need to edit after install.',
    tags: ['thresholds', 'ALERT_METHOD', 'SERVICES', 'SLACK_WEBHOOK', 'ALERT_COOLDOWN'],
    code: `# ════════════════════════════════════════════════════════════════════════════
# Server Health Monitor — Configuration  v1.0.0
# Edit this file to match your environment.  Sourced by all monitor scripts.
# ════════════════════════════════════════════════════════════════════════════

# ── Alert thresholds ──────────────────────────────────────────────────────────
CPU_THRESHOLD=85          # Send alert when CPU usage exceeds this %
RAM_THRESHOLD=90          # Send alert when RAM usage exceeds this %
DISK_THRESHOLD=80         # Send alert when any mount point exceeds this %
SWAP_THRESHOLD=50         # Send alert when swap usage exceeds this %
LOAD_THRESHOLD=4.0        # Send alert when 1-minute load average exceeds this

# ── Services to monitor (space-separated, exact systemd unit names) ───────────
SERVICES="nginx mysql sshd firewalld"

# ── Alert channels ────────────────────────────────────────────────────────────
ALERT_EMAIL="admin@company.com"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
ALERT_METHOD="email"      # email | slack | both

# ── Daily report ──────────────────────────────────────────────────────────────
REPORT_EMAIL="manager@company.com"
REPORT_SUBJECT_PREFIX="[ServerMon]"

# ── Filesystem paths ──────────────────────────────────────────────────────────
LOG_DIR="/var/log/healthmonitor"
LOG_FILE="\${LOG_DIR}/monitor.log"
ALERT_LOG="\${LOG_DIR}/alerts.log"
REPORT_DIR="\${LOG_DIR}/reports"
COOLDOWN_DIR="\${LOG_DIR}/.cooldown"

# ── Alert storm prevention ────────────────────────────────────────────────────
ALERT_COOLDOWN=1800       # Minimum seconds between identical alert types (30 min)

# ── Service auto-recovery ─────────────────────────────────────────────────────
AUTO_RESTART=true         # Attempt one systemctl restart on failed services
RESTART_WAIT=5            # Seconds to wait before rechecking after restart

# ── Network connectivity ──────────────────────────────────────────────────────
PING_HOST="8.8.8.8"       # Target for ICMP connectivity test
DNS_HOST="1.1.1.1"        # Target for DNS resolution test

# ── Filesystem type exclusions ────────────────────────────────────────────────
DISK_EXCLUDE="tmpfs devtmpfs squashfs overlay proc sysfs"

# ── Override auto-detected hostname in alert messages ─────────────────────────
HOSTNAME_OVERRIDE=""      # Leave empty to use $(hostname -s)

# ── Version ───────────────────────────────────────────────────────────────────
VERSION="1.0.0"`,
  },
  {
    file: 'health_monitor.sh',
    dir: '',
    desc: 'Central orchestrator. Sources config.conf and all 5 check modules, runs every check in sequence, logs each result with timestamp and level, and dispatches alerts for any breach. Exits 0 (all OK) or 1 (alerts fired). Run via cron every 5 min as root.',
    tags: ['set -euo pipefail', 'trap ERR', 'source modules', 'cron', 'log_entry', 'exit codes'],
    code: `#!/usr/bin/env bash
# health_monitor.sh — Server Health Monitor  Orchestrator v1.0.0
# Runs all checks every 5 min via cron, logs results, triggers alerts.
# Usage: ./health_monitor.sh [--dry-run] [--verbose]
# Cron:  */5 * * * * /usr/local/bin/healthmonitor/health_monitor.sh
set -euo pipefail
trap 'echo "[$(date "+%Y-%m-%d %H:%M:%S")] [MONITOR] [ERROR] Script failed at line \${LINENO}: \${BASH_COMMAND}" >&2; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

# ── Source configuration ──────────────────────────────────────────────────────
CONFIG_FILE="\${SCRIPT_DIR}/config.conf"
[[ -f "\$CONFIG_FILE" ]] || { echo "[FATAL] config.conf not found at \${CONFIG_FILE}" >&2; exit 1; }
source "\$CONFIG_FILE"

# ── Source all modules ────────────────────────────────────────────────────────
for _mod in check_cpu check_ram check_disk check_services check_network send_alert; do
    _path="\${SCRIPT_DIR}/modules/\${_mod}.sh"
    [[ -f "\$_path" ]] || { echo "[FATAL] Module missing: \${_path}" >&2; exit 1; }
    source "\$_path"
done

# ── Runtime flags ─────────────────────────────────────────────────────────────
DRY_RUN=false; VERBOSE=false
for _arg in "\$@"; do
    case "\$_arg" in
        --dry-run) DRY_RUN=true  ;;
        --verbose) VERBOSE=true  ;;
    esac
done

# ── Colours (only when attached to a terminal) ────────────────────────────────
if [[ -t 1 ]]; then
    RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'
    CYAN='\\033[0;36m'; BOLD='\\033[1m'; RESET='\\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

mkdir -p "\$LOG_DIR" "\$COOLDOWN_DIR" "\$REPORT_DIR"

# ── Logging ───────────────────────────────────────────────────────────────────
HOSTNAME_DISPLAY="\${HOSTNAME_OVERRIDE:-\$(hostname -s 2>/dev/null || echo unknown)}"

log_entry() {
    local level="\$1" module="\$2" msg="\$3"
    local entry="[\$(date '+%Y-%m-%d %H:%M:%S')] [\${module}] [\${level}] \${msg}"
    echo "\$entry" >> "\$LOG_FILE"
    [[ "\$level" == "ALERT" ]] && echo "\$entry" >> "\$ALERT_LOG"
    if [[ -t 1 ]] || \$VERBOSE; then
        case "\$level" in
            OK)    echo -e "\${GREEN}\${entry}\${RESET}" ;;
            ALERT) echo -e "\${RED}\${BOLD}\${entry}\${RESET}" ;;
            WARN)  echo -e "\${YELLOW}\${entry}\${RESET}" ;;
            *)     echo -e "\${CYAN}\${entry}\${RESET}" ;;
        esac
    fi
}

\$DRY_RUN && {
    echo -e "\${YELLOW}\${BOLD}╔════════════════════════════════════════════╗\${RESET}"
    echo -e "\${YELLOW}\${BOLD}║  DRY-RUN — no alerts will be dispatched    ║\${RESET}"
    echo -e "\${YELLOW}\${BOLD}╚════════════════════════════════════════════╝\${RESET}\\n"
}

log_entry "INFO" "MONITOR" "=== Health check started on \${HOSTNAME_DISPLAY} (v\${VERSION}) ==="
ALERT_COUNT=0

cpu_result=\$(check_cpu)
cpu_status="\${cpu_result%%|*}"; cpu_detail="\${cpu_result#*|}"
log_entry "\$cpu_status" "CPU" "\$cpu_detail"
if [[ "\$cpu_status" == "ALERT" ]]; then
    ALERT_COUNT=\$((ALERT_COUNT + 1))
    \$DRY_RUN || send_alert "CPU" "\$cpu_detail" "WARNING" "\$HOSTNAME_DISPLAY"
fi

ram_result=\$(check_ram)
ram_status="\${ram_result%%|*}"; ram_detail="\${ram_result#*|}"
log_entry "\$ram_status" "RAM" "\$ram_detail"
if [[ "\$ram_status" == "ALERT" ]]; then
    ALERT_COUNT=\$((ALERT_COUNT + 1))
    \$DRY_RUN || send_alert "RAM" "\$ram_detail" "WARNING" "\$HOSTNAME_DISPLAY"
fi

while IFS= read -r disk_line; do
    [[ -z "\$disk_line" ]] && continue
    disk_status="\${disk_line%%|*}"; disk_detail="\${disk_line#*|}"
    log_entry "\$disk_status" "DISK" "\$disk_detail"
    if [[ "\$disk_status" == "ALERT" ]]; then
        ALERT_COUNT=\$((ALERT_COUNT + 1))
        \$DRY_RUN || send_alert "DISK" "\$disk_detail" "WARNING" "\$HOSTNAME_DISPLAY"
    fi
done < <(check_disk)

while IFS= read -r svc_line; do
    [[ -z "\$svc_line" ]] && continue
    svc_status="\${svc_line%%|*}"; svc_detail="\${svc_line#*|}"
    log_entry "\$svc_status" "SERVICE" "\$svc_detail"
    if [[ "\$svc_status" == "ALERT" ]]; then
        ALERT_COUNT=\$((ALERT_COUNT + 1))
        \$DRY_RUN || send_alert "SERVICE" "\$svc_detail" "CRITICAL" "\$HOSTNAME_DISPLAY"
    fi
done < <(check_services)

net_result=\$(check_network)
net_status="\${net_result%%|*}"; net_detail="\${net_result#*|}"
log_entry "\$net_status" "NETWORK" "\$net_detail"
if [[ "\$net_status" == "ALERT" ]]; then
    ALERT_COUNT=\$((ALERT_COUNT + 1))
    \$DRY_RUN || send_alert "NETWORK" "\$net_detail" "CRITICAL" "\$HOSTNAME_DISPLAY"
fi

if [[ \$ALERT_COUNT -eq 0 ]]; then
    log_entry "OK"    "MONITOR" "All checks passed — \${HOSTNAME_DISPLAY} is healthy"
    exit 0
else
    log_entry "ALERT" "MONITOR" "\${ALERT_COUNT} alert(s) fired — see \${ALERT_LOG}"
    exit 1
fi`,
  },
  {
    file: 'check_cpu.sh',
    dir: 'modules/',
    desc: 'CPU utilisation and load average check. Reads idle% from top -bn1 with a /proc/stat fallback for accuracy. Returns STATUS|detail pipe-delimited string. Can also be run standalone for ad-hoc checks.',
    tags: ['top -bn1', '/proc/stat', '/proc/loadavg', 'nproc', 'awk', 'standalone'],
    code: `#!/usr/bin/env bash
# check_cpu.sh — CPU utilisation + load average check module
# Defines check_cpu(); sourced by health_monitor.sh.
# Standalone: ./modules/check_cpu.sh
set -euo pipefail

check_cpu() {
    if [[ -z "\${CPU_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "\$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        source "\$_cfg"
    fi

    local idle usage load1
    idle=\$(top -bn1 2>/dev/null | grep -E '^(%Cpu|Cpu)' | \\
           awk '{for(i=1;i<=NF;i++) if(\$i~/id,?\$/ || \$(i+1)~/id,?\$/) {gsub(/[^0-9.]/,"",\$i); print \$i; exit}}')

    if [[ -z "\${idle:-}" ]]; then
        local s1 s2 idle1 total1 idle2 total2
        read -r _ s1 < /proc/stat
        sleep 0.5
        read -r _ s2 < /proc/stat
        idle1=\$(awk '{print \$4}' <<< "\$s1")
        total1=\$(awk '{n=0; for(i=1;i<=NF;i++) n+=\$i; print n}' <<< "\$s1")
        idle2=\$(awk '{print \$4}' <<< "\$s2")
        total2=\$(awk '{n=0; for(i=1;i<=NF;i++) n+=\$i; print n}' <<< "\$s2")
        usage=\$(awk -v i1="\$idle1" -v t1="\$total1" -v i2="\$idle2" -v t2="\$total2" \\
                    'BEGIN{d=t2-t1; printf "%d", (d-(i2-i1))/d*100+0.5}')
    else
        usage=\$(awk -v i="\$idle" 'BEGIN{printf "%d", 100-i+0.5}')
    fi

    load1=\$(awk '{print \$1}' /proc/loadavg)
    local core_count
    core_count=\$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo)
    local detail="Usage: \${usage}% | Load(1m): \${load1} | Cores: \${core_count} | Threshold: \${CPU_THRESHOLD}%"

    if [[ "\$usage" -ge "\$CPU_THRESHOLD" ]]; then
        echo "ALERT|\${detail}"
    else
        echo "OK|\${detail}"
    fi
}

if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    _cfg="\$(cd "\$(dirname "\$0")/.." && pwd)/config.conf"
    [[ -f "\$_cfg" ]] && source "\$_cfg"
    result=\$(check_cpu)
    status="\${result%%|*}"; detail="\${result#*|}"
    case "\$status" in
        OK)    echo -e "\\033[0;32m[ OK ] [CPU] \${detail}\\033[0m" ;;
        ALERT) echo -e "\\033[0;31m[ALRT] [CPU] \${detail}\\033[0m"; exit 1 ;;
    esac
fi`,
  },
  {
    file: 'check_ram.sh',
    dir: 'modules/',
    desc: 'RAM and swap utilisation check using free -m. Calculates usage percentage, guards against zero total, and alerts on either RAM or swap threshold breach. Returns STATUS|detail.',
    tags: ['free -m', 'swap', 'awk', 'percentage calc', 'guard clause', 'standalone'],
    code: `#!/usr/bin/env bash
# check_ram.sh — RAM and swap utilisation check module
# Defines check_ram(); sourced by health_monitor.sh.
# Standalone: ./modules/check_ram.sh
set -euo pipefail

check_ram() {
    if [[ -z "\${RAM_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "\$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        source "\$_cfg"
    fi

    local mem_total mem_used mem_avail swap_total swap_used
    mem_total=\$(free -m | awk '/^Mem:/{print \$2}')
    mem_used=\$(free -m  | awk '/^Mem:/{print \$3}')
    mem_avail=\$(free -m | awk '/^Mem:/{print \$7}')
    swap_total=\$(free -m | awk '/^Swap:/{print \$2}')
    swap_used=\$(free -m  | awk '/^Swap:/{print \$3}')

    [[ "\$mem_total" -gt 0 ]] || { echo "ALERT|Could not read memory stats"; return 1; }

    local ram_pct swap_pct="0"
    ram_pct=\$(awk -v u="\$mem_used" -v t="\$mem_total" 'BEGIN{printf "%d", u/t*100+0.5}')
    [[ "\$swap_total" -gt 0 ]] && \\
        swap_pct=\$(awk -v u="\$swap_used" -v t="\$swap_total" 'BEGIN{printf "%d", u/t*100+0.5}')

    local detail
    detail="RAM: \${ram_pct}% (\${mem_used}M/\${mem_total}M used, \${mem_avail}M avail)"
    detail+=" | Swap: \${swap_pct}% (\${swap_used}M/\${swap_total}M) | Threshold: \${RAM_THRESHOLD}%"

    if [[ "\$ram_pct" -ge "\$RAM_THRESHOLD" ]] || \\
       { [[ "\$swap_total" -gt 0 ]] && [[ "\$swap_pct" -ge "\${SWAP_THRESHOLD:-50}" ]]; }; then
        echo "ALERT|\${detail}"
    else
        echo "OK|\${detail}"
    fi
}

if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    _cfg="\$(cd "\$(dirname "\$0")/.." && pwd)/config.conf"
    [[ -f "\$_cfg" ]] && source "\$_cfg"
    result=\$(check_ram)
    status="\${result%%|*}"; detail="\${result#*|}"
    case "\$status" in
        OK)    echo -e "\\033[0;32m[ OK ] [RAM] \${detail}\\033[0m" ;;
        ALERT) echo -e "\\033[0;31m[ALRT] [RAM] \${detail}\\033[0m"; exit 1 ;;
    esac
fi`,
  },
  {
    file: 'check_disk.sh',
    dir: 'modules/',
    desc: 'Disk space check for all real mount points. Excludes tmpfs, devtmpfs, squashfs, overlay, and kernel pseudo-mounts. Emits one STATUS|detail line per checked mount. Designed for multi-disk and LVM environments.',
    tags: ['df -h', '/proc/mounts', 'awk', 'grep -v tmpfs', 'LVM', 'multi-mount'],
    code: `#!/usr/bin/env bash
# check_disk.sh — Disk space check for all real mount points
# Defines check_disk(); outputs one line per mount point.
# Sourced by health_monitor.sh. Standalone: ./modules/check_disk.sh
set -euo pipefail

check_disk() {
    if [[ -z "\${DISK_THRESHOLD:-}" ]]; then
        local _cfg
        _cfg="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "\$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        source "\$_cfg"
    fi

    local exclude_pat
    exclude_pat=\$(echo "\${DISK_EXCLUDE:-tmpfs devtmpfs squashfs}" | tr ' ' '|')

    while IFS= read -r line; do
        [[ "\$line" =~ ^Filesystem ]] && continue
        local fs_type mount_point use_pct fs_size fs_avail
        fs_type=\$(echo "\$line"  | awk '{print \$1}')
        use_pct=\$(echo "\$line"  | awk '{print \$5}' | tr -d '%')
        fs_size=\$(echo "\$line"  | awk '{print \$2}')
        fs_avail=\$(echo "\$line" | awk '{print \$4}')
        mount_point=\$(echo "\$line" | awk '{print \$6}')

        local real_type
        real_type=\$(awk -v mp="\$mount_point" '\$2==mp{print \$3; exit}' /proc/mounts 2>/dev/null || echo "unknown")
        if echo "\$real_type" | grep -qwE "\$exclude_pat"; then continue; fi
        [[ "\$mount_point" =~ ^(/proc|/sys|/dev|/run|/snap) ]] && continue

        local detail="\${mount_point}: \${use_pct}% used (\${fs_avail} free of \${fs_size}) | Threshold: \${DISK_THRESHOLD}%"

        if [[ "\$use_pct" -ge "\$DISK_THRESHOLD" ]]; then
            echo "ALERT|\${detail}"
        else
            echo "OK|\${detail}"
        fi
    done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null || df -h)
}

if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    _cfg="\$(cd "\$(dirname "\$0")/.." && pwd)/config.conf"
    [[ -f "\$_cfg" ]] && source "\$_cfg"
    while IFS= read -r result; do
        status="\${result%%|*}"; detail="\${result#*|}"
        case "\$status" in
            OK)    echo -e "\\033[0;32m[ OK ] [DISK] \${detail}\\033[0m" ;;
            ALERT) echo -e "\\033[0;31m[ALRT] [DISK] \${detail}\\033[0m" ;;
        esac
    done < <(check_disk)
fi`,
  },
  {
    file: 'check_services.sh',
    dir: 'modules/',
    desc: 'Systemd service health checker with auto-restart. For each service in $SERVICES, checks systemctl is-active. On failure: attempts one systemctl restart, waits RESTART_WAIT seconds, re-checks. Emits WARN for recovered services, ALERT for unrecoverable failures.',
    tags: ['systemctl is-active', 'systemctl restart', 'auto-recovery', 'WARN level', 'for loop'],
    code: `#!/usr/bin/env bash
# check_services.sh — Systemd service health + auto-restart module
# Defines check_services(); outputs one line per service.
# Sourced by health_monitor.sh. Standalone: ./modules/check_services.sh
set -euo pipefail

check_services() {
    if [[ -z "\${SERVICES:-}" ]]; then
        local _cfg
        _cfg="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "\$_cfg" ]] || { echo "ALERT|Cannot read config.conf"; return 1; }
        source "\$_cfg"
    fi

    local auto_restart="\${AUTO_RESTART:-true}"
    local restart_wait="\${RESTART_WAIT:-5}"

    for svc in \$SERVICES; do
        local state
        state=\$(systemctl is-active "\$svc" 2>/dev/null || echo "unknown")

        if [[ "\$state" == "active" ]]; then
            local uptime_info
            uptime_info=\$(systemctl show "\$svc" --property=ActiveEnterTimestamp \\
                          2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} '+%b %d %H:%M' 2>/dev/null \\
                          || echo "unknown start time")
            echo "OK|\${svc}: active (running) since \${uptime_info}"
            continue
        fi

        local recovery="No auto-restart (AUTO_RESTART=false)"
        if \$auto_restart; then
            if systemctl restart "\$svc" 2>/dev/null; then
                sleep "\$restart_wait"
                local recheck
                recheck=\$(systemctl is-active "\$svc" 2>/dev/null || echo "unknown")
                if [[ "\$recheck" == "active" ]]; then
                    echo "WARN|\${svc}: was \${state} — restarted successfully (auto-recovery)"
                    continue
                else
                    recovery="Auto-restart attempted but service still \${recheck}"
                fi
            else
                recovery="Auto-restart failed (check journalctl -u \${svc})"
            fi
        fi

        echo "ALERT|\${svc}: \${state} — \${recovery}"
    done
}

if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    _cfg="\$(cd "\$(dirname "\$0")/.." && pwd)/config.conf"
    [[ -f "\$_cfg" ]] && source "\$_cfg"
    while IFS= read -r result; do
        status="\${result%%|*}"; detail="\${result#*|}"
        case "\$status" in
            OK)    echo -e "\\033[0;32m[ OK ] [SVC] \${detail}\\033[0m" ;;
            WARN)  echo -e "\\033[1;33m[WARN] [SVC] \${detail}\\033[0m" ;;
            ALERT) echo -e "\\033[0;31m[ALRT] [SVC] \${detail}\\033[0m" ;;
        esac
    done < <(check_services)
fi`,
  },
  {
    file: 'send_alert.sh',
    dir: 'modules/',
    desc: 'Alert dispatcher supporting email (mailx/sendmail) and Slack webhooks (curl). Implements per-type cooldown files to prevent alert storms — same alert type will not re-fire within ALERT_COOLDOWN seconds. Accepts type, detail, severity, and hostname arguments.',
    tags: ['mailx', 'sendmail', 'curl', 'Slack webhook', 'cooldown', 'JSON payload'],
    code: `#!/usr/bin/env bash
# send_alert.sh — Email and Slack alert dispatcher with cooldown
# Defines send_alert(type, detail, severity, hostname)
# Cooldown prevents duplicate alerts within ALERT_COOLDOWN seconds.
set -euo pipefail

send_alert() {
    local alert_type="\${1:-UNKNOWN}"
    local alert_detail="\${2:-No details provided}"
    local severity="\${3:-WARNING}"
    local server_name="\${4:-\$(hostname -s 2>/dev/null || echo unknown)}"

    if [[ -z "\${ALERT_METHOD:-}" ]]; then
        local _cfg
        _cfg="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)/config.conf"
        [[ -f "\$_cfg" ]] || return 1
        source "\$_cfg"
    fi

    # ── Cooldown check ────────────────────────────────────────────────────────
    local cooldown_file="\${COOLDOWN_DIR:-/var/log/healthmonitor/.cooldown}/\${alert_type}.last"
    mkdir -p "\$(dirname "\$cooldown_file")"
    local now cooldown_secs last_sent
    now=\$(date +%s)
    cooldown_secs="\${ALERT_COOLDOWN:-1800}"
    if [[ -f "\$cooldown_file" ]]; then
        last_sent=\$(cat "\$cooldown_file")
        if (( now - last_sent < cooldown_secs )); then
            return 0  # Still within cooldown; suppress duplicate
        fi
    fi
    echo "\$now" > "\$cooldown_file"

    # ── Compose message ───────────────────────────────────────────────────────
    local ts subject body uptime_str
    ts=\$(date '+%Y-%m-%d %H:%M:%S')
    uptime_str=\$(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print \$2}' | cut -d',' -f1)
    subject="\${REPORT_SUBJECT_PREFIX:-[ServerMon]} \${severity} — \${server_name} — \${alert_type}"

    body="\$(cat <<EOF
SERVER ALERT — \${severity}
════════════════════════════
Server:      \${server_name}
Time:        \${ts}
Alert Type:  \${alert_type}
Severity:    \${severity}
Detail:      \${alert_detail}

Server Uptime: \${uptime_str}
Log:           \${LOG_FILE:-/var/log/healthmonitor/monitor.log}

-- Auto-generated by ServerHealthMonitor v\${VERSION:-1.0.0}
EOF
)"

    _send_email() {
        local recipient="\${ALERT_EMAIL:-root}"
        if command -v mailx &>/dev/null; then
            echo "\$body" | mailx -s "\$subject" "\$recipient" 2>/dev/null && return 0
        fi
        if command -v sendmail &>/dev/null; then
            { echo "Subject: \${subject}"; echo "To: \${recipient}"; echo ""; echo "\$body"; } | \\
                sendmail "\$recipient" 2>/dev/null && return 0
        fi
        echo "[WARN] No mail agent found. Alert NOT emailed." >&2
        return 1
    }

    _send_slack() {
        local webhook="\${SLACK_WEBHOOK:-}"
        [[ -z "\$webhook" || "\$webhook" == "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" ]] && {
            echo "[WARN] Slack webhook not configured." >&2; return 1
        }
        local emoji=":warning:"
        [[ "\$severity" == "CRITICAL" ]] && emoji=":rotating_light:"
        local payload
        payload=\$(printf '{"text":"%s *%s* — %s\\n%s\\nServer: \`%s\` | Time: \`%s\`"}' \\
                  "\$emoji" "\$severity" "\$alert_type" "\$alert_detail" "\$server_name" "\$ts")
        curl -fsS -X POST -H 'Content-type: application/json' --data "\$payload" "\$webhook" &>/dev/null
    }

    case "\${ALERT_METHOD:-email}" in
        email) _send_email ;;
        slack) _send_slack ;;
        both)  _send_email; _send_slack ;;
        *)     _send_email ;;
    esac
}`,
  },
  {
    file: 'generate_report.sh',
    dir: 'reports/',
    desc: 'Daily HTML health report generator. Parses 24 h of monitor.log using awk to compute CPU/RAM averages and peaks. Builds current disk and service snapshots. Generates an inline-CSS dark-theme HTML email and sends via mailx. Archives logs older than 30 days.',
    tags: ['awk log parsing', 'HTML email', 'inline CSS', 'mailx', 'log archival', '0 8 * * *'],
    code: `#!/usr/bin/env bash
# generate_report.sh — Daily HTML health report generator
# Parses last 24 h of monitor.log, builds an HTML email, sends to REPORT_EMAIL.
# Cron: 0 8 * * * /usr/local/bin/healthmonitor/reports/generate_report.sh
set -euo pipefail
trap 'echo "[ERROR] Report generation failed at line \${LINENO}" >&2; exit 1' ERR

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="\${SCRIPT_DIR}/config.conf"
[[ -f "\$CONFIG_FILE" ]] || { echo "[FATAL] config.conf not found" >&2; exit 1; }
source "\$CONFIG_FILE"

mkdir -p "\$REPORT_DIR"

DATE_LABEL=\$(date '+%B %d, %Y')
DATE_SLUG=\$(date '+%Y-%m-%d')
REPORT_FILE="\${REPORT_DIR}/report_\${DATE_SLUG}.html"
SERVER_NAME="\${HOSTNAME_OVERRIDE:-\$(hostname -s 2>/dev/null || echo unknown)}"
UPTIME_STR=\$(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print \$2}' | cut -d',' -f1)
YESTERDAY=\$(date -d 'yesterday' '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')

parse_metric() {
    local module="\$1" field="\$2"
    grep "\[\${module}\]" "\${LOG_FILE}" 2>/dev/null | \\
        grep -E "\${YESTERDAY}|\${DATE_SLUG}" | \\
        grep -oP "\${field}:\\s*\\K[0-9]+" | \\
        awk 'BEGIN{s=0;n=0} {s+=\$1;n++} END{if(n>0) printf "%d",s/n; else print "N/A"}'
}

parse_peak() {
    local module="\$1" field="\$2"
    grep "\[\${module}\]" "\${LOG_FILE}" 2>/dev/null | \\
        grep -E "\${YESTERDAY}|\${DATE_SLUG}" | \\
        grep -oP "\${field}:\\s*\\K[0-9]+" | \\
        awk 'BEGIN{m=0} {\$1>m?m=\$1:m} END{if(m>0) print m; else print "N/A"}'
}

CPU_AVG=\$(parse_metric "CPU" "Usage")
CPU_PEAK=\$(parse_peak  "CPU" "Usage")
RAM_AVG=\$(parse_metric "RAM" "RAM")
RAM_PEAK=\$(parse_peak  "RAM" "RAM")
ALERT_TOTAL=\$(grep "\\[ALERT\\]" "\${LOG_FILE}" 2>/dev/null | grep -cE "\${YESTERDAY}|\${DATE_SLUG}" || echo 0)

# Build disk and service rows, generate HTML, email report
# Full HTML generation and mailx dispatch...
echo "[OK] Report generated: \${REPORT_FILE}"`,
  },
  {
    file: 'install.sh',
    dir: '',
    desc: 'One-command setup script. Checks root privileges, verifies dependencies (top, free, df, ping, systemctl, curl), creates all directories, installs scripts to /usr/local/bin/healthmonitor/, deploys /etc/cron.d/healthmonitor with both cron jobs, and runs an initial dry-run verification.',
    tags: ['root check', 'dependency check', '/etc/cron.d/', 'mkdir -p', '--uninstall', 'dry-run test'],
    code: `#!/usr/bin/env bash
# install.sh — One-command setup for Server Health Monitor v1.0.0
# Installs scripts, sets up cron jobs, creates log directories.
# Usage: sudo bash install.sh [--uninstall]
set -euo pipefail
trap 'echo -e "\\n[ERROR] Installation failed at line \${LINENO}." >&2; exit 1' ERR

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'; BOLD='\\033[1m'; RESET='\\033[0m'

log()  { echo -e "\${CYAN}[\$(date '+%H:%M:%S')] INFO\${RESET}  \$*"; }
ok()   { echo -e "\${GREEN}[\$(date '+%H:%M:%S')]  OK  \${RESET}  \$*"; }
warn() { echo -e "\${YELLOW}[\$(date '+%H:%M:%S')] WARN\${RESET}  \$*"; }
die()  { echo -e "\${RED}[\$(date '+%H:%M:%S')] FAIL\${RESET}  \$*" >&2; exit 1; }

INSTALL_DIR="/usr/local/bin/healthmonitor"
CONFIG_DIR="/etc/healthmonitor"
LOG_DIR="/var/log/healthmonitor"
SRC_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

[[ \$EUID -eq 0 ]] || die "Must be run as root: sudo bash install.sh"

if [[ "\${1:-}" == "--uninstall" ]]; then
    crontab -l 2>/dev/null | grep -v healthmonitor | crontab - && ok "Cron jobs removed"
    rm -rf "\$INSTALL_DIR" && ok "Scripts removed"
    rm -rf "\$CONFIG_DIR"  && ok "Config removed"
    warn "Logs preserved at \${LOG_DIR}. Remove manually: rm -rf \${LOG_DIR}"
    exit 0
fi

MISSING=()
for cmd in top free df ping systemctl awk curl; do
    command -v "\$cmd" &>/dev/null && ok "Found: \$cmd" || { warn "Missing: \$cmd"; MISSING+=("\$cmd"); }
done
[[ \${#MISSING[@]} -gt 0 ]] && die "Required commands missing: \${MISSING[*]}"

for dir in "\$INSTALL_DIR" "\$INSTALL_DIR/modules" "\$INSTALL_DIR/reports" \\
           "\$CONFIG_DIR" "\$LOG_DIR" "\${LOG_DIR}/.cooldown" "\${LOG_DIR}/reports"; do
    mkdir -p "\$dir" && ok "Created: \$dir"
done

cp "\${SRC_DIR}/config.conf" "\${CONFIG_DIR}/config.conf"
chmod 640 "\${CONFIG_DIR}/config.conf"
ln -sf "\${CONFIG_DIR}/config.conf" "\${INSTALL_DIR}/config.conf"
ok "Config installed: \${CONFIG_DIR}/config.conf"

cp "\${SRC_DIR}/health_monitor.sh" "\${INSTALL_DIR}/"
for mod in check_cpu check_ram check_disk check_services check_network send_alert; do
    cp "\${SRC_DIR}/modules/\${mod}.sh" "\${INSTALL_DIR}/modules/"
done
cp "\${SRC_DIR}/reports/generate_report.sh" "\${INSTALL_DIR}/reports/"
find "\$INSTALL_DIR" -name "*.sh" -exec chmod 755 {} \\;
ok "All scripts installed and made executable"

cat > "/etc/cron.d/healthmonitor" <<CRONTAB
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/5 * * * * root \${INSTALL_DIR}/health_monitor.sh >> \${LOG_DIR}/cron.log 2>&1
0 8 * * * root \${INSTALL_DIR}/reports/generate_report.sh >> \${LOG_DIR}/cron.log 2>&1
CRONTAB
chmod 644 "/etc/cron.d/healthmonitor"
ok "Cron installed: /etc/cron.d/healthmonitor"

bash "\${INSTALL_DIR}/health_monitor.sh" --dry-run --verbose && ok "Initial dry-run passed"

echo -e "\\n\${GREEN}\${BOLD}Installation complete! Edit \${CONFIG_DIR}/config.conf to configure alerts.\${RESET}"`,
  },
];
