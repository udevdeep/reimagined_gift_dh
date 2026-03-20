import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, getDoc, getDocs, updateDoc, increment, serverTimestamp, query, orderBy, limit, onSnapshot, writeBatch, deleteField, FieldPath, deleteDoc, startAfter, endBefore, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, getDownloadURL, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { runWithConcurrency, showToast } from "./utils.js";
import { upload } from "https://esm.sh/@vercel/blob/client";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB8zvSjJnKFQEuASiWoXx3u9sMKfCcbTDs",
    authDomain: "collegegift-20949.firebaseapp.com",
    projectId: "collegegift-20949",
    storageBucket: "collegegift-20949.firebasestorage.app",
    messagingSenderId: "757528963770",
    appId: "1:757528963770:web:b0a65e179d58b9e676b083",
    measurementId: "G-L8ZQK4DBF9"
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* Auth */
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(console.error);
    });
}

onAuthStateChanged(auth, user => {
    if(user) {
        // Whitelist check
        getDocs(query(collection(db, 'whitelist'), orderBy('email'))).then(snap => {
            const isWhitelisted = snap.docs.some(doc => doc.data().email === user.email);
            if(isWhitelisted) {
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('admin-panel').style.display = 'flex';
                loadConfigs();
                initPulseMonitor();
                initDashboardStats();
                initGalleryUpload();
            } else {
                document.getElementById('auth-status').textContent = "Access denied: " + user.email + " is not whitelisted.";
                signOut(auth);
            }
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
        alert("All spark data and history cleared!");
    } catch (e) { console.error(e); alert("Failed: " + e.message); }
}
window.clearSparkCounts = clearSparkCounts;

function initDashboardStats() {
    const sparksCountEl = document.getElementById('total-sparks-count');
    const visitsCountEl = document.getElementById('total-visits-count');
    const visitLogEl = document.getElementById('visit-log');

    onSnapshot(collection(db, 'spark_history'), snap => { if (sparksCountEl) sparksCountEl.textContent = snap.size; });
    onSnapshot(collection(db, 'site_visits'), snap => { if (visitsCountEl) visitsCountEl.textContent = snap.size; });

    onSnapshot(query(collection(db, 'site_visits'), orderBy('timestamp', 'desc'), limit(100)), snap => {
        if (!visitLogEl) return;
        if (snap.empty) { visitLogEl.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.5;">No visits...</div>'; return; }
        visitLogEl.innerHTML = '';
        snap.forEach(doc => {
            const v = doc.data(), date = v.timestamp?.toDate() || new Date();
            const item = document.createElement('div');
            item.className = 'visit-log-item';
            item.style.cssText = "padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;";
            item.innerHTML = `
                <div>
                    <div style="font-size:0.85rem;">${v.userName || "Friend"}</div>
                    <div style="font-size:0.7rem; opacity:0.7;">${v.userEmail || "No Email"}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:var(--accent-secondary);">${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    <div style="font-size:0.65rem; opacity:0.5;">${date.toLocaleDateString()}</div>
                </div>
            `;
            visitLogEl.appendChild(item);
        });
    });
}

function initPulseMonitor() {
    const log = document.getElementById('pulse-log');
    onSnapshot(query(collection(db, 'spark_history'), orderBy('timestamp', 'desc'), limit(100)), snap => {
        if (!log) return;
        if (snap.empty) { log.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5;">Waiting...</div>'; return; }
        log.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data(), date = new Date(p.timestamp);
            const item = document.createElement('div');
            item.style.cssText = "padding:15px; background:rgba(0,0,0,0.3); border:1px solid var(--card-border); border-radius:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;";
            item.innerHTML = `
                <div><span style="color:var(--accent-primary); font-weight:bold;">Spark Received ✨</span><div style="font-size:0.75rem; opacity:0.7;">${date.toLocaleString()}</div></div>
                <div style="text-align:right;"><div style="font-size:0.85rem;">${p.userName || "Friend"}</div><div style="font-size:0.7rem; opacity:0.7;">${p.userEmail || "No Email"}</div></div>
            `;
            log.appendChild(item);
        });
        const latest = snap.docs[0].data().timestamp;
        if (latest > lastPulseTime && lastPulseTime !== 0) showToast(`New Spark! ✨`, "success");
        lastPulseTime = latest;
    });
}

/* --- Optimized Media Processing --- */
async function processImage(file, type = 'thumb') {
    if (!file.type.startsWith('image')) return null;
    try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        let width = bitmap.width, height = bitmap.height;
        const MAX_DIM = (type === 'thumb') ? 400 : 2500;
        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', (type === 'thumb' ? 0.6 : 0.85)));
    } catch (e) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const max = (type === 'thumb') ? 400 : 2500;
                if (w > h) { if (w > max) { h *= max / w; w = max; } } else { if (h > max) { w *= max / h; h = max; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(resolve, 'image/jpeg', (type === 'thumb' ? 0.6 : 0.85));
            };
            img.src = URL.createObjectURL(file);
        });
    }
}

