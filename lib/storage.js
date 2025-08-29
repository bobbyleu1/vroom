import { supabase } from '../utils/supabase.js';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

const STORAGE_BUCKET = 'posts';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm'];

function sanitizePath(path) {
  return path.replace(/[^a-zA-Z0-9._/-]/g, '').replace(/\.{2,}/g, '.');
}

function validateFileType(contentType, type) {
  if (type === 'image') {
    return ALLOWED_IMAGE_TYPES.includes(contentType);
  } else if (type === 'video') {
    return ALLOWED_VIDEO_TYPES.includes(contentType);
  }
  return false;
}

async function getFileInfo(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('File does not exist');
    }
    return info;
  } catch (error) {
    throw new Error(`Unable to access file: ${error.message}`);
  }
}

function generateSecureFileName(userId, type, extension) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  // Match your Supabase structure: posts/{userId}/{timestamp}.{ext}
  return `${userId}/${timestamp}_${randomId}.${extension}`;
}

export async function uploadMedia({ localUri, type, userId = null }) {
  try {
    if (!localUri) {
      throw new Error('Local URI is required');
    }

    if (!userId) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        throw new Error('User authentication required');
      }
      userId = user.id;
    }

    const fileInfo = await getFileInfo(localUri);
    
    if (fileInfo.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const response = await fetch(localUri);
    const blob = await response.blob();
    
    if (!validateFileType(blob.type, type)) {
      throw new Error(`Invalid file type: ${blob.type}. Expected ${type} format.`);
    }

    const extension = blob.type.split('/')[1] || (type === 'image' ? 'jpg' : 'mp4');
    const fileName = generateSecureFileName(userId, type, extension);
    const sanitizedPath = sanitizePath(fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(sanitizedPath, blob, {
        contentType: blob.type,
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    let thumbnailPath = null;
    if (type === 'video') {
      try {
        const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(localUri, {
          time: 1000,
          quality: 0.8,
        });

        const thumbResponse = await fetch(thumbnailUri);
        const thumbBlob = await thumbResponse.blob();
        // Match your thumbnail structure: thumbnails/{userId}/thumb_{timestamp}.jpg
        const thumbFileName = `thumbnails/${userId}/thumb_${Date.now()}.jpg`;
        const sanitizedThumbPath = sanitizePath(thumbFileName);

        const { error: thumbError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(sanitizedThumbPath, thumbBlob, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (!thumbError) {
          thumbnailPath = sanitizedThumbPath;
        }
      } catch (thumbErr) {
        console.warn('Thumbnail generation failed:', thumbErr.message);
      }
    }

    const mediaInfo = await getMediaDimensions(localUri, type);

    return {
      storagePath: uploadData.path,
      thumbnailPath,
      mime: blob.type,
      width: mediaInfo.width,
      height: mediaInfo.height,
      duration: mediaInfo.duration,
      publicUrl: await getDisplayUrl(uploadData.path),
      thumbnailUrl: thumbnailPath ? await getDisplayUrl(thumbnailPath) : null,
    };

  } catch (error) {
    console.error('Upload media error:', error.message);
    throw error;
  }
}

async function getMediaDimensions(uri, type) {
  try {
    if (type === 'image') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: null, height: null });
        img.src = uri;
      });
    } else if (type === 'video') {
      try {
        const { width, height, duration } = await VideoThumbnails.getThumbnailAsync(uri, { time: 0 });
        return { width, height, duration };
      } catch {
        return { width: null, height: null, duration: null };
      }
    }
  } catch {
    return { width: null, height: null, duration: null };
  }
  return { width: null, height: null, duration: null };
}

export async function getDisplayUrl(storagePath) {
  try {
    if (!storagePath) {
      return null;
    }

    // Since posts bucket is public, use public URLs directly
    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    
    return publicData?.publicUrl || null;
  } catch (error) {
    console.error('URL generation error:', error.message);
    return null;
  }
}

export async function deleteMedia(storagePath) {
  try {
    if (!storagePath) {
      return;
    }

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error('Delete media error:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('Delete media error:', error.message);
    throw error;
  }
}