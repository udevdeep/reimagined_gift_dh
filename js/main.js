import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, getDoc, getDocs, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { resolvePath, getContrastYIQ, showToast, downloadResource } from "./utils.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB8zvSjJnKFQEuASiWoXx3u9sMKfCcbTDs",
    authDomain: "collegegift-20949.firebaseapp.com",
    projectId: "collegegift-20949",
    storageBucket: "collegegift-20949.firebasestorage.app",
    messagingSenderId: "757528963770",
    appId: "1:757528963770:web:b0a65e179d58b9e676b083",
    measurementId: "G-L8ZQK4DBF9"
};

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Register Service Worker for local video caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
    });
}

// Function to cache the video in the background for local-speed on next load
async function cacheVideoLocally(url) {
    if (!url || !('caches' in window)) return;
    const cache = await caches.open('video-cache');
    const matched = await cache.match(url);
    if (!matched) {
        console.log("Caching video locally for faster playback...");
        // Use fetch with 'cors' and 'include' to ensure it's cached properly
        fetch(url).then(res => {
            if (res.ok) cache.put(url, res);
        }).catch(e => console.warn("Failed to cache video", e));
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

let _memoryAutoScrollTimer = null;
let _memoryAutoScrollEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    applyCacheImmediate();
    initFirebaseLock();
    handleMobileNav();
    if (document.getElementById('intro-video')) initHome();
    window.addEventListener('resize', handleMobileNav);
});

function handleMobileNav() {
    const nav = document.querySelector('.navbar');
    const links = document.querySelector('.nav-links');
    if (!nav || !links) return;
    if (window.innerWidth <= 768) {
        if (links.parentNode === nav) { document.body.appendChild(links); links.classList.add('mobile-dock'); }
    } else {
        if (links.parentNode === document.body) {
            const toggle = nav.querySelector('.theme-toggle-btn');
            if (toggle) nav.insertBefore(links, toggle); else nav.appendChild(links);
            links.classList.remove('mobile-dock');
        }
    }
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
    if (cachedHome) try { applyHomeConfig(JSON.parse(cachedHome)); } catch(e) {}
    if (cachedLetter) try {
        const data = JSON.parse(cachedLetter);
        LETTER_TEXT = data.text || ''; window.LETTER_CLOSING = data.closingLine || '';
        if (document.getElementById('letter-content')) document.getElementById('letter-content').textContent = LETTER_TEXT;
        if (document.getElementById('letter-closing-line')) document.getElementById('letter-closing-line').textContent = window.LETTER_CLOSING || "";
    } catch(e) {}
}

function initFirebaseLock() {
    const overlay = document.getElementById('lock-overlay');
    const loginBtn = document.getElementById('google-login-btn');
    const isIndex = document.body.classList.contains('index-page');

    if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(console.error);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            localStorage.setItem(LOCK_KEY, Date.now() + (7 * 24 * 60 * 60 * 1000));
            if (overlay) overlay.style.display = 'none';
            startApp();
        } else {
            const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
            if (isIndex) {
                // On index page, the lock overlay is triggered by the pre-landing 'Begin' button
                // We do nothing here, the initHome will handle it.
                if (overlay) overlay.style.display = 'none';
            } else {
                // For other pages, show it if we are certain they are logged out.
                if (overlay) overlay.style.display = 'flex';
            }
        }
    });
}

async function startApp() {
    document.body.style.visibility = 'visible'; document.body.style.opacity = '1';
    recordVisit();
    try { await loadAllData(); } catch (e) { console.error(e); }
    if (document.getElementById('memories-container')) { loadMemories(); initMemoriesNav(); }
    if (document.getElementById('gallery-grid')) loadGallery();
    if (document.getElementById('jokes-container')) loadJokes();
    hideLoader();
    
    // If on home page and already entered, start scroll
    if (document.getElementById('letter-content') && sessionStorage.getItem('entered_archive')) {
        initCinematicScroll();
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; }, 600);
    }
}

