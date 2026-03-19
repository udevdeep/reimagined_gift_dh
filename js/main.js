/**
 * THE SPARK: Silent Signal Logic
 */
async function sendSpark() {
    const btn = document.getElementById('pulse-btn') || document.querySelector('.spark-fab');
    const text = document.getElementById('pulse-text');
    const icon = document.getElementById('pulse-icon');
    
    if (!btn || btn.disabled || btn.classList.contains('sending')) return;

    // The Spark Vibe: Simple, grounded message
    const vibe = { 
        msg: "Spark sent. Always in your corner. ✨", 
        log: "Always in your corner." 
    };

    // Visual Feedback
    btn.disabled = true;
    btn.classList.add('sending');
    
    if (btn.classList.contains('spark-fab')) {
        btn.innerHTML = "Sending... ⚡";
    } else {
        btn.classList.add('ripple-active');
        if (icon) icon.textContent = "⚡";
        if (text) text.textContent = "Catching the light...";
    }
    
    // Play subtle sound
    if (typeof SoundFX !== 'undefined') SoundFX.thump();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    // Fun Confetti Burst (Gold & White)
    if (typeof confetti !== 'undefined') {
        confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.8 },
            colors: ['#ffcc33', '#ffffff'],
            ticks: 200,
            gravity: 1.2,
            scalar: 0.7
        });
    }

    const user = firebase.auth().currentUser;
    if (user) {
        try {
            const db = firebase.firestore();
            const timestamp = Date.now();

            // 1. Update user totals
            await db.collection('user_data').doc(user.uid).set({
                lastPulse: timestamp,
                pulseCount: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });

            // 2. Record in History
            await db.collection('spark_history').add({
                userId: user.uid,
                userName: user.displayName || "Friend",
                timestamp: timestamp
            });

            // --- THE SILENT PAGER (EmailJS) ---
            if (typeof emailjs !== 'undefined') {
                try {
                    const emailConfig = await db.collection('config').doc('emailjs').get();
                    if (emailConfig.exists) {
                        const { serviceID, templateID, publicKey } = emailConfig.data();
                        emailjs.init({ publicKey: publicKey });
                        emailjs.send(serviceID, templateID, {
                            to_name: "Devdeep",
                            message: `A Spark from the Archive: "${vibe.log}" ✨`,
                            time: new Date().toLocaleString(),
                            note: "Your friend sent a spark. Just a little light for the journey. Got your back."
                        });
                    }
                } catch (err) { console.error("Email failed:", err); }
            }

        } catch (e) { console.error("Spark error:", e); }
    }

    // Completed State
    setTimeout(() => {
        if (btn.classList.contains('spark-fab')) {
            btn.classList.remove('sending');
            btn.innerHTML = "Send a Spark ✨";
            btn.disabled = false;
            showToast("Spark sent. Always in your corner. ✨", "success");
        } else {
            btn.classList.remove('ripple-active');
            if (icon) icon.textContent = "✨";
            if (text) text.textContent = vibe.msg;
            btn.style.borderColor = "#ffcc33";
            btn.style.background = "rgba(255, 204, 0, 0.1)";
            
            setTimeout(() => {
                btn.disabled = false;
                if (icon) icon.textContent = "✨";
                if (text) text.textContent = "Send a Spark";
                btn.style.borderColor = "rgba(255,255,255,0.1)";
                btn.style.background = "rgba(255,255,255,0.05)";
                btn.classList.remove('sending');
            }, 3000);
        }
    }, 1500);
}

async function sendPulseSignal() {
    // Legacy support redirecting to sendSpark
    return sendSpark();
}

/* --- DATA & STATE --- */
// 🚨 YOU MUST REPLACE THIS WITH YOUR OWN FIREBASE CONFIG FROM CONSOLE 🚨
// See FIREBASE_SETUP.txt for instructions.
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB8zvSjJnKFQEuASiWoXx3u9sMKfCcbTDs",
  authDomain: "collegegift-20949.firebaseapp.com",
  projectId: "collegegift-20949",
  storageBucket: "collegegift-20949.firebasestorage.app",
  messagingSenderId: "757528963770",
  appId: "1:757528963770:web:b0a65e179d58b9e676b083",
  measurementId: "G-L8ZQK4DBF9"
};

const LOCK_KEY = 'gift_lock_expiry';

let SECRET_KEY = ""; // Fetched from cloud
let LETTER_TEXT = `Hey...`; // Default
let ALONE_TEXT = `There are moments when the world feels quiet, not because it has stopped, but because it is holding its breath with you. 

Everything you’ve ever felt—the loud laughs, the private heartbreaks, the chaos of college—is recorded here. This archive is a witness. You are not just a ghost in the machine; you are the reason all of this exists. 

Take a moment. The past is still here, and so are you.`; // Default
let CALM_SOUND_URL = ""; // Default empty, loaded from cloud

var MEMORIES_DATA = [];
var GALLERY_DATA = [];
var JOKES_DATA = [];

// Explicitly expose to window for cross-script access (e.g. feeling-low.html)
window.MEMORIES_DATA = MEMORIES_DATA;
window.GALLERY_DATA = GALLERY_DATA;
window.JOKES_DATA = JOKES_DATA;

/* --- INIT --- */
window.addEventListener('load', () => {
    initTheme();

    // Security Check
    if (initFirebaseLock()) {
        startApp();
    }
    
    // Mobile Nav Docker
    const handleMobileNav = () => {
        const nav = document.querySelector('.navbar');
        const links = document.querySelector('.nav-links');
        if (!nav || !links) return;
        
        if (window.innerWidth <= 768) {
            if (links.parentNode === nav) {
                document.body.appendChild(links);
                links.classList.add('mobile-dock');
            }
        } else {
            if (links.parentNode === document.body) {
                nav.insertBefore(links, nav.querySelector('.theme-toggle-btn')); // Insert before toggle or append
                links.classList.remove('mobile-dock');
            }
        }
    };
    window.addEventListener('resize', handleMobileNav);
    handleMobileNav(); // Init
});

function initPreLanding() {
    const preLanding = document.getElementById('pre-landing');
    const beginBtn = document.getElementById('pre-landing-begin');
    if (!preLanding || !beginBtn) return;

    if (sessionStorage.getItem('entered_archive')) {
        preLanding.style.display = 'none';
        return;
    }

    beginBtn.addEventListener('click', () => {
        sessionStorage.setItem('entered_archive', 'true');
        preLanding.style.opacity = '0';
        preLanding.style.pointerEvents = 'none';
        setTimeout(() => {
            preLanding.style.display = 'none';
        }, 1500);
    });
}

async function recordVisit() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    // Check if we've already recorded this session's visit
    if (sessionStorage.getItem('visit_recorded')) return;

    try {
        const db = firebase.firestore();
        await db.collection('site_visits').add({
            userId: user.uid,
            userName: user.displayName || "Friend",
            userEmail: user.email || "Anonymous",
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        sessionStorage.setItem('visit_recorded', 'true');
    } catch (e) {
        console.error("Visit recording failed:", e);
    }
}

async function startApp() {
    // Reveal content
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';

    initGlobalUI();

    // 1. Record Visit
    recordVisit();

    try {
        await loadAllData();
    } catch (e) {
        console.error("Failed to load data:", e);
    }
    
    if (document.getElementById('memories-container')) {
        loadMemories();
        initMemoriesNav();
    }
    if (document.getElementById('gallery-grid')) loadGallery();
    if (document.getElementById('jokes-container')) loadJokes();
    if (document.getElementById('intro-video')) initHome();
    if (document.querySelector('.low-cards')) initFeelingLow();
}

/* --- UTILITIES --- */
const resolvePath = (path, folder = '') => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    // Since we are cloud-only now, if it's not a URL, it's likely a missing or broken link
    return path;
};

