import { supabase } from './supabase';

/**
 * Fix thumbnail URLs for videos that have incorrect paths
 * This addresses the issue where thumbnails were uploaded to userId/ instead of thumbnails/userId/
 */
export async function fixThumbnailPaths() {
  console.log('Starting thumbnail path fix...');
  
  try {
    // Find videos with thumbnail URLs that don't exist
    const { data: videos, error } = await supabase
      .from('posts')
      .select('id, author_id, thumbnail_url, media_url, created_at')
      .eq('file_type', 'video')
      .not('thumbnail_url', 'is', null)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching videos:', error);
      return;
    }
    
    console.log(`Found ${videos.length} videos to check`);
    
    let fixedCount = 0;
    
    for (const video of videos) {
      try {
        // Check if current thumbnail URL returns 404
        const response = await fetch(video.thumbnail_url, { method: 'HEAD' });
        
        if (response.status === 404) {
          console.log(`Fixing thumbnail for video ${video.id}`);
          
          // Extract filename from the broken URL
          // URLs like: .../posts/thumbnails/userId/thumb_timestamp.jpg
          // But files might be at: .../posts/userId/thumb_timestamp.jpg
          const urlParts = video.thumbnail_url.split('/');
          const fileName = urlParts[urlParts.length - 1]; // thumb_timestamp.jpg
          const userId = video.author_id;
          
          // Check if file exists at the old location (userId/filename)
          const oldPath = `${userId}/${fileName}`;
          const { data: fileExists } = await supabase.storage
            .from('posts')
            .list(userId, {
              limit: 100,
              search: fileName
            });
          
          if (fileExists && fileExists.length > 0) {
            // File exists at old location, need to move it
            console.log(`Moving thumbnail from ${oldPath} to thumbnails/${userId}/${fileName}`);
            
            // Download file from old location
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('posts')
              .download(oldPath);
              
            if (downloadError) {
              console.warn(`Failed to download ${oldPath}:`, downloadError);
              continue;
            }
            
            // Upload to new location
            const newPath = `thumbnails/${userId}/${fileName}`;
            const { error: uploadError } = await supabase.storage
              .from('posts')
              .upload(newPath, fileData, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
              });
              
            if (uploadError) {
              console.warn(`Failed to upload to ${newPath}:`, uploadError);
              continue;
            }
            
            // Get new public URL
            const { data: urlData } = supabase.storage
              .from('posts')
              .getPublicUrl(newPath);
            
            // Update database record
            const { error: updateError } = await supabase
              .from('posts')
              .update({ thumbnail_url: urlData.publicUrl })
              .eq('id', video.id);
              
            if (updateError) {
              console.warn(`Failed to update database for ${video.id}:`, updateError);
              continue;
            }
            
            // Delete old file
            const { error: deleteError } = await supabase.storage
              .from('posts')
              .remove([oldPath]);
              
            if (deleteError) {
              console.warn(`Failed to delete old file ${oldPath}:`, deleteError);
            }
            
            console.log(`Successfully fixed thumbnail for video ${video.id}`);
            fixedCount++;
          } else {
            // File doesn't exist at old location either, set thumbnail_url to null
            console.log(`Thumbnail file not found for video ${video.id}, setting to null`);
            
            const { error: updateError } = await supabase
              .from('posts')
              .update({ thumbnail_url: null })
              .eq('id', video.id);
              
            if (updateError) {
              console.warn(`Failed to update database for ${video.id}:`, updateError);
            } else {
              fixedCount++;
            }
          }
        } else {
          console.log(`Thumbnail OK for video ${video.id}`);
        }
      } catch (error) {
        console.warn(`Error processing video ${video.id}:`, error);
      }
    }
    
    console.log(`Thumbnail fix complete. Fixed ${fixedCount} videos.`);
    
  } catch (error) {
    console.error('Error in fixThumbnailPaths:', error);
  }
}

/**
 * Simpler approach: Just null out broken thumbnail URLs so the fallback system handles them
 */
export async function clearBrokenThumbnails() {
  console.log('Clearing broken thumbnail URLs...');
  
  try {
    const { data: videos, error } = await supabase
      .from('posts')
      .select('id, thumbnail_url')
      .eq('file_type', 'video')
      .not('thumbnail_url', 'is', null);
    
    if (error) {
      console.error('Error fetching videos:', error);
      return;
    }
    
    console.log(`Checking ${videos.length} video thumbnails`);
    
    let clearedCount = 0;
    
    for (const video of videos) {
      try {
        const response = await fetch(video.thumbnail_url, { method: 'HEAD' });
        
        if (response.status === 404) {
          console.log(`Clearing broken thumbnail for video ${video.id}`);
          
          const { error: updateError } = await supabase
            .from('posts')
            .update({ thumbnail_url: null })
            .eq('id', video.id);
            
          if (!updateError) {
            clearedCount++;
          }
        }
      } catch (error) {
        // Network error, assume broken and clear
        console.log(`Clearing potentially broken thumbnail for video ${video.id}`);
        
        const { error: updateError } = await supabase
          .from('posts')
          .update({ thumbnail_url: null })
          .eq('id', video.id);
          
        if (!updateError) {
          clearedCount++;
        }
      }
    }
    
    console.log(`Cleared ${clearedCount} broken thumbnail URLs`);
    
  } catch (error) {
    console.error('Error in clearBrokenThumbnails:', error);
  }
}