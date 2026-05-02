import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, collection, addDoc, setDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { resolvePath, getContrastYIQ, showToast, downloadResource, formatNoteText } from "./utils.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDwNkXXzs_mhFNqOwI_NYtB-n6H_g93Pd4",
    authDomain: "dharchive-9f1a9.firebaseapp.com",
    projectId: "dharchive-9f1a9",
    storageBucket: "dharchive-9f1a9.firebasestorage.app",
    messagingSenderId: "485441238973",
    appId: "1:485441238973:web:7a28ff735f8ec19b1744d4",
    measurementId: "G-4ZP822MQ5J"
};

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

// Use initializeFirestore with long-polling to fix "access control check" / CORS-like errors
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
});
export const storage = getStorage(app);

// Register Service Worker for local video caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('New SW version available, reloading...');
                        window.location.reload();
                    }
                };
            };
        }).catch(err => console.warn('SW registration failed:', err));
    });
}

// Function to cache media in the background for local-speed on next load
async function cacheMediaLocally(url) {
    if (!url || !('caches' in window)) return;
    const cache = await caches.open('archive-media-v3');
    const matched = await cache.match(url);
    if (!matched) {
        // Use fetch with 'cors' to ensure it's cached properly for cross-origin media (Firebase/Vercel)
        fetch(url, { mode: 'cors' }).then(res => {
            if (res.ok) cache.put(url, res);
        }).catch(e => console.warn("Background cache failed for:", url, e));
    }
}


window.auth = auth; window.db = db; window.storage = storage;

const LOCK_KEY = 'gift_lock_expiry';
let SECRET_KEY = ""; 
let LETTER_TEXT = `Hey...`; 
let ALONE_TEXT = `There are moments when the world feels quiet...`;
let MEMORIES_DATA = [];
let GALLERY_DATA = [];
let JOKES_DATA = [];
let galleryState = [];


// Robust initialization that runs even if DOMContentLoaded already fired
function initAll() {
    // Check for "Vault locked" toast flag
    if (sessionStorage.getItem('show_vault_locked_toast')) {
        sessionStorage.removeItem('show_vault_locked_toast');
        setTimeout(() => {
            showToast("Vault locked. ✨", "info");
        }, 1000);
    }

    try { initTheme(); } catch(e) { console.warn("Theme init failed", e); }
    try { applyCacheImmediate(); } catch(e) { console.warn("Cache apply failed", e); }
    try { initFirebaseLock(); } catch(e) { console.warn("Firebase lock init failed", e); }
    try { initMobileMenu(); } catch(e) { console.warn("Mobile menu init failed", e); }
    
    const introVideo = document.getElementById('intro-video');
    if (introVideo) {
        try { initHome(); } catch(e) { console.error("Home init failed", e); }
    }
    
    window.addEventListener('resize', handleMobileNav);
}

function initMobileMenu() {
    const kebabBtn = document.getElementById('kebab-menu-btn');
    const nav = document.querySelector('.navbar');
    if (!kebabBtn) return;

    kebabBtn.onclick = (e) => {
        e.stopPropagation();
        document.body.classList.toggle('menu-active');
    };

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (document.body.classList.contains('menu-active')) {
            const links = document.querySelector('.nav-links');
            if (links && !links.contains(e.target) && !kebabBtn.contains(e.target)) {
                document.body.classList.remove('menu-active');
            }
        }
    });

    // Close on scroll
    window.addEventListener('scroll', () => {
        if (document.body.classList.contains('menu-active')) {
            document.body.classList.remove('menu-active');
        }
    }, { passive: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}

function handleMobileNav() {
    // Layout is now handled via CSS Media Queries for better performance and stability
    return;
}

export async function sendSpark() {
    const btn = document.getElementById('pulse-btn') || document.querySelector('.spark-fab');
    if (!btn || btn.disabled || btn.classList.contains('sending')) return;
    btn.disabled = true; btn.classList.add('sending');
    const vibe = { msg: "Spark sent. Always in your corner. ✨", log: "Always in your corner." };
    if (btn.classList.contains('spark-fab')) btn.innerHTML = "Sending... ✨"; else btn.classList.add('ripple-active');
    if (window.SoundFX?.spark) window.SoundFX.spark();
    if (typeof confetti !== 'undefined') confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 }, colors: ['#ffcc33', '#ffffff'] });
    const user = auth.currentUser;
    if (user) {
        try {
            const timestamp = Date.now();
            await setDoc(doc(db, 'user_data', user.uid), { lastPulse: timestamp, pulseCount: increment(1) }, { merge: true });
            await setDoc(doc(db, 'config', 'stats'), { totalSparks: increment(1) }, { merge: true });
            await addDoc(collection(db, 'spark_history'), { userId: user.uid, userName: user.displayName || "Friend", timestamp });
            const emailConfig = await getDoc(doc(db, 'config', 'emailjs'));
            if (emailConfig.exists() && typeof emailjs !== 'undefined') {
                const { serviceID, templateID, publicKey } = emailConfig.data();
                emailjs.init({ publicKey });
                emailjs.send(serviceID, templateID, { to_name: "Devdeep", message: `A Spark from the Archive: "${vibe.log}" ✨`, time: new Date().toLocaleString() });
            }
        } catch (e) { console.error("Spark error:", e); }
    }
    setTimeout(() => {
        btn.disabled = false; btn.classList.remove('sending', 'ripple-active');
        if (btn.classList.contains('spark-fab')) btn.innerHTML = "Send a Spark ✨";
        showToast(vibe.msg, "success");
    }, 1500);
}
window.sendSpark = sendSpark;

function applyCacheImmediate() {
    const cachedHome = sessionStorage.getItem('home_cache');
    const cachedLetter = sessionStorage.getItem('letter_cache');
    const cachedJokes = sessionStorage.getItem('jokes_cache');
    const cachedGallery = sessionStorage.getItem('gallery_cache');
    const cachedMemories = sessionStorage.getItem('memories_cache');
    const cachedLow = sessionStorage.getItem('feeling_low_cache');

    if (cachedHome) try { applyHomeConfig(JSON.parse(cachedHome)); } catch(e) {}
    if (cachedLetter) try {
        const data = JSON.parse(cachedLetter);
        LETTER_TEXT = data.text || ''; window.LETTER_CLOSING = data.closingLine || '';
        if (document.getElementById('letter-content')) document.getElementById('letter-content').innerHTML = formatNoteText(LETTER_TEXT);
        if (document.getElementById('letter-closing-line')) document.getElementById('letter-closing-line').innerHTML = formatNoteText(window.LETTER_CLOSING || "");
    } catch(e) {}
    
    if (cachedJokes) try { JOKES_DATA = JSON.parse(cachedJokes); window.JOKES_DATA = JOKES_DATA; } catch(e) {}
    if (cachedGallery) try { 
        GALLERY_DATA = JSON.parse(cachedGallery).map(item => ({
            ...item,
            date: item.date ? new Date(item.date) : new Date(0)
        }));
        window.GALLERY_DATA = GALLERY_DATA;
    } catch(e) {}
    if (cachedMemories) try { MEMORIES_DATA = JSON.parse(cachedMemories); window.MEMORIES_DATA = MEMORIES_DATA; } catch(e) {}
    if (cachedLow) try { ALONE_TEXT = JSON.parse(cachedLow).aloneText || ALONE_TEXT; window.ALONE_TEXT = ALONE_TEXT; } catch(e) {}
}

function initFirebaseLock() {
    const overlay = document.getElementById('lock-overlay');
    const loginBtn = document.getElementById('google-login-btn');
    const isIndex = document.body.classList.contains('index-page');

    // Immediate check to prevent flickering
    const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
    if (expiry > Date.now()) {
        if (overlay) overlay.style.display = 'none';
    }

    if (loginBtn) loginBtn.onclick = () => {
        const msg = document.getElementById('lock-msg');
        if (msg) {
            msg.textContent = "Signing in...";
            msg.style.color = "var(--accent-warm)";
        }
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            console.error("Sign-in Error:", err);
            if (msg) {
                msg.textContent = "Error: " + err.message;
                msg.style.color = "#ff6b6b";
            }
        });
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Robust Whitelist check using UID
            getDoc(doc(db, 'whitelist', user.uid)).then(snap => {
                if(snap.exists()) {
                    localStorage.setItem(LOCK_KEY, Date.now() + (7 * 24 * 60 * 60 * 1000));
                    if (overlay) overlay.style.display = 'none';
                    startApp();
                } else {
                    console.error("Access denied for UID:", user.uid);
                    const msg = document.getElementById('lock-msg');
                    if (msg) {
                        msg.textContent = "Access Denied: You are not on the guest list.";
                        msg.style.color = "#ff6b6b";
                    }
                    setTimeout(() => {
                        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js").then(m => m.signOut(auth));
                    }, 2000);
                }
            }).catch(err => {
                console.error("Whitelist check error:", err);
            });
        } else {
            const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
            if (isIndex) {
                if (overlay) overlay.style.display = 'none';
            } else {
                if (overlay) overlay.style.display = 'flex';
            }
        }
    });
}

