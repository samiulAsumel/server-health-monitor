/* main.js — Server Health Monitor portfolio site
   Terminal animation · Gauges · Script explorer · Search · Keyboard nav
   Skills · Pipeline fill · Alert tabs · Hamburger · Scroll reveal
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// SKILLS DATA
// ════════════════════════════════════════════════════════════════════════════
const SKILLS = [
  { label: 'Bash Scripting',      desc: 'set -euo pipefail, trap ERR, colour logging, dry-run flags, modular architecture', pct: 95 },
  { label: 'Cron & Scheduling',   desc: '/etc/cron.d/ deployment, multi-job management, cron.log routing', pct: 90 },
  { label: 'systemctl / systemd', desc: 'is-active, restart, ActiveEnterTimestamp, service state management', pct: 88 },
  { label: 'Log Parsing (awk)',    desc: 'Average and peak extraction, structured log format, 30-day archival', pct: 85 },
  { label: 'Email Alerts (mailx)', desc: 'Plain-text alerts, HTML report delivery, sendmail fallback', pct: 80 },
  { label: 'Slack Webhooks',      desc: 'curl JSON payload, emoji severity levels, webhook validation', pct: 82 },
  { label: 'Disk Monitoring',     desc: 'df -h parsing, /proc/mounts type detection, tmpfs exclusion, LVM support', pct: 88 },
  { label: 'Network Diagnostics', desc: 'ICMP ping, DNS resolution test, default gateway check', pct: 85 },
  { label: 'CPU Analysis',        desc: 'top -bn1, /proc/stat delta, /proc/loadavg, nproc core count', pct: 83 },
  { label: 'RAM Monitoring',      desc: 'free -m parsing, swap threshold, percentage calculation guards', pct: 88 },
  { label: 'HTML Report Gen',     desc: 'Inline CSS email, dark-theme, status badges, awk stat aggregation', pct: 78 },
  { label: 'Idempotent Install',  desc: 'root check, dep verification, config backup, /etc/cron.d/ install', pct: 90 },
];

// ════════════════════════════════════════════════════════════════════════════
// HERO TERMINAL SEQUENCES
// ════════════════════════════════════════════════════════════════════════════
const TERMINAL_SEQUENCES = [
  {
    cmd: 'sudo bash health_monitor.sh --verbose',
    lines: [
      { cls: 'term-line-info',  text: '[14:30:00] [MONITOR] [INFO]  === Health check started on web-server-01 (v1.0.0) ===' },
      { cls: 'term-line-ok',    text: '[14:30:00] [CPU]     [OK]    Usage: 23% | Load(1m): 1.24 | Cores: 4 | Threshold: 85%' },
      { cls: 'term-line-ok',    text: '[14:30:00] [RAM]     [OK]    RAM: 41% (3327M/8192M used, 4865M avail) | Swap: 0%' },
      { cls: 'term-line-ok',    text: '[14:30:01] [DISK]    [OK]    /: 45% used (53G free of 96G) | Threshold: 80%' },
      { cls: 'term-line-alert', text: '[14:30:01] [DISK]    [ALERT] /var/log: 87% used (3.2G free of 25G) | Threshold: 80%' },
    ],
  },
  {
    cmd: 'sudo bash modules/check_services.sh',
    lines: [
      { cls: 'term-line-ok',   text: '[ OK ] [SVC] nginx: active (running) since May 03 08:12' },
      { cls: 'term-line-ok',   text: '[ OK ] [SVC] mysql: active (running) since May 03 08:12' },
      { cls: 'term-line-ok',   text: '[ OK ] [SVC] sshd: active (running) since May 03 08:12' },
      { cls: 'term-line-warn', text: '[WARN] [SVC] firewalld: was failed — restarted successfully (auto-recovery)' },
    ],
  },
  {
    cmd: 'tail -f /var/log/healthmonitor/monitor.log',
    lines: [
      { cls: 'term-line-ok',    text: '[2026-05-21 14:25:00] [CPU]     [OK]    Usage: 21% | Load(1m): 0.98' },
      { cls: 'term-line-ok',    text: '[2026-05-21 14:25:00] [DISK]    [OK]    /: 45% | /var: 76%' },
      { cls: 'term-line-ok',    text: '[2026-05-21 14:25:00] [MONITOR] [OK]    All checks passed — web-server-01 is healthy' },
      { cls: 'term-line-alert', text: '[2026-05-21 14:30:01] [DISK]    [ALERT] /var/log: 87% used (3.2G free of 25G)' },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// GAUGE MATH  (r=38, circumference = 2π×38 ≈ 238.76)
// ════════════════════════════════════════════════════════════════════════════
const CIRC = 238.76;

function setGauge(arcId, textId, pct) {
  const arc  = document.getElementById(arcId);
  const text = document.getElementById(textId);
  if (!arc || !text) return;
  const offset = CIRC * (1 - pct / 100);
  arc.style.strokeDasharray  = CIRC;
  arc.style.strokeDashoffset = offset;
  if (pct >= 85)      arc.style.stroke = 'var(--red)';
  else if (pct >= 70) arc.style.stroke = 'var(--amber)';
  else                arc.style.stroke = 'var(--green)';
  text.textContent = pct + '%';
}

function animateHeroGauges() {
  const METRICS = [
    { arc: 'gauge-arc-cpu',  text: 'gauge-pct-cpu',  pct: 23 },
    { arc: 'gauge-arc-ram',  text: 'gauge-pct-ram',  pct: 41 },
    { arc: 'gauge-arc-disk', text: 'gauge-pct-disk', pct: 87 },
  ];
  METRICS.forEach(({ arc, text, pct }, i) => {
    setTimeout(() => setGauge(arc, text, pct), 600 + i * 180);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('✓ Copied to clipboard');
}

// ════════════════════════════════════════════════════════════════════════════
// SCROLL PROGRESS BAR
// ════════════════════════════════════════════════════════════════════════════
function initProgressBar() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  const update = () => {
    const scrolled = document.documentElement.scrollTop;
    const total    = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    bar.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ════════════════════════════════════════════════════════════════════════════
// MOBILE HAMBURGER
// ════════════════════════════════════════════════════════════════════════════
function initHamburger() {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('header-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const open = btn.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    nav.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-overlay', open);
  });

  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      nav.classList.remove('nav-open');
      document.body.classList.remove('nav-overlay');
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HERO TERMINAL
// ════════════════════════════════════════════════════════════════════════════
let termIdx = 0, termTimer = null;

function typeCmd(cmdEl, cmd, cb) {
  cmdEl.textContent = '';
  let i = 0;
  const t = setInterval(() => {
    cmdEl.textContent += cmd[i++];
    if (i >= cmd.length) { clearInterval(t); setTimeout(cb, 300); }
  }, 28);
}

function appendLine(container, cls, text, cb) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  div.style.opacity = '0';
  container.appendChild(div);
  requestAnimationFrame(() => {
    div.style.transition = 'opacity 0.2s';
    div.style.opacity = '1';
  });
  setTimeout(cb, 220);
}

function runTerminalSequence() {
  const seq   = TERMINAL_SEQUENCES[termIdx % TERMINAL_SEQUENCES.length];
  const cmdEl = document.getElementById('term-cmd');
  const linesEl = document.getElementById('term-lines');
  if (!cmdEl || !linesEl) return;

  linesEl.innerHTML = '';
  let lineIdx = 0;

  typeCmd(cmdEl, seq.cmd, () => {
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cmdEl.appendChild(cursor);

    function nextLine() {
      if (lineIdx >= seq.lines.length) {
        termIdx++;
        termTimer = setTimeout(() => { cursor.remove(); runTerminalSequence(); }, 3200);
        return;
      }
      const l = seq.lines[lineIdx++];
      appendLine(linesEl, l.cls, l.text, nextLine);
    }
    setTimeout(nextLine, 300);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SCRIPT EXPLORER
// ════════════════════════════════════════════════════════════════════════════
let activeScriptIdx  = 0;
let filteredScripts  = [];

function renderScript(idx) {
  const s = filteredScripts[idx];
  if (!s) return;
  activeScriptIdx = idx;

  document.getElementById('panel-dir').textContent  = s.dir;
  document.getElementById('panel-name').textContent = s.file;
  document.getElementById('panel-desc').textContent = s.desc;

  const tagsEl = document.getElementById('panel-tags');
  tagsEl.innerHTML = s.tags.map(t => `<span class="script-tag">${t}</span>`).join('');

  const codeEl = document.getElementById('script-code');
  codeEl.textContent = s.code;
  if (window.hljs) hljs.highlightElement(codeEl);

  const lineCount = s.code.split('\n').length;
  document.getElementById('line-numbers').innerHTML =
    Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join('');

  document.querySelectorAll('.script-nav-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
    btn.setAttribute('aria-selected', i === idx);
  });
}

function buildScriptNav(scripts) {
  const nav = document.getElementById('script-nav-list');
  if (!nav) return;
  nav.innerHTML = '';
  filteredScripts = scripts;

  scripts.forEach((s, idx) => {
    const li  = document.createElement('li');
    li.innerHTML = `
      <button class="script-nav-btn" role="tab" aria-selected="${idx === 0}" data-idx="${idx}">
        <span class="nav-num">${String(idx + 1).padStart(2, '0')}</span>
        <span class="nav-label">${s.dir}${s.file}</span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => renderScript(idx));
    nav.appendChild(li);
  });

  if (scripts.length > 0) renderScript(0);
}

// ════════════════════════════════════════════════════════════════════════════
// SCRIPT SEARCH
// ════════════════════════════════════════════════════════════════════════════
function initScriptSearch() {
  const input = document.getElementById('script-search');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const matched = q
      ? SCRIPTS.filter(s =>
          s.file.toLowerCase().includes(q) ||
          s.desc.toLowerCase().includes(q) ||
          s.tags.some(t => t.toLowerCase().includes(q))
        )
      : SCRIPTS;
    buildScriptNav(matched.length ? matched : SCRIPTS);
  });

  // ⌘K / Ctrl+K focus
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// KEYBOARD NAVIGATION (↑ ↓ ↵ in script list)
// ════════════════════════════════════════════════════════════════════════════
function initScriptKeyNav() {
  const nav = document.getElementById('script-nav-list');
  if (!nav) return;

  nav.addEventListener('keydown', e => {
    const btns = [...nav.querySelectorAll('.script-nav-btn')];
    const cur  = btns.findIndex(b => b === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(cur + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(cur - 1 + btns.length) % btns.length]?.focus();
    } else if (e.key === 'Enter' && cur >= 0) {
      renderScript(cur);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// COPY / DOWNLOAD
// ════════════════════════════════════════════════════════════════════════════
function wireScriptActions() {
  document.getElementById('copy-btn')?.addEventListener('click', () => {
    copyText(filteredScripts[activeScriptIdx]?.code ?? '');
  });

  document.getElementById('download-btn')?.addEventListener('click', () => {
    const s = filteredScripts[activeScriptIdx];
    if (!s) return;
    const blob = new Blob([s.code], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = s.file;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`✓ Downloaded ${s.file}`);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ALERT TABS
// ════════════════════════════════════════════════════════════════════════════
function initAlertTabs() {
  const tabs = document.querySelectorAll('.a-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = tab.getAttribute('aria-controls');
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.classList.add('hidden');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.remove('hidden');
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SKILLS GRID
// ════════════════════════════════════════════════════════════════════════════
function buildSkillsGrid() {
  const grid = document.getElementById('skills-grid');
  if (!grid) return;
  grid.innerHTML = SKILLS.map((s, i) => `
    <div class="skill-card reveal" data-delay="${(i % 4) + 1}">
      <div class="skill-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="skill-label">${s.label}</div>
      <div class="skill-desc">${s.desc}</div>
      <div class="skill-bar-wrap">
        <div class="skill-bar" data-pct="${s.pct}" style="width:0"></div>
      </div>
    </div>`
  ).join('');
}

// ════════════════════════════════════════════════════════════════════════════
// SCROLL REVEAL
// ════════════════════════════════════════════════════════════════════════════
function initScrollReveal() {
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ════════════════════════════════════════════════════════════════════════════
// SKILL BAR OBSERVER
// ════════════════════════════════════════════════════════════════════════════
function initSkillBarObserver() {
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('.skill-bar').forEach(bar => {
        bar.style.width = bar.dataset.pct + '%';
      });
      obs.unobserve(e.target);
    }),
    { threshold: 0.15 }
  );
  document.querySelectorAll('#skills-grid').forEach(el => obs.observe(el));
}

// ════════════════════════════════════════════════════════════════════════════
// PIPELINE FILL
// ════════════════════════════════════════════════════════════════════════════
function initPipelineFill() {
  const fill = document.getElementById('pipe-track-fill');
  if (!fill) return;
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        setTimeout(() => { fill.style.width = '100%'; }, 200);
        obs.unobserve(e.target);
      }
    }),
    { threshold: 0.3 }
  );
  obs.observe(fill.parentElement);
}

// ════════════════════════════════════════════════════════════════════════════
// ANIMATED COUNTERS
// ════════════════════════════════════════════════════════════════════════════
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    let current  = 0;
    const step   = Math.ceil(target / 24);
    const t = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(t);
    }, 40);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIVE NAV HIGHLIGHT on scroll
// ════════════════════════════════════════════════════════════════════════════
function initNavHighlight() {
  const sections = document.querySelectorAll('section[id], #stats-bar');
  const links    = document.querySelectorAll('.nav-link');
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    }),
    { rootMargin: '-40% 0px -55% 0px' }
  );
  sections.forEach(s => obs.observe(s));
}

// ════════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initProgressBar();
  initHamburger();
  animateHeroGauges();
  runTerminalSequence();
  buildScriptNav(SCRIPTS);
  initScriptSearch();
  initScriptKeyNav();
  wireScriptActions();
  initAlertTabs();
  buildSkillsGrid();
  initScrollReveal();
  initSkillBarObserver();
  initPipelineFill();
  animateCounters();
  initNavHighlight();
});
