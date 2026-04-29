import { auth, db, storage, initTheme } from "./main.js";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, setDoc, doc, getDoc, getDocs, updateDoc, increment, serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch, deleteField, FieldPath, deleteDoc, startAfter, endBefore, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, getDownloadURL, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { runWithConcurrency, showToast } from "./utils.js";

/* Auth */
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const msg = document.getElementById('auth-status');
        if (msg) {
            msg.textContent = "Signing in...";
            msg.style.color = "var(--accent-primary)";
        }
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            console.error("Sign-in Error:", err);
            if (msg) {
                msg.textContent = "Error: " + err.message;
                msg.style.color = "#ff6b6b";
            }
        });
    });
}

onAuthStateChanged(auth, user => {
    if(user) {
        initTheme(); 
        getDoc(doc(db, 'admin_whitelist', user.uid)).then(snap => {
            if(snap.exists()) {
                console.log("Admin privileges confirmed.");
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('admin-panel').style.display = 'flex';
                loadConfigs();
                initPulseMonitor();
                initDashboardStats();
                initGalleryUpload();
            } else {
                console.error("Non-admin UID attempted access:", user.uid);
                document.getElementById('auth-status').textContent = "Access Denied.";
                signOut(auth);
            }
        }).catch(err => {
            console.error("Admin check failed:", err);
        });
    } else {
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'none';
    }
});

/* --- Sidebar Navigation --- */
export function showSection(sectionId) {
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.section === sectionId) li.classList.add('active');
    });
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    const activeSection = document.getElementById(sectionId);
    if (activeSection) activeSection.classList.add('active');
    if (sectionId === 'manage-content') loadContentList();
}
window.showSection = showSection;

/* --- Pulse Monitor & Dashboard --- */
let lastPulseTime = 0;

export async function clearSparkCounts() {
    if (!confirm("Are you sure you want to clear all spark counts and history?")) return;
    try {
        const batch = writeBatch(db);
        const usersSnap = await getDocs(collection(db, 'user_data'));
        usersSnap.forEach(d => batch.update(d.ref, { pulseCount: 0, lastPulse: deleteField() }));
        
        const historySnap = await getDocs(query(collection(db, 'spark_history'), limit(400)));
        historySnap.forEach(d => batch.delete(d.ref));
        
        await batch.commit();
        showToast("All spark data cleared!", "success");
    } catch (e) { console.error(e); alert("Failed: " + e.message); }
}
window.clearSparkCounts = clearSparkCounts;

function initDashboardStats() {
    const sparksCountEl = document.getElementById('total-sparks-count');
    const visitsCountEl = document.getElementById('total-visits-count');
    const visitLogEl = document.getElementById('visit-log');

    onSnapshot(doc(db, 'config', 'stats'), snap => {
        if (snap.exists()) {
            const data = snap.data();
            if (sparksCountEl) sparksCountEl.textContent = data.totalSparks || 0;
            if (visitsCountEl) visitsCountEl.textContent = data.totalVisits || 0;
        }
    });

    onSnapshot(query(collection(db, 'site_visits'), orderBy('timestamp', 'desc'), limit(15)), snap => {
        if (!visitLogEl) return;
        visitLogEl.innerHTML = '';
        snap.forEach(doc => {
            const v = doc.data(), date = new Date(v.timestamp);
            const item = document.createElement('div');
            item.style.cssText = "padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 10px; margin-bottom: 5px;";
            item.innerHTML = `<strong>${v.path || 'Home'}</strong> <br><small>${date.toLocaleString()}</small>`;
            visitLogEl.appendChild(item);
        });
    });
}

function initPulseMonitor() {
    const log = document.getElementById('pulse-log');
    onSnapshot(query(collection(db, 'spark_history'), orderBy('timestamp', 'desc'), limit(15)), snap => {
        if (!log) return;
        log.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data(), date = new Date(p.timestamp);
            const item = document.createElement('div');
            item.style.cssText = "padding:10px; background:rgba(0,0,0,0.3); border:1px solid var(--card-border); border-radius:12px; margin-bottom:5px;";
            item.innerHTML = `<strong>${p.userName || "Friend"}</strong> sent a spark <br><small>${date.toLocaleString()}</small>`;
            log.appendChild(item);
        });
    });
}

