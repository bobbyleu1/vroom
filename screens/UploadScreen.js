// screens/UploadScreen.js
import React, { useState, useEffect } from 'react';
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
import { Video } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function UploadScreen({ navigation }) {
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();

  const [selectedMediaUri, setSelectedMediaUri] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState(null);

  const [loading, setLoading] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');

  useEffect(() => {
    (async () => {
      // Log permission status on component mount
      console.log("UploadScreen mounted. Initial Media Library Permission status:", mediaLibraryPermission?.status);
      if (!mediaLibraryPermission?.granted) {
        console.log("Media Library Permission not granted on mount. Requesting...");
        const { status } = await requestMediaLibraryPermission();
        console.log("Permission status after initial request on mount:", status);
      }
    })();
  }, []);

  const pickMedia = async () => {
    console.log("pickMedia function called."); // DEBUG LOG: Entry point

    // Re-check permission right before attempting to pick media
    if (!mediaLibraryPermission?.granted) {
      console.log("Permission not granted when 'pickMedia' was called. Requesting again...");
      const { status } = await requestMediaLibraryPermission();
      console.log("Permission status after request in pickMedia:", status);

      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant Vroom access to your photos and videos to select media. You might need to go to your device Settings > Apps > Vroom > Permissions and enable Storage/Photos access.'
        );
        console.log("Permission denied, returning from pickMedia.");
        return;
      }
    } else {
      console.log("Media Library Permission is already granted.");
    }

    console.log("Attempting to launch ImagePicker library..."); // DEBUG LOG: Before launching picker
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.All, // FIXED: Use ImagePicker.MediaType.All
      allowsEditing: false,
      quality: 0.7,
    });
    console.log("ImagePicker result:", result); // DEBUG LOG: After picker returns

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      let type = result.assets[0].mediaType;

      // Fallback: If mediaType is undefined, infer from file extension
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
      console.log("Media selected and states set:", { uri, type }); // DEBUG LOG
    } else if (result.canceled) {
      console.log("ImagePicker was canceled by user.");
    } else {
      console.warn("ImagePicker did not return any assets despite not being canceled.");
      Alert.alert("Selection Issue", "No media was selected or found in the gallery result.");
    }
  };

  const uploadMediaToSupabase = async (uri, fileType) => {
    if (!uri) return null;

    setLoading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExtension = uri.split('.').pop().toLowerCase();
      const fileName = `posts/${uuidv4()}.${fileExtension}`;

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
      // setLoading(false); // Only set false after full post operation to prevent flicker
    }
  };

  const handlePost = async () => {
    if (!selectedMediaUri) {
      Alert.alert('No Media', 'Please select an image or video to post.');
      return;
    }

    setLoading(true);
    let publicUrl = null;

    publicUrl = await uploadMediaToSupabase(selectedMediaUri, selectedMediaType);

    if (!publicUrl) {
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Error', 'You must be logged in to create a post.');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('group_posts')
        .insert([
          {
            author_id: user.id,
            post_type: selectedMediaType,
            media_url: publicUrl,
            title: postTitle,
            description: postDescription,
          },
        ]);

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Post uploaded successfully!');
      setSelectedMediaUri(null);
      setSelectedMediaType(null);
      setPostTitle('');
      setPostDescription('');
      // if (navigation) {
      //   navigation.navigate('Feed');
      // }
    } catch (error) {
      console.error('Error creating post in DB:', error.message);
      Alert.alert('Post Error', 'Failed to create post in database: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Render permission request screen if not granted
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

  return (
    <View style={styles.container}>
      {selectedMediaUri && ( // Only show header if media is selected (i.e., on post creation screen)
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelectedMediaUri(null); setSelectedMediaType(null); setPostTitle(''); setPostDescription(''); }}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Post</Text>
          <View style={{ width: 28 }} />
        </View>
      )}

      {selectedMediaUri ? ( // Conditional rendering for Post Creation Screen vs. Media Picker
        <ScrollView style={styles.postCreationContainer} contentContainerStyle={styles.postCreationContent}>
          <View style={styles.mediaPreviewSection}>
            {console.log("Attempting to render Media Preview. URI:", selectedMediaUri, "Type:", selectedMediaType)} {/* DEBUG LOG */}
            {selectedMediaUri ? (
              selectedMediaType === 'image' ? (
                <Image source={{ uri: selectedMediaUri }} style={styles.selectedMedia} />
              ) : ( // Must be video
                <Video
                  source={{ uri: selectedMediaUri }}
                  style={styles.selectedMedia}
                  useNativeControls
                  resizeMode="cover"
                  isLooping
                />
              )
            ) : (
              <Text style={{color: '#fff', fontSize: 16}}>No media selected for preview.</Text>
            )}
          </View>

          <View style={styles.inputSection}>
            <TextInput
              style={styles.titleInput}
              placeholder="Add a catchy title"
              placeholderTextColor="#999"
              value={postTitle}
              onChangeText={setPostTitle}
              maxLength={100}
            />
          </View>

          <View style={styles.inputSection}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Writing a long description can help get 3x more views on average."
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

      {selectedMediaUri && ( // Only show bottom buttons if media is selected
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
    backgroundColor: '#00BFFF', // Light Blue
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
    backgroundColor: '#1a1a1a', // Dark Gray
  },
  comingSoonText: {
    color: '#00BFFF', // Light Blue
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
    backgroundColor: '#00BFFF', // Light Blue
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    gap: 10,
    shadowColor: '#00BFFF', // Light Blue shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  uploadGalleryButtonText: {
    color: '#000', // Black for contrast
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
    backgroundColor: '#000', // Black
    borderBottomWidth: 0.5,
    borderBottomColor: '#333', // Darker gray for subtle border
  },
  headerTitle: {
    color: '#fff', // White
    fontSize: 18,
    fontWeight: 'bold',
  },
  postCreationContainer: {
    flex: 1,
    backgroundColor: '#000', // Black
  },
  postCreationContent: {
    paddingBottom: 100, // Space for fixed bottom buttons
  },
  mediaPreviewSection: {
    width: '100%',
    height: width * 0.7, // Fixed aspect ratio for preview container
    backgroundColor: '#1a1a1a', // Dark Gray
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    overflow: 'hidden', // Crucial for 'cover' resizeMode
  },
  selectedMedia: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // Fills the space, may crop
  },
  inputSection: {
    backgroundColor: '#1a1a1a', // Dark Gray
    borderRadius: 10,
    marginHorizontal: 15,
    marginBottom: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  titleInput: {
    color: '#fff', // White
    fontSize: 16,
    paddingVertical: 8,
    fontWeight: '600',
  },
  descriptionInput: {
    color: '#fff', // White
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  descriptionIcons: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#333', // Darker gray
    paddingTop: 10,
  },
  descriptionIcon: {
    marginRight: 15,
  },
  optionsSection: {
    backgroundColor: '#1a1a1a', // Dark Gray
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
    borderBottomColor: '#333', // Darker gray
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    color: '#fff', // White
    fontSize: 16,
    marginLeft: 10,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4500', // Specific accent red
    marginLeft: 8,
  },
  locationTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333', // Darker gray
  },
  locationTag: {
    backgroundColor: '#333', // Even darker gray for tags
    color: '#fff', // White
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
    color: '#fff', // White
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
    backgroundColor: '#1a1a1a', // Dark Gray
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopWidth: 0.5,
    borderTopColor: '#333', // Darker gray
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 10, // Adjust for safe area on iOS
  },
  draftsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333', // Darker gray
    paddingVertical: 12,
    borderRadius: 25,
    marginRight: 10,
    gap: 5,
  },
  draftsButtonText: {
    color: '#fff', // White
    fontSize: 16,
    fontWeight: 'bold',
  },
  postButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BFFF', // Light Blue
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 10,
    gap: 5,
  },
  postButtonText: {
    color: '#000', // Black for contrast
    fontSize: 16,
    fontWeight: 'bold',
  },
});