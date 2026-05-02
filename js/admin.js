import { auth, db, storage, initTheme } from "./main.js";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, setDoc, doc, getDoc, getDocs, updateDoc, increment, serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch, deleteField, FieldPath, deleteDoc, startAfter, endBefore, limitToLast, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
                recalculateStats(); // Sync stats on load
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

export async function recalculateStats() {
    try {
        const [sparkSnap, visitSnap] = await Promise.all([
            getCountFromServer(collection(db, 'spark_history')),
            getCountFromServer(collection(db, 'site_visits'))
        ]);
        
        const totalSparks = sparkSnap.data().count;
        const totalVisits = visitSnap.data().count;
        
        await setDoc(doc(db, 'config', 'stats'), {
            totalSparks,
            totalVisits,
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        console.log("Stats recalculated:", { totalSparks, totalVisits });
    } catch (e) {
        console.error("Failed to recalculate stats:", e);
    }
}
window.recalculateStats = recalculateStats;

export async function clearSparkCounts() {
    if (!confirm("Are you sure you want to clear all spark counts and history?")) return;
    try {
        const batch = writeBatch(db);
        const usersSnap = await getDocs(collection(db, 'user_data'));
        usersSnap.forEach(d => batch.update(d.ref, { pulseCount: 0, lastPulse: deleteField() }));
        
        const historySnap = await getDocs(query(collection(db, 'spark_history'), limit(400)));
        historySnap.forEach(d => batch.delete(d.ref));
        
        batch.set(doc(db, 'config', 'stats'), { totalSparks: 0 }, { merge: true });
        
        await batch.commit();
        await recalculateStats(); 
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
        } else {
            if (sparksCountEl) sparksCountEl.textContent = 0;
            if (visitsCountEl) visitsCountEl.textContent = 0;
        }
    });

    onSnapshot(query(collection(db, 'site_visits'), orderBy('timestamp', 'desc'), limit(15)), snap => {
        if (!visitLogEl) return;
        visitLogEl.innerHTML = '';
        snap.forEach(doc => {
            const v = doc.data();
            const rawTs = v.timestamp;
            const date = (rawTs && typeof rawTs.toDate === 'function') ? rawTs.toDate() : new Date(rawTs || Date.now());
            const item = document.createElement('div');
            item.style.cssText = "padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 10px; margin-bottom: 5px;";
            item.innerHTML = `<strong>${v.userName || 'Unknown User'}</strong> <span style="font-size: 0.7rem; opacity: 0.6;">(${v.userEmail || 'No Email'})</span> <br><small>${date.toLocaleString()}</small>`;
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
            const p = doc.data();
            const rawTs = p.timestamp;
            const date = (rawTs && typeof rawTs.toDate === 'function') ? rawTs.toDate() : new Date(rawTs || Date.now());
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
                if (parts.length >= 2) {
                    const dateParts = parts[0].split(':');
                    const timeParts = parts[1].split(':');
                    data.date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
                }
            }
            resolve(data);
        });
    });
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
    
    // Separate videos for review
    videoReviewQueue = uploadQueue.filter(item => item.file.type.startsWith('video')).map(item => item.file);
    reviewedDates = {};

    if (videoReviewQueue.length > 0) {
        processVideoReviewQueue();
    } else {
        startGalleryUpload();
    }
}
window.uploadGallery = uploadGallery;

