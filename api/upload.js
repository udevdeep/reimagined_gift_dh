import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  // CRITICAL CHECK: If this token is missing, the API will 500
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("CRITICAL: BLOB_READ_WRITE_TOKEN is missing in environment!");
    return response.status(500).json({ error: "Server configuration error: Blob Token missing" });
  }

  try {
    // Standard Vercel Node.js runtime parses the body automatically
    // But if you use the Edge runtime, you need await request.json()
    let body = request.body;
    if (typeof request.json === 'function' && !body) {
      body = await request.json();
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'],
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('blob upload completed', blob.url);
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob API Error:", error);
    return response.status(400).json({ error: error.message });
  }
}