async function startApp() {
    document.body.style.visibility = 'visible'; document.body.style.opacity = '1';
    recordVisit();
    
    // 1. Initial Render from Cache (data populated by applyCacheImmediate)
    if (document.getElementById('memories-container')) { loadMemories(); initMemoriesNav(); }
    if (document.getElementById('gallery-grid')) loadGallery();
    if (document.getElementById('jokes-container')) loadJokes();
    
    // Hide loader early if we have cached data
    if (GALLERY_DATA.length > 0 || MEMORIES_DATA.length > 0 || JOKES_DATA.length > 0) {
        hideLoader();
    }

    // 2. Background Revalidation
    try { await loadAllData(); } catch (e) { console.error(e); }
    
    // Final hide loader in case it was a fresh visit (no cache)
    hideLoader();
    
    // AUTO-ENTER: If they just logged in on the index page, clear the pre-landing automatically
    const pre = document.getElementById('pre-landing');
    if (pre && !sessionStorage.getItem('entered_archive')) {
        enterArchive();
    } else if (pre && sessionStorage.getItem('entered_archive')) {
        pre.style.display = 'none';
        initCinematicScroll();
    }
}

// Extracted logic to enter the site cleanly
function enterArchive() {
    const pre = document.getElementById('pre-landing');
    if (!pre) return;
    
    sessionStorage.setItem('entered_archive', 'true');
    pre.style.transition = 'opacity 0.8s ease';
    pre.style.opacity = '0';
    pre.style.pointerEvents = 'none';
    
    setTimeout(() => {
        pre.style.display = 'none';
        initCinematicScroll();
    }, 800);
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; }, 600);
    }
}

