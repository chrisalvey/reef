import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc,
  doc, where, Timestamp, limit
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, nowDatetimeLocal, formatDateTime, formatDate,
  showModal, hideModal, showToast, downloadCsv
} from './common.js';

setActiveNav('dosing');

let supplements = [];
let doseLogs    = [];
let editingSuppId = null;

const SUPP_TYPE_LABELS = {
  two_part_a:    'Two-Part A (Alk)',
  two_part_b:    'Two-Part B (Ca/Mg)',
  kalkwasser:    'Kalkwasser',
  trace_elements:'Trace Elements',
  bacteria:      'Bacteria / Probiotic',
  carbon:        'Carbon Source',
  other:         'Other',
};

// ── Load all ──────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadSupplements(), loadDoseLogs()]);
}

async function loadSupplements() {
  const q    = query(collection(db, 'reef_supplements'), orderBy('name'));
  const snap = await getDocs(q);
  supplements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSupplements();
  buildDoseSupplementSelect();
  buildDoseLogFilter();
}

async function loadDoseLogs() {
  const q    = query(collection(db, 'reef_dose_log'), orderBy('timestamp', 'desc'), limit(100));
  const snap = await getDocs(q);
  doseLogs   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderDoseLog();
}

// ── Render supplements ────────────────────────────────────
function renderSupplements() {
  const list  = document.getElementById('supplementsList');
  const empty = document.getElementById('noSupplements');

  const active = supplements.filter(s => s.active !== false);
  if (!supplements.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = supplements.map(s => {
    const lastDose = doseLogs.find(d => d.supplementId === s.id);
    const lastStr  = lastDose ? formatDate(lastDose.timestamp) : 'Never';
    const statusColor = s.active === false ? 'var(--text-muted)' : 'var(--teal-light)';
    return `
      <div class="card" style="cursor:pointer;" onclick="openEditSupp('${s.id}')">
        <div style="display:flex;align-items:center;gap:1rem;">
          <div style="font-size:1.5rem;">💊</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:.95rem;color:${statusColor};">
              ${s.name}
              ${s.active === false ? '<span class="badge badge-neutral" style="margin-left:.5rem;">Paused</span>' : ''}
            </div>
            <div class="text-xs text-muted">${SUPP_TYPE_LABELS[s.type] || s.type} · ${s.amount} ${s.unit} · ${s.frequency?.replace(/_/g, ' ') || ''}</div>
          </div>
          <div style="text-align:right;">
            <div class="text-xs text-muted">Last dosed</div>
            <div class="text-sm">${lastStr}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();quickLog('${s.id}')">Dose</button>
        </div>
        ${s.notes ? `<div class="text-xs text-muted mt-sm">${s.notes}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Quick log dose ────────────────────────────────────────
window.quickLog = function(suppId) {
  const s = supplements.find(x => x.id === suppId);
  if (!s) return;
  document.getElementById('doseSupplementSelect').value = suppId;
  document.getElementById('doseAmount').value           = s.amount || '';
  document.getElementById('doseUnit').value             = s.unit   || 'ml';
  document.getElementById('doseDateTime').value         = nowDatetimeLocal();
  document.getElementById('doseNotes').value            = '';
  showModal('doseModal');
};

// ── Save dose ─────────────────────────────────────────────
document.getElementById('saveDoseBtn').addEventListener('click', async () => {
  const suppId = document.getElementById('doseSupplementSelect').value;
  const amount = parseFloat(document.getElementById('doseAmount').value);
  const unit   = document.getElementById('doseUnit').value;
  const dateStr= document.getElementById('doseDateTime').value;
  const notes  = document.getElementById('doseNotes').value.trim();
  if (!suppId || isNaN(amount) || !dateStr) return showToast('Fill in all required fields.', 'error');

  const supp = supplements.find(x => x.id === suppId);
  await addDoc(collection(db, 'reef_dose_log'), {
    supplementId:   suppId,
    supplementName: supp?.name ?? '',
    amount,
    unit,
    notes,
    timestamp: Timestamp.fromDate(new Date(dateStr)),
  });
  showToast('Dose logged!');
  hideModal('doseModal');
  loadDoseLogs();
});

// ── Render dose log table ─────────────────────────────────
function renderDoseLog() {
  const filter = document.getElementById('doseLogFilter').value;
  const filtered = filter ? doseLogs.filter(d => d.supplementId === filter) : doseLogs;
  const tbody  = document.getElementById('doseLogBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state" style="padding:1.5rem;"><p>No doses logged yet.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(d => `
    <tr>
      <td>${formatDateTime(d.timestamp)}</td>
      <td>${d.supplementName || '—'}</td>
      <td>${d.amount} ${d.unit}</td>
      <td class="text-sm text-muted">${d.notes || '—'}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteLog('${d.id}')" title="Delete">✕</button>
      </td>
    </tr>`).join('');
}

window.deleteLog = async function(id) {
  if (!confirm('Delete this dose log entry?')) return;
  await deleteDoc(doc(db, 'reef_dose_log', id));
  showToast('Deleted.');
  loadDoseLogs();
};

// ── Build selects ─────────────────────────────────────────
function buildDoseSupplementSelect() {
  const sel = document.getElementById('doseSupplementSelect');
  sel.innerHTML = supplements.map(s =>
    `<option value="${s.id}">${s.name}</option>`
  ).join('');
}

function buildDoseLogFilter() {
  const sel = document.getElementById('doseLogFilter');
  sel.innerHTML = '<option value="">All Supplements</option>' +
    supplements.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

// ── Supplement CRUD ───────────────────────────────────────
function openAddSupp() {
  editingSuppId = null;
  document.getElementById('supplementModalTitle').textContent = 'Add Supplement';
  document.getElementById('suppName').value      = '';
  document.getElementById('suppType').value      = 'two_part_a';
  document.getElementById('suppAmount').value    = '';
  document.getElementById('suppUnit').value      = 'ml';
  document.getElementById('suppFrequency').value = 'daily';
  document.getElementById('suppActive').value    = 'true';
  document.getElementById('suppNotes').value     = '';
  document.getElementById('deleteSuppBtn').classList.add('hidden');
  showModal('supplementModal');
}

window.openEditSupp = function(id) {
  const s = supplements.find(x => x.id === id);
  if (!s) return;
  editingSuppId = id;
  document.getElementById('supplementModalTitle').textContent = 'Edit Supplement';
  document.getElementById('suppName').value      = s.name || '';
  document.getElementById('suppType').value      = s.type || 'other';
  document.getElementById('suppAmount').value    = s.amount || '';
  document.getElementById('suppUnit').value      = s.unit   || 'ml';
  document.getElementById('suppFrequency').value = s.frequency || 'daily';
  document.getElementById('suppActive').value    = s.active === false ? 'false' : 'true';
  document.getElementById('suppNotes').value     = s.notes || '';
  document.getElementById('deleteSuppBtn').classList.remove('hidden');
  showModal('supplementModal');
};

document.getElementById('saveSuppBtn').addEventListener('click', async () => {
  const name = document.getElementById('suppName').value.trim();
  if (!name) return showToast('Enter a supplement name.', 'error');
  const data = {
    name,
    type:      document.getElementById('suppType').value,
    amount:    parseFloat(document.getElementById('suppAmount').value) || 0,
    unit:      document.getElementById('suppUnit').value,
    frequency: document.getElementById('suppFrequency').value,
    active:    document.getElementById('suppActive').value === 'true',
    notes:     document.getElementById('suppNotes').value.trim(),
  };
  if (editingSuppId) {
    await updateDoc(doc(db, 'reef_supplements', editingSuppId), data);
    showToast('Updated!');
  } else {
    await addDoc(collection(db, 'reef_supplements'), data);
    showToast('Supplement added!');
  }
  hideModal('supplementModal');
  loadAll();
});

document.getElementById('deleteSuppBtn').addEventListener('click', async () => {
  if (!editingSuppId || !confirm('Remove this supplement?')) return;
  await deleteDoc(doc(db, 'reef_supplements', editingSuppId));
  showToast('Removed.');
  hideModal('supplementModal');
  loadAll();
});

// ── CSV Export ────────────────────────────────────────────
document.getElementById('exportDoseBtn').addEventListener('click', () => {
  const rows = [['Date', 'Supplement', 'Amount', 'Unit', 'Notes']];
  doseLogs.forEach(d => {
    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
    rows.push([ts.toISOString(), d.supplementName, d.amount, d.unit, d.notes || '']);
  });
  downloadCsv(rows, 'dose_log.csv');
});

// ── Modal / filter controls ───────────────────────────────
document.getElementById('addSupplementBtn').addEventListener('click', openAddSupp);
document.getElementById('addFirstSupplementBtn')?.addEventListener('click', openAddSupp);
document.getElementById('closeSupplementModal').addEventListener('click', () => hideModal('supplementModal'));
document.getElementById('cancelSuppBtn').addEventListener('click',        () => hideModal('supplementModal'));
document.getElementById('logDoseBtn').addEventListener('click', () => {
  document.getElementById('doseDateTime').value = nowDatetimeLocal();
  showModal('doseModal');
});
document.getElementById('closeDoseModal').addEventListener('click',  () => hideModal('doseModal'));
document.getElementById('cancelDoseBtn').addEventListener('click',   () => hideModal('doseModal'));
document.getElementById('doseLogFilter').addEventListener('change',  renderDoseLog);

loadAll();
