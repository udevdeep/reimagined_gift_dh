/**
 * Shared Utilities for The Dh Archive
 */

export const resolvePath = (path, folder = '') => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return path;
};

export const getContrastYIQ = (hexcolor) => {
    if (!hexcolor || hexcolor.charAt(0) !== '#') return 'white';
    const r = parseInt(hexcolor.substr(1, 2), 16);
    const g = parseInt(hexcolor.substr(3, 2), 16);
    const b = parseInt(hexcolor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
};

export const showToast = (message, type = 'normal') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:99999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
        document.body.appendChild(container);
    }
    
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.style.cssText = `
        padding: 12px 24px;
        background: ${type === 'success' ? 'rgba(40, 167, 69, 0.9)' : 'rgba(0,0,0,0.8)'};
        color: white;
        border-radius: 50px;
        font-size: 0.9rem;
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        animation: toast-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        pointer-events: auto;
    `;
    el.textContent = message;
    container.appendChild(el);

    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes toast-in {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .toast.fade-out {
                opacity: 0;
                transform: translateY(-20px);
                transition: all 0.5s ease;
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 500);
    }, 3000);
};

export async function runWithConcurrency(tasks, concurrency) {
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

export async function downloadResource(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.error('Download failed', e);
        window.open(url, '_blank'); // Fallback
    }
}

/**
 * Formats text for display in HTML, supporting:
 * 1. Newlines -> <br>
 * 2. **bold** -> <strong>bold</strong>
 * @param {string} t 
 * @returns {string}
 */
export const formatNoteText = (t) => {
    if (!t) return "";
    return t.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

/**
 * Expert UI/UX Fix: Client-side Image Compression
 * Resizes large images and converts to high-quality WebP.
 * Helps reduce file sizes by up to 80% with no visible quality loss.
 */
export async function compressImage(file, { maxWidth = 2000, quality = 0.85 } = {}) {
    if (!file.type.startsWith('image/')) return file; // Skip videos
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export as WebP for best compression/quality ratio
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                        type: 'image/webp',
                        lastModified: Date.now()
                    }));
                }, 'image/webp', quality);
            };
        };
    });
}

/**
 * Generates a tiny optimized thumbnail (approx 400px wide)
 */
export async function generateThumbnail(file, size = 400) {
    return compressImage(file, { maxWidth: size, quality: 0.7 });
}