async function recordVisit() {
    const user = auth.currentUser;
    if (!user || sessionStorage.getItem('visit_recorded')) return;
    try {
        await setDoc(doc(db, 'config', 'stats'), { totalVisits: increment(1) }, { merge: true });
        await addDoc(collection(db, 'site_visits'), { 
            userId: user.uid, 
            userName: user.displayName || "Friend", 
            userEmail: user.email || "Anonymous", 
            timestamp: serverTimestamp() 
        });
        sessionStorage.setItem('visit_recorded', 'true');

        // Update whitelist with latest profile info for mentions
        const whiteRef = doc(db, 'whitelist', user.uid);
        const whiteSnap = await getDoc(whiteRef);
        if (whiteSnap.exists()) {
            await setDoc(whiteRef, {
                displayName: user.displayName,
                photoURL: user.photoURL,
                email: user.email,
                lastSeen: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {}
}

async function loadAllData() {
    try {
        // 1. HIGH PRIORITY: Letter, Home Config, Secrets
        const [homeDoc, secretsDoc, letterDoc] = await Promise.all([
            getDoc(doc(db, 'config', 'home')),
            getDoc(doc(db, 'config', 'secrets')),
            getDoc(doc(db, 'config', 'letter'))
        ]);

        if (homeDoc.exists()) {
            const data = homeDoc.data();
            applyHomeConfig(data);
            sessionStorage.setItem('home_cache', JSON.stringify(data));
        }
        if (secretsDoc.exists()) SECRET_KEY = secretsDoc.data().privateKey;
        if (letterDoc.exists()) {
            const data = letterDoc.data();
            LETTER_TEXT = data.text || '';
            window.LETTER_CLOSING = data.closingLine || '';
            if (document.getElementById('letter-content')) document.getElementById('letter-content').innerHTML = formatNoteText(LETTER_TEXT);
            if (document.getElementById('letter-closing-line')) document.getElementById('letter-closing-line').innerHTML = formatNoteText(window.LETTER_CLOSING || "");
            sessionStorage.setItem('letter_cache', JSON.stringify(data));
        }

        // 2. LOW PRIORITY: Lists and secondary configs (Delayed to prioritize interactivity)
        setTimeout(async () => {
            const [jokesSnap, gallerySnap, memoriesSnap, lowDoc] = await Promise.all([
                getDocs(collection(db, 'jokes')),
                getDocs(collection(db, 'gallery')),
                getDocs(collection(db, 'memories')),
                getDoc(doc(db, 'config', 'feelingLow'))
            ]);

            if (!jokesSnap.empty) {
                JOKES_DATA = jokesSnap.docs.map(d => d.data());
                sessionStorage.setItem('jokes_cache', JSON.stringify(JOKES_DATA));
            }
            if (!gallerySnap.empty) {
                const getMillis = (val) => {
                    if (!val) return 0;
                    if (typeof val.toMillis === 'function') return val.toMillis();
                    if (typeof val === 'number') return val;
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? 0 : d.getTime();
                };

                const freshGallery = gallerySnap.docs.map(doc => {
                    const data = doc.data();
                    const ts = data.date ? getMillis(data.date) : getMillis(data.timestamp);
                    return { ...data, id: doc.id, sortTs: ts };
                });
                freshGallery.sort((a, b) => b.sortTs - a.sortTs);
                
                const currentIds = GALLERY_DATA.map(i => i.id).join(',');
                const freshIds = freshGallery.map(i => i.id).join(',');

                if (freshGallery.length !== GALLERY_DATA.length || freshIds !== currentIds) {
                    GALLERY_DATA = freshGallery; window.GALLERY_DATA = GALLERY_DATA;
                    sessionStorage.setItem('gallery_cache', JSON.stringify(GALLERY_DATA));
                    const grid = document.getElementById('gallery-grid');
                    if (grid) { grid.innerHTML = ''; loadGallery(); }
                }
            }
            if (!memoriesSnap.empty) {
                const freshMemories = memoriesSnap.docs.map(doc => ({ folder: doc.id, meta: doc.data() }));
                
                const currentFolders = MEMORIES_DATA.map(m => m.folder).join(',');
                const freshFolders = freshMemories.map(m => m.folder).join(',');

                if (freshMemories.length !== MEMORIES_DATA.length || freshFolders !== currentFolders) {
                    MEMORIES_DATA = freshMemories; window.MEMORIES_DATA = MEMORIES_DATA;
                    sessionStorage.setItem('memories_cache', JSON.stringify(MEMORIES_DATA));
                    if (document.getElementById('memories-container')) loadMemories();
                }
            }
            if (lowDoc.exists()) {
                const data = lowDoc.data();
                ALONE_TEXT = data.aloneText || ALONE_TEXT; window.ALONE_TEXT = ALONE_TEXT;
                sessionStorage.setItem('feeling_low_cache', JSON.stringify(data));
            }
        }, 1500);

    } catch (e) {
        console.error("Archive fetch error:", e);
    }
}

function applyHomeConfig(data) {
    const videoEl = document.getElementById('intro-video');
    if (videoEl) {
        if (data.introVideoThumbnail) videoEl.poster = data.introVideoThumbnail;
        if (data.introVideo && videoEl.src !== data.introVideo) { 
            videoEl.src = data.introVideo; 
            videoEl.load(); 
            // Cache locally for next time (150MB is large!)
            cacheMediaLocally(data.introVideo);
            if (data.introVideoThumbnail) cacheMediaLocally(data.introVideoThumbnail);
        }
    }
}

function updateThemeColor(isBarbie) {
    let color = isBarbie ? '#fff0f5' : '#050505';
    // Forced black pages
    if (document.body.classList.contains('index-page') || document.body.classList.contains('memories-page')) {
        color = '#000000';
    }
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
}

export function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const update = (isBarbie) => { 
        if(btn) btn.innerHTML = isBarbie ? '🌙' : '🎀'; 
        updateThemeColor(isBarbie);
    };
    const isBarbie = localStorage.getItem('theme') === 'barbie';
    if (isBarbie) document.documentElement.classList.add('barbie-mode');
    update(isBarbie);
    if (btn) btn.onclick = () => {
        const nowBarbie = document.documentElement.classList.toggle('barbie-mode');
        localStorage.setItem('theme', nowBarbie ? 'barbie' : 'dark');
        update(nowBarbie);
    };
}

function initHome() {
    console.log("initHome() starting...");
    const pre = document.getElementById('pre-landing');
    const overlay = document.getElementById('lock-overlay');
    const beginBtn = document.getElementById('pre-landing-begin');
    
    if (!pre || !beginBtn) return;

    if (sessionStorage.getItem('entered_archive')) {
        pre.style.display = 'none';
        return;
    }

    beginBtn.onclick = () => {
        // --- Fullscreen Expert Fix: Hide address bar on interaction ---
        try {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) docEl.requestFullscreen();
            else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
            else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
        } catch (e) {
            console.warn("Fullscreen request failed (likely browser restriction)", e);
        }

        const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
        if (!auth.currentUser || expiry < Date.now()) {
            if (overlay) {
                pre.style.zIndex = "1";
                overlay.style.zIndex = "999999";
                overlay.style.display = 'flex';
                overlay.style.opacity = '1';
            }
            return;
        }
        enterArchive();
    };
    console.log("initHome() handler attached.");
}

let isScrolling = false;
function initCinematicScroll() {
    if (isScrolling) return;
    const container = document.querySelector('.hero-container');
    const indicator = document.querySelector('.scroll-indicator');
    const nav = document.querySelector('.navbar');
    if (!container) return;

    isScrolling = true;
    container.scrollTop = 0;
    let currentScroll = 0;
    let scrollActive = true;
    let resumeTimeout = null;
    
    // UI/UX Expert Fix: Adjust speed based on device capability and screen size
    const isMobile = window.innerWidth <= 768;
    const speed = isMobile ? 0.45 : 0.6; 

    // Performance Optimization: Force 'auto' to prevent stutter conflict with CSS smooth scroll
    container.style.scrollBehavior = 'auto';
    container.style.willChange = 'scroll-position';

    // --- Navbar & Indicator logic from old code ---
    let mouseAtTop = true;
    const updateNavVisibility = () => {
        if (!nav) return;
        const currentScroll = container.scrollTop;
        const wasAtTop = currentScroll < 50;
        
        if (indicator) {
            if (currentScroll > 100) indicator.classList.add('hidden');
            else indicator.classList.remove('hidden');
        }

        // UI/UX Expert Fix: If cinematic scroll is active, ALWAYS hide navbar 
        // to prevent distraction from the letter narrative.
        // ON DESKTOP: Only hide if the mouse isn't at the top.
        if (scrollActive) {
            if (window.innerWidth > 768) {
                if (mouseAtTop) nav.classList.remove('navbar-hidden');
                else nav.classList.add('navbar-hidden');
            } else {
                nav.classList.add('navbar-hidden');
            }
            return;
        }

        if (wasAtTop || mouseAtTop) {
            nav.classList.remove('navbar-hidden');
        } else if (currentScroll > 100) {
            nav.classList.add('navbar-hidden');
        }
    };

    window.addEventListener('mousemove', (e) => {
        const wasAtTop = mouseAtTop;
        mouseAtTop = e.clientY < 80;
        if (wasAtTop !== mouseAtTop) updateNavVisibility();
    });

    container.addEventListener('scroll', updateNavVisibility, { passive: true });

    const startScrollLoop = () => {
        if (!scrollActive) {
            scrollActive = true;
            // Update currentScroll to wherever the user manually scrolled to
            currentScroll = container.scrollTop;
            requestAnimationFrame(step);
        }
    };

    const stopScroll = () => { 
        scrollActive = false;
        if (resumeTimeout) clearTimeout(resumeTimeout);
        
        // Wait 3 seconds of inactivity before resuming
        resumeTimeout = setTimeout(() => {
            startScrollLoop();
        }, 3000);
    };
    
    // Track manual scrolling to keep currentScroll in sync and reset resume timer
    container.addEventListener('scroll', () => {
        if (!scrollActive) {
            // If user is manually scrolling, keep resetting the timer
            if (resumeTimeout) clearTimeout(resumeTimeout);
            resumeTimeout = setTimeout(() => {
                startScrollLoop();
            }, 3000);
        }
    }, { passive: true });

    container.addEventListener('wheel', stopScroll, { passive: true });
    container.addEventListener('touchstart', stopScroll, { passive: true });
    container.addEventListener('mousedown', stopScroll);

    function step() {
        if (!scrollActive) return;
        
        currentScroll += speed;
        container.scrollTop = currentScroll;
        
        // Check if we reached the bottom
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 5) {
            scrollActive = false;
            isScrolling = false; // Fully done
            return;
        }
        
        // Safety: if browser is resisting (at bottom or locked)
        if (currentScroll > container.scrollTop + 20) {
             scrollActive = false;
             // Don't set isScrolling to false yet, let it try to resume if it was just a temporary snag
             return;
        }

        requestAnimationFrame(step);
    }
    
    setTimeout(() => {
        requestAnimationFrame(step);
    }, 2000);
}

let isGlobalPaused = false;
let isGlobalMuted = false;

export function loadMemories() {
    const container = document.getElementById('memories-container');
    if (!container) return;

    // Privacy Toggle Logic
    setupPrivacyToggle('private-toggle');

    const userMemories = JSON.parse(localStorage.getItem('user_memories') || '[]');
    const all = [...userMemories, ...MEMORIES_DATA];
    
    // Sort Chronologically: Oldest to Newest
    all.sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date) : new Date(0);
        const dateB = b.meta.date ? new Date(b.meta.date) : new Date(0);
        return dateA - dateB;
    });

    container.innerHTML = '';
    
    all.forEach((item, index) => {
        const meta = item.meta; if (meta.private && !localStorage.getItem('private_unlocked')) return;
        
        const reel = document.createElement('div');
        reel.className = 'reel-item';
        reel.dataset.id = item.folder || `user-${index}`;

        const thumb = (meta.thumbs?.length) ? resolvePath(meta.thumbs[0], item.folder) : (meta.images?.length ? resolvePath(meta.images[0], item.folder) : '');
        
        let mediaHtml = '';
        const allMedia = [];
        if (meta.video) allMedia.push({ type: 'video', src: resolvePath(meta.video, item.folder) });
        if (meta.images?.length) {
            meta.images.forEach(img => allMedia.push({ type: 'image', src: resolvePath(img, item.folder) }));
        }

        if (allMedia.length > 1) {
            // Render Carousel
            let itemsHtml = '';
            let dotsHtml = '';
            allMedia.forEach((media, i) => {
                const mediaTag = media.type === 'video' 
                    ? `<div class="video-container">
                         <video src="${media.src}" loop playsinline class="reel-media" ${isGlobalMuted ? 'muted' : ''}></video>
                         <div class="pause-overlay"><svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg></div>
                         <div class="mute-overlay"><svg viewBox="0 0 24 24" class="mute-icon"></svg></div>
                       </div>`
                    : `<img src="${media.src}" class="reel-media" crossorigin="anonymous">`;
                itemsHtml += `<div class="carousel-item">${mediaTag}</div>`;
                dotsHtml += `<div class="carousel-dot ${i === 0 ? 'active' : ''}"></div>`;
            });
            mediaHtml = `
                <div class="reel-carousel">
                    ${itemsHtml}
                </div>
                <div class="carousel-dots">${dotsHtml}</div>
                <button class="carousel-arrow left">&lt;</button>
                <button class="carousel-arrow right">&gt;</button>
            `;
        } else if (allMedia.length === 1) {
            // Render Single Media
            const media = allMedia[0];
            mediaHtml = media.type === 'video' 
                ? `<div class="video-container">
                     <video src="${media.src}" loop playsinline class="reel-media" ${isGlobalMuted ? 'muted' : ''}></video>
                     <div class="pause-overlay"><svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg></div>
                     <div class="mute-overlay"><svg viewBox="0 0 24 24" class="mute-icon"></svg></div>
                   </div>`
                : `<img src="${media.src}" class="reel-media" crossorigin="anonymous">`;
        }

        // 1. Audio Name Refinement
        let audioLabel = "Original Audio";
        if (audioLabel = meta.audioName) audioLabel = meta.audioName;
        else if (meta.song) audioLabel = meta.song;
        else if (meta.audio) audioLabel = `Audio - ${meta.title}`;
        else audioLabel = `Moment - ${meta.title}`;

        const marqueeText = `${audioLabel} &nbsp; &nbsp; &bull; &nbsp; &nbsp; ${audioLabel} &nbsp; &nbsp; &bull; &nbsp; &nbsp; `;

        reel.innerHTML = `
            <div class="reel-content-wrapper">
                <img src="${thumb}" class="reel-overlay-bg" crossorigin="anonymous">
                ${mediaHtml}
                
                <div class="reel-info">
                    <div class="reel-header">
                        <div class="reel-profile-pic">DH</div>
                        <span class="reel-title">${meta.title}</span>
                    </div>
                    <div class="reel-description">${formatNoteText(meta.text || '')}</div>
                    ${(meta.text || '').length > 60 ? `<span class="reel-more">read more</span>` : ''}
                    <div class="reel-audio">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M21.002 16.972V2.044a.999.999 0 0 0-.36-.769 1.012 1.012 0 0 0-.823-.214L6.816 3.479A1 1 0 0 0 6 4.462v10.864A3.75 3.75 0 1 0 9 19V9.56l9.003-1.675v5.442A3.75 3.75 0 1 0 21.005 17c0-.01-.003-.02-.003-.029Z"></path></svg>
                        <div class="audio-name">${marqueeText}</div>
                    </div>
                </div>

                <div class="reel-actions">
                    <button class="action-btn cherish-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        <span>Cherish</span>
                    </button>
                    <button class="action-btn comment-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        <span>0</span>
                    </button>
                    <button class="action-btn download-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Save</span>
                    </button>
                </div>
            </div>
        `;

        // 2. Slow Reveal Description Logic
        const more = reel.querySelector('.reel-more');
        if (more) {
            more.onclick = () => {
                const desc = reel.querySelector('.reel-description');
                const isExpanded = desc.classList.toggle('expanded');
                more.textContent = isExpanded ? 'show less' : 'read more';
            };
        }

        // Carousel Navigation Logic
        const carousel = reel.querySelector('.reel-carousel');
        const updateMuteIcons = () => {
            const allMuteIcons = document.querySelectorAll('.mute-icon');
            const mutedPath = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"></path><line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="2"></line>';
            const unmutedPath = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>';

            allMuteIcons.forEach(icon => {
                icon.innerHTML = isGlobalMuted ? mutedPath : unmutedPath;
            });
            document.querySelectorAll('.reel-media').forEach(video => {
                if (video instanceof HTMLVideoElement) video.muted = isGlobalMuted;
            });
        };

        if (carousel) {
            const dots = reel.querySelectorAll('.carousel-dot');
            const leftBtn = reel.querySelector('.carousel-arrow.left');
            const rightBtn = reel.querySelector('.carousel-arrow.right');

            const updateCarouselState = () => {
                const width = carousel.offsetWidth || 1; // Prevent division by zero
                const index = Math.round(carousel.scrollLeft / width);
                const items = carousel.querySelectorAll('.carousel-item');
                
                dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
                
                // Show/Hide arrows based on index
                if (leftBtn) leftBtn.style.display = index === 0 ? 'none' : 'flex';
                if (rightBtn) rightBtn.style.display = index === items.length - 1 ? 'none' : 'flex';

                // Play video in current carousel item if reel is visible AND not globally paused
                const reelIsVisible = reel.classList.contains('is-visible');
                
                items.forEach((item, i) => {
                    const v = item.querySelector('video');
                    const container = item.querySelector('.video-container');
                    const muteBtn = item.querySelector('.mute-overlay');
                    const muteIcon = item.querySelector('.mute-icon');

                    if (v) {
                        v.muted = isGlobalMuted;
                        if (muteBtn) {
                            muteBtn.onclick = (e) => {
                                e.stopPropagation();
                                isGlobalMuted = !isGlobalMuted;
                                updateMuteIcons();
                            };
                        }

                        if (i === index && reelIsVisible) {
                            if (!isGlobalPaused) {
                                v.play().catch(() => {});
                                if (container) container.classList.remove('paused');
                            } else {
                                v.pause();
                                if (container) container.classList.add('paused');
                            }
                        } else {
                            v.pause();
                            v.currentTime = 0;
                            if (container) container.classList.remove('paused');
                        }
                        
                        // Toggle play/pause on click
                        v.onclick = (e) => {
                            e.stopPropagation();
                            if (v.paused) {
                                v.play();
                                isGlobalPaused = false; // Manually playing resumes global state
                                if (container) container.classList.remove('paused');
                            } else {
                                v.pause();
                                isGlobalPaused = true; // Manually pausing sets global state
                                if (container) container.classList.add('paused');
                            }
                        };
                    }
                });
            };

            carousel.addEventListener('scroll', updateCarouselState, { passive: true });
            leftBtn.onclick = () => carousel.scrollBy({ left: -carousel.offsetWidth, behavior: 'smooth' });
            rightBtn.onclick = () => carousel.scrollBy({ left: carousel.offsetWidth, behavior: 'smooth' });
            
            // Initial state check - small timeout to ensure DOM is measured
            setTimeout(updateCarouselState, 50);
        } else {
            // Single Media Case: Add click-to-toggle play/pause for the single video
            const v = reel.querySelector('video.reel-media');
            const container = reel.querySelector('.video-container');
            const muteBtn = reel.querySelector('.mute-overlay');

            if (v) {
                v.muted = isGlobalMuted;
                if (muteBtn) {
                    muteBtn.onclick = (e) => {
                        e.stopPropagation();
                        isGlobalMuted = !isGlobalMuted;
                        updateMuteIcons();
                    };
                }

                v.onclick = (e) => {
                    e.stopPropagation();
                    if (v.paused) {
                        v.play();
                        isGlobalPaused = false; // Manually playing resumes global state
                        if (container) container.classList.remove('paused');
                    } else {
                        v.pause();
                        isGlobalPaused = true; // Manually pausing sets global state
                        if (container) container.classList.add('paused');
                    }
                };
            }
        }
        updateMuteIcons(); // Initial sync for this reel

        // 3. Cherish Button Logic (Firestore Backed)
        const cherishBtn = reel.querySelector('.cherish-btn');
        const memoryId = reel.dataset.id;
        const user = auth.currentUser;

        if (user) {
            getDoc(doc(db, 'shared_profile_data', `cherished_${memoryId}`)).then(snap => {
                if (snap.exists() && !snap.data().removed) cherishBtn.classList.add('active');
            });
        }

        cherishBtn.onclick = function() { 
            if (!user) return showToast("Please sign in first.", "info");
            const active = this.classList.toggle('active'); 
            if (active) {
                setDoc(doc(db, 'shared_profile_data', `cherished_${memoryId}`), { 
                    memoryId: memoryId,
                    timestamp: serverTimestamp(), 
                    removed: false 
                });
                showToast("Tucked away for forever 🌸", "success");
            } else {
                setDoc(doc(db, 'shared_profile_data', `cherished_${memoryId}`), { removed: true }, { merge: true });
            }
        };

        // 4. Comment & Vibe Panel Logic (Firestore Backed)
        let commentsUnsubscribe = null;
        let replyingTo = null;
        let currentComments = [];
        let allUsers = []; // Cache for mentions

        const fetchAllUsers = async () => {
            if (allUsers.length > 0) return allUsers;
            try {
                const [whiteSnap, adminSnap, commentSnap] = await Promise.all([
                    getDocs(collection(db, 'whitelist')),
                    getDocs(collection(db, 'admin_whitelist')),
                    getDocs(query(collection(db, 'memory_comments'), orderBy('timestamp', 'desc'), limit(100)))
                ]);
                
                const users = [];
                const seenUids = new Set();

                const processDoc = (doc, isComment = false) => {
                    const data = doc.data();
                    const uid = isComment ? data.userId : doc.id;
                    if (!uid || seenUids.has(uid)) return;
                    
                    let name = data.displayName || data.name || data.userName;
                    if (!name && data.email) name = data.email.split('@')[0];
                    if (!name) name = uid.substring(0, 6);

                    seenUids.add(uid);
                    users.push({ 
                        id: uid, 
                        name: name,
                        photo: data.photoURL || data.photo || data.userPhoto || `https://ui-avatars.com/api/?name=${name}`
                    });
                };

                // Prioritize whitelist info
                whiteSnap.forEach(d => processDoc(d));
                adminSnap.forEach(d => processDoc(d));
                // Supplement with info from recent comments
                commentSnap.forEach(d => processDoc(d, true));

                // Deduplicate by name
                const unique = new Map();
                users.forEach(u => unique.set(u.name, u));
                allUsers = Array.from(unique.values());
                return allUsers;
            } catch (e) {
                console.error("Error fetching users for mentions:", e);
                return [];
            }
        };

        const highlightMentions = (text) => {
            // First replace @[Name] format, then fallback to single word @Name
            return text.replace(/@\[([^\]]+)\]/g, '<span class="mention-tag">@$1</span>')
                       .replace(/@(\w+)/g, '<span class="mention-tag">@$1</span>');
        };

        // Real-time Comment Listener (Always active for this reel to update count)
        const q = query(collection(db, 'memory_comments'), where('memoryId', '==', memoryId), orderBy('timestamp', 'asc'));
        onSnapshot(q, (snapshot) => {
            currentComments = [];
            snapshot.forEach(doc => currentComments.push({ id: doc.id, ...doc.data() }));
            
            // Update comment count on reel instantly (including replies)
            const count = currentComments.length;
            reel.querySelector('.comment-btn span').textContent = count;

            // If panel is open for THIS memory, re-render the list
            const panel = document.getElementById('comment-panel');
            if (panel && panel.classList.contains('active') && panel.dataset.currentMemoryId === memoryId) {
                const listEl = document.getElementById('comments-list');
                renderComments(currentComments, listEl);
            }
        });

        reel.querySelector('.comment-btn').onclick = async () => { 
            const panel = document.getElementById('comment-panel');
            const backstoryEl = document.getElementById('director-backstory');
            if (panel && backstoryEl) {
                backstoryEl.textContent = meta.backstory || meta.text || "No extra notes for this one... yet. Just a pure moment.";
                panel.dataset.currentMemoryId = memoryId; // Track which memory the panel is showing
                panel.classList.add('active');
                
                const listEl = document.getElementById('comments-list');
                renderComments(currentComments, listEl); // Render current state immediately
                
                // Fetch users for mentions in background
                fetchAllUsers();

                // Mentions Logic
                const input = document.getElementById('comment-input');
                const suggestionsEl = document.getElementById('mentions-suggestions');
                
                input.oninput = async (e) => {
                    const value = input.value;
                    const cursorIdx = input.selectionStart;
                    const textBeforeCursor = value.substring(0, cursorIdx);
                    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

                    if (lastAtIdx !== -1) {
                        const query = textBeforeCursor.substring(lastAtIdx + 1).toLowerCase();
                        const users = await fetchAllUsers();
                        const filtered = users.filter(u => u.name.toLowerCase().includes(query));

                        if (filtered.length > 0) {
                            suggestionsEl.innerHTML = '';
                            filtered.forEach(u => {
                                const item = document.createElement('div');
                                item.className = 'mention-item';
                                item.innerHTML = `<img src="${u.photo}"> <span>${u.name}</span>`;
                                item.onclick = () => {
                                    const before = value.substring(0, lastAtIdx);
                                    const after = value.substring(cursorIdx);
                                    // Use @[Name] format for multi-word safety
                                    input.value = `${before}@[${u.name}] ${after}`;
                                    suggestionsEl.style.display = 'none';
                                    input.focus();
                                };
                                suggestionsEl.appendChild(item);
                            });
                            suggestionsEl.style.display = 'flex';
                        } else {
                            suggestionsEl.style.display = 'none';
                        }
                    } else {
                        suggestionsEl.style.display = 'none';
                    }
                };

                // Close suggestions on outside click
                document.addEventListener('click', (e) => {
                    if (!suggestionsEl.contains(e.target) && e.target !== input) {
                        suggestionsEl.style.display = 'none';
                    }
                });

                // Vibe Check (Firestore Backed)
                const vibeButtons = panel.querySelectorAll('.vibe-btn');
                if (user) {
                    getDoc(doc(db, 'shared_profile_data', `vibe_${memoryId}`)).then(snap => {
                        const savedVibe = snap.data()?.vibe;
                        vibeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.vibe === savedVibe));
                    });
                }

                vibeButtons.forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (!user) return showToast("Please sign in first.", "info");
                        const isRemoving = btn.classList.contains('active');
                        vibeButtons.forEach(b => b.classList.remove('active'));
                        if (!isRemoving) {
                            btn.classList.add('active');
                            setDoc(doc(db, 'shared_profile_data', `vibe_${memoryId}`), { 
                                memoryId: memoryId,
                                vibe: btn.dataset.vibe, 
                                timestamp: serverTimestamp() 
                            });
                            showToast(`Vibe check: ${btn.dataset.vibe}`, "success");
                        } else {
                            setDoc(doc(db, 'shared_profile_data', `vibe_${memoryId}`), { vibe: null });
                        }
                    };
                });

                // Comment Submission Logic
                const submitBtn = document.getElementById('submit-comment');
                const replyInfo = document.getElementById('replying-to-info');
                const replyName = document.getElementById('replying-to-name');
                const cancelReply = document.getElementById('cancel-reply');

                const resetReply = () => { replyingTo = null; replyInfo.style.display = 'none'; };
                cancelReply.onclick = resetReply;

                submitBtn.onclick = async () => {
                    const text = input.value.trim();
                    if (!text || !user) return;
                    
                    submitBtn.disabled = true;
                    try {
                        await addDoc(collection(db, 'memory_comments'), {
                            memoryId: memoryId,
                            userId: user.uid,
                            userName: user.displayName || "Friend",
                            userPhoto: user.photoURL || "https://ui-avatars.com/api/?name=" + (user.displayName || "F"),
                            text: text,
                            parentId: replyingTo ? replyingTo.id : null,
                            timestamp: serverTimestamp()
                        });
                        input.value = '';
                        resetReply();
                        suggestionsEl.style.display = 'none';
                    } catch (e) { 
                        console.error("Comment Error:", e);
                        showToast("Error posting comment", "error"); 
                    }
                    submitBtn.disabled = false;
                };

                // Global function for replies (called from renderComments)
                window.setReply = (id, name) => {
                    replyingTo = { id, name };
                    replyName.textContent = name;
                    replyInfo.style.display = 'flex';
                    // Auto-mention with bracketed format for full name support
                    input.value = `@[${name}] ` + input.value.replace(/^@\[?[\w\s]+\]?\s/, '');
                    input.focus();
                };
            }
        };

        function renderComments(comments, container) {
            container.innerHTML = '';
            const user = auth.currentUser;
            const parents = comments.filter(c => !c.parentId);
            
            if (parents.length === 0) {
                container.innerHTML = '<p class="no-comments">Be the first to leave a note...</p>';
                return;
            }

            parents.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const time = c.timestamp ? new Date(c.timestamp.toDate()).toLocaleDateString() : 'Just now';
                const canDelete = user && (user.uid === c.userId || localStorage.getItem('isAdmin')); // Basic check for UI
                
                const deleteIcon = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>`;
                
                item.innerHTML = `
                    <div class="comment-main">
                        <img src="${c.userPhoto}" class="comment-author-pic" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(c.userName)}&background=random'">
                        <div class="comment-text-content">
                            <span class="comment-author-name">${c.userName}</span>
                            <span class="comment-text">${highlightMentions(c.text)}</span>
                            <div class="comment-meta">
                                <span>${time}</span>
                                <button class="comment-reply-btn" onclick="window.setReply('${c.id}', '${c.userName}')">Reply</button>
                                ${canDelete ? `<button class="comment-delete-btn" title="Delete Comment" onclick="window.deleteComment('${c.id}')">${deleteIcon}</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;

                // Render Replies (Support for replying to replies by keeping them under top parent)
                const replies = comments.filter(r => r.parentId === c.id);
                if (replies.length > 0) {
                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'view-replies-btn';
                    toggleBtn.textContent = `View ${replies.length} more ${replies.length === 1 ? 'reply' : 'replies'}`;
                    
                    const repliesContainer = document.createElement('div');
                    repliesContainer.className = 'comment-replies hidden';
                    
                    toggleBtn.onclick = () => {
                        const isHidden = repliesContainer.classList.toggle('hidden');
                        toggleBtn.textContent = isHidden 
                            ? `View ${replies.length} more ${replies.length === 1 ? 'reply' : 'replies'}`
                            : 'Hide replies';
                    };

                    replies.forEach(r => {
                        const rItem = document.createElement('div');
                        rItem.className = 'comment-main';
                        const rTime = r.timestamp ? new Date(r.timestamp.toDate()).toLocaleDateString() : 'Just now';
                        const rCanDelete = user && (user.uid === r.userId || localStorage.getItem('isAdmin'));
                        
                        rItem.innerHTML = `
                            <img src="${r.userPhoto}" class="comment-author-pic" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(r.userName)}&background=random'">
                            <div class="comment-text-content">
                                <span class="comment-author-name">${r.userName}</span>
                                <span class="comment-text">${highlightMentions(r.text)}</span>
                                <div class="comment-meta">
                                    <span>${rTime}</span>
                                    <button class="comment-reply-btn" onclick="window.setReply('${c.id}', '${r.userName}')">Reply</button>
                                    ${rCanDelete ? `<button class="comment-delete-btn" title="Delete Comment" onclick="window.deleteComment('${r.id}')">${deleteIcon}</button>` : ''}
                                </div>
                            </div>
                        `;
                        repliesContainer.appendChild(rItem);
                    });
                    item.appendChild(toggleBtn);
                    item.appendChild(repliesContainer);
                }
                container.appendChild(item);
            });
        }

        // Global functions for comments
        window.deleteComment = async (id) => {
            if (!confirm("Remove this comment and all its replies?")) return;
            try {
                // Fetch all replies to this comment first
                const q = query(collection(db, 'memory_comments'), where('parentId', '==', id));
                const snap = await getDocs(q);
                
                // Delete the comment itself
                await deleteDoc(doc(db, 'memory_comments', id));
                
                // Delete all its replies from Firestore
                const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
                
                showToast("Comment thread removed.", "success");
            } catch (e) {
                console.error("Delete Error:", e);
                showToast("You don't have permission to delete this.", "error");
            }
        };

        // Static Close Panel Logic (Only needs to be set once, but inside the loop for safety in this structure)
        const setupGlobalPanelClose = () => {
            const panel = document.getElementById('comment-panel');
            if (!panel || panel.dataset.initialized) return;
            
            const closeBtn = document.getElementById('close-comment-panel');
            const backdrop = panel.querySelector('.comment-panel-backdrop');
            const close = () => panel.classList.remove('active');
            
            if (closeBtn) closeBtn.onclick = close;
            if (backdrop) backdrop.onclick = close;
            panel.dataset.initialized = "true";
        };
        setupGlobalPanelClose();
        
        // Download Logic
        reel.querySelector('.download-btn').onclick = () => {
            const downloadUrl = meta.video ? resolvePath(meta.video, item.folder) : resolvePath(meta.images[0], item.folder);
            showToast("Saving to your device...", "info");
            downloadResource(downloadUrl, meta.title);
        };

        // Media Playback Logic (Support for Video + Background Audio)
        const video = reel.querySelector('video');
        let backgroundAudio = null;
        if (meta.audio && !meta.video) {
            backgroundAudio = new Audio(resolvePath(meta.audio, item.folder));
            backgroundAudio.loop = true;
        }

        container.appendChild(reel);
        
        // Intersection Observer per reel for precise control
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    reel.classList.add('is-visible');
                    if (video) {
                        video.muted = isGlobalMuted;
                        if (!isGlobalPaused) {
                            video.play().catch(() => {});
                            const vContainer = reel.querySelector('.video-container');
                            if (vContainer) vContainer.classList.remove('paused');
                        } else {
                            video.pause();
                            const vContainer = reel.querySelector('.video-container');
                            if (vContainer) vContainer.classList.add('paused');
                        }
                    }
                    if (backgroundAudio) {
                        backgroundAudio.muted = isGlobalMuted;
                        if (!isGlobalPaused) backgroundAudio.play().catch(() => {});
                        else backgroundAudio.pause();
                    }

                    // Handle carousels specifically
                    if (carousel) {
                        const index = Math.round(carousel.scrollLeft / carousel.offsetWidth);
                        const items = carousel.querySelectorAll('.carousel-item');
                        const v = items[index]?.querySelector('video');
                        const container = items[index]?.querySelector('.video-container');
                        if (v) {
                            v.muted = isGlobalMuted;
                            if (!isGlobalPaused) {
                                v.play().catch(() => {});
                                if (container) container.classList.remove('paused');
                            } else {
                                v.pause();
                                if (container) container.classList.add('paused');
                            }
                        }
                    }
                } else {                    reel.classList.remove('is-visible');
                    if (video) { video.pause(); video.currentTime = 0; }
                    if (backgroundAudio) { backgroundAudio.pause(); backgroundAudio.currentTime = 0; }
                    
                    // Pause all videos in carousel
                    if (carousel) {
                        carousel.querySelectorAll('video').forEach(v => { v.pause(); v.currentTime = 0; });
                    }
                }
            });
        }, { threshold: 0.6 });
        observer.observe(reel);
    });

    // Archive Grid Logic
    setupArchiveGrid(all);
}

function setupArchiveGrid(memories) {
    const openBtn = document.getElementById('open-grid');
    const closeBtn = document.getElementById('close-grid');
    const overlay = document.getElementById('grid-overlay');
    const grid = document.getElementById('archive-grid');
    const reelsContainer = document.getElementById('memories-container');
    const filterBtns = document.querySelectorAll('.filter-btn');

    if (!openBtn || !overlay || !grid || !reelsContainer) {
        console.warn("Archive grid elements not found:", { openBtn: !!openBtn, overlay: !!overlay, grid: !!grid, reelsContainer: !!reelsContainer });
        return;
    }

    let currentFilter = 'all';
    let cherishedIds = new Set();

    const fetchCherished = async () => {
        try {
            const user = auth.currentUser;
            if (!user) return;
            // Fetch documents directly from shared_profile_data where id starts with cherished_
            // Using where memoryId != null as a filter for cherished docs
            const q = query(collection(db, 'shared_profile_data'), where('memoryId', '!=', null));
            const snap = await getDocs(q);
            cherishedIds = new Set(
                snap.docs
                    .filter(d => d.id.startsWith('cherished_') && !d.data().removed)
                    .map(d => d.data().memoryId)
            );
        } catch (e) {
            console.error("Error fetching cherished memories:", e);
        }
    };

    const renderGrid = () => {
        try {
            grid.innerHTML = '';
            const isPrivateUnlocked = localStorage.getItem('private_unlocked');
            
            const filtered = memories.filter((item, index) => {
                const meta = item?.meta;
                if (!meta) return false;
                if (meta.private && !isPrivateUnlocked) return false;
                
                if (currentFilter === 'cherished') {
                    const id = item.folder || `user-${index}`;
                    return cherishedIds.has(id);
                }
                return true;
            });


            if (filtered.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No memories found here yet. ✨</div>`;
                return;
            }

            filtered.forEach((item) => {
                const meta = item.meta;
                const thumb = (meta.thumbs?.length) ? resolvePath(meta.thumbs[0], item.folder) : (meta.images?.length ? resolvePath(meta.images[0], item.folder) : '');
                
                const gridItem = document.createElement('div');
                gridItem.className = 'grid-item';
                gridItem.innerHTML = `
                    <img src="${thumb}" loading="lazy">
                    <div class="grid-item-type">
                        ${meta.video ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>' : (meta.images?.length > 1 ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><rect x="3" y="3" width="13" height="13" rx="2" ry="2"></rect><path d="M21 8v10a3 3 0 0 1-3 3H8"></path></svg>' : '')}
                    </div>
                    <div class="grid-item-title">${meta.title || 'Untitled'}</div>
                `;

                gridItem.onclick = () => {
                    overlay.classList.remove('active');
                    const targetId = item.folder || `user-${memories.indexOf(item)}`;
                    const targetReel = Array.from(reelsContainer.querySelectorAll('.reel-item')).find(r => r.dataset.id === targetId);
                    if (targetReel) targetReel.scrollIntoView({ behavior: 'auto' });
                };
                grid.appendChild(gridItem);
            });
        } catch (e) {
            console.error("Error rendering grid:", e);
        }
    };

    openBtn.onclick = async () => {
        overlay.classList.add('active');
        renderGrid(); // Initial render with available data
        
        // Background fetch cherished items
        await fetchCherished();
        
        // Only re-render if we actually got some cherished items or if we are on the cherished filter
        if (cherishedIds.size > 0 || currentFilter === 'cherished') {
            renderGrid();
        }
    };

    if (closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };

    filterBtns.forEach(btn => {
        btn.onclick = () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderGrid();
        };
    });
}

