import { auth, db, storage, sendSpark } from "./main.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, getDoc, getDocs, setDoc, addDoc, collection, 
    query, orderBy, limit, serverTimestamp, increment 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, formatNoteText } from "./utils.js";

/* --- GLOBAL & SHARED STATE --- */
window.gameActive = false;
let currentAnimId = null;
window.currentHighScore = parseInt(localStorage.getItem('star_drive_highscore') || '0');

/* --- TABS --- */
export function switchTab(id) {
    // Expert Fix: Auto-close "A Note for You" if it's open
    const aloneContent = document.getElementById('alone-content');
    if (aloneContent && aloneContent.style.display === 'block') {
        const aloneCard = document.getElementById('alone-card');
        if (aloneCard) toggleAloneCard(aloneCard);
    }

    document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab-' + id);
    if(target) target.classList.add('active');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Find button that has onclick with this id
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${id}'`)) {
            btn.classList.add('active');
        }
    });

    // Optimization: Pause game when leaving play tab
    if (id !== 'play' && window.gameActive) {
        window.gameActive = false;
        if (window.animationFrameId) cancelAnimationFrame(window.animationFrameId);
        const g = document.getElementById('game-container');
        if (g) g.style.display = 'none';
        const grid = document.querySelector('.grid-2');
        if (grid) grid.classList.remove('compact');
    }

    if (id === 'Reflection') {
        setTimeout(() => {
            if (typeof resizeConstellation === 'function') resizeConstellation();
            loadResilience(); // Ensure stars are loaded when tab is switched to
        }, 50);
    }
}
window.switchTab = switchTab;

/* --- FLUID MIRROR ENGINE --- */
let mirrorActive = false;
export function initFluidMirror() {
    const canvas = document.getElementById('fluid-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let ripples = [];
    
    const resize = () => { 
        canvas.width = window.innerWidth; 
        canvas.height = window.innerHeight; 
    };
    window.addEventListener('resize', resize); 
    resize();

    class Ripple {
        constructor(x, y) { 
            this.x = x; this.y = y; 
            this.r = 2; this.alpha = 0.6; this.speed = 2.5; 
        }
        update() { this.r += this.speed; this.alpha -= 0.01; }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.alpha})`; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(161, 140, 209, ${this.alpha * 0.5})`; ctx.lineWidth = 10; ctx.stroke();
        }
    }

    const addRipple = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches?.[0].clientX) - rect.left;
        const y = (e.clientY || e.touches?.[0].clientY) - rect.top;
        ripples.push(new Ripple(x, y));
        if (ripples.length > 50) ripples.shift();
    };

    canvas.addEventListener('mousemove', (e) => { if(Math.random() > 0.8) addRipple(e); });
    canvas.addEventListener('touchmove', (e) => { if(Math.random() > 0.8) addRipple(e); }, {passive: true});
    
    const observer = new IntersectionObserver(([entry]) => { mirrorActive = entry.isIntersecting; });
    observer.observe(canvas);

    function animate() {
        if (mirrorActive) {
            ctx.fillStyle = 'rgba(10, 10, 15, 0.15)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ripples.forEach((r, i) => { 
                r.update(); r.draw(); 
                if (r.alpha <= 0) ripples.splice(i, 1); 
            });
        }
        requestAnimationFrame(animate);
    }
    animate();
}

