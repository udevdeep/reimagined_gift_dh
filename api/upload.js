import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Here you could check for a valid session or admin cookie
        return {
          allowedContentTypes: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'],
          tokenPayload: JSON.stringify({
            // Optional data to be sent to the onUploadCompleted callback
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // This is called after the upload is finished on the server side
        console.log('blob upload completed', blob, tokenPayload);
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
}
