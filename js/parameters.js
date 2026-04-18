import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, addDoc, deleteDoc,
  doc, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, enabledParams, loadParamSettings, saveParamSettings,
  DEFAULT_PARAMETERS, getParamStatus, statusBadgeClass, statusLabel,
  formatDateTime, nowDatetimeLocal, showModal, hideModal, showToast, downloadCsv
} from './common.js';

setActiveNav('parameters');

let params       = enabledParams();
let activeKey    = params[0]?.key ?? 'alkalinity';
let chart        = null;
let allReadings  = [];

const paramTabs       = document.getElementById('paramTabs');
const logParamSelect  = document.getElementById('logParamSelect');
const historyRange    = document.getElementById('historyRange');

// ── Build tabs ────────────────────────────────────────────
function buildTabs() {
  params = enabledParams();
  paramTabs.innerHTML = params.map(p =>
    `<button class="tab ${p.key === activeKey ? 'active' : ''}" data-key="${p.key}">${p.name}</button>`
  ).join('');
  buildLogSelect();
}

paramTabs.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  activeKey = tab.dataset.key;
  document.querySelectorAll('#paramTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.key === activeKey));
  buildLogSelect();
  loadParamData();
});

function buildLogSelect() {
  logParamSelect.innerHTML = enabledParams().map(p =>
    `<option value="${p.key}" ${p.key === activeKey ? 'selected' : ''}>${p.name} (${p.unit})</option>`
  ).join('');
}

// ── Load parameter data ───────────────────────────────────
async function loadParamData() {
  const count = parseInt(historyRange.value) || 30;
  const p = enabledParams().find(x => x.key === activeKey);
  if (!p) return;

  // Update current value card
  document.getElementById('currentParamName').textContent = p.name;
  document.getElementById('currentParamRange').textContent = `Safe range: ${p.min}–${p.max} ${p.unit}`;
  document.getElementById('currentUnit').textContent = p.unit;

  const q = query(
    collection(db, 'reef_parameters'),
    orderBy('timestamp', 'desc'),
    limit(500)
  );
  const snap = await getDocs(q);
  allReadings = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.paramKey === activeKey)
    .slice(0, count);

  if (allReadings.length) {
    const latest = allReadings[0];
    const status = getParamStatus(latest.value, p.min, p.max);
    document.getElementById('currentValue').textContent   = Number(latest.value).toFixed(p.decimals);
    document.getElementById('currentTimestamp').textContent = formatDateTime(latest.timestamp);
    const badge = document.getElementById('currentParamBadge');
    badge.textContent  = statusLabel(status);
    badge.className    = 'badge ' + statusBadgeClass(status);
    document.getElementById('currentValueCard').className = `card ${status}`;
  } else {
    document.getElementById('currentValue').textContent     = '–';
    document.getElementById('currentTimestamp').textContent = 'No readings yet';
    document.getElementById('currentParamBadge').textContent = 'No Data';
    document.getElementById('currentParamBadge').className   = 'badge badge-neutral';
  }

  renderChart(allReadings.slice().reverse(), p);
  renderTable(allReadings, p);
}

