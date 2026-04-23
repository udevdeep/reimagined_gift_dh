import { handleUpload } from '@vercel/blob/client';
import admin from 'firebase-admin';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Ensure private key is handled correctly (replaces literal \n with actual newlines)
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
  }
}

export default async function handler(request, response) {
  // 1. Ensure token exists
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing in Vercel Dashboard" });
  }

  try {
    const body = request.body;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // --- SECURITY: AUTHENTICATION CHECK ---
        // Expecting the client to send 'authorization' header with Firebase ID Token
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new Error('Unauthorized: Missing or invalid authorization header');
        }

        const idToken = authHeader.split('Bearer ')[1];
        try {
          // Verify the ID Token
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          const uid = decodedToken.uid;

          // --- SECURITY: AUTHORIZATION CHECK ---
          // Check if this UID is in the admin_whitelist collection in Firestore
          const db = admin.firestore();
          const adminDoc = await db.collection('admin_whitelist').doc(uid).get();

          if (!adminDoc.exists) {
            console.error(`Unauthorized upload attempt by UID: ${uid}`);
            throw new Error('Forbidden: User is not an administrator');
          }

          console.log(`Authorized upload for admin UID: ${uid}`);

          return {
            allowedContentTypes: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'],
            tokenPayload: JSON.stringify({ userId: uid }),
          };
        } catch (authError) {
          console.error('Auth Verification Failed:', authError.message);
          throw new Error('Unauthorized: ' + authError.message);
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional logic after upload
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob Error:", error.message);
    return response.status(401).json({ error: error.message });
  }
}
