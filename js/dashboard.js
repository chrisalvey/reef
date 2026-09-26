import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, where,
  doc, getDoc, setDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, enabledParams, loadParamSettings, getParamStatus, statusBadgeClass, statusLabel,
  formatDateTime, relativeTime, daysUntil, JOURNAL_ICONS, showModal, hideModal, showToast,
  downloadJson, tsToIso
} from './common.js';

setActiveNav('dashboard');

const paramGrid     = document.getElementById('paramGrid');
const tasksList     = document.getElementById('tasksList');
const journalList   = document.getElementById('journalList');
const alertsSection = document.getElementById('alertsSection');
const alertsList    = document.getElementById('alertsList');

document.getElementById('refreshBtn').addEventListener('click', loadAll);
document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
document.getElementById('nutrientRange').addEventListener('change', loadNutrientChart);

async function loadAll() {
  await Promise.all([loadTankProfile(), loadParameters(), loadNutrientChart(), loadTasks(), loadJournal(), loadStats()]);
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
    ? `${t.width}" × ${t.height}" × ${t.depth}"` : '—';
  document.getElementById('infoGlass').textContent      = t.glass || '—';

  // Store total volume for calculators page
  if (t.volTotal)   localStorage.setItem('reef_vol_total',   t.volTotal);
  if (t.volDisplay) localStorage.setItem('reef_vol_display', t.volDisplay);

  // Render chamber layout card
  const chambers = [t.ch1, t.ch2, t.ch3].filter(Boolean);
  const chamberCard = document.getElementById('chamberCard');
  if (chambers.length) {
    chamberCard.classList.remove('hidden');
    document.getElementById('chamberDisplay').innerHTML = chambers.map((ch, i) => `
      <div style="background:var(--ocean-mid);border:1px solid var(--ocean-border);border-radius:var(--radius-md);padding:1rem;">
        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--teal);margin-bottom:.5rem;">
          Ch${i + 1} · ${ch.name || ''}  ${ch.width ? `<span style="color:var(--text-muted)">${ch.width}"</span>` : ''}
        </div>
        ${ch.contents ? `<div class="text-sm" style="margin-bottom:.4rem;">${ch.contents}</div>` : ''}
        ${ch.flow     ? `<div class="text-xs text-muted">${ch.flow}</div>` : ''}
      </div>`).join('');
  } else {
    chamberCard.classList.add('hidden');
  }
}

// ── Tank Profile Modal ────────────────────────────────────
function populateTankModal(t) {
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
  // Chambers
  [1, 2, 3].forEach(n => {
    const ch = t[`ch${n}`] || {};
    document.getElementById(`ch${n}Name`).value     = ch.name     || '';
    document.getElementById(`ch${n}Width`).value    = ch.width    || '';
    document.getElementById(`ch${n}Contents`).value = ch.contents || '';
    document.getElementById(`ch${n}Flow`).value     = ch.flow     || '';
  });
}

document.getElementById('tankSettingsBtn').addEventListener('click', async () => {
  const snap = await getDoc(doc(db, 'reef_settings', 'tank_profile'));
  populateTankModal(snap.exists() ? snap.data() : {});
  showModal('tankModal');
});

document.getElementById('editChambersBtn').addEventListener('click', async () => {
  const snap = await getDoc(doc(db, 'reef_settings', 'tank_profile'));
  populateTankModal(snap.exists() ? snap.data() : {});
  showModal('tankModal');
  // Scroll to chamber section
  setTimeout(() => document.getElementById('chambersForm').scrollIntoView({ behavior: 'smooth' }), 100);
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
    ch1: { name: document.getElementById('ch1Name').value.trim(), width: document.getElementById('ch1Width').value, contents: document.getElementById('ch1Contents').value.trim(), flow: document.getElementById('ch1Flow').value.trim() },
    ch2: { name: document.getElementById('ch2Name').value.trim(), width: document.getElementById('ch2Width').value, contents: document.getElementById('ch2Contents').value.trim(), flow: document.getElementById('ch2Flow').value.trim() },
    ch3: { name: document.getElementById('ch3Name').value.trim(), width: document.getElementById('ch3Width').value, contents: document.getElementById('ch3Contents').value.trim(), flow: document.getElementById('ch3Flow').value.trim() },
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

// ── Nutrient chart (nitrate + phosphate + water changes) ──
let nutrientChart = null;

const toDate = ts => ts?.toDate ? ts.toDate() : new Date(ts);

// Draws a faint vertical guide through each water-change marker
const waterChangeLines = {
  id: 'waterChangeLines',
  beforeDatasetsDraw(chart) {
    const idx = chart.data.datasets.findIndex(d => d.isWaterChange);
    if (idx < 0 || !chart.isDatasetVisible(idx)) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(226,232,240,.25)';
    ctx.setLineDash([4, 4]);
    chart.getDatasetMeta(idx).data.forEach(pt => {
      ctx.beginPath();
      ctx.moveTo(pt.x, chartArea.top);
      ctx.lineTo(pt.x, chartArea.bottom);
      ctx.stroke();
    });
    ctx.restore();
  }
};

async function loadNutrientChart() {
  const days   = parseInt(document.getElementById('nutrientRange').value) || 0;
  const cutoff = days ? Timestamp.fromDate(new Date(Date.now() - days * 86400000)) : null;
  const since  = coll => cutoff
    ? query(collection(db, coll), where('timestamp', '>=', cutoff), orderBy('timestamp'))
    : query(collection(db, coll), orderBy('timestamp'));

  const [paramSnap, journalSnap] = await Promise.all([
    getDocs(since('reef_parameters')),
    getDocs(since('reef_journal')),
  ]);

  const settings = loadParamSettings();
  const nitrate   = settings.find(p => p.key === 'nitrate')   ?? { name: 'Nitrate',   unit: 'ppm', decimals: 2 };
  const phosphate = settings.find(p => p.key === 'phosphate') ?? { name: 'Phosphate', unit: 'ppm', decimals: 3 };

  const readings = paramSnap.docs.map(d => d.data());
  const series = key => readings
    .filter(r => r.paramKey === key)
    .map(r => ({ x: toDate(r.timestamp), y: Number(r.value) }));

  const waterChanges = journalSnap.docs
    .map(d => d.data())
    .filter(e => e.type === 'water_change')
    .map(e => ({ x: toDate(e.timestamp), y: 0.04, title: e.title, gallons: e.volumeGallons }));

  const lineStyle = color => ({
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0,
  });

  if (nutrientChart) nutrientChart.destroy();
  nutrientChart = new Chart(document.getElementById('nutrientChart'), {
    type: 'line',
    data: {
      datasets: [
        { label: `${nitrate.name} (${nitrate.unit})`,     data: series('nitrate'),   yAxisID: 'yNitrate',   ...lineStyle('#ff6b6b') },
        { label: `${phosphate.name} (${phosphate.unit})`, data: series('phosphate'), yAxisID: 'yPhosphate', ...lineStyle('#06d6a0') },
        {
          label: 'Water change',
          isWaterChange: true,
          type: 'scatter',
          data: waterChanges,
          yAxisID: 'yMarker',
          pointStyle: 'rectRot',
          pointRadius: 6,
          pointHoverRadius: 8,
          backgroundColor: '#e2e8f0',
          borderColor: '#0d2137',
          borderWidth: 1,
          clip: false,
        },
      ]
    },
    plugins: [waterChangeLines],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', usePointStyle: true, boxHeight: 8 } },
        tooltip: {
          backgroundColor: '#0a1628',
          borderColor: '#1a3a5c',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: {
            label: item => {
              const raw = item.raw;
              if (item.dataset.isWaterChange) {
                return `💧 ${raw.title || 'Water change'}${raw.gallons ? ` (${raw.gallons} gal)` : ''}`;
              }
              const p = item.dataset.yAxisID === 'yNitrate' ? nitrate : phosphate;
              return `${p.name}: ${raw.y.toFixed(p.decimals)} ${p.unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'MMM d, yyyy h:mm a',
            displayFormats: { hour: 'MMM d h:mm a', day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' }
          },
          grid: { color: 'rgba(26,58,92,.5)' },
          ticks: { color: '#64748b', maxTicksLimit: 10 }
        },
        yNitrate: {
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: `${nitrate.name} (${nitrate.unit})`, color: '#ff6b6b' },
          grid: { color: 'rgba(26,58,92,.5)' },
          ticks: { color: '#ff6b6b' },
        },
        yPhosphate: {
          position: 'right',
          beginAtZero: true,
          title: { display: true, text: `${phosphate.name} (${phosphate.unit})`, color: '#06d6a0' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#06d6a0' },
        },
        // Hidden 0–1 axis so water-change markers sit along the bottom edge
        yMarker: { display: false, min: 0, max: 1 },
      }
    }
  });
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
    const l = d.data();
    if ((l.status || 'alive') !== 'alive') return;
    if (counts[l.type] !== undefined) counts[l.type]++;
  });
  document.getElementById('statFish').textContent      = counts.fish;
  document.getElementById('statCorals').textContent    = counts.coral;
  document.getElementById('statInverts').textContent   = counts.invert;
  document.getElementById('statEquipment').textContent = equip.size;
}

