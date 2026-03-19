
// Initialize Firebase manually since main.js might skip it on admin page
if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
    try {
        firebase.firestore().settings({ experimentalForceLongPolling: true, merge: true });
    } catch(se) { console.warn("Firestore settings already set"); }
}

const app = firebase.app(); 
const auth = app.auth();
const db = app.firestore();
const storage = app.storage();

/* Auth */
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    });
}

auth.onAuthStateChanged(user => {
    if(user) {
        db.collection('whitelist').where('email', '==', user.email).get().then(snap => {
            if(!snap.empty) {
                const authContainer = document.getElementById('auth-container');
                const adminPanel = document.getElementById('admin-panel');
                if (authContainer) authContainer.style.display = 'none';
                if (adminPanel) adminPanel.style.display = 'flex';

                loadConfigs();
                initPulseMonitor(); // Real-time connection signal
                initDashboardStats(); // Real-time stats
                initGalleryUpload(); // Initialize Drag & Drop
            } else {
                const authStatus = document.getElementById('auth-status');
                if (authStatus) authStatus.textContent = "Access denied: " + user.email + " is not whitelisted.";
                auth.signOut();
            }
        });
    } else {
        const authContainer = document.getElementById('auth-container');
        const adminPanel = document.getElementById('admin-panel');
        if (authContainer) authContainer.style.display = 'block';
        if (adminPanel) adminPanel.style.display = 'none';
    }
});

/* --- Sidebar Navigation --- */
function showSection(sectionId) {
    // Update Sidebar
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.section === sectionId) li.classList.add('active');
    });

    // Update Content
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    const activeSection = document.getElementById(sectionId);
    if (activeSection) activeSection.classList.add('active');

    // Section specific loads
    if (sectionId === 'manage-content') {
        loadContentList();
    }
}
window.showSection = showSection;

/* --- Pulse Monitor (Real-time Listening) --- */
let lastPulseTime = 0;

async function clearSparkCounts() {
    if (!confirm("Are you sure you want to clear all spark counts and history? This will reset the counter for all users and wipe the pulse log.")) return;
    
    try {
        const batch = db.batch();
        const usersSnap = await db.collection('user_data').get();
        usersSnap.forEach(doc => {
            batch.update(doc.ref, { pulseCount: 0, lastPulse: firebase.firestore.FieldValue.delete() });
        });

        const historySnap = await db.collection('spark_history').limit(400).get();
        historySnap.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        alert("All spark data and history cleared!");
    } catch (e) {
        console.error("Error clearing sparks:", e);
        alert("Failed to clear sparks: " + e.message);
    }
}
window.clearSparkCounts = clearSparkCounts;

function initDashboardStats() {
    const sparksCountEl = document.getElementById('total-sparks-count');
    const visitsCountEl = document.getElementById('total-visits-count');
    const visitLogEl = document.getElementById('visit-log');

    // Watch Sparks Count
    db.collection('spark_history').onSnapshot(snap => {
        if (sparksCountEl) sparksCountEl.textContent = snap.size;
    });

    // Watch Visits Count and Log
    db.collection('site_visits').orderBy('timestamp', 'desc').limit(50).onSnapshot(snap => {
        if (visitsCountEl) visitsCountEl.textContent = snap.size;
        
        if (visitLogEl) {
            if (snap.empty) {
                visitLogEl.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted); opacity: 0.5;">No visits recorded yet...</div>`;
                return;
            }

            visitLogEl.innerHTML = '';
            snap.forEach(doc => {
                const v = doc.data();
                const date = v.timestamp ? v.timestamp.toDate() : new Date();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = date.toLocaleDateString();

                const item = document.createElement('div');
                item.style.cssText = "padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--card-border); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;";
                item.innerHTML = `
                    <div style="flex-grow: 1;">
                        <div style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">${v.userName || "Friend"}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.7;">${v.userEmail || "No Email"}</div>
                    </div>
                    <div style="text-align: right; min-width: 80px;">
                        <div style="font-size: 0.75rem; color: var(--accent-secondary); font-weight: bold;">${timeStr}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">${dateStr}</div>
                    </div>
                `;
                visitLogEl.appendChild(item);
            });
        }
    });
}