const getContrastYIQ = (hexcolor) => {
    if (!hexcolor || hexcolor.charAt(0) !== '#') return 'white';
    const r = parseInt(hexcolor.substr(1,2),16);
    const g = parseInt(hexcolor.substr(3,2),16);
    const b = parseInt(hexcolor.substr(5,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
};

async function loadAllData() {
    const db = firebase.firestore();
    
    // --- 0. PRE-LOAD FROM CACHE (Immediate UI) ---
    const cachedHome = sessionStorage.getItem('home_cache');
    const cachedLetter = sessionStorage.getItem('letter_cache');
    
    if (cachedHome) {
        applyHomeConfig(JSON.parse(cachedHome));
    }
    if (cachedLetter) {
        const data = JSON.parse(cachedLetter);
        LETTER_TEXT = data.text || '';
        window.LETTER_CLOSING = data.closingLine || '';
        const content = document.getElementById('letter-content');
        if (content) content.textContent = LETTER_TEXT;
    }

    // --- 1. PARALLEL FETCH ---
    const tasks = [
        db.collection('jokes').get().catch(() => ({empty: true})),
        db.collection('gallery').get().catch(() => ({empty: true})),
        db.collection('memories').get().catch(() => ({empty: true})),
        db.collection('config').doc('home').get().catch(() => ({exists: false})),
        db.collection('config').doc('secrets').get().catch(() => ({exists: false})),
        db.collection('config').doc('letter').get().catch(() => ({exists: false})),
        db.collection('config').doc('feelingLow').get().catch(() => ({exists: false}))
    ];

    const [jokesSnap, gallerySnap, memoriesSnap, homeDoc, secretsDoc, letterDoc, lowDoc] = await Promise.all(tasks);

    // 1. JOKES
    if (!jokesSnap.empty) {
        JOKES_DATA = jokesSnap.docs.map(doc => doc.data());
        window.JOKES_DATA = JOKES_DATA;
        sessionStorage.setItem('jokes_cache', JSON.stringify(JOKES_DATA));
    } else {
        const cached = sessionStorage.getItem('jokes_cache');
        if (cached) JOKES_DATA = window.JOKES_DATA = JSON.parse(cached);
    }

    // 2. GALLERY
    if (!gallerySnap.empty) {
        GALLERY_DATA = gallerySnap.docs.map(doc => {
            const data = doc.data();
            return {
                filename: data.filename || 'cloud-file',
                src: data.src,
                thumb: data.thumb || null,
                type: data.type,
                date: data.date ? new Date(data.date) : new Date(0),
                private: !!data.private,
                lat: data.lat,
                lon: data.lon,
                isLocal: false
            };
        });
        GALLERY_DATA.sort((a, b) => b.date - a.date);
        window.GALLERY_DATA = GALLERY_DATA;
        sessionStorage.setItem('gallery_cache', JSON.stringify(GALLERY_DATA));
    } else {
        const cached = sessionStorage.getItem('gallery_cache');
        if (cached) {
            GALLERY_DATA = JSON.parse(cached).map(i => ({...i, date: new Date(i.date)}));
            window.GALLERY_DATA = GALLERY_DATA;
        }
    }

    // 3. MEMORIES
    if (!memoriesSnap.empty) {
        MEMORIES_DATA = memoriesSnap.docs.map(doc => ({ folder: doc.id, meta: doc.data() }));
        window.MEMORIES_DATA = MEMORIES_DATA;
        sessionStorage.setItem('memories_cache', JSON.stringify(MEMORIES_DATA));
    } else {
        const cached = sessionStorage.getItem('memories_cache');
        if (cached) MEMORIES_DATA = window.MEMORIES_DATA = JSON.parse(cached);
    }

    // 4. CONFIGS
    if (homeDoc.exists) {
        const data = homeDoc.data();
        applyHomeConfig(data);
        sessionStorage.setItem('home_cache', JSON.stringify(data));
    }

    SECRET_KEY = (secretsDoc.exists && secretsDoc.data().privateKey) ? secretsDoc.data().privateKey : 'bumblebee';
    if (letterDoc.exists) {
        const data = letterDoc.data();
        LETTER_TEXT = data.text || '';
        window.LETTER_CLOSING = data.closingLine || '';
        sessionStorage.setItem('letter_cache', JSON.stringify(data));
        
        // Update home UI if currently on home
        const content = document.getElementById('letter-content');
        const closing = document.getElementById('letter-closing-line');
        if (content) content.textContent = LETTER_TEXT;
        if (closing) closing.textContent = window.LETTER_CLOSING || "";
    }
    
    if (lowDoc.exists) {
        const data = lowDoc.data();
        if (data.aloneText) ALONE_TEXT = data.aloneText;
        if (data.calmSound) CALM_SOUND_URL = data.calmSound;
    }

    // Update UI components that might already be rendered
    const aloneEl = document.getElementById('reassurance-text');
    if (aloneEl) aloneEl.textContent = ALONE_TEXT;
    const audioEl = document.getElementById('calm-audio');
    if (audioEl && audioEl.src !== CALM_SOUND_URL) audioEl.src = CALM_SOUND_URL;
}

// Helper for Home Assets
function applyHomeConfig(data) {
    const videoEl = document.getElementById('intro-video');
    const preVideoEl = document.querySelector('.pre-landing-video');
    const videoContainer = document.querySelector('.bg-video-container');
    
    if (videoEl) {
        if (data.introVideoThumbnail) {
            videoEl.poster = data.introVideoThumbnail;
            if (preVideoEl) preVideoEl.poster = data.introVideoThumbnail;
            if (videoContainer) {
                videoContainer.style.backgroundImage = `url(${data.introVideoThumbnail})`;
                videoContainer.style.backgroundSize = 'cover';
                videoContainer.style.backgroundPosition = 'center';
            }
        }
        if (data.introVideo && videoEl.src !== data.introVideo) {
            videoEl.src = data.introVideo;
            if (preVideoEl) preVideoEl.src = data.introVideo;
            videoEl.style.opacity = '0';
            videoEl.style.transition = 'opacity 0.5s ease';
            videoEl.onplaying = () => { videoEl.style.opacity = '1'; };
            
            // Safety: if video fails to play/load in 3s, show it anyway (it might be the thumbnail)
            setTimeout(() => { if(videoEl.style.opacity === '0') videoEl.style.opacity = '1'; }, 3000);
        }
    }
}

function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('theme');
    
    const updateBtn = (isBarbie) => {
        if(toggleBtn) toggleBtn.innerHTML = isBarbie ? '🌙' : '🎀';
        if(toggleBtn) toggleBtn.title = isBarbie ? 'Switch to Dark Mode' : 'Switch to Barbie Mode';
    };

    if (savedTheme === 'barbie') { 
        html.classList.add('barbie-mode'); 
        updateBtn(true);
    } else {
        updateBtn(false);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            html.classList.toggle('barbie-mode');
            const isBarbie = html.classList.contains('barbie-mode');
            localStorage.setItem('theme', isBarbie ? 'barbie' : 'dark');
            updateBtn(isBarbie);
        });
    }
}

function initFirebaseLock() {
    // 1. Initialize Firebase ALWAYS (if not already done)
    if (window.firebase && !firebase.apps.length) {
        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            // Stronger fix for CORS/Fetch Access Control Errors
            try {
                firebase.firestore().settings({ experimentalForceLongPolling: true });
            } catch(se) { console.warn("Firestore settings already applied"); }
        } catch(e) {
            console.error("Firebase Init Error:", e);
            const msg = document.getElementById('lock-msg');
            if(msg) msg.textContent = "Configuration Error.";
            return false;
        }
    } else if (!window.firebase) {
        console.error("Firebase SDK not loaded.");
        return false;
    }

    const overlay = document.getElementById('lock-overlay');
    const expiry = parseInt(localStorage.getItem(LOCK_KEY) || '0', 10);
    
    // 2. Check existing session
    if (expiry > Date.now()) { 
        if (overlay) overlay.style.display = 'none'; 
        
        // If already logged in, hide pre-landing immediately
        const preLanding = document.getElementById('pre-landing');
        if (preLanding) preLanding.style.display = 'none';
        
        // Wait for Firebase Auth to restore session before starting app
        // This prevents "Permission Denied" errors on page reload
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                startApp();
            } else {
                // Edge case: LocalStorage valid but Auth invalid.
                // Forcing re-login would be safer, but let's give it a moment or redirect.
                // For now, if auth fails eventually, the data load will fail gracefully to local.
                // But to be clean:
                console.warn("Session valid locally but Firebase Auth missing. Redirecting...");
                localStorage.removeItem(LOCK_KEY);
                window.location.reload();
            }
        });
        
        return false; // Handled asynchronously
    }

    // 3. Redirect if not logged in and no lock screen available
    if (!overlay) {
        window.location.href = 'index.html';
        return false; // Not authorized
    }

    // 4. Show Login Screen (Not authorized yet)
    // Initialize Pre-Landing only on index page when not logged in
    if (document.body.classList.contains('index-page')) {
        initPreLanding();
    }

    // Reveal the UI so they can see the login button
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';
    
    // Hide loader so it doesn't block the login screen
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';

    const db = firebase.firestore();

    const btn = document.getElementById('google-login-btn');    const msg = document.getElementById('lock-msg');

    btn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        msg.textContent = "Connecting to Google...";
        msg.style.color = "var(--text-muted)";

        firebase.auth().signInWithPopup(provider)
            .then((result) => {
                const user = result.user;
                msg.textContent = "Verifying access...";
                
                // Check Firestore Whitelist
                db.collection("whitelist").where("email", "==", user.email).get()
                    .then((querySnapshot) => {
                        if (!querySnapshot.empty) {
                            // Success!
                            localStorage.setItem(LOCK_KEY, Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days
                            msg.textContent = "Welcome back!";
                            msg.style.color = "#4cd964"; // Green
                            overlay.style.opacity = '0';
                            setTimeout(() => {
                                overlay.style.display = 'none';
                                startApp(); // Start the app!
                            }, 500);
                        } else {
                            // Fail - Not in Whitelist
                            console.warn("User not in whitelist:", user.email);
                            msg.textContent = "Access Denied: Email not in whitelist.";
                            msg.style.color = "#ff6b6b"; // Red
                            firebase.auth().signOut(); // Logout
                        }
                    })
                    .catch((error) => {
                        console.error("Firestore Error:", error);
                        msg.textContent = "Error: " + (error.message || error.code);
                        msg.style.color = "#ff6b6b";
                    });
            })
            .catch((error) => {
                console.error(error);
                let errText = "Login Failed.";
                if(error.code === 'auth/configuration-not-found') errText = "Setup Error: Enable Google Auth in Console.";
                if(error.code === 'auth/api-key-not-valid') errText = "Setup Error: Invalid API Key.";
                if(error.code === 'auth/popup-closed-by-user') errText = "Login cancelled.";
                msg.textContent = errText;
                msg.style.color = "#ff6b6b";
            });
    });

    return false; // Stop here, wait for user interaction
}