async function getVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            video.currentTime = Math.min(1, video.duration / 2);
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth / 4;
            canvas.height = video.videoHeight / 4;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(resolve, 'image/jpeg', 0.6);
            URL.revokeObjectURL(video.src);
        };
        video.onerror = () => resolve(null);
    });
}

function convertDMSToDD(dms, ref) {
    if (!dms) return null;
    let dd = dms[0] + dms[1]/60 + dms[2]/3600;
    if (ref === "S" || ref === "W") dd = dd * -1;
    return dd;
}

async function getExifData(file) {
    return new Promise((resolve) => {
        if (!window.EXIF || !file.type.startsWith('image')) return resolve({});
        EXIF.getData(file, function() {
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lon = EXIF.getTag(this, "GPSLongitude");
            const dateStr = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
            
            let data = {};
            if (lat && lon) {
                data.lat = convertDMSToDD(lat, EXIF.getTag(this, "GPSLatitudeRef"));
                data.lon = convertDMSToDD(lon, EXIF.getTag(this, "GPSLongitudeRef"));
            }
            if (dateStr) {
                // EXIF date is YYYY:MM:DD HH:MM:SS
                const parts = dateStr.split(' ');
                const dateParts = parts[0].split(':');
                data.date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], parts[1].split(':')[0], parts[1].split(':')[1], parts[1].split(':')[2]);
            }
            resolve(data);
        });
    });
}

/* Gallery Upload Management */
let uploadQueue = [];
let videoReviewQueue = [];
let reviewedDates = {};

function initGalleryUpload() {
    const dropZone = document.getElementById('drop-zone'), fileInput = document.getElementById('gallery-file');
    if (!dropZone || !fileInput) return;
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--card-border)'; };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--card-border)'; handleFiles(e.dataTransfer.files); };
}

function handleFiles(files) {
    const isPrivate = document.getElementById('gallery-private').checked;
    uploadQueue = [...uploadQueue, ...Array.from(files).map(f => ({ file: f, isPrivate }))];
    renderUploadPreview();
}

function renderUploadPreview() {
    const container = document.getElementById('upload-preview-container'); if (!container) return;
    container.innerHTML = '';
    if (uploadQueue.length === 0) { ['start-upload-btn', 'clear-queue-btn'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; }); return; }
    ['start-upload-btn', 'clear-queue-btn'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'inline-flex'; });
    const countEl = document.getElementById('queue-count'); if (countEl) countEl.textContent = uploadQueue.length;

    uploadQueue.forEach((item, i) => {
        const card = document.createElement('div'); card.className = 'upload-preview-card';
        card.style.cssText = "position:relative; width:120px; border-radius:12px; overflow:hidden; border:1px solid var(--card-border); background:#000; padding-bottom: 5px;";
        const isImg = item.file.type.startsWith('image');
        card.innerHTML = `
            ${isImg ? `<img src="${URL.createObjectURL(item.file)}" style="width:100%; height:100px; object-fit:cover;">` : `<div style="height:100px; display:flex; align-items:center; justify-content:center; font-size:2rem;">🎥</div>`}
            <div style="padding: 5px; display:flex; flex-direction:column; align-items:center; gap:5px;">
                <label style="margin:0; font-size:0.6rem; display:flex; align-items:center; gap:3px; cursor:pointer;">
                    <input type="checkbox" ${item.isPrivate ? 'checked' : ''} onchange="toggleIndividualPrivate(${i}, this.checked)" style="width:12px; height:12px; margin:0;">
                    Private
                </label>
            </div>
            <button onclick="removeFileFromQueue(${i})" style="position:absolute; top:5px; right:5px; border-radius:50%; background:rgba(255,0,0,0.7); color:white; border:none; cursor:pointer; width:18px; height:18px; font-size:10px; display:flex; align-items:center; justify-content:center;">✕</button>
        `;
        container.appendChild(card);
    });
}