function initPulseMonitor() {
    const log = document.getElementById('pulse-log');
    db.collection('spark_history').orderBy('timestamp', 'desc').limit(100).onSnapshot((snap) => {
        const pulses = [];
        snap.forEach(doc => pulses.push(doc.data()));

        if (pulses.length > 0) {
            if (log) {
                log.innerHTML = '';
                pulses.forEach(p => {
                    const date = new Date(p.timestamp);
                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const item = document.createElement('div');
                    item.style.cssText = "padding: 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;";
                    if (p.timestamp === pulses[0].timestamp) item.style.animation = "pulseGlow 2s infinite";
                    item.innerHTML = `
                        <div>
                            <span style="color: var(--accent-primary); font-weight: bold;">Spark Received ✨</span>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${date.toLocaleDateString()} at ${timeStr}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">${p.userName || "Friend"}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.7;">${p.userEmail || "No Email"}</div>
                        </div>
                    `;
                    log.appendChild(item);
                });
            }
            if (pulses[0].timestamp > lastPulseTime && lastPulseTime !== 0) {
                if (typeof showToast === 'function') showToast(`New Spark from ${pulses[0].userName || "Friend"}! ✨`, "success");
            }
            lastPulseTime = pulses[0].timestamp;
        } else if (log) {
            log.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); opacity: 0.5;">Waiting for a spark...</div>`;
        }
    });
}

/* --- Optimized Image Processor --- */
async function processImage(file, type = 'thumb') {
    if (!file.type.startsWith('image')) return null;
    
    try {
        // Modern createImageBitmap is faster than new Image() + onload
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        let width = bitmap.width, height = bitmap.height;
        const MAX_DIM = (type === 'thumb') ? 400 : 2500;

        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }

        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close(); // Free memory

        return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', (type === 'thumb' ? 0.6 : 0.85)));
    } catch (e) {
        console.warn("ImageBitmap failed, falling back to legacy Image", e);
        return legacyProcessImage(file, type);
    }
}

async function legacyProcessImage(file, type = 'thumb') {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const MAX_DIM = (type === 'thumb') ? 400 : 2500;
                if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
                else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, 'image/jpeg', (type === 'thumb' ? 0.6 : 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/* Video Metadata Helper */
async function getVideoMetadata(file) {
    const scanBuffer = (buffer) => {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(buffer);
        const dateRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}/;
        const dateMatch = text.match(dateRegex);
        const gpsRegex = /([+-]\d{2,3}\.\d+)([+-]\d{2,3}\.\d+)\//;
        const gpsMatch = text.match(gpsRegex);

        let result = {};
        if (dateMatch) result.date = dateMatch[0];
        if (gpsMatch) { result.lat = parseFloat(gpsMatch[1]); result.lon = parseFloat(gpsMatch[2]); }
        if (result.date || result.lat) return result;

        const view = new DataView(buffer);
        for (let i = 0; i < view.byteLength - 4; i++) {
            if (view.getUint8(i) === 109 && view.getUint8(i+1) === 118 && view.getUint8(i+2) === 104 && view.getUint8(i+3) === 100) {
                const version = view.getUint8(i+4);
                const timeOffset = i + 4 + 1 + 3;
                let macTime;
                if(version === 1) macTime = (view.getUint32(timeOffset) * Math.pow(2, 32)) + view.getUint32(timeOffset + 4);
                else macTime = view.getUint32(timeOffset);
                const unixTime = (macTime - 2082844800) * 1000;
                if (unixTime > 0 && !result.date) result.date = new Date(unixTime).toISOString();
            }
        }
        return (result.date || result.lat) ? result : null;
    };
    let buffer = await file.slice(0, 256 * 1024).arrayBuffer();
    let meta = scanBuffer(buffer);
    if (meta) return meta;
    if (file.size > 256 * 1024) {
        buffer = await file.slice(file.size - (256 * 1024), file.size).arrayBuffer();
        meta = scanBuffer(buffer);
        if (meta) return meta;
    }
    return {};
}

/* Gallery Upload Management */
let uploadQueue = [];
let videoReviewQueue = [];
let reviewedDates = {};

function initGalleryUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('gallery-file');
    if (!dropZone || !fileInput) return;
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; dropZone.style.background = 'rgba(255,255,255,0.05)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--card-border)'; dropZone.style.background = 'rgba(255,255,255,0.02)'; };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--card-border)'; dropZone.style.background = 'rgba(255,255,255,0.02)'; handleFiles(e.dataTransfer.files); };
}

function handleFiles(files) {
    const newItems = Array.from(files).map(file => ({
        file: file,
        isPrivate: document.getElementById('gallery-private').checked
    }));
    uploadQueue = [...uploadQueue, ...newItems];
    renderUploadPreview();
}

