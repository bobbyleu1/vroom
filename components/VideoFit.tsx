// components/VideoFit.tsx
import React, { useState, useMemo, forwardRef } from 'react';
import { View, Image, StyleSheet, Platform, Dimensions } from 'react-native';
import Video, { OnLoadData } from 'react-native-video';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type Props = {
  source: { uri: string };
  isImage?: boolean;
  leftAlignContent?: boolean;   // if true, hug the left instead of center
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  testID?: string;
  style?: any;
  onLoad?: (data: OnLoadData) => void;
  onBuffer?: (data: any) => void;
  onProgress?: (data: any) => void;
  onError?: (error: any) => void;
  onLoadStart?: () => void;
  poster?: string;
  bufferConfig?: any;
  maxBitRate?: number;
  playInBackground?: boolean;
  playWhenInactive?: boolean;
  ignoreSilentSwitch?: string;
  preload?: string;
  [key: string]: any; // Allow any additional props
};

const VideoFit = forwardRef<any, Props>(({
  source,
  isImage,
  leftAlignContent,
  paused = false,
  muted = false,
  repeat = true,
  testID,
  style,
  onLoad,
  onBuffer,
  onProgress,
  onError,
  onLoadStart,
  poster,
  ...videoProps
}, ref) => {
  const [ratio, setRatio] = useState<number | undefined>(undefined);

  const containerAlign = useMemo(
    () => [styles.container, leftAlignContent ? styles.left : styles.center],
    [leftAlignContent]
  );

  const mediaStyle = useMemo(() => {
    // Use aspectRatio if known; fallback to 16:9 to avoid tall overflow  
    const videoRatio = ratio || (16 / 9);
    
    // Let the container (PhoneViewport) handle sizing, video fills container
    return [
      styles.mediaBase,
      {
        width: '100%',
        height: '100%',
      }
    ];
  }, [ratio]);

  const onVideoLoad = (d: OnLoadData) => {
    // react-native-video gives naturalSize (width/height/orientation)
    const w = d?.naturalSize?.width || d?.videoTracks?.[0]?.naturalSize?.width;
    const h = d?.naturalSize?.height || d?.videoTracks?.[0]?.naturalSize?.height;
    if (w && h) {
      const videoRatio = w / h;
      console.log(`[VideoFit] Video dimensions: ${w}x${h}, ratio: ${videoRatio}`);
      setRatio(videoRatio);
    }
    
    // Call the original onLoad handler
    onLoad?.(d);
  };

  return (
    <View style={containerAlign} testID={testID || 'VideoFit'}>
      {isImage ? (
        <Image source={source} style={mediaStyle as any} resizeMode="contain" />
      ) : (
        <Video
          ref={ref}
          source={source}
          style={mediaStyle as any}
          resizeMode="cover"   // ← iPhone full-bleed look
          onLoad={onVideoLoad}   // ← sets true aspect to avoid zooming
          onLoadStart={onLoadStart}
          onBuffer={onBuffer}
          onProgress={onProgress}
          onError={onError}
          paused={paused}
          muted={muted}
          repeat={repeat}
          poster={poster}
          {...videoProps}
        />
      )}
    </View>
  );
});

export default VideoFit;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'visible',    // ← allow letterbox space; don't clip
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  left:   { alignItems: 'flex-start', justifyContent: 'center' },
  mediaBase: {
    // Let aspect ratio determine dimensions, constrain to container
    maxWidth: '100%',
    maxHeight: '100%',
  },
});