/* --- RAIN EFFECT --- */
let rainActive = false;
export function initRain() {
    const cvs = document.getElementById('rain-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let drops = [];
    const resize = () => { 
        cvs.width = window.innerWidth; 
        cvs.height = window.innerHeight; 
    };
    window.addEventListener('resize', resize); 
    resize();

    class Drop {
        constructor() { 
            this.x = Math.random() * cvs.width; 
            this.y = Math.random() * cvs.height; 
            this.len = Math.random() * 20 + 10; 
            this.speed = Math.random() * 5 + 5; 
            this.alpha = Math.random() * 0.5 + 0.2;
        }
        update() { 
            this.y += this.speed; 
            if (this.y > cvs.height) { 
                this.y = -this.len; 
                this.x = Math.random() * cvs.width; 
            } 
        }
        draw() { 
            ctx.strokeStyle = `rgba(174, 194, 224, ${this.alpha})`; 
            ctx.lineWidth = 1; 
            ctx.beginPath(); 
            ctx.moveTo(this.x, this.y); 
            ctx.lineTo(this.x, this.y + this.len); 
            ctx.stroke(); 
        }
    }
    for (let i = 0; i < 100; i++) drops.push(new Drop());

    const observer = new IntersectionObserver(([entry]) => { rainActive = entry.isIntersecting; });
    observer.observe(cvs);

    function animate() {
        if (rainActive) { 
            ctx.clearRect(0, 0, cvs.width, cvs.height); 
            drops.forEach(d => { d.update(); d.draw(); }); 
        }
        requestAnimationFrame(animate);
    }
    animate();
}

/* --- CAT TAMAGOTCHI --- */
export const catApp = {
    state: {
        love: 50, fullness: 50, bladder: 0, lastUpdated: Date.now()
    },
    isPuking: false,
    petCount: 0,
    feedCount: 0,
    get el() {
        return {
            cat: document.getElementById('virtual-cat'),
            love: document.getElementById('bar-love'),
            fullness: document.getElementById('bar-fullness'),
            bladder: document.getElementById('bar-bladder'),
            hearts: document.getElementById('cat-hearts')
        };
    },
    init() {
        this.loadState();
        setInterval(() => this.decay(), 60000);
        this.render();
        
        let lastPet = 0;
        const handleRub = (e) => {
            const now = Date.now();
            if (now - lastPet > 300) {
                lastPet = now;
                this.interact('pet');
                if (navigator.vibrate) navigator.vibrate(5);
            }
        };
        
        const cat = this.el.cat;
        if (cat) {
            cat.addEventListener('mousemove', handleRub);
            cat.addEventListener('touchmove', (e) => {
                e.preventDefault();
                handleRub(e);
            }, { passive: false });
        }
    },
    async loadState() {
        try {
            const snap = await getDoc(doc(db, 'global_state', 'cat'));
            if (snap.exists()) {
                const data = snap.data();
                const now = Date.now();
                const elapsedHours = (now - (data.lastUpdated || now)) / (1000 * 60 * 60);
                this.state.love = Math.max(0, Math.min(100, data.love - 5 * elapsedHours));
                this.state.fullness = Math.max(0, Math.min(100, data.fullness - 4 * elapsedHours));
                this.state.bladder = Math.max(0, Math.min(100, data.bladder + 3 * elapsedHours));
                this.state.lastUpdated = now;
                this.saveState();
            }
            this.render();
        } catch(e) { console.error("Cat load error", e); }
    },
    saveState() {
        if (!db) return;
        setDoc(doc(db, 'global_state', 'cat'), { ...this.state, lastUpdated: Date.now() }, { merge: true });
    },
    decay() {
        if (this.isPuking) return;
        this.state.love = Math.max(0, this.state.love - 0.5);
        this.state.fullness = Math.max(0, this.state.fullness - 0.8);
        this.state.bladder = Math.min(100, this.state.bladder + 0.6);
        this.render(); this.saveState();
        this.checkAutoPoop();
    },
    interact(type) {
        if (this.isPuking) return;

        if (type === 'pet') {
            if (this.state.love >= 100) {
                this.petCount++;
                if (this.petCount > 5) {
                    this.getSleepy();
                    return;
                }
            } else {
                this.petCount = 0;
            }
            this.state.love = Math.min(100, this.state.love + 10);
            this.animateCat('Purr... 😽', 'scale(1.1)');
            this.spawnHeart();
        } else if (type === 'feed') {
            if (this.state.fullness >= 100) {
                this.feedCount++;
                if (this.feedCount > 3) {
                    this.puke();
                    return;
                }
                if (document.getElementById('cat-container')?.style.display === 'block') {
                    return showToast("I'm full!", 'error');
                }
                return;
            } else {
                this.feedCount = 0;
            }
            this.state.fullness = Math.min(100, this.state.fullness + 20);
            this.state.bladder = Math.min(100, this.state.bladder + 10);
            this.animateCat('Yum! 🐟', 'rotate(5deg)');
        } else if (type === 'clean') {
            const poops = document.querySelectorAll('.cat-poop');
            if (poops.length > 0) {
                poops.forEach(p => {
                    p.style.transform = 'scale(0) translateY(20px)';
                    p.style.opacity = '0';
                    setTimeout(() => p.remove(), 500);
                });
                this.state.love = Math.min(100, this.state.love + 10);
                this.animateCat('Sparkling! ✨', 'translateY(-10px)');
                if (document.getElementById('cat-container')?.style.display === 'block') {
                    showToast("All clean now! 🧼", "success");
                }
                this.saveState(); this.render();
                return;
            }
            if (this.state.bladder <= 10) {
                if (document.getElementById('cat-container')?.style.display === 'block') {
                    return showToast("I don't need to go!", 'error');
                }
                return;
            }
            this.state.bladder = 0;
            this.state.love = Math.min(100, this.state.love + 5);
            this.animateCat('Relief... 💨', 'translateY(-10px)');
        }
        
        this.render(); this.saveState();
        this.checkAutoPoop();
        this.checkSuperHappy();
    },
    puke() {
        this.isPuking = true; this.feedCount = 0;
        const cat = this.el.cat;
        if (cat) {
            cat.innerText = '🤮';
            cat.style.transform = 'translateY(-10px) rotate(-10deg) scale(1.2)';
            const puddle = document.createElement('div');
            puddle.innerHTML = '🤢';
            puddle.style.cssText = "position: absolute; top: 65%; left: calc(50% - 85px); transform: scale(0); font-size: 40px; filter: blur(2px); transition: all 0.5s; opacity: 0; pointer-events: none; z-index: 5;";
            cat.parentElement.appendChild(puddle);
            requestAnimationFrame(() => { puddle.style.opacity = '0.8'; puddle.style.transform = 'scale(1)'; });
            setTimeout(() => {
                puddle.style.opacity = '0'; puddle.style.transform = 'scale(1.5) translateY(10px)';
                setTimeout(() => puddle.remove(), 500);
            }, 3500);
        }
        if (document.getElementById('cat-container')?.style.display === 'block') {
            showToast("The cat ate too much and puked!", "error");
        }
        setTimeout(() => {
            this.isPuking = false;
            if (cat) { cat.innerText = '🐈'; cat.style.transform = 'scale(1) rotate(0deg)'; }
            this.state.fullness = 60; this.state.love = Math.max(0, this.state.love - 20);
            this.render(); this.saveState();
        }, 4000);
    },
    checkAutoPoop() { if (this.state.bladder >= 100) this.poop(); },
    poop() {
        this.state.bladder = 0; this.state.love = Math.max(0, this.state.love - 15);
        const cat = this.el.cat;
        if (cat) {
            cat.innerText = '😳'; cat.style.transform = 'translateY(-20px)';
            const poop = document.createElement('div');
            poop.className = 'cat-poop'; poop.innerHTML = '💩';
            poop.style.cssText = `position: absolute; top: 70%; left: calc(50% + 55px); transform: scale(0); font-size: 30px; transition: all 0.5s; z-index: 5; pointer-events: none;`;
            cat.parentElement.appendChild(poop);
            requestAnimationFrame(() => { poop.style.transform = 'scale(1)'; });
            setTimeout(() => { if (cat.innerText === '😳') cat.innerText = '🐈'; cat.style.transform = 'translateY(0)'; }, 2000);
        }
        if (document.getElementById('cat-container')?.style.display === 'block') {
            showToast("Oops... accident! Better clean it up.", "normal");
        }
        this.render(); this.saveState();
    },
    getSleepy() {
        this.petCount = 0; const cat = this.el.cat;
        if (cat) { cat.innerText = '😴'; cat.style.transform = 'scale(0.9)'; cat.style.opacity = '0.8'; }
        if (document.getElementById('cat-container')?.style.display === 'block') {
            showToast("The cat is getting sleepy... 😴", "normal");
        }
        setTimeout(() => { if (cat) { cat.innerText = '🐈'; cat.style.transform = 'scale(1)'; cat.style.opacity = '1'; } }, 5000);
    },
    checkSuperHappy() {
        if (this.state.love > 90 && this.state.fullness > 90 && this.state.bladder < 10) {
            const now = Date.now();
            if (!this.lastHappyTime || now - this.lastHappyTime > 60000) {
                this.lastHappyTime = now;
                this.triggerCelebration();
            }
        }
    },
    triggerCelebration() {
        const cat = this.el.cat;
        if(cat) {
            cat.style.transform = 'translateY(-50px) rotate(360deg) scale(1.3)';
            setTimeout(() => cat.style.transform = 'scale(1) rotate(0deg)', 600);
        }
        const msgs = ["You make my world bright! ✨", "So happy to be yours! ❤️", "You are doing amazing.", "Purrr... life is good.", "Thank you for the care.", "You deserve love."];
        if (document.getElementById('cat-container')?.style.display === 'block') {
            showToast(msgs[Math.floor(Math.random() * msgs.length)], 'success');
        }
        for(let i=0; i<10; i++) setTimeout(() => this.spawnHeart(), i * 100);
    },
    render() {
        const el = this.el; if(!el.love) return;
        el.love.style.width = this.state.love + '%';
        el.fullness.style.width = this.state.fullness + '%';
        el.bladder.style.width = this.state.bladder + '%';
        el.love.style.background = this.state.love < 30 ? '#ff6b6b' : '#ff9a9e';
        el.fullness.style.background = this.state.fullness < 30 ? '#ff6b6b' : '#f6e58d';
        el.bladder.style.background = this.state.bladder > 80 ? '#ff6b6b' : '#74b9ff';
    },
    animateCat(msg, trans) {
        const cat = this.el.cat; if(!cat) return;
        cat.style.transform = trans;
        setTimeout(() => cat.style.transform = 'scale(1) rotate(0deg)', 200);
    },
    spawnHeart() {
        const container = this.el.hearts; if(!container) return;
        const h = document.createElement('div'); h.textContent = '❤️';
        h.style.cssText = `position:absolute; left:${50+(Math.random()*40-20)}%; top:50%; font-size:24px; opacity:1; transition:all 1s ease-out; pointer-events:none;`;
        container.appendChild(h);
        requestAnimationFrame(()=> { h.style.top='0%'; h.style.opacity='0'; });
        setTimeout(()=>h.remove(), 1000);
    }
};
window.catApp = catApp;

/* --- STAR DRIVE GAME --- */
(function() {
    let canvas, ctx;
    let gameState = 'start';
    let score = 0;
    let player = { x: 150, y: 250, size: 15 };
    let obstacles = [];
    let speedMultiplier = 1;
    let currentAnimId = null;

    class Obstacle {
        constructor() { this.reset(); this.y = Math.random() * -canvas.height; }
        reset() {
            this.x = Math.random() * canvas.width; this.y = -20;
            this.size = Math.random() * 12 + 8;
            this.speed = (Math.random() * 2.5 + 2) * speedMultiplier;
            const hue = Math.floor(Math.random() * 30) + 15;
            this.color = `hsl(${hue}, 80%, 50%)`;
        }
        update() {
            this.y += this.speed;
            if(this.y > canvas.height) { this.reset(); score += 10; }
        }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.shadowBlur = 15; ctx.shadowColor = this.color;
            ctx.fillStyle = this.color; ctx.fill();
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill(); ctx.shadowBlur = 0; 
        }
    }

    window.initGame = function(canvasId = 'bubble-canvas') {
        // Kill existing loop if any
        if (currentAnimId) { cancelAnimationFrame(currentAnimId); currentAnimId = null; }

        canvas = document.getElementById(canvasId);
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Sync canvas size to display size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width; canvas.height = rect.height;

        player.x = canvas.width / 2; player.y = canvas.height - 40;
        score = 0; speedMultiplier = 1; obstacles = []; gameState = 'start';

        // Mobile UI
        if (canvasId === 'bubble-canvas' && window.innerWidth <= 768) {
            const fsBtn = document.getElementById('mobile-game-fullscreen');
            if (fsBtn) fsBtn.style.display = 'block';
            fsBtn.onclick = (e) => { e.stopPropagation(); openFullGame(); };
        }

        const handleGameInput = () => {
            if (gameState === 'start' || gameState === 'gameover') startGame();
        };

        canvas.onclick = handleGameInput;
        canvas.ontouchstart = (e) => { 
            if (e.cancelable) e.preventDefault(); 
            handleGameInput(); 
            const r = canvas.getBoundingClientRect();
            updatePos(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
        };

        const updatePos = (x, y) => {
            if (gameState !== 'playing') return;
            player.x = Math.max(player.size, Math.min(canvas.width - player.size, x));
            player.y = Math.max(player.size, Math.min(canvas.height - player.size, y));
        };

        canvas.onmousemove = (e) => { const r = canvas.getBoundingClientRect(); updatePos(e.clientX - r.left, e.clientY - r.top); };
        canvas.ontouchmove = (e) => { 
            if (e.cancelable) e.preventDefault(); 
            const r = canvas.getBoundingClientRect(); 
            updatePos(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); 
        };

        const tick = () => {
            // STOP condition: if window is not active or context is lost
            if (!window.gameActive || !ctx) {
                currentAnimId = null;
                return;
            }

            // Expert Fix: If we are mini-canvas but overlay is visible, stop this loop immediately
            if (canvasId === 'bubble-canvas' && document.getElementById('star-drive-overlay').style.display === 'flex') {
                currentAnimId = null;
                return;
            }
            
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            ctx.fillStyle = 'rgba(15, 12, 41, 0.4)'; ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (gameState === 'start') {
                drawCenteredText("Star Drive", -20, "24px EB Garamond");
                drawCenteredText("Tap to Start", 20, "16px Inter", "#4facfe");
                drawPlayer(); 
            } 
            else if (gameState === 'playing') {
                drawPlayer();
                obstacles.forEach(obs => {
                    obs.update(); obs.draw();
                    if(Math.hypot(player.x - obs.x, (player.y + 12) - obs.y) < (player.size + obs.size - 5)) endGame();
                });
                score++; if (score % 500 === 0) speedMultiplier += 0.1;
                
                // Expert Fix: Only draw canvas HUD on mini version. 
                // Fullscreen uses HTML-based score UI.
                if (canvas.id === 'bubble-canvas') {
                    drawHUD();
                } else {
                    const fullScore = document.getElementById('full-game-score');
                    const fullHigh = document.getElementById('full-game-high');
                    if (fullScore) fullScore.textContent = score;
                    if (fullHigh) fullHigh.textContent = window.currentHighScore || 0;
                }
            } 
            else if (gameState === 'gameover') {
                drawCenteredText("Game Over", -20, "30px EB Garamond", "#ff6b6b");
                drawCenteredText("Score: " + score, 20, "20px Inter");
                drawCenteredText("Tap to Retry", 50, "16px Inter", "#ccc");
            }
            currentAnimId = requestAnimationFrame(tick);
        };
        // Only start one loop
        currentAnimId = requestAnimationFrame(tick);
    };

    function drawPlayer() {
        ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x - 12, player.y + 30); ctx.lineTo(player.x + 12, player.y + 30);
        ctx.fillStyle = '#4facfe'; ctx.shadowBlur = 10; ctx.shadowColor = '#4facfe'; ctx.fill(); ctx.shadowBlur = 0; 
    }
    function drawHUD() {
        ctx.fillStyle = "white"; ctx.font = "14px Inter";
        ctx.fillText(`Score: ${score}`, 10, 20);
        ctx.fillText(`☁️ High: ${window.currentHighScore || 0}`, 10, 40);

        const fullScore = document.getElementById('full-game-score');
        if (fullScore) fullScore.textContent = score;
    }
    function drawCenteredText(text, yOff, font, color="white") {
        ctx.fillStyle = color; ctx.font = font; ctx.textAlign = "center";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + yOff); ctx.textAlign = "left"; 
    }
    function endGame() {
        gameState = 'gameover';
        if (score > (window.currentHighScore || 0)) {
            saveHighScore(score);
        }
    }

    function startGame() { 
        score = 0; speedMultiplier = 1; 
        obstacles = Array.from({length: 8}, () => new Obstacle()); 
        gameState = 'playing'; 
        const msg = document.getElementById('full-game-start-msg');
        if (msg) msg.style.opacity = '0';
    }

    window.openFullGame = function() {
        const overlay = document.getElementById('star-drive-overlay');
        const backBtn = document.getElementById('back-link-container');
        const giftBtn = document.getElementById('gift-btn-container');
        
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (backBtn) backBtn.style.display = 'none';
        if (giftBtn) giftBtn.style.display = 'none';
        
        window.gameActive = true;
        window.initGame('star-drive-full-canvas');
    };

    window.closeFullGame = function() {
        const overlay = document.getElementById('star-drive-overlay');
        const backBtn = document.getElementById('back-link-container');
        const giftBtn = document.getElementById('gift-btn-container');
        
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        if (backBtn) backBtn.style.display = 'block';
        if (giftBtn) giftBtn.style.display = 'block';
        
        window.initGame('bubble-canvas'); 
    };
})();
export function toggleGame() {
    const g = document.getElementById('game-container');
    if (!g) return;

    // Expert Fix: On mobile, jump straight to fullscreen
    if (window.innerWidth <= 768 && !window.gameActive) {
        window.openFullGame();
        return;
    }

    window.gameActive = !window.gameActive;
    if (window.gameActive) {
        const c = document.getElementById('cat-container'); if (c) c.style.display = 'none';
        document.querySelector('.grid-2')?.classList.add('compact');
        g.style.display = 'block';
        requestAnimationFrame(() => { window.initGame(); });
    } else {
        g.style.display = 'none';
        document.querySelector('.grid-2')?.classList.remove('compact');
        if (currentAnimId) cancelAnimationFrame(currentAnimId);
    }
}
window.toggleGame = toggleGame;