function removeFileFromQueue(index) {
    uploadQueue.splice(index, 1);
    renderUploadPreview();
}
window.removeFileFromQueue = removeFileFromQueue;

function toggleItemPrivate(index) {
    if (uploadQueue[index]) {
        uploadQueue[index].isPrivate = !uploadQueue[index].isPrivate;
        renderUploadPreview();
    }
}
window.toggleItemPrivate = toggleItemPrivate;

function clearUploadQueue() {
    uploadQueue = [];
    renderUploadPreview();
}
window.clearUploadQueue = clearUploadQueue;

async function renderUploadPreview() {
    const container = document.getElementById('upload-preview-container');
    const startBtn = document.getElementById('start-upload-btn');
    const clearBtn = document.getElementById('clear-queue-btn');
    const countEl = document.getElementById('queue-count');
    if (!container) return;
    container.innerHTML = '';
    if (uploadQueue.length === 0) {
        if (startBtn) startBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (countEl) countEl.textContent = uploadQueue.length;

    uploadQueue.forEach((item, i) => {
        const file = item.file;
        const card = document.createElement('div');
        card.style.cssText = `position:relative; width:120px; height:150px; border-radius:12px; overflow:hidden; border:1px solid ${item.isPrivate ? 'var(--accent-secondary)' : 'var(--card-border)'}; background:#000; transition: border 0.3s;`;
        let previewHtml = '';
        if (file.type.startsWith('image')) {
            const url = URL.createObjectURL(file);
            previewHtml = `<img src="${url}" style="width:100%; height:120px; object-fit:cover;">`;
        } else {
            previewHtml = `<div style="width:100%; height:120px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:5px; font-size:0.7rem; background:#111;">🎥<div style="padding:0 5px; text-align:center; overflow:hidden; text-overflow:ellipsis; width:100%">${file.name}</div></div>`;
        }
        card.innerHTML = `${previewHtml}<div style="height:30px; background: rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; gap:5px; font-size:0.7rem; color: ${item.isPrivate ? 'var(--accent-secondary)' : 'var(--text-muted)'};"><input type="checkbox" ${item.isPrivate ? 'checked' : ''} onchange="toggleItemPrivate(${i})" style="width:14px; height:14px; cursor:pointer;"> Private</div><button onclick="removeFileFromQueue(${i})" style="position:absolute; top:5px; right:5px; width:22px; height:22px; border-radius:50%; background:rgba(255,0,0,0.8); color:white; border:none; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center; z-index:10;">✕</button>`;
        container.appendChild(card);
    });
}

async function uploadGallery() {
    if(uploadQueue.length === 0) return alert("Select at least one file");
    videoReviewQueue = uploadQueue.filter(item => item.file.type.startsWith('video')).map(item => item.file);
    reviewedDates = {};
    if (videoReviewQueue.length > 0) processVideoReviewQueue();
    else startGalleryUpload();
}
window.uploadGallery = uploadGallery;

function processVideoReviewQueue() {
    if (videoReviewQueue.length === 0) {
        const modal = document.getElementById('video-review-modal');
        if (modal) modal.style.display = 'none';
        startGalleryUpload();
        return;
    }
    const file = videoReviewQueue[0];
    const modal = document.getElementById('video-review-modal');
    const player = document.getElementById('review-video-player');
    const dateInput = document.getElementById('review-date-input');
    const confirmBtn = document.getElementById('review-confirm-btn');
    if (!modal || !player || !dateInput || !confirmBtn) return startGalleryUpload();

    modal.style.display = 'flex';
    document.getElementById('review-title').textContent = `Review Video (${videoReviewQueue.length} Left)`;
    document.getElementById('review-filename').textContent = file.name;
    const fileUrl = URL.createObjectURL(file);
    player.src = fileUrl; player.load();
    
    getVideoMetadata(file).then(meta => {
        const dateToUse = meta.date ? new Date(meta.date) : new Date(file.lastModified);
        const offset = dateToUse.getTimezoneOffset() * 60000;
        dateInput.value = new Date(dateToUse - offset).toISOString().slice(0, 16);
        if (!meta.date) document.getElementById('review-title').innerHTML = `Review Video <span style="color:var(--accent-secondary); font-size:0.8rem;">(Missing Metadata)</span>`;
        if (meta.lat && meta.lon) { reviewedDates[file.name + '_lat'] = meta.lat; reviewedDates[file.name + '_lon'] = meta.lon; }
    });
    confirmBtn.onclick = () => {
        reviewedDates[file.name] = dateInput.value ? new Date(dateInput.value).toISOString() : new Date(file.lastModified).toISOString();
        URL.revokeObjectURL(fileUrl); videoReviewQueue.shift(); processVideoReviewQueue();
    };
}

/* Shared Concurrency Helper */
async function runWithConcurrency(tasks, concurrency) {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= concurrency) await Promise.race(executing);
    }
    return Promise.all(results);
}

