import { handleUpload } from '@vercel/blob/client';
import admin from 'firebase-admin';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin initialized successfully');
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(request, response) {
  // 1. Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // 2. Handle OPTIONS request (pre-flight)
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing" });
  }

  try {
    const body = request.body;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let idToken = null;
        if (clientPayload) {
          try {
            const payload = typeof clientPayload === 'string' ? JSON.parse(clientPayload) : clientPayload;
            idToken = payload.idToken;
          } catch (e) {}
        }

        if (!idToken) throw new Error('Unauthorized: Missing token');

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        
        const db = admin.firestore();
        const adminDoc = await db.collection('admin_whitelist').doc(uid).get();
        if (!adminDoc.exists) throw new Error('Forbidden: Not an admin');

        return {
          tokenPayload: uid,
          addRandomSuffix: true,
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Upload completed successfully:", blob.url);
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
