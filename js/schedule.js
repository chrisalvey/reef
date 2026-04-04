import { db } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  setActiveNav, todayDate, formatDate, daysUntil, addDays, frequencyDays,
  showModal, hideModal, showToast
} from './common.js';
import { addDoc as addJournalDoc, collection as col } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

setActiveNav('schedule');

let allTasks  = [];
let editingId = null;
let completingId = null;

// ── Load ──────────────────────────────────────────────────
async function loadTasks() {
  const q    = query(collection(db, 'reef_tasks'), orderBy('nextDue'));
  const snap = await getDocs(q);
  allTasks   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTasks();
}

function renderTasks() {
  const container = document.getElementById('taskContainer');
  const empty     = document.getElementById('emptyState');

  if (!allTasks.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  let overdue = 0, dueToday = 0, dueWeek = 0;

  const sections = {
    overdue:   { label: '🔴 Overdue', tasks: [] },
    today:     { label: '🟡 Due Today', tasks: [] },
    week:      { label: '🔵 This Week', tasks: [] },
    upcoming:  { label: '⚪ Upcoming', tasks: [] },
  };

  allTasks.forEach(t => {
    const days = daysUntil(t.nextDue);
    if (days === null) { sections.upcoming.tasks.push(t); return; }
    if (days < 0)       { sections.overdue.tasks.push(t); overdue++; }
    else if (days === 0){ sections.today.tasks.push(t);   dueToday++; dueWeek++; }
    else if (days <= 7) { sections.week.tasks.push(t);    dueWeek++; }
    else                  sections.upcoming.tasks.push(t);
  });

  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statToday').textContent   = dueToday;
  document.getElementById('statWeek').textContent    = dueWeek;
  document.getElementById('statTotal').textContent   = allTasks.length;

  container.innerHTML = Object.values(sections)
    .filter(s => s.tasks.length)
    .map(s => `
      <div class="section-label">${s.label}</div>
      <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
        ${s.tasks.map(t => taskItem(t)).join('')}
      </div>`).join('');
}

function taskItem(t) {
  const days    = daysUntil(t.nextDue);
  const overdue = days !== null && days < 0;
  const today   = days === 0;
  const cls     = overdue ? 'overdue' : today ? 'due-soon' : 'upcoming';
  const catIcons= { water_change:'💧', testing:'🧪', equipment:'🔧', dosing:'💊', feeding:'🍤', cleaning:'🧹', other:'📋' };
  const icon    = catIcons[t.category] || '📋';
  const lastStr = t.lastCompleted ? `Last done: ${formatDate({ toDate: () => new Date(t.lastCompleted) })}` : 'Never completed';
  const freqStr = t.frequency ? t.frequency.replace(/_/g, ' ') : '';

  return `
    <div class="task-item ${cls}">
      <button class="task-check" onclick="markComplete('${t.id}')" title="Mark complete"></button>
      <div class="task-info">
        <div class="task-name">${icon} ${t.name}</div>
        <div class="task-meta">${freqStr} · ${lastStr}</div>
      </div>
      ${days !== null ? `<div style="font-size:.8rem;font-weight:600;color:${overdue ? 'var(--coral)' : today ? 'var(--yellow)' : 'var(--text-muted)'};">
        ${overdue ? `${Math.abs(days)}d overdue` : today ? 'Today' : `In ${days}d`}
      </div>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="editTask('${t.id}')" title="Edit">✏️</button>
    </div>`;
}

// ── Mark complete flow ────────────────────────────────────
window.markComplete = function(id) {
  completingId = id;
  const t = allTasks.find(x => x.id === id);
  document.getElementById('completeTaskName').textContent = t?.name || '';
  document.getElementById('completeDate').value = todayDate();
  document.getElementById('completeNotes').value = '';
  showModal('completeModal');
};

document.getElementById('confirmComplete').addEventListener('click', async () => {
  if (!completingId) return;
  const t        = allTasks.find(x => x.id === completingId);
  const doneDate = document.getElementById('completeDate').value || todayDate();
  const notes    = document.getElementById('completeNotes').value.trim();
  const days     = frequencyDays(t.frequency, t.customDays);
  const nextDue  = addDays(doneDate, days);

  await updateDoc(doc(db, 'reef_tasks', completingId), {
    lastCompleted: doneDate,
    nextDue,
  });

  // Auto-journal the completion
  await addDoc(collection(db, 'reef_journal'), {
    type: 'maintenance',
    title: `Completed: ${t.name}`,
    notes: notes || `Routine ${t.category?.replace(/_/g, ' ') || 'maintenance'} task completed.`,
    timestamp: Timestamp.fromDate(new Date(doneDate)),
  });

  showToast(`✓ ${t.name} marked complete. Next due: ${nextDue}`);
  hideModal('completeModal');
  completingId = null;
  loadTasks();
});

document.getElementById('cancelComplete').addEventListener('click', () => hideModal('completeModal'));
document.getElementById('closeCompleteModal').addEventListener('click', () => hideModal('completeModal'));

// ── Add / Edit task ───────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('taskModalTitle').textContent = 'Add Task';
  document.getElementById('taskName').value       = '';
  document.getElementById('taskCategory').value   = 'water_change';
  document.getElementById('taskFrequency').value  = 'weekly';
  document.getElementById('customDays').value     = '14';
  document.getElementById('taskDueDate').value    = todayDate();
  document.getElementById('taskLastCompleted').value = '';
  document.getElementById('taskNotes').value      = '';
  document.getElementById('deleteTaskBtn').classList.add('hidden');
  document.getElementById('customDaysGroup').classList.add('hidden');
  showModal('taskModal');
}

window.editTask = function(id) {
  const t = allTasks.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('taskName').value       = t.name || '';
  document.getElementById('taskCategory').value   = t.category || 'other';
  document.getElementById('taskFrequency').value  = t.frequency || 'weekly';
  document.getElementById('customDays').value     = t.customDays || '14';
  document.getElementById('taskDueDate').value    = t.nextDue || todayDate();
  document.getElementById('taskLastCompleted').value = t.lastCompleted || '';
  document.getElementById('taskNotes').value      = t.notes || '';
  document.getElementById('deleteTaskBtn').classList.remove('hidden');
  document.getElementById('customDaysGroup').classList.toggle('hidden', t.frequency !== 'custom');
  showModal('taskModal');
};

document.getElementById('taskFrequency').addEventListener('change', e => {
  document.getElementById('customDaysGroup').classList.toggle('hidden', e.target.value !== 'custom');
});

document.getElementById('saveTaskBtn').addEventListener('click', async () => {
  const name = document.getElementById('taskName').value.trim();
  if (!name) return showToast('Please enter a task name.', 'error');
  const freq     = document.getElementById('taskFrequency').value;
  const nextDue  = document.getElementById('taskDueDate').value || todayDate();
  const data = {
    name,
    category:      document.getElementById('taskCategory').value,
    frequency:     freq,
    customDays:    freq === 'custom' ? parseInt(document.getElementById('customDays').value) : null,
    nextDue,
    lastCompleted: document.getElementById('taskLastCompleted').value || null,
    notes:         document.getElementById('taskNotes').value.trim(),
  };
  if (editingId) {
    await updateDoc(doc(db, 'reef_tasks', editingId), data);
    showToast('Task updated!');
  } else {
    await addDoc(collection(db, 'reef_tasks'), data);
    showToast('Task added!');
  }
  hideModal('taskModal');
  loadTasks();
});

document.getElementById('deleteTaskBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Delete this task?')) return;
  await deleteDoc(doc(db, 'reef_tasks', editingId));
  showToast('Task deleted.');
  hideModal('taskModal');
  loadTasks();
});

// ── Browser notifications ─────────────────────────────────
document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return showToast('Browser notifications not supported.', 'error');
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('Reminders enabled! Check back daily.');
    scheduleOverdueNotification();
  } else {
    showToast('Notifications blocked. Enable in browser settings.', 'error');
  }
});

function scheduleOverdueNotification() {
  const overdue = allTasks.filter(t => daysUntil(t.nextDue) !== null && daysUntil(t.nextDue) < 0);
  if (overdue.length && Notification.permission === 'granted') {
    new Notification('Reef Tracker — Tasks Overdue', {
      body: `${overdue.length} maintenance task(s) overdue: ${overdue.map(t => t.name).join(', ')}`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🪸</text></svg>'
    });
  }
}

// ── Modal controls ────────────────────────────────────────
document.getElementById('addTaskBtn').addEventListener('click', openAdd);
document.getElementById('addFirstBtn')?.addEventListener('click', openAdd);
document.getElementById('closeModal').addEventListener('click',  () => hideModal('taskModal'));
document.getElementById('cancelBtn').addEventListener('click',   () => hideModal('taskModal'));

loadTasks();
