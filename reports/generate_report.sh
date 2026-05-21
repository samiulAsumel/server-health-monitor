#!/usr/bin/env bash
# generate_report.sh — Daily HTML health report generator
# Parses last 24 h of monitor.log, builds an HTML email, sends to REPORT_EMAIL.
# Cron: 0 8 * * * /usr/local/bin/healthmonitor/reports/generate_report.sh
set -euo pipefail
trap 'echo "[ERROR] Report generation failed at line ${LINENO}" >&2; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.conf"
[[ -f "$CONFIG_FILE" ]] || { echo "[FATAL] config.conf not found" >&2; exit 1; }
# shellcheck source=../config.conf
source "$CONFIG_FILE"

mkdir -p "$REPORT_DIR"

DATE_LABEL=$(date '+%B %d, %Y')
DATE_SLUG=$(date '+%Y-%m-%d')
REPORT_FILE="${REPORT_DIR}/report_${DATE_SLUG}.html"
SERVER_NAME="${HOSTNAME_OVERRIDE:-$(hostname -s 2>/dev/null || echo unknown)}"
UPTIME_STR=$(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | cut -d',' -f1)
YESTERDAY=$(date -d 'yesterday' '+%Y-%m-%d' 2>/dev/null || date -v-1d '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')

# ── Parse log for last 24 h ───────────────────────────────────────────────────
[[ -f "$LOG_FILE" ]] || { echo "[WARN] No log file found at ${LOG_FILE}. Empty report." >&2; }

parse_metric() {
    local module="$1" field="$2"
    grep "\[${module}\]" "${LOG_FILE}" 2>/dev/null | \
        grep -E "${YESTERDAY}|${DATE_SLUG}" | \
        grep -oP "${field}:\s*\K[0-9]+" | \
        awk 'BEGIN{s=0;n=0} {s+=$1;n++} END{if(n>0) printf "%d",s/n; else print "N/A"}'
}

parse_peak() {
    local module="$1" field="$2"
    grep "\[${module}\]" "${LOG_FILE}" 2>/dev/null | \
        grep -E "${YESTERDAY}|${DATE_SLUG}" | \
        grep -oP "${field}:\s*\K[0-9]+" | \
        awk 'BEGIN{m=0} {if($1>m)m=$1} END{if(m>0) print m; else print "N/A"}'
}

count_alerts()  { grep "\[ALERT\]" "${LOG_FILE}" 2>/dev/null | grep -cE "${YESTERDAY}|${DATE_SLUG}" || echo 0; }
count_restarts(){ grep "\[SERVICE\].*restarted" "${LOG_FILE}" 2>/dev/null | grep -cE "${YESTERDAY}|${DATE_SLUG}" || echo 0; }

CPU_AVG=$(parse_metric "CPU" "Usage")
CPU_PEAK=$(parse_peak  "CPU" "Usage")
RAM_AVG=$(parse_metric "RAM" "RAM")
RAM_PEAK=$(parse_peak  "RAM" "RAM")
ALERT_TOTAL=$(count_alerts)
RESTART_TOTAL=$(count_restarts)

status_badge() {
    local val="$1" warn="$2" crit="$3" label="$4"
    if [[ "$val" == "N/A" ]]; then
        echo "<span class=\"badge badge-na\">N/A</span> ${label}"
    elif [[ "$val" -ge "$crit" ]]; then
        echo "<span class=\"badge badge-red\">&#x26A0; ${val}%</span> ${label}"
    elif [[ "$val" -ge "$warn" ]]; then
        echo "<span class=\"badge badge-amber\">&#x26A0; ${val}%</span> ${label}"
    else
        echo "<span class=\"badge badge-green\">&#x2713; ${val}%</span> ${label}"
    fi
}

# ── Build disk rows ───────────────────────────────────────────────────────────
DISK_ROWS=""
while IFS= read -r line; do
    mp=$(echo "$line" | awk '{print $6}')
    pct=$(echo "$line" | awk '{print $5}' | tr -d '%')
    sz=$(echo "$line" | awk '{print $2}')
    av=$(echo "$line" | awk '{print $4}')
    [[ "$mp" =~ ^(/proc|/sys|/dev|/run|/snap) ]] && continue
    [[ -z "${pct:-}" || -z "${mp:-}" ]] && continue
    if [[ "$pct" -ge "$DISK_THRESHOLD" ]]; then
        badge="<span class=\"badge badge-red\">&#x26A0; ${pct}%</span>"
    elif [[ "$pct" -ge $(( DISK_THRESHOLD - 10 )) ]]; then
        badge="<span class=\"badge badge-amber\">&#x26A0; ${pct}%</span>"
    else
        badge="<span class=\"badge badge-green\">&#x2713; ${pct}%</span>"
    fi
    DISK_ROWS+="<tr><td class=\"mp\">${mp}</td><td>${badge}</td><td>${av} free of ${sz}</td></tr>"
done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null | tail -n +2 || df -h | tail -n +2)

# ── Build service rows ────────────────────────────────────────────────────────
SVC_ROWS=""
for svc in $SERVICES; do
    state=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
    if [[ "$state" == "active" ]]; then
        badge="<span class=\"badge badge-green\">&#x2713; active</span>"
    else
        badge="<span class=\"badge badge-red\">&#x26A0; ${state}</span>"
    fi
    SVC_ROWS+="<tr><td class=\"mp\">${svc}</td><td>${badge}</td></tr>"