async function startGalleryUpload() {
    const files = [...uploadQueue];
    const status = document.getElementById('gallery-status');
    const progress = document.getElementById('gallery-progress');
    const progressFill = progress ? progress.querySelector('.progress-fill') : null;
    if (progress) progress.style.display = 'block';
    
    let completed = 0;
    const uploadFile = async (item) => {
        const file = item.file;
        const isPrivate = item.isPrivate;
        let finalDate = reviewedDates[file.name] || null, lat = reviewedDates[file.name + '_lat'] || null, lon = reviewedDates[file.name + '_lon'] || null;
        
        if (file.type.startsWith('image')) {
            try {
                await new Promise(resolve => {
                    EXIF.getData(file, function() {
                        const exifDate = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
                        if(exifDate && !finalDate) { const [d, t] = exifDate.split(' '); finalDate = d.replace(/:/g, '-') + 'T' + t; }
                        const gpsLat = EXIF.getTag(this, "GPSLatitude"), gpsLon = EXIF.getTag(this, "GPSLongitude");
                        if (gpsLat && gpsLon && !lat) {
                            const toDD = (dms, ref) => { let dd = dms[0] + dms[1]/60 + dms[2]/3600; if (ref === "S" || ref === "W") dd *= -1; return dd; };
                            lat = toDD(gpsLat, EXIF.getTag(this, "GPSLatitudeRef")); lon = toDD(gpsLon, EXIF.getTag(this, "GPSLongitudeRef"));
                        }
                        resolve();
                    });
                });
            } catch (e) {}
        }
        
        if (!finalDate) finalDate = new Date(file.lastModified).toISOString();
        
        let mainBlob = file, thumbBlob = null;
        if (file.type.startsWith('image')) {
            // Process images before uploading
            [mainBlob, thumbBlob] = await Promise.all([processImage(file, 'original'), processImage(file, 'thumb')]);
        } else if (file.type.startsWith('video')) {
            // Generate thumbnail for video
            thumbBlob = await getVideoThumbnail(file);
        }

        const timestamp = Date.now() + Math.floor(Math.random() * 1000);
        const [mainUrl, thumbUrl] = await Promise.all([
            (async () => (await storage.ref(`gallery/${timestamp}_${file.name}`).put(mainBlob)).ref.getDownloadURL())(),
            (async () => thumbBlob ? (await storage.ref(`gallery/thumb_${timestamp}_${file.name}`).put(thumbBlob)).ref.getDownloadURL() : null)()
        ]);

        await db.collection('gallery').add({ 
            src: mainUrl, thumb: thumbUrl, 
            type: file.type.startsWith('video') ? 'video' : 'image', 
            date: finalDate, lat, lon, private: isPrivate, 
            filename: file.name, timestamp: Date.now() 
        });

        completed++;
        if (progressFill) progressFill.style.width = (completed / files.length * 100) + '%';
        if (status) status.textContent = `Uploaded ${completed}/${files.length}...`;
    };

    // Use controlled concurrency for network stability
    await runWithConcurrency(files.map(item => () => uploadFile(item)), 3);
    
    if (status) status.textContent = "All files uploaded successfully!";
    clearUploadQueue();
    setTimeout(() => { if (progressFill) progressFill.style.width = '0%'; if (progress) progress.style.display = 'none'; }, 2000);
}

/* Add Joke */
function addJoke() {
    const title = document.getElementById('joke-title').value, text = document.getElementById('joke-text').value, tier = parseInt(document.getElementById('joke-size').value);
    db.collection('jokes').add({ title, text, sizeTier: tier, timestamp: Date.now() }).then(() => {
        document.getElementById('joke-status').textContent = "Joke Added!";
        document.getElementById('joke-title').value = ''; document.getElementById('joke-text').value = '';
    });
}
window.addJoke = addJoke;

function getVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata'; video.src = URL.createObjectURL(file); video.muted = true; video.playsInline = true;
        let attempt = 0; const timestamps = [1, 2, 3, 0.5];
        video.onloadedmetadata = () => video.currentTime = timestamps[attempt];
        video.onseeked = () => {
            const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let totalBrightness = 0;
            for (let i = 0; i < imageData.length; i += 40) totalBrightness += (imageData[i] + imageData[i+1] + imageData[i+2]) / 3;
            if ((totalBrightness / (imageData.length / 40) < 15 || totalBrightness / (imageData.length / 40) > 240) && attempt < timestamps.length - 1) { attempt++; video.currentTime = timestamps[attempt]; }
            else { canvas.toBlob((blob) => { resolve(blob); URL.revokeObjectURL(video.src); }, 'image/jpeg', 0.8); }
        };
        video.onerror = () => resolve(null);
    });
}

async function uploadMemory() {
    const title = document.getElementById('mem-title').value, text = document.getElementById('mem-text').value, date = document.getElementById('mem-date').value, themeColor = document.getElementById('mem-color').value, imageFiles = Array.from(document.getElementById('mem-images').files), videoFile = document.getElementById('mem-video').files[0], audioFile = document.getElementById('mem-audio').files[0], isPrivate = document.getElementById('mem-private').checked;
    if(!title) return alert("Title is required.");
    
    const status = document.getElementById('mem-status'), progress = document.getElementById('mem-progress'), progressFill = progress.querySelector('.progress-fill');
    progress.style.display = 'block'; status.textContent = "Processing and uploading...";
    
    let imageUrls = [], thumbUrls = [], videoUrl = null, audioUrl = null;
    const totalItems = imageFiles.length + (videoFile ? 1 : 0) + (audioFile ? 1 : 0);
    let completed = 0;
    const updateProgress = () => { completed++; progressFill.style.width = (completed / totalItems * 100) + '%'; };

    // Process and upload images with concurrency
    await runWithConcurrency(imageFiles.map(file => async () => {
        const timestamp = Date.now() + Math.floor(Math.random() * 1000);
        const [mainBlob, thumbBlob] = await Promise.all([processImage(file, 'original'), processImage(file, 'thumb')]);
        const [mUrl, tUrl] = await Promise.all([
            (async () => (await storage.ref(`memories/${timestamp}_${file.name}`).put(mainBlob)).ref.getDownloadURL())(),
            (async () => (await storage.ref(`memories/thumb_${timestamp}_${file.name}`).put(thumbBlob)).ref.getDownloadURL())()
        ]);
        imageUrls.push(mUrl); thumbUrls.push(tUrl); 
        updateProgress();
    }), 3);

    if(videoFile) {
        const timestamp = Date.now();
        videoUrl = await (await storage.ref(`memories/${timestamp}_${videoFile.name}`).put(videoFile)).ref.getDownloadURL();
        const tBlob = await getVideoThumbnail(videoFile);
        if(tBlob) thumbUrls.unshift(await (await storage.ref(`memories/vthumb_${timestamp}.jpg`).put(tBlob)).ref.getDownloadURL());
        updateProgress();
    }
    if(audioFile) { audioUrl = await (await storage.ref(`memories/${Date.now()}_${audioFile.name}`).put(audioFile)).ref.getDownloadURL(); updateProgress(); }

    const payload = { title, text, private: isPrivate, timestamp: Date.now() };
    if (date) payload.date = date; if (imageUrls.length > 0) payload.images = imageUrls; if (thumbUrls.length > 0) payload.thumbs = thumbUrls; if (themeColor && themeColor !== '#ffffff') payload.themeColor = themeColor; if (videoUrl) payload.video = videoUrl; if (audioUrl) payload.audio = audioUrl;
    
    await db.collection('memories').add(payload);
    status.textContent = "Memory Created Successfully!";
    setTimeout(() => { progressFill.style.width = '0%'; progress.style.display = 'none'; }, 2000);
}
window.uploadMemory = uploadMemory;

