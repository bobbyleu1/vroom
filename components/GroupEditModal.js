// components/GroupEditModal.js

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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import * as ImagePicker from 'expo-image-picker';

const GroupEditModal = ({ visible, onClose, groupData, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowTextPosts, setAllowTextPosts] = useState(true);
  const [allowImagePosts, setAllowImagePosts] = useState(true);
  const [allowVideoPosts, setAllowVideoPosts] = useState(true);
  const [profilePictureUri, setProfilePictureUri] = useState(null);
  const [bannerUri, setBannerUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mediaPermission, setMediaPermission] = useState(null);

  // Initialize form with current group data
  useEffect(() => {
    if (groupData && visible) {
      setName(groupData.name || '');
      setDescription(groupData.description || '');
      setAllowTextPosts(groupData.allow_text_posts ?? true);
      setAllowImagePosts(groupData.allow_image_posts ?? true);
      setAllowVideoPosts(groupData.allow_video_posts ?? true);
      setProfilePictureUri(null); // Reset to null, show existing image in UI
      setBannerUri(null); // Reset to null, show existing image in UI
    }
  }, [groupData, visible]);

  useEffect(() => {
    if (visible) {
      (async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaPermission(status === 'granted');
      })();
    }
  }, [visible]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setAllowTextPosts(true);
    setAllowImagePosts(true);
    setAllowVideoPosts(true);
    setProfilePictureUri(null);
    setBannerUri(null);
    setLoading(false);
  };

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  const pickImage = async (type) => {
    if (mediaPermission === null) {
      Alert.alert('Permission Status', 'Checking for media library permissions...');
      return;
    }
    if (!mediaPermission) {
      Alert.alert('Permission Required', 'Please enable media library access in your device settings to select images.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'banner' ? [16, 9] : [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      if (type === 'profile') {
        setProfilePictureUri(result.assets[0].uri);
      } else if (type === 'banner') {
        setBannerUri(result.assets[0].uri);
      }
    }
  };

  const uploadImage = async (uri, folder) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      console.log('Uploading to path:', filePath);
      
      const { data, error } = await supabase.storage
        .from('groups')
        .upload(filePath, blob, {
          contentType: blob.type || 'image/jpeg',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      console.log('Upload successful:', data);

      const { data: { publicUrl } } = supabase.storage
        .from('groups')
        .getPublicUrl(filePath);

      console.log('Public URL:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a name for your group.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please enter a description for your group.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Required', 'You must be logged in to edit a group.');
        setLoading(false);
        return;
      }

      // Check if user is the group creator
      if (user.id !== groupData?.creator_id) {
        Alert.alert('Permission Denied', 'You can only edit groups that you created.');
        setLoading(false);
        return;
      }

      // Prepare update data
      const updateData = {
        name: name.trim(),
        description: description.trim(),
        allow_text_posts: allowTextPosts,
        allow_image_posts: allowImagePosts,
        allow_video_posts: allowVideoPosts,
      };

      // Upload new images if selected
      if (profilePictureUri) {
        try {
          const profileUrl = await uploadImage(profilePictureUri, 'profile-pictures');
          updateData.profile_picture_url = profileUrl;
        } catch (error) {
          console.error('Failed to upload profile picture:', error);
          Alert.alert('Upload Error', 'Failed to upload profile picture. Continuing without updating it.');
        }
      }

      if (bannerUri) {
        try {
          const bannerUrl = await uploadImage(bannerUri, 'banners');
          updateData.banner_url = bannerUrl;
        } catch (error) {
          console.error('Failed to upload banner:', error);
          Alert.alert('Upload Error', 'Failed to upload banner. Continuing without updating it.');
        }
      }

      // Update group in database
      const { error: updateError } = await supabase
        .from('groups')
        .update(updateData)
        .eq('id', groupData.id);

      if (updateError) {
        throw updateError;
      }

      Alert.alert('Success', 'Group updated successfully!');
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating group:', error.message);
      Alert.alert('Update Error', 'Failed to update group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentProfilePicture = profilePictureUri || groupData?.profile_picture_url;
  const currentBanner = bannerUri || groupData?.banner_url;

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
            <Text style={styles.modalTitle}>Edit Group</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer}>
            {/* Group Name */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Group Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter group name..."
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                maxLength={50}
              />
            </View>

            {/* Group Description */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                placeholder="Describe your group..."
                placeholderTextColor="#888"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>

            {/* Profile Picture */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Profile Picture</Text>
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={() => pickImage('profile')}
              >
                {currentProfilePicture ? (
                  <Image 
                    source={{ uri: currentProfilePicture }} 
                    style={styles.profilePreview} 
                  />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Ionicons name="camera" size={24} color="#888" />
                    <Text style={styles.placeholderText}>Add Profile Picture</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Banner Image */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Banner Image</Text>
              <TouchableOpacity
                style={styles.bannerPickerButton}
                onPress={() => pickImage('banner')}
              >
                {currentBanner ? (
                  <Image 
                    source={{ uri: currentBanner }} 
                    style={styles.bannerPreview} 
                  />
                ) : (
                  <View style={styles.placeholderBanner}>
                    <Ionicons name="camera" size={24} color="#888" />
                    <Text style={styles.placeholderText}>Add Banner Image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Post Type Settings */}
            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>Allowed Post Types</Text>
              
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="text" size={20} color="#00BFFF" />
                  <Text style={styles.settingLabel}>Text Posts</Text>
                </View>
                <Switch
                  value={allowTextPosts}
                  onValueChange={setAllowTextPosts}
                  trackColor={{ false: '#767577', true: '#00BFFF' }}
                  thumbColor={allowTextPosts ? '#fff' : '#f4f3f4'}
                />
              </View>

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="image" size={20} color="#00BFFF" />
                  <Text style={styles.settingLabel}>Image Posts</Text>
                </View>
                <Switch
                  value={allowImagePosts}
                  onValueChange={setAllowImagePosts}
                  trackColor={{ false: '#767577', true: '#00BFFF' }}
                  thumbColor={allowImagePosts ? '#fff' : '#f4f3f4'}
                />
              </View>

              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <Ionicons name="videocam" size={20} color="#00BFFF" />
                  <Text style={styles.settingLabel}>Video Posts</Text>
                </View>
                <Switch
                  value={allowVideoPosts}
                  onValueChange={setAllowVideoPosts}
                  trackColor={{ false: '#767577', true: '#00BFFF' }}
                  thumbColor={allowVideoPosts ? '#fff' : '#f4f3f4'}
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Update Group</Text>
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
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
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
    height: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  bannerPickerButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  profilePreview: {
    width: 120,
    height: 120,
    resizeMode: 'cover',
  },
  bannerPreview: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: 120,
    height: 120,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderBanner: {
    width: '100%',
    height: 100,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#888',
    fontSize: 12,
    marginTop: 5,
  },
  settingsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 10,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
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
});

export default GroupEditModal;