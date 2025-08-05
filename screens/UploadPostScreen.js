import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Video } from 'expo-av';
import { useNavigation, useRoute } from '@react-navigation/native';
// The Supabase client is expected to be initialised in your project at
// vroom_native_ads/utils/supabase.js. This import assumes that file exists
// and exports a configured `supabase` instance.
import { supabase } from '../utils/supabase';
// Optional: use expo-video-thumbnails to generate a thumbnail for the video
// If you decide not to generate thumbnails, you can remove this import
import * as VideoThumbnails from 'expo-video-thumbnails';

/**
 * A screen that allows users to preview a selected video, add a caption,
 * and post it to Supabase.  The design is inspired by the minimal TikTok
 * upload flow and aims to provide a distraction‑free posting experience.
 *
 * This screen expects a `videoUri` parameter to be passed via the
 * navigation route.  When the user taps "Post", the video is uploaded to
 * Supabase Storage under the `posts` bucket using a path that includes
 * their user ID and a timestamp.  A database record is then inserted
 * into the `posts` table with the public URLs and caption.  On success
 * the user is navigated back to the feed.
 */
const UploadPostScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { videoUri } = route.params || {};
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  /**
   * Upload a file to Supabase storage.  The file path is prefixed with the
   * authenticated user's ID and a timestamp to ensure uniqueness and
   * organisation (e.g. "userId/1623456789012.mp4").
   *
   * @param {string} uri - The local URI of the video or thumbnail.
   * @param {string} userId - The ID of the currently authenticated user.
   * @returns {Promise<string>} - A promise that resolves to the public URL of the uploaded file.
   */
  const uploadFileToSupabase = async (uri, userId) => {
    const fileExt = uri.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    // Fetch the file from the local URI and convert it into a Blob
    const response = await fetch(uri);
    const fileBlob = await response.blob();
    // Upload the file to the posts bucket
    const { error: uploadError } = await supabase.storage
      .from('posts')
      .upload(filePath, fileBlob, {
        contentType: fileBlob.type,
        upsert: true,
      });
    if (uploadError) {
      throw uploadError;
    }
    // Retrieve the public URL of the uploaded file
    const { data } = supabase.storage.from('posts').getPublicUrl(filePath);
    return data.publicUrl;
  };

  /**
   * Generate a thumbnail from the first second of a video and upload it
   * to Supabase.  If thumbnail generation fails, this function falls
   * back to returning undefined so that the caller can handle it.
   *
   * @param {string} uri - Local URI of the video.
   * @param {string} userId - The ID of the currently authenticated user.
   * @returns {Promise<string|undefined>} - Public URL of the uploaded thumbnail or undefined.
   */
  const generateAndUploadThumbnail = async (uri, userId) => {
    try {
      const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 1000,
      });
      return await uploadFileToSupabase(thumbnailUri, userId);
    } catch (err) {
      // If thumbnail generation fails, log the error and continue without a thumbnail
      console.warn('Thumbnail generation failed:', err);
      return undefined;
    }
  };

  /**
   * Handle posting the video and caption.  This function performs the
   * following steps:
   *  1. Retrieves the currently authenticated user to get their ID.
   *  2. Uploads the video to Supabase Storage.
   *  3. Generates and uploads a video thumbnail.
   *  4. Inserts a record into the posts table with media and thumbnail URLs,
   *     caption, file type and timestamp.
   *  5. Navigates back to the feed.
   */
  const handlePost = async () => {
    if (!videoUri) {
      alert('No video selected');
      return;
    }
    try {
      setIsUploading(true);
      // Get the authenticated user
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        throw new Error('You must be logged in to post.');
      }
      const userId = authData.user.id;
      // Upload the main video
      const mediaUrl = await uploadFileToSupabase(videoUri, userId);
      // Generate and upload a thumbnail for the video
      const thumbnailUrl = await generateAndUploadThumbnail(videoUri, userId);
      // Insert the post record into the database
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: userId,
        file_type: 'video',
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        content: caption.trim(),
        created_at: new Date().toISOString(),
      });
      if (insertError) {
        throw insertError;
      }
      setIsUploading(false);
      // Navigate back to the feed screen
      navigation.navigate('Feed');
    } catch (err) {
      console.error(err);
      setIsUploading(false);
      alert(err.message || 'An error occurred while uploading your post.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Back button in the top left corner */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      {/* Video preview area */}
      {videoUri && (
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={styles.video}
            resizeMode="cover"
            shouldPlay
            isLooping
            isMuted={isMuted}
            useNativeControls={false}
          />
          <TouchableOpacity style={styles.muteButton} onPress={() => setIsMuted((prev) => !prev)}>
            <Text style={styles.muteText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Caption input */}
      <TextInput
        style={styles.captionInput}
        placeholder="Say something about your ride…"
        placeholderTextColor="#888"
        multiline
        value={caption}
        onChangeText={setCaption}
      />

      {/* Post button or loading indicator */}
      <TouchableOpacity
        style={[styles.postButton, isUploading && styles.postButtonDisabled]}
        onPress={handlePost}
        disabled={isUploading}
      >
        {isUploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.postButtonText}>Post</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  muteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  muteText: {
    color: '#fff',
    fontSize: 14,
  },
  captionInput: {
    minHeight: 80,
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 16,
  },
  postButton: {
    backgroundColor: '#ff0050', // Vibrant red for call‑to‑action
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginBottom: 24,
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UploadPostScreen;