function initGlobalUI() {
    const loader = document.getElementById('loader');
    if (loader) setTimeout(() => { loader.classList.add('fade-out'); setTimeout(() => loader.style.display = 'none', 600); }, 800);
    
    // --- Navigation Active States Fix ---
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-links a');
    const brand = document.querySelector('.nav-brand');
    const isIndexPage = document.body.classList.contains('index-page');

    if (brand) {
        if (isIndexPage) brand.classList.add('active');
        else brand.classList.remove('active');
    }

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const isIndexLink = (href === 'index.html' || href === '/');
        if ((isIndexPage && isIndexLink) || (!isIndexPage && !isIndexLink && currentPath.endsWith(href))) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // --- Index Scroll Indicator Logic ---
    if (document.body.classList.contains('index-page')) {
        const indicator = document.querySelector('.scroll-indicator');
        const container = document.querySelector('.hero-container');
        if (indicator && container) {
            container.addEventListener('scroll', () => {
                if (container.scrollTop > 100) {
                    indicator.classList.add('hidden');
                } else {
                    indicator.classList.remove('hidden');
                }
            });
        }
    }

    // --- Staggered Fade-In Observer ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal');
            }
        });
    }, { threshold: 0.1 });

    // This will be called whenever content is loaded (memories/gallery)
    window.refreshRevealObserver = () => {
        document.querySelectorAll('.memory-card, .gallery-item').forEach(el => observer.observe(el));
    };

    // --- Random Memory FAB ---
    if (document.getElementById('gallery-grid')) {
        initRandomMemoryFAB();
    }

    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        const close = lightbox.querySelector('.lightbox-close');
        const closeLightbox = () => {
            stopSlideshow();
            lightbox.classList.remove('active');
            const v = document.getElementById('lightbox-video');
            if (v) { v.pause(); v.style.display = 'none'; v.src = ''; }
            document.getElementById('lightbox-img').src = '';
        };
        close.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
        
        // Navigation & Shortcuts
        const left = lightbox.querySelector('.lightbox-nav.left');
        const right = lightbox.querySelector('.lightbox-nav.right');
        const dlBtn = document.getElementById('lightbox-download');

        if(left) left.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
        if(right) right.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });

        if(dlBtn) {
            dlBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const url = dlBtn.getAttribute('data-url');
                if(!url) return;
                
                const originalHtml = dlBtn.innerHTML;
                dlBtn.innerHTML = '<span style="font-size:0.8rem">...</span>'; 
                
                try {
                    // We attempt to fetch the file data
                    const response = await fetch(url, {
                        method: 'GET',
                        mode: 'cors',
                        credentials: 'omit'
                    });
                    
                    if (!response.ok) throw new Error('Network response was not ok');
                    
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    
                    // Generate a clean filename
                    let filename = 'memory-export';
                    if (url.includes('gallery%2F')) {
                        filename = url.split('gallery%2F')[1].split('?')[0];
                    } else if (url.includes('memories%2F')) {
                        filename = url.split('memories%2F')[1].split('?')[0];
                    }
                    
                    a.download = decodeURIComponent(filename);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // Cleanup
                    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
                } catch (err) {
                    console.warn("Direct download failed due to CORS. Falling back to new tab.", err);
                    // Fallback: Open in new tab but attempt to force download header via Firebase
                    const downloadUrl = url + (url.includes('?') ? '&' : '?') + 'download';
                    window.open(downloadUrl, '_blank');
                } finally {
                    dlBtn.innerHTML = originalHtml;
                }
            });
        }

        document.addEventListener('keydown', (e) => { 
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navigateLightbox(-1);
            if (e.key === 'ArrowRight') navigateLightbox(1);
        });
    }
}

