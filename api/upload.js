import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  try {
    const body = await request.json();

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Optional: Add logic here to check if the user is an admin
        return {
          allowedContentTypes: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'],
          tokenPayload: JSON.stringify({
            // Optional data
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called after upload is successful
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Vercel Blob API Error:", error);
    return response.status(400).json({ error: error.message });
  }
}