function saveHighScore(score) {
    window.currentHighScore = score;
    localStorage.setItem('star_drive_highscore', score);
    
    showToast("New Personal Best! 🚀", "success");
    const fullHigh = document.getElementById('full-game-high');
    if (fullHigh) fullHigh.textContent = score;
    
    if (!db) {
        console.error("Firestore 'db' object is not initialized. Cannot save.");
        return;
    }

    setDoc(doc(db, 'global_state', 'star_drive'), { 
        highScore: score,
        updatedAt: Date.now(),
        lastPlayer: auth.currentUser?.displayName || "Friend"
    }, { merge: true })
    .catch(err => {
        console.error("❌ Firestore Save Failed:", err.message);
    });
}

async function loadHighScore() {
    try {
        const snap = await getDoc(doc(db, 'global_state', 'star_drive'));
        if (snap.exists()) {
            const remoteHigh = snap.data().highScore || 0;
            window.currentHighScore = remoteHigh; // SYNC TO GLOBAL
            localStorage.setItem('star_drive_highscore', remoteHigh);
            const fullHigh = document.getElementById('full-game-high');
            if (fullHigh) fullHigh.textContent = remoteHigh;
        }
    } catch(e) { console.error("High score sync error:", e); }
}

/* --- FAMILIAR SOUNDS & VISUALIZER --- */
let allSongs = [];
let filteredSongs = [];
let currentSongIndex = 0;
let audioCtx, analyser, dataArray;

async function loadFamiliarSounds() {
    try {
        const snap = await getDocs(query(collection(db, 'familiar_sounds'), orderBy('timestamp', 'desc')));
        allSongs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMood('all');
    } catch (e) { console.error("Error loading songs:", e); }
}

export function setMood(mood) {
    currentSongIndex = 0;
    document.querySelectorAll('.mood-btn').forEach(btn => {
        const btnMood = btn.getAttribute('onclick').match(/'(.*?)'/)[1];
        btn.classList.toggle('active', btnMood === mood);
    });
    filteredSongs = mood === 'all' ? allSongs : allSongs.filter(s => s.mood === mood);
    const info = document.getElementById('now-playing');
    if (filteredSongs.length > 0) {
        info.textContent = `Collection: ${mood === 'all' ? 'All' : mood.toUpperCase()} (${filteredSongs.length})`;
        prepareSong(0);
    } else {
        info.textContent = `No ${mood} songs found.`;
        const audio = document.getElementById('calm-audio');
        if (audio) { audio.pause(); document.getElementById('audio-play-btn').textContent = "▶"; }
    }
}
window.setMood = setMood;

