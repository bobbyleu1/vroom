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
} from 'react-native';
import { Camera, CameraType } from 'expo-camera'; // Ensure CameraType is imported here
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Video } from 'expo-av'; // Keep this for now, but note deprecation below

const { width, height } = Dimensions.get('window');

export default function UploadScreen() {
  const cameraRef = useRef(null);
  const [cameraPermission, setCameraPermission] = useState(null);
  const [mediaLibraryPermission, setMediaLibraryPermission] = useState(null);
  // The error "Cannot read property 'back' of undefined" on this line (or similar)
  // indicates that CameraType.back is not defined. This is NOT a JS logic error
  // but a native module linking issue with expo-camera.
  const [facing, setFacing] = useState(CameraType.back);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Request Camera permissions
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      setCameraPermission(cameraStatus === 'granted');

      // Request Media Library permissions
      const { status: mediaLibraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setMediaLibraryPermission(mediaLibraryStatus === 'granted');
    })();
  }, []);

  const toggleCameraFacing = () => {
    setFacing(current => (current === CameraType.back ? CameraType.front : CameraType.back));
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      setLoading(true);
      try {
        const photo = await cameraRef.current.takePictureAsync();
        setImageUri(photo.uri);
        setVideoUri(null); // Clear video if taking picture
      } catch (error) {
        console.error('Error taking picture:', error);
        Alert.alert('Error', 'Failed to take picture.');
      } finally {
        setLoading(false);
      }
    }
  };

  const startRecording = async () => {
    if (cameraRef.current) {
      setIsRecording(true);
      setLoading(true); // Indicate loading while recording is active
      try {
        const video = await cameraRef.current.recordAsync({
          maxDuration: 60, // Example: max 60 seconds
          quality: Camera.Constants.VideoQuality['720p'], // Example: 720p quality
        });
        setVideoUri(video.uri);
        setImageUri(null); // Clear image if recording video
      } catch (error) {
        console.error('Error starting recording:', error);
        Alert.alert('Error', 'Failed to start recording.');
      } finally {
        setIsRecording(false); // Ensure recording state is reset
        setLoading(false); // Stop loading after recording is done
      }
    }
  };

  const stopRecording = () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    }
  };

  const pickMedia = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // Allow both images and videos
      allowsEditing: false, // Set to false unless you specifically need an editing UI
      quality: 0.7,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const type = result.assets[0].mediaType; // 'image' or 'video'

      if (type === 'image') {
        setImageUri(uri);
        setVideoUri(null);
      } else if (type === 'video') {
        setVideoUri(uri);
        setImageUri(null);
      }
    }
  };

  const uploadMediaToSupabase = async (uri, fileType) => {
    if (!uri) return null;

    setLoading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExtension = uri.split('.').pop().toLowerCase();
      const fileName = `posts/${uuidv4()}.${fileExtension}`; // Store in 'posts' bucket

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
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!imageUri && !videoUri) {
      Alert.alert('No Media', 'Please select an image or video to post.');
      return;
    }

    setLoading(true);
    let publicUrl = null;
    let postType = null;

    if (imageUri) {
      publicUrl = await uploadMediaToSupabase(imageUri, 'image');
      postType = 'image';
    } else if (videoUri) {
      publicUrl = await uploadMediaToSupabase(videoUri, 'video');
      postType = 'video';
    }

    if (!publicUrl) {
      setLoading(false);
      return; // Upload failed, error already alerted by uploadMediaToSupabase
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Authentication Error', 'You must be logged in to create a post.');
        setLoading(false);
        return;
      }

      // Ensure 'group_posts' table and schema match your Supabase project
      const { error } = await supabase
        .from('group_posts') // Adjust table name as per your schema
        .insert([
          {
            author_id: user.id,
            post_type: postType,
            media_url: publicUrl,
          },
        ]);

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Post uploaded successfully!');
      setImageUri(null);
      setVideoUri(null);
    } catch (error) {
      console.error('Error creating post in DB:', error.message);
      Alert.alert('Post Error', 'Failed to create post in database: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (cameraPermission === null || mediaLibraryPermission === null) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#00BFFF" /></View>;
  }
  if (!cameraPermission || !mediaLibraryPermission) {
    return (
      <View style={styles.permissionDeniedContainer}>
        <Text style={styles.permissionDeniedText}>
          Camera and Media Library permissions are required to use this feature.
          Please enable them in your device settings.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(imageUri || videoUri) ? (
        <View style={styles.mediaPreviewContainer}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.mediaPreview} />}
          {videoUri && (
            <Video
              source={{ uri: videoUri }}
              style={styles.mediaPreview}
              useNativeControls
              resizeMode="contain"
              isLooping
            />
          )}
          <TouchableOpacity style={styles.retakeButton} onPress={() => { setImageUri(null); setVideoUri(null); }}>
            <Ionicons name="close-circle" size={30} color="white" />
          </TouchableOpacity>
        </View>
      ) : (
        <Camera style={styles.camera} type={facing} ref={cameraRef}>
          <View style={styles.buttonContainer}>
            <View style={styles.cameraTopControls}>
              <TouchableOpacity onPress={toggleCameraFacing}>
                <Ionicons name="camera-reverse-outline" size={30} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('More Options', 'Coming soon!')}>
                <Feather name="settings" size={30} color="white" />
              </TouchableOpacity>
            </View>

            <View style={styles.cameraBottomControls}>
              <TouchableOpacity style={styles.galleryButton} onPress={pickMedia}>
                <Ionicons name="image-outline" size={30} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
                onLongPress={startRecording}
                onPressOut={stopRecording}
                delayLongPress={200}
              >
                <View style={[styles.captureInnerButton, isRecording && styles.recordingButton]} />
              </TouchableOpacity>

              <View style={{ width: 50 }} />
            </View>
          </View>
        </Camera>
      )}

      {(imageUri || videoUri) && (
        <TouchableOpacity
          style={styles.postButton}
          onPress={handlePost}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  permissionDeniedText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cameraTopControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
  },
  cameraBottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInnerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'red',
  },
  recordingButton: {
    backgroundColor: 'red',
    borderRadius: 5,
  },
  galleryButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
  },
  mediaPreviewContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  retakeButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 60,
    right: 20,
    zIndex: 1,
  },
  postButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    backgroundColor: '#00BFFF',
    paddingVertical: 15,
    paddingHorizontal: 50,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});