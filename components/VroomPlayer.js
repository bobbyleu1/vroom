import React, { useState, useRef, useEffect } from 'react';
import Video from 'react-native-video';
// Temporarily disable Mux monitoring to fix video loading
// import muxReactNativeVideo from '@mux/mux-data-react-native-video';
import app from '../package.json';

// const MuxVideo = muxReactNativeVideo(Video);
const MuxVideo = Video; // Use plain Video component

export const VroomPlayer = React.forwardRef(({ playbackId, videoUrl, title, postId, userId, muxOptions, posterSource, resizeMode = "cover", onLoad, onBuffer, onProgress, onError, onVideoLoadStart, ...props }, ref) => {
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
    onVideoLoadStart?.();
  };

  const handleLoad = (data) => {
    console.log(`[VroomPlayer ${postId}] Video loaded - duration: ${data.duration}s`);
    setIsLoaded(true);
    setIsBuffering(false);
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
    onError?.(error);
  };

  const handleProgress = (data) => {
    // Only log progress occasionally to avoid spam
    if (Math.random() < 0.01) { // 1% of the time
      console.log(`[VroomPlayer ${postId}] Progress: ${data.currentTime}s`);
    }
    onProgress?.(data);
  };

  // Expose ref methods for parent components
  React.useImperativeHandle(ref, () => ({
    seek: (time) => videoRef.current?.seek(time),
    presentFullscreenPlayer: () => videoRef.current?.presentFullscreenPlayer(),
    dismissFullscreenPlayer: () => videoRef.current?.dismissFullscreenPlayer(),
    save: (options) => videoRef.current?.save(options),
  }));

  return (
    <MuxVideo
      ref={videoRef}
      source={{ uri: sourceUri }}
      poster={posterSource || undefined} // Only set poster if we have a valid URL
      muted
      repeat
      resizeMode={resizeMode}
      // Optimized buffer settings for instant playback on mobile
      bufferConfig={{
        minBufferMs: 2500, // 2.5 seconds minimum buffer (much faster)
        maxBufferMs: 15000, // 15 seconds maximum buffer (reduced)
        bufferForPlaybackMs: 1000, // 1 second before playback starts (faster)
        bufferForPlaybackAfterRebufferMs: 2000, // 2 seconds after rebuffer (faster)
      }}
      maxBitRate={1000000} // 1 Mbps max bitrate for faster loading on mobile
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