function prepareSong(index) {
    if (!filteredSongs[index]) return;
    const song = filteredSongs[index], audio = document.getElementById('calm-audio');
    const wasPlaying = !audio.paused;
    audio.src = song.src;
    document.getElementById('now-playing').textContent = `Now Playing: ${song.title}`;
    if (wasPlaying) audio.play();
}

export function nextSong() {
    if (!filteredSongs.length) return;
    currentSongIndex = (currentSongIndex + 1) % filteredSongs.length;
    prepareSong(currentSongIndex);
}
window.nextSong = nextSong;

export function prevSong() {
    if (!filteredSongs.length) return;
    currentSongIndex = (currentSongIndex - 1 + filteredSongs.length) % filteredSongs.length;
    prepareSong(currentSongIndex);
}
window.prevSong = prevSong;

export function toggleAudio() {
    const audio = document.getElementById('calm-audio'), btn = document.getElementById('audio-play-btn');
    if (!filteredSongs.length) {
        if (document.getElementById('tab-Reflection')?.classList.contains('active')) {
            showToast("No songs available.", "normal");
        }
        return;
    }
    if (audio.paused) {
        if (!audio.src) prepareSong(0);
        audio.play(); btn.textContent = "⏸";
        if (!audioCtx) initViz(audio);
    } else { audio.pause(); btn.textContent = "▶"; }
}
window.toggleAudio = toggleAudio;

function initViz(audio) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser(); src.connect(analyser); analyser.connect(audioCtx.destination);
    analyser.fftSize = 64; analyser.smoothingTimeConstant = 0.85;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    const vCvs = document.getElementById('viz-canvas'), vCtx = vCvs.getContext('2d');
    vCvs.width = vCvs.offsetWidth; vCvs.height = vCvs.offsetHeight;
    function draw() {
        requestAnimationFrame(draw); analyser.getByteFrequencyData(dataArray);
        vCtx.clearRect(0,0,vCvs.width, vCvs.height);
        const barWidth = (vCvs.width / dataArray.length) * 2.5;
        let x = 0;
        for(let i=0; i<dataArray.length; i++) {
            const h = dataArray[i] / 2; vCtx.fillStyle = `rgb(${h+100}, 150, 250)`;
            vCtx.fillRect(x, vCvs.height - h, barWidth, h); x += barWidth + 1;
        }
    }
    draw();
}

/* --- PROCEDURAL SOUND ENGINE (SoundFX) --- */
export const SoundFX = {
    ctx: null,
    init() { 
        try {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    this.ctx = new AC();
                    const bSize = 2 * this.ctx.sampleRate;
                    this.noiseBuffer = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
                    const output = this.noiseBuffer.getChannelData(0);
                    for (let i = 0; i < bSize; i++) output[i] = Math.random() * 2 - 1;
                }
            }
            // Always try to resume on interaction
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        } catch(e) {}
    },
    click() {
        this.init();
        const now = this.ctx ? this.ctx.currentTime : 0;
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(g); g.connect(this.ctx.destination); osc.start(); osc.stop(now + 0.05);
    },
    jackpot() {
        this.init();
        const now = this.ctx ? this.ctx.currentTime : 0;
        const play = (f, t, d) => {
            const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(f, now + t);
            g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(0.15, now + t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, now + t + d);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(now + t); osc.stop(now + t + d);
        };
        play(523.25, 0, 0.5); play(659.25, 0.1, 0.5); play(783.99, 0.2, 0.8);
    },
    thump() {
        this.init();
        // Don't bail if state is not 'running' - mobile takes a moment to resume
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        
        const play = (f, v, t) => {
            const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(150, now + t);
            
            osc.type = 'sine'; osc.frequency.setValueAtTime(f, now + t);
            osc.frequency.exponentialRampToValueAtTime(f * 0.5, now + t + 0.15);
            
            g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(v, now + t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
            
            osc.connect(filter); filter.connect(g); g.connect(this.ctx.destination); 
            osc.start(now + t); osc.stop(now + t + 0.15);
        };
        play(60, 0.5, 0);      
        play(45, 0.4, 0.12);   
    },
    spark() {
        this.init(); if (this.ctx?.state !== 'running') return;
        const now = this.ctx.currentTime;
        const playTing = (freq, vol, delay) => {
            const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now + delay);
            g.gain.setValueAtTime(0, now + delay);
            g.gain.linearRampToValueAtTime(vol, now + delay + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
            osc.connect(g); g.connect(this.ctx.destination);
            osc.start(now + delay); osc.stop(now + delay + 0.3);
        };
        playTing(1800, 0.03, 0); playTing(2400, 0.02, 0.05); playTing(3200, 0.01, 0.1);
    },
    cruise(active) {
        this.init(); if (!this.ctx) return;
        if (active) {
            if (this.cruiseTimeout) { clearTimeout(this.cruiseTimeout); this.cruiseTimeout = null; }
            if (this.cruiseNode) return;
            this.cruiseNode = this.ctx.createOscillator(); this.cruiseGain = this.ctx.createGain();
            this.cruiseNode.type = 'sawtooth'; this.cruiseNode.frequency.setValueAtTime(40, this.ctx.currentTime);
            const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(250, this.ctx.currentTime);
            this.cruiseGain.gain.setValueAtTime(0, this.ctx.currentTime); this.cruiseGain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 1);
            this.cruiseNode.connect(f); f.connect(this.cruiseGain); this.cruiseGain.connect(this.ctx.destination); this.cruiseNode.start();
            this.windNode = this.ctx.createBufferSource(); this.windNode.buffer = this.noiseBuffer; this.windNode.loop = true;
            this.windFilter = this.ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
            this.windGain = this.ctx.createGain(); this.windGain.gain.setValueAtTime(0, this.ctx.currentTime); this.windGain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 2);
            this.windNode.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.ctx.destination); this.windNode.start();
        } else {
            const curC = this.cruiseGain?.gain.value || 0, curW = this.windGain?.gain.value || 0;
            if (this.cruiseGain) { this.cruiseGain.gain.cancelScheduledValues(this.ctx.currentTime); this.cruiseGain.gain.setValueAtTime(curC, this.ctx.currentTime); this.cruiseGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1); }
            if (this.windGain) { this.windGain.gain.cancelScheduledValues(this.ctx.currentTime); this.windGain.gain.setValueAtTime(curW, this.ctx.currentTime); this.windGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5); }
            if (this.cruiseTimeout) clearTimeout(this.cruiseTimeout);
            this.cruiseTimeout = setTimeout(() => {
                if (this.cruiseNode) { this.cruiseNode.stop(); this.cruiseNode = null; }
                if (this.windNode) { this.windNode.stop(); this.windNode = null; }
                this.cruiseTimeout = null;
            }, 1600);
        }
    },
    updateCruiseDynamics(sf) {
        if (!this.ctx || !this.windFilter || !this.cruiseGain) return;
        const now = this.ctx.currentTime;
        const buff = (Math.sin(now * 1.5) * 0.3) + (Math.sin(now * 4.2) * 0.15) + (Math.sin(now * 12.1) * 0.05);
        const intense = sf * (1 + buff);
        this.windFilter.frequency.setTargetAtTime(100 + (intense * 1200), now, 0.1);
        this.windGain.gain.setTargetAtTime(0.015 + (intense * 0.12), now, 0.1);
        this.cruiseGain.gain.setTargetAtTime(0.035 + (sf * 0.04), now, 0.15);
    }
};
window.SoundFX = SoundFX;

/* --- MIDNIGHT CRUISE ENGINE --- */
let cruiseActive = false, cruiseAnimId, roadSpeed = 0, roadOffset = 0, cruiseVibrateId;
const bumblebeeImg = new Image(); bumblebeeImg.src = 'bumblebee.png';