async function loadConfigs() {
    try {
        const emailDoc = await db.collection('config').doc('emailjs').get();
        if (emailDoc.exists) {
            const data = emailDoc.data();
            document.getElementById('emailjs-public-key').value = data.publicKey || '';
            document.getElementById('emailjs-service-id').value = data.serviceID || '';
            document.getElementById('emailjs-template-id').value = data.templateID || '';
        }
        const homeDoc = await db.collection('config').doc('home').get();
        if (homeDoc.exists) {
            const data = homeDoc.data(), preview = document.getElementById('home-current-preview');
            let html = '';
            if (data.introVideo) html += `<div>📹 Video: <a href="${data.introVideo}" target="_blank" style="color:var(--accent-primary)">View Current</a></div>`;
            if (data.introVideoThumbnail) html += `<div>🖼️ Thumb: <a href="${data.introVideoThumbnail}" target="_blank" style="color:var(--accent-primary)">View Current</a></div>`;
            if (preview) preview.innerHTML = html || 'No home assets in cloud.';
        }
        const lowDoc = await db.collection('config').doc('feelingLow').get();
        if (lowDoc.exists) {
            const data = lowDoc.data(), status = document.getElementById('low-status');
            if (data.calmSound && status) status.innerHTML = `🎵 Current Audio: <a href="${data.calmSound}" target="_blank" style="color:var(--accent-primary)">Listen</a>`;
            if (document.getElementById('alone-input')) document.getElementById('alone-input').value = data.aloneText || '';
        }
        const letterDoc = await db.collection('config').doc('letter').get();
        if (letterDoc.exists) {
            if (document.getElementById('letter-input')) document.getElementById('letter-input').value = letterDoc.data().text || '';
            if (document.getElementById('letter-closing-input')) document.getElementById('letter-closing-input').value = letterDoc.data().closingLine || '';
        }
    } catch(e) { console.warn("Error loading configs", e); }
}

async function uploadHomeVideo() {
    const videoInput = document.getElementById('home-video'), thumbInput = document.getElementById('home-thumb'), videoFile = videoInput.files[0], thumbFile = thumbInput.files[0];
    if(!videoFile) return alert("Select at least a video");
    const status = document.getElementById('home-status'), progress = document.getElementById('home-progress'), progressFill = progress.querySelector('.progress-fill');
    progress.style.display = 'block'; status.textContent = "Checking for old assets...";
    let oldVideoUrl = null, oldThumbUrl = null;
    const homeDoc = await db.collection('config').doc('home').get();
    if (homeDoc.exists) { oldVideoUrl = homeDoc.data().introVideo; oldThumbUrl = homeDoc.data().introVideoThumbnail; }
    status.textContent = "Uploading video...";
    const vTask = storage.ref(`config/intro_video_${Date.now()}`).put(videoFile);
    vTask.on('state_changed', (snap) => { progressFill.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + '%'; });
    const vUrl = await (await vTask).ref.getDownloadURL();
    let tUrl = null;
    if (thumbFile) tUrl = await (await storage.ref(`config/intro_thumb_${Date.now()}`).put(thumbFile)).ref.getDownloadURL();
    else { const tBlob = await getVideoThumbnail(videoFile); if (tBlob) tUrl = await (await storage.ref(`config/intro_thumb_auto_${Date.now()}.jpg`).put(tBlob)).ref.getDownloadURL(); }
    const payload = { introVideo: vUrl, updatedAt: Date.now() }; if(tUrl) payload.introVideoThumbnail = tUrl;
    await db.collection('config').doc('home').set(payload, { merge: true });
    if (oldVideoUrl && oldVideoUrl.includes('firebasestorage')) try { storage.refFromURL(oldVideoUrl).delete(); } catch(e) {}
    if (oldThumbUrl && oldThumbUrl.includes('firebasestorage')) try { storage.refFromURL(oldThumbUrl).delete(); } catch(e) {}
    status.textContent = "Home Content Updated!";
    setTimeout(() => { progress.style.display = 'none'; progressFill.style.width = '0%'; loadConfigs(); }, 2000);
}
window.uploadHomeVideo = uploadHomeVideo;

function saveEmailJSConfig() {
    const pub = document.getElementById('emailjs-public-key').value.trim(), serv = document.getElementById('emailjs-service-id').value.trim(), temp = document.getElementById('emailjs-template-id').value.trim();
    db.collection('config').doc('emailjs').set({ publicKey: pub, serviceID: serv, templateID: temp, updatedAt: Date.now() }, { merge: true }).then(() => { document.getElementById('emailjs-status').textContent = "Config Saved!"; });
}
window.saveEmailJSConfig = saveEmailJSConfig;

/* --- Pagination State --- */
let firstDoc = null;
let lastDoc = null;
let currentPage = 1;
let orderField = 'timestamp'; // Default order field
const pageSize = 50;