export function loadGallery() {
    const container = document.getElementById('gallery-grid'); if (!container) return;
    setupPrivacyToggle('private-toggle');

    const sortSelect = document.getElementById('gallery-sort');
    if (sortSelect) sortSelect.onchange = (e) => sortGallery(e.target.value);

    const zoomSlider = document.getElementById('gallery-zoom');
    if (zoomSlider) {
        const savedZoom = localStorage.getItem('gallery_zoom');
        if (savedZoom) {
            zoomSlider.value = savedZoom;
            document.documentElement.style.setProperty('--gallery-min-width', `${savedZoom}px`);
        }
        zoomSlider.oninput = (e) => {
            const size = e.target.value;
            document.documentElement.style.setProperty('--gallery-min-width', `${size}px`);
            localStorage.setItem('gallery_zoom', size);
        };
    }

    const builtIn = GALLERY_DATA.map(item => {
        const getMillis = (val) => {
            if (!val) return 0;
            if (typeof val.toMillis === 'function') return val.toMillis();
            if (typeof val === 'number') return val;
            const d = new Date(val);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        // Prioritize 'date' (media capture date) over 'timestamp' (upload date)
        const ts = item.date ? getMillis(item.date) : getMillis(item.timestamp);
        return { ...item, sortTs: ts };
    });
    galleryState = builtIn.sort((a, b) => b.sortTs - a.sortTs);
    
    sortGallery(sortSelect ? sortSelect.value : 'default');
    
    // Background pre-cache first 40 thumbnails for instant scrolling
    galleryState.slice(0, 40).forEach(item => {
        if (item.thumb) cacheMediaLocally(item.thumb);
        else if (item.src) cacheMediaLocally(item.src);
    });

    initMap();
    updateMapMarkers();
    extractGalleryDates();
}

function sortGallery(mode) {
    galleryState.sort((a, b) => {
        const tA = a.timestamp || 0, tB = b.timestamp || 0;
        return mode === 'date-asc' ? tA - tB : tB - tA;
    });
    renderGalleryGrouped(galleryState, mode === 'default');
}

let currentGalleryVisibleCount = 40;
function renderGalleryGrouped(items, isFlat) {
    const container = document.getElementById('gallery-grid'); if (!container) return;
    container.innerHTML = '';
    const showPrivate = localStorage.getItem('private_unlocked');
    const visible = items.filter(i => (!i.private || showPrivate) && i.src);
    
    // Update Count
    const countEl = document.getElementById('gallery-count');
    if (countEl) {
        const vids = visible.filter(i => i.type === 'video' || i.src.match(/\.(mp4|mov)$/i)).length;
        const pics = visible.length - vids;
        countEl.textContent = `${pics} Photo${pics!==1?'s':''} ${vids>0?', '+vids+' Video'+(vids!==1?'s':''):''}`;
    }

    const lightboxList = visible.map(i => ({ src: i.src, type: (i.type === 'video' || i.src.match(/\.(mp4|mov)$/i)) ? 'video' : 'image' }));
    
    const displayed = visible.slice(0, currentGalleryVisibleCount);
    const groups = {}; const order = [];
    if (isFlat) { groups['All'] = displayed; order.push('All'); }
    else {
        displayed.forEach(item => {
            let key = "Unknown Date";
            if (item.sortTs) {
                const dateObj = new Date(item.sortTs);
                if (!isNaN(dateObj.getTime())) {
                    key = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                }
            }
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push(item);
        });
    }

    let globalIdx = 0;
    order.forEach(key => {
        const section = document.createElement('section'); section.className = 'gallery-section';
        if (!isFlat) {
            const h3 = document.createElement('h3'); h3.className = 'gallery-month-heading'; h3.textContent = key;
            section.appendChild(h3);
        }
        const grid = document.createElement('div');
        grid.className = 'gallery-month-grid';
        groups[key].forEach(item => {
            const el = document.createElement('div'); el.className = 'gallery-item';
            const isVid = item.type === 'video' || item.src.match(/\.(mp4|mov)$/i);
            const thumb = item.thumb || item.src;
            
            if (isVid) {
                if (item.thumb) {
                    el.innerHTML = `<img src="${item.thumb}" loading="lazy" crossorigin="anonymous"><div class="video-badge">▶</div>`;
                } else {
                    el.innerHTML = `<video src="${item.src}#t=0.1" muted loading="lazy" style="width:100%; height:100%; object-fit:cover;"></video><div class="video-badge">▶</div>`;
                }
            } else {
                const imgThumb = item.thumb || item.src;
                el.innerHTML = `<img src="${imgThumb}" loading="lazy" crossorigin="anonymous">`;
            }
            
            const idx = globalIdx++; el.onclick = () => openLightbox(idx, lightboxList);
            grid.appendChild(el);
        });
        section.appendChild(grid); container.appendChild(section);
    });

    // Infinite Scroll Handler
    if (visible.length > currentGalleryVisibleCount) {
        const sentinel = document.createElement('div');
        sentinel.style.height = '100px';
        container.appendChild(sentinel);
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                obs.disconnect();
                currentGalleryVisibleCount += 40;
                renderGalleryGrouped(items, isFlat);
            }
        });
        obs.observe(sentinel);
    }
}

