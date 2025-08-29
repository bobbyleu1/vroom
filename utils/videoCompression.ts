import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  size: number; // in bytes
  uri: string;
}

interface CompressionOptions {
  maxDurationSeconds?: number;
  maxSizeMB?: number;
  maxWidth?: number;
  quality?: number; // 0.1 to 1.0
}

const MAX_FEED_DURATION_SECONDS = 180; // 3 minutes
const MAX_UPLOAD_MB = 500;
const DEFAULT_MAX_WIDTH = 1080;

export class VideoCompressionService {
  
  /**
   * Extract metadata from video file
   */
  static async getVideoMetadata(uri: string): Promise<VideoMetadata> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        throw new Error('Video file does not exist');
      }

      // Use expo-av to get video dimensions and duration
      const { status } = await Video.createAsync(
        { uri },
        { shouldPlay: false },
        null,
        false
      );

      return {
        duration: (status.durationMillis || 0) / 1000,
        width: status.naturalSize?.width || 0,
        height: status.naturalSize?.height || 0,
        size: fileInfo.size || 0,
        uri
      };
    } catch (error) {
      console.error('Error getting video metadata:', error);
      throw error;
    }
  }

  /**
   * Client-side video processing before upload
   * Never reject uploads - always return a processable video
   */
  static async processVideoForUpload(
    uri: string, 
    options: CompressionOptions = {}
  ): Promise<{ uri: string; metadata: VideoMetadata; wasProcessed: boolean }> {
    
    const {
      maxDurationSeconds = MAX_FEED_DURATION_SECONDS,
      maxSizeMB = MAX_UPLOAD_MB,
      maxWidth = DEFAULT_MAX_WIDTH,
      quality = 0.8
    } = options;

    try {
      console.log('VideoCompression: Processing video:', uri);
      
      // Get original metadata
      const originalMetadata = await this.getVideoMetadata(uri);
      console.log('VideoCompression: Original metadata:', originalMetadata);

      let processedUri = uri;
      let wasProcessed = false;
      
      // Determine if processing is needed
      const needsTrimming = originalMetadata.duration > maxDurationSeconds;
      const needsCompression = originalMetadata.size > (maxSizeMB * 1024 * 1024);
      const needsResize = originalMetadata.width > maxWidth;

      if (!needsTrimming && !needsCompression && !needsResize) {
        console.log('VideoCompression: No processing needed');
        return { 
          uri: processedUri, 
          metadata: originalMetadata, 
          wasProcessed: false 
        };
      }

      console.log('VideoCompression: Processing needed:', {
        needsTrimming,
        needsCompression,
        needsResize
      });

      // Step 1: Trim duration if needed
      if (needsTrimming) {
        console.log(`VideoCompression: Trimming to ${maxDurationSeconds}s`);
        processedUri = await this.trimVideo(processedUri, maxDurationSeconds);
        wasProcessed = true;
      }

      // Step 2: Compress/resize if needed
      if (needsCompression || needsResize) {
        console.log('VideoCompression: Compressing/resizing');
        processedUri = await this.compressVideo(processedUri, {
          maxWidth,
          quality: needsCompression ? Math.max(0.3, quality * 0.7) : quality
        });
        wasProcessed = true;
      }

      // Get final metadata
      const finalMetadata = await this.getVideoMetadata(processedUri);
      console.log('VideoCompression: Final metadata:', finalMetadata);

      return {
        uri: processedUri,
        metadata: finalMetadata,
        wasProcessed
      };

    } catch (error) {
      console.error('VideoCompression: Error processing video:', error);
      
      // Never fail - return original video if processing fails
      console.log('VideoCompression: Returning original video due to processing error');
      const fallbackMetadata = await this.getVideoMetadata(uri).catch(() => ({
        duration: 0,
        width: 0,
        height: 0,
        size: 0,
        uri
      }));

      return {
        uri,
        metadata: fallbackMetadata,
        wasProcessed: false
      };
    }
  }

  /**
   * Trim video to specified duration
   */
  private static async trimVideo(uri: string, maxDurationSeconds: number): Promise<string> {
    try {
      // For React Native, we'll use expo-av's seeking capabilities
      // In a production app, you might use react-native-ffmpeg or similar
      
      const outputUri = `${FileSystem.documentDirectory}trimmed_${Date.now()}.mp4`;
      
      // This is a simplified implementation
      // In production, you'd use a proper video editing library
      console.log(`VideoCompression: Trimming ${uri} to ${maxDurationSeconds}s -> ${outputUri}`);
      
      // For now, we'll just copy the file and rely on server-side clipping
      // The server webhook will handle the actual trimming via Mux
      await FileSystem.copyAsync({
        from: uri,
        to: outputUri
      });
      
      return outputUri;
      
    } catch (error) {
      console.error('VideoCompression: Trim failed:', error);
      return uri; // Return original on failure
    }
  }

  /**
   * Compress video for size/quality
   */
  private static async compressVideo(uri: string, options: { maxWidth: number; quality: number }): Promise<string> {
    try {
      // Use ImagePicker's video compression if available
      // This is a simplified version - in production you'd use react-native-compressor
      
      const outputUri = `${FileSystem.documentDirectory}compressed_${Date.now()}.mp4`;
      
      console.log(`VideoCompression: Compressing ${uri} -> ${outputUri}`);
      
      // Simplified compression - just copy for now
      // In production, use react-native-compressor or similar:
      /*
      const result = await Video.compressAsync(uri, {
        quality: options.quality,
        width: options.maxWidth,
        outputFormat: Video.VideoFormat.MP4
      });
      return result.uri;
      */
      
      await FileSystem.copyAsync({
        from: uri,
        to: outputUri
      });
      
      return outputUri;
      
    } catch (error) {
      console.error('VideoCompression: Compression failed:', error);
      return uri; // Return original on failure
    }
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTempFiles(uris: string[]) {
    for (const uri of uris) {
      try {
        if (uri.includes(FileSystem.documentDirectory || '')) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch (error) {
        console.warn('VideoCompression: Failed to cleanup temp file:', uri, error);
      }
    }
  }

  /**
   * Generate thumbnail for video
   */
  static async generateThumbnail(uri: string, timeSeconds: number = 1): Promise<string> {
    try {
      const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: timeSeconds * 1000,
        quality: 0.8
      });
      
      return thumbnailUri;
    } catch (error) {
      console.error('VideoCompression: Thumbnail generation failed:', error);
      throw error;
    }
  }
}

// Convenience exports
export const processVideoForUpload = VideoCompressionService.processVideoForUpload;
export const getVideoMetadata = VideoCompressionService.getVideoMetadata;
export const generateThumbnail = VideoCompressionService.generateThumbnail;
export const cleanupTempFiles = VideoCompressionService.cleanupTempFiles;