// components/ForumPostFormModal.js

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
  FlatList,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadMedia } from '../utils/mediaUpload.js';

const ForumPostFormModal = ({ visible, onClose, onSuccess, communityName }) => {
  const [postType, setPostType] = useState('text'); // 'text', 'image', 'video'
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUri, setMediaUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mediaPermission, setMediaPermission] = useState(null);
  const [selectedCommunity, setSelectedCommunity] = useState(communityName || null);
  const [availableCommunities, setAvailableCommunities] = useState([]);

  useEffect(() => {
    if (visible) {
      (async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaPermission(status === 'granted');
      })();
      
      // Load available communities if not already provided
      if (!communityName) {
        loadAvailableCommunities();
      }
    }
  }, [visible, communityName]);

  const loadAvailableCommunities = async () => {
    try {
      const { data: communities, error } = await supabase
        .from('forum_categories')
        .select('id, name')
        .order('name');
      
      if (error) {
        console.error('Error loading communities:', error);
        return;
      }
      
      setAvailableCommunities(communities || []);
    } catch (error) {
      console.error('Error loading communities:', error);
    }
  };

  const resetForm = () => {
    setPostType('text');
    setTitle('');
    setContent('');
    setMediaUri(null);
    setLoading(false);
    // Only reset community selection if it wasn't provided as a prop
    if (!communityName) {
      setSelectedCommunity(null);
    }
  };

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
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a title for your post.');
      return;
    }
    if (!selectedCommunity && !communityName) {
      Alert.alert('Missing Community', 'Please select a community to post in.');
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Required', 'You must be logged in to create a post.');
        setLoading(false);
        return;
      }

      // Get category ID for the community
      let categoryId = null;
      const targetCommunity = communityName || selectedCommunity;
      
      if (targetCommunity) {
        // If we already have the ID from selectedCommunity object, use it directly
        if (typeof selectedCommunity === 'object' && selectedCommunity?.id) {
          categoryId = selectedCommunity.id;
        } else {
          // Otherwise, look up by name
          const { data: categoryData, error: categoryError } = await supabase
            .from('forum_categories')
            .select('id')
            .eq('name', targetCommunity)
            .single();
          
          if (categoryError || !categoryData) {
            Alert.alert('Error', 'Could not find the community. Please try again.');
            setLoading(false);
            return;
          }
          categoryId = categoryData.id;
        }
      } else {
        Alert.alert('Error', 'Please select a community to post in.');
        setLoading(false);
        return;
      }

      // Initialize media fields
      let mediaUrl = null;
      let thumbnailUrl = null;
      let imageUrls = null;

      // If media selected, upload using shared utility
      if ((postType === 'image' || postType === 'video') && mediaUri) {
        const result = await uploadMedia(mediaUri, user.id, postType);
        mediaUrl = result.mediaUrl;
        thumbnailUrl = result.thumbnailUrl;
        imageUrls = result.imageUrls;

        if (postType === 'video' && !mediaUrl) {
          setLoading(false);
          Alert.alert('Upload Error', 'Failed to upload your video. Please try again.');
          return;
        }
        if (postType === 'image' && (!imageUrls || imageUrls.length === 0)) {
          setLoading(false);
          Alert.alert('Upload Error', 'Failed to upload your image. Please try again.');
          return;
        }
      }

      // Prepare record for insertion into forum_posts
      const record = {
        category_id: categoryId,
        author_id: user.id,
        title: title.trim(),
        content: content.trim() || null,
        upvotes: 0,
        image_urls: null,
      };

      if (postType === 'image') {
        record.image_urls = imageUrls;
      } else if (postType === 'video') {
        // Note: video support requires adding media_url and thumbnail_url columns to forum_posts table
        // For now, store video info in content or create a separate forum_media table
        console.warn('Video posts are not fully supported - missing media_url and thumbnail_url columns in forum_posts table');
        // Store media info in content for now
        record.content = (record.content || '') + `\n[Video: ${mediaUrl}]` + (thumbnailUrl ? `\n[Thumbnail: ${thumbnailUrl}]` : '');
      }

      const { error: insertError } = await supabase
        .from('forum_posts')
        .insert([record]);

      if (insertError) {
        throw insertError;
      }

      Alert.alert('Success', 'Forum post created successfully!');
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating forum post:', error.message);
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
            <Text style={styles.modalTitle}>
              Create Forum Post {communityName && `in v/${communityName}`}
            </Text>
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

            {/* Community Selector - Only show if not provided as prop */}
            {!communityName && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Community *</Text>
                {selectedCommunity ? (
                  <TouchableOpacity
                    style={[styles.textInput, styles.communityDisplay]}
                    onPress={() => setSelectedCommunity(null)}
                  >
                    <Text style={styles.communityDisplayText}>v/{selectedCommunity.name || selectedCommunity}</Text>
                    <Ionicons name="close" size={20} color="#888" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.communitySelector}>
                    <ScrollView style={styles.communityList} showsVerticalScrollIndicator={false}>
                      {availableCommunities.map((community) => (
                        <TouchableOpacity
                          key={community.id}
                          style={styles.communityOption}
                          onPress={() => setSelectedCommunity(community)}
                        >
                          <Text style={styles.communityOptionText}>v/{community.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {availableCommunities.length === 0 && (
                      <Text style={styles.loadingText}>Loading communities...</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Title Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter post title..."
                placeholderTextColor="#888"
                value={title}
                onChangeText={setTitle}
                maxLength={300}
              />
            </View>

            {/* Content Input (for text posts or additional description) */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                {postType === 'text' ? 'Content *' : 'Description (Optional)'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                placeholder={postType === 'text' ? 'Write your post content...' : 'Add a description for your media...'}
                placeholderTextColor="#888"
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            {/* Media Selection */}
            {postType !== 'text' && (
              <View style={styles.mediaContainer}>
                <Text style={styles.label}>Media *</Text>
                {mediaUri ? (
                  <View style={styles.mediaPreview}>
                    <Image source={{ uri: mediaUri }} style={styles.previewImage} />
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => setMediaUri(null)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.mediaPickerButton}
                    onPress={() => pickMedia(postType)}
                  >
                    <Ionicons name={postType === 'image' ? 'image' : 'videocam'} size={32} color="#00BFFF" />
                    <Text style={styles.mediaPickerText}>
                      Select {postType === 'image' ? 'Image' : 'Video'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Create Post</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalView: {
    flex: 1,
    backgroundColor: '#000',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  postTypeContainer: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  activeTypeButton: {
    backgroundColor: '#00BFFF',
    borderColor: '#00BFFF',
  },
  typeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTypeButtonText: {
    color: '#fff',
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#111',
  },
  multilineInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  mediaContainer: {
    marginBottom: 20,
  },
  mediaPreview: {
    position: 'relative',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  removeMediaButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
  },
  mediaPickerButton: {
    borderWidth: 2,
    borderColor: '#00BFFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPickerText: {
    color: '#00BFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  communityDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  communityDisplayText: {
    color: '#00BFFF',
    fontSize: 16,
    flex: 1,
  },
  communitySelector: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    backgroundColor: '#111',
    maxHeight: 150,
  },
  communityList: {
    maxHeight: 150,
  },
  communityOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  communityOptionText: {
    color: '#fff',
    fontSize: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
});

export default ForumPostFormModal;