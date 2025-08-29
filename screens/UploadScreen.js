// UploadScreen.js
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
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { uploadMedia } from '../utils/mediaUpload';
import { Video } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MAX_VIDEO_DURATION_S } from '../config/media';

const { width } = Dimensions.get('window');

export default function UploadScreen({ navigation }) {
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [selectedMediaUri, setSelectedMediaUri] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [postDescription, setPostDescription] = useState('');
  const videoRef = useRef(null);

  useEffect(() => {
    if (!mediaLibraryPermission?.granted) {
      requestMediaLibraryPermission();
    }
  }, [mediaLibraryPermission]);

  const pickMedia = async () => {
    if (!mediaLibraryPermission?.granted) {
      const { status } = await requestMediaLibraryPermission();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant Vroom access to your photos and videos.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_DURATION_S,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const { uri, mediaType } = result.assets[0];
      let type = mediaType;
      if (!type) {
        const ext = uri.split('.').pop().toLowerCase();
        type = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
      }
      setSelectedMediaUri(uri);
      setSelectedMediaType(type);
    }
  };

  // Removed uploadFileToSupabase - using unified uploadMedia utility instead

  const handlePost = async () => {
    if (!selectedMediaUri) {
      Alert.alert('No Media', 'Please select an image or video to post.');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to post.');

      // Upload main media using unified utility
      const { mediaUrl, thumbnailUrl } = await uploadMedia(selectedMediaUri, user.id, selectedMediaType);
      if (!mediaUrl) throw new Error('Media upload failed.');

      // Insert post into DB
      const { error } = await supabase.from('posts').insert([{
        author_id: user.id,
        file_type: selectedMediaType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        content: postDescription,
      }]);

      if (error) throw error;

      Alert.alert('Success', 'Post uploaded successfully!');
      setSelectedMediaUri(null);
      setSelectedMediaType(null);
      setPostDescription('');
      navigation?.navigate('Feed');
    } catch (err) {
      console.error('Post creation failed:', err.message);
      Alert.alert('Post Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {selectedMediaUri ? (
        <ScrollView style={styles.postCreationContainer} contentContainerStyle={styles.postCreationContent}>
          <View style={styles.mediaPreviewSection}>
            {selectedMediaType === 'image' ? (
              <Image source={{ uri: selectedMediaUri }} style={styles.selectedMedia} />
            ) : (
              <Video
                ref={videoRef}
                source={{ uri: selectedMediaUri }}
                style={styles.selectedMedia}
                useNativeControls
                isLooping
              />
            )}
          </View>

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
        </ScrollView>
      ) : (
        <View style={styles.cameraPlaceholderContainer}>
          <Text style={styles.comingSoonText}>Camera function coming soon!</Text>
          <Text style={styles.thirdPartyText}>Use a third-party app like CapCut for editing.</Text>
          <TouchableOpacity style={styles.uploadGalleryButton} onPress={pickMedia}>
            <Ionicons name="images" size={24} color="#000" />
            <Text style={styles.uploadGalleryButtonText}>Upload from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedMediaUri && (
        <View style={styles.bottomButtonsContainer}>
          <TouchableOpacity
            style={styles.draftsButton}
            onPress={() => Alert.alert('Drafts', 'This feature is coming soon!')}
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
  container: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholderContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    width: '100%', paddingHorizontal: 20, backgroundColor: '#1a1a1a'
  },
  comingSoonText: {
    color: '#00BFFF', fontSize: 24, fontWeight: 'bold',
    marginBottom: 10, textAlign: 'center'
  },
  thirdPartyText: {
    color: '#ccc', fontSize: 14, textAlign: 'center',
    marginBottom: 30, lineHeight: 20
  },
  uploadGalleryButton: {
    backgroundColor: '#00BFFF', flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30, gap: 10,
    shadowColor: '#00BFFF', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 3, elevation: 5,
  },
  uploadGalleryButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  postCreationContainer: { flex: 1, backgroundColor: '#000' },
  postCreationContent: { paddingBottom: 100 },
  mediaPreviewSection: {
    width: '100%', height: width * 0.7,
    backgroundColor: '#1a1a1a', justifyContent: 'center',
    alignItems: 'center', marginBottom: 15, overflow: 'hidden',
  },
  selectedMedia: { width: '100%', height: '100%', resizeMode: 'cover' },
  inputSection: {
    backgroundColor: '#1a1a1a', borderRadius: 10,
    marginHorizontal: 15, marginBottom: 15,
    paddingHorizontal: 15, paddingVertical: 10,
  },
  descriptionInput: {
    color: '#fff', fontSize: 14,
    minHeight: 80, textAlignVertical: 'top'
  },
  descriptionIcons: {
    flexDirection: 'row', marginTop: 10,
    borderTopWidth: 0.5, borderTopColor: '#333',
    paddingTop: 10,
  },
  descriptionIcon: { marginRight: 15 },
  bottomButtonsContainer: {
    flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'center', backgroundColor: '#1a1a1a',
    paddingVertical: 10, paddingHorizontal: 15,
    borderTopWidth: 0.5, borderTopColor: '#333',
    position: 'absolute', bottom: 0, width: '100%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 10,
  },
  draftsButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#333',
    paddingVertical: 12, borderRadius: 25,
    marginRight: 10, gap: 5,
  },
  draftsButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  postButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#00BFFF',
    paddingVertical: 12, borderRadius: 25,
    marginLeft: 10, gap: 5,
  },
  postButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});
