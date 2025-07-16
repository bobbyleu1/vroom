// screens/UploadScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons, Entypo, Feather } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Video } from 'expo-av'; // REVERTED: Import from expo-av

const { width, height } = Dimensions.get('window');

/**
 * UploadScreen component for selecting media, adding captions, and posting to Supabase.
 * It handles media library permissions, image/video picking, preview display,
 * media upload to Supabase Storage, and post record creation in the 'posts' table.
 */
export default function UploadScreen({ navigation }) {
  // State variables for permissions, selected media, loading, and post details
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [selectedMediaUri, setSelectedMediaUri] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [postDescription, setPostDescription] = useState(''); // This serves as the main caption

  // Ref for the Video component to potentially capture frames (snapshotAsync from expo-av)
  const videoRef = useRef(null);
  // State to track if the video player is loaded and ready for snapshotting (for expo-av)
  const [isVideoPlayerReady, setIsVideoPlayerReady] = useState(false);

  /**
   * Effect hook to request media library permissions on component mount.
   */
  useEffect(() => {
    (async () => {
      console.log("UploadScreen mounted. Initial Media Library Permission status:", mediaLibraryPermission?.status);
      if (!mediaLibraryPermission?.granted) {
        console.log("Media Library Permission not granted on mount. Requesting...");
        const { status } = await requestMediaLibraryPermission();
        console.log("Permission status after initial request on mount:", status);
      }
    })();
  }, [mediaLibraryPermission]); // Dependency array includes mediaLibraryPermission to re-run if status changes

  /**
   * Handles picking media (image or video) from the device's library.
   * Requests permissions if not already granted.
   */
  const pickMedia = async () => {
    console.log("pickMedia function called.");

    // Re-check permission right before attempting to pick media
    if (!mediaLibraryPermission?.granted) {
      console.log("Permission not granted when 'pickMedia' was called. Requesting again...");
      const { status } = await requestMediaLibraryPermission();
      console.log("Permission status after request in pickMedia:", status);

      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant Vroom access to your photos and videos to select media. You might need to go to your device Settings > Apps > Vroom > Permissions and enable Storage/Photos access.');
        console.log("Permission denied, returning from pickMedia.");
        return;
      }
    } else {
      console.log("Media Library Permission is already granted.");
    }

    console.log("Attempting to launch ImagePicker library...");
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // Using MediaTypeOptions.All as per your working code
      allowsEditing: false,
      quality: 0.7,
    });
    console.log("ImagePicker result:", result);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      let type = result.assets[0].mediaType; // Get the type from ImagePicker result

      // Fallback: If mediaType is undefined, infer from file extension (as seen in previous logs)
      if (!type) {
        const fileExtension = uri.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension)) {
          type = 'image';
        } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension)) {
          type = 'video';
        } else {
          console.warn(`Could not determine media type for URI: ${uri}. Defaulting to image.`);
          type = 'image';
        }
      }

      setSelectedMediaUri(uri);
      setSelectedMediaType(type);
      setIsVideoPlayerReady(false); // Reset video ready state when new media is selected
      console.log("Media selected and states set:", { uri, type });
    } else if (result.canceled) {
      console.log("ImagePicker was canceled by user.");
    } else {
      console.warn("ImagePicker did not return any assets despite not being canceled.");
      Alert.alert("Selection Issue", "No media was selected or found in the gallery result.");
    }
  };

  /**
   * Generates a thumbnail from a video URI using expo-av's snapshotAsync.
   * Uploads the thumbnail to Supabase 'thumbnails' bucket.
   * @param {string} videoUri - The URI of the video file.
   * @returns {Promise<string|null>} Public URL of the uploaded thumbnail or null if failed.
   */
  const generateAndUploadVideoThumbnail = async (videoUri) => {
    console.log("Attempting to generate and upload video thumbnail for:", videoUri);

    // Add a small delay to ensure videoRef.current is ready for snapshotAsync
    // This is a common workaround for expo-av timing issues.
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds

    if (!videoRef.current || typeof videoRef.current.snapshotAsync !== 'function') {
      console.error("Video ref is null or snapshotAsync is not a function. Cannot generate thumbnail.");
      Alert.alert("Thumbnail Error", "Video player not ready for thumbnail generation or snapshot function is missing. Proceeding without thumbnail.");
      return null; // Return null if thumbnail generation fails
    }

    try {
      // Ensure the video is loaded before attempting snapshot
      const playbackStatus = await videoRef.current.getStatusAsync();
      if (!playbackStatus.isLoaded) {
        console.error("Video is not loaded, cannot generate thumbnail.");
        Alert.alert("Thumbnail Error", "Video not fully loaded. Please wait a moment and try again.");
        return null;
      }

      const { uri: thumbnailUri } = await videoRef.current.snapshotAsync({
        format: 'jpeg',
        quality: 0.5,
      });

      console.log("Generated thumbnail URI:", thumbnailUri);

      const response = await fetch(thumbnailUri);
      const blob = await response.blob();
      const fileName = `thumbnails/${uuidv4()}.jpeg`; // Unique name for thumbnail

      const { data, error } = await supabase.storage.from('thumbnails').upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage.from('thumbnails').getPublicUrl(fileName);
      console.log("Thumbnail uploaded to:", publicUrlData.publicUrl);
      return publicUrlData.publicUrl;

    } catch (error) {
      console.error('Error generating or uploading thumbnail:', error.message);
      Alert.alert('Thumbnail Error', 'Failed to generate or upload video thumbnail: ' + error.message);
      return null;
    }
  };

  /**
   * Uploads the main media file (image or video) to Supabase 'posts' bucket.
   * @param {string} uri - The local URI of the media file.
   * @param {string} fileType - 'image' or 'video'.
   * @returns {Promise<string|null>} Public URL of the uploaded media or null if failed.
   */
  const uploadMediaToSupabase = async (uri, fileType) => {
    if (!uri) return null;

    setLoading(true); // Set loading state for the duration of upload
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExtension = uri.split('.').pop().toLowerCase();
      const fileName = `posts/${uuidv4()}.${fileExtension}`; // Unique file name in 'posts' bucket

      const { data, error } = await supabase.storage.from('posts').upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: fileType === 'image' ? `image/${fileExtension}` : `video/${fileExtension}`,
      });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(fileName);
      return publicUrlData.publicUrl;

    } catch (error) {
      console.error('Error uploading media:', error.message);
      Alert.alert('Upload Error', 'Failed to upload media: ' + error.message);
      return null;
    } finally {
      // setLoading(false); // Loading state is managed by handlePost's finally block
    }
  };

  /**
   * Handles the entire post creation process:
   * 1. Uploads main media.
   * 2. Generates and uploads video thumbnail (if applicable).
   * 3. Creates a record in the Supabase 'posts' table.
   * 4. Navigates to the FeedScreen on success.
   */
  const handlePost = async () => {
    if (!selectedMediaUri) {
      Alert.alert('No Media', 'Please select an image or video to post.');
      return;
    }

    setLoading(true);
    let publicUrl = null;
    let thumbnailPublicUrl = null; // Initialize thumbnail URL

    // Step 1: Upload the main media file
    publicUrl = await uploadMediaToSupabase(selectedMediaUri, selectedMediaType);

    if (!publicUrl) {
      setLoading(false);
      return;
    }

    // Step 2: If it's a video, attempt to generate and upload its thumbnail (may still be problematic with expo-av)
    if (selectedMediaType === 'video') {
      thumbnailPublicUrl = await generateAndUploadVideoThumbnail(selectedMediaUri);
      // If thumbnail generation/upload fails, the post will still proceed without a thumbnail
      if (!thumbnailPublicUrl) {
        console.warn("Video thumbnail generation failed. Post will proceed without a thumbnail.");
      }
    }

    // Step 3: Create post record in Supabase 'posts' table
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Error', 'You must be logged in to create a post.');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('posts') // Corrected table name to 'posts'
        .insert([
          {
            author_id: user.id,
            file_type: selectedMediaType, // Corrected column name to 'file_type'
            media_url: publicUrl,
            thumbnail_url: thumbnailPublicUrl, // Include thumbnail URL (will be null for images or if thumbnail generation fails)
            content: postDescription, // Corrected column name to 'content'
          },
        ]);

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Post uploaded successfully!');
      setSelectedMediaUri(null);
      setSelectedMediaType(null);
      setPostDescription('');

      if (navigation) {
        navigation.navigate('Feed'); // Navigate to FeedScreen after successful post
      }
    } catch (error) {
      console.error('Error creating post in DB:', error.message);
      Alert.alert('Post Error', 'Failed to create post in database: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Render permission request UI if permissions are not granted
  if (!mediaLibraryPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.text}>Requesting media library permission...</Text>
      </View>
    );
  }
  if (!mediaLibraryPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>We need media library permission to pick photos/videos.</Text>
        <TouchableOpacity onPress={requestMediaLibraryPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main render logic for the UploadScreen
  return (
    <View style={styles.container}>
      {/* Header for the Post Creation Screen (visible when media is selected) */}
      {selectedMediaUri && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelectedMediaUri(null); setSelectedMediaType(null); setPostDescription(''); }}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Post</Text>
          <View style={{ width: 28 }} /> {/* Spacer to balance title */}
        </View>
      )}

      {/* Conditional rendering based on whether media is selected */}
      {selectedMediaUri ? (
        // Post Creation Screen: Displays media preview and input fields
        <ScrollView style={styles.postCreationContainer} contentContainerStyle={styles.postCreationContent}>
          {/* Media Preview Section */}
          <View style={styles.mediaPreviewSection}>
            {console.log("Attempting to render Media Preview. URI:", selectedMediaUri, "Type:", selectedMediaType)}
            {selectedMediaUri ? (
              selectedMediaType === 'image' ? (
                <Image source={{ uri: selectedMediaUri }} style={styles.selectedMedia} />
              ) : (
                <Video
                  ref={videoRef} // Assign ref to Video component for snapshotting
                  source={{ uri: selectedMediaUri }}
                  style={styles.selectedMedia}
                  useNativeControls // Controls for video playback
                  isLooping // Loop video playback
                  onLoadStart={() => console.log("Video Load Start (expo-av)")}
                  onLoad={() => {
                    console.log("Video Loaded (expo-av)");
                    setIsVideoPlayerReady(true); // Set ready state on load
                  }}
                  onError={(error) => console.error("Video Playback Error (expo-av):", error)}
                />
              )
            ) : (
              <Text style={{color: '#fff', fontSize: 16}}>No media selected for preview.</Text>
            )}
          </View>

          {/* Caption Input Section */}
          <View style={styles.inputSection}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Add your caption here..."
              placeholderTextColor="#999"
              multiline
              value={postDescription}
              onChangeText={setPostDescription}
              maxLength={2000}
            />
            <View style={styles.descriptionIcons}>
              <Feather name="hash" size={20} color="#999" style={styles.descriptionIcon} />
              <Feather name="at-sign" size={20} color="#999" style={styles.descriptionIcon} />
              <MaterialIcons name="lightbulb-outline" size={20} color="#999" style={styles.descriptionIcon} />
              <MaterialIcons name="fullscreen" size={20} color="#999" />
            </View>
          </View>

          {/* Post Options Section */}
          <View style={styles.optionsSection}>
            <TouchableOpacity style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <Ionicons name="location-outline" size={22} color="#fff" />
                <Text style={styles.optionText}>Location</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.locationTags}>
              <Text style={styles.locationTag}>Super Silly Fun Land</Text>
              <Text style={styles.locationTag}>Da Clurb</Text>
              <Text style={styles.locationTag}>Nut Island</Text>
              <Text style={styles.locationTag}>Heaven On</Text>
            </View>

            <TouchableOpacity style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <Feather name="link" size={22} color="#fff" />
                <Text style={styles.optionText}>Add link</Text>
                <View style={styles.redDot} />
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <Ionicons name="eye-outline" size={22} color="#fff" />
                <Text style={styles.optionText}>Everyone can view this post</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <Entypo name="dots-three-horizontal" size={22} color="#fff" />
                <Text style={styles.optionText}>More options</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Share To section */}
            <View style={styles.shareToSection}>
              <Text style={styles.shareToText}>Share to</Text>
              <View style={styles.shareIcons}>
                <Ionicons name="share-outline" size={30} color="#555" />
                <Ionicons name="logo-snapchat" size={30} color="#555" />
                <Ionicons name="logo-facebook" size={30} color="#555" />
                <Ionicons name="logo-whatsapp" size={30} color="#555" />
              </View>
            </View>
          </View>

        </ScrollView>
      ) : (
        // Initial Media Picker Screen: Placeholder for camera and gallery upload button
        <View style={styles.cameraPlaceholderContainer}>
          <Text style={styles.comingSoonText}>Camera function coming soon!</Text>
          <Text style={styles.thirdPartyText}>
            For editing and sounds, use #rd party editing service like CapCut.
          </Text>
          <TouchableOpacity style={styles.uploadGalleryButton} onPress={pickMedia}>
            <Ionicons name="images" size={24} color="#000" />
            <Text style={styles.uploadGalleryButtonText}>Upload from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Fixed bottom buttons (Drafts and Post) */}
      {selectedMediaUri && (
        <View style={styles.bottomButtonsContainer}>
          <TouchableOpacity
            style={styles.draftsButton}
            onPress={() => Alert.alert('Save Draft', 'This feature is coming soon!')}
          >
            <Ionicons name="folder-outline" size={20} color="#fff" />
            <Text style={styles.draftsButtonText}>Drafts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePost}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" style={{ marginRight: 5 }} />
                <Text style={styles.postButtonText}>Post</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionButton: {
    backgroundColor: '#00BFFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },

  cameraPlaceholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
  },
  comingSoonText: {
    color: '#00BFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  thirdPartyText: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  uploadGalleryButton: {
    backgroundColor: '#00BFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    gap: 10,
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  uploadGalleryButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'android' ? 10 : 50,
    paddingBottom: 10,
    backgroundColor: '#000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  postCreationContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  postCreationContent: {
    paddingBottom: 100,
  },
  mediaPreviewSection: {
    width: '100%',
    height: width * 0.7,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    overflow: 'hidden',
  },
  selectedMedia: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  inputSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginHorizontal: 15,
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  descriptionInput: {
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  descriptionIcons: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  descriptionIcon: {
    marginRight: 15,
  },
  optionsSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginHorizontal: 15,
    marginBottom: 15,
    paddingVertical: 5,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4500',
    marginLeft: 8,
  },
  locationTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  locationTag: {
    backgroundColor: '#333',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  shareToSection: {
    padding: 15,
  },
  shareToText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  shareIcons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 20,
  },

  bottomButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 10,
  },
  draftsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 25,
    marginRight: 10,
    gap: 5,
  },
  draftsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  postButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BFFF',
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 10,
    gap: 5,
  },
  postButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