function processVideoReviewQueue() {
    if (videoReviewQueue.length === 0) {
        document.getElementById('video-review-modal').style.display = 'none';
        startGalleryUpload();
        return;
    }

    const file = videoReviewQueue[0];
    const modal = document.getElementById('video-review-modal');
    const player = document.getElementById('review-video-player');
    const dateInput = document.getElementById('review-date-input');
    const confirmBtn = document.getElementById('review-confirm-btn');

    if (!modal || !player || !dateInput || !confirmBtn) {
        startGalleryUpload();
        return;
    }

    modal.style.display = 'flex';
    document.getElementById('review-title').textContent = `Review Video (${videoReviewQueue.length} Left)`;
    document.getElementById('review-filename').textContent = file.name;
    
    const fileUrl = URL.createObjectURL(file);
    player.src = fileUrl;
    player.load();

    // Try to auto-suggest date
    const dateToUse = new Date(file.lastModified);
    const offset = dateToUse.getTimezoneOffset() * 60000;
    dateInput.value = new Date(dateToUse - offset).toISOString().slice(0, 16);

    confirmBtn.onclick = () => {
        reviewedDates[file.name] = dateInput.value ? new Date(dateInput.value).toISOString() : new Date(file.lastModified).toISOString();
        URL.revokeObjectURL(fileUrl);
        videoReviewQueue.shift();
        processVideoReviewQueue();
    };
}

async function startGalleryUpload() {
    const status = document.getElementById('gallery-status'), progress = document.getElementById('gallery-progress'), fill = progress?.querySelector('.progress-fill');
    if (progress) progress.style.display = 'block';
    let completed = 0;
    
    await runWithConcurrency(uploadQueue.map(item => async () => {
        const file = item.file, ts = Date.now() + Math.floor(Math.random()*1000);
        let mainBlob = file, thumbBlob = item.thumbBlob;
        let metadata = {};

        if (file.type.startsWith('image')) {
            const [processedMain, processedThumb, exif] = await Promise.all([
                processImage(file, 'original'),
                processImage(file, 'thumb'),
                getExifData(file)
            ]);
            mainBlob = processedMain;
            thumbBlob = processedThumb;
            metadata = exif;
        } else if (file.type.startsWith('video')) {
            if (!thumbBlob) thumbBlob = await getVideoThumbnail(file);
        }

        const mainRef = ref(storage, `gallery/${ts}_${file.name}`), thumbRef = ref(storage, `gallery/thumb_${ts}_${file.name}`);
        const [mainUrl, thumbUrl] = await Promise.all([
            (async () => { await uploadBytesResumable(mainRef, mainBlob); return getDownloadURL(mainRef); })(),
            (async () => { if(!thumbBlob) return null; await uploadBytesResumable(thumbRef, thumbBlob); return getDownloadURL(thumbRef); })()
        ]);

        // Use reviewed date if available, otherwise use metadata date or file modified date
        const finalDate = reviewedDates[file.name] || (metadata.date ? metadata.date.toISOString() : new Date(file.lastModified).toISOString());

        const uploadData = { 
            src: mainUrl, 
            thumb: thumbUrl, 
            type: file.type.startsWith('video') ? 'video' : 'image', 
            date: finalDate,
            private: item.isPrivate, 
            filename: file.name, 
            timestamp: Date.now() 
        };
        
        if (metadata.lat && metadata.lon) {
            uploadData.lat = metadata.lat;
            uploadData.lon = metadata.lon;
        }

        await addDoc(collection(db, 'gallery'), uploadData);
        
        // Cleanup preview URL
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);

        completed++;
        if (fill) fill.style.width = (completed / uploadQueue.length * 100) + '%';
        if (status) status.textContent = `Uploaded ${completed}/${uploadQueue.length}...`;
    }), 3);

    if (status) status.textContent = "Done!";
    uploadQueue = []; renderUploadPreview();
    setTimeout(() => { if(progress) progress.style.display = 'none'; }, 2000);
}

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

