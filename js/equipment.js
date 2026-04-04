import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, todayDate, formatDate, daysUntil, addDays, EQUIP_ICONS,
  showModal, hideModal, showToast
} from './common.js';

setActiveNav('equipment');

let allEquip  = [];
let editingId = null;

// ── Load ──────────────────────────────────────────────────
async function loadEquipment() {
  const q    = query(collection(db, 'reef_equipment'), orderBy('name'));
  const snap = await getDocs(q);
  allEquip   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderEquipment();
}

function renderEquipment() {
  const typeFilter = document.getElementById('typeFilter').value;
  let filtered     = allEquip.filter(e => !typeFilter || e.type === typeFilter);

  const grid  = document.getElementById('equipGrid');
  const empty = document.getElementById('emptyState');

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(e => {
    const icon     = EQUIP_ICONS[e.type] || '⚙️';
    const typeLabel= e.type?.replace(/_/g, ' ') ?? '';
    const serviceDays  = e.lastService && e.serviceInterval
      ? daysUntil(addDays(e.lastService, parseInt(e.serviceInterval)))
      : null;
    const overdue  = serviceDays !== null && serviceDays < 0;
    const soon     = serviceDays !== null && serviceDays <= 14 && !overdue;
    const cls      = overdue ? 'service-overdue' : soon ? 'service-soon' : '';
    let serviceStr = '';
    if (serviceDays !== null) {
      if (overdue)        serviceStr = `<span class="text-coral">Service ${Math.abs(serviceDays)}d overdue</span>`;
      else if (serviceDays === 0) serviceStr = `<span class="text-yellow">Service due today</span>`;
      else if (soon)      serviceStr = `<span class="text-yellow">Service in ${serviceDays}d</span>`;
      else                serviceStr = `<span class="text-muted">Service in ${serviceDays}d</span>`;
    } else if (e.serviceInterval) {
      serviceStr = `<span class="text-muted">Never serviced</span>`;
    }
    const addedStr = e.dateAdded ? `Added ${formatDate({ toDate: () => new Date(e.dateAdded) })}` : '';
    return `
      <div class="equip-card ${cls}" onclick="openEdit('${e.id}')">
        <div style="display:flex;align-items:center;gap:.75rem;">
          <div class="equip-icon">${icon}</div>
          <div>
            <div class="equip-name">${e.name}</div>
            <div class="equip-type">${typeLabel}${e.brand ? ' · ' + e.brand : ''}</div>
          </div>
        </div>
        ${serviceStr ? `<div class="equip-service">${serviceStr}</div>` : ''}
        ${addedStr   ? `<div class="text-xs text-muted">${addedStr}</div>` : ''}
        ${e.notes    ? `<div class="text-xs text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.notes}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Open add ──────────────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('equipModalTitle').textContent = 'Add Equipment';
  document.getElementById('equipName').value           = '';
  document.getElementById('equipType').value           = 'light';
  document.getElementById('equipBrand').value          = '';
  document.getElementById('equipDateAdded').value      = todayDate();
  document.getElementById('equipWarranty').value       = '';
  document.getElementById('equipLastService').value    = '';
  document.getElementById('equipServiceInterval').value= '';
  document.getElementById('equipNotes').value          = '';
  document.getElementById('deleteBtn').classList.add('hidden');
  document.getElementById('serviceBtn').classList.add('hidden');
  showModal('equipModal');
}

window.openEdit = function(id) {
  const e = allEquip.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  document.getElementById('equipModalTitle').textContent  = 'Edit Equipment';
  document.getElementById('equipName').value              = e.name || '';
  document.getElementById('equipType').value              = e.type || 'other';
  document.getElementById('equipBrand').value             = e.brand || '';
  document.getElementById('equipDateAdded').value         = e.dateAdded || '';
  document.getElementById('equipWarranty').value          = e.warranty || '';
  document.getElementById('equipLastService').value       = e.lastService || '';
  document.getElementById('equipServiceInterval').value   = e.serviceInterval || '';
  document.getElementById('equipNotes').value             = e.notes || '';
  document.getElementById('deleteBtn').classList.remove('hidden');
  document.getElementById('serviceBtn').classList.remove('hidden');
  showModal('equipModal');
};

// ── Log Service ───────────────────────────────────────────
document.getElementById('serviceBtn').addEventListener('click', async () => {
  if (!editingId) return;
  await updateDoc(doc(db, 'reef_equipment', editingId), { lastService: todayDate() });
  const e = allEquip.find(x => x.id === editingId);
  showToast(`Service logged for ${e?.name || 'equipment'}.`);
  hideModal('equipModal');
  loadEquipment();
});

// ── Save ──────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', async () => {
  const name = document.getElementById('equipName').value.trim();
  if (!name) return showToast('Please enter equipment name.', 'error');
  const data = {
    name,
    type:            document.getElementById('equipType').value,
    brand:           document.getElementById('equipBrand').value.trim(),
    dateAdded:       document.getElementById('equipDateAdded').value,
    warranty:        document.getElementById('equipWarranty').value,
    lastService:     document.getElementById('equipLastService').value,
    serviceInterval: document.getElementById('equipServiceInterval').value,
    notes:           document.getElementById('equipNotes').value.trim(),
  };
  if (editingId) {
    await updateDoc(doc(db, 'reef_equipment', editingId), data);
    showToast('Updated!');
  } else {
    await addDoc(collection(db, 'reef_equipment'), data);
    showToast('Equipment added!');
  }
  hideModal('equipModal');
  loadEquipment();
});

// ── Delete ────────────────────────────────────────────────
document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Remove this equipment?')) return;
  await deleteDoc(doc(db, 'reef_equipment', editingId));
  showToast('Removed.');
  hideModal('equipModal');
  loadEquipment();
});

// ── Filters / controls ────────────────────────────────────
document.getElementById('typeFilter').addEventListener('change', renderEquipment);
document.getElementById('addEquipBtn').addEventListener('click', openAdd);
document.getElementById('addFirstBtn')?.addEventListener('click', openAdd);
document.getElementById('closeModal').addEventListener('click',  () => hideModal('equipModal'));
document.getElementById('cancelBtn').addEventListener('click',   () => hideModal('equipModal'));

loadEquipment();