async function loadContentList(direction = 'first') {
    const col = document.getElementById('manage-collection').value;
    const list = document.getElementById('manage-list');
    const pageInfo = document.getElementById('page-info');

    if (direction === 'first') {
        currentPage = 1;
        firstDoc = null;
        lastDoc = null;
        orderField = 'timestamp'; // Reset to default for new collection
    }

    list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted); opacity: 0.5;">Loading archival records...</div>';
    
    try {
        const getQuery = (field, dir) => {
            let q = db.collection(col);
            if (field === 'timestamp') {
                q = q.orderBy('timestamp', 'desc');
            } else {
                q = q.orderBy(firebase.firestore.FieldPath.documentId());
            }

            if (dir === 'next' && lastDoc) {
                return q.startAfter(lastDoc).limit(pageSize);
            } else if (dir === 'prev' && firstDoc) {
                return q.endBefore(firstDoc).limitToLast(pageSize);
            }
            return q.limit(pageSize);
        };

        let snap;
        try {
            snap = await getQuery(orderField, direction).get();
            
            // If we tried timestamp and got nothing on first page, fallback to ID
            if (snap.empty && direction === 'first' && orderField === 'timestamp') {
                console.warn(`No docs with timestamp in ${col}, falling back to ID ordering.`);
                orderField = 'id';
                snap = await getQuery(orderField, 'first').get();
            }
        } catch (err) {
            // If the query failed because of missing field, fallback to ID
            if (err.message.includes('orderBy') || err.message.includes('timestamp')) {
                orderField = 'id';
                snap = await getQuery(orderField, 'first').get();
            } else {
                throw err;
            }
        }

        if (!snap || snap.empty) {
            if (direction === 'next') {
                alert("You've reached the end of the collection.");
                currentPage--;
                updatePaginationUI(true, false);
                return;
            }
            list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted); opacity: 0.5;">No items found in this collection.</div>';
            updatePaginationUI(false, false);
            return;
        }

        firstDoc = snap.docs[0];
        lastDoc = snap.docs[snap.docs.length - 1];

        // Check if there is a next page using the SAME orderField
        let hasNext = false;
        try {
            const nextCheckQuery = db.collection(col);
            const finalNextQuery = (orderField === 'timestamp') 
                ? nextCheckQuery.orderBy('timestamp', 'desc').startAfter(lastDoc).limit(1)
                : nextCheckQuery.orderBy(firebase.firestore.FieldPath.documentId()).startAfter(lastDoc).limit(1);
            
            const nextCheck = await finalNextQuery.get();
            hasNext = !nextCheck.empty;
        } catch (e) { console.warn("Next page check failed", e); }

        const hasPrev = currentPage > 1;
        updatePaginationUI(hasPrev, hasNext);
        if (pageInfo) pageInfo.textContent = `Page ${currentPage}`;

        renderList(snap, col);
    } catch (e) {
        console.error("Pagination Error:", e);
        list.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b;">Error loading data: ${e.message}</div>`;
    }
}
window.loadContentList = loadContentList;

function updatePaginationUI(hasPrev, hasNext) {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
    if (prevBtn) prevBtn.style.opacity = hasPrev ? '1' : '0.3';
    if (nextBtn) nextBtn.style.opacity = hasNext ? '1' : '0.3';
}

function loadNextPage() {
    currentPage++;
    loadContentList('next');
}
window.loadNextPage = loadNextPage;

function loadPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadContentList('prev');
    }
}
window.loadPreviousPage = loadPreviousPage;

