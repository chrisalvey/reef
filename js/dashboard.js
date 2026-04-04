import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, where
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, enabledParams, getParamStatus, statusBadgeClass, statusLabel,
  formatDateTime, relativeTime, daysUntil, JOURNAL_ICONS
} from './common.js';

setActiveNav('dashboard');

const paramGrid   = document.getElementById('paramGrid');
const tasksList   = document.getElementById('tasksList');
const journalList = document.getElementById('journalList');
const alertsSection = document.getElementById('alertsSection');
const alertsList    = document.getElementById('alertsList');

document.getElementById('refreshBtn').addEventListener('click', loadAll);

async function loadAll() {
  await Promise.all([loadParameters(), loadTasks(), loadJournal(), loadStats()]);
}

// ── Parameters ────────────────────────────────────────────
async function loadParameters() {
  const params = enabledParams();
  if (!params.length) {
    paramGrid.innerHTML = '<p class="text-muted text-sm">No parameters enabled.</p>';
    return;
  }

  const latestByParam = {};
  const q = query(
    collection(db, 'reef_parameters'),
    orderBy('timestamp', 'desc'),
    limit(500)
  );
  const snap = await getDocs(q);
  snap.docs.forEach(d => {
    const data = d.data();
    if (!latestByParam[data.paramKey]) latestByParam[data.paramKey] = data;
  });

  const alerts = [];
  let newestTs = null;

  paramGrid.innerHTML = params.map(p => {
    const data   = latestByParam[p.key];
    const value  = data ? data.value : null;
    const status = value !== null ? getParamStatus(value, p.min, p.max) : 'unknown';
    if (status === 'alert' && value !== null) alerts.push({ name: p.name, value, unit: p.unit, min: p.min, max: p.max });
    if (data?.timestamp && (!newestTs || data.timestamp.seconds > newestTs)) newestTs = data.timestamp.seconds;

    const displayVal = value !== null ? Number(value).toFixed(p.decimals) : '–';
    const dotClass   = status;

    return `
      <div class="stat-card ${status}" onclick="location.href='parameters.html'" style="cursor:pointer;">
        <div class="stat-label">${p.name}</div>
        <div style="display:flex;align-items:flex-end;gap:.4rem;margin:.25rem 0;">
          <div class="stat-value">${displayVal}</div>
          <div class="stat-unit">${p.unit}</div>
        </div>
        <div class="stat-status">
          <span class="status-dot ${dotClass}"></span>
          <span style="color:var(--text-secondary);font-size:.78rem;">${statusLabel(status)}</span>
        </div>
        <div class="param-range" style="margin-top:4px;">Range: ${p.min}–${p.max} ${p.unit}</div>
      </div>`;
  }).join('');

  if (newestTs) {
    document.getElementById('paramLastUpdated').textContent =
      'Updated ' + relativeTime({ seconds: newestTs, toDate: () => new Date(newestTs * 1000) });
  }

  // Alerts
  if (alerts.length) {
    alertsSection.classList.remove('hidden');
    alertsList.innerHTML = alerts.map(a => `
      <div class="alert alert-danger">
        ⚠️ <strong>${a.name}</strong> is out of range: ${a.value} ${a.unit}
        (safe: ${a.min}–${a.max} ${a.unit})
      </div>`).join('');
  } else {
    alertsSection.classList.add('hidden');
  }
}

// ── Tasks ─────────────────────────────────────────────────
async function loadTasks() {
  const q    = query(collection(db, 'reef_tasks'), orderBy('nextDue'));
  const snap = await getDocs(q);
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const weekEnd  = new Date(today); weekEnd.setDate(today.getDate() + 7);

  const tasks = [];
  snap.forEach(doc => {
    const d = doc.data();
    const due = d.nextDue ? new Date(d.nextDue + 'T00:00:00') : null;
    if (due && due <= weekEnd) tasks.push({ id: doc.id, ...d, dueDate: due });
  });

  if (!tasks.length) {
    tasksList.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon" style="font-size:1.5rem;">✅</div><p>No tasks due in the next 7 days.</p></div>';
    return;
  }

  tasksList.innerHTML = tasks.map(t => {
    const days = Math.round((t.dueDate - today) / 86400000);
    const overdue = days < 0;
    const dueLabel = overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `In ${days}d`;
    const color = overdue ? 'var(--coral)' : days === 0 ? 'var(--yellow)' : 'var(--text-muted)';
    return `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--ocean-border);">
        <div class="status-dot ${overdue ? 'alert' : days === 0 ? 'warn' : 'ok'}"></div>
        <div style="flex:1;">
          <div style="font-size:.9rem;font-weight:500;">${t.name}</div>
          <div style="font-size:.78rem;color:${color};">${dueLabel}</div>
        </div>
        <a href="schedule.html" class="btn btn-ghost btn-sm">→</a>
      </div>`;
  }).join('');
}

// ── Journal ───────────────────────────────────────────────
async function loadJournal() {
  const q    = query(collection(db, 'reef_journal'), orderBy('timestamp', 'desc'), limit(5));
  const snap = await getDocs(q);

  if (snap.empty) {
    journalList.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon" style="font-size:1.5rem;">📔</div><p>No journal entries yet.</p></div>';
    return;
  }

  journalList.innerHTML = snap.docs.map(doc => {
    const d = doc.data();
    const icon = JOURNAL_ICONS[d.type] || '📝';
    return `
      <div style="display:flex;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--ocean-border);">
        <div style="font-size:1.25rem;flex-shrink:0;">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.9rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.title || d.type}</div>
          <div style="font-size:.78rem;color:var(--text-muted);">${relativeTime(d.timestamp)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Stats (livestock/equipment counts) ───────────────────
async function loadStats() {
  const [fishSnap, coralSnap, invertSnap, equipSnap] = await Promise.all([
    getDocs(query(collection(db, 'reef_livestock'), where('type', '==', 'fish'))),
    getDocs(query(collection(db, 'reef_livestock'), where('type', '==', 'coral'))),
    getDocs(query(collection(db, 'reef_livestock'), where('type', '==', 'invert'))),
    getDocs(collection(db, 'reef_equipment')),
  ]);
  document.getElementById('statFish').textContent      = fishSnap.size;
  document.getElementById('statCorals').textContent    = coralSnap.size;
  document.getElementById('statInverts').textContent   = invertSnap.size;
  document.getElementById('statEquipment').textContent = equipSnap.size;
}

loadAll();