/* --- Optimized Media Processing --- */
async function processImage(file, type = 'thumb') {
    if (!file.type.startsWith('image')) return null;
    try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        let width = bitmap.width, height = bitmap.height;
        const MAX_DIM = (type === 'thumb') ? 400 : 2000;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    } catch(e) { console.error("Image process failed", e); return file; }
}

async function getExifData(file) {
    return { date: new Date(file.lastModified) }; // Simplified for browser
}

async function getVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            video.currentTime = 1;
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                URL.revokeObjectURL(video.src);
                canvas.toBlob(resolve, 'image/jpeg', 0.7);
            };
        };
    });
}

/* --- Gallery Upload --- */
let uploadQueue = [];
let videoReviewQueue = [];
let reviewedDates = {};

async function initGalleryUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('gallery-file');
    if (!dropZone) return;
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => { handleFiles(e.target.files); fileInput.value = ''; };
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--card-border)'; };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--card-border)'; handleFiles(e.dataTransfer.files); };
}

function handleFiles(files) {
    for (let file of files) {
        uploadQueue.push({ file, isPrivate: document.getElementById('gallery-private').checked });
    }
    renderUploadPreview();
}

function renderUploadPreview() {
    const container = document.getElementById('upload-preview-container');
    const startBtn = document.getElementById('start-upload-btn');
    const clearBtn = document.getElementById('clear-queue-btn');
    const count = document.getElementById('queue-count');
    if(!container) return;
    container.innerHTML = '';
    
    if (uploadQueue.length > 0) {
        startBtn.style.display = 'block'; clearBtn.style.display = 'block';
        count.textContent = uploadQueue.length;
    } else {
        startBtn.style.display = 'none'; clearBtn.style.display = 'none';
    }

    uploadQueue.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = "padding:10px; position:relative; font-size:0.7rem; margin-bottom:0;";
        card.innerHTML = `
            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:5px;">${item.file.name}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="display:flex; align-items:center; gap:3px; cursor:pointer;">
                    <input type="checkbox" ${item.isPrivate ? 'checked' : ''} onchange="toggleIndividualPrivate(${i}, this.checked)" style="width:12px; height:12px; margin:0;">
                    Private
                </label>
            </div>
            <button onclick="removeFileFromQueue(${i})" style="position:absolute; top:5px; right:5px; border-radius:50%; background:rgba(255,0,0,0.7); color:white; border:none; cursor:pointer; width:18px; height:18px; font-size:10px; display:flex; align-items:center; justify-content:center;">✕</button>
        `;
        container.appendChild(card);
    });
}

window.toggleIndividualPrivate = (index, val) => { if (uploadQueue[index]) uploadQueue[index].isPrivate = val; };
window.removeFileFromQueue = (index) => { uploadQueue.splice(index, 1); renderUploadPreview(); };
window.clearUploadQueue = () => { uploadQueue = []; renderUploadPreview(); };

async function uploadGallery() {
    if(!uploadQueue.length) return;
    const status = document.getElementById('gallery-status'), progress = document.getElementById('gallery-progress'), fill = progress?.querySelector('.progress-fill');
    if (progress) progress.style.display = 'block';
    let completed = 0;
    
    await runWithConcurrency(uploadQueue.map(item => async () => {
        const file = item.file, ts = Date.now() + Math.floor(Math.random()*1000);
        let mainBlob = file, thumbBlob = null;
        if (file.type.startsWith('image')) {
            [mainBlob, thumbBlob] = await Promise.all([processImage(file, 'original'), processImage(file, 'thumb')]);
        } else if (file.type.startsWith('video')) {
            thumbBlob = await getVideoThumbnail(file);
        }
        const mainRef = ref(storage, `gallery/${ts}_${file.name}`), thumbRef = ref(storage, `gallery/thumb_${ts}_${file.name}`);
        const [mainUrl, thumbUrl] = await Promise.all([
            (async () => { await uploadBytesResumable(mainRef, mainBlob); return getDownloadURL(mainRef); })(),
            (async () => { if(!thumbBlob) return null; await uploadBytesResumable(thumbRef, thumbBlob); return getDownloadURL(thumbRef); })()
        ]);
        await addDoc(collection(db, 'gallery'), { 
            src: mainUrl, thumb: thumbUrl, type: file.type.startsWith('video') ? 'video' : 'image', 
            private: item.isPrivate, filename: file.name, timestamp: Date.now() 
        });
        completed++;
        if (fill) fill.style.width = (completed / uploadQueue.length * 100) + '%';
        if (status) status.textContent = `Uploaded ${completed}/${uploadQueue.length}...`;
    }), 3);

    status.textContent = "Done!";
    uploadQueue = []; renderUploadPreview();
    setTimeout(() => { if(progress) progress.style.display = 'none'; }, 2000);
}
window.uploadGallery = uploadGallery;