let lbIndex = 0, lbItems = [];
export function openLightbox(index, items) {
    lbIndex = index; lbItems = items;
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    updateLightboxView();
    lightbox.classList.add('active');

    // Navigation Controls
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.onclick = () => lightbox.classList.remove('active');

    const leftBtn = lightbox.querySelector('.lightbox-nav.left');
    if (leftBtn) leftBtn.onclick = (e) => { e.stopPropagation(); navigateLightbox(-1); };

    const rightBtn = lightbox.querySelector('.lightbox-nav.right');
    if (rightBtn) rightBtn.onclick = (e) => { e.stopPropagation(); navigateLightbox(1); };

    lightbox.onclick = (e) => { if (e.target === lightbox) lightbox.classList.remove('active'); };
}
window.openLightbox = openLightbox;

function navigateLightbox(dir) {
    const newIdx = lbIndex + dir;
    if (newIdx >= 0 && newIdx < lbItems.length) {
        lbIndex = newIdx;
        updateLightboxView();
    }
}

function updateLightboxView() {
    const item = lbItems[lbIndex], img = document.getElementById('lightbox-img'), vid = document.getElementById('lightbox-video');
    const dlBtn = document.getElementById('lightbox-download');
    const lightbox = document.getElementById('lightbox');
    const leftBtn = lightbox?.querySelector('.lightbox-nav.left');
    const rightBtn = lightbox?.querySelector('.lightbox-nav.right');

    if (leftBtn) leftBtn.style.display = lbIndex > 0 ? 'flex' : 'none';
    if (rightBtn) rightBtn.style.display = lbIndex < lbItems.length - 1 ? 'flex' : 'none';

    // Instant Clear to prevent visual lag
    img.style.display = 'none'; 
    vid.style.display = 'none';
    vid.pause();
    vid.src = ''; 
    img.src = '';

    if (item.type === 'video') { 
        vid.style.display = 'block'; vid.src = item.src; 
        if(lightbox?.classList.contains('active')) vid.play().catch(()=>{}); 
    }
    else { img.style.display = 'block'; img.src = item.src; img.crossOrigin = "anonymous"; }

    if (dlBtn) {
        dlBtn.onclick = (e) => {
            e.preventDefault();
            downloadResource(item.src, item.filename || 'archive_item');
        };
    }
}