export function openCruise() {
    SoundFX.init(); const overlay = document.getElementById('cruise-overlay');
    overlay.style.display = 'flex'; overlay.classList.remove('cruise-active');
    if (cruiseAnimId) cancelAnimationFrame(cruiseAnimId);
    initCruiseCanvas();

    const content = document.getElementById('cruise-content');
    const driveBtn = document.getElementById('mobile-drive-btn');
    if (window.innerWidth <= 768) {
        content.querySelector('h2').textContent = "Tap Drive to ride.";
        if (driveBtn) {
            driveBtn.style.display = 'block';
            driveBtn.ontouchstart = (e) => { if(e.cancelable) e.preventDefault(); startCruise(); };
            driveBtn.ontouchend = (e) => { if(e.cancelable) e.preventDefault(); stopCruise(); };
        }
    } else {
        content.querySelector('h2').textContent = "Hold Space to ride.";
        if (driveBtn) driveBtn.style.display = 'none';
    }
    content.querySelector('p').textContent = "The wind is yours today.";

    window.addEventListener('keydown', handleCruiseKD); window.addEventListener('keyup', handleCruiseKU);
}
window.openCruise = openCruise;

export function closeCruise() {
    stopCruise(); document.getElementById('cruise-overlay').style.display = 'none';
    if (cruiseAnimId) cancelAnimationFrame(cruiseAnimId);
    window.removeEventListener('keydown', handleCruiseKD); window.removeEventListener('keyup', handleCruiseKU);
}
window.closeCruise = closeCruise;

function handleCruiseKD(e) { if (e.code === 'Space') { e.preventDefault(); startCruise(); } }
function handleCruiseKU(e) { if (e.code === 'Space') stopCruise(); }

function startCruise() {
    if (cruiseActive) return; cruiseActive = true;
    document.getElementById('cruise-overlay').classList.add('cruise-active');
    document.getElementById('cruise-content').style.opacity = '0';
    document.getElementById('cruise-stats').style.opacity = '1';
    document.getElementById('cruise-stats').querySelector('span').textContent = "Cruising the night...";
    SoundFX.cruise(true);
    if (navigator.vibrate) cruiseVibrateId = setInterval(() => navigator.vibrate([15, 30]), 100);
}
function stopCruise() {
    cruiseActive = false; document.getElementById('cruise-overlay').classList.remove('cruise-active');
    const content = document.getElementById('cruise-content');
    content.style.opacity = '1';
    if (window.innerWidth <= 768) {
        content.querySelector('h2').textContent = "Pulled over.";
        content.querySelector('p').textContent = "Tap the stars while you rest, or tap Drive to ride again.";
    } else {
        content.querySelector('h2').textContent = "Pulled over.";
        content.querySelector('p').textContent = "Tap the stars while you rest, or hold Space to ride again.";
    }

    document.getElementById('cruise-stats').style.opacity = '0';
    SoundFX.cruise(false); if (cruiseVibrateId) clearInterval(cruiseVibrateId);
    if (navigator.vibrate) navigator.vibrate(0);
}

function initCruiseCanvas() {
    const canvas = document.getElementById('cruise-canvas'), ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;

    const stars = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5,
        p: Math.random() * Math.PI * 2,
        twinkle: 0
    }));

    let moonPulse = 0;
    // Star & Moon Interaction
    const handleSkyInteraction = (e) => {
        if (cruiseActive) return;
        const rect = canvas.getBoundingClientRect();
        const mx = ((e.touches ? e.touches[0].clientX : e.clientX)) - rect.left;
        const my = ((e.touches ? e.touches[0].clientY : e.clientY)) - rect.top;

        // UI/UX Expert Fix: Don't interact with stars if tapping near the Drive button
        if (window.innerWidth <= 768 && my > canvas.height - 120) return;

        const mX = canvas.width * 0.85, mY = canvas.height * 0.12, mS = 25;
        if (Math.hypot(mx - mX, my - mY) < mS * 2) {
            moonPulse = 40;
            SoundFX.spark();
            return;
        }

        stars.forEach(s => {
            if (Math.hypot(s.x - mx, s.y - my) < 30) {
                s.twinkle = 30;
                SoundFX.spark();
            }
        });
    };
    canvas.onclick = handleSkyInteraction;

    let objects = [], lastLight = 0, lightSide = 1, lastBumblebeeOffset = 0;
    function spawn() {
        // Ensure bumblebees don't clump and appear more predictably (every 6-12 lights approx)
        const distSinceBumble = roadOffset - lastBumblebeeOffset;
        const hasBumblebee = objects.some(o => o.type === 'bumblebee');
        
        if (!hasBumblebee && distSinceBumble > 10) { // Cooldown of ~6 lights
            if (Math.random() > 0.7 || distSinceBumble > 25) { // Spawn chance or forced spawn
                objects.push({ progress: 0, side: 1.2, type: 'bumblebee' });
                lastBumblebeeOffset = roadOffset;
                return; // Don't spawn a light pole if a bumblebee spawned
            }
        }
        
        objects.push({ progress: 0, side: lightSide, type: 'light' }); lightSide *= -1;
    }
    function draw() {
        ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Moon
        const mX = canvas.width * 0.85, mY = canvas.height * 0.12, mS = 25;
        const pulse = moonPulse > 0 ? (moonPulse / 40) * 15 : 0;
        if (moonPulse > 0) moonPulse--;

        const grad = ctx.createRadialGradient(mX, mY, 0, mX, mY, mS * 3 + pulse);
        grad.addColorStop(0, `rgba(255, 255, 230, ${0.1 + (pulse/30)})`); grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(mX, mY, mS * 3 + pulse, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = `rgba(255, 253, 224, ${0.8 + (pulse/50)})`; 
        ctx.beginPath(); ctx.arc(mX, mY, mS + (pulse/4), 0, Math.PI*2); ctx.fill();
        
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.beginPath(); ctx.arc(mX - 8 - (pulse/8), mY - 4 - (pulse/8), mS + (pulse/4), 0, Math.PI*2); ctx.fill(); 
        ctx.globalCompositeOperation = 'source-over';
        // Stars
        stars.forEach(s => {
            let a = 0.2 + (Math.sin(s.p + Date.now() / 1000) + 1) / 2 * 0.5;
            let sz = s.size;
            if (s.twinkle > 0) {
                a = Math.min(1, a + s.twinkle / 30);
                sz *= (1 + s.twinkle / 15);
                s.twinkle--;
            }
            ctx.fillStyle = `rgba(255, 255, 255, ${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, sz, 0, Math.PI*2); ctx.fill();
        });
        const tSpeed = cruiseActive ? 0.012 : 0; 
        roadSpeed += (tSpeed - roadSpeed) * (cruiseActive ? 0.05 : 0.02); // Slower stop
        roadOffset += roadSpeed;

        if (cruiseActive) SoundFX.updateCruiseDynamics((roadSpeed - 0.0015) / 0.0105);
        
        const hY = canvas.height * 0.45, rW = canvas.width * 0.8;
        if (roadSpeed > 0.001 && roadOffset - lastLight > 1.6) { spawn(); lastLight = roadOffset; }
        
        objects.forEach((obj, i) => {
            obj.progress += roadSpeed; if (obj.progress >= 1) { objects.splice(i, 1); return; }
            const p = Math.pow(obj.progress, 2), x = (canvas.width / 2) + (obj.side * rW * 0.5 * p), y = hY + (canvas.height - hY) * p, s = p * 150;
            if (obj.type === 'light') {
                ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 3); ctx.stroke();
                const g = ctx.createRadialGradient(x, y - s * 3, 0, x, y - s * 3, s);
                g.addColorStop(0, 'rgba(255, 255, 200, 0.4)'); g.addColorStop(1, 'transparent');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - s * 3, s, 0, Math.PI*2); ctx.fill();
            } else if (obj.type === 'bumblebee' && bumblebeeImg.complete) {
                const iW = s * 2, iH = iW * (bumblebeeImg.height / bumblebeeImg.width);
                ctx.drawImage(bumblebeeImg, x - iW / 2, y - iH, iW, iH);
            }
        });
        // Road Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(canvas.width * 0.1, canvas.height); ctx.lineTo(canvas.width / 2, hY);
        ctx.moveTo(canvas.width * 0.9, canvas.height); ctx.lineTo(canvas.width / 2, hY); ctx.stroke();
        
        if (roadSpeed > 0.0001) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${cruiseActive ? 0.3 : 0.1})`; ctx.setLineDash([canvas.height * 0.1, canvas.height * 0.15]);
            ctx.lineDashOffset = roadOffset * 1000; ctx.beginPath(); ctx.moveTo(canvas.width / 2, canvas.height); ctx.lineTo(canvas.width / 2, hY); ctx.stroke();
            ctx.setLineDash([]);
        }
        cruiseAnimId = requestAnimationFrame(draw);
    }
    draw();
}

/* --- EMERGENCY SMILE (SERENDIPITY REEL) --- */
let isReelSpinning = false, reelConfetti;
export async function showEmergencySmile() {
    if (isReelSpinning) return; SoundFX.init();
    const data = window.GALLERY_DATA; 
    if(!data?.length) {
        if (document.getElementById('reel-overlay')?.style.display === 'flex') {
            showToast("Loading memories...", "normal");
        }
        return;
    }
    const imgs = data.filter(i => i.src && (i.src.startsWith('http') || i.src.startsWith('data:'))).map(i => ({ ...i, resSrc: i.src }));
    if(!imgs.length) {
        if (document.getElementById('reel-overlay')?.style.display === 'flex') {
            showToast("No photos found!", "error");
        }
        return;
    }
    const overlay = document.getElementById('reel-overlay'), status = document.getElementById('reel-status'), rImg = document.getElementById('reel-img'), closeBtn = document.getElementById('reel-close'), canvas = document.getElementById('reel-confetti-canvas');
    isReelSpinning = true; overlay.style.display = 'flex'; closeBtn.style.display = 'none'; status.textContent = "PREPARING..."; rImg.src = "";
    const pool = Array.from({length: 5}, () => imgs[Math.floor(Math.random() * imgs.length)].resSrc);
    const winner = imgs[Math.floor(Math.random() * imgs.length)].resSrc;
    await Promise.all([...new Set([...pool, winner])].map(s => new Promise(r => { 
        const i = new Image(); 
        i.crossOrigin = "anonymous"; 
        i.src = s; 
        i.onload = () => r(true); 
        i.onerror = () => r(false); 
    })));
    if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (!reelConfetti) reelConfetti = confetti.create(canvas, { resize: true, useWorker: false }); }
    status.textContent = "SHUFFLING...";
    let it = 0;
    const shut = setInterval(() => {
        rImg.src = pool[it % pool.length]; rImg.classList.add('reel-blur');
        SoundFX.click(); it++; if (navigator.vibrate) navigator.vibrate(5);
        if (it >= 15) {
            clearInterval(shut); rImg.src = winner; rImg.classList.remove('reel-blur'); rImg.classList.add('reel-jackpot');
            status.textContent = "JACKPOT! ✨"; status.style.color = "#ff9a9e"; SoundFX.jackpot();
            if (reelConfetti) reelConfetti({ particleCount: 150, spread: 70, origin: { x: 0.5, y: 0.5 }, colors: ['#ff9a9e', '#a18cd1', '#ffffff'] });
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            setTimeout(() => { closeBtn.style.display = 'block'; isReelSpinning = false; }, 500);
        }
    }, 100);
}
window.showEmergencySmile = showEmergencySmile;

