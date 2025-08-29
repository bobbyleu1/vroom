import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Video, Audio, ResizeMode } from 'expo-av';
import { FEED_DIAG_MODE } from '../feed/diag';

export default function VideoDebug({ post, active }: {
  post: any;               // the item object passed to renderItem
  active: boolean;         // true when this cell is the focused one
}) {
  const ref = useRef<Video>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // build source URL defensively
  const muxId = post?.playback_id || post?.playbackId;
  const src =
    post?.video_url ||
    post?.asset_url ||
    (muxId ? `https://stream.mux.com/${muxId}.m3u8` : null);

  useEffect(() => {
    // autoplay reliably: play muted and allow silent mode on iOS
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    if (active && src) {
      ref.current.setIsMutedAsync(true).catch(()=>{});
      ref.current.playAsync().catch(()=>{});
    } else {
      ref.current.pauseAsync().catch(()=>{});
    }
  }, [active, src]);

  if (!src) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'black', justifyContent: 'flex-end' }]}>
        {FEED_DIAG_MODE && (
          <Text style={styles.diag}>No video src. Fields: playback_id={String(muxId)} video_url={String(post?.video_url)} asset_url={String(post?.asset_url)}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Video
        ref={ref}
        style={StyleSheet.absoluteFill}
        source={{ uri: src }}
        shouldPlay={active}
        isLooping
        isMuted
        resizeMode={ResizeMode.COVER}
        onError={(e) => {
          const m = (e as any)?.error?.message ?? JSON.stringify(e);
          setErr(String(m));
          console.warn('[VIDEO] error', m, 'src=', src);
        }}
        onLoad={() => setLoaded(true)}
      />
      {FEED_DIAG_MODE && (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.diag} numberOfLines={3}>
            {loaded ? 'LOADED' : 'LOADING'}  src={src}
            {'\n'}id={post?.id}  created_at={post?.created_at}
          </Text>
          {err && <Text style={[styles.diag, { color: '#ff6b6b' }]}>ERR: {err}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 8, right: 8, bottom: 48 },
  diag: { color: 'white', fontSize: 12, opacity: 0.9 },
});