let physicsAnimationId = null;
export function loadJokes() {
    const container = document.getElementById('jokes-container'); if (!container) return;
    if (physicsAnimationId) { cancelAnimationFrame(physicsAnimationId); physicsAnimationId = null; }

    const modal = document.getElementById('joke-modal');
    if (modal) {
        const closeBtn = modal.querySelector('.lightbox-close');
        const closeModal = () => modal.classList.remove('active');
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    container.innerHTML = '';
    const physicsBubbles = [];
    const mouse = { x: -1000, y: -1000 };
    const updateMouse = (e) => {
        const t = (e.touches && e.touches.length > 0) ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
        if (t) {
            mouse.x = t.clientX;
            mouse.y = t.clientY;
        }
    };
    
    const onMove = (e) => {
        updateMouse(e);
        if (physicsBubbles.some(b => b.isDragging)) {
            if (e.cancelable) e.preventDefault();
        }
    };
    const onEnd = () => {
        physicsBubbles.forEach(b => {
            b.isDragging = false;
            b.isHovered = false;
        });
        // UI/UX Expert Fix: Reset mouse position so bubbles stop repelling the last touch area
        mouse.x = -1000;
        mouse.y = -1000;
    };

    window.onmousemove = onMove;
    window.ontouchmove = onMove;
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    
    // Extra security: Global touch listener for this page to kill scrolling
    document.addEventListener('touchmove', (e) => {
        if (document.body.classList.contains('jokes-page')) {
            if (e.cancelable) e.preventDefault();
        }
    }, { passive: false });
    
    const updateSizes = () => {
        const isMob = window.innerWidth < 768;
        const base = isMob ? 80 : 120, growth = isMob ? 15 : 30;
        physicsBubbles.forEach(b => {
            const s = base + (b.tier * growth);
            b.radius = s / 2; b.element.style.width = b.element.style.height = `${s}px`;
            b.element.style.fontSize = `${s * 0.14}px`;
        });
    };

    const baseHue = Math.floor(Math.random() * 360);
    JOKES_DATA.forEach((joke, i) => {
        const bubble = document.createElement('div'); bubble.className = 'joke-bubble';
        const tier = joke.sizeTier || 2;
        bubble.style.setProperty('--b-hue', (baseHue + (i * 137.5)) % 360);
        bubble.innerHTML = `<div class="joke-bubble-inner">${joke.title}</div><div class="bubble-highlight"></div>`;
        container.appendChild(bubble);
        requestAnimationFrame(() => bubble.style.opacity = '1');

        const obj = { 
            element: bubble, highlight: bubble.querySelector('.bubble-highlight'), tier,
            x: Math.random() * (window.innerWidth - 150), y: Math.random() * (window.innerHeight - 150),
            vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
            radius: 0, isDragging: false, isHovered: false, hx: 0, hy: 0
        };
        
        bubble.onmouseenter = () => obj.isHovered = true;
        bubble.onmouseleave = () => obj.isHovered = false;
        
        let downPos = {x:0, y:0};
        
        const startDrag = (e) => {
            updateMouse(e); // Fix jump: sync mouse pos immediately
            obj.isDragging = true;
            downPos = {x: mouse.x, y: mouse.y};
        };

        bubble.onmousedown = startDrag;
        bubble.ontouchstart = startDrag;

        const handleSelect = (e) => {
            const t = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0] : e;
            // Movement threshold for click vs drag
            if (Math.hypot(t.clientX - downPos.x, t.clientY - downPos.y) < 15) {
                document.getElementById('joke-title').innerHTML = formatNoteText(joke.title);
                document.getElementById('joke-text').innerHTML = formatNoteText(joke.text);
                modal.classList.add('active');
            }
        };

        bubble.onclick = handleSelect;
        bubble.addEventListener('touchend', (e) => {
            // Only handle as click if we were dragging this specific bubble
            if (obj.isDragging) handleSelect(e);
        });

        physicsBubbles.push(obj);
    });

    updateSizes();
    window.onresize = updateSizes;

    function step() {
        if (!document.getElementById('jokes-container')) return;
        
        // Performance Optimization: Stop loop if user switches tabs
        if (document.hidden) {
            physicsAnimationId = requestAnimationFrame(step);
            return;
        }

        const w = window.innerWidth, h = window.innerHeight;
        physicsBubbles.forEach((b, i) => {
            if (b.isDragging) {
                b.vx = (mouse.x - b.radius - b.x) * 0.3; b.vy = (mouse.y - b.radius - b.y) * 0.3;
            } else {
                const dx = b.x + b.radius - mouse.x, dy = b.y + b.radius - mouse.y, dist = Math.hypot(dx, dy);
                if (dist < 250) { const f = (250 - dist) / 250; b.vx += (dx / dist) * f * 1.5; b.vy += (dy / dist) * f * 1.5; }
                b.vx += (Math.random() - 0.5) * 0.1; b.vy += (Math.random() - 0.5) * 0.1;
                const speed = Math.hypot(b.vx, b.vy), max = 3.5;
                if (speed > max) { b.vx = (b.vx / speed) * max; b.vy = (b.vy / speed) * max; }
            }
            b.x += b.vx; b.y += b.vy;
            if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); } else if (b.x + b.radius*2 > w) { b.x = w - b.radius*2; b.vx = -Math.abs(b.vx); }
            if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); } else if (b.y + b.radius*2 > h) { b.y = h - b.radius*2; b.vy = -Math.abs(b.vy); }

            for (let j = i + 1; j < physicsBubbles.length; j++) {
                const b2 = physicsBubbles[j], dx = (b2.x + b2.radius) - (b.x + b.radius), dy = (b2.y + b2.radius) - (b.y + b.radius);
                const d = Math.hypot(dx, dy), minDist = b.radius + b2.radius;
                if (d < minDist) {
                    const angle = Math.atan2(dy, dx), tx = Math.cos(angle), ty = Math.sin(angle);
                    const force = (minDist - d) * 0.05; b.vx -= tx * force; b.vy -= ty * force; b2.vx += tx * force; b2.vy += ty * force;
                }
            }
            b.element.style.transform = `translate(${b.x}px, ${b.y}px) scale(${b.isHovered ? 1.15 : 1})`;
            
            // Highlight Engine
            const hdx = mouse.x - (b.x + b.radius), hdy = mouse.y - (b.y + b.radius), hd = Math.hypot(hdx, hdy) || 1;
            const maxM = b.radius * 0.45, tX = (hdx / hd) * Math.min(hd, 100) / 100 * maxM, tY = (hdy / hd) * Math.min(hd, 100) / 100 * maxM;
            b.hx += (tX - b.vx * 2 - b.hx) * 0.15; b.hy += (tY - b.vy * 2 - b.hy) * 0.15;
            b.highlight.style.transform = `translate(calc(-50% + ${b.hx}px), calc(-50% + ${b.hy}px))`;
        });
        physicsAnimationId = requestAnimationFrame(step);
    }
    physicsAnimationId = requestAnimationFrame(step);
}