window.toggleIndividualPrivate = (index, val) => {
    if (uploadQueue[index]) uploadQueue[index].isPrivate = val;
};

window.removeFileFromQueue = (index) => { uploadQueue.splice(index, 1); renderUploadPreview(); };
window.clearUploadQueue = () => { uploadQueue = []; renderUploadPreview(); };

export async function uploadGallery() {
    if(!uploadQueue.length) return;
    const status = document.getElementById('gallery-status'), progress = document.getElementById('gallery-progress'), fill = progress?.querySelector('.progress-fill');
    if (progress) progress.style.display = 'block';
    let completed = 0;
    
    await runWithConcurrency(uploadQueue.map(item => async () => {
        const file = item.file, ts = Date.now() + Math.floor(Math.random()*1000);
        let mainBlob = file, thumbBlob = null;
        let metadata = {};

        if (file.type.startsWith('image')) {
            [mainBlob, thumbBlob, metadata] = await Promise.all([
                processImage(file, 'original'), 
                processImage(file, 'thumb'),
                getExifData(file)
            ]);
        } else if (file.type.startsWith('video')) {
            thumbBlob = await getVideoThumbnail(file);
        }
        
        const mainRef = ref(storage, `gallery/${ts}_${file.name}`), thumbRef = ref(storage, `gallery/thumb_${ts}_${file.name}`);
        const [mainUrl, thumbUrl] = await Promise.all([
            (async () => { await uploadBytesResumable(mainRef, mainBlob); return getDownloadURL(mainRef); })(),
            (async () => { if(!thumbBlob) return null; await uploadBytesResumable(thumbRef, thumbBlob); return getDownloadURL(thumbRef); })()
        ]);

        const uploadData = { 
            src: mainUrl, 
            thumb: thumbUrl, 
            type: file.type.startsWith('video') ? 'video' : 'image', 
            date: metadata.date ? metadata.date.toISOString() : new Date(file.lastModified).toISOString(), 
            private: item.isPrivate, 
            filename: file.name, 
            timestamp: Date.now() 
        };
        
        if (metadata.lat && metadata.lon) {
            uploadData.lat = metadata.lat;
            uploadData.lon = metadata.lon;
        }

        await addDoc(collection(db, 'gallery'), uploadData);
        completed++;
        if (fill) fill.style.width = (completed / uploadQueue.length * 100) + '%';
        if (status) status.textContent = `Uploaded ${completed}/${uploadQueue.length}...`;
    }), 3);

    if (status) status.textContent = "Done!";
    uploadQueue = []; renderUploadPreview();
    setTimeout(() => { if(progress) progress.style.display = 'none'; }, 2000);
}
window.uploadGallery = uploadGallery;

/* --- Content Management --- */
let lastDoc = null, firstDoc = null, currentPage = 1;
const pageSize = 50;