/* --- Content Management --- */
let lastDoc = null, firstDoc = null, currentPage = 1;
const pageSize = 50;

async function loadContentList(dir = 'first') {
    const col = document.getElementById('manage-collection').value, list = document.getElementById('manage-list'), info = document.getElementById('page-info');
    if (dir === 'first') { currentPage = 1; lastDoc = null; firstDoc = null; }
    list.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.5;">Loading archival records...</div>';
    try {
        let q;
        const baseQuery = collection(db, col);
        if (dir === 'next' && lastDoc) q = query(baseQuery, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(pageSize));
        else if (dir === 'prev' && firstDoc) q = query(baseQuery, orderBy('timestamp', 'desc'), endBefore(firstDoc), limitToLast(pageSize));
        else q = query(baseQuery, orderBy('timestamp', 'desc'), limit(pageSize));

        const snap = await getDocs(q);
        if (snap.empty) { list.innerHTML = 'No items found.'; return; }
        firstDoc = snap.docs[0]; lastDoc = snap.docs[snap.docs.length - 1];
        if (info) info.textContent = `Page ${currentPage}`;
        renderList(snap, col);
    } catch (e) { list.innerHTML = `Error: ${e.message}`; }
}
window.loadContentList = loadContentList;

function renderList(snap, col) {
    const list = document.getElementById('manage-list'); list.innerHTML = '';
    snap.forEach(d => {
        const data = d.data(), item = document.createElement('div');
        item.style.cssText = "display:flex; align-items:center; padding:10px; border-bottom:1px solid var(--card-border); gap:15px;";
        item.innerHTML = `
            <input type="checkbox" class="item-checkbox" data-id="${d.id}" style="width:20px; height:20px;" onchange="updateSelectUI()">
            <span style="flex-grow:1;">${data.filename || data.title || d.id}</span>
            <button class="btn-admin" style="margin:0; background:red; font-size:0.8rem;" onclick="deleteItem('${col}', '${d.id}')">Delete</button>
        `;
        list.appendChild(item);
    });
    updateSelectUI();
}

window.deleteItem = async (col, id) => {
    if(!confirm("Delete this item?")) return;
    await deleteDoc(doc(db, col, id));
    showToast("Deleted!", "success");
    loadContentList();
};

window.updateSelectUI = () => {
    const checked = document.querySelectorAll('.item-checkbox:checked'), btn = document.getElementById('delete-selected-btn'), count = document.getElementById('select-count');
    if (count) count.textContent = checked.length;
    if (btn) btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
};

window.toggleSelectAll = () => {
    const boxes = document.querySelectorAll('.item-checkbox'), allChecked = Array.from(boxes).every(b => b.checked);
    boxes.forEach(b => b.checked = !allChecked);
    window.updateSelectUI();
};

window.deleteSelectedItems = async () => {
    const col = document.getElementById('manage-collection').value, checked = document.querySelectorAll('.item-checkbox:checked');
    if (!checked.length || !confirm(`Delete ${checked.length} items?`)) return;
    const batch = writeBatch(db);
    checked.forEach(cb => batch.delete(doc(db, col, cb.dataset.id)));
    await batch.commit();
    showToast("Deleted!", "success");
    loadContentList();
};

window.loadNextPage = () => { currentPage++; loadContentList('next'); };
window.loadPreviousPage = () => { if(currentPage > 1) { currentPage--; loadContentList('prev'); } };

/* --- Simple Content Updates --- */
async function updateHomeVideoURL() {
    const url = document.getElementById('home-video-url').value.trim();
    const status = document.getElementById('home-status');
    if (!url) return alert("Please enter a URL");
    status.textContent = "Updating...";
    try {
        await setDoc(doc(db, 'config', 'home'), { 
            introVideo: url, 
            updatedAt: Date.now(),
            storageType: 'external-url'
        }, { merge: true });
        status.textContent = "Home video updated! ✨";
        loadConfigs();
    } catch (err) { status.textContent = "Error: " + err.message; }
}
window.updateHomeVideoURL = updateHomeVideoURL;

