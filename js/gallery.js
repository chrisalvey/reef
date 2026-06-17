import { db, storage } from '../firebase-config.js';
import {
  collection, query, orderBy, getDocs, addDoc, deleteDoc,
  doc, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';
import {
  setActiveNav, nowDatetimeLocal, formatDateTime, showModal, hideModal, showToast
} from './common.js';

setActiveNav('gallery');

let allPhotos = [];
let sortOrder = 'desc';
let viewingId = null;
let selectedFile = null;

const photoGrid   = document.getElementById('photoGrid');
const noPhotos    = document.getElementById('noPhotos');
const photoCount  = document.getElementById('photoCount');

// ── Load photos ───────────────────────────────────────────
async function loadPhotos() {
  const q    = query(collection(db, 'reef_photos'), orderBy('takenAt', 'desc'));
  const snap = await getDocs(q);
  allPhotos  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGallery();
}

function renderGallery() {
  const photos = sortOrder === 'asc' ? [...allPhotos].reverse() : allPhotos;

  photoGrid.classList.toggle('hidden', !photos.length);
  noPhotos.classList.toggle('hidden', !!photos.length);
  photoCount.textContent = photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : '';

  if (!photos.length) { photoGrid.innerHTML = ''; return; }

  photoGrid.innerHTML = photos.map(p => {
    const date = p.takenAt?.toDate ? p.takenAt.toDate() : new Date(p.takenAt);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="photo-card" onclick="openLightbox('${p.id}')">
        <img class="photo-card-img" src="${p.url}" alt="${p.caption || 'Reef photo'}" loading="lazy">
        <div class="photo-card-info">
          ${p.caption ? `<div class="text-sm" style="font-weight:600;margin-bottom:.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.caption}</div>` : ''}
          <div class="text-sm text-muted">${label}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Sort controls ─────────────────────────────────────────
document.getElementById('sortNewest').addEventListener('click', () => {
  sortOrder = 'desc';
  document.getElementById('sortNewest').classList.add('active');
  document.getElementById('sortOldest').classList.remove('active');
  renderGallery();
});

document.getElementById('sortOldest').addEventListener('click', () => {
  sortOrder = 'asc';
  document.getElementById('sortOldest').classList.add('active');
  document.getElementById('sortNewest').classList.remove('active');
  renderGallery();
});

// ── Upload modal ──────────────────────────────────────────
document.getElementById('uploadBtn').addEventListener('click', openUploadModal);

function openUploadModal() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadPreview').classList.add('hidden');
  document.getElementById('uploadZonePrompt').classList.remove('hidden');
  document.getElementById('photoCaption').value = '';
  document.getElementById('photoDate').value = nowDatetimeLocal();
  document.getElementById('saveUploadBtn').disabled = true;
  document.getElementById('progressWrap').classList.add('hidden');
  document.getElementById('progressBar').style.width = '0%';
  showModal('uploadModal');
}

document.getElementById('closeUploadModal').addEventListener('click', () => hideModal('uploadModal'));
document.getElementById('cancelUploadBtn').addEventListener('click', () => hideModal('uploadModal'));

// File selection via click on zone
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

// Drag-and-drop
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFileSelect(file);
  else showToast('Please drop an image file.', 'error');
});

function handleFileSelect(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image must be under 10 MB.', 'error');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('uploadPreview');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    document.getElementById('uploadZonePrompt').classList.add('hidden');
  };
  reader.readAsDataURL(file);
  document.getElementById('saveUploadBtn').disabled = false;
}

// ── Upload to Firebase ────────────────────────────────────
document.getElementById('saveUploadBtn').addEventListener('click', async () => {
  if (!selectedFile) return;

  const caption  = document.getElementById('photoCaption').value.trim();
  const dateStr  = document.getElementById('photoDate').value;
  if (!dateStr) { showToast('Please set a date.', 'error'); return; }

  const saveBtn = document.getElementById('saveUploadBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Uploading…';
  document.getElementById('progressWrap').classList.remove('hidden');

  const ext      = selectedFile.name.split('.').pop() || 'jpg';
  const filename = `${Date.now()}.${ext}`;
  const path     = `reef_photos/${filename}`;
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, selectedFile);

  uploadTask.on('state_changed',
    snapshot => {
      const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      document.getElementById('progressBar').style.width = pct + '%';
    },
    err => {
      showToast('Upload failed: ' + err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Upload Photo';
    },
    async () => {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      await addDoc(collection(db, 'reef_photos'), {
        url,
        storagePath: path,
        caption,
        takenAt:    Timestamp.fromDate(new Date(dateStr)),
        uploadedAt: Timestamp.now(),
      });
      showToast('Photo uploaded!');
      hideModal('uploadModal');
      saveBtn.textContent = 'Upload Photo';
      loadPhotos();
    }
  );
});

// ── Lightbox ──────────────────────────────────────────────
window.openLightbox = function(id) {
  const p = allPhotos.find(x => x.id === id);
  if (!p) return;
  viewingId = id;

  document.getElementById('lightboxImg').src = p.url;
  document.getElementById('lightboxCaption').textContent = p.caption || '';
  const taken = p.takenAt?.toDate ? p.takenAt.toDate() : new Date(p.takenAt);
  document.getElementById('lightboxDate').textContent = taken.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
  document.getElementById('lightbox').classList.remove('hidden');
};

document.getElementById('closeLightboxBtn').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
});

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightboxImg').src = '';
  viewingId = null;
}

document.getElementById('deletePhotoBtn').addEventListener('click', async () => {
  if (!viewingId || !confirm('Delete this photo? This cannot be undone.')) return;
  const p = allPhotos.find(x => x.id === viewingId);
  if (!p) return;

  try {
    if (p.storagePath) await deleteObject(ref(storage, p.storagePath));
    await deleteDoc(doc(db, 'reef_photos', viewingId));
    showToast('Photo deleted.');
    closeLightbox();
    loadPhotos();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
});

loadPhotos();
