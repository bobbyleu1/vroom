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
import { uploadMedia } from '../utils/mediaUpload.js';

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
      // Use shared upload utility to upload the video and get URLs
      const { mediaUrl, thumbnailUrl } = await uploadMedia(videoUri, userId, 'video');
      if (!mediaUrl) {
        throw new Error('Failed to upload media.');
      }
      // Insert the post record into the database
      const { error: insertError } = await supabase
        .from('posts')
        .insert({
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