window.closeReel = () => { document.getElementById('reel-overlay').style.display = 'none'; document.getElementById('reel-img').classList.remove('reel-jackpot'); if (reelConfetti) reelConfetti.reset(); };

/* --- CONSTELLATION OF SELF --- */
let cStars = [], sStars = [], nextSS = Date.now() + 5000, cCvs, cCtx, cAnimId;
const ARIES = [{ x: 0.85, y: 0.2, label: "Hamal" }, { x: 0.65, y: 0.25, label: "Sheratan" }, { x: 0.55, y: 0.45, label: "Mesarthim" }];
const PROMPTS = ["A discovery for the journey...", "A win no one else saw today:", "What made you feel peaceful?", "Reminder for next heavy time:", "A strength you noticed:", "Something you are proud of:", "A promise for tomorrow:"];
let curPIdx = 0;

class Star {
    constructor(d) {
        this.d = d; 
        this.nX = d.normX; this.nY = d.normY; 
        this.isAnchor = d.isAnchor || d.isAriesAnchor; 
        this.isBD = d.isBD || d.isBirthdayStar;
        
        // Use a safe initial resize
        this.x = this.nX * (cCvs?.width || 1); 
        this.y = this.nY * (cCvs?.height || 1);
        
        this.baseS = this.isBD ? 4 : (this.isAnchor ? 3 : 1.5); 
        this.s = this.baseS;
        this.vx = (Math.random() - 0.5) * 0.05; this.vy = (Math.random() - 0.5) * 0.05;
        this.pulse = Math.random() * Math.PI; this.pSpd = 0.01 + Math.random() * 0.02; this.hov = false;
    }
    update() {
        if (!this.isAnchor && !this.isBD) { 
            this.x += this.vx; this.y += this.vy; 
            // Correct mapping back to normalized coordinates for resizes
            this.nX = this.x / (cCvs?.width || 1); 
            this.nY = this.y / (cCvs?.height || 1); 
        }
        this.pulse += this.pSpd; 
        this.s = (this.baseS + Math.sin(this.pulse) * 1) * (this.hov ? 2.5 : 1);
    }
    draw(pp = 0) {
        let a = this.hov ? 1 : (0.4 + Math.sin(this.pulse) * 0.3); 
        if (this.isAnchor) a = Math.max(a, 0.3 + pp * 0.5);
        
        cCtx.beginPath(); cCtx.arc(this.x, this.y, this.s, 0, Math.PI*2);
        if (this.isBD) { cCtx.shadowColor = "rgba(255,209,212,0.9)"; cCtx.fillStyle = `rgba(255,209,212,${a})`; }
        else if (this.isAnchor) { cCtx.shadowColor = `rgba(161,140,209,${0.4+pp*0.6})`; cCtx.fillStyle = `rgba(255,255,255,${a})`; }
        else { cCtx.shadowColor = "rgba(161,140,209,0.5)"; cCtx.fillStyle = `rgba(255,255,255,${a*0.7})`; }
        cCtx.shadowBlur = this.hov ? 25 : (this.isAnchor ? 15 + pp * 15 : 15); cCtx.fill(); cCtx.shadowBlur = 0;
        
        if (this.isAnchor && this.d.pIdx < ARIES.length - 1) {
            const next = cStars.find(s => s.d.pIdx === this.d.pIdx + 1);
            if (next) { 
                cCtx.beginPath(); cCtx.moveTo(this.x, this.y); cCtx.lineTo(next.x, next.y); 
                cCtx.strokeStyle = `rgba(161,140,209,${0.1+pp*0.3})`; cCtx.lineWidth = 1+pp; cCtx.stroke(); 
            }
        }
    }
}