async function recordVisit() {
    if (!auth.currentUser || sessionStorage.getItem('visit_recorded')) return;
    try {
        await addDoc(collection(db, 'site_visits'), { userId: auth.currentUser.uid, userName: auth.currentUser.displayName || "Friend", userEmail: auth.currentUser.email || "Anonymous", timestamp: serverTimestamp() });
        sessionStorage.setItem('visit_recorded', 'true');
    } catch (e) {}
}

async function loadAllData() {
    const tasks = [
        getDocs(collection(db, 'jokes')), getDocs(collection(db, 'gallery')), getDocs(collection(db, 'memories')),
        getDoc(doc(db, 'config', 'home')), getDoc(doc(db, 'config', 'secrets')), getDoc(doc(db, 'config', 'letter')), getDoc(doc(db, 'config', 'feelingLow'))
    ];
    const [jokesSnap, gallerySnap, memoriesSnap, homeDoc, secretsDoc, letterDoc, lowDoc] = await Promise.all(tasks);
    if (!jokesSnap.empty) { JOKES_DATA = jokesSnap.docs.map(doc => doc.data()); window.JOKES_DATA = JOKES_DATA; sessionStorage.setItem('jokes_cache', JSON.stringify(JOKES_DATA)); }
    if (!gallerySnap.empty) {
        GALLERY_DATA = gallerySnap.docs.map(doc => ({ ...doc.data(), date: doc.data().date ? new Date(doc.data().date) : new Date(0) }));
        GALLERY_DATA.sort((a, b) => b.date - a.date); window.GALLERY_DATA = GALLERY_DATA; sessionStorage.setItem('gallery_cache', JSON.stringify(GALLERY_DATA));
    }
    if (!memoriesSnap.empty) { MEMORIES_DATA = memoriesSnap.docs.map(doc => ({ folder: doc.id, meta: doc.data() })); window.MEMORIES_DATA = MEMORIES_DATA; sessionStorage.setItem('memories_cache', JSON.stringify(MEMORIES_DATA)); }
    if (homeDoc.exists()) { applyHomeConfig(homeDoc.data()); sessionStorage.setItem('home_cache', JSON.stringify(homeDoc.data())); }
    SECRET_KEY = secretsDoc.data()?.privateKey || 'bumblebee';
    if (letterDoc.exists()) {
        LETTER_TEXT = letterDoc.data().text || ''; window.LETTER_CLOSING = letterDoc.data().closingLine || '';
        if (document.getElementById('letter-content')) document.getElementById('letter-content').textContent = LETTER_TEXT;
        if (document.getElementById('letter-closing-line')) document.getElementById('letter-closing-line').textContent = window.LETTER_CLOSING || "";
    }
    if (lowDoc.exists()) { ALONE_TEXT = lowDoc.data().aloneText || ALONE_TEXT; window.ALONE_TEXT = ALONE_TEXT; }
}

function applyHomeConfig(data) {
    const videoEl = document.getElementById('intro-video');
    if (videoEl) {
        if (data.introVideoThumbnail) videoEl.poster = data.introVideoThumbnail;
        if (data.introVideo && videoEl.src !== data.introVideo) { 
            videoEl.src = data.introVideo; 
            videoEl.load(); 
            // Cache locally for next time (150MB is large!)
            cacheVideoLocally(data.introVideo);
            if (data.introVideoThumbnail) cacheVideoLocally(data.introVideoThumbnail);
        }
    }
}