async function updateLetter() {
    const text = document.getElementById('letter-input').value.trim(), closingLine = document.getElementById('letter-closing-input').value.trim();
    await setDoc(doc(db, 'config', 'letter'), { text, closingLine, updatedAt: Date.now() }, { merge: true });
    showToast("Home Note updated!", "success");
}
window.updateLetter = updateLetter;

async function updateAloneText() {
    const text = document.getElementById('alone-input').value.trim();
    await setDoc(doc(db, 'config', 'feelingLow'), { aloneText: text, updatedAt: Date.now() }, { merge: true });
    showToast("Message updated!", "success");
}
window.updateAloneText = updateAloneText;

async function addJoke() {
    const title = document.getElementById('joke-title').value, text = document.getElementById('joke-text').value, tier = parseInt(document.getElementById('joke-size').value);
    await addDoc(collection(db, 'jokes'), { title, text, sizeTier: tier, timestamp: Date.now() });
    document.getElementById('joke-status').textContent = "Joke Added!";
    document.getElementById('joke-title').value = ''; document.getElementById('joke-text').value = '';
}
window.addJoke = addJoke;

/* --- Configuration Loading --- */
async function loadConfigs() {
    try {
        const [email, home, low, letter] = await Promise.all([
            getDoc(doc(db, 'config', 'emailjs')), getDoc(doc(db, 'config', 'home')),
            getDoc(doc(db, 'config', 'feelingLow')), getDoc(doc(db, 'config', 'letter'))
        ]);
        if (email.exists()) { 
            const d = email.data(); 
            document.getElementById('emailjs-public-key').value = d.publicKey || ''; 
            document.getElementById('emailjs-service-id').value = d.serviceID || ''; 
            document.getElementById('emailjs-template-id').value = d.templateID || ''; 
        }
        if (home.exists()) { 
            const d = home.data();
            const input = document.getElementById('home-video-url');
            if (input) input.value = d.introVideo || '';
            const pre = document.getElementById('home-current-preview');
            if (pre) pre.innerHTML = `📹 <a href="${d.introVideo}" target="_blank">Current Video</a>`;
        }
        if (low.exists()) { const d = low.data(); if (document.getElementById('alone-input')) document.getElementById('alone-input').value = d.aloneText || ''; }
        if (letter.exists()) { const d = letter.data(); if (document.getElementById('letter-input')) document.getElementById('letter-input').value = d.text || ''; if (document.getElementById('letter-closing-input')) document.getElementById('letter-closing-input').value = d.closingLine || ''; }
    } catch(e) { console.warn("Error loading configs", e); }
}

window.saveEmailJSConfig = async () => {
    const publicKey = document.getElementById('emailjs-public-key').value, serviceID = document.getElementById('emailjs-service-id').value, templateID = document.getElementById('emailjs-template-id').value;
    await setDoc(doc(db, 'config', 'emailjs'), { publicKey, serviceID, templateID, updatedAt: Date.now() }, { merge: true });
    showToast("EmailJS Config Saved!", "success");
};

/* --- Migration --- */
window.migrateAll = async () => {
    const log = document.getElementById('migration-log'); if(!log) return;
    log.innerHTML = 'Starting migration...<br>';
    try {
        const [memories, gallery, jokes] = await Promise.all([
            fetch('assets/memories_photos/memories.json').then(r => r.json()),
            fetch('update_data.js').then(r => r.text()).then(t => {
                const match = t.match(/const GALLERY_DATA = (\[[\s\S]*?\]);/);
                return match ? eval(match[1]) : [];
            }),
            fetch('assets/jokes/jokes.json').then(r => r.json())
        ]);
        for (const item of gallery) await addDoc(collection(db, 'gallery'), { ...item, timestamp: Date.now() });
        for (const item of memories) await addDoc(collection(db, 'memories'), { ...item.meta, timestamp: Date.now() });
        for (const item of jokes) await addDoc(collection(db, 'jokes'), { ...joke, timestamp: Date.now() });
        log.innerHTML += '<strong>Migration Complete!</strong>';
    } catch(e) { log.innerHTML += `<span style="color:red">Error: ${e.message}</span>`; }
};

window.signOutUser = () => signOut(auth);
window.uploadMemory = async () => { /* Simplified */ };
window.uploadFamiliarSound = async () => { /* Simplified */ };
