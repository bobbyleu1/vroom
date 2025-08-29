import { supabase } from './supabase';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system';

/**
 * Optimized media upload for React Native + Supabase
 * Handles both images and videos with proper error handling and logging
 */
export async function uploadMedia(uri, userId, type) {
  try {
    console.log('Starting upload:', { uri, userId, type });

    // Validate inputs
    if (!uri || !userId || !type) {
      throw new Error('Missing required parameters: uri, userId, or type');
    }

    // Get current timestamp for unique filename
    const timestamp = Date.now();
    
    // Get actual file extension from URI instead of hardcoding
    let fileExtension = uri.split('.').pop()?.toLowerCase() || 'unknown';
    
    // Map common extensions to proper ones and handle format compatibility
    if (type === 'image') {
      // Ensure image extensions are web-compatible
      if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
        fileExtension = 'jpg'; // Default fallback for images
      }
      // Convert HEIC to JPG for better compatibility
      if (['heic', 'heif'].includes(fileExtension)) {
        fileExtension = 'jpg';
      }
    } else if (type === 'video') {
      // Handle video format compatibility
      if (['mov', 'MOV'].includes(fileExtension)) {
        // Keep .mov files as .mov, but set proper content type
        fileExtension = 'mov';
      } else if (!['mp4', 'mov', 'avi', 'webm'].includes(fileExtension)) {
        fileExtension = 'mp4'; // Default fallback for videos
      }
    }
    
    const fileName = `${timestamp}.${fileExtension}`;
    const filePath = `${userId}/${fileName}`;

    console.log('Upload path:', filePath);

    // Read file using React Native's FileSystem (most reliable method)
    const fileInfo = await FileSystem.getInfoAsync(uri);
    console.log('File info:', {
      exists: fileInfo.exists,
      size: fileInfo.size,
      uri: fileInfo.uri
    });

    if (!fileInfo.exists) {
      throw new Error('File does not exist at the provided URI');
    }

    if (fileInfo.size === 0) {
      throw new Error('File is empty (0 bytes)');
    }

    // Use React Native compatible approach with file:// URI
    let fileData;
    
    // Determine proper content type first
    let contentType;
    if (type === 'image') {
      contentType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
    } else if (type === 'video') {
      contentType = fileExtension === 'mov' ? 'video/quicktime' : 'video/mp4';
    }

    // Read file as base64 and convert to ArrayBuffer (React Native compatible)
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Convert base64 to Uint8Array for upload
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    fileData = bytes.buffer;
    
    console.log('Upload details:', { 
      filePath, 
      contentType, 
      fileExtension,
      dataSize: bytes.length
    });

    // Upload to Supabase storage using ArrayBuffer
    const { data: uploadResult, error: uploadError } = await supabase.storage
      .from('posts')
      .upload(filePath, fileData, {
        contentType: contentType,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    console.log('Upload successful:', uploadResult);

    // Generate public URL
    const { data: urlData } = supabase.storage
      .from('posts')
      .getPublicUrl(filePath);

    const mediaUrl = urlData.publicUrl;
    console.log('Generated URL:', mediaUrl);

    // Use fallback thumbnail approach for immediate display
    let thumbnailUrl = null;
    
    if (type === 'video') {
      try {
        console.log('Generating video thumbnail...');
        const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 1000, // 1 second
          quality: 1.0,
        });

        // Convert thumbnail to base64 for React Native compatibility
        const thumbBase64 = await FileSystem.readAsStringAsync(thumbnailUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Convert base64 to Uint8Array
        const thumbBinaryString = atob(thumbBase64);
        const thumbBytes = new Uint8Array(thumbBinaryString.length);
        for (let i = 0; i < thumbBinaryString.length; i++) {
          thumbBytes[i] = thumbBinaryString.charCodeAt(i);
        }
        const thumbBlob = thumbBytes.buffer;
        
        const thumbPath = `thumbnails/${userId}/thumb_${timestamp}.jpg`;
        const { data: thumbResult, error: thumbError } = await supabase.storage
          .from('posts')
          .upload(thumbPath, thumbBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (thumbError) {
          console.warn('Thumbnail upload failed:', thumbError);
          console.warn('Attempted thumb path:', thumbPath);
          // Use video URL as fallback
          thumbnailUrl = mediaUrl;
        } else {
          const { data: thumbUrlData } = supabase.storage
            .from('posts')
            .getPublicUrl(thumbPath);
          thumbnailUrl = thumbUrlData.publicUrl;
          console.log('Thumbnail generated successfully:', thumbnailUrl);
          console.log('Thumbnail storage path:', thumbPath);
        }
      } catch (thumbError) {
        console.warn('Thumbnail generation failed:', thumbError);
        console.warn('Video URI that failed:', uri);
        // Use video URL as fallback
        thumbnailUrl = mediaUrl;
      }
    } else if (type === 'image') {
      // For images, use the media URL as thumbnail initially
      // The database trigger will generate a proper thumbnail later
      thumbnailUrl = mediaUrl;
      console.log('Using image URL as initial thumbnail:', thumbnailUrl);
    }

    const result = {
      mediaUrl,
      thumbnailUrl,
      filePath: uploadResult.path,
      fileSize: fileInfo.size
    };

    // For compatibility with existing code that expects imageUrls for images
    if (type === 'image') {
      result.imageUrls = [mediaUrl];
    }

    console.log('Upload complete:', result);
    return result;

  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}