function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const update = (isBarbie) => { if(btn) btn.innerHTML = isBarbie ? '🌙' : '🎀'; };
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
    const pre = document.getElementById('pre-landing');
    const overlay = document.getElementById('lock-overlay');
    if (!pre) return;

    if (sessionStorage.getItem('entered_archive')) {
        pre.style.display = 'none';
        return;
    }

    document.getElementById('pre-landing-begin').onclick = () => {
        // If not logged in, show the lock screen instead of entering
        const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
        if (!auth.currentUser || expiry < Date.now()) {
            if (overlay) {
                overlay.style.display = 'flex';
                // We don't hide the pre-landing yet, it will hide after login
            }
            return;
        }

        sessionStorage.setItem('entered_archive', 'true');
        pre.style.opacity = '0'; pre.style.pointerEvents = 'none';
        setTimeout(() => {
            pre.style.display = 'none';
            initCinematicScroll();
        }, 1500);
    };
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
    const speed = 0.8; 

    // --- Navbar & Indicator logic from old code ---
    let mouseAtTop = true;
    const updateNavVisibility = () => {
        if (!nav) return;
        const currentScroll = container.scrollTop;
        const wasAtTop = currentScroll < 50;
        
        if (indicator) {
            if (currentScroll > 100 || scrollActive) indicator.classList.add('hidden');
            else indicator.classList.remove('hidden');
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
            if (indicator) indicator.classList.add('hidden');
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
        
        if (indicator && currentScroll > 100) indicator.classList.add('hidden');
        
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
    }, 1500);
}

export function loadMemories() {
    const container = document.getElementById('memories-container');
    if (!container) return;

    // Privacy Toggle Logic
    setupPrivacyToggle('private-toggle');

    const fragment = document.createDocumentFragment();
    const userMemories = JSON.parse(localStorage.getItem('user_memories') || '[]');
    const all = [...userMemories, ...MEMORIES_DATA];
    container.innerHTML = '';
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    all.forEach(item => {
        const meta = item.meta; if (meta.private && !localStorage.getItem('private_unlocked')) return;
        const card = document.createElement('div'); card.className = 'card memory-card'; card.dataset.title = meta.title;
        if (meta.themeColor && meta.themeColor !== '#ffffff') { card.style.backgroundColor = meta.themeColor; card.style.color = getContrastYIQ(meta.themeColor); }
        let media = '';
        if (meta.video) {
            const thumb = (meta.thumbs?.length) ? resolvePath(meta.thumbs[0], item.folder) : (meta.images?.length ? resolvePath(meta.images[0], item.folder) : '');
            media = `<div class="memory-media-wrapper video-wrapper" style="background-image: url('${thumb}')"><video src="${resolvePath(meta.video, item.folder)}" muted loop playsinline class="memory-video" loading="lazy"></video><div class="play-icon">▶</div></div>`;
        } else if (meta.images?.length) {
            const firstThumb = resolvePath(meta.thumbs?.[0] || meta.images[0], item.folder);
            media = `<div class="memory-media-wrapper image-wrapper" data-images='${JSON.stringify(meta.images)}' data-thumbs='${JSON.stringify(meta.thumbs || meta.images)}' data-folder="${item.folder || ''}" data-index="0" style="background-image: url('${firstThumb}')"><img src="${firstThumb}" loading="lazy" class="memory-main-img">${meta.images.length > 1 ? '<button class="img-arrow left">◀</button><button class="img-arrow right">▶</button>' : ''}</div>`;
        }
        card.innerHTML = `${media}<div class="memory-content"><h3>${meta.title}</h3><p style="white-space: pre-wrap;">${meta.text || ''}</p>${meta.date ? `<small class="memory-date">${meta.date}</small>` : ''}</div>`;
        setupMediaListeners(card, meta, item.folder);
        fragment.appendChild(card);
        observer.observe(card);
    });
    container.appendChild(fragment);
    initMemoryScrollbar(); initMemoryAutoScrollToggle();
}

function setupMediaListeners(card, meta, folder) {
    const video = card.querySelector('video');
    const wrapper = card.querySelector('.memory-media-wrapper');
    let audio = meta.audio ? new Audio(resolvePath(meta.audio, folder)) : null;
    if (audio) audio.volume = 0.5;
    card.onmouseenter = () => {
        if (audio) audio.play().catch(()=>{});
        if (video) { video.muted = false; video.play().catch(()=>{}); }
        if (wrapper?.classList.contains('image-wrapper')) startSlider(wrapper);
    };
    card.onmouseleave = () => {
        if (audio) { audio.pause(); audio.currentTime = 0; }
        if (video) { video.pause(); video.currentTime = 0; video.muted = true; }
        if (wrapper?.classList.contains('image-wrapper')) stopSlider(wrapper);
    };
    if (wrapper?.classList.contains('image-wrapper')) setupSliderButtons(wrapper);
}

