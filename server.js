const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('.')); // Serve current folder as static

// Storage config to ALWAYS overwrite the same file for "replacement"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'assets/video';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // We name them specifically so they are "replaced"
    const name = file.fieldname === 'video' ? 'intro_video.mp4' : 'intro_thumb.jpg';
    cb(null, name);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB Limit
});

// Admin upload endpoint for localhost
app.post('/api/local-upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumb', maxCount: 1 }
]), (req, res) => {
  console.log('Video/Thumb replaced successfully on disk!');
  res.json({ 
    success: true, 
    videoUrl: '/assets/video/intro_video.mp4',
    thumbUrl: '/assets/video/intro_thumb.jpg'
  });
});

app.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}`);
});