done

# ── Generate HTML ─────────────────────────────────────────────────────────────
cat > "$REPORT_FILE" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Server Health Report — ${DATE_LABEL}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;padding:20px}
  .wrap{max-width:680px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden}
  .hdr{background:linear-gradient(135deg,#0d3320,#0a2010);padding:28px 32px;border-bottom:1px solid #30363d}
  .hdr h1{margin:0;font-size:20px;color:#00e676;letter-spacing:1px}
  .hdr .sub{color:#7d8590;font-size:13px;margin-top:6px}
  .section{padding:20px 32px;border-bottom:1px solid #21262d}
  .section h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#7d8590;margin:0 0 14px}
  table{width:100%;border-collapse:collapse}
  td{padding:7px 0;font-size:14px;border-bottom:1px solid #21262d}
  td.mp{color:#58a6ff;font-family:monospace;font-size:13px;padding-right:12px}
  .badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600}
  .badge-green{background:#0d3320;color:#3fb950;border:1px solid #238636}
  .badge-amber{background:#2d1f00;color:#e3b341;border:1px solid #9e6a03}
  .badge-red{background:#3d0d0d;color:#f85149;border:1px solid #b91c1c}
  .badge-na{background:#21262d;color:#7d8590;border:1px solid #30363d}
  .stat-row{display:flex;gap:12px;flex-wrap:wrap}
  .stat{flex:1;min-width:120px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:14px;text-align:center}
  .stat .val{font-size:28px;font-weight:700;color:#00e676}
  .stat .val.warn{color:#e3b341} .stat .val.crit{color:#f85149}
  .stat .lbl{font-size:11px;color:#7d8590;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
  .footer{padding:16px 32px;font-size:12px;color:#7d8590;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>&#x1F4CA; SERVER HEALTH REPORT</h1>
    <div class="sub">${DATE_LABEL} &nbsp;|&nbsp; ${SERVER_NAME} &nbsp;|&nbsp; Uptime: ${UPTIME_STR}</div>
  </div>

  <div class="section">
    <h2>Summary</h2>
    <div class="stat-row">
      <div class="stat">
        <div class="val $([ "${CPU_AVG:-0}" -ge "${CPU_THRESHOLD:-85}" ] && echo crit || echo '')">${CPU_AVG}%</div>
        <div class="lbl">CPU Avg</div>
      </div>
      <div class="stat">
        <div class="val $([ "${CPU_PEAK:-0}" -ge "${CPU_THRESHOLD:-85}" ] && echo crit || echo '')">${CPU_PEAK}%</div>
        <div class="lbl">CPU Peak</div>
      </div>
      <div class="stat">
        <div class="val $([ "${RAM_AVG:-0}" -ge "${RAM_THRESHOLD:-90}" ] && echo crit || echo '')">${RAM_AVG}%</div>
        <div class="lbl">RAM Avg</div>
      </div>
      <div class="stat">
        <div class="val $([ "${ALERT_TOTAL:-0}" -ge 1 ] && echo warn || echo '')">${ALERT_TOTAL}</div>
        <div class="lbl">Alerts</div>
      </div>
      <div class="stat">
        <div class="val $([ "${RESTART_TOTAL:-0}" -ge 1 ] && echo warn || echo '')">${RESTART_TOTAL}</div>
        <div class="lbl">Restarts</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>CPU &amp; RAM (24 h)</h2>
    <table>
      <tr><td>CPU Average</td><td>$(status_badge "${CPU_AVG:-0}" 70 "$CPU_THRESHOLD" "avg usage")</td></tr>
      <tr><td>CPU Peak</td><td>$(status_badge "${CPU_PEAK:-0}" 80 "$CPU_THRESHOLD" "peak usage")</td></tr>
      <tr><td>RAM Average</td><td>$(status_badge "${RAM_AVG:-0}" 75 "$RAM_THRESHOLD" "avg usage")</td></tr>
      <tr><td>RAM Peak</td><td>$(status_badge "${RAM_PEAK:-0}" 85 "$RAM_THRESHOLD" "peak usage")</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Disk Usage</h2>
    <table>${DISK_ROWS}</table>
  </div>

  <div class="section">
    <h2>Services</h2>
    <table>${SVC_ROWS}</table>
  </div>

  <div class="footer">
    Auto-generated by ServerHealthMonitor v${VERSION} &nbsp;|&nbsp; Log: ${LOG_FILE}
  </div>
</div>
</body>
</html>
HTML

echo "[OK] Report written to ${REPORT_FILE}"

# ── Email the report ──────────────────────────────────────────────────────────
SUBJECT="${REPORT_SUBJECT_PREFIX} Daily Health Report — ${SERVER_NAME} — ${DATE_LABEL}"
if command -v mailx &>/dev/null; then
    mailx -a "Content-Type: text/html" \
          -s "$SUBJECT" \
          "$REPORT_EMAIL" < "$REPORT_FILE" && \
    echo "[OK] Report emailed to ${REPORT_EMAIL}" || \
    echo "[WARN] mailx failed — report saved to ${REPORT_FILE}" >&2
else
    echo "[WARN] mailx not found — report saved to ${REPORT_FILE}. Install mailx to enable email delivery." >&2
fi

# Archive logs older than 30 days
find "$LOG_DIR" -name "monitor.log.*" -mtime +30 -delete 2>/dev/null || true