function initHome() {
    if (!document.body.classList.contains('index-page')) return;

    const video = document.getElementById('intro-video');
    const content = document.getElementById('letter-content');
    const closing = document.getElementById('letter-closing-line');
    const container = document.querySelector('.hero-container');

    // --- Initial Reveal from Cache ---
    if (content && LETTER_TEXT !== "Hey...") {
        content.textContent = LETTER_TEXT;
        if (closing) closing.textContent = window.LETTER_CLOSING || "";
    }

    if (!container) return;

    let scrollPos = 0;
    const speed = 0.8;
    let isUserScrolling = false;
    let hasReachedEnd = false;
    let resumeTimer = null;
    let animationFrame = null;

    // --- Autoscroll Loop ---
    const autoScroll = () => {
        if (!isUserScrolling && !hasReachedEnd) {
            if (content && content.textContent.length > 50) {
                scrollPos += speed;
                container.scrollTop = scrollPos;
                if (scrollPos + container.clientHeight >= container.scrollHeight - 2) {
                    hasReachedEnd = true;
                    return;
                }
            }
            animationFrame = requestAnimationFrame(autoScroll);
        }
    };

    const startArchive = () => {
        if (video) {
            video.play().catch(e => console.warn("Autoplay blocked, waiting for interaction", e));
        }
        setTimeout(() => requestAnimationFrame(autoScroll), 2000);
    };

    // Check if already entered, otherwise wait for button
    if (sessionStorage.getItem('entered_archive')) {
        startArchive();
    } else {
        const beginBtn = document.getElementById('pre-landing-begin');
        if (beginBtn) {
            beginBtn.addEventListener('click', startArchive, { once: true });
        }
    }

    // Restart autoscroll if content changes (e.g. from "Loading..." to the real letter)
    const observer = new MutationObserver(() => {
        if (content.textContent.length > 20) {
            hasReachedEnd = false;
            scrollPos = 0;
            container.scrollTop = 0;
        }
    });
    if (content) observer.observe(content, { childList: true });

    // --- Navbar visibility logic ---
    const nav = document.querySelector('.navbar');
    let mouseAtTop = false;

    const updateNavVisibility = () => {
        if (!nav) return;
        const currentScroll = container.scrollTop;
        if (currentScroll < 50 || mouseAtTop) {
            nav.classList.remove('navbar-hidden');
        } else if (currentScroll > 100) {
            nav.classList.add('navbar-hidden');
        }
    };

    container.addEventListener('scroll', updateNavVisibility);
    window.addEventListener('mousemove', (e) => {
        const wasAtTop = mouseAtTop;
        mouseAtTop = (e.clientY < 60);
        if (wasAtTop !== mouseAtTop) updateNavVisibility();
    });

    const onUserInteraction = () => {
        isUserScrolling = true;
        clearTimeout(resumeTimer);
        cancelAnimationFrame(animationFrame);
        scrollPos = container.scrollTop;
        if (!hasReachedEnd) {
            resumeTimer = setTimeout(() => {
                isUserScrolling = false;
                requestAnimationFrame(autoScroll);
            }, 3000);
        }
    };

    container.addEventListener('wheel', onUserInteraction, { passive: true });
    container.addEventListener('touchstart', onUserInteraction, { passive: true });
    container.addEventListener('mousedown', onUserInteraction);
}/* --- MEMORIES --- */
function loadMemories() {
    const container = document.getElementById('memories-container');
    if (!container) return;
    container.innerHTML = '';
    
    setupPrivacyToggle('private-toggle');

    const userMemories = JSON.parse(localStorage.getItem('user_memories') || '[]');
    const allMemories = [...userMemories, ...MEMORIES_DATA];

    allMemories.forEach((item, index) => {
        const folder = item.folder || 'user-upload';
        const meta = item.meta;
        if (meta.private === true && !localStorage.getItem('private_unlocked')) return;

        const card = document.createElement('div');
        card.className = 'card memory-card';
        card.dataset.title = meta.title; 
        
        if (meta.themeColor && meta.themeColor !== '#ffffff') {
            card.style.backgroundColor = meta.themeColor;
            card.style.borderColor = 'rgba(255,255,255,0.1)';
            card.style.backdropFilter = 'none';
            
            const textColor = getContrastYIQ(meta.themeColor);
            card.style.color = textColor;
            card.style.setProperty('--card-text-color', textColor);
        }

        let mediaHtml = '';
        let images = meta.images || [];
        let thumbs = meta.thumbs || images;
        const isUserPost = item.isUserPost; 
        
        if (meta.video) {
            const vidPath = resolvePath(meta.video, folder);
            const thumb = (thumbs && thumbs.length > 0) ? resolvePath(thumbs[0], folder) : (images && images.length > 0 ? resolvePath(images[0], folder) : '');
            const bgStyle = thumb ? `style="background-image: url('${thumb}')"` : '';
            mediaHtml = `<div class="memory-media-wrapper video-wrapper" ${bgStyle}><video src="${vidPath}" muted loop playsinline class="memory-video"></video><div class="play-icon">▶</div></div>`;
        } else if (images && images.length > 0) {
            const firstImg = resolvePath(images[0], folder);
            const firstThumb = resolvePath(thumbs[0], folder);
            const sliderData = JSON.stringify(images);
            const thumbSliderData = JSON.stringify(thumbs);
            const folderAttr = isUserPost ? '' : `data-folder="${folder}"`;
            const userFlag = isUserPost ? 'data-user="true"' : '';
            const cloudFlag = images[0].startsWith('http') ? 'data-cloud="true"' : '';
            
            mediaHtml = `<div class="memory-media-wrapper image-wrapper" ${folderAttr} ${userFlag} ${cloudFlag} data-images='${sliderData}' data-thumbs='${thumbSliderData}' data-index="0" style="background-image: url('${firstThumb}')"><img src="${firstThumb}" loading="lazy" alt="${meta.title}" class="memory-main-img">${images.length > 1 ? '<button class="img-arrow left">◀</button><button class="img-arrow right">▶</button>' : ''}</div>`;
        }

        card.innerHTML = `${mediaHtml}<div class="memory-content"><h3>${meta.title}</h3><p style="white-space: pre-wrap;">${meta.text || ''}</p>${meta.date ? `<small class="memory-date">${meta.date}</small>` : ''}</div>${isUserPost ? '<button class="delete-btn" style="top:10px; right:10px;" title="Delete Memory">×</button>' : ''}`;
        
        if (isUserPost) {
            card.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                if(confirm('Delete this memory?')) {
                    const userIdx = userMemories.indexOf(item);
                    if(userIdx > -1) {
                        userMemories.splice(userIdx, 1);
                        localStorage.setItem('user_memories', JSON.stringify(userMemories));
                        loadMemories();
                    }
                }
            };
        }

        if (meta.audio) {
            const audioPath = resolvePath(meta.audio, folder);
            const audio = new Audio(audioPath);
            audio.volume = 0.5;
            
            let audioPlayPromise = null;
            card.addEventListener('mouseenter', () => {
                audio.currentTime = 0;
                audioPlayPromise = audio.play();
                if (audioPlayPromise !== undefined) {
                    audioPlayPromise.catch(() => { /* Abort handled */ });
                }
            });
            card.addEventListener('mouseleave', () => {
                if (audioPlayPromise !== null) {
                    audioPlayPromise.then(() => {
                        audio.pause();
                        audio.currentTime = 0;
                    }).catch(() => { /* Already handled */ });
                } else {
                    audio.pause();
                    audio.currentTime = 0;
                }
            });
        }

        container.appendChild(card);

        if (meta.video) {
            const vid = card.querySelector('video');
            const vidSrc = resolvePath(meta.video, folder);
            
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'video';
            link.href = vidSrc;
            document.head.appendChild(link);

            let videoPlayPromise = null;
            card.addEventListener('mouseenter', () => {
                vid.muted = false;
                videoPlayPromise = vid.play();
                if (videoPlayPromise !== undefined) {
                    videoPlayPromise.catch(()=>{
                        vid.muted = true;
                        vid.play().catch(() => { /* Ignore fallback abort */ });
                    });
                }
            });
            card.addEventListener('mouseleave', () => { 
                if (videoPlayPromise !== null) {
                    videoPlayPromise.then(() => {
                        vid.pause(); 
                        vid.currentTime = 0; 
                        vid.muted = true;
                    }).catch(() => { /* Already handled */ });
                } else {
                    vid.pause(); 
                    vid.currentTime = 0; 
                    vid.muted = true;
                }
            });
            card.addEventListener('click', () => openLightbox(null, vidSrc));
        } else if (images.length > 0) {
            setupMemoryImageSlider(card);
        }
    });
    
    if (window.refreshRevealObserver) window.refreshRevealObserver();
    initMemoryScrollbar();
    initMemoryAutoScrollToggle();
}

function setupMemoryImageSlider(card) {
    const wrapper = card.querySelector('.memory-media-wrapper');
    if (!wrapper) return;

    const imgEl = wrapper.querySelector('.memory-main-img');
    const images = JSON.parse(wrapper.dataset.images || '[]');
    const thumbs = JSON.parse(wrapper.dataset.thumbs || wrapper.dataset.images || '[]');
    const folder = wrapper.dataset.folder;

    let preloaded = false;
    const preloadImages = () => {
        if (preloaded || images.length <= 1) return;
        images.forEach(img => {
            const temp = new Image();
            temp.src = resolvePath(img, folder);
        });
        preloaded = true;
    };

    const updateImg = () => { 
        const idx = parseInt(wrapper.dataset.index || 0);
        const thumbSrc = resolvePath(thumbs[idx], folder);
        if (imgEl) imgEl.src = thumbSrc;
        wrapper.style.backgroundImage = `url('${thumbSrc}')`;
    };

    let interval;
    const startInterval = () => {
        if (images.length <= 1) return;
        if (interval) clearInterval(interval);
        interval = setInterval(() => { 
            wrapper.dataset.index = (parseInt(wrapper.dataset.index || 0) + 1) % images.length; 
            updateImg(); 
        }, 4000);
    };

    const leftArrow = wrapper.querySelector('.left');
    const rightArrow = wrapper.querySelector('.right');

    if (leftArrow) {
        leftArrow.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            wrapper.dataset.index = (parseInt(wrapper.dataset.index || 0) - 1 + images.length) % images.length; 
            updateImg(); 
            startInterval();
        });
    }
    
    if (rightArrow) {
        rightArrow.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            wrapper.dataset.index = (parseInt(wrapper.dataset.index || 0) + 1) % images.length; 
            updateImg(); 
            startInterval();
        });
    }
    
    card.addEventListener('mouseenter', () => {
        preloadImages();
        startInterval();
    });
    card.addEventListener('mouseleave', () => {
        if (interval) clearInterval(interval);
    });
    
    const lightboxItems = images.map(img => ({
        src: resolvePath(img, folder),
        type: 'image'
    }));
    
    card.addEventListener('click', (e) => { 
        if (e.target.tagName === 'BUTTON' || e.target.classList.contains('delete-btn')) return;
        const currentIndex = parseInt(wrapper.dataset.index || 0);
        openLightbox(currentIndex, lightboxItems); 
    });
}