async function deleteFilesForDoc(col, id, data) {
    const filePromises = [];
    const getRefFromUrl = (url) => {
        if (!url || typeof url !== 'string') return null;
        if (url.includes('firebasestorage.googleapis.com')) return ref(storage, url);
        return null;
    };

    // Main media
    const primaryRef = getRefFromUrl(data.src || data.videoUrl || data.video);
    if (primaryRef) filePromises.push(deleteObject(primaryRef).catch(e => console.warn("Storage delete failed (primary):", e)));

    // Thumbnails
    const thumbRef = getRefFromUrl(data.thumb || data.thumbnailUrl);
    if (thumbRef) filePromises.push(deleteObject(thumbRef).catch(e => console.warn("Storage delete failed (thumb):", e)));

    // Memory Images/Thumbs
    if (data.images && Array.isArray(data.images)) {
        data.images.forEach(img => {
            const r = getRefFromUrl(img);
            if (r) filePromises.push(deleteObject(r).catch(e => console.warn("Storage delete failed (mem-img):", e)));
        });
    }
    if (data.thumbs && Array.isArray(data.thumbs)) {
        data.thumbs.forEach(t => {
            const r = getRefFromUrl(t);
            if (r) filePromises.push(deleteObject(r).catch(e => console.warn("Storage delete failed (mem-thumb):", e)));
        });
    }

    // Audio
    const audioRef = getRefFromUrl(data.audio);
    if (audioRef) filePromises.push(deleteObject(audioRef).catch(e => console.warn("Storage delete failed (audio):", e)));

    await Promise.all(filePromises);
}