export async function loadContentList(dir = 'first') {
    const col = document.getElementById('manage-collection').value, list = document.getElementById('manage-list'), info = document.getElementById('page-info');
    if (dir === 'first') { currentPage = 1; lastDoc = null; firstDoc = null; }
    list.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.5;">Loading archival records...</div>';
    
    try {
        let q;
        const baseQuery = collection(db, col);
        
        if (col === 'jokes') {
            // Special handling for jokes to avoid index issues with __name__
            if (dir === 'next' && lastDoc) q = query(baseQuery, orderBy('__name__'), startAfter(lastDoc), limit(pageSize));
            else if (dir === 'prev' && firstDoc) q = query(baseQuery, orderBy('__name__'), endBefore(firstDoc), limitToLast(pageSize));
            else q = query(baseQuery, limit(pageSize));
        } else {
            // Default timestamp ordering for other collections
            if (dir === 'next' && lastDoc) q = query(baseQuery, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(pageSize));
            else if (dir === 'prev' && firstDoc) q = query(baseQuery, orderBy('timestamp', 'desc'), endBefore(firstDoc), limitToLast(pageSize));
            else q = query(baseQuery, orderBy('timestamp', 'desc'), limit(pageSize));
        }

        const snap = await getDocs(q);
        if (snap.empty) {
            if (dir === 'next') { alert("End of collection."); currentPage--; return; }
            list.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.5;">No items found.</div>';
            updatePaginationUI(false, false); return;
        }

        firstDoc = snap.docs[0]; lastDoc = snap.docs[snap.docs.length - 1];
        if (info) info.textContent = `Page ${currentPage}`;
        
        // Simple check for next page
        let nextQ;
        if (col === 'jokes') nextQ = query(baseQuery, orderBy('__name__'), startAfter(lastDoc), limit(1));
        else nextQ = query(baseQuery, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(1));
        
        const nextSnap = await getDocs(nextQ);
        updatePaginationUI(currentPage > 1, !nextSnap.empty);
        renderList(snap, col);
    } catch (e) {
        console.error(e);
        list.innerHTML = `<div style="padding:20px; text-align:center; color:red;">Error: ${e.message}</div>`;
    }
}
window.loadContentList = loadContentList;

function updatePaginationUI(hasPrev, hasNext) {
    const p = document.getElementById('prev-page-btn'), n = document.getElementById('next-page-btn');
    if(p) { p.disabled = !hasPrev; p.style.opacity = hasPrev ? '1' : '0.3'; }
    if(n) { n.disabled = !hasNext; n.style.opacity = hasNext ? '1' : '0.3'; }
}

window.loadNextPage = () => { currentPage++; loadContentList('next'); };
window.loadPreviousPage = () => { if(currentPage > 1) { currentPage--; loadContentList('prev'); } };

function renderList(snap, col) {
    const list = document.getElementById('manage-list'); list.innerHTML = '';
    snap.forEach(d => {
        const data = d.data(), item = document.createElement('div');
        item.className = 'manage-item';
        item.style.cssText = "display:flex; align-items:center; padding:10px; border-bottom:1px solid var(--card-border); gap:15px;";
        
        let thumbHtml = '<div style="width:40px; height:40px; background:rgba(255,255,255,0.05); border-radius:4px;"></div>';
        if (col === 'gallery') {
            const src = data.thumb || data.src;
            thumbHtml = data.type === 'video' ? `<video src="${src}#t=0.1" style="width:40px; height:40px; object-fit:cover; border-radius:4px;" muted></video>` : `<img src="${src}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">`;
        } else if (col === 'memories') {
            const src = data.thumbs?.[0] || data.images?.[0] || '';
            if (src) thumbHtml = `<img src="${src}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">`;
        }

        item.innerHTML = `
            <input type="checkbox" class="item-checkbox" data-id="${d.id}" style="width:20px; height:20px;" onchange="updateSelectUI()">
            ${thumbHtml}
            <span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${data.title || data.filename || d.id}</span>
            <button class="btn-admin" style="margin:0; background:red; font-size:0.8rem; padding:5px 10px;" onclick="deleteItem('${col}', '${d.id}')">Delete</button>
        `;
        list.appendChild(item);
    });
    updateSelectUI();
}

function updateSelectUI() {
    const checked = document.querySelectorAll('.item-checkbox:checked'), btn = document.getElementById('delete-selected-btn'), count = document.getElementById('select-count');
    if (count) count.textContent = checked.length;
    if (btn) btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
}
window.updateSelectUI = updateSelectUI;

window.toggleSelectAll = () => {
    const boxes = document.querySelectorAll('.item-checkbox'), allChecked = Array.from(boxes).every(b => b.checked);
    boxes.forEach(b => b.checked = !allChecked);
    updateSelectUI();
};