function renderList(snap, col) {
    const list = document.getElementById('manage-list'); list.innerHTML = '';
    const selectAllBtn = document.getElementById('select-all-btn'), deleteSelectedBtn = document.getElementById('delete-selected-btn');
    if(snap.empty) { list.innerHTML = '<div style="padding: 20px; text-align: center;">No items found.</div>'; if (selectAllBtn) selectAllBtn.style.display = 'none'; if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none'; return; }
    if (selectAllBtn) { selectAllBtn.style.display = 'inline-block'; selectAllBtn.textContent = 'Select All'; }
    snap.forEach(doc => {
        const data = doc.data(), div = document.createElement('div');
        div.className = 'manage-item'; div.style.cssText = "display:flex; align-items:center; padding:10px; border-bottom:1px solid var(--card-border); gap: 15px;";
        let thumbHtml = '<div style="width:40px; height:40px; background:rgba(255,255,255,0.05); border-radius:4px;"></div>'; 
        if (col === 'gallery') {
            const isVideo = data.type === 'video';
            if (isVideo && data.thumb) {
                thumbHtml = `<img src="${data.thumb}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">`;
            } else if (isVideo) {
                thumbHtml = `<video src="${data.src}#t=0.1" style="width:40px; height:40px; object-fit:cover; border-radius:4px;" muted></video>`;
            } else {
                thumbHtml = `<img src="${data.thumb || data.src}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">`;
            }
        } else if (col === 'memories') {
            if (data.images && data.images.length > 0) thumbHtml = `<img src="${data.images[0]}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">`;
            else if (data.video) thumbHtml = `<div style="width:40px; height:40px; background:#000; border-radius:4px; display:flex; justify-content:center; align-items:center;">▶</div>`;
        } else if (col === 'jokes') thumbHtml = `<div style="width:40px; height:40px; background:var(--accent-primary); border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:1.2rem;">😂</div>`;
        div.innerHTML = `<input type="checkbox" class="item-checkbox" data-id="${doc.id}" style="width: 20px; height: 20px; cursor: pointer;" onchange="updateSelectUI()">${thumbHtml}<span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${data.title || data.filename || doc.id}</span><button class="btn-admin" style="margin:0; background:#ff4444; font-size:0.8rem; padding: 5px 10px;" onclick="deleteItem('${col}', '${doc.id}')">Delete</button>`;
        list.appendChild(div);
    });
    updateSelectUI();
}

function updateSelectUI() {
    const checkboxes = document.querySelectorAll('.item-checkbox'), checked = document.querySelectorAll('.item-checkbox:checked'), deleteBtn = document.getElementById('delete-selected-btn'), selectAllBtn = document.getElementById('select-all-btn'), countEl = document.getElementById('select-count');
    if (countEl) countEl.textContent = checked.length;
    if (deleteBtn) deleteBtn.style.display = checked.length > 0 ? 'inline-block' : 'none';
    if (selectAllBtn) selectAllBtn.textContent = (checkboxes.length > 0 && checked.length === checkboxes.length) ? 'Deselect All' : 'Select All';
}
window.updateSelectUI = updateSelectUI;

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.item-checkbox'), checked = document.querySelectorAll('.item-checkbox:checked');
    const shouldSelect = checked.length < checkboxes.length; checkboxes.forEach(cb => cb.checked = shouldSelect); updateSelectUI();
}
window.toggleSelectAll = toggleSelectAll;

async function deleteSelectedItems() {
    const col = document.getElementById('manage-collection').value, checked = document.querySelectorAll('.item-checkbox:checked');
    if (checked.length === 0) return;
    if (confirm(`Are you sure you want to delete ${checked.length} items?`)) {
        const batch = db.batch(); checked.forEach(cb => batch.delete(db.collection(col).doc(cb.dataset.id)));
        await batch.commit(); loadContentList();
    }
}
window.deleteSelectedItems = deleteSelectedItems;

async function deleteItem(col, id) {
    if(confirm("Are you sure?")) { await db.collection(col).doc(id).delete(); loadContentList(); }
}
window.deleteItem = deleteItem;

async function migrateAll() {
    const log = document.getElementById('migration-log'), addLog = (msg) => { log.innerHTML += `<div>> ${msg}</div>`; log.scrollTop = log.scrollHeight; };
    addLog("Starting migration...");
    try {
        const res = await fetch('assets/jokes/jokes.json');
        if(res.ok) { for(const item of await res.json()) { await db.collection('jokes').add({...item, timestamp: Date.now()}); addLog(`Migrated joke: ${item.title}`); } }
    } catch(e) {}
    try {
        const res = await fetch('assets/gallery_photos/photos.json');
        if(res.ok) { for(const item of await res.json()) { const filename = item.file || item; await db.collection('gallery').add({ filename, date: item.date || new Date().toISOString(), private: item.private || false, type: filename.match(/\.(mp4|mov)$/i) ? 'video' : 'image', src: `assets/gallery_photos/${filename}`, timestamp: Date.now() }); addLog(`Migrated photo metadata: ${filename}`); } }
    } catch(e) {}
    try {
        const listRes = await fetch('assets/memories_photos/memories.json');
        if(listRes.ok) { for(const folder of await listRes.json()) { const metaRes = await fetch(`assets/memories_photos/${folder}/meta.json`); if(metaRes.ok) { await db.collection('memories').doc(folder).set({...await metaRes.json(), timestamp: Date.now()}); addLog(`Migrated memory: ${folder}`); } } }
    } catch(e) {}
    addLog("--- MIGRATION COMPLETE ---");
}
window.migrateAll = migrateAll;