// ── Chart ─────────────────────────────────────────────────
function renderChart(readings, p) {
  const ctx = document.getElementById('paramChart').getContext('2d');
  if (chart) chart.destroy();

  const labels = readings.map(r => {
    const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const values = readings.map(r => r.value);

  const colors = readings.map(r => {
    const s = getParamStatus(r.value, p.min, p.max);
    return s === 'ok' ? 'rgba(6,214,160,.8)' : s === 'warn' ? 'rgba(255,209,102,.8)' : 'rgba(255,107,107,.8)';
  });

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${p.name} (${p.unit})`,
        data: values,
        borderColor: 'var(--teal)',
        backgroundColor: 'rgba(0,180,216,0.08)',
        borderWidth: 2,
        pointBackgroundColor: colors,
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0a1628',
          borderColor: '#1a3a5c',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(26,58,92,.5)' },
          ticks: { color: '#64748b', maxTicksLimit: 10 }
        },
        y: {
          grid: { color: 'rgba(26,58,92,.5)' },
          ticks: { color: '#64748b' },
          suggestedMin: p.min - (p.max - p.min) * 0.2,
          suggestedMax: p.max + (p.max - p.min) * 0.2,
        }
      },
      annotation: {
        annotations: {
          minLine: { type: 'line', yMin: p.min, yMax: p.min, borderColor: 'rgba(255,107,107,.4)', borderDash: [5,5] },
          maxLine: { type: 'line', yMin: p.max, yMax: p.max, borderColor: 'rgba(255,107,107,.4)', borderDash: [5,5] },
        }
      }
    }
  });
}

// ── Table ─────────────────────────────────────────────────
function renderTable(readings, p) {
  const tbody = document.getElementById('historyTableBody');
  if (!readings.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state" style="padding:1.5rem;"><p>No readings yet.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = readings.map(r => {
    const status = getParamStatus(r.value, p.min, p.max);
    return `
      <tr>
        <td>${formatDateTime(r.timestamp)}</td>
        <td><strong>${Number(r.value).toFixed(p.decimals)}</strong> ${p.unit}</td>
        <td><span class="badge ${statusBadgeClass(status)}">${statusLabel(status)}</span></td>
        <td class="text-muted text-sm">${r.notes || '—'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="deleteReading('${r.id}')" title="Delete">✕</button>
        </td>
      </tr>`;
  }).join('');
}

window.deleteReading = async function(id) {
  if (!confirm('Delete this reading?')) return;
  await deleteDoc(doc(db, 'reef_parameters', id));
  showToast('Reading deleted.');
  loadParamData();
};

// ── Save reading ──────────────────────────────────────────
document.getElementById('saveReadingBtn').addEventListener('click', async () => {
  const key   = logParamSelect.value;
  const value = parseFloat(document.getElementById('logValue').value);
  const dateStr = document.getElementById('logDate').value;
  if (!key || isNaN(value) || !dateStr) return showToast('Fill in all required fields.', 'error');

  const ts    = Timestamp.fromDate(new Date(dateStr));
  const p     = enabledParams().find(x => x.key === key);
  await addDoc(collection(db, 'reef_parameters'), {
    paramKey:  key,
    paramName: p?.name ?? key,
    value,
    unit:      p?.unit ?? '',
    notes:     document.getElementById('logNotes').value.trim(),
    timestamp: ts,
  });
  showToast('Reading saved!');
  document.getElementById('logValue').value = '';
  document.getElementById('logNotes').value = '';
  document.getElementById('logDate').value  = nowDatetimeLocal();
  if (activeKey === key) loadParamData();
});

// ── CSV Export ────────────────────────────────────────────
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const p = enabledParams().find(x => x.key === activeKey);
  const rows = [['Date', 'Value', p?.unit ?? '', 'Notes']];
  allReadings.forEach(r => {
    const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
    rows.push([d.toISOString(), r.value, p?.unit ?? '', r.notes ?? '']);
  });
  downloadCsv(rows, `${activeKey}_history.csv`);
});

// ── Manage Parameters Modal ───────────────────────────────
document.getElementById('manageParamsBtn').addEventListener('click', () => {
  buildManageModal();
  showModal('manageModal');
});
document.getElementById('closeManageModal').addEventListener('click', () => hideModal('manageModal'));

function buildManageModal() {
  const settings = loadParamSettings();
  const list = document.getElementById('paramSettingsList');
  list.innerHTML = settings.map((p, i) => `
    <div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:.5rem;align-items:center;">
      <input type="checkbox" id="pe_${i}" ${p.enabled !== false ? 'checked' : ''}>
      <label for="pe_${i}" style="font-weight:500;font-size:.9rem;">${p.name} <span class="text-muted text-xs">(${p.unit})</span></label>
      <input type="number" class="form-control" style="width:80px;" id="pmin_${i}" value="${p.min}" step="any" placeholder="Min">
      <input type="number" class="form-control" style="width:80px;" id="pmax_${i}" value="${p.max}" step="any" placeholder="Max">
      ${p.custom ? `<button class="btn btn-danger btn-sm" onclick="removeCustomParam(${i})">✕</button>` : '<span></span>'}
    </div>`).join('');
}

document.getElementById('saveManageModal').addEventListener('click', () => {
  const settings = loadParamSettings();
  settings.forEach((p, i) => {
    p.enabled = document.getElementById(`pe_${i}`)?.checked ?? true;
    p.min     = parseFloat(document.getElementById(`pmin_${i}`)?.value) ?? p.min;
    p.max     = parseFloat(document.getElementById(`pmax_${i}`)?.value) ?? p.max;
  });
  saveParamSettings(settings);
  hideModal('manageModal');
  params = enabledParams();
  if (!params.find(x => x.key === activeKey)) activeKey = params[0]?.key;
  buildTabs();
  loadParamData();
  showToast('Settings saved!');
});

document.getElementById('addCustomParamBtn').addEventListener('click', () => {
  const name = document.getElementById('customParamName').value.trim();
  const unit = document.getElementById('customParamUnit').value.trim();
  const min  = parseFloat(document.getElementById('customParamMin').value);
  const max  = parseFloat(document.getElementById('customParamMax').value);
  if (!name) return showToast('Enter a parameter name.', 'error');
  const settings = loadParamSettings();
  const key = name.toLowerCase().replace(/\s+/g, '_');
  settings.push({ key, name, unit, min: isNaN(min) ? 0 : min, max: isNaN(max) ? 100 : max, decimals: 2, enabled: true, custom: true });
  saveParamSettings(settings);
  buildManageModal();
  showToast(`${name} added!`);
});

window.removeCustomParam = function(i) {
  const settings = loadParamSettings();
  settings.splice(i, 1);
  saveParamSettings(settings);
  buildManageModal();
};

// ── History range change ──────────────────────────────────
historyRange.addEventListener('change', loadParamData);

// ── Log reading button scrolls to form ───────────────────
document.getElementById('logReadingBtn').addEventListener('click', () => {
  document.getElementById('logForm').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('logValue').focus();
});

// ── Init ──────────────────────────────────────────────────
document.getElementById('logDate').value = nowDatetimeLocal();
buildTabs();
loadParamData();
