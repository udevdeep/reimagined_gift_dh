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
    } else {
      console.error('Missing Firebase Admin environment variables:', { 
        projectId: !!projectId, 
        clientEmail: !!clientEmail, 
        privateKey: !!privateKey 
      });
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
  }
}

// We re-enable bodyParser because the handshake/completion JSON is small.
// The large file upload itself bypasses this API route.
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(request, response) {
  console.log("Upload API Request received:", request.method, "Body present:", !!request.body);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is missing");
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing in environment variables" });
  }

  try {
    const body = request.body;
    if (!body) {
      throw new Error("Request body is empty. Ensure bodyParser is enabled.");
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        console.log("Handshake: Generating token for", pathname);
        let idToken = null;

        if (clientPayload) {
          try {
            const payload = typeof clientPayload === 'string' 
              ? JSON.parse(clientPayload) 
              : clientPayload;
            idToken = payload.idToken;
          } catch (e) {
            console.error("Handshake: Failed to parse clientPayload:", e.message);
          }
        }

        if (!idToken) {
          const authHeader = request.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            idToken = authHeader.split('Bearer ')[1];
          }
        }

        if (!idToken) {
          console.error("Handshake: No idToken found");
          throw new Error('Unauthorized: Missing authentication token');
        }

        try {
          if (!admin.apps.length) {
            console.error("Handshake: Firebase Admin not initialized");
            throw new Error('Firebase Admin not initialized');
          }
          
          console.log("Handshake: Verifying token...");
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          const uid = decodedToken.uid;
          console.log("Handshake: Token verified for UID:", uid);

          const db = admin.firestore();
          const adminDoc = await db.collection('admin_whitelist').doc(uid).get();

          if (!adminDoc.exists) {
            console.error(`Handshake: Unauthorized upload attempt by UID: ${uid}`);
            throw new Error('Forbidden: User is not an administrator');
          }

          console.log(`Handshake: Authorized upload for admin UID: ${uid}`);

          // Expert Fix: Disable random suffixing on server to ensure signature consistency with client
          return {
            tokenPayload: uid, // Simple string payload
            addRandomSuffix: true,
          };
        } catch (authError) {
          console.error('Handshake: Auth/Whitelist Verification Failed:', authError.message);
          throw new Error('Unauthorized: ' + authError.message);
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Upload completed successfully:", blob.url);
      },
    });

    console.log("API: Handshake successful. Returning token payload to client.");
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("API: Vercel Blob Handler Error:", error.message);
    return response.status(400).json({ error: error.message });
  }
}
