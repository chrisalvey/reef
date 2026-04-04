import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, todayDate, formatDate, LIVESTOCK_ICONS, HEALTH_COLORS,
  showModal, hideModal, showToast
} from './common.js';

setActiveNav('livestock');

let allLivestock = [];
let editingId    = null;

// ── Load ──────────────────────────────────────────────────
async function loadLivestock() {
  const q    = query(collection(db, 'reef_livestock'), orderBy('dateAdded', 'desc'));
  const snap = await getDocs(q);
  allLivestock = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  updateCounts();
  renderLivestock();
}

function updateCounts() {
  const counts = { fish: 0, coral: 0, invert: 0, plant: 0 };
  allLivestock.forEach(l => counts[l.type] = (counts[l.type] || 0) + 1);
  document.getElementById('countFish').textContent   = counts.fish;
  document.getElementById('countCorals').textContent = counts.coral;
  document.getElementById('countInverts').textContent= counts.invert;
  document.getElementById('countPlants').textContent = counts.plant;
}

function renderLivestock() {
  const typeFilter   = document.getElementById('typeFilter').value;
  const healthFilter = document.getElementById('healthFilter').value;

  let filtered = allLivestock.filter(l =>
    (!typeFilter   || l.type   === typeFilter) &&
    (!healthFilter || l.health === healthFilter)
  );

  const container = document.getElementById('livestockContainer');
  const empty     = document.getElementById('emptyState');

  if (!filtered.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group by type
  const types = ['fish', 'coral', 'invert', 'plant'];
  const groups = {};
  types.forEach(t => { groups[t] = filtered.filter(l => l.type === t); });

  container.innerHTML = types
    .filter(t => groups[t].length)
    .map(t => {
      const label = { fish: 'Fish', coral: 'Corals', invert: 'Invertebrates', plant: 'Plants / Macroalgae' }[t];
      const icon  = LIVESTOCK_ICONS[t];
      return `
        <div class="type-section">
          <div class="type-header">${icon} ${label} <span class="badge badge-neutral">${groups[t].length}</span></div>
          <div class="livestock-grid">
            ${groups[t].map(l => livestockCard(l)).join('')}
          </div>
        </div>`;
    }).join('');
}

function livestockCard(l) {
  const icon         = LIVESTOCK_ICONS[l.type] || '🐠';
  const healthColor  = HEALTH_COLORS[l.health] || 'var(--text-muted)';
  const healthLabel  = l.health ? l.health.charAt(0).toUpperCase() + l.health.slice(1) : 'Unknown';
  const daysSince    = l.dateAdded ? Math.floor((Date.now() - new Date(l.dateAdded)) / 86400000) : null;
  const sinceLabel   = daysSince !== null ? `${daysSince}d in tank` : '';
  return `
    <div class="livestock-card" onclick="openEdit('${l.id}')">
      <div class="lc-icon">${icon}</div>
      <div class="lc-name">${l.name}</div>
      <div class="lc-species">${l.species || '—'}</div>
      <div class="lc-meta">
        <span style="font-size:.8rem;font-weight:600;color:${healthColor};">● ${healthLabel}</span>
        <span class="text-xs text-muted">${sinceLabel}</span>
      </div>
      ${l.location ? `<div class="text-xs text-muted mt-sm">📍 ${l.location}</div>` : ''}
    </div>`;
}

// ── Open add modal ────────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('livestockModalTitle').textContent = 'Add Livestock';
  document.getElementById('lcName').value     = '';
  document.getElementById('lcType').value     = 'fish';
  document.getElementById('lcSpecies').value  = '';
  document.getElementById('lcDateAdded').value= todayDate();
  document.getElementById('lcHealth').value   = 'good';
  document.getElementById('lcLocation').value = '';
  document.getElementById('lcNotes').value    = '';
  document.getElementById('deleteBtn').classList.add('hidden');
  showModal('livestockModal');
}

window.openEdit = function(id) {
  const l = allLivestock.find(x => x.id === id);
  if (!l) return;
  editingId = id;
  document.getElementById('livestockModalTitle').textContent = 'Edit Livestock';
  document.getElementById('lcName').value     = l.name || '';
  document.getElementById('lcType').value     = l.type || 'fish';
  document.getElementById('lcSpecies').value  = l.species || '';
  document.getElementById('lcDateAdded').value= l.dateAdded || todayDate();
  document.getElementById('lcHealth').value   = l.health || 'good';
  document.getElementById('lcLocation').value = l.location || '';
  document.getElementById('lcNotes').value    = l.notes || '';
  document.getElementById('deleteBtn').classList.remove('hidden');
  showModal('livestockModal');
};

// ── Save ──────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', async () => {
  const name = document.getElementById('lcName').value.trim();
  if (!name) return showToast('Please enter a name.', 'error');
  const data = {
    name,
    type:      document.getElementById('lcType').value,
    species:   document.getElementById('lcSpecies').value.trim(),
    dateAdded: document.getElementById('lcDateAdded').value,
    health:    document.getElementById('lcHealth').value,
    location:  document.getElementById('lcLocation').value.trim(),
    notes:     document.getElementById('lcNotes').value.trim(),
  };
  if (editingId) {
    await updateDoc(doc(db, 'reef_livestock', editingId), data);
    showToast('Updated!');
  } else {
    await addDoc(collection(db, 'reef_livestock'), data);
    showToast('Livestock added!');
  }
  hideModal('livestockModal');
  loadLivestock();
});

// ── Delete ────────────────────────────────────────────────
document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Remove this livestock?')) return;
  await deleteDoc(doc(db, 'reef_livestock', editingId));
  showToast('Removed.');
  hideModal('livestockModal');
  loadLivestock();
});

// ── Filters ───────────────────────────────────────────────
document.getElementById('typeFilter').addEventListener('change', renderLivestock);
document.getElementById('healthFilter').addEventListener('change', renderLivestock);

// ── Modal controls ────────────────────────────────────────
document.getElementById('addLivestockBtn').addEventListener('click', openAdd);
document.getElementById('addFirstBtn')?.addEventListener('click', openAdd);
document.getElementById('closeModal').addEventListener('click',  () => hideModal('livestockModal'));
document.getElementById('cancelBtn').addEventListener('click',   () => hideModal('livestockModal'));

loadLivestock();