window.deleteSelectedItems = async () => {
    const col = document.getElementById('manage-collection').value, checked = document.querySelectorAll('.item-checkbox:checked');
    if (!checked.length || !confirm(`Delete ${checked.length} items?`)) return;
    const batch = writeBatch(db);
    checked.forEach(cb => batch.delete(doc(db, col, cb.dataset.id)));
    await batch.commit();
    loadContentList();
};

window.deleteItem = async (col, id) => {
    if(confirm("Delete?")) { await deleteDoc(doc(db, col, id)); loadContentList(); }
};

window.signOutUser = async () => {
    try {
        await signOut(auth);
        location.reload();
    } catch (e) { console.error(e); }
};

window.migrateAll = async () => {
    const log = document.getElementById('migration-log'); if(!log) return;
    log.innerHTML = 'Starting migration...<br>';
    const addLog = (m) => { log.innerHTML += `${m}<br>`; log.scrollTop = log.scrollHeight; };

    try {
        const [memories, gallery, jokes] = await Promise.all([
            fetch('assets/memories_photos/memories.json').then(r => r.json()),
            fetch('update_data.js').then(r => r.text()).then(t => {
                const match = t.match(/const GALLERY_DATA = (\[[\s\S]*?\]);/);
                return match ? eval(match[1]) : [];
            }),
            fetch('assets/jokes/jokes.json').then(r => r.json())
        ]);

        addLog(`Found: ${memories.length} memories, ${gallery.length} gallery items, ${jokes.length} jokes.`);

        // Migrate Gallery
        for (const item of gallery) {
            const upload = { ...item, timestamp: item.date ? new Date(item.date).getTime() : Date.now() };
            await addDoc(collection(db, 'gallery'), upload);
            addLog(`Migrated gallery: ${item.filename || item.src}`);
        }

        // Migrate Memories
        for (const item of memories) {
            await addDoc(collection(db, 'memories'), { ...item.meta, folder: item.folder, timestamp: Date.now() });
            addLog(`Migrated memory: ${item.meta.title}`);
        }

        // Migrate Jokes
        for (const joke of jokes) {
            await addDoc(collection(db, 'jokes'), { ...joke, timestamp: Date.now() });
            addLog(`Migrated joke: ${joke.title}`);
        }

        addLog('<strong>Migration Complete!</strong>');
    } catch(e) { addLog(`<span style="color:red">Error: ${e.message}</span>`); }
};

async function uploadMemory() {
    const title = document.getElementById('mem-title').value, text = document.getElementById('mem-text').value, date = document.getElementById('mem-date').value, themeColor = document.getElementById('mem-color').value, imageFiles = Array.from(document.getElementById('mem-images').files), videoFile = document.getElementById('mem-video').files[0], audioFile = document.getElementById('mem-audio').files[0], isPrivate = document.getElementById('mem-private').checked;
    if(!title) return alert("Title is required.");
    
    const status = document.getElementById('mem-status'), progress = document.getElementById('mem-progress'), progressFill = progress?.querySelector('.progress-fill');
    if(progress) progress.style.display = 'block'; status.textContent = "Processing and uploading...";
    
    let imageUrls = [], thumbUrls = [], videoUrl = null, audioUrl = null;
    const totalItems = imageFiles.length + (videoFile ? 1 : 0) + (audioFile ? 1 : 0);
    let completed = 0;
    const updateProg = () => { completed++; if(progressFill) progressFill.style.width = (completed / totalItems * 100) + '%'; };

    await runWithConcurrency(imageFiles.map(file => async () => {
        const ts = Date.now() + Math.floor(Math.random() * 1000);
        const [mainBlob, thumbBlob] = await Promise.all([processImage(file, 'original'), processImage(file, 'thumb')]);
        const mRef = ref(storage, `memories/${ts}_${file.name}`), tRef = ref(storage, `memories/thumb_${ts}_${file.name}`);
        const [mUrl, tUrl] = await Promise.all([
            (async () => { await uploadBytesResumable(mRef, mainBlob); return getDownloadURL(mRef); })(),
            (async () => { await uploadBytesResumable(tRef, thumbBlob); return getDownloadURL(tRef); })()
        ]);
        imageUrls.push(mUrl); thumbUrls.push(tUrl); 
        updateProg();
    }), 3);

    if(videoFile) {
        const ts = Date.now(), vRef = ref(storage, `memories/${ts}_${videoFile.name}`);
        await uploadBytesResumable(vRef, videoFile); videoUrl = await getDownloadURL(vRef);
        const tBlob = await getVideoThumbnail(videoFile);
        if(tBlob) { 
            const vtRef = ref(storage, `memories/vthumb_${ts}.jpg`); 
            await uploadBytesResumable(vtRef, tBlob); 
            thumbUrls.unshift(await getDownloadURL(vtRef)); 
        }
        updateProg();
    }
    if(audioFile) { 
        const aRef = ref(storage, `memories/${Date.now()}_${audioFile.name}`); 
        await uploadBytesResumable(aRef, audioFile); 
        audioUrl = await getDownloadURL(aRef); 
        updateProg(); 
    }

    const payload = { title, text, private: isPrivate, timestamp: Date.now() };
    if (date) payload.date = date; if (imageUrls.length > 0) payload.images = imageUrls; if (thumbUrls.length > 0) payload.thumbs = thumbUrls; if (themeColor && themeColor !== '#ffffff') payload.themeColor = themeColor; if (videoUrl) payload.video = videoUrl; if (audioUrl) payload.audio = audioUrl;
    
    await addDoc(collection(db, 'memories'), payload);
    status.textContent = "Memory Created Successfully!";
    setTimeout(() => { if(progressFill) progressFill.style.width = '0%'; if(progress) progress.style.display = 'none'; }, 2000);
}
window.uploadMemory = uploadMemory;

