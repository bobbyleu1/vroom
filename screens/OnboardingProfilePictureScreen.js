import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../utils/supabase';

export default function OnboardingProfilePictureScreen({ route, navigation }) {
  const { userData } = route.params;
  const [profileImage, setProfileImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need camera roll permissions to select a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need camera permissions to take a profile picture.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0]);
    }
  };

  const uploadImage = async (imageUri) => {
    try {
      setUploading(true);
      
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      const fileExt = imageUri.split('.').pop();
      const fileName = `${userData.username}_${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, blob);

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleCreateAccount = async () => {
    try {
      setCreating(true);

      let avatarUrl = null;
      if (profileImage) {
        avatarUrl = await uploadImage(profileImage.uri);
      }

      console.log('Creating account with data:', userData);

      // Create the account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });

      if (authError) {
        throw authError;
      }

      console.log('Account created successfully:', authData);

      // Wait a moment for the profile trigger to create the initial profile row
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the user's profile with collected data
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          username: userData.username,
          email: userData.email,
          avatar_url: avatarUrl,
          bio: `${userData.firstName} ${userData.lastName} - Automotive enthusiast`,
        })
        .eq('id', authData.user.id)
        .select();

      if (profileError) {
        console.error('Error updating profile:', profileError);
        Alert.alert(
          'Profile Update Failed',
          'Account created but profile update failed. You can update your profile later in settings.'
        );
      } else {
        console.log('Profile updated successfully:', updatedProfile);
      }

      Alert.alert(
        'Welcome to Vroom Social!',
        'Your account has been created successfully. Check your email to confirm your account.',
        [
          {
            text: 'Start Exploring',
            onPress: () => {
              // The AuthContext will handle navigation automatically
              // since the user is now authenticated
            }
          }
        ]
      );

    } catch (error) {
      console.error('Account creation error:', error);
      Alert.alert(
        'Account Creation Failed',
        error.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Profile Picture?',
      'You can always add a profile picture later in your settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: handleCreateAccount }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.wrapper}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.titleText}>Add Profile Picture</Text>
          <Text style={styles.subtitleText}>Help others recognize you</Text>
        </View>

        {/* Profile Picture Preview */}
        <View style={styles.imageContainer}>
          <View style={styles.imagePlaceholder}>
            {profileImage ? (
              <Image source={{ uri: profileImage.uri }} style={styles.profileImage} />
            ) : (
              <Ionicons name="person" size={80} color="#888" />
            )}
          </View>
          
          {uploading && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color="#00BFFF" />
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
            <Ionicons name="images-outline" size={24} color="#00BFFF" />
            <Text style={styles.actionText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={24} color="#00BFFF" />
            <Text style={styles.actionText}>Take Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Create Account Button */}
        <TouchableOpacity
          style={[styles.createButton, (!profileImage || uploading || creating) && styles.disabledButton]}
          onPress={handleCreateAccount}
          disabled={uploading || creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.createButtonText}>Create Account</Text>
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        {/* Skip Button */}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={creating}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>

        {/* User Info Preview */}
        <View style={styles.userPreview}>
          <Text style={styles.userPreviewText}>
            Creating account for {userData.firstName} {userData.lastName}
          </Text>
          <Text style={styles.userPreviewSubtext}>@{userData.username}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0c10',
  },
  wrapper: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  titleText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 16,
    color: '#ccc',
    fontWeight: '500',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 50,
    position: 'relative',
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#333',
  },
  profileImage: {
    width: 144,
    height: 144,
    borderRadius: 72,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 75,
  },
  actionContainer: {
    marginBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  actionText: {
    color: '#00BFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  createButton: {
    backgroundColor: '#00BFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  skipButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '500',
  },
  userPreview: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  userPreviewText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  userPreviewSubtext: {
    color: '#888',
    fontSize: 14,
  },
});