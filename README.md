# Server Health Monitor — Auto-Alert System

Production-grade Bash monitoring for RHEL 9 / Rocky Linux / CentOS / Ubuntu.
CPU, RAM, disk, service, and network checks every 5 minutes via cron — with instant email/Slack alerts and a daily HTML report.

---

## Prerequisites

- RHEL 9 / Rocky Linux 9 / CentOS 9 / Ubuntu 22.04+
- Root access
- `mailx` or `sendmail` (for email alerts): `dnf install mailx` or `apt install mailutils`
- `curl` (for Slack alerts — usually pre-installed)
- Configured SMTP relay if using email alerts

---

## Installation

```bash
git clone https://github.com/samiulAsumel/server-health-monitor.git
cd server-health-monitor
sudo bash install.sh
```

The installer will:
1. Check all dependencies
2. Create `/usr/local/bin/healthmonitor/` and `/etc/healthmonitor/`
3. Install `/etc/cron.d/healthmonitor` with both cron jobs
4. Run an initial dry-run to verify everything works

---

## Configuration

Edit `/etc/healthmonitor/config.conf` after installation:

```bash
# Thresholds
CPU_THRESHOLD=85
RAM_THRESHOLD=90
DISK_THRESHOLD=80

# Services (space-separated systemd unit names)
SERVICES="nginx mysql sshd firewalld"

# Alert delivery
ALERT_EMAIL="admin@company.com"
SLACK_WEBHOOK="https://hooks.slack.com/services/..."
ALERT_METHOD="email"   # email | slack | both

# Daily report recipient
REPORT_EMAIL="manager@company.com"
```

---

## Manual Usage

```bash
# Run health check once (verbose output to terminal)
sudo bash /usr/local/bin/healthmonitor/health_monitor.sh --verbose

# Dry-run (no alerts sent)
sudo bash /usr/local/bin/healthmonitor/health_monitor.sh --dry-run --verbose

# Run individual checks
sudo bash /usr/local/bin/healthmonitor/modules/check_cpu.sh
sudo bash /usr/local/bin/healthmonitor/modules/check_disk.sh

# Generate report immediately
sudo bash /usr/local/bin/healthmonitor/reports/generate_report.sh

# Watch live logs
tail -f /var/log/healthmonitor/monitor.log
```

---

## Log Format

```
[2026-05-21 14:32:01] [CPU]     [OK]    Usage: 23% | Load(1m): 1.24 | Cores: 4 | Threshold: 85%
[2026-05-21 14:32:01] [DISK]    [ALERT] /var/log: 87% used (3.2G free of 25G) | Threshold: 80%
[2026-05-21 14:32:01] [SERVICE] [WARN]  nginx: was failed — restarted successfully (auto-recovery)
[2026-05-21 14:32:02] [MONITOR] [ALERT] 2 alert(s) fired — see /var/log/healthmonitor/alerts.log
```

---

## Adding More Services

Edit `SERVICES` in `/etc/healthmonitor/config.conf`:

```bash
SERVICES="nginx mysql sshd firewalld postgresql redis"
```

Any systemd unit name works. Changes take effect at the next cron run (within 5 minutes).

---

## Testing Alerts

```bash
# Temporarily lower CPU threshold to 5% to force an alert
sudo sed -i 's/CPU_THRESHOLD=85/CPU_THRESHOLD=5/' /etc/healthmonitor/config.conf
sudo bash /usr/local/bin/healthmonitor/health_monitor.sh --verbose
# Restore threshold
sudo sed -i 's/CPU_THRESHOLD=5/CPU_THRESHOLD=85/' /etc/healthmonitor/config.conf
```

---

## File Structure

```
server-health-monitor/
├── install.sh              One-command setup (run as root)
├── config.conf             All thresholds and settings
├── health_monitor.sh       Main orchestrator (runs via cron)
├── modules/
│   ├── check_cpu.sh        CPU + load average check
│   ├── check_ram.sh        RAM + swap check
│   ├── check_disk.sh       Disk space check (all mounts)
│   ├── check_services.sh   Systemd service check + auto-restart
│   ├── check_network.sh    ICMP + DNS + gateway check
│   └── send_alert.sh       Email/Slack dispatcher with cooldown
└── reports/
    └── generate_report.sh  Daily HTML report generator
```

---

## Cron Schedule

| Job | Schedule | Log |
|---|---|---|
| `health_monitor.sh` | Every 5 min | `/var/log/healthmonitor/monitor.log` |
| `generate_report.sh` | Daily 08:00 | `/var/log/healthmonitor/reports/` |

---

## Uninstall

```bash
sudo bash install.sh --uninstall
```

Logs are preserved at `/var/log/healthmonitor/`. Remove manually if needed.

---

Built by Samiul Alam · RHCSA / DevOps Engineer  
Part of the Linux Job-Ready DevOps portfolio series.
