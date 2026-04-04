import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyArZQuRp_v2IG9leeW49v3gYeaDnhXMxDc",
  authDomain: "reef-tracker-df787.firebaseapp.com",
  projectId: "reef-tracker-df787",
  storageBucket: "reef-tracker-df787.firebasestorage.app",
  messagingSenderId: "1046001834883",
  appId: "1:1046001834883:web:817611c638e8af1c3e74b6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
