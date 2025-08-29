import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { Video } from 'expo-av';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
// import { uploadMedia } from '../lib/storage.js';
import { uploadMedia } from '../utils/mediaUpload.js';
import { supabase } from '../utils/supabase.js';
import { MAX_VIDEO_DURATION_S } from '../config/media';
import { getPickedVideoMeta, ensureMax60s } from '../utils/videoMeta';

const { width, height } = Dimensions.get('window');

const AUDIENCE_OPTIONS = [
  { id: 'public', label: 'Public', description: 'Anyone can see this post', icon: 'earth' },
  { id: 'friends', label: 'Friends', description: 'Only your friends can see this', icon: 'people' },
  { id: 'private', label: 'Private', description: 'Only you can see this', icon: 'lock-closed' },
];

export default function PostPreviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const videoRef = useRef(null);
  
  const { mediaUri, mediaType, source } = route.params;
  
  const [caption, setCaption] = useState('');
  const [selectedAudience, setSelectedAudience] = useState('public');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAudienceModal, setShowAudienceModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (videoRef.current && mediaType === 'video') {
        videoRef.current.playAsync();
      }
      return () => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      };
    }, [mediaType])
  );

  const handleBack = () => {
    if (isUploading) {
      Alert.alert(
        'Upload in Progress',
        'Are you sure you want to cancel the upload?',
        [
          { text: 'Continue Upload', style: 'cancel' },
          { text: 'Cancel Upload', style: 'destructive', onPress: () => navigation.goBack() }
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const extractHashtags = (text) => {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    while ((match = hashtagRegex.exec(text)) !== null) {
      hashtags.push(match[1]);
    }
    return hashtags;
  };

  const handlePost = async () => {
    if (!mediaUri) {
      Alert.alert('Error', 'No media selected');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Authentication required');
      }

      let finalMediaUri = mediaUri;
      
      // Validate video duration if it's a video
      if (mediaType === 'video') {
        try {
          const meta = await getPickedVideoMeta({ uri: mediaUri });
          if (meta.durationSec > MAX_VIDEO_DURATION_S) {
            Alert.alert(
              'Video Too Long',
              `Videos must be ${MAX_VIDEO_DURATION_S} seconds or shorter. Your video is ${meta.durationSec} seconds.`,
              [{ text: 'OK' }]
            );
            setIsUploading(false);
            return;
          }
        } catch (validationError) {
          console.warn('Could not validate video duration:', validationError);
          // Continue with upload if validation fails
        }
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 20;
        });
      }, 500);

      const uploadResult = await uploadMedia(finalMediaUri, user.id, mediaType === 'video' ? 'video' : 'image');

      console.log('Upload result:', uploadResult);
      console.log('Media URL:', uploadResult.mediaUrl);

      clearInterval(progressInterval);
      setUploadProgress(100);

      const hashtags = extractHashtags(caption);

      const { data: postData, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          content: caption.trim(),
          media_url: uploadResult.mediaUrl,
          thumbnail_url: uploadResult.thumbnailUrl,
          file_type: mediaType === 'video' ? 'video' : 'image',
        })
        .select()
        .single();

      if (postError) {
        throw postError;
      }

      // Save hashtags if any were found
      if (hashtags.length > 0) {
        const { error: hashtagError } = await supabase
          .rpc('add_hashtags_to_post', {
            p_post_id: postData.id,
            hashtag_names: hashtags
          });

        if (hashtagError) {
          console.error('Error saving hashtags:', hashtagError);
          // Don't throw error for hashtags - post creation should still succeed
        } else {
          console.log('Successfully saved hashtags:', hashtags);
        }
      }

      Alert.alert(
        'Success!',
        'Your post has been uploaded successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('MainApp', { screen: 'Feed' });
            },
          },
        ]
      );

    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert(
        'Upload Failed',
        error.message || 'Something went wrong. Please try again.',
        [
          { text: 'Retry', onPress: handlePost },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const renderAudienceOption = (option) => (
    <TouchableOpacity
      key={option.id}
      style={[
        styles.audienceOption,
        selectedAudience === option.id && styles.selectedAudienceOption,
      ]}
      onPress={() => {
        setSelectedAudience(option.id);
        setShowAudienceModal(false);
      }}
    >
      <Ionicons 
        name={option.icon} 
        size={24} 
        color={selectedAudience === option.id ? '#00BFFF' : '#fff'} 
      />
      <View style={styles.audienceOptionText}>
        <Text style={[
          styles.audienceOptionLabel,
          selectedAudience === option.id && styles.selectedAudienceOptionLabel,
        ]}>
          {option.label}
        </Text>
        <Text style={styles.audienceOptionDescription}>
          {option.description}
        </Text>
      </View>
      {selectedAudience === option.id && (
        <Ionicons name="checkmark-circle" size={20} color="#00BFFF" />
      )}
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity 
          style={[styles.postButton, isUploading && styles.postButtonDisabled]}
          onPress={handlePost}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Media Preview */}
        <View style={styles.mediaContainer}>
          {mediaType === 'video' ? (
            <Video
              ref={videoRef}
              source={{ uri: mediaUri }}
              style={styles.media}
              resizeMode="cover"
              isLooping
              shouldPlay
              isMuted={false}
            />
          ) : (
            <Image source={{ uri: mediaUri }} style={styles.media} />
          )}
        </View>

        {/* Caption Input */}
        <View style={styles.captionContainer}>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption..."
            placeholderTextColor="#666"
            multiline
            value={caption}
            onChangeText={setCaption}
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>
            {caption.length}/2000
          </Text>
        </View>

        {/* Audience Selection */}
        <TouchableOpacity 
          style={styles.audienceContainer}
          onPress={() => setShowAudienceModal(!showAudienceModal)}
        >
          <View style={styles.audienceHeader}>
            <Ionicons name="people" size={20} color="#00BFFF" />
            <Text style={styles.audienceTitle}>Who can see this?</Text>
            <Ionicons 
              name={showAudienceModal ? "chevron-up" : "chevron-down"} 
              size={16} 
              color="#666" 
            />
          </View>
          {showAudienceModal && (
            <View style={styles.audienceModal}>
              {AUDIENCE_OPTIONS.map(renderAudienceOption)}
            </View>
          )}
        </TouchableOpacity>

        {/* Upload Progress */}
        {isUploading && (
          <View style={styles.uploadProgressContainer}>
            <View style={styles.uploadProgressHeader}>
              <Text style={styles.uploadProgressText}>
                Uploading... {Math.round(uploadProgress)}%
              </Text>
              <MaterialIcons name="cloud-upload" size={20} color="#00BFFF" />
            </View>
            <View style={styles.uploadProgressBar}>
              <View 
                style={[
                  styles.uploadProgressFill,
                  { width: `${uploadProgress}%` }
                ]}
              />
            </View>
          </View>
        )}

        {/* Features Section */}
        <View style={styles.featuresContainer}>
          <TouchableOpacity style={styles.featureItem}>
            <MaterialIcons name="location-on" size={20} color="#666" />
            <Text style={styles.featureText}>Add location</Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.featureItem}>
            <MaterialIcons name="person-add" size={20} color="#666" />
            <Text style={styles.featureText}>Tag people</Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.featureItem}>
            <MaterialIcons name="music-note" size={20} color="#666" />
            <Text style={styles.featureText}>Add sound</Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  postButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  mediaContainer: {
    width: width,
    height: width * 1.2,
    backgroundColor: '#111',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  captionContainer: {
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
  characterCount: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
  },
  audienceContainer: {
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  audienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audienceTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  audienceModal: {
    marginTop: 16,
  },
  audienceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#111',
  },
  selectedAudienceOption: {
    backgroundColor: '#1a1a2e',
    borderColor: '#00BFFF',
    borderWidth: 1,
  },
  audienceOptionText: {
    flex: 1,
    marginLeft: 12,
  },
  audienceOptionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  selectedAudienceOptionLabel: {
    color: '#00BFFF',
  },
  audienceOptionDescription: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  uploadProgressContainer: {
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  uploadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  uploadProgressText: {
    color: '#00BFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  uploadProgressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#00BFFF',
  },
  featuresContainer: {
    padding: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
    marginLeft: 12,
  },
});