window.deleteItem = async (col, id) => {
    if(!confirm("Permanently delete this item and its files?")) return;
    try {
        const docRef = doc(db, col, id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            await deleteFilesForDoc(col, id, snap.data());
        }
        await deleteDoc(docRef);

        // Cleanup associated data
        if (col === 'memories' || col === 'gallery') {
            const commentQuery = query(collection(db, 'memory_comments'), where('memoryId', '==', id));
            const commentSnap = await getDocs(commentQuery);
            const deletePromises = commentSnap.docs.map(d => deleteDoc(d.ref));
            deletePromises.push(deleteDoc(doc(db, 'shared_profile_data', `cherished_${id}`)));
            deletePromises.push(deleteDoc(doc(db, 'shared_profile_data', `vibe_${id}`)));
            await Promise.all(deletePromises);
        }

        showToast("Deleted!", "success");
        loadContentList();
    } catch (e) {
        console.error("Delete failed", e);
        showToast("Delete failed", "error");
    }
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
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                await deleteFilesForDoc(col, id, snap.data());
            }
            batch.delete(docRef);
            
            if (col === 'memories' || col === 'gallery') {
                const commentSnap = await getDocs(query(collection(db, 'memory_comments'), where('memoryId', '==', id)));
                commentSnap.forEach(d => batch.delete(d.ref));
                batch.delete(doc(db, 'shared_profile_data', `cherished_${id}`));
                batch.delete(doc(db, 'shared_profile_data', `vibe_${id}`));
            }
        }
        await batch.commit();
        showToast("Batch delete successful!", "success");
        loadContentList();
    } catch (e) {
        console.error("Batch delete failed", e);
        showToast("Some items failed to delete", "error");
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
window.uploadMemory = async () => {
    const title = document.getElementById('mem-title').value;
    const text = document.getElementById('mem-text').value;
    const backstory = document.getElementById('mem-backstory').value;
    const date = document.getElementById('mem-date').value;
    const audioName = document.getElementById('mem-audio-name').value;
    const mediaFiles = Array.from(document.getElementById('mem-media').files);
    const audioFile = document.getElementById('mem-audio').files[0];
    const isPrivate = document.getElementById('mem-private').checked;

    if(!title) return alert("Title is required.");
    if(mediaFiles.length === 0) return alert("Please select at least one photo or video.");
    
    const status = document.getElementById('mem-status');
    const progress = document.getElementById('mem-progress');
    const progressFill = progress?.querySelector('.progress-fill');
    
    if(progress) progress.style.display = 'block';
    status.textContent = "Analyzing and uploading media...";
    
    let imageUrls = [], thumbUrls = [], videoUrl = null, audioUrl = null;
    const totalItems = mediaFiles.length + (audioFile ? 1 : 0);
    let completed = 0;
    const updateProg = () => { completed++; if(progressFill) progressFill.style.width = (completed / totalItems * 100) + '%'; };

    // Sort files to keep videos first (optional, based on preference)
    mediaFiles.sort((a, b) => b.type.startsWith('video') - a.type.startsWith('video'));

    await runWithConcurrency(mediaFiles.map(file => async () => {
        const ts = Date.now() + Math.floor(Math.random() * 1000);
        const isVideo = file.type.startsWith('video');
        
        if (isVideo) {
            // Process Video
            const vRef = ref(storage, `memories/${ts}_${file.name}`);
            await uploadBytesResumable(vRef, file);
            const downloadUrl = await getDownloadURL(vRef);
            
            // If it's the first video, set it as the main 'video' field
            if (!videoUrl) videoUrl = downloadUrl;
            
            // Generate and upload thumbnail
            const tBlob = await getVideoThumbnail(file);
            if (tBlob) {
                const vtRef = ref(storage, `memories/vthumb_${ts}.jpg`);
                await uploadBytesResumable(vtRef, tBlob);
                const tUrl = await getDownloadURL(vtRef);
                thumbUrls.push(tUrl);
            }
        } else {
            // Process Image
            const [mainBlob, thumbBlob] = await Promise.all([
                processImage(file, 'original'), 
                processImage(file, 'thumb')
            ]);
            const mRef = ref(storage, `memories/${ts}_${file.name}`);
            const tRef = ref(storage, `memories/thumb_${ts}_${file.name}`);
            
            const [mUrl, tUrl] = await Promise.all([
                (async () => { await uploadBytesResumable(mRef, mainBlob); return getDownloadURL(mRef); })(),
                (async () => { if(!thumbBlob) return null; await uploadBytesResumable(tRef, thumbBlob); return getDownloadURL(tRef); })()
            ]);
            
            imageUrls.push(mUrl);
            thumbUrls.push(tUrl);
        }
        
        updateProg();
    }), 2); // Concurrency 2 for heavy media

    if(audioFile) { 
        status.textContent = "Uploading background music...";
        const aRef = ref(storage, `memories/${Date.now()}_${audioFile.name}`); 
        await uploadBytesResumable(aRef, audioFile); 
        audioUrl = await getDownloadURL(aRef); 
        updateProg(); 
    }

    const payload = { 
        title, 
        text, 
        backstory,
        audioName,
        private: isPrivate, 
        timestamp: Date.now() 
    };

    if (date) payload.date = date; 
    if (imageUrls.length > 0) payload.images = imageUrls; 
    if (thumbUrls.length > 0) payload.thumbs = thumbUrls; 
    if (videoUrl) payload.video = videoUrl; // Primary video
    if (audioUrl) payload.audio = audioUrl; // Background music
    
    await addDoc(collection(db, 'memories'), payload);
    
    status.textContent = "Reel Memory Created Successfully! ✨";
    setTimeout(() => { 
        if(progressFill) progressFill.style.width = '0%'; 
        if(progress) progress.style.display = 'none'; 
        // Clear fields
        ['mem-title', 'mem-text', 'mem-backstory', 'mem-audio-name', 'mem-media', 'mem-audio'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
    }, 3000);
};

window.uploadFamiliarSound = async () => {
    const file = document.getElementById('familiar-audio-file').files[0], title = document.getElementById('familiar-title').value.trim(), mood = document.getElementById('familiar-mood').value, status = document.getElementById('low-status');
    if(!file || !title) return alert("Select file and title.");
    status.textContent = "Uploading song...";
    const ts = Date.now(), sRef = ref(storage, `familiar_sounds/${ts}_${file.name}`);
    await uploadBytesResumable(sRef, file);
    const url = await getDownloadURL(sRef);
    await addDoc(collection(db, 'familiar_sounds'), { title, mood, src: url, timestamp: ts, filename: file.name });
    status.textContent = "Song added!";
};
