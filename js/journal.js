import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc,
  doc, Timestamp, where
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, nowDatetimeLocal, formatDateTime, JOURNAL_ICONS,
  showModal, hideModal, showToast
} from './common.js';

setActiveNav('journal');

let allEntries = [];
let editingId  = null;

const entriesList  = document.getElementById('entriesList');
const noResults    = document.getElementById('noResults');
const searchInput  = document.getElementById('searchInput');
const typeFilter   = document.getElementById('typeFilter');
const dateFilter   = document.getElementById('dateFilter');

// ── Load entries ──────────────────────────────────────────
async function loadEntries() {
  const q    = query(collection(db, 'reef_journal'), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  allEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderEntries();
}

function renderEntries() {
  const search   = searchInput.value.toLowerCase();
  const typeVal  = typeFilter.value;
  const dateVal  = dateFilter.value;

  let filtered = allEntries.filter(e => {
    const matchSearch = !search || (e.title || '').toLowerCase().includes(search) || (e.notes || '').toLowerCase().includes(search);
    const matchType   = !typeVal || e.type === typeVal;
    const matchDate   = !dateVal || (e.timestamp?.toDate
      ? e.timestamp.toDate().toISOString().startsWith(dateVal)
      : String(e.timestamp).startsWith(dateVal));
    return matchSearch && matchType && matchDate;
  });

  entriesList.classList.toggle('hidden', !filtered.length);
  noResults.classList.toggle('hidden', !!filtered.length);

  if (!filtered.length) return;

  entriesList.innerHTML = filtered.map(e => {
    const icon     = JOURNAL_ICONS[e.type] || '📝';
    const typeLabel = e.type?.replace(/_/g, ' ') ?? 'Note';
    const preview  = e.notes ? e.notes.slice(0, 120) + (e.notes.length > 120 ? '…' : '') : '';
    return `
      <div class="card" style="cursor:pointer;" onclick="editEntry('${e.id}')">
        <div style="display:flex;gap:1rem;align-items:flex-start;">
          <div style="font-size:1.75rem;flex-shrink:0;margin-top:.1rem;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:.35rem;">
              <div style="font-weight:600;font-size:1rem;">${e.title || typeLabel}</div>
              <span class="badge badge-neutral" style="text-transform:capitalize;">${typeLabel}</span>
            </div>
            <div class="text-sm text-muted mb-md">${formatDateTime(e.timestamp)}</div>
            ${preview ? `<div class="text-sm" style="color:var(--text-secondary);white-space:pre-wrap;">${preview}</div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

window.editEntry = function(id) {
  const e = allEntries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  document.getElementById('entryModalTitle').textContent = 'Edit Entry';
  document.getElementById('entryType').value  = e.type || 'observation';
  document.getElementById('entryTitle').value = e.title || '';
  const d = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById('entryDate').value  = d.toISOString().slice(0, 16);
  document.getElementById('entryNotes').value = e.notes || '';
  document.getElementById('deleteEntryBtn').classList.remove('hidden');
  showModal('entryModal');
};

// ── Filters ───────────────────────────────────────────────
searchInput.addEventListener('input', renderEntries);
typeFilter.addEventListener('change', renderEntries);
dateFilter.addEventListener('change', renderEntries);

// ── Add entry ─────────────────────────────────────────────
document.getElementById('addEntryBtn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('entryModalTitle').textContent = 'New Journal Entry';
  document.getElementById('entryType').value  = 'observation';
  document.getElementById('entryTitle').value = '';
  document.getElementById('entryDate').value  = nowDatetimeLocal();
  document.getElementById('entryNotes').value = '';
  document.getElementById('deleteEntryBtn').classList.add('hidden');
  showModal('entryModal');
});

// ── Save entry ────────────────────────────────────────────
document.getElementById('saveEntryBtn').addEventListener('click', async () => {
  const type  = document.getElementById('entryType').value;
  const title = document.getElementById('entryTitle').value.trim();
  const dateStr = document.getElementById('entryDate').value;
  const notes = document.getElementById('entryNotes').value.trim();
  if (!dateStr) return showToast('Please set a date.', 'error');

  const data = {
    type,
    title: title || type.replace(/_/g, ' '),
    notes,
    timestamp: Timestamp.fromDate(new Date(dateStr)),
  };

  if (editingId) {
    await updateDoc(doc(db, 'reef_journal', editingId), data);
    showToast('Entry updated!');
  } else {
    await addDoc(collection(db, 'reef_journal'), data);
    showToast('Entry saved!');
  }
  hideModal('entryModal');
  loadEntries();
});

// ── Delete entry ──────────────────────────────────────────
document.getElementById('deleteEntryBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Delete this journal entry?')) return;
  await deleteDoc(doc(db, 'reef_journal', editingId));
  showToast('Entry deleted.');
  hideModal('entryModal');
  loadEntries();
});

// ── Modal close ───────────────────────────────────────────
document.getElementById('closeEntryModal').addEventListener('click', () => hideModal('entryModal'));
document.getElementById('cancelEntryBtn').addEventListener('click', () => hideModal('entryModal'));

loadEntries();
