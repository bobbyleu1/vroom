import React, { useState, useRef, useEffect } from 'react';
import Video from 'react-native-video';
import VideoFit from './VideoFit';
// Temporarily disable Mux monitoring to fix video loading
// import muxReactNativeVideo from '@mux/mux-data-react-native-video';
import app from '../package.json';

// const MuxVideo = muxReactNativeVideo(Video);
const MuxVideo = Video; // Use plain Video component

export const VroomPlayer = React.forwardRef(({ playbackId, videoUrl, title, postId, userId, muxOptions, posterSource, resizeMode = "cover", onLoad, onBuffer, onProgress, onError, onVideoLoadStart, leftAlignContent, ...props }, ref) => {
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const videoRef = useRef(null);

  // If playbackId is provided, use Mux HLS stream, otherwise use direct video URL
  const sourceUri = playbackId 
    ? `https://stream.mux.com/${playbackId}.m3u8`
    : videoUrl;

  // Always provide Mux options for analytics, even for non-Mux videos
  const finalMuxOptions = muxOptions || {
    application_name: app.name,
    application_version: app.version,
    data: {
      env_key: muxOptions?.data?.env_key || '9qgfs7s0s62c0ctd8l58mdem4', // your Production Environment key
      player_name: 'react-native-video',
      video_id: postId ? String(postId) : 'unknown',
      video_title: title ?? 'Vroom post',
      viewer_user_id: userId ? String(userId) : 'anonymous',
    },
  };

  // Video event handlers for better performance monitoring
  const handleLoadStart = () => {
    console.log(`[VroomPlayer ${postId}] Video load started`);
    setIsBuffering(true);
    setHasError(false);
    setIsLoaded(false);
    onVideoLoadStart?.();
  };

  const handleLoad = (data) => {
    console.log(`[VroomPlayer ${postId}] Video loaded - duration: ${data.duration}s`);
    setIsLoaded(true);
    setIsBuffering(false);
    setHasError(false);
    onLoad?.(data);
  };

  const handleBuffer = ({ isBuffering: buffering }) => {
    console.log(`[VroomPlayer ${postId}] Buffering: ${buffering}`);
    setIsBuffering(buffering);
    onBuffer?.({ isBuffering: buffering });
  };

  const handleError = (error) => {
    console.error(`[VroomPlayer ${postId}] Video error:`, error);
    setHasError(true);
    setIsBuffering(false);
    setIsLoaded(false);
    
    // Provide more detailed error handling
    try {
      onError?.(error);
    } catch (callbackError) {
      console.error(`[VroomPlayer ${postId}] Error in onError callback:`, callbackError);
    }
  };

  const handleProgress = (data) => {
    // Only log progress occasionally to avoid spam
    if (Math.random() < 0.01) { // 1% of the time
      console.log(`[VroomPlayer ${postId}] Progress: ${data.currentTime}s`);
    }
    onProgress?.(data);
  };

  // Expose ref methods for parent components with error handling
  React.useImperativeHandle(ref, () => ({
    seek: (time) => {
      try {
        videoRef.current?.seek(time);
      } catch (error) {
        console.error(`[VroomPlayer ${postId}] Error seeking to ${time}:`, error);
      }
    },
    presentFullscreenPlayer: () => {
      try {
        videoRef.current?.presentFullscreenPlayer();
      } catch (error) {
        console.error(`[VroomPlayer ${postId}] Error presenting fullscreen:`, error);
      }
    },
    dismissFullscreenPlayer: () => {
      try {
        videoRef.current?.dismissFullscreenPlayer();
      } catch (error) {
        console.error(`[VroomPlayer ${postId}] Error dismissing fullscreen:`, error);
      }
    },
    save: (options) => {
      try {
        videoRef.current?.save(options);
      } catch (error) {
        console.error(`[VroomPlayer ${postId}] Error saving video:`, error);
      }
    },
  }));

  return (
    <VideoFit
      ref={videoRef}
      source={{ uri: sourceUri }}
      poster={posterSource || undefined} // Only set poster if we have a valid URL
      muted
      repeat
      leftAlignContent={leftAlignContent}
      // Optimized buffer settings for faster loading and less black screen time
      bufferConfig={{
        minBufferMs: 1500, // 1.5 seconds minimum buffer (even faster)
        maxBufferMs: 10000, // 10 seconds maximum buffer (further reduced)
        bufferForPlaybackMs: 500, // 0.5 second before playback starts (much faster)
        bufferForPlaybackAfterRebufferMs: 1000, // 1 second after rebuffer (faster)
      }}
      maxBitRate={800000} // 800 Kbps max bitrate for even faster loading
      playInBackground={false}
      playWhenInactive={false}
      ignoreSilentSwitch="ignore"
      
      // Video event handlers
      onLoadStart={handleLoadStart}
      onLoad={handleLoad}
      onBuffer={handleBuffer}
      onError={handleError}
      onProgress={handleProgress}
      
      // Preload for better performance
      preload="auto"
      
      // muxOptions={finalMuxOptions} // Disabled with plain Video
      {...props}
    />
  );
});