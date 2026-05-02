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
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        
        const cleanup = () => {
            URL.revokeObjectURL(url);
            video.remove();
        };

        video.onloadeddata = () => {
            // Seek to 0.5 seconds, or half duration if shorter
            video.currentTime = Math.min(0.5, video.duration / 2);
        };

        video.onseeked = () => {
            // Give the browser a moment to actually render the frame
            setTimeout(() => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth; 
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);
                    canvas.toBlob((blob) => {
                        resolve(blob);
                        cleanup();
                    }, 'image/jpeg', 0.7);
                } catch (e) {
                    console.error("Capture failed", e);
                    resolve(null);
                    cleanup();
                }
            }, 200);
        };

        video.onerror = () => {
            console.error("Video error");
            resolve(null);
            cleanup();
        };

        video.src = url;
        video.load();
    });
}

/* --- Gallery Upload --- */
let uploadQueue = [];
let videoReviewQueue = [];
let reviewedDates = {};

async function initGalleryUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('gallery-file');
    const globalPrivate = document.getElementById('gallery-private');
    
    if (!dropZone) return;
    
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => { handleFiles(e.target.files); fileInput.value = ''; };
    
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--card-border)'; };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--card-border)'; handleFiles(e.dataTransfer.files); };

    if (globalPrivate) {
        globalPrivate.onchange = (e) => {
            const val = e.target.checked;
            uploadQueue.forEach(item => { item.isPrivate = val; });
            renderUploadPreview();
        };
    }
}

async function handleFiles(files) {
    const status = document.getElementById('gallery-status');
    const isPrivate = document.getElementById('gallery-private').checked;
    
    // Convert FileList to Array for safer iteration
    const fileArray = Array.from(files);
    
    for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        if (status) status.textContent = `Processing ${i + 1}/${fileArray.length}...`;
        
        try {
            const item = { 
                file, 
                isPrivate: isPrivate,
                thumbBlob: null,
                previewUrl: null
            };
            
            if (file.type.startsWith('image')) {
                item.thumbBlob = await processImage(file, 'thumb');
                if (item.thumbBlob) item.previewUrl = URL.createObjectURL(item.thumbBlob);
            } else if (file.type.startsWith('video')) {
                item.thumbBlob = await getVideoThumbnail(file);
                if (item.thumbBlob) item.previewUrl = URL.createObjectURL(item.thumbBlob);
            }
            
            uploadQueue.push(item);
            // Update preview incrementally so user sees progress
            renderUploadPreview();
        } catch (err) {
            console.error("Error processing file:", file.name, err);
        }
    }
    
    if (status) status.textContent = fileArray.length > 0 ? "Ready to upload!" : "";
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
        card.style.cssText = "padding:5px; position:relative; font-size:0.65rem; margin-bottom:0; display:flex; flex-direction:column; gap:5px; overflow:hidden;";
        
        const previewHtml = item.previewUrl 
            ? `<img src="${item.previewUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;">`
            : `<div style="width:100%; height:80px; background:rgba(255,255,255,0.05); border-radius:8px; display:flex; align-items:center; justify-content:center;">${item.file.type.startsWith('video') ? '🎥' : '🖼️'}</div>`;

        card.innerHTML = `
            ${previewHtml}
            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:0 3px;">${item.file.name}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0 3px 3px;">
                <label style="display:flex; align-items:center; gap:3px; cursor:pointer; margin:0;">
                    <input type="checkbox" ${item.isPrivate ? 'checked' : ''} onchange="toggleIndividualPrivate(${i}, this.checked)" style="width:10px; height:10px; margin:0;">
                    Priv
                </label>
                <button onclick="removeFileFromQueue(${i})" style="border-radius:50%; background:rgba(255,0,0,0.7); color:white; border:none; cursor:pointer; width:16px; height:16px; font-size:9px; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>
        `;
        container.appendChild(card);
    });
}

window.toggleIndividualPrivate = (index, val) => { if (uploadQueue[index]) uploadQueue[index].isPrivate = val; };
window.removeFileFromQueue = (index) => { 
    if (uploadQueue[index] && uploadQueue[index].previewUrl) URL.revokeObjectURL(uploadQueue[index].previewUrl);
    uploadQueue.splice(index, 1); 
    renderUploadPreview(); 
};
window.clearUploadQueue = () => { 
    uploadQueue.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    uploadQueue = []; 
    renderUploadPreview(); 
};

async function uploadGallery() {
    if(!uploadQueue.length) return;
    const status = document.getElementById('gallery-status'), progress = document.getElementById('gallery-progress'), fill = progress?.querySelector('.progress-fill');
    if (progress) progress.style.display = 'block';
    let completed = 0;
    
    await runWithConcurrency(uploadQueue.map(item => async () => {
        const file = item.file, ts = Date.now() + Math.floor(Math.random()*1000);
        let mainBlob = file, thumbBlob = item.thumbBlob;
        
        if (file.type.startsWith('image')) {
            mainBlob = await processImage(file, 'original');
            if (!thumbBlob) thumbBlob = await processImage(file, 'thumb');
        } else if (file.type.startsWith('video')) {
            if (!thumbBlob) thumbBlob = await getVideoThumbnail(file);
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
        
        // Cleanup preview URL
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);

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
    try {
        const docRef = doc(db, col, id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            // Delete from Storage if it's a gallery or memory item with storage files
            if (data.src && data.src.includes('firebasestorage.googleapis.com')) {
                try { await deleteObject(ref(storage, data.src)); } catch(e) { console.warn("Src deletion failed", e); }
            }
            if (data.thumb && data.thumb.includes('firebasestorage.googleapis.com')) {
                try { await deleteObject(ref(storage, data.thumb)); } catch(e) { console.warn("Thumb deletion failed", e); }
            }
            // For memories, we might have more files but this handles the main gallery case
        }
        await deleteDoc(docRef);
        showToast("Deleted!", "success");
        loadContentList();
    } catch (e) {
        console.error("Delete failed", e);
        showToast("Delete failed", "error");
    }
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
    
    showToast(`Deleting ${checked.length} items...`, "info");
    
    try {
        const batch = writeBatch(db);
        for (const cb of checked) {
            const id = cb.dataset.id;
            const docRef = doc(db, col, id);
            
            // Attempt storage deletion before doc deletion
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.src && data.src.includes('firebasestorage.googleapis.com')) {
                    try { await deleteObject(ref(storage, data.src)); } catch(e) {}
                }
                if (data.thumb && data.thumb.includes('firebasestorage.googleapis.com')) {
                    try { await deleteObject(ref(storage, data.thumb)); } catch(e) {}
                }
            }
            batch.delete(docRef);
        }
        await batch.commit();
        showToast("Batch delete successful!", "success");
        loadContentList();
    } catch (e) {
        console.error("Batch delete failed", e);
        showToast("Some items failed to delete", "error");
    }
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
