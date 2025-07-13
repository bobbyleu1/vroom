// components/PostFormModal.js

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import * as ImagePicker from 'expo-image-picker';
import { v4 as uuidv4 } from 'uuid'; // For unique file names

const PostFormModal = ({ visible, onClose, onSuccess, groupId }) => {
  const [postType, setPostType] = useState('text'); // 'text', 'image', 'video'
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUri, setMediaUri] = useState(null); // For image/video URI
  const [loading, setLoading] = useState(false);
  const [mediaPermission, setMediaPermission] = useState(null);

  useEffect(() => {
    // Request media library permission when modal becomes visible or on mount
    if (visible) { // Only request if modal is visible to prevent unnecessary prompts
      (async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaPermission(status === 'granted');
      })();
    }
  }, [visible]); // Re-run effect when visibility changes

  const resetForm = () => {
    setPostType('text');
    setTitle('');
    setContent('');
    setMediaUri(null);
    setLoading(false);
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);


  const pickMedia = async (type) => {
    if (mediaPermission === null) {
      Alert.alert('Permission Status', 'Checking for media library permissions...');
      return;
    }
    if (!mediaPermission) {
      Alert.alert('Permission Required', 'Please enable media library access in your device settings to select media.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false, // Set to false to avoid potential issues with specific media types
      quality: 0.7,
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const uploadMediaToSupabase = async (uri, mimeType) => {
    if (!uri) return null;

    const fileExtension = uri.split('.').pop().toLowerCase();
    const fileName = `group_posts/${uuidv4()}.${fileExtension}`; // Store in 'group_posts' bucket

    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage.from('group_posts').upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimeType,
      });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage.from('group_posts').getPublicUrl(fileName);
      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('Error uploading media:', error.message);
      Alert.alert('Upload Error', 'Failed to upload media: ' + error.message);
      return null;
    }
  };


  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for your post.');
      return;
    }
    if (postType === 'text' && !content.trim()) {
      Alert.alert('Missing Content', 'Please enter content for your text post.');
      return;
    }
    if ((postType === 'image' || postType === 'video') && !mediaUri) {
      Alert.alert('Missing Media', `Please select an ${postType} to post.`);
      return;
    }

    setLoading(true);
    let publicUrl = null;
    let mimeType = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Required', 'You must be logged in to create a post.');
        setLoading(false);
        return;
      }

      if (postType === 'image' && mediaUri) {
        // Attempt to derive MIME type from URI, or default to common ones
        mimeType = `image/${mediaUri.split('.').pop().toLowerCase()}`;
        if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(mediaUri.split('.').pop().toLowerCase())) {
          mimeType = 'image/jpeg'; // Fallback
        }
        publicUrl = await uploadMediaToSupabase(mediaUri, mimeType);
        if (!publicUrl) {
          setLoading(false);
          return; // Error already alerted by uploadMediaToSupabase
        }
      } else if (postType === 'video' && mediaUri) {
        // Attempt to derive MIME type from URI, or default to common ones
        mimeType = `video/${mediaUri.split('.').pop().toLowerCase()}`;
        if (!['mp4', 'mov', 'avi', 'mkv'].includes(mediaUri.split('.').pop().toLowerCase())) {
          mimeType = 'video/mp4'; // Fallback
        }
        publicUrl = await uploadMediaToSupabase(mediaUri, mimeType);
        if (!publicUrl) {
          setLoading(false);
          return; // Error already alerted by uploadMediaToSupabase
        }
      }

      const { error: postError } = await supabase.from('posts').insert([
        {
          group_id: groupId,
          user_id: user.id,
          type: postType,
          title: title.trim(),
          content: content.trim(),
          media_url: publicUrl,
        },
      ]);

      if (postError) {
        throw postError;
      }

      Alert.alert('Success', 'Post created successfully!');
      resetForm();
      onSuccess(); // Trigger refresh in parent component
      onClose();
    } catch (error) {
      console.error('Error creating post:', error.message);
      Alert.alert('Post Error', 'Failed to create post: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Post</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer}>
            {/* Post Type Selector */}
            <View style={styles.postTypeContainer}>
              <Text style={styles.label}>Post Type</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeButton, postType === 'text' && styles.activeTypeButton]}
                  onPress={() => { setPostType('text'); setMediaUri(null); }}
                >
                  <Text style={[styles.typeButtonText, postType === 'text' && styles.activeTypeButtonText]}>Text Post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, postType === 'image' && styles.activeTypeButton]}
                  onPress={() => { setPostType('image'); setMediaUri(null); }}
                >
                  <Text style={[styles.typeButtonText, postType === 'image' && styles.activeTypeButtonText]}>Image Post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, postType === 'video' && styles.activeTypeButton]}
                  onPress={() => { setPostType('video'); setMediaUri(null); }}
                >
                  <Text style={[styles.typeButtonText, postType === 'video' && styles.activeTypeButtonText]}>Video Post</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Title Input */}
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="What's your post about?"
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
            />

            {/* Content Input */}
            <Text style={styles.label}>Content *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Share your thoughts..."
              placeholderTextColor="#888"
              multiline
              numberOfLines={4}
              value={content}
              onChangeText={setContent}
            />

            {/* Media Selection (Conditional) */}
            {(postType === 'image' || postType === 'video') && (
              <View style={styles.mediaSelectionContainer}>
                <Text style={styles.label}>{postType === 'image' ? 'Image' : 'Video'}</Text>
                <TouchableOpacity
                  style={styles.mediaPickerButton}
                  onPress={() => pickMedia(postType)}
                >
                  <Feather name="upload" size={20} color="#00BFFF" />
                  <Text style={styles.mediaPickerButtonText}>
                    {mediaUri ? `Change ${postType}` : `Choose ${postType}`}
                  </Text>
                </TouchableOpacity>
                {mediaUri && (
                  <View style={styles.mediaPreview}>
                    {postType === 'image' ? (
                      <Image source={{ uri: mediaUri }} style={styles.imagePreview} />
                    ) : (
                      <Ionicons name="videocam" size={80} color="#00BFFF" /> // Video placeholder
                    )}
                    <TouchableOpacity style={styles.removeMediaButton} onPress={() => setMediaUri(null)}>
                      <Ionicons name="close-circle" size={24} color="red" />
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={styles.maxSizeText}>Max file size: 10MB (Recommended)</Text>
              </View>
            )}

          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { onClose(); resetForm(); }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.postButton} onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', // This creates the dark overlay
  },
  modalView: {
    width: '90%',
    maxHeight: '90%',
    backgroundColor: '#1C1C1E',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  formContainer: {
    maxHeight: '80%', // Limit height to allow scroll
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  postTypeContainer: {
    marginBottom: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTypeButton: {
    backgroundColor: '#00BFFF',
  },
  typeButtonText: {
    color: '#00BFFF',
    fontWeight: 'bold',
  },
  activeTypeButtonText: {
    color: '#000',
  },
  mediaSelectionContainer: {
    marginBottom: 15,
  },
  mediaPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  mediaPickerButtonText: {
    color: '#00BFFF',
    fontSize: 16,
    marginLeft: 10,
  },
  mediaPreview: {
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative', // For absolute positioning of remove button
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  removeMediaButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    padding: 2,
  },
  maxSizeText: {
    color: '#B0B0B0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#666',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  postButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  postButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PostFormModal;