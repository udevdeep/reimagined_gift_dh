import { handleUpload } from '@vercel/blob/client';
import admin from 'firebase-admin';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin initialized successfully');
    } else {
      console.error('Missing Firebase Admin environment variables');
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
  }
}

// Vercel recommended config for Blob uploads to avoid body parsing issues
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request, response) {
  console.log("Upload API Request received:", request.method);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is missing");
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing" });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        console.log("onBeforeGenerateToken called for:", pathname);
        let idToken = null;

        if (clientPayload) {
          try {
            const payload = JSON.parse(clientPayload);
            idToken = payload.idToken;
          } catch (e) {
            console.error("Failed to parse clientPayload:", e.message);
          }
        }

        if (!idToken) {
          const authHeader = request.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            idToken = authHeader.split('Bearer ')[1];
          }
        }

        if (!idToken) {
          console.error("No idToken found in clientPayload or Authorization header");
          throw new Error('Unauthorized: Missing authentication token');
        }

        try {
          if (!admin.apps.length) {
            throw new Error('Firebase Admin not initialized');
          }
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          const uid = decodedToken.uid;
          console.log("Token verified for UID:", uid);

          const db = admin.firestore();
          const adminDoc = await db.collection('admin_whitelist').doc(uid).get();

          if (!adminDoc.exists) {
            console.error(`Unauthorized upload attempt by UID: ${uid}`);
            throw new Error('Forbidden: User is not an administrator');
          }

          console.log(`Authorized upload for admin UID: ${uid}`);

          return {
            allowedContentTypes: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
            tokenPayload: JSON.stringify({ userId: uid }),
          };
        } catch (authError) {
          console.error('Auth/Whitelist Verification Failed:', authError.message);
          throw new Error('Unauthorized: ' + authError.message);
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Upload completed:", blob.url);
      },
    });

    console.log("handleUpload response generated");
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob Handler Error:", error.message);
    return response.status(401).json({ error: error.message });
  }
}