let sliderIntervals = new Map();
function startSlider(wrapper) {
    const images = JSON.parse(wrapper.dataset.images || '[]'); if (images.length <= 1) return;
    sliderIntervals.set(wrapper, setInterval(() => {
        wrapper.dataset.index = (parseInt(wrapper.dataset.index) + 1) % images.length;
        updateSliderImg(wrapper);
    }, 4000));
}
function stopSlider(wrapper) { clearInterval(sliderIntervals.get(wrapper)); sliderIntervals.delete(wrapper); }
function updateSliderImg(wrapper) {
    const thumbs = JSON.parse(wrapper.dataset.thumbs || '[]');
    const src = resolvePath(thumbs[parseInt(wrapper.dataset.index)], wrapper.dataset.folder);
    const img = wrapper.querySelector('.memory-main-img');
    if (img) img.src = src; wrapper.style.backgroundImage = `url('${src}')`;
}
function setupSliderButtons(wrapper) {
    const images = JSON.parse(wrapper.dataset.images || '[]');
    wrapper.querySelector('.left').onclick = (e) => { e.stopPropagation(); wrapper.dataset.index = (parseInt(wrapper.dataset.index) - 1 + images.length) % images.length; updateSliderImg(wrapper); };
    wrapper.querySelector('.right').onclick = (e) => { e.stopPropagation(); wrapper.dataset.index = (parseInt(wrapper.dataset.index) + 1) % images.length; updateSliderImg(wrapper); };
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

    const builtIn = GALLERY_DATA.map(item => ({ ...item, timestamp: item.date?.getTime() || 0 }));
    galleryState = builtIn.sort((a, b) => b.timestamp - a.timestamp);
    
    sortGallery(sortSelect ? sortSelect.value : 'default');
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
            const key = item.date && !isNaN(item.date) ? item.date.toLocaleString('default', { month: 'long', year: 'numeric' }) : "Unknown Date";
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
                    el.innerHTML = `<img src="${item.thumb}" loading="lazy"><div class="video-badge">▶</div>`;
                } else {
                    el.innerHTML = `<video src="${item.src}#t=0.1" muted loading="lazy" style="width:100%; height:100%; object-fit:cover;"></video><div class="video-badge">▶</div>`;
                }
            } else {
                const imgThumb = item.thumb || item.src;
                el.innerHTML = `<img src="${imgThumb}" loading="lazy">`;
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
    else { img.style.display = 'block'; img.src = item.src; }

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
    window.onmousemove = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
    
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
        bubble.onmousedown = e => { obj.isDragging = true; downPos = {x:e.clientX, y:e.clientY}; };
        window.addEventListener('mouseup', () => obj.isDragging = false);
        bubble.onclick = e => {
            if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 5) {
                document.getElementById('joke-title').textContent = joke.title;
                document.getElementById('joke-text').textContent = joke.text;
                modal.classList.add('active');
            }
        };
        physicsBubbles.push(obj);
    });

    updateSizes();
    window.onresize = updateSizes;

    function step() {
        if (!document.getElementById('jokes-container')) return;
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
    const nav = document.querySelector('.navbar');
    const header = document.querySelector('.header-section');
    if (!nav || !header) return;

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
                startMemoryAutoScroll();
                setTimeout(() => gate.remove(), 1200);
            });
        };
    } else {
        startMemoryAutoScroll();
    }

    let lastY = window.scrollY;
    window.onscroll = () => {
        const rect = header.getBoundingClientRect();
        if (window.scrollY > lastY && rect.bottom < 0) nav.classList.add('navbar-hidden');
        if (rect.bottom >= 0) nav.classList.remove('navbar-hidden');
        lastY = window.scrollY;
    };
    window.onmousemove = (e) => { if (e.clientY < 60) nav.classList.remove('navbar-hidden'); };
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