async function addJoke() {
    const title = document.getElementById('joke-title').value, text = document.getElementById('joke-text').value, tier = parseInt(document.getElementById('joke-size').value);
    await addDoc(collection(db, 'jokes'), { title, text, sizeTier: tier, timestamp: Date.now() });
    document.getElementById('joke-status').textContent = "Joke Added!";
    document.getElementById('joke-title').value = ''; document.getElementById('joke-text').value = '';
}
window.addJoke = addJoke;

async function updateAloneText() {
    const text = document.getElementById('alone-input').value.trim();
    await setDoc(doc(db, 'config', 'feelingLow'), { aloneText: text, updatedAt: Date.now() }, { merge: true });
    alert("Message updated!");
}
window.updateAloneText = updateAloneText;

async function updateLetter() {
    const text = document.getElementById('letter-input').value.trim(), closingLine = document.getElementById('letter-closing-input').value.trim();
    await setDoc(doc(db, 'config', 'letter'), { text, closingLine, updatedAt: Date.now() }, { merge: true });
    alert("Home Note updated!");
}
window.updateLetter = updateLetter;

async function uploadFamiliarSound() {
    const file = document.getElementById('familiar-audio-file').files[0], title = document.getElementById('familiar-title').value.trim(), mood = document.getElementById('familiar-mood').value, status = document.getElementById('low-status');
    if(!file || !title) return alert("Select file and title.");
    status.textContent = "Uploading song...";
    const ts = Date.now(), sRef = ref(storage, `familiar_sounds/${ts}_${file.name}`);
    await uploadBytesResumable(sRef, file);
    const url = await getDownloadURL(sRef);
    await addDoc(collection(db, 'familiar_sounds'), { title, mood, src: url, timestamp: ts, filename: file.name });
    status.textContent = "Song added!";
}
window.uploadFamiliarSound = uploadFamiliarSound;

