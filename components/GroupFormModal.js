import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Image,
  ScrollView, // <--- ADDED: Import ScrollView
  KeyboardAvoidingView, // <--- ADDED: Import KeyboardAvoidingView
  Keyboard, // <--- ADDED: Import Keyboard for dismissal
  TouchableWithoutFeedback, // <--- ADDED: Import TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../utils/supabase';

const GroupFormModal = ({ visible, onClose, onGroupCreated }) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowVideoPosts, setAllowVideoPosts] = useState(true);
  const [allowImagePosts, setAllowImagePosts] = useState(true);
  const [allowTextPosts, setAllowTextPosts] = useState(true);
  const [isPrivateGroup, setIsPrivateGroup] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState(null);
  const [bannerImageUri, setBannerImageUri] = useState(null);

  const pickImage = async (setImageUri) => {
    // Request media library permissions
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant camera roll permissions to upload images.');
        return;
      }
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Missing Field', 'Please enter a group name.');
      return;
    }

    if (loading) {
      return; // Prevent multiple simultaneous submissions
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Required', 'You must be logged in to create a group.');
        setLoading(false);
        return;
      }

      // TODO: Implement actual image/banner upload to Supabase Storage here
      let uploadedProfileImageUrl = null;
      if (profileImageUri) {
        // Example: Call a function to upload profileImageUri to Supabase Storage
        // uploadedProfileImageUrl = await uploadImageToSupabase(profileImageUri, 'group_profiles');
      }

      let uploadedBannerImageUrl = null;
      if (bannerImageUri) {
        // Example: Call a function to upload bannerImageUri to Supabase Storage
        // uploadedBannerImageUrl = await uploadImageToSupabase(bannerImageUri, 'group_banners');
      }

      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          description: description.trim(),
          creator_id: user.id,
          member_count: 1,
          profile_picture_url: uploadedProfileImageUrl,
          banner_url: uploadedBannerImageUrl,
          allow_text_posts: allowTextPosts,
          allow_image_posts: allowImagePosts,
          allow_video_posts: allowVideoPosts,
          is_private: isPrivateGroup,
        })
        .select()
        .single();

      if (groupError) {
        throw groupError;
      }

      // Note: The database trigger 'on_group_created' automatically adds the creator 
      // as a member with admin privileges, so no manual insertion is needed

      Alert.alert('Success', `Group "${groupName}" created successfully!`);
      // Reset form states
      setGroupName('');
      setDescription('');
      setAllowVideoPosts(true);
      setAllowImagePosts(true);
      setAllowTextPosts(true);
      setIsPrivateGroup(false);
      setProfileImageUri(null);
      setBannerImageUri(null);

      // Close modal and trigger callback
      onClose(); // Close the modal
      if (onGroupCreated) {
        onGroupCreated();
      }
    } catch (error) {
      console.error('Error creating group:', error.message);
      Alert.alert('Error', 'Failed to create group: ' + error.message);
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
      <KeyboardAvoidingView // This covers the entire modal content
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"} // 'padding' often works best for iOS, 'height' for Android
        // keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20} // Adjust this offset if keyboard still covers input
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          {/* Tapping outside the keyboard dismisses it */}
          <SafeAreaView style={styles.centeredView}>
            <View style={styles.modalView}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Create New Group</Text>

              {/* ScrollView for the form content */}
              <ScrollView
                style={styles.scrollView} // Added new style for ScrollView
                contentContainerStyle={styles.scrollViewContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" // This helps with dismissing the keyboard on tap
              >
                <Text style={styles.label}>Group Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter group name"
                  placeholderTextColor="#B0B0B0"
                  value={groupName}
                  onChangeText={setGroupName}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What's your group about?"
                  placeholderTextColor="#B0B0B0"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                />

                {/* Profile Picture Upload Section */}
                <Text style={styles.label}>Profile Picture</Text>
                {profileImageUri && <Image source={{ uri: profileImageUri }} style={styles.selectedImagePreview} />}
                <TouchableOpacity
                  style={styles.imageUploadButton}
                  onPress={() => pickImage(setProfileImageUri)}
                >
                  <Ionicons name="image-outline" size={20} color="#fff" />
                  <Text style={styles.imageUploadButtonText}>Choose Image</Text>
                </TouchableOpacity>
                <Text style={styles.uploadInfoText}>Max file size: 10MB • Supported formats: JPG, PNG, WebP</Text>

                {/* Banner Image Upload Section */}
                <Text style={styles.label}>Banner Image</Text>
                {bannerImageUri && <Image source={{ uri: bannerImageUri }} style={styles.selectedImagePreview} />}
                <TouchableOpacity
                  style={styles.imageUploadButton}
                  onPress={() => pickImage(setBannerImageUri)}
                >
                  <Ionicons name="image-outline" size={20} color="#fff" />
                  <Text style={styles.imageUploadButtonText}>Choose Image</Text>
                </TouchableOpacity>
                <Text style={styles.uploadInfoText}>Max file size: 10MB • Supported formats: JPG, PNG, WebP</Text>

                {/* Post Type Permissions */}
                <View style={styles.permissionSection}>
                  <Text style={styles.permissionTitle}>Post Type Permissions</Text>
                  <View style={styles.permissionRow}>
                    <View>
                      <Text style={styles.permissionText}>Allow Video Posts</Text>
                      <Text style={styles.permissionDescription}>Members can share videos</Text>
                    </View>
                    <Switch
                      trackColor={{ false: "#767577", true: "#00BFFF" }}
                      thumbColor={allowVideoPosts ? "#fff" : "#f4f3f4"}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={setAllowVideoPosts}
                      value={allowVideoPosts}
                    />
                  </View>
                  <View style={styles.permissionRow}>
                    <View>
                      <Text style={styles.permissionText}>Allow Image Posts</Text>
                      <Text style={styles.permissionDescription}>Members can share photos</Text>
                    </View>
                    <Switch
                      trackColor={{ false: "#767577", true: "#00BFFF" }}
                      thumbColor={allowImagePosts ? "#fff" : "#f4f3f4"}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={setAllowImagePosts}
                      value={allowImagePosts}
                    />
                  </View>
                  <View style={styles.permissionRow}>
                    <View>
                      <Text style={styles.permissionText}>Allow Text Posts</Text>
                      <Text style={styles.permissionDescription}>Members can share text discussions</Text>
                    </View>
                    <Switch
                      trackColor={{ false: "#767577", true: "#00BFFF" }}
                      thumbColor={allowTextPosts ? "#fff" : "#f4f3f4"}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={setAllowTextPosts}
                      value={allowTextPosts}
                    />
                  </View>
                </View>

                {/* Private Group Toggle */}
                <View style={styles.permissionSection}>
                  <View style={styles.permissionRow}>
                    <View>
                      <Text style={styles.permissionText}>Private Group</Text>
                      <Text style={styles.permissionDescription}>Only members can see posts and join</Text>
                    </View>
                    <Switch
                      trackColor={{ false: "#767577", true: "#00BFFF" }}
                      thumbColor={isPrivateGroup ? "#fff" : "#f4f3f4"}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={setIsPrivateGroup}
                      value={isPrivateGroup}
                    />
                  </View>
                </View>
              </ScrollView> {/* End ScrollView */}

              {/* Fixed button container at the bottom */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createButton, loading && styles.disabledButton]}
                  onPress={handleCreateGroup}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.createButtonText}>Create Group</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1, // Make sure it takes full height
  },
  centeredView: {
    flex: 1, // Take full height to allow `KeyboardAvoidingView` to work
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingTop: Platform.OS === 'android' ? 20 : 0, // Ensure content starts below status bar on Android
  },
  modalView: {
    width: '90%',
    maxHeight: '95%', // Limit modal height so it doesn't always fill the screen entirely
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    // No paddingTop here, SafeAreaView handles it in centeredView
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  // Added new style for ScrollView itself
  scrollView: {
    width: '100%', // Ensure ScrollView takes full width of modalView
    flexGrow: 1, // Allow ScrollView to grow
  },
  scrollViewContent: {
    paddingBottom: 20, // Add some padding at the bottom of the scrollable content
    alignItems: 'center', // Keep content centered if narrower than parent
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
    fontWeight: '600',
    marginTop: 10,
  },
  input: {
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    width: '100%',
    marginBottom: 15,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  imageUploadButton: {
    flexDirection: 'row',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  imageUploadButtonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  uploadInfoText: {
    color: '#B0B0B0',
    fontSize: 12,
    alignSelf: 'flex-start',
    marginTop: 5,
    marginBottom: 15,
  },
  selectedImagePreview: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    resizeMode: 'cover',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  permissionSection: {
    width: '100%',
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
    marginBottom: 10,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
  },
  permissionDescription: {
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20, // Add space above buttons
    paddingHorizontal: 10, // Add horizontal padding for buttons
  },
  cancelButton: {
    backgroundColor: '#333',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default GroupFormModal;