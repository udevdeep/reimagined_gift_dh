const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const ASSETS_DIR = path.join(__dirname, 'assets');
const GALLERY_DIR = path.join(ASSETS_DIR, 'gallery_photos');
const MEMORIES_DIR = path.join(ASSETS_DIR, 'memories_photos');
const JOKES_FILE = path.join(ASSETS_DIR, 'jokes', 'jokes.json');

const GALLERY_JSON = path.join(GALLERY_DIR, 'photos.json');
const MEMORIES_JSON = path.join(MEMORIES_DIR, 'memories.json');

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'];

// --- HELPERS ---
function isMedia(file) {
    return ALLOWED_EXTS.includes(path.extname(file).toLowerCase());
}

// --- UPDATE GALLERY ---
function updateGallery() {
    console.log('📸 Scanning Gallery...');
    
    let currentData = [];
    if (fs.existsSync(GALLERY_JSON)) {
        try {
            currentData = JSON.parse(fs.readFileSync(GALLERY_JSON, 'utf8'));
        } catch (e) {
            console.error('Error reading existing gallery JSON:', e);
        }
    }

    // Get list of physical files
    const files = fs.readdirSync(GALLERY_DIR).filter(f => isMedia(f));
    
    // Create a set of existing filenames in the JSON to preserve their metadata (dates/private)
    const existingMap = new Map();
    currentData.forEach(item => {
        const name = typeof item === 'string' ? item : item.file;
        existingMap.set(name, item);
    });

    const newData = [];
    let addedCount = 0;

    files.forEach(filename => {
        if (existingMap.has(filename)) {
            // Keep existing metadata
            newData.push(existingMap.get(filename));
        } else {
            // Add new file with default metadata
            const stats = fs.statSync(path.join(GALLERY_DIR, filename));
            newData.push({
                file: filename,
                date: stats.birthtime.toISOString(), // Use file creation time
                private: false
            });
            addedCount++;
        }
    });

    // Sort by date (newest first)
    newData.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
    });

    fs.writeFileSync(GALLERY_JSON, JSON.stringify(newData, null, 2));
    console.log(`✅ Gallery updated. Found ${files.length} files. Added ${addedCount} new.`);
}

// --- UPDATE MEMORIES ---
function updateMemories() {
    console.log('\n🧠 Scanning Memories...');
    
    // Get list of directories in memories_photos
    const folders = fs.readdirSync(MEMORIES_DIR).filter(f => {
        return fs.statSync(path.join(MEMORIES_DIR, f)).isDirectory();
    });

    // Update memories.json list
    fs.writeFileSync(MEMORIES_JSON, JSON.stringify(folders, null, 2));
    console.log(`✅ memories.json updated with ${folders.length} folders.`);

    // Check each folder for meta.json
    folders.forEach(folder => {
        const folderPath = path.join(MEMORIES_DIR, folder);
        const metaPath = path.join(folderPath, 'meta.json');
        
        if (!fs.existsSync(metaPath)) {
            console.log(`   🔸 Creating missing meta.json for: ${folder}`);
            
            // Try to find images/videos in this folder to auto-populate
            const mediaFiles = fs.readdirSync(folderPath).filter(f => isMedia(f));
            const images = mediaFiles.filter(f => !f.endsWith('.mp4') && !f.endsWith('.mov'));
            const videos = mediaFiles.filter(f => f.endsWith('.mp4') || f.endsWith('.mov'));

            const defaultMeta = {
                title: folder.charAt(0).toUpperCase() + folder.slice(1),
                text: "Description goes here...",
                date: new Date().toISOString().split('T')[0],
                private: false,
                images: images,
                video: videos.length > 0 ? videos[0] : null
            };

            fs.writeFileSync(metaPath, JSON.stringify(defaultMeta, null, 2));
        }
    });
}

// --- MAIN ---
try {
    updateGallery();
    updateMemories();
    console.log('\n✨ All data synchronized!');
} catch (e) {
    console.error("\n❌ Error:", e.message);
}
