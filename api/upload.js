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
  // Essential headers for Vercel Blob Handshake
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (request.method === 'OPTIONS') return response.status(200).end();

  try {
    const jsonResponse = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let idToken = null;
        try {
          const payload = typeof clientPayload === 'string' ? JSON.parse(clientPayload) : clientPayload;
          idToken = payload.idToken;
        } catch (e) {
          throw new Error('Could not parse auth token');
        }

        if (!idToken) throw new Error('Missing idToken');
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        
        const db = admin.firestore();
        const adminDoc = await db.collection('admin_whitelist').doc(uid).get();
        if (!adminDoc.exists) throw new Error('Forbidden: Not an admin');

        return {
          tokenPayload: uid,
          addRandomSuffix: true, // Crucial for Multipart stability
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Upload finished:", blob.url);
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("API Error:", error.message);
    return response.status(400).json({ error: error.message });
  }
}
