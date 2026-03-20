import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  // 1. Ensure token exists
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return response.status(500).json({ error: "BLOB_READ_WRITE_TOKEN is missing in Vercel Dashboard" });
  }

  try {
    // 2. Extract body safely
    const body = request.body;

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
        // Optional logic after upload
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob Error:", error.message);
    return response.status(400).json({ error: error.message });
  }
}