function initMemoryAutoScrollToggle() {
    if (document.getElementById('memory-autoscroll-toggle')) return;
    const btn = document.createElement("button"); btn.id = "memory-autoscroll-toggle"; btn.textContent = "⏸ Auto-scroll";
    btn.onclick = () => {
        _memoryAutoScrollEnabled = !_memoryAutoScrollEnabled;
        if (_memoryAutoScrollEnabled) { btn.textContent = "⏸ Auto-scroll"; startMemoryAutoScroll(); } 
        else { btn.textContent = "▶ Auto-scroll"; clearInterval(_memoryAutoScrollTimer); }
    };
    document.body.appendChild(btn);
}

function startMemoryAutoScroll() {
    if (!_memoryAutoScrollEnabled) return;
    const cards = document.querySelectorAll('.memory-card'); if (!cards.length) return;
    if (_memoryAutoScrollTimer) clearInterval(_memoryAutoScrollTimer);
    _memoryAutoScrollTimer = setInterval(() => {
        const mid = window.innerHeight / 2; let cur = -1;
        cards.forEach((c, i) => { const r = c.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) cur = i; });
        if (cur === -1) { for (let i = 0; i < cards.length; i++) { if (cards[i].getBoundingClientRect().top > 0) { cur = i - 1; break; } } }
        const next = (cur + 1) % cards.length;
        cards[next].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 5000);
}

function setupPrivacyToggle(id) {
    const btn = document.getElementById(id); if (!btn) return;
    const isUnlocked = localStorage.getItem('private_unlocked');
    if (isUnlocked) { btn.textContent = "Hide Private"; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; } 
    else { btn.textContent = "Private Access"; btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; initSecretGesture(btn); }
    btn.onclick = () => {
        if (isUnlocked) { localStorage.removeItem('private_unlocked'); location.reload(); } 
        else { showPrivatePrompt(); }
    };
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

    form.onsubmit = (e) => {
        e.preventDefault();
        const target = window.SECRET_KEY || 'bumblebee';
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

function initSecretGesture(btn) {
    let holdStart = 0, resetTimer = null, frameId = null, unlocked = false;
    const REQUIRED_TIME = 3000;
    
    // Inject Visuals
    const loader = document.createElement('div');
    loader.id = 'secret-loader';
    loader.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); width:50px; height:50px; border-radius:50%; background: transparent; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-main); font-size:1.2rem; opacity:0; transition: opacity 0.3s; z-index:9999; mask-image: radial-gradient(transparent 55%, black 56%); -webkit-mask-image: radial-gradient(transparent 55%, black 56%);";
    document.body.appendChild(loader);
    
    const countText = document.createElement('div');
    countText.style.cssText = "position:fixed; bottom:32px; left:50%; transform:translateX(-50%); font-weight:bold; color:var(--text-main); font-size:1.2rem; opacity:0; z-index:10000; pointer-events:none;";
    document.body.appendChild(countText);

    const container = document.querySelector('.container');
    if(!container) return;

    const updateVisuals = () => {
        if (unlocked) return;
        if (!holdStart) {
            container.style.transform = `translateY(0px)`;
            container.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            loader.style.opacity = '0';
            countText.style.opacity = '0';
            return;
        }

        const elapsed = Date.now() - holdStart;
        const progress = Math.min(elapsed / REQUIRED_TIME, 1);
        const stretch = Math.pow(progress, 0.5) * 80; 
        
        container.style.transition = 'none';
        container.style.transform = `translateY(-${stretch}px)`;
        loader.style.opacity = '1';
        loader.style.background = `conic-gradient(var(--accent-primary) ${progress * 360}deg, rgba(255,255,255,0.1) 0deg)`;
        countText.style.opacity = '1';
        countText.textContent = Math.ceil((REQUIRED_TIME - elapsed) / 1000);

        if (progress >= 1) {
            unlocked = true;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.textContent = "🔒 Show Private";
            if (navigator.vibrate) navigator.vibrate(200);
            
            loader.style.display = 'none';
            countText.style.display = 'none';
            container.style.transform = `translateY(0px)`;
            container.style.transition = 'transform 0.3s';
            
            if (_memoryAutoScrollEnabled && typeof startMemoryAutoScroll === 'function') startMemoryAutoScroll();
        } else {
            frameId = requestAnimationFrame(updateVisuals);
        }
    };

    const handleInput = (source) => {
        if (unlocked) return;
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.body.offsetHeight;
        
        if (scrollBottom >= pageHeight - 15) {
            if (_memoryAutoScrollTimer) { clearInterval(_memoryAutoScrollTimer); _memoryAutoScrollTimer = null; }

            if (!holdStart) {
                holdStart = Date.now();
                frameId = requestAnimationFrame(updateVisuals);
            }
            
            if (source === 'drag') {
                clearTimeout(resetTimer); 
            } else {
                clearTimeout(resetTimer);
                resetTimer = setTimeout(() => { resetGesture(); }, 150);
            }
        }
    };

    const resetGesture = () => {
        if (unlocked) return;
        holdStart = 0;
        cancelAnimationFrame(frameId);
        requestAnimationFrame(updateVisuals);
        
        if (_memoryAutoScrollEnabled && typeof startMemoryAutoScroll === 'function') {
            const scrollBottom = window.innerHeight + window.scrollY;
            if (scrollBottom < document.body.offsetHeight - 100) startMemoryAutoScroll();
        }
    };

    window.addEventListener('wheel', (e) => { if (e.deltaY > 0) handleInput('wheel'); }, { passive: true });
    window.addEventListener('touchmove', (e) => handleInput('touch'), { passive: true });
    window.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') handleInput('key'); });

    let isDragging = false;
    window.addEventListener('mousedown', () => { isDragging = true; });
    window.addEventListener('mouseup', () => { isDragging = false; resetGesture(); });
    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            if (e.movementY > 5) { resetGesture(); return; }
            if (e.movementY < 0) { handleInput('drag'); }
        }
    });

    window.addEventListener('scroll', () => {
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.body.offsetHeight;
        const nearBottom = scrollBottom >= pageHeight - 100;

        if (unlocked && !nearBottom) {
            unlocked = false;
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
            loader.style.display = 'flex';
            loader.style.opacity = '0';
            countText.style.display = 'block';
            countText.style.opacity = '0';
            holdStart = 0;
            if (_memoryAutoScrollEnabled && typeof startMemoryAutoScroll === 'function') startMemoryAutoScroll();
        }
    });
}