function initMemoriesNav() {
    if (document.querySelector('.memories-gate')) return;
    const nav = document.querySelector('.navbar');
    if (!nav) return;

    if (!sessionStorage.getItem('memories_unlocked')) {
        const gate = document.createElement('div');
        gate.className = 'memories-gate';
        gate.innerHTML = `
            <div class="gate-content">
                <h2 class="gate-title">Ready to relive the chaos?</h2>
                <p class="gate-sub">The timeline is waiting. Turn up the noise.</p>
                <div class="sound-visualizer" id="gate-pulse">
                    <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                    <span class="unlock-text">Enter the Flow</span>
                </div>
            </div>`;
        document.body.appendChild(gate);
        document.body.style.overflow = 'hidden';

        gate.querySelector('#gate-pulse').onclick = () => {
            const sound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
            sound.volume = 0.4;
            sound.play().finally(() => {
                gate.classList.add('unlocked');
                document.body.style.overflow = '';
                sessionStorage.setItem('memories_unlocked', 'true');
                setTimeout(() => gate.remove(), 1200);
            });
        };
    }
}

function initMemoryScrollbar() {
    const container = document.getElementById('memories-container');
    const cards = Array.from(container.querySelectorAll('.memory-card'));
    if (!cards.length) return;
    let bar = document.querySelector('.memory-scroll-bar'); if (bar) bar.remove();
    bar = document.createElement('div'); bar.className = 'memory-scroll-bar';
    const indicator = document.createElement('div'); indicator.id = 'memory-scroll-indicator';
    bar.appendChild(indicator);
    const tooltip = document.createElement('div'); tooltip.id = 'memory-scroll-tooltip';
    document.body.appendChild(tooltip);
    cards.forEach((card, i) => {
        const dot = document.createElement('div'); dot.className = 'memory-scroll-item'; dot.textContent = i + 1;
        dot.onclick = () => card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dot.onmouseenter = () => { tooltip.textContent = card.dataset.title; tooltip.style.opacity = '1'; const r = dot.getBoundingClientRect(); tooltip.style.top = r.top + 'px'; tooltip.style.right = (window.innerWidth - r.left + 10) + 'px'; };
        dot.onmouseleave = () => tooltip.style.opacity = '0';
        bar.appendChild(dot);
    });
    document.body.appendChild(bar);
    window.addEventListener('scroll', () => {
        const mid = window.innerHeight / 2; let active = 0;
        cards.forEach((c, i) => { const r = c.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) active = i; });
        const dots = bar.querySelectorAll('.memory-scroll-item');
        dots.forEach(d => d.classList.remove('active'));
        if (dots[active]) { dots[active].classList.add('active'); indicator.style.top = dots[active].offsetTop + 'px'; }
    });
}