class ShootingStar {
    constructor() { this.reset(); }
    reset() {
        const h = Math.random() > 0.5;
        if (h) { this.x = Math.random() > 0.5 ? -50 : cCvs.width + 50; this.y = Math.random() * cCvs.height * 0.5; this.vx = (this.x < 0 ? 1 : -1) * (Math.random() * 2 + 2); }
        else { this.x = Math.random() * cCvs.width; this.y = -50; this.vx = (Math.random() - 0.5) * 1.5; }
        this.vy = Math.random() * 1.5 + 1.5; this.trail = []; this.maxT = 35; this.active = true;
        const msgs = [
            "You're capable of more than you even realize. I've seen it.",
            "The way you keep moving forward is actually inspiring. Don't stop.",
            "You’ve got a light in you that even hard days can’t shake.",
            "I'm always in your corner, No matter how heavy it feels.",
            "You are enough. You are more than enough. You are everything.",
            "Don't let a heavy day make you forget how amazing you truly are.",
            "You make the world better just by being in it. I mean that.",
            "You’re growing, learning, and doing better than you give yourself credit for.",
            "You’re a masterpiece in progress. Trust yourself.",
            "Sending you a huge hug through this star, From the universe!",
            "I wish you could see how strong and capable you really are.",
            "You've conquered 100% of your bad days. This one won't stop you.",
            "You’re built different. In the best, slightly chaotic way possible.",
            "If life tries to mess with you today… remind it who it’s dealing with.",
            "You’ve handled worse. This is just another side quest.",
            "Main character energy. Always. Don’t forget it.",
            "You + determination = unstoppable combo. Science probably agrees.",
            "Bad day? Cool. You’re still cooler.",
            "You don’t just survive chaos… you kinda thrive in it.",
            "Somewhere out there, today is scared of you.",
            "You’ve got that ‘figure it out anyway’ energy. That’s rare.",
            "Not every hero wears a cape. Some just keep going like you do.",
            "You make things happen, even when things are messy.",
            "This is just a plot twist. You’re still winning the story.",
            "You’ve got more resilience than you realize, and it shows.",
            "You don’t quit. That’s your superpower.",
            "Even on low-energy days, you’re still doing better than you think.",
            "You’ve got that spark. Don’t let a random day mess with it.",
            "Chaos follows you… but somehow you’re still in charge.",
            "You’re the kind of person who turns ‘this is bad’ into ‘handled.’",
            "No pressure, but you’ve already proven you can deal with anything.",
            "You’re stronger than whatever today is throwing at you. Easily.",
            "You don’t need perfect conditions to keep going, and that’s powerful.",
            "You’ve got momentum. Even slow steps count.",
            "You’ve come too far to doubt yourself now.",
            "You’re not stuck. You’re just mid-level boss fighting. Keep going."
        ];
        this.msg = msgs[Math.floor(Math.random() * msgs.length)];
    }
    update() {
        this.trail.push({x:this.x, y:this.y}); if (this.trail.length > this.maxT) this.trail.shift();
        this.x += this.vx; this.y += this.vy; if (this.y > cCvs.height + 100 || this.x < -100 || this.x > cCvs.width + 100) this.active = false;
    }
    draw() {
        if (!this.active) return;
        for (let i = 0; i < this.trail.length - 1; i++) {
            cCtx.strokeStyle = `rgba(255,255,255,${(i/this.trail.length)*0.4})`;
            cCtx.beginPath(); cCtx.moveTo(this.trail[i].x, this.trail[i].y); cCtx.lineTo(this.trail[i+1].x, this.trail[i+1].y); cCtx.stroke();
        }
        cCtx.beginPath(); cCtx.arc(this.x, this.y, 2.5, 0, Math.PI*2); cCtx.fillStyle = 'white'; cCtx.shadowBlur = 10; cCtx.shadowColor = 'white'; cCtx.fill(); cCtx.shadowBlur = 0;
    }
}

export function initConstellation() {
    cCvs = document.getElementById('constellation-canvas'); if (!cCvs) return;
    cCtx = cCvs.getContext('2d'); resizeConstellation(); window.addEventListener('resize', resizeConstellation);
    cCvs.addEventListener('mousedown', handleCClick); cCvs.addEventListener('touchstart', e => { handleCClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); });
    cCvs.addEventListener('mousemove', e => {
        const r = cCvs.getBoundingClientRect(); const mX = e.clientX - r.left, mY = e.clientY - r.top;
        let hov = false; cStars.forEach(s => { const d = Math.hypot(s.x - mX, s.y - mY); if (d < 30) { hov = true; s.hov = true; } else s.hov = false; });
        sStars.forEach(s => { if (Math.hypot(s.x - mX, s.y - mY) < 40) hov = true; });
        cCvs.style.cursor = hov ? 'pointer' : 'default';
    });
    if (!cAnimId) animConst();
}
window.initConstellation = initConstellation;

export function resizeConstellation() {
    const c = document.getElementById('constellation-container'); if (!c || !cCvs) return;
    cCvs.width = c.offsetWidth; cCvs.height = c.offsetHeight;
    cStars.forEach(s => { s.x = s.nX * cCvs.width; s.y = s.nY * cCvs.height; });
}
window.resizeConstellation = resizeConstellation;

export function toggleConstellationFullscreen() {
    const card = document.getElementById('constellation-card');
    const icon = document.getElementById('fullscreen-icon');
    const navbar = document.querySelector('.navbar');
    const tabBar = document.querySelector('.tab-bar');
    const backBtn = document.getElementById('back-link-container');
    const giftBtn = document.getElementById('gift-btn-container');
    const isFullscreen = card.classList.toggle('fullscreen-card');
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    if (isFullscreen) {
        // Change icon to "minimize"
        icon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>';
        document.body.style.overflow = 'hidden'; // Prevent scrolling
        if (navbar) navbar.style.display = 'none';
        if (tabBar) tabBar.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (giftBtn) giftBtn.style.display = 'none';
    } else {
        // Change icon back to "maximize"
        icon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>';
        document.body.style.overflow = '';
        if (navbar) navbar.style.display = 'flex';
        if (tabBar) tabBar.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'block';
        if (giftBtn) giftBtn.style.display = 'block';
    }

    // Re-trigger resize to fill new dimensions
    setTimeout(resizeConstellation, 50);
}window.toggleConstellationFullscreen = toggleConstellationFullscreen;

function animConst() {
    if (document.getElementById('tab-Reflection').classList.contains('active')) {
        cCtx.clearRect(0,0,cCvs.width, cCvs.height);
        const pp = (Math.sin(Date.now() / 1000) + 1) / 2;
        if (sStars.length === 0 && Date.now() > nextSS) sStars.push(new ShootingStar());
        sStars.forEach((s, i) => { s.update(); s.draw(); if (!s.active) { sStars.splice(i, 1); nextSS = Date.now() + 15000 + Math.random() * 30000; } });
        cStars.forEach(s => { s.update(); s.draw(pp); });
    }
    cAnimId = requestAnimationFrame(animConst);
}

function handleCClick(e) {
    const r = cCvs.getBoundingClientRect(); const mX = e.clientX - r.left, mY = e.clientY - r.top;
    let ss = sStars.find(s => Math.hypot(s.x - mX, s.y - mY) < 40);
    if (ss) return pluckStar({ d: { prompt: "Message from Void:", text: ss.msg } }, true);
    let closest = null, min = 30;
    cStars.forEach(s => { const d = Math.hypot(s.x - mX, s.y - mY); if (d < min) { min = d; closest = s; } });
    if (closest) pluckStar(closest);
}

function pluckStar(s, isSS = false) {
    const ov = document.getElementById('plucked-star-overlay');
    document.getElementById('plucked-prompt').textContent = s.d.prompt || "Discovery:";
    document.getElementById('plucked-text').textContent = s.d.text;
    ov.style.background = isSS ? "rgba(25,25,50,0.9)" : "rgba(15,12,41,0.9)";
    ov.style.display = 'flex'; setTimeout(() => ov.style.opacity = '1', 10);
}
window.closePluckedStar = () => { const ov = document.getElementById('plucked-star-overlay'); ov.style.opacity = '0'; setTimeout(() => ov.style.display = 'none', 300); };

window.toggleInputZone = (show) => { document.getElementById('resilience-input-zone').style.display = show ? 'block' : 'none'; document.getElementById('constellation-controls').style.display = show ? 'none' : 'flex'; };
window.cyclePrompt = () => { curPIdx = (curPIdx + 1) % PROMPTS.length; document.getElementById('active-prompt').textContent = PROMPTS[curPIdx]; };

export async function saveResilience() {
    const input = document.getElementById('resilience-input'); const text = input.value.trim(); if (!text) return;
    const count = cStars.length, isBD = count === 10;
    const data = { text, prompt: PROMPTS[curPIdx], timestamp: Date.now(), normX: isBD ? 0.5 : 0.1+Math.random()*0.8, normY: isBD ? 0.2 : 0.1+Math.random()*0.8, isBD };
    try {
        await addDoc(collection(db, 'global_resilience'), data);
        input.value = ''; window.toggleInputZone(false);

        if (isBD) {
            if (document.getElementById('tab-Reflection')?.classList.contains('active')) {
                showToast("The 11th star... birth star. ✨", "success");
            }
            if (typeof confetti !== 'undefined') {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#ffd1d4', '#ff9a9e', '#a18cd1']
                });
            }
        } else {
            if (document.getElementById('tab-Reflection')?.classList.contains('active')) {
                showToast("New star born. ✨", "success");
            }
        }

        loadResilience();
    } catch(e) { 
        if (document.getElementById('tab-Reflection')?.classList.contains('active')) {
            showToast("Error saving", "error"); 
        }
    }
}
window.saveResilience = saveResilience;

