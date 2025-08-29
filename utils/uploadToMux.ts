// uploadToMux.ts
import { Upload } from 'tus-js-client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

type CreateUploadResp = { uploadUrl: string; uploadId: string };

export async function pickAndUploadToMux({ 
  supabaseUrl, 
  accessToken, 
  postId, 
  userId 
}: {
  supabaseUrl: string;
  accessToken: string; // your Supabase session.access_token
  postId: string | number;
  userId: string;
}) {
  // 1) Ask your Edge Function for a direct-upload URL
  const r = await fetch(`${supabaseUrl}/functions/v1/mux-create-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // If your function requires auth (recommended), include the user JWT:
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ postId, userId }),
  });
  if (!r.ok) throw new Error(`create-upload failed: ${r.status}`);
  const { uploadUrl } = (await r.json()) as CreateUploadResp;

  // 2) Let user pick a video
  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 1, // keep source quality; Mux will transcode
  });
  if (pick.canceled) return { canceled: true };

  const fileUri = pick.assets[0].uri;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) throw new Error('File not found');

  // 3) Upload directly to Mux via TUS (no extra headers needed)
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(fileUri as any, {
      endpoint: uploadUrl,
      chunkSize: 5 * 1024 * 1024, // 5MB chunks are mobile-friendly
      metadata: { filename: 'upload.mp4', filetype: 'video/mp4' },
      onError: reject,
      onProgress: (sent, total) => {
        // plug into your progress UI: Math.round((sent/total)*100)
        console.log('Upload progress:', Math.round((sent/total)*100) + '%');
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  return { canceled: false };
}

// Alternative function that takes a file URI directly (useful for camera captures)
export async function uploadVideoToMux({ 
  fileUri,
  supabaseUrl, 
  accessToken, 
  postId, 
  userId 
}: {
  fileUri: string;
  supabaseUrl: string;
  accessToken: string;
  postId: string | number;
  userId: string;
}) {
  // 1) Ask your Edge Function for a direct-upload URL
  const r = await fetch(`${supabaseUrl}/functions/v1/mux-create-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ postId, userId }),
  });
  if (!r.ok) throw new Error(`create-upload failed: ${r.status}`);
  const { uploadUrl } = (await r.json()) as CreateUploadResp;

  // 2) Verify file exists
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) throw new Error('File not found');

  // 3) Upload directly to Mux via TUS (no extra headers needed)
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(fileUri as any, {
      endpoint: uploadUrl,
      chunkSize: 5 * 1024 * 1024, // 5MB chunks are mobile-friendly
      metadata: { filename: 'upload.mp4', filetype: 'video/mp4' },
      onError: reject,
      onProgress: (sent, total) => {
        console.log('Upload progress:', Math.round((sent/total)*100) + '%');
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}