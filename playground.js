/* playground.js — Server Health Monitor simulator
   Live gauges · Status chips · Realistic log output · Exit code display
   Entirely isolated from main.js.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// GAUGE MATH  (r=38, circumference = 2π×38 ≈ 238.76)
// ════════════════════════════════════════════════════════════════════════════
const PG_CIRC = 238.76;
const CPU_THRESH  = 85;
const RAM_THRESH  = 90;
const DISK_THRESH = 80;

function pgSetGauge(arcId, pct, threshWarn, threshCrit) {
  const arc = document.getElementById(arcId);
  if (!arc) return;
  const offset = PG_CIRC * (1 - pct / 100);
  arc.style.strokeDasharray  = PG_CIRC;
  arc.style.strokeDashoffset = offset;
  if (pct >= (threshCrit || threshWarn + 5)) arc.style.stroke = 'var(--red)';
  else if (pct >= threshWarn)                arc.style.stroke = 'var(--amber)';
  else                                        arc.style.stroke = 'var(--green)';
}

function pgSetText(textId, pct) {
  const el = document.getElementById(textId);
  if (el) el.textContent = pct + '%';
}

function updatePlayGauge(arcId, textId, pct, warn) {
  pgSetGauge(arcId, pct, warn);
  pgSetText(textId, pct);
}

// ════════════════════════════════════════════════════════════════════════════
// CHIP STATE HELPERS
// ════════════════════════════════════════════════════════════════════════════
function setChip(chipId, valId, state, label) {
  const chip = document.getElementById(chipId);
  const val  = document.getElementById(valId);
  if (!chip || !val) return;
  chip.className = 'play-chip play-chip-' + state;
  val.textContent = label;
}

function chipStateForPct(pct, thresh) {
  if (pct >= thresh)              return 'crit';
  if (pct >= thresh * 0.88)      return 'warn';
  return 'ok';
}

function chipLabelForPct(pct, thresh) {
  if (pct >= thresh)         return 'ALERT';
  if (pct >= thresh * 0.88)  return 'WARN';
  return 'OK';
}

function chipStateForService(val) {
  if (val === 'nginx-down' || val === 'mysql-down') return 'crit';
  if (val === 'nginx-restart')                       return 'warn';
  return 'ok';
}

function chipLabelForService(val) {
  if (val === 'nginx-down' || val === 'mysql-down') return 'ALERT';
  if (val === 'nginx-restart')                       return 'WARN';
  return 'OK';
}

function chipStateForNet(val) {
  return val === 'ok' ? 'ok' : 'crit';
}

function chipLabelForNet(val) {
  return val === 'ok' ? 'OK' : 'ALERT';
}

// ════════════════════════════════════════════════════════════════════════════
// UPDATE ALL LIVE WIDGETS from current slider/select values
// ════════════════════════════════════════════════════════════════════════════
function updateLiveWidgets() {
  const cpu     = parseInt(document.getElementById('play-cpu')?.value  || '23', 10);
  const ram     = parseInt(document.getElementById('play-ram')?.value  || '41', 10);
  const disk    = parseInt(document.getElementById('play-disk')?.value || '45', 10);
  const service = document.getElementById('play-service')?.value || 'all-ok';
  const net     = document.getElementById('play-net')?.value     || 'ok';

  // Gauges
  updatePlayGauge('pg-cpu-arc',  'pg-cpu-text',  cpu,  CPU_THRESH);
  updatePlayGauge('pg-ram-arc',  'pg-ram-text',  ram,  RAM_THRESH);
  updatePlayGauge('pg-disk-arc', 'pg-disk-text', disk, DISK_THRESH);

  // Range value colours
  const setRangeValColor = (valId, pct, thresh) => {
    const el = document.getElementById(valId);
    if (!el) return;
    el.className = 'play-range-val' +
      (pct >= thresh ? ' crit' : pct >= thresh * 0.88 ? ' warn' : '');
  };
  setRangeValColor('play-cpu-val',  cpu,  CPU_THRESH);
  setRangeValColor('play-ram-val',  ram,  RAM_THRESH);
  setRangeValColor('play-disk-val', disk, DISK_THRESH);

  // Chips
  setChip('pchip-cpu',  'pchip-cpu-val',  chipStateForPct(cpu,  CPU_THRESH),  chipLabelForPct(cpu,  CPU_THRESH));
  setChip('pchip-ram',  'pchip-ram-val',  chipStateForPct(ram,  RAM_THRESH),  chipLabelForPct(ram,  RAM_THRESH));
  setChip('pchip-disk', 'pchip-disk-val', chipStateForPct(disk, DISK_THRESH), chipLabelForPct(disk, DISK_THRESH));
  setChip('pchip-svc',  'pchip-svc-val',  chipStateForService(service), chipLabelForService(service));
  setChip('pchip-net',  'pchip-net-val',  chipStateForNet(net),         chipLabelForNet(net));
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO PRESETS
// ════════════════════════════════════════════════════════════════════════════
const SCENARIOS = {
  'healthy':      { cpu: 23,  ram: 41,  disk: 45,  service: 'all-ok',       net: 'ok' },
  'cpu-spike':    { cpu: 92,  ram: 54,  disk: 55,  service: 'all-ok',       net: 'ok' },
  'disk-full':    { cpu: 28,  ram: 44,  disk: 87,  service: 'all-ok',       net: 'ok' },
  'service-down': { cpu: 31,  ram: 47,  disk: 52,  service: 'nginx-restart', net: 'ok' },
  'network-fail': { cpu: 26,  ram: 42,  disk: 48,  service: 'all-ok',       net: 'icmp-fail' },
  'critical':     { cpu: 95,  ram: 93,  disk: 91,  service: 'nginx-down',   net: 'dns-fail' },
};

// ════════════════════════════════════════════════════════════════════════════
// LOG LINE BUILDER
// ════════════════════════════════════════════════════════════════════════════
function buildLines(cpu, ram, disk, service, net) {
  const ts = () => {
    const d = new Date();
    return `[${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ` +
           `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
  };

  const lines = [];
  const T = ts();

  lines.push({ cls: 'term-line-info', text: `${T} [MONITOR] [INFO ] === Health check started on web-server-01 (v1.0.0) ===` });

  // CPU
  const cpuLoad = (cpu / 4 * (0.8 + Math.random() * 0.4)).toFixed(2);
  if (cpu >= CPU_THRESH) {
    lines.push({ cls: 'term-line-alert', text: `${T} [CPU    ] [ALERT] Usage: ${cpu}% | Load(1m): ${cpuLoad} | Cores: 4 | Threshold: ${CPU_THRESH}%` });
    lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching CPU alert to admin@company.com` });
  } else {
    lines.push({ cls: 'term-line-ok',   text: `${T} [CPU    ] [OK   ] Usage: ${cpu}% | Load(1m): ${cpuLoad} | Cores: 4 | Threshold: ${CPU_THRESH}%` });
  }

  // RAM
  const ramUsed  = Math.round(ram * 81.92);
  const ramAvail = 8192 - ramUsed;
  if (ram >= RAM_THRESH) {
    lines.push({ cls: 'term-line-alert', text: `${T} [RAM    ] [ALERT] RAM: ${ram}% (${ramUsed}M/8192M used, ${ramAvail}M avail) | Swap: 12% | Threshold: ${RAM_THRESH}%` });
    lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching RAM alert to admin@company.com` });
  } else {
    lines.push({ cls: 'term-line-ok',   text: `${T} [RAM    ] [OK   ] RAM: ${ram}% (${ramUsed}M/8192M used, ${ramAvail}M avail) | Swap: 0% | Threshold: ${RAM_THRESH}%` });
  }

  // Disk
  const diskFree = Math.round((100 - disk) * 0.96);
  if (disk >= DISK_THRESH) {
    lines.push({ cls: 'term-line-alert', text: `${T} [DISK   ] [ALERT] /var/log: ${disk}% used (${diskFree}G free of 96G) | Threshold: ${DISK_THRESH}%` });
    lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching DISK alert to admin@company.com` });
  } else {
    lines.push({ cls: 'term-line-ok',   text: `${T} [DISK   ] [OK   ] /: ${disk}% used (${diskFree}G free of 96G) | Threshold: ${DISK_THRESH}%` });
    lines.push({ cls: 'term-line-ok',   text: `${T} [DISK   ] [OK   ] /var: ${Math.max(disk - 15, 12)}% used | /home: ${Math.max(disk - 22, 8)}% used` });
  }

  // Services
  switch (service) {
    case 'all-ok':
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] nginx: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] mysql: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] sshd: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] firewalld: active (running) since May 03 08:12` });
      break;
    case 'nginx-down':
      lines.push({ cls: 'term-line-alert', text: `${T} [SERVICE] [ALERT] nginx: failed — Auto-restart failed (check journalctl -u nginx)` });
      lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching SERVICE alert to admin@company.com` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] mysql: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] sshd: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] firewalld: active (running) since May 03 08:12` });
      break;
    case 'mysql-down':
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] nginx: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-alert', text: `${T} [SERVICE] [ALERT] mysql: inactive — Auto-restart failed (check journalctl -u mysql)` });
      lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching SERVICE alert to admin@company.com` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] sshd: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] firewalld: active (running) since May 03 08:12` });
      break;
    case 'nginx-restart':
      lines.push({ cls: 'term-line-warn', text: `${T} [SERVICE] [WARN ] nginx: was failed — restarted successfully (auto-recovery)` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] mysql: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] sshd: active (running) since May 03 08:12` });
      lines.push({ cls: 'term-line-ok',   text: `${T} [SERVICE] [OK   ] firewalld: active (running) since May 03 08:12` });
      break;
  }

  // Network
  switch (net) {
    case 'ok':
      lines.push({ cls: 'term-line-ok',   text: `${T} [NETWORK] [OK   ] ICMP 8.8.8.8: OK (avg 12ms) | DNS 1.1.1.1: resolving google.com OK | Gateway: OK` });
      break;
    case 'icmp-fail':
      lines.push({ cls: 'term-line-alert', text: `${T} [NETWORK] [ALERT] Network failures — ICMP to 8.8.8.8: UNREACHABLE` });
      lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching NETWORK alert to admin@company.com` });
      break;
    case 'dns-fail':
      lines.push({ cls: 'term-line-alert', text: `${T} [NETWORK] [ALERT] Network failures — DNS via 1.1.1.1: resolution FAILED` });
      lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] → Dispatching NETWORK alert to admin@company.com` });
      break;
  }

  // Summary
  const alertCount = lines.filter(l => l.cls === 'term-line-alert').length;
  if (alertCount === 0) {
    lines.push({ cls: 'term-line-ok',   text: `${T} [MONITOR] [OK   ] All checks passed — web-server-01 is healthy` });
    lines.push({ cls: 'term-line-info', text: `${T} [MONITOR] [INFO ] Exit code: 0` });
  } else {
    lines.push({ cls: 'term-line-alert', text: `${T} [MONITOR] [ALERT] ${alertCount} alert(s) fired — see /var/log/healthmonitor/alerts.log` });
    lines.push({ cls: 'term-line-info',  text: `${T} [MONITOR] [INFO ] Exit code: 1` });
  }

  return { lines, exitCode: alertCount === 0 ? 0 : 1 };
}

// ════════════════════════════════════════════════════════════════════════════
// TERMINAL RENDERER
// ════════════════════════════════════════════════════════════════════════════
let playRunning = false;

function setExitBadge(code) {
  const el = document.getElementById('play-term-exit');
  if (!el) return;
  el.textContent = `exit: ${code}`;
  el.className   = `play-term-exit exit-${code}`;
}

function renderPlayTerminal(lines, exitCode) {
  const body = document.getElementById('play-term-body');
  if (!body) return;

  body.innerHTML = `<div class="term-line-info">$ sudo bash /usr/local/bin/healthmonitor/health_monitor.sh --verbose</div>`;

  // Clear exit badge while running
  const exitEl = document.getElementById('play-term-exit');
  if (exitEl) { exitEl.textContent = '…'; exitEl.className = 'play-term-exit'; }

  let i = 0;
  playRunning = true;

  function next() {
    if (i >= lines.length) {
      playRunning = false;
      setExitBadge(exitCode);
      return;
    }
    const { cls, text } = lines[i++];
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    div.style.opacity = '0';
    body.appendChild(div);
    requestAnimationFrame(() => {
      div.style.transition = 'opacity 0.15s';
      div.style.opacity = '1';
    });
    body.scrollTop = body.scrollHeight;
    setTimeout(next, 80 + Math.random() * 70);
  }
  next();
}

// ════════════════════════════════════════════════════════════════════════════
// WIRE INPUTS
// ════════════════════════════════════════════════════════════════════════════
function wireRanges() {
  [
    ['play-cpu',  'play-cpu-val'],
    ['play-ram',  'play-ram-val'],
    ['play-disk', 'play-disk-val'],
  ].forEach(([rangeId, valId]) => {
    const r = document.getElementById(rangeId);
    const v = document.getElementById(valId);
    if (!r || !v) return;
    r.addEventListener('input', () => {
      v.textContent = r.value + '%';
      updateLiveWidgets();
    });
  });
}

function wireScenario() {
  const sel = document.getElementById('play-scenario');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const s = SCENARIOS[sel.value];
    if (!s) return;
    const setRange = (id, val, labelId) => {
      const el  = document.getElementById(id);
      const lbl = document.getElementById(labelId);
      if (el)  el.value = val;
      if (lbl) lbl.textContent = val + '%';
    };
    setRange('play-cpu',  s.cpu,  'play-cpu-val');
    setRange('play-ram',  s.ram,  'play-ram-val');
    setRange('play-disk', s.disk, 'play-disk-val');
    const svcEl = document.getElementById('play-service');
    const netEl = document.getElementById('play-net');
    if (svcEl) svcEl.value = s.service;
    if (netEl) netEl.value = s.net;
    updateLiveWidgets();
  });
}

function wireSelects() {
  ['play-service', 'play-net'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateLiveWidgets);
  });
}

function wireRunBtn() {
  const btn = document.getElementById('play-run-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (playRunning) return;
    const cpu     = parseInt(document.getElementById('play-cpu')?.value  || '23', 10);
    const ram     = parseInt(document.getElementById('play-ram')?.value  || '41', 10);
    const disk    = parseInt(document.getElementById('play-disk')?.value || '45', 10);
    const service = document.getElementById('play-service')?.value || 'all-ok';
    const net     = document.getElementById('play-net')?.value     || 'ok';
    const { lines, exitCode } = buildLines(cpu, ram, disk, service, net);
    renderPlayTerminal(lines, exitCode);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  wireRanges();
  wireScenario();
  wireSelects();
  wireRunBtn();
  updateLiveWidgets();   // initialise gauges and chips on load
});
