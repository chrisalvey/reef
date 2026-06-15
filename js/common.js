// ============================================================
//  Reef Tracker — Shared Utilities
// ============================================================

export const DEFAULT_PARAMETERS = [
  { key: 'alkalinity',  name: 'Alkalinity',   unit: 'dKH',  min: 7,    max: 12,   decimals: 1, enabled: true  },
  { key: 'calcium',     name: 'Calcium',       unit: 'ppm',  min: 380,  max: 450,  decimals: 0, enabled: true  },
  { key: 'magnesium',   name: 'Magnesium',     unit: 'ppm',  min: 1250, max: 1350, decimals: 0, enabled: true  },
  { key: 'nitrate',     name: 'Nitrate',       unit: 'ppm',  min: 0,    max: 10,   decimals: 2, enabled: true  },
  { key: 'phosphate',   name: 'Phosphate',     unit: 'ppm',  min: 0.05, max: 0.15, decimals: 3, enabled: true  },
  { key: 'ph',          name: 'pH',            unit: '',     min: 7.8,  max: 8.5,  decimals: 2, enabled: true  },
  { key: 'salinity',    name: 'Salinity',      unit: 'SG',   min: 1.024,max: 1.026,decimals: 4, enabled: true  },
  { key: 'temperature', name: 'Temperature',   unit: '°F',   min: 76,   max: 80,   decimals: 1, enabled: true  },
];

// ── Nav active state ──────────────────────────────────────
export function setActiveNav(page) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// ── Date helpers ──────────────────────────────────────────
export function nowDatetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days}d ago`;
  return formatDate(ts);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function frequencyDays(freq, customDays) {
  const map = { daily: 1, every2days: 2, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 };
  return map[freq] ?? parseInt(customDays) ?? 7;
}

// ── Parameter helpers ─────────────────────────────────────
export function getParamStatus(value, min, max) {
  if (value === null || value === undefined) return 'unknown';
  if (value < min || value > max) return 'alert';
  const range = max - min;
  const margin = range * 0.1;
  if (value < min + margin || value > max - margin) return 'warn';
  return 'ok';
}

export function statusBadgeClass(status) {
  return { ok: 'badge-success', warn: 'badge-warning', alert: 'badge-danger', unknown: 'badge-neutral' }[status] || 'badge-neutral';
}

export function statusLabel(status) {
  return { ok: 'Good', warn: 'Marginal', alert: 'Out of Range', unknown: 'No Data' }[status] || status;
}

// ── Parameter settings (localStorage) ────────────────────
export function loadParamSettings() {
  try {
    const raw = localStorage.getItem('reef_params');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_PARAMETERS.map(p => ({ ...p }));
}

export function saveParamSettings(params) {
  localStorage.setItem('reef_params', JSON.stringify(params));
}

export function enabledParams() {
  return loadParamSettings().filter(p => p.enabled !== false);
}

// ── Type labels ───────────────────────────────────────────
export const LIVESTOCK_ICONS = { fish: '🐠', coral: '🪸', invert: '🦀', plant: '🌿' };
export const EQUIP_ICONS     = { light: '💡', pump: '🌀', skimmer: '⚗️', heater: '🌡️', filter: '🔄', dosing_pump: '💧', controller: '📊', other: '⚙️' };
export const JOURNAL_ICONS   = { water_change: '💧', observation: '👁️', addition: '➕', maintenance: '🔧', treatment: '💊', other: '📝' };

export const HEALTH_COLORS   = { excellent: 'var(--green)', good: 'var(--teal)', fair: 'var(--yellow)', poor: 'var(--coral)' };

// ── UI helpers ────────────────────────────────────────────
export function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id)  { document.getElementById(id).classList.add('hidden'); }

export function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:1.5rem;right:1.5rem;z-index:999;
    background:var(--ocean-card);border:1px solid ${type === 'error' ? 'var(--coral)' : 'var(--green)'};
    color:${type === 'error' ? 'var(--coral-light)' : 'var(--green-light)'};
    border-radius:var(--radius-md);padding:.75rem 1.25rem;font-size:.875rem;
    box-shadow:var(--shadow-lg);max-width:320px;
    animation:fadeInUp .2s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── CSV export ────────────────────────────────────────────
export function downloadCsv(rows, filename) {
  const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// Inject keyframe animation once
const style = document.createElement('style');
style.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
document.head.appendChild(style);
