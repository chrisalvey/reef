import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, where,
  doc, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, enabledParams, getParamStatus, statusBadgeClass, statusLabel,
  formatDateTime, relativeTime, daysUntil, JOURNAL_ICONS, showModal, hideModal, showToast
} from './common.js';

setActiveNav('dashboard');

const paramGrid     = document.getElementById('paramGrid');
const tasksList     = document.getElementById('tasksList');
const journalList   = document.getElementById('journalList');
const alertsSection = document.getElementById('alertsSection');
const alertsList    = document.getElementById('alertsList');

document.getElementById('refreshBtn').addEventListener('click', loadAll);

async function loadAll() {
  await Promise.all([loadTankProfile(), loadParameters(), loadTasks(), loadJournal(), loadStats()]);
}

// ── Tank Profile ──────────────────────────────────────────
async function loadTankProfile() {
  const snap = await getDoc(doc(db, 'reef_settings', 'tank_profile'));
  if (!snap.exists()) return;
  applyTankProfile(snap.data());
}

function applyTankProfile(t) {
  if (t.label) {
    document.getElementById('tankName').textContent     = t.label;
    document.getElementById('tankSubtitle').textContent = t.model || 'Live overview of your reef tank';
  }
  const bar = document.getElementById('tankInfoBar');
  bar.style.display = 'flex';
  bar.classList.remove('hidden');
  document.getElementById('infoModel').textContent      = [t.model, t.style].filter(Boolean).join(' · ') || '—';
  document.getElementById('infoTotal').textContent      = t.volTotal   ? `${t.volTotal} gal`   : '—';
  document.getElementById('infoDisplay').textContent    = t.volDisplay ? `${t.volDisplay} gal`  : '—';
  document.getElementById('infoChamber').textContent    = t.volChamber ? `${t.volChamber} gal`  : '—';
  document.getElementById('infoDimensions').textContent = (t.width && t.height && t.depth)
    ? `${t.width}" × ${t.height}" × ${t.depth}"`  : '—';
  document.getElementById('infoGlass').textContent      = t.glass || '—';

  // Store display volume globally so calculators page can read it
  if (t.volDisplay) localStorage.setItem('reef_vol_display', t.volDisplay);
  if (t.volTotal)   localStorage.setItem('reef_vol_total',   t.volTotal);
}

// ── Tank Profile Modal ────────────────────────────────────
document.getElementById('tankSettingsBtn').addEventListener('click', async () => {
  const snap = await getDoc(doc(db, 'reef_settings', 'tank_profile'));
  const t = snap.exists() ? snap.data() : {};
  document.getElementById('tpLabel').value      = t.label      || '';
  document.getElementById('tpModel').value      = t.model      || '';
  document.getElementById('tpStyle').value      = t.style      || '';
  document.getElementById('tpGlass').value      = t.glass      || '';
  document.getElementById('tpVolTotal').value   = t.volTotal   || '';
  document.getElementById('tpVolDisplay').value = t.volDisplay || '';
  document.getElementById('tpVolChamber').value = t.volChamber || '';
  document.getElementById('tpWidth').value      = t.width      || '';
  document.getElementById('tpHeight').value     = t.height     || '';
  document.getElementById('tpDepth').value      = t.depth      || '';
  showModal('tankModal');
});

document.getElementById('saveTankProfile').addEventListener('click', async () => {
  const data = {
    label:      document.getElementById('tpLabel').value.trim(),
    model:      document.getElementById('tpModel').value.trim(),
    style:      document.getElementById('tpStyle').value.trim(),
    glass:      document.getElementById('tpGlass').value.trim(),
    volTotal:   parseFloat(document.getElementById('tpVolTotal').value)   || null,
    volDisplay: parseFloat(document.getElementById('tpVolDisplay').value) || null,
    volChamber: parseFloat(document.getElementById('tpVolChamber').value) || null,
    width:      parseFloat(document.getElementById('tpWidth').value)      || null,
    height:     parseFloat(document.getElementById('tpHeight').value)     || null,
    depth:      parseFloat(document.getElementById('tpDepth').value)      || null,
  };
  await setDoc(doc(db, 'reef_settings', 'tank_profile'), data);
  applyTankProfile(data);
  hideModal('tankModal');
  showToast('Tank profile saved!');
});

document.getElementById('closeTankModal').addEventListener('click',  () => hideModal('tankModal'));
document.getElementById('cancelTankModal').addEventListener('click', () => hideModal('tankModal'));

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
    return `
      <div class="stat-card ${status}" onclick="location.href='parameters.html'" style="cursor:pointer;">
        <div class="stat-label">${p.name}</div>
        <div style="display:flex;align-items:flex-end;gap:.4rem;margin:.25rem 0;">
          <div class="stat-value">${displayVal}</div>
          <div class="stat-unit">${p.unit}</div>
        </div>
        <div class="stat-status">
          <span class="status-dot ${status}"></span>
          <span style="color:var(--text-secondary);font-size:.78rem;">${statusLabel(status)}</span>
        </div>
        <div class="param-range" style="margin-top:4px;">Range: ${p.min}–${p.max} ${p.unit}</div>
      </div>`;
  }).join('');

  if (newestTs) {
    document.getElementById('paramLastUpdated').textContent =
      'Updated ' + relativeTime({ seconds: newestTs, toDate: () => new Date(newestTs * 1000) });
  }

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
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);

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
    const days    = Math.round((t.dueDate - today) / 86400000);
    const overdue = days < 0;
    const dueLabel = overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `In ${days}d`;
    const color    = overdue ? 'var(--coral)' : days === 0 ? 'var(--yellow)' : 'var(--text-muted)';
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
    const d    = doc.data();
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

// ── Stats ─────────────────────────────────────────────────
async function loadStats() {
  const allLivestock = await getDocs(collection(db, 'reef_livestock'));
  const equip        = await getDocs(collection(db, 'reef_equipment'));
  const counts       = { fish: 0, coral: 0, invert: 0 };
  allLivestock.forEach(d => {
    const t = d.data().type;
    if (counts[t] !== undefined) counts[t]++;
  });
  document.getElementById('statFish').textContent      = counts.fish;
  document.getElementById('statCorals').textContent    = counts.coral;
  document.getElementById('statInverts').textContent   = counts.invert;
  document.getElementById('statEquipment').textContent = equip.size;
}

loadAll();
