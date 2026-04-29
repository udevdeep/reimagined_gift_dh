import { auth, db, storage, initTheme } from "./main.js";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, setDoc, doc, getDoc, getDocs, updateDoc, increment, serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch, deleteField, FieldPath, deleteDoc, startAfter, endBefore, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, getDownloadURL, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { runWithConcurrency, showToast } from "./utils.js";

// Check if admin is logged in
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
        });
    } else {
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'none';
    }
});

/* Simple Content Updates */
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
    } catch (err) {
        status.textContent = "Error: " + err.message;
    }
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

/* Configuration Loading */
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
        if (low.exists()) { 
            const d = low.data(); 
            if (document.getElementById('alone-input')) document.getElementById('alone-input').value = d.aloneText || ''; 
        }
        if (letter.exists()) { 
            const d = letter.data(); 
            if (document.getElementById('letter-input')) document.getElementById('letter-input').value = d.text || ''; 
            if (document.getElementById('letter-closing-input')) document.getElementById('letter-closing-input').value = d.closingLine || ''; 
        }
    } catch(e) { console.warn("Error loading configs", e); }
}

/* Dashboard Stats */
async function initDashboardStats() {
    onSnapshot(doc(db, 'config', 'stats'), snap => {
        if(snap.exists()){
            const data = snap.data();
            document.getElementById('total-sparks-count').textContent = data.totalSparks || 0;
            document.getElementById('total-visits-count').textContent = data.totalVisits || 0;
        }
    });
}

/* Pulse Monitor */
function initPulseMonitor() {
    const log = document.getElementById('pulse-log');
    const visitLog = document.getElementById('visit-log');
    
    // Spark Monitor
    const q = query(collection(db, 'spark_history'), orderBy('timestamp', 'desc'), limit(15));
    onSnapshot(q, snap => {
        log.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const div = document.createElement('div');
            div.className = 'card';
            div.style.padding = '10px';
            div.style.marginBottom = '0';
            div.innerHTML = `<strong>${d.userName}</strong> sent a spark <br><small>${new Date(d.timestamp).toLocaleString()}</small>`;
            log.appendChild(div);
        });
    });

    // Visit Monitor
    const vq = query(collection(db, 'site_visits'), orderBy('timestamp', 'desc'), limit(15));
    onSnapshot(vq, snap => {
        visitLog.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const div = document.createElement('div');
            div.className = 'card';
            div.style.padding = '10px';
            div.style.marginBottom = '0';
            div.innerHTML = `<strong>${d.path || 'Home'}</strong> <br><small>${new Date(d.timestamp).toLocaleString()}</small>`;
            visitLog.appendChild(div);
        });
    });
}

/* Email Config */
window.saveEmailJSConfig = async () => {
    const publicKey = document.getElementById('emailjs-public-key').value, serviceID = document.getElementById('emailjs-service-id').value, templateID = document.getElementById('emailjs-template-id').value;
    await setDoc(doc(db, 'config', 'emailjs'), { publicKey, serviceID, templateID, updatedAt: Date.now() }, { merge: true });
    showToast("EmailJS Config Saved!", "success");
};

/* --- Gallery & Memories Upload (Still using Firebase Storage) --- */
let uploadQueue = [];

async function initGalleryUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('gallery-file');
    if (!dropZone) return;

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);

    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--card-border)'; };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--card-border)'; handleFiles(e.dataTransfer.files); };
}

function handleFiles(files) {
    for (let file of files) {
        uploadQueue.push(file);
    }
    updateUploadUI();
}

function updateUploadUI() {
    const container = document.getElementById('upload-preview-container');
    const startBtn = document.getElementById('start-upload-btn');
    const clearBtn = document.getElementById('clear-queue-btn');
    const count = document.getElementById('queue-count');

    container.innerHTML = '';
    uploadQueue.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '5px';
        div.style.position = 'relative';
        div.innerHTML = `<small style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name}</small>
                         <button onclick="removeFromQueue(${index})" style="position:absolute; top:0; right:0; background:none; border:none; color:red; cursor:pointer;">×</button>`;
        container.appendChild(div);
    });

    if (uploadQueue.length > 0) {
        startBtn.style.display = 'block';
        clearBtn.style.display = 'block';
        count.textContent = uploadQueue.length;
    } else {
        startBtn.style.display = 'none';
        clearBtn.style.display = 'none';
    }
}

window.removeFromQueue = (index) => {
    uploadQueue.splice(index, 1);
    updateUploadUI();
};

window.clearUploadQueue = () => {
    uploadQueue = [];
    updateUploadUI();
};

window.uploadGallery = async () => {
    const isPrivate = document.getElementById('gallery-private').checked;
    const status = document.getElementById('gallery-status');
    const progress = document.getElementById('gallery-progress');
    const fill = progress.querySelector('.progress-fill');
    
    progress.style.display = 'block';
    const total = uploadQueue.length;
    let completed = 0;

    for (let file of uploadQueue) {
        status.textContent = `Uploading ${completed + 1}/${total}: ${file.name}`;
        const sRef = ref(storage, `gallery/${Date.now()}_${file.name}`);
        await uploadBytesResumable(sRef, file);
        const url = await getDownloadURL(sRef);
        
        await addDoc(collection(db, 'gallery'), {
            src: url,
            type: file.type.startsWith('video') ? 'video' : 'image',
            timestamp: Date.now(),
            private: isPrivate,
            filename: file.name
        });
        
        completed++;
        fill.style.width = (completed / total * 100) + '%';
    }

    status.textContent = "Upload Complete! ✨";
    uploadQueue = [];
    updateUploadUI();
    setTimeout(() => progress.style.display = 'none', 3000);
};

/* Mobile nav */
window.showSection = (id) => {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav li').forEach(l => l.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelector(`li[data-section="${id}"]`).classList.add('active');
};

window.signOutUser = () => signOut(auth);
window.clearSparkCounts = async () => {
    if(confirm("Clear all spark history?")) {
        const batch = writeBatch(db);
        const snaps = await getDocs(collection(db, 'spark_history'));
        snaps.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await setDoc(doc(db, 'config', 'stats'), { totalSparks: 0 }, { merge: true });
    }
};

/* Memories */
window.uploadMemory = async () => {
    const file = document.getElementById('memory-video').files[0];
    const caption = document.getElementById('memory-caption').value.trim();
    if(!file) return alert("Select a video");
    
    const status = document.getElementById('memory-status');
    status.textContent = "Uploading reel...";
    
    const sRef = ref(storage, `memories/${Date.now()}_${file.name}`);
    await uploadBytesResumable(sRef, file);
    const url = await getDownloadURL(sRef);
    
    await addDoc(collection(db, 'memories'), {
        src: url,
        caption: caption,
        timestamp: Date.now()
    });
    
    status.textContent = "Memory added! ✨";
};

/* Sounds */
window.uploadFamiliarSound = async () => {
    const file = document.getElementById('familiar-audio-file').files[0];
    const title = document.getElementById('familiar-title').value.trim();
    const mood = document.getElementById('familiar-mood').value;
    if(!file || !title) return alert("Select file and title.");
    
    const status = document.getElementById('low-status');
    status.textContent = "Uploading song...";
    const sRef = ref(storage, `familiar_sounds/${Date.now()}_${file.name}`);
    await uploadBytesResumable(sRef, file);
    const url = await getDownloadURL(sRef);
    
    await addDoc(collection(db, 'familiar_sounds'), { title, mood, src: url, timestamp: Date.now() });
    status.textContent = "Song added!";
};