export async function loadResilience() {
    try {
        const snap = await getDocs(query(collection(db, 'global_resilience'), orderBy('timestamp', 'asc')));
        cStars = []; const hist = document.getElementById('history-items-container'); hist.innerHTML = '';
        snap.docs.forEach((doc, idx) => {
            const d = doc.data();
            if (idx < ARIES.length) {
                d.normX = ARIES[idx].x; d.normY = ARIES[idx].y;
                d.isAnchor = true; d.pIdx = idx;
            }
            else if (idx === 10 || d.isBirthdayStar || d.isBD) {
                d.isBD = true; d.normX = 0.5; d.normY = 0.2;
            }
            cStars.push(new Star(d));
            const el = document.createElement('div'); el.style.cssText = "background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; font-size: 0.85rem; border-left: 2px solid var(--accent-cool);";
            el.innerHTML = `<small style="display:block; opacity:0.5;">${d.prompt}</small><span>${d.text}</span>`; hist.prepend(el);
        });
        resizeConstellation(); // Sync sizes after load
    } catch(e) { console.error("Error loading resilience:", e); }
}window.loadResilience = loadResilience;
window.toggleArchive = () => { const l = document.getElementById('resilience-list'); l.style.display = l.style.display === 'block' ? 'none' : 'block'; };

/* --- RITUAL & JAR --- */
window.releaseWorry = () => {
    const input = document.getElementById('void-input'), box = document.getElementById('void-box');
    if(!input?.value.trim()) return;
    const plane = document.createElement('div'); plane.className = 'paper-plane';
    plane.innerHTML = `<svg viewBox="0 0 24 24" fill="white"><path d="M2 12L22 2L15 22L11 13L2 12Z" stroke="#333"/></svg>`;
    const r = box.getBoundingClientRect(); 
    // Fix: Add window.scrollX/Y to get absolute page coordinates instead of viewport coordinates
    plane.style.left = (window.scrollX + r.left + r.width/2)+'px'; 
    plane.style.top = (window.scrollY + r.top + r.height/2)+'px';
    plane.style.transform = `translate(-50%,-50%) rotate(${(Math.random()-0.5)*30}deg)`;
    document.body.appendChild(plane); input.value = '';
    setTimeout(() => plane.classList.add('fly-away'), 50); setTimeout(() => plane.remove(), 8100);
};

window.burnVent = () => {
    const txt = document.getElementById('vent-input'), jar = document.querySelector('.jar-container'), lid = document.querySelector('.jar-lid');
    if(!txt?.value.trim()) return;
    const p = document.createElement('div'); p.className = 'vent-paper'; p.innerText = txt.value.substring(0, 20)+'...';
    const r = txt.getBoundingClientRect(); p.style.left = (r.left + r.width/2 - 40)+'px'; p.style.top = (r.top + r.height/2 - 30)+'px';
    document.body.appendChild(p); txt.style.opacity = '0';
    requestAnimationFrame(() => {
        const lr = lid.getBoundingClientRect(); p.classList.add('crumple'); p.style.left = (lr.left + lr.width/2 - 10)+'px'; p.style.top = (lr.top-40)+'px';
        setTimeout(() => {
            const jr = jar.getBoundingClientRect(); p.style.top = (jr.top + jr.height - 30)+'px';
            setTimeout(() => {
                document.getElementById('jar-fire').style.opacity = '1'; p.style.transform = 'scale(0)';
                setTimeout(() => { p.remove(); txt.value = ''; txt.style.opacity = '1'; document.getElementById('jar-fire').style.opacity = '0'; }, 2000);
            }, 600);
        }, 2000);
    });
};

/* --- HEARTBEAT --- */
(function() {
    const btn = document.getElementById('heart-btn'), cont = document.getElementById('hb-container'), txt = document.getElementById('breathe-txt');
    let hbI, brI;
    if (!btn) return;
    const start = () => {
        if (hbI) return; btn.classList.add('active'); cont.classList.add('active');
        let state = 0; txt.textContent = "Inhale..."; brI = setInterval(() => { state = 1-state; txt.textContent = state === 0 ? "Inhale..." : "Exhale..."; }, 4000);
        const p = () => { if (navigator.vibrate) navigator.vibrate([70, 50, 70, 810]); SoundFX.thump(); }; p(); hbI = setInterval(p, 1000);
    };
    const stop = () => { btn.classList.remove('active'); cont.classList.remove('active'); clearInterval(hbI); hbI = null; clearInterval(brI); brI = null; if (navigator.vibrate) navigator.vibrate(0); txt.textContent = "Breathe"; };
    btn.addEventListener('mousedown', start); window.addEventListener('mouseup', stop);
    btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }); btn.addEventListener('touchend', stop);
})();

/* --- MISC --- */
window.showNavOverride = () => {
    const nav = document.querySelector('.tab-bar');
    const tab = document.getElementById('nav-pull-tab');
    if (nav) nav.classList.remove('hidden');
    if (tab) tab.style.display = 'none';
};

window.toggleAloneCard = (card) => {
    const content = document.getElementById('alone-content'); const vis = content.style.display === 'block';
    const nav = document.querySelector('.tab-bar');
    const tab = document.getElementById('nav-pull-tab');

    content.style.display = vis ? 'none' : 'block';
    card.querySelector('h3 span').textContent = vis ? '(Tap to read)' : '(Tap to close)';
    
    if (!vis) { 
        card.classList.add('resonance-card'); 
        if (window.innerWidth > 768) {
            if (nav) nav.classList.add('hidden');
            if (tab) tab.style.display = 'block';
        } else {
            // UI/UX Expert Fix: Hide top buttons on mobile to avoid overlap
            const backBtn = document.getElementById('back-link-container');
            const giftBtn = document.getElementById('gift-btn-container');
            
            const handleMobileNoteScroll = () => {
                const rect = card.getBoundingClientRect();
                // If the top of the card is below 60px, show the buttons again
                if (rect.top > 60) {
                    if (backBtn) backBtn.style.opacity = '1';
                    if (giftBtn) giftBtn.style.opacity = '1';
                    if (backBtn) backBtn.style.pointerEvents = 'auto';
                    if (giftBtn) giftBtn.style.pointerEvents = 'auto';
                } else {
                    if (backBtn) backBtn.style.opacity = '0';
                    if (giftBtn) giftBtn.style.opacity = '0';
                    if (backBtn) backBtn.style.pointerEvents = 'none';
                    if (giftBtn) giftBtn.style.pointerEvents = 'none';
                }
            };

            if (backBtn) { backBtn.style.transition = 'opacity 0.3s'; }
            if (giftBtn) { giftBtn.style.transition = 'opacity 0.3s'; }
            
            window.addEventListener('scroll', handleMobileNoteScroll);
            handleMobileNoteScroll(); // Initial check
            
            // Store reference to remove it later
            card._scrollHandler = handleMobileNoteScroll;
        }
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); 
    }
    else {
        card.classList.remove('resonance-card');
        if (window.innerWidth <= 768) {
            const backBtn = document.getElementById('back-link-container');
            const giftBtn = document.getElementById('gift-btn-container');
            if (backBtn) { backBtn.style.opacity = '1'; backBtn.style.pointerEvents = 'auto'; }
            if (giftBtn) { giftBtn.style.opacity = '1'; giftBtn.style.pointerEvents = 'auto'; }
            window.removeEventListener('scroll', card._scrollHandler);
        }
        if (nav) nav.classList.remove('hidden');
        if (tab) tab.style.display = 'none';
    }
};

window.toggleCat = () => { 
    const c = document.getElementById('cat-container'); const vis = c.style.display === 'block';
    c.style.display = vis ? 'none' : 'block';
    const grid = document.querySelector('.grid-2');
    if (vis) grid.classList.remove('compact'); else { grid.classList.add('compact'); document.getElementById('game-container').style.display = 'none'; window.gameActive = false; }
};

/* --- INIT --- */
onAuthStateChanged(auth, user => {
    if (user) {
        initFluidMirror(); initRain(); catApp.init(); loadFamiliarSounds(); initConstellation(); loadResilience(); loadHighScore();
        getDoc(doc(db, 'config', 'feelingLow')).then(snap => {
            if (snap.exists()) {
                const el = document.getElementById('reassurance-text');
                const text = snap.data().aloneText || "";
                if (el) el.innerHTML = formatNoteText(text);
            }
        });
    }
});

// Auto-close note when tab is hidden or page is left
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        const aloneContent = document.getElementById('alone-content');
        if (aloneContent && aloneContent.style.display === 'block') {
            const aloneCard = document.getElementById('alone-card');
            if (aloneCard) toggleAloneCard(aloneCard);
        }
    }
});