async function uploadHomeVideo() {
    const videoFile = document.getElementById('home-video').files[0], thumbFile = document.getElementById('home-thumb').files[0];
    if(!videoFile) return alert("Select a video");
    const status = document.getElementById('home-status'), progress = document.getElementById('home-progress'), fill = progress?.querySelector('.progress-fill');
    if(progress) progress.style.display = 'block';
    if(fill) fill.style.width = '10%';
    
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const ts = Date.now();
    let vUrl, tUrl = null;

    try {
        if (isLocal) {
            // ... (keep local logic as is)
        } else {
            console.log("1. Starting Vercel Blob handshake for:", videoFile.name);
            status.textContent = "Connecting to Vercel (Handshake)...";
            
            try {
                const vBlob = await upload(`intro_video_${ts}.mp4`, videoFile, {
                    access: 'public',
                    handleUploadUrl: '/api/upload',
                    onUploadProgress: (p) => { 
                        if (p.percentage === 0) console.log("1.5. Token received! Browser is now buffering/starting data stream...");
                        const percent = (p.percentage).toFixed(2);
                        console.log(`2. Uploading Data: ${percent}%`);
                        if(fill) fill.style.width = (10 + p.percentage * 0.7) + '%'; 
                        status.textContent = `Uploading: ${percent}% (150MB takes time)...`;
                    }
                });
                console.log("3. Video upload complete! URL:", vBlob.url);
                vUrl = vBlob.url;
            } catch (err) {
                console.error("Blob Upload Step Failed:", err);
                throw err;
            }

            if (thumbFile) {
                status.textContent = "Uploading thumbnail...";
                const tBlob = await upload(`intro_thumb_${ts}`, thumbFile, {
                    access: 'public',
                    handleUploadUrl: '/api/upload'
                });
                tUrl = tBlob.url;
            } else {
                status.textContent = "Generating thumbnail...";
                const tBlobFile = await getVideoThumbnail(videoFile);
                if (tBlobFile) {
                    const vtBlob = await upload(`intro_thumb_auto_${ts}.jpg`, tBlobFile, {
                        access: 'public',
                        handleUploadUrl: '/api/upload'
                    });
                    tUrl = vtBlob.url;
                }
            }
        }

        // Update Firestore so the frontend points to the correct location (local or cloud)
        await setDoc(doc(db, 'config', 'home'), { 
            introVideo: vUrl, 
            introVideoThumbnail: tUrl, 
            updatedAt: ts,
            storageType: isLocal ? 'local' : 'vercel-blob' 
        }, { merge: true });

        if(fill) fill.style.width = '100%';
        status.textContent = isLocal ? "Local Video Replaced! ✨" : "Home Content Updated! (Vercel Edge)";
        setTimeout(() => { if(progress) progress.style.display = 'none'; loadConfigs(); }, 2000);
    } catch (error) {
        console.error("Upload failed", error);
        status.textContent = "Error: " + error.message;
        if(progress) progress.style.display = 'none';
        alert("Make sure the local server is running (npm start) if you are on localhost!");
    }
}
window.uploadHomeVideo = uploadHomeVideo;

/* --- Configs --- */
async function loadConfigs() {
    try {
        const [email, home, low, letter] = await Promise.all([
            getDoc(doc(db, 'config', 'emailjs')), getDoc(doc(db, 'config', 'home')),
            getDoc(doc(db, 'config', 'feelingLow')), getDoc(doc(db, 'config', 'letter'))
        ]);
        if (email.exists()) { const d = email.data(); document.getElementById('emailjs-public-key').value = d.publicKey || ''; document.getElementById('emailjs-service-id').value = d.serviceID || ''; document.getElementById('emailjs-template-id').value = d.templateID || ''; }
        if (home.exists()) { const d = home.data(), pre = document.getElementById('home-current-preview'); if(pre) pre.innerHTML = `📹 <a href="${d.introVideo}" target="_blank">Current Video</a>` + (d.introVideoThumbnail ? ` | 🖼️ <a href="${d.introVideoThumbnail}" target="_blank">Current Thumb</a>` : ''); }
        if (low.exists()) { const d = low.data(); if (document.getElementById('alone-input')) document.getElementById('alone-input').value = d.aloneText || ''; }
        if (letter.exists()) { const d = letter.data(); if (document.getElementById('letter-input')) document.getElementById('letter-input').value = d.text || ''; if (document.getElementById('letter-closing-input')) document.getElementById('letter-closing-input').value = d.closingLine || ''; }
    } catch(e) { console.warn("Error loading configs", e); }
}

window.saveEmailJSConfig = async () => {
    const publicKey = document.getElementById('emailjs-public-key').value, serviceID = document.getElementById('emailjs-service-id').value, templateID = document.getElementById('emailjs-template-id').value;
    await setDoc(doc(db, 'config', 'emailjs'), { publicKey, serviceID, templateID, updatedAt: Date.now() }, { merge: true });
    showToast("EmailJS Config Saved!", "success");
};