// ── JSON export (parameter + journal history, for AI use) ─
async function exportJson() {
  const btn = document.getElementById('exportJsonBtn');
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const [paramSnap, journalSnap, doseLogSnap, supplementSnap, livestockSnap] = await Promise.all([
      getDocs(query(collection(db, 'reef_parameters'), orderBy('timestamp', 'asc'))),
      getDocs(query(collection(db, 'reef_journal'),    orderBy('timestamp', 'asc'))),
      getDocs(query(collection(db, 'reef_dose_log'),   orderBy('timestamp', 'asc'))),
      getDocs(collection(db, 'reef_supplements')),
      getDocs(collection(db, 'reef_livestock')),
    ]);

    const parameterReadings = paramSnap.docs.map(d => {
      const r = d.data();
      return {
        paramKey:  r.paramKey,
        paramName: r.paramName,
        value:     r.value,
        unit:      r.unit,
        notes:     r.notes || '',
        timestamp: tsToIso(r.timestamp),
      };
    });

    const journalEntries = journalSnap.docs.map(d => {
      const e = d.data();
      return {
        type:            e.type,
        title:           e.title,
        volumeGallons:   e.volumeGallons ?? null,
        maintenanceType: e.maintenanceType ?? null,
        foodType:        e.foodType ?? null,
        foodAmount:      e.foodAmount ?? null,
        livestockId:     e.livestockId ?? null,
        livestockName:   e.livestockName ?? null,
        notes:     e.notes || '',
        timestamp: tsToIso(e.timestamp),
      };
    });

    const doseEvents = doseLogSnap.docs.map(d => {
      const e = d.data();
      return {
        supplementId:   e.supplementId,
        supplementName: e.supplementName,
        amount:    e.amount,
        unit:      e.unit,
        notes:     e.notes || '',
        timestamp: tsToIso(e.timestamp),
      };
    });

    const supplementDefinitions = supplementSnap.docs.map(d => {
      const s = d.data();
      return {
        id: d.id, name: s.name, type: s.type, amount: s.amount, unit: s.unit,
        frequency: s.frequency, active: s.active !== false, notes: s.notes || '',
      };
    });

    const livestock = livestockSnap.docs.map(d => {
      const l = d.data();
      return {
        id: d.id, name: l.name, type: l.type, species: l.species || '',
        dateAdded: l.dateAdded || null, source: l.source || '', cost: l.cost ?? null,
        location: l.location || '', lightTier: l.lightTier || 'na',
        health: l.health || null, status: l.status || 'alive', removedDate: l.removedDate || null,
        notes: l.notes || '',
      };
    });

    const parameterDefinitions = loadParamSettings().map(p => ({
      key: p.key, name: p.name, unit: p.unit, min: p.min, max: p.max, enabled: p.enabled !== false,
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      parameterDefinitions,
      parameterReadings,
      journalEntries,
      supplementDefinitions,
      doseEvents,
      livestock,
    };

    downloadJson(exportData, `reef_export_${new Date().toISOString().slice(0, 10)}.json`);
    showToast('Export ready!');
  } catch (err) {
    console.error(err);
    showToast('Export failed. See console for details.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '↓ Export JSON';
  }
}

loadAll();