function setupPrivacyToggle() {
    initSecretGesture();
}
function showPrivatePrompt() {
    if (document.getElementById('private-prompt')) {
        const p = document.getElementById('private-prompt');
        p.style.display = 'flex';
        setTimeout(() => p.style.opacity = '1', 10);
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'private-prompt';
    modal.className = 'lock-overlay';
    modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 11000; display: flex; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s;";
    
    modal.innerHTML = `
        <div class="lock-card" style="position: relative;">
            <button onclick="const m=this.parentElement.parentElement; m.style.opacity='0'; setTimeout(()=>m.style.display='none',300)" style="position:absolute; top:15px; right:15px; background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer;">&times;</button>
            <h2 style="color: var(--text-main);">Private Access</h2>
            <p style="margin-bottom: 5px; color: var(--text-main); font-weight: 500;">Enter the secret key.</p>
            <p style="font-size: 0.8rem; color: var(--text-muted); opacity: 0.6; margin-bottom: 20px;">Hint: Name of our go-to street</p>
            
            <form id="private-auth-form" style="width: 100%;">
                <div style="position: relative; width: 100%; margin-bottom: 20px;">
                    <input type="password" id="private-input" name="password" class="lock-input" placeholder="Answer..." style="margin: 0; padding-right: 40px;" autofocus>
                    <button type="button" id="toggle-pw" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">👁️</button>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%;">Unlock</button>
            </form>
            <p id="private-msg" style="margin-top:10px; font-size: 0.9rem; min-height: 1.2em;"></p>
        </div>
    `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.style.opacity = '1');

    const form = modal.querySelector('#private-auth-form');
    const input = modal.querySelector('#private-input');
    const toggleBtn = modal.querySelector('#toggle-pw');
    const msg = modal.querySelector('#private-msg');

    toggleBtn.onclick = () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        toggleBtn.textContent = input.type === 'password' ? '👁️' : '🙈';
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        // Final attempt to fetch key if it's missing (fixes 'Key not loaded' bug)
        if (!window.SECRET_KEY) {
            try {
                const snap = await getDoc(doc(db, 'config', 'secrets'));
                if (snap.exists()) window.SECRET_KEY = snap.data().privateKey;
            } catch(err) { console.error("Emergency key fetch failed:", err); }
        }

        const target = window.SECRET_KEY;
        if (!target) {
            msg.textContent = 'System error: Key not loaded.';
            return;
        }
        if (input.value.trim().toLowerCase() === target.toLowerCase()) {
            localStorage.setItem('private_unlocked', 'true');
            location.reload();
        } else {
            msg.textContent = 'Incorrect.';
            msg.style.color = '#ff6b6b';
            input.value = '';
        }
    };
}

function initSecretGesture() {
    const logo = document.querySelector('.nav-brand');
    if (!logo) return;
    
    if (logo.dataset.gestureInitialized === 'true') return;
    logo.dataset.gestureInitialized = 'true';

    // Ensure only one loader ever exists
    let loader = document.getElementById('secret-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'secret-loader';
        loader.style.cssText = `
            position: fixed; 
            bottom: 150px; 
            left: 50%; 
            transform: translateX(-50%); 
            width: 60px; 
            height: 60px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-weight: bold; 
            color: var(--text-main); 
            font-size: 1.2rem; 
            opacity: 0; 
            transition: opacity 0.3s; 
            z-index: 10000; 
            border: 2px solid rgba(255,255,255,0.05);
            background: rgba(0,0,0,0.2);
            backdrop-filter: blur(10px);
            font-family: var(--font-body);
            pointer-events: none;
        `;
        document.body.appendChild(loader);
    }

    let holdStart = 0, frameId = null, unlocked = false;
    const REQUIRED_TIME = 3000;

    const updateVisuals = () => {
        if (unlocked) return;
        if (!holdStart) {
            loader.style.opacity = '0';
            loader.style.background = 'rgba(0,0,0,0.2)'; // Reset background
            logo.style.transform = 'scale(1)';
            logo.style.textShadow = 'none';
            return;
        }

        const elapsed = Date.now() - holdStart;
        const progress = Math.min(elapsed / REQUIRED_TIME, 1);
        
        logo.style.transform = `scale(${1 + progress * 0.2})`;
        logo.style.textShadow = `0 0 ${progress * 20}px var(--accent-primary)`;
        
        loader.style.opacity = '1';
        // Clean conic-gradient logic: fills clockwise
        loader.style.background = `conic-gradient(var(--accent-primary) ${progress * 100}%, rgba(255,255,255,0.1) 0%)`;
        
        const remaining = Math.max(0, Math.ceil((REQUIRED_TIME - elapsed) / 1000));
        loader.textContent = remaining > 0 ? remaining : "✨";

        if (progress >= 1) {
            unlocked = true;
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            
            loader.style.opacity = '0';
            logo.style.transform = 'scale(1)';
            logo.style.textShadow = '0 0 20px var(--accent-primary)';
            
            const isUnlocked = localStorage.getItem('private_unlocked');
            if (isUnlocked) {
                localStorage.removeItem('private_unlocked');
                sessionStorage.setItem('show_vault_locked_toast', 'true');
                location.reload();
            } else {
                showPrivatePrompt();
            }
        } else {
            frameId = requestAnimationFrame(updateVisuals);
        }
    };

    const resetGesture = () => {
        if (unlocked) return; 
        holdStart = 0;
        cancelAnimationFrame(frameId);
        updateVisuals();
    };

    const startHold = (e) => {
        if (unlocked) return;
        // Don't preventDefault here, as it blocks scrolling.
        // We only prevent it in the logo.onclick if it was a long press.
        holdStart = Date.now();
        frameId = requestAnimationFrame(updateVisuals);
    };

    logo.addEventListener('mousedown', startHold);
    logo.addEventListener('touchstart', startHold, { passive: true });
    window.addEventListener('mouseup', resetGesture, true);
    window.addEventListener('touchend', resetGesture, true);
    window.addEventListener('touchcancel', resetGesture, true);
    logo.addEventListener('mouseleave', resetGesture);

    logo.oncontextmenu = (e) => {
        if (holdStart || unlocked) e.preventDefault();
    };

    logo.onclick = (e) => {
        const elapsed = holdStart ? Date.now() - holdStart : 0;
        // If it was a hold longer than 500ms, prevent the click (navigation)
        if (elapsed > 500 || unlocked) {
            e.preventDefault();
            e.stopPropagation();
            if (elapsed > 500) holdStart = 0;
            return false;
        }
    };
}

async function initMap() {
    const mapEl = document.getElementById('gallery-map');
    if (!mapEl) return;

    if (window.map) {
        window.map.remove();
        window.map = null;
    }

    window.map = L.map('gallery-map', {
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: true,
        markerZoomAnimation: true
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(window.map);
    
    // UI/UX Expert Fix: Apply a slight brightness filter to the map tiles only
    const tiles = mapEl.querySelector('.leaflet-tile-pane');
    if (tiles) tiles.style.filter = 'brightness(0.8) contrast(1.1) saturate(0.8)';
}

function updateMapMarkers() {
    if (!window.map) return;
    // Expert Fix: Use window.GALLERY_DATA which is already sorted and fetched
    const mapList = (window.GALLERY_DATA || []).filter(item => item.lat && item.lon);
    
    const bounds = [];
    mapList.forEach((item, index) => {
        addToMap(item.lat, item.lon, item.thumb || item.src, index, mapList);
        bounds.push([item.lat, item.lon]);
    });
    if (bounds.length > 0) window.map.fitBounds(bounds, { padding: [50, 50] });
}

function addToMap(lat, lon, thumb, index, mapList) {
    const icon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="marker-thumb" style="background-image: url(${thumb}); border: 2px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.5);"></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 44]
    });
    const marker = L.marker([lat, lon], { icon }).addTo(window.map);
    marker.bindPopup(`<img src="${thumb}" style="width:120px; height:80px; object-fit:cover; border-radius:5px;">`, { closeButton: false, offset: [0, -10] });
    marker.on('mouseover', function() { this.openPopup(); });
    marker.on('mouseout', function() { this.closePopup(); });
    marker.on('click', () => openLightbox(index, mapList));
}

function extractGalleryDates() {
    // Logic to populate a date-picker or month-jumper if needed
}
