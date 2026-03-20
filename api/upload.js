import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing" });
  }

  try {
    let body = request.body;
    
    // If the body is a string (happens on some Vercel Node configs), parse it
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    } 
    // If body is missing but it's a POST, try reading the stream
    else if (!body && request.method === 'POST') {
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
        // ...
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob API Error:", error);
    return response.status(400).json({ error: error.message });
  }
}
