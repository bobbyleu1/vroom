import { Platform } from 'react-native';
import { MAX_VIDEO_DURATION_S } from '../config/media';

export type VideoMeta = {
  durationSec: number;
  uri: string;
  sizeBytes?: number;
};

type PickerAsset = {
  uri: string;
  duration?: number; // seconds (iOS gives this)
  fileSize?: number; // bytes (Android often gives this)
};

// Extract duration from ImagePicker or fall back to a probe using <Video>.getStatusAsync
export async function getPickedVideoMeta(asset: PickerAsset): Promise<VideoMeta> {
  const durationFromPicker = Number(asset.duration ?? 0);
  if (Number.isFinite(durationFromPicker) && durationFromPicker > 0) {
    return { durationSec: Math.round(durationFromPicker), uri: asset.uri, sizeBytes: asset.fileSize };
  }

  // Fallback probe via expo-av Video (no extra native deps)
  const { Video } = await import('expo-av');
  const video = new Video();
  try {
    await video.loadAsync({ uri: asset.uri }, { shouldPlay: false }, false);
    const status = await video.getStatusAsync();
    const durationMs = (status as any)?.durationMillis ?? 0;
    return { durationSec: Math.round(durationMs / 1000), uri: asset.uri, sizeBytes: asset.fileSize };
  } finally {
    try { await video.unloadAsync(); } catch {}
  }
}

// returns a URI that is ≤ 60s. If longer and FFmpeg is available, trim; else block with message.
export async function ensureMax60s(uri: string, durationSec?: number): Promise<{ uri: string; trimmed: boolean }> {
  const d = durationSec ?? 0;
  if (d && d <= MAX_VIDEO_DURATION_S) return { uri, trimmed: false };

  // If no duration provided, attempt to probe
  const meta = d ? { durationSec: d, uri } : await getPickedVideoMeta({ uri });
  if (meta.durationSec <= MAX_VIDEO_DURATION_S) return { uri, trimmed: false };

  // Try to trim with ffmpeg-kit-react-native if present; otherwise show an error
  try {
    const { FFmpegKit, FFprobeKit } = require('ffmpeg-kit-react-native'); // optional dependency
    const out = uri.replace(/\.(mp4|mov|m4v)$/i, '_trim60.mp4');
    const cmd = `-y -i "${uri}" -t ${MAX_VIDEO_DURATION_S} -c copy "${out}"`;
    const sess = await FFmpegKit.execute(cmd);
    const rc = await sess.getReturnCode();
    if (!rc.isValueSuccess()) throw new Error('TRIM_FAILED');
    return { uri: out, trimmed: true };
  } catch {
    throw new Error(`Video is longer than ${MAX_VIDEO_DURATION_S}s. Please select/record a ≤ 60s clip.`);
  }
}