let map;
function initMap() {
    if (!document.getElementById('gallery-map') || map) return;
    map = L.map('gallery-map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
}

function updateMapMarkers() {
    if(!map) return;
    map.eachLayer((layer) => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    const showPrivate = localStorage.getItem('private_unlocked');
    const bounds = [];
    const mapItems = galleryState.filter(item => {
        const isVid = item.type === 'video' || item.src.match(/\.(mp4|mov)$/i);
        return (!item.private || showPrivate) && item.src && item.lat && item.lon && !isVid;
    });

    mapItems.forEach((item, index) => {
        addToMap(item.lat, item.lon, item.thumb || item.src, index, mapItems);
        bounds.push([item.lat, item.lon]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

function addToMap(lat, lon, imgUrl, index, mapList) {
    const icon = L.divIcon({
        html: `<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;"></div>`,
        className: '', iconSize: [40, 40], iconAnchor: [20, 20]
    });
    const marker = L.marker([lat, lon], {icon: icon}).addTo(map);
    marker.bindPopup(`<div class="map-popup-preview"><img src="${imgUrl}"></div>`, { closeButton: false, offset: [0, -10] });
    marker.on('mouseover', function() { this.openPopup(); });
    marker.on('mouseout', function() { this.closePopup(); });
    marker.on('click', () => openLightbox(index, mapList));
}

let markerUpdateTimeout;
function debouncedUpdateMapMarkers() {
    clearTimeout(markerUpdateTimeout);
    markerUpdateTimeout = setTimeout(updateMapMarkers, 1000);
}

async function extractGalleryDates() {
    // Redundant: Now handled during upload in admin.js
}

function convertDMSToDD(dms, ref) { if (!dms) return null; let dd = dms[0] + dms[1]/60 + dms[2]/3600; if (ref === "S" || ref === "W") dd = dd * -1; return dd; }