let _memoryAutoScrollTimer = null;
let _memoryAutoScrollEnabled = true;
function initMemoryAutoScrollToggle() {
    if (document.getElementById('memory-autoscroll-toggle')) return;
    const btn = document.createElement("button");
    btn.id = "memory-autoscroll-toggle";
    btn.textContent = "⏸ Auto-scroll";
    btn.addEventListener("click", () => {
        _memoryAutoScrollEnabled = !_memoryAutoScrollEnabled;
        if (_memoryAutoScrollEnabled) { btn.textContent = "⏸ Auto-scroll"; startMemoryAutoScroll(); } else { btn.textContent = "▶ Auto-scroll"; clearInterval(_memoryAutoScrollTimer); }
    });
    document.body.appendChild(btn);
}
function startMemoryAutoScroll() {
    if (!_memoryAutoScrollEnabled) return;
    const cards = document.querySelectorAll('.memory-card');
    if (!cards.length) return;
    if (_memoryAutoScrollTimer) clearInterval(_memoryAutoScrollTimer);
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            if (_memoryAutoScrollTimer) clearInterval(_memoryAutoScrollTimer);
        });
        card.addEventListener('mouseleave', () => { 
            if(_memoryAutoScrollEnabled) startMemoryAutoScroll(); 
        });
    });
    _memoryAutoScrollTimer = setInterval(() => {
        const mid = window.innerHeight / 2;
        let currentIdx = -1;
        
        // Dynamically find the card closest to the middle of the screen
        cards.forEach((c, i) => { 
            const rect = c.getBoundingClientRect(); 
            if (rect.top <= mid && rect.bottom >= mid) currentIdx = i; 
        });

        // If no card is exactly in the middle (e.g. between cards), 
        // find the first card below the top of the viewport
        if (currentIdx === -1) {
            for (let i = 0; i < cards.length; i++) {
                const rect = cards[i].getBoundingClientRect();
                if (rect.top > 0) {
                    currentIdx = i - 1;
                    break;
                }
            }
        }

        const nextIdx = (currentIdx + 1) % cards.length;
        cards[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 5000);
}

function stopMemoryAutoScroll() {
    _memoryAutoScrollEnabled = false;
    if (_memoryAutoScrollTimer) {
        clearInterval(_memoryAutoScrollTimer);
        _memoryAutoScrollTimer = null;
    }
    const btn = document.getElementById('memory-autoscroll-toggle');
    if (btn) btn.textContent = "▶ Auto-scroll";
}
function initMemoryScrollbar() {
    const container = document.getElementById('memories-container');
    const cards = Array.from(container.querySelectorAll('.memory-card'));
    if (!cards.length) return;
    let bar = document.querySelector('.memory-scroll-bar');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.className = 'memory-scroll-bar';
    const indicator = document.createElement('div');
    indicator.id = 'memory-scroll-indicator';
    bar.appendChild(indicator);
    const tooltip = document.createElement('div');
    tooltip.id = 'memory-scroll-tooltip';
    document.body.appendChild(tooltip);
    cards.forEach((card, i) => {
        const dot = document.createElement('div');
        dot.className = 'memory-scroll-item';
        dot.textContent = i + 1;
        dot.addEventListener('click', () => card.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        dot.addEventListener('mouseenter', () => { tooltip.textContent = card.dataset.title; tooltip.style.opacity = '1'; const rect = dot.getBoundingClientRect(); tooltip.style.top = rect.top + 'px'; tooltip.style.right = (window.innerWidth - rect.left + 10) + 'px'; });
        dot.addEventListener('mouseleave', () => tooltip.style.opacity = '0');
        bar.appendChild(dot);
    });
    document.body.appendChild(bar);
    window.addEventListener('scroll', () => {
        const mid = window.innerHeight / 2;
        let activeIdx = 0;
        cards.forEach((c, i) => { const rect = c.getBoundingClientRect(); if (rect.top < mid && rect.bottom > mid) activeIdx = i; });
        const dots = bar.querySelectorAll('.memory-scroll-item');
        dots.forEach(d => d.classList.remove('active'));
        if (dots[activeIdx]) { dots[activeIdx].classList.add('active'); indicator.style.top = dots[activeIdx].offsetTop + 'px'; }
    });
}

/* --- GALLERY --- */
let galleryState = [];
async function loadGallery() {
    const container = document.getElementById('gallery-grid');
    if (!container) return;
    
    // Privacy Toggle Logic
    setupPrivacyToggle('private-toggle');

    const uploads = JSON.parse(localStorage.getItem('gallery_uploads') || '[]');
    const deleted = JSON.parse(localStorage.getItem('gallery_deleted') || '[]');
    const edits = JSON.parse(localStorage.getItem('gallery_edits') || '{}');

    const builtIn = GALLERY_DATA.map(item => {
        // If it's a formatted cloud object (from Firestore), ensure timestamp exists
        if (item.src) {
            return {
                ...item,
                timestamp: item.date ? item.date.getTime() : 0
            };
        }

        // Legacy/Local Fallback Logic
        const file = item.file || item;
        if (deleted.includes(file)) return null;
        let dateStr = item.date;
        if (edits[file] && edits[file].date) dateStr = edits[file].date;
        const dateObj = dateStr ? new Date(dateStr) : null;
        return { filename: file, private: item.private || false, date: dateObj, timestamp: dateObj ? dateObj.getTime() : 0, lat: item.lat || null, lon: item.lon || null, isLocal: false };
    }).filter(x => x);

    const localItems = uploads.map(item => {
        let dateStr = item.date;
        if (edits[item.filename] && edits[item.filename].date) dateStr = edits[item.filename].date;
        const dateObj = new Date(dateStr);
        return { filename: item.filename, private: item.private || false, date: dateObj, timestamp: dateObj.getTime(), isLocal: true };
    });

    galleryState = [...localItems, ...builtIn];
    galleryState.sort((a, b) => b.timestamp - a.timestamp);
    
    const sortSelect = document.getElementById('gallery-sort');
    if(sortSelect) sortSelect.addEventListener('change', (e) => sortGallery(e.target.value));

    renderGalleryGrouped(galleryState, (sortSelect ? sortSelect.value : 'default') === 'default');
    
    // Zoom Slider Logic
    const zoomSlider = document.getElementById('gallery-zoom');
    if (zoomSlider) {
        // Restore previous zoom
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
    
    initMap();
    updateMapMarkers();
    
    // Render immediately
    if (sortSelect) sortGallery(sortSelect.value);
    else sortGallery('default');

    if (window.refreshRevealObserver) window.refreshRevealObserver();
}

function initRandomMemoryFAB() {
    if (document.querySelector('.random-fab')) return;
    const fab = document.createElement('button');
    fab.className = 'random-fab';
    fab.innerHTML = '🎲';
    fab.title = 'Revisit a random moment';
    fab.onclick = () => {
        const items = document.querySelectorAll('.gallery-item, .memory-card');
        if (items.length > 0) {
            const randomIdx = Math.floor(Math.random() * items.length);
            items[randomIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Subtle highlight
            const originalTransform = items[randomIdx].style.transform;
            const originalBoxShadow = items[randomIdx].style.boxShadow;
            
            items[randomIdx].style.transform = 'scale(1.05)';
            items[randomIdx].style.boxShadow = '0 0 30px var(--accent-primary)';
            
            setTimeout(() => {
                items[randomIdx].style.transform = originalTransform;
                items[randomIdx].style.boxShadow = originalBoxShadow;
            }, 2000);
        }
    };
    document.body.appendChild(fab);
}

function sortGallery(mode) {
    galleryState.sort((a, b) => {
        const tA = a.timestamp || 0;
        const tB = b.timestamp || 0;
        
        if (mode === 'date-asc') {
            return tA - tB;
        } else {
            // Default to desc for both 'default' and 'date-desc'
            return tB - tA;
        }
    });
    renderGalleryGrouped(galleryState, mode === 'default');
    if (window.refreshRevealObserver) window.refreshRevealObserver();
}

function renderGalleryGrouped(items, isFlat = false) {
    const container = document.getElementById('gallery-grid');
    container.innerHTML = '';
    container.style.display = 'block';
    const showPrivate = localStorage.getItem('private_unlocked');
    
    // 1. Flatten list for Lightbox Navigation
    const visibleItems = items.filter(item => (!item.private || showPrivate) && item.src);
    
    // Update Count Display
    const countContainer = document.getElementById('gallery-count');
    if (countContainer) {
        const videoCount = visibleItems.filter(item => item.type === 'video' || (item.filename && item.filename.match(/\.(mp4|mov)$/i))).length;
        const photoCount = visibleItems.length - videoCount;
        let countText = "";
        if (photoCount > 0) countText += `${photoCount} Photo${photoCount !== 1 ? 's' : ''}`;
        if (photoCount > 0 && videoCount > 0) countText += ", ";
        if (videoCount > 0) countText += `${videoCount} Video${videoCount !== 1 ? 's' : ''}`;
        countContainer.textContent = countText;
    }

    const lightboxList = visibleItems.map(item => {
        const isVideo = item.filename.match(/\.(mp4|mov)$/i) || item.type === 'video';
        return { src: item.src, type: isVideo ? 'video' : 'image' };
    });

    const groups = {};
    const groupOrder = [];

    if (isFlat) {
        groups['All'] = visibleItems;
        groupOrder.push('All');
    } else {
        visibleItems.forEach(item => {
            let key = "Unknown Date";
            if (item.date && !isNaN(item.date)) key = item.date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
            groups[key].push(item);
        });
    }

    // Global counter for index in lightboxList
    let globalIndex = 0;

    groupOrder.forEach(key => {
        const section = document.createElement('section');
        section.className = 'gallery-section';
        if (!isFlat) section.style.marginBottom = '40px';
        
        if (!isFlat) {
            const header = document.createElement('h3');
            header.textContent = key;
            header.className = 'gallery-month-heading';
            header.style.marginBottom = '16px';
            header.style.fontSize = '1.2rem';
            header.style.color = 'var(--text-muted)';
            header.style.fontWeight = '600';
            section.appendChild(header);
        }

        const grid = document.createElement('div');
        grid.className = 'gallery-month-grid';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(180px, 1fr))';
        grid.style.gap = '16px';
        
        groups[key].forEach(item => {
            if (!item.src) return; // Skip invalid items

            const el = document.createElement('div');
            el.className = 'gallery-item';
            el.style.borderRadius = '12px'; el.style.overflow = 'hidden'; el.style.position = 'relative'; el.style.aspectRatio = '1'; el.style.cursor = 'pointer';
            
            const path = item.src;
            const isVideo = item.filename.match(/\.(mp4|mov)$/i) || item.type === 'video';
            
            if (isVideo) {
                const thumbPath = item.thumb || item.src;
                // If we have a dedicated thumbnail (which is an image), use <img>
                if (item.thumb) {
                    el.insertAdjacentHTML('beforeend', `<img src="${thumbPath}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div class="video-badge" style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.6);color:white;font-size:0.7rem;padding:2px;border-radius:4px;">▶</div>`);
                } else {
                    // Fallback to video tag with timestamp if no thumbnail exists
                    el.insertAdjacentHTML('beforeend', `<video src="${thumbPath}#t=0.1" muted style="width:100%;height:100%;object-fit:cover;"></video><div class="video-badge" style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.6);color:white;font-size:0.7rem;padding:2px;border-radius:4px;">▶</div>`);
                }
            } else {
                const displayPath = item.thumb || item.src;
                el.insertAdjacentHTML('beforeend', `<img src="${displayPath}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`);
            }
            
            const currentIndex = globalIndex++;
            el.addEventListener('click', () => { 
                 openLightbox(currentIndex, lightboxList);
            });
            grid.appendChild(el);
        });
        section.appendChild(grid); container.appendChild(section);
    });
}

async function extractGalleryDates() {
    let updated = false;
    const itemsToProcess = galleryState.filter(item => !item.isLocal && !(item.lat && item.lon));
    
    // Process in small batches to avoid lag
    const batchSize = 5;
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
        const batch = itemsToProcess.slice(i, i + batchSize);
        await Promise.all(batch.map(item => new Promise(resolve => {
            const isVideo = item.filename.match(/\.(mp4|mov)$/i);
            if (isVideo) { resolve(); } else {
                const img = new Image(); 
                img.src = item.src;
                img.onload = () => {
                    if(window.EXIF) {
                        EXIF.getData(img, function() {
                            const lat = EXIF.getTag(this, "GPSLatitude");
                            if (lat) {
                                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                                const lon = EXIF.getTag(this, "GPSLongitude");
                                const lonRef = EXIF.getTag(this, "GPSLongitudeRef");
                                if(lat && lon) { 
                                    item.lat = convertDMSToDD(lat, latRef); 
                                    item.lon = convertDMSToDD(lon, lonRef); 
                                    updated = true;
                                }
                            }
                            resolve();
                        });
                    } else resolve();
                };
                img.onerror = resolve;
            }
        })));
        // Tiny pause between batches to keep UI responsive
        await new Promise(r => setTimeout(r, 100));
    }

    if (updated) {
        sessionStorage.setItem('gallery_cache', JSON.stringify(GALLERY_DATA));
    }
}

function updateMapMarkers() {
    if(!map) return;
    map.eachLayer((layer) => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    const showPrivate = localStorage.getItem('private_unlocked');
    const bounds = [];
    
    // Create a specific list for map items to allow navigation
    const mapItems = [];
    galleryState.forEach(item => {
        if (item.private && !showPrivate) return;
        // Strict Check: Must have Cloud URL (src) and Location
        if (item.src && item.lat && item.lon) {
            const isVideo = item.type === 'video' || item.filename.match(/\.(mp4|mov)$/i);
            // Allow images or videos with thumbnails
            if (!isVideo || (isVideo && item.thumb)) {
                mapItems.push({
                    src: item.src,
                    thumb: item.thumb,
                    type: isVideo ? 'video' : 'image',
                    lat: item.lat,
                    lon: item.lon
                });
            }
        }
    });

    mapItems.forEach((item, index) => {
        addToMap(item.lat, item.lon, item.thumb || item.src, index, mapItems);
        bounds.push([item.lat, item.lon]);
    });

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

/* --- JOKES --- */
let physicsAnimationId = null;
function loadJokes() {
    const container = document.getElementById('jokes-container');
    if (!container) return;

    if (physicsAnimationId) {
        cancelAnimationFrame(physicsAnimationId);
        physicsAnimationId = null;
    }

    const modal = document.getElementById('joke-modal');
    if (modal) {
        const closeBtn = modal.querySelector('.lightbox-close');
        const closeModal = () => modal.classList.remove('active');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', closeModal);
        }
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    container.innerHTML = '';
    const physicsBubbles = [];
    const mouse = { x: -1000, y: -1000, isDown: false };
    
    // Use named function for listener removal if needed, but for now just one listener
    const onMouseMove = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('mousemove', onMouseMove);
    
    const updateBubbleSizes = () => {
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        const isMobile = minDim < 768;
        const baseSize = isMobile ? 80 : 120;
        const growth = isMobile ? 15 : 30;

        physicsBubbles.forEach(obj => {
            const size = baseSize + (obj.tier * growth);
            obj.radius = size / 2;
            obj.mass = size;
            obj.element.style.width = `${size}px`;
            obj.element.style.height = `${size}px`;
            obj.element.style.fontSize = `${size * 0.14}px`;
        });
    };

    window.addEventListener('resize', updateBubbleSizes);

    JOKES_DATA.forEach((joke, i) => {
        const bubble = document.createElement('div');
        bubble.className = 'joke-bubble';
        const palette = [40, 330, 270, 200, 10]; 
        const hue = palette[Math.floor(Math.random() * palette.length)];
        const tier = joke.sizeTier || 2;
        
        bubble.style.setProperty('--b-hue', hue); 
        bubble.innerHTML = `<div class="joke-bubble-inner">${joke.title}</div>`;
        
        const highlight = document.createElement('div');
        highlight.className = 'bubble-highlight';
        bubble.appendChild(highlight);
        
        container.appendChild(bubble);
        requestAnimationFrame(() => bubble.style.opacity = '1');
        
        let startX = Math.random() * (window.innerWidth - 100); 
        let startY = Math.random() * (window.innerHeight - 100);
        if (startX < 0) startX = 20; if (startY < 0) startY = 20;
        
        const obj = { 
            element: bubble, 
            highlight: highlight,
            tier: tier,
            x: startX, 
            y: startY, 
            vx: (Math.random() - 0.5) * 4, 
            vy: (Math.random() - 0.5) * 4, 
            radius: 0,
            mass: 0, 
            isDragging: false,
            isHovered: false
        };
        physicsBubbles.push(obj);
        
        bubble.addEventListener('mouseenter', () => { obj.isHovered = true; });
        bubble.addEventListener('mouseleave', () => { obj.isHovered = false; });
        bubble.addEventListener('mousedown', () => { obj.isDragging = true; });
        
        let downPos = {x:0, y:0};
        bubble.addEventListener('mousedown', e => { downPos = {x:e.clientX, y:e.clientY}; });
        bubble.addEventListener('mouseup', e => {
            obj.isDragging = false;
            if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 5) {
                document.getElementById('joke-title').textContent = joke.title;
                document.getElementById('joke-text').textContent = joke.text;
                document.getElementById('joke-modal').classList.add('active');
            }
        });
    });

    updateBubbleSizes();

    function step() {
        if (!document.getElementById('jokes-container')) return; // Stop if page changed
        const width = window.innerWidth;
        const height = window.innerHeight;
        physicsBubbles.forEach((b, i) => {
            if (b.isDragging) {
                b.vx = (mouse.x - b.radius - b.x) * 0.3;
                b.vy = (mouse.y - b.radius - b.y) * 0.3;
                b.x += b.vx; b.y += b.vy;
            } else {
                const dx = b.x + b.radius - mouse.x; const dy = b.y + b.radius - mouse.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 250) { const force = (250 - dist) / 250; b.vx += (dx / dist) * force * 1.5; b.vy += (dy / dist) * force * 1.5; }
                b.vx += (Math.random() - 0.5) * 0.1; b.vy += (Math.random() - 0.5) * 0.1;
                const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy); const maxSpeed = 3.5;
                if (speed > maxSpeed) { b.vx = (b.vx / speed) * maxSpeed; b.vy = (b.vy / speed) * maxSpeed; }
                b.x += b.vx; b.y += b.vy;
                if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
                if (b.x + b.radius*2 > width) { b.x = width - b.radius*2; b.vx = -Math.abs(b.vx); }
                if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
                if (b.y + b.radius*2 > height) { b.y = height - b.radius*2; b.vy = -Math.abs(b.vy); }
            }
            for (let j = i + 1; j < physicsBubbles.length; j++) {
                const b2 = physicsBubbles[j];
                const dx = (b2.x + b2.radius) - (b.x + b.radius); const dy = (b2.y + b2.radius) - (b.y + b.radius);
                const dist = Math.sqrt(dx*dx + dy*dy); const minDist = b.radius + b2.radius;
                if (dist < minDist) {
                    const angle = Math.atan2(dy, dx); const tx = Math.cos(angle); const ty = Math.sin(angle);
                    const overlap = minDist - dist; const force = overlap * 0.05; 
                    b.vx -= tx * force; b.vy -= ty * force; b2.vx += tx * force; b2.vy += ty * force;
                }
            }
            const scale = b.isHovered ? 1.15 : 1;
            b.element.style.transform = `translate(${b.x}px, ${b.y}px) scale(${scale})`;
            const centerX = b.x + b.radius; const centerY = b.y + b.radius;
            const hdx = mouse.x - centerX; const hdy = mouse.y - centerY;
            const hdist = Math.sqrt(hdx*hdx + hdy*hdy) || 1;
            const maxMove = b.radius * 0.4;
            const hMove = Math.min(hdist, 100) / 100 * maxMove;
            b.highlight.style.transform = `translate(${(hdx / hdist) * hMove}px, ${(hdy / hdist) * hMove}px)`;
        });
        physicsAnimationId = requestAnimationFrame(step);
    }
    physicsAnimationId = requestAnimationFrame(step);
}

/* --- UTILS --- */
function setupPrivacyToggle(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    const isUnlocked = localStorage.getItem('private_unlocked');
    
    // State management
    if (isUnlocked) {
        newBtn.textContent = "Hide Private";
        newBtn.style.opacity = '1';
        newBtn.style.pointerEvents = 'auto';
    } else {
        newBtn.textContent = "Private Access";
        newBtn.style.opacity = '0';
        newBtn.style.pointerEvents = 'none';
        initSecretGesture(newBtn);
    }

    newBtn.addEventListener('click', () => {
        if (isUnlocked) {
            localStorage.removeItem('private_unlocked');
            location.reload();
        } else {
            showPrivatePrompt();
        }
    });
}

function showPrivatePrompt() {
    // Check if already exists
    if (document.getElementById('private-prompt')) {
        document.getElementById('private-prompt').style.display = 'flex';
        document.getElementById('private-input').focus();
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'private-prompt';
    modal.className = 'lock-overlay'; // Reuse existing lock style
    modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 11000; display: flex; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s;";
    
    modal.innerHTML = `
        <div class="lock-card" style="position: relative;">
            <button id="private-close" style="position:absolute; top:15px; right:15px; background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer;">&times;</button>
            <h2 style="color: var(--text-main);">Private Access</h2>
            <p style="margin-bottom: 5px; color: var(--text-main); font-weight: 500;">Enter the secret key.</p>
            <p style="font-size: 0.8rem; color: var(--text-muted); opacity: 0.6; margin-bottom: 20px;">Hint: Name of our go-to street</p>
            
            <form id="private-auth-form" style="width: 100%;">
                <div style="position: relative; width: 100%; margin-bottom: 20px;">
                    <input type="password" id="private-input" name="password" autocomplete="current-password" class="lock-input" placeholder="Answer..." style="margin: 0; padding-right: 40px;" autofocus>
                    <button type="button" id="toggle-pw" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">👁️</button>
                </div>

                <button type="submit" class="btn-primary" id="private-confirm-btn" style="width: 100%;">Unlock</button>
            </form>
            <p id="private-msg" style="margin-top:10px; font-size: 0.9rem; min-height: 1.2em;"></p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animation
    requestAnimationFrame(() => modal.style.opacity = '1');

    const form = modal.querySelector('#private-auth-form');
    const input = modal.querySelector('#private-input');
    const toggleBtn = modal.querySelector('#toggle-pw');
    const close = modal.querySelector('#private-close');
    const msg = modal.querySelector('#private-msg');

    toggleBtn.addEventListener('click', () => {
        if (input.type === 'password') {
            input.type = 'text';
            toggleBtn.textContent = '🙈';
        } else {
            input.type = 'password';
            toggleBtn.textContent = '👁️';
        }
        input.focus();
    });

    const attempt = (e) => {
        if (e) e.preventDefault();
        // Use dynamic key or fallback
        const target = SECRET_KEY || 'bumblebee';
        
        if (input.value.trim().toLowerCase() === target.toLowerCase()) {
            localStorage.setItem('private_unlocked', 'true');
            modal.style.opacity = '0';
            setTimeout(() => location.reload(), 300);
        } else {
            msg.textContent = 'Incorrect.';
            msg.style.color = '#ff6b6b';
            input.value = '';
            input.focus();
        }
    };

    form.addEventListener('submit', attempt);
    
    close.addEventListener('click', () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.style.display = 'none', 300);
    });
}

function initSecretGesture(btn) {
    let holdStart = 0;
    let resetTimer = null;
    let frameId = null;
    let unlocked = false;
    const REQUIRED_TIME = 3000;
    
    // Inject Visuals
    const loader = document.createElement('div');
    loader.id = 'secret-loader';
    loader.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); width:50px; height:50px; border-radius:50%; background: transparent; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-main); font-size:1.2rem; opacity:0; transition: opacity 0.3s; z-index:9999; mask-image: radial-gradient(transparent 55%, black 56%); -webkit-mask-image: radial-gradient(transparent 55%, black 56%);";
    document.body.appendChild(loader);
    
    // Countdown Text (separate from loader mask to remain visible)
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
        
        // Elastic stretch
        const stretch = Math.pow(progress, 0.5) * 80; 
        container.style.transition = 'none';
        container.style.transform = `translateY(-${stretch}px)`;
        
        // Loader Fill
        loader.style.opacity = '1';
        loader.style.background = `conic-gradient(var(--accent-primary) ${progress * 360}deg, rgba(255,255,255,0.1) 0deg)`;
        
        // Countdown
        countText.style.opacity = '1';
        countText.textContent = Math.ceil((REQUIRED_TIME - elapsed) / 1000);

        if (progress >= 1) {
            unlocked = true;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.textContent = "🔒 Show Private";
            if (navigator.vibrate) navigator.vibrate(200);
            
            // Clean up
            loader.style.display = 'none';
            countText.style.display = 'none';
            container.style.transform = `translateY(0px)`; // Reset stretch
            container.style.transition = 'transform 0.3s';
            
            // Only resume if NOT at the bottom
            const scrollBottom = window.innerHeight + window.scrollY;
            const pageHeight = document.body.offsetHeight;
            if (scrollBottom < pageHeight - 100) {
                if (_memoryAutoScrollEnabled) startMemoryAutoScroll();
            }
        } else {
            frameId = requestAnimationFrame(updateVisuals);
        }
    };

    const handleInput = (source) => {
        if (unlocked) return;
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.body.offsetHeight;
        
        if (scrollBottom >= pageHeight - 5) {
            // PAUSE AUTO SCROLL DURING GESTURE
            if (_memoryAutoScrollTimer) {
                clearInterval(_memoryAutoScrollTimer);
                _memoryAutoScrollTimer = null;
            }

            if (!holdStart) {
                holdStart = Date.now();
                frameId = requestAnimationFrame(updateVisuals);
            }
            
            // Logic split: Mouse Drag vs Pulse (Wheel/Key)
            if (source === 'drag') {
                // If dragging, DO NOT set a reset timer. 
                // The gesture persists as long as 'isDragging' is true.
                clearTimeout(resetTimer); 
            } else {
                // Pulse inputs (wheel/keys) need debounce to sustain
                clearTimeout(resetTimer);
                resetTimer = setTimeout(() => {
                    resetGesture();
                }, 100);
            }
        }
    };

    const resetGesture = () => {
        holdStart = 0;
        cancelAnimationFrame(frameId);
        requestAnimationFrame(updateVisuals);
        
        // Only resume if NOT at the bottom where a button might be shown
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.body.offsetHeight;
        if (scrollBottom < pageHeight - 100) {
            if (_memoryAutoScrollEnabled) startMemoryAutoScroll();
        }
    };

    window.addEventListener('wheel', (e) => { if (e.deltaY > 0) handleInput('wheel'); });
    window.addEventListener('touchmove', (e) => handleInput('touch')); // Touch is usually continuous drag too, but let's stick to simple
    window.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') handleInput('key'); });

    // --- Enhanced Mouse Drag Logic ---
    let isDragging = false;
    let dragStartY = 0;

    window.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        resetGesture(); // Release = Reset immediately
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            // Check for DOWN movement (Cancellation)
            // Tolerance: Must move down significantly to cancel
            if (e.movementY > 5) { 
                resetGesture();
                return;
            }

            // Check for UP movement (Trigger/Sustain)
            if (e.movementY < 0) {
                handleInput('drag');
            }
            // If stopped (movementY == 0), handleInput isn't called, 
            // but resetTimer isn't set either (because source='drag'), so it Holds!
        }
    });

    // Auto-hide logic: If user scrolls up, hide button and reset
    window.addEventListener('scroll', () => {
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.body.offsetHeight;
        const nearBottom = scrollBottom >= pageHeight - 100;

        // If unlocked and near bottom, pause auto-scroll
        if (unlocked && nearBottom) {
            if (_memoryAutoScrollTimer) {
                clearInterval(_memoryAutoScrollTimer);
                _memoryAutoScrollTimer = null;
            }
        } 
        // If unlocked and scrolled up, resume auto-scroll
        else if (unlocked && !nearBottom && _memoryAutoScrollEnabled && !_memoryAutoScrollTimer) {
            startMemoryAutoScroll();
        }

        if (!unlocked) return;

        // If scrolled up more than 100px from bottom, hide button
        if (!nearBottom) {
            unlocked = false;
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';

            // Reset loader visibility for next time
            loader.style.display = 'flex';
            loader.style.opacity = '0';
            countText.style.display = 'block';
            countText.style.opacity = '0';

            holdStart = 0;

            // Resume auto-scroll when button hides
            if (_memoryAutoScrollEnabled && !_memoryAutoScrollTimer) startMemoryAutoScroll();
        }
    });}

let lbIndex = 0;
let lbItems = [];
let lbSlideshowInterval = null;

function openLightbox(index, items) {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;
    
    // Reset slideshow on open
    stopSlideshow();

    // Fallback for legacy calls (single items)
    if (typeof index === 'string' || (arguments.length === 2 && !Array.isArray(items))) {
        const src = arguments[1] || arguments[0]; // videoSrc or imgSrc
        const isVid = !!arguments[1];
        lbItems = [{ src, type: isVid ? 'video' : 'image' }];
        lbIndex = 0;
    } else {
        lbIndex = index;
        lbItems = items || [];
    }

    updateLightboxView();
    lightbox.classList.add('active');
    
    // Init Play Button (if exists)
    const playBtn = document.getElementById('lightbox-play');
    if (playBtn) {
        // Remove old listener if exists
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
        newPlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSlideshow();
        });
    } else {
        stopSlideshow(); // Ensure it's off if page doesn't support it
    }
}

function toggleSlideshow() {
    const playBtn = document.getElementById('lightbox-play');
    if (lbSlideshowInterval) {
        stopSlideshow();
    } else {
        startSlideshow();
    }
}

function startSlideshow() {
    const playBtn = document.getElementById('lightbox-play');
    if (playBtn) playBtn.textContent = '⏸';
    
    // 5 second interval
    lbSlideshowInterval = setInterval(() => {
        if (lbIndex < lbItems.length - 1) {
            navigateLightbox(1);
        } else {
            // Loop back to start
            lbIndex = 0;
            updateLightboxView();
        }
    }, 5000);
}

function stopSlideshow() {
    const playBtn = document.getElementById('lightbox-play');
    if (playBtn) playBtn.textContent = '▶';
    if (lbSlideshowInterval) {
        clearInterval(lbSlideshowInterval);
        lbSlideshowInterval = null;
    }
}

function navigateLightbox(dir) {
    if (!lbItems.length) return;
    const newIndex = lbIndex + dir;
    if (newIndex >= 0 && newIndex < lbItems.length) {
        lbIndex = newIndex;
        updateLightboxView();
    }
}

function updateLightboxView() {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    const dlBtn = document.getElementById('lightbox-download');
    const leftBtn = lightbox.querySelector('.lightbox-nav.left');
    const rightBtn = lightbox.querySelector('.lightbox-nav.right');
    const item = lbItems[lbIndex];
    
    if (!item) return;

    // Toggle Arrows
    if (leftBtn) leftBtn.style.display = lbIndex > 0 ? 'flex' : 'none';
    if (rightBtn) rightBtn.style.display = lbIndex < lbItems.length - 1 ? 'flex' : 'none';

    if (item.type === 'video') {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = item.src;
        // Check if visible before playing to avoid background play errors
        if(lightbox.classList.contains('active')) {
             video.play().catch(()=>{});
        }
        if(dlBtn) {
            dlBtn.setAttribute('data-url', item.src);
            dlBtn.href = 'javascript:void(0)';
        }
    } else {
        video.style.display = 'none';
        video.pause();
        img.style.display = 'block';
        img.src = item.src;
        if(dlBtn) {
            dlBtn.setAttribute('data-url', item.src);
            dlBtn.href = 'javascript:void(0)';
        }
    }
}

function convertDMSToDD(dms, ref) { if (!dms) return null; let dd = dms[0] + dms[1]/60 + dms[2]/3600; if (ref === "S" || ref === "W") dd = dd * -1; return dd; }

let map;
function initMap() {
    if (!document.getElementById('gallery-map') || map) return;
    map = L.map('gallery-map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
}

function addToMap(lat, lon, imgUrl, index, mapList) {
    if (!document.getElementById('gallery-map')) return;
    if (!map) initMap();
    
    // Add pointer-events: auto to ensure clicks are captured
    const htmlContent = `<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3); pointer-events: auto; cursor: pointer;">
            <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;">
        </div>`;

    const icon = L.divIcon({
        html: htmlContent,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    const marker = L.marker([lat, lon], {icon: icon}).addTo(map);
    
    // Add custom popup for hover preview
    const popupContent = `<div class="map-popup-preview"><img src="${imgUrl}"></div>`;
    marker.bindPopup(popupContent, {
        closeButton: false,
        className: 'map-hover-popup',
        offset: [0, -10]
    });

    marker.on('mouseover', function (e) {
        this.openPopup();
    });
    marker.on('mouseout', function (e) {
        this.closePopup();
    });

    // Standard Leaflet Click
    marker.on('click', () => {
        openLightbox(index, mapList);
    });

    // Fallback: Direct DOM click (sometimes needed for DivIcons)
    marker.on('add', () => {
        const el = marker.getElement();
        if (el) {
            el.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent map click
                openLightbox(index, mapList);
            });
        }
    });
}

function initFeelingLow() {
    const cards = document.querySelectorAll('.low-card');
    if(!cards.length) return;
    let idx = 0;
    setInterval(() => {
        cards.forEach(c => c.classList.remove('active'));
        cards[idx].classList.add('active');
        idx = (idx + 1) % cards.length;
    }, 4000);
}

function initMemoriesNav() {
    const nav = document.querySelector('.navbar');
    const header = document.querySelector('.header-section');
    if (!nav || !header) return;

    // --- MEMORIES GATE (Gated Reveal) ---
    const gate = document.createElement('div');
    gate.className = 'memories-gate';
    gate.innerHTML = `
        <div class="gate-content">
            <h2 class="gate-title">Ready to relive the chaos?</h2>
            <p class="gate-sub">The timeline is waiting. Turn up the noise.</p>
            <div class="sound-visualizer" id="gate-pulse">
                <div class="bar"></div>
                <div class="bar"></div>
                <div class="bar"></div>
                <div class="bar"></div>
                <div class="bar"></div>
                <span class="unlock-text">Enter the Flow</span>
            </div>
        </div>
    `;
    document.body.appendChild(gate);
    document.body.style.overflow = 'hidden'; // Lock scrolling

    gate.querySelector('#gate-pulse').addEventListener('click', () => {
        // Unlock Audio Context with a Cinematic Swell Sound
        const revealSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
        revealSound.volume = 0.6;
        
        revealSound.play().then(() => {
            gate.classList.add('unlocked');
            document.body.style.overflow = ''; // Restore scrolling
            localStorage.setItem('audio_unlocked', 'true');
            
            // START AUTO-SCROLL after unlocking
            startMemoryAutoScroll();
            
            setTimeout(() => gate.remove(), 1200);
        }).catch(e => {
            // Fallback for strict browser blocks
            gate.classList.add('unlocked');
            document.body.style.overflow = '';
            startMemoryAutoScroll();
        });
    });

    let lastScrollY = window.scrollY;
    let isHidden = false;

    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const headerRect = header.getBoundingClientRect();
        
        // 1. Hide: If scrolling down AND the header has left the viewport
        if (currentScrollY > lastScrollY && headerRect.bottom < 0) {
            if (!isHidden) {
                nav.classList.add('navbar-hidden');
                isHidden = true;
            }
        } 
        // 2. Show: ONLY once the header section starts appearing again
        // This prevents the nav from blocking memory cards during upward scrolls
        if (headerRect.bottom >= 0) {
            if (isHidden) {
                nav.classList.remove('navbar-hidden');
                isHidden = false;
            }
        }
        lastScrollY = currentScrollY;
    });

    // 3. Hover near top -> Show (Always available for quick access)
    window.addEventListener('mousemove', (e) => {
        if (isHidden && e.clientY < 60) {
            nav.classList.remove('navbar-hidden');
            isHidden = false;
        }
    });
}