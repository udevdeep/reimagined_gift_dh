import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // Basic security check: only allow from localhost
  const remoteAddress = req.socket.remoteAddress;
  if (remoteAddress !== '::1' && remoteAddress !== '127.0.0.1' && remoteAddress !== '::ffff:127.0.0.1') {
    console.warn(`Blocked unauthorized upload attempt from ${remoteAddress}`);
    return res.status(403).json({ error: 'Forbidden: Local upload only allowed from localhost' });
  }

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
