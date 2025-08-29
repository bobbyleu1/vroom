import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  Animated,
  StatusBar,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MAX_VIDEO_DURATION_S } from '../config/media';

const { width, height } = Dimensions.get('window');

export default function CameraScreen() {
  const navigation = useNavigation();
  const cameraRef = useRef(null);
  const recordingRef = useRef(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off');
  const [isRecording, setIsRecording] = useState(false);
  const [lastMedia, setLastMedia] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const recordButtonScale = useRef(new Animated.Value(1)).current;
  const recordingTimerInterval = useRef(null);

  useEffect(() => {
    loadLastMedia();
    return () => {
      if (recordingTimerInterval.current) {
        clearInterval(recordingTimerInterval.current);
      }
    };
  }, []);

  const loadLastMedia = async () => {
    try {
      if (mediaLibraryPermission?.granted) {
        const { assets } = await MediaLibrary.getAssetsAsync({
          first: 1,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        if (assets.length > 0) {
          setLastMedia(assets[0]);
        }
      }
    } catch (error) {
      console.warn('Failed to load last media:', error.message);
    }
  };

  const requestPermissions = async () => {
    const cameraResult = await requestPermission();
    const mediaResult = await requestMediaLibraryPermission();
    
    if (!cameraResult.granted) {
      Alert.alert(
        'Camera Permission Required',
        'This app needs camera access to take photos and videos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    return true;
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash(current => {
      switch (current) {
        case 'off': return 'on';
        case 'on': return 'auto';
        case 'auto': return 'off';
        default: return 'off';
      }
    });
  };

  const getFlashIcon = () => {
    switch (flash) {
      case 'on': return 'flash';
      case 'auto': return 'flash-auto';
      case 'off': return 'flash-off';
      default: return 'flash-off';
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
        format: 'jpeg',
      });

      if (mediaLibraryPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(photo.uri);
        setLastMedia({ uri: photo.uri, mediaType: 'photo' });
      }

      navigation.navigate('PostPreview', {
        mediaUri: photo.uri,
        mediaType: 'photo',
        source: 'camera',
      });
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      setIsRecording(true);
      setRecordingTime(0);
      
      Animated.spring(recordButtonScale, {
        toValue: 1.3,
        useNativeDriver: true,
      }).start();

      recordingTimerInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      recordingRef.current = await cameraRef.current.recordAsync({
        quality: '1080p',
        maxDuration: MAX_VIDEO_DURATION_S,
      });

      if (recordingRef.current && !recordingRef.current.cancelled) {
        if (mediaLibraryPermission?.granted) {
          await MediaLibrary.saveToLibraryAsync(recordingRef.current.uri);
          setLastMedia({ uri: recordingRef.current.uri, mediaType: 'video' });
        }

        navigation.navigate('PostPreview', {
          mediaUri: recordingRef.current.uri,
          mediaType: 'video',
          source: 'camera',
        });
      }
    } catch (error) {
      console.error('Error recording video:', error);
      if (error.message?.includes('simulator')) {
        Alert.alert(
          'Simulator Limitation', 
          'Video recording is not supported in the iOS Simulator. Please test on a physical device or use gallery upload.'
        );
      } else {
        Alert.alert('Error', 'Failed to record video. Please try again.');
      }
    } finally {
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;

    setIsRecording(false);
    setRecordingTime(0);

    Animated.spring(recordButtonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    if (recordingTimerInterval.current) {
      clearInterval(recordingTimerInterval.current);
      recordingTimerInterval.current = null;
    }

    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  };

  const openGallery = async () => {
    try {
      // Request media library permissions first
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to select images and videos.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false,
        videoMaxDuration: MAX_VIDEO_DURATION_S,
        // Add these options to handle iOS issues
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Current,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle?.PageSheet,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        
        // Better type detection
        let mediaType = 'photo';
        if (asset.type === 'video' || asset.uri.match(/\.(mp4|mov|avi|mkv)$/i)) {
          mediaType = 'video';
        }
        
        navigation.navigate('PostPreview', {
          mediaUri: asset.uri,
          mediaType: mediaType,
          source: 'gallery',
        });
      }
    } catch (error) {
      console.error('Error opening gallery:', error);
      
      // Better error handling for iOS simulator issues
      if (error.message?.includes('Cannot load representation') || 
          error.message?.includes('public.png') ||
          error.message?.includes('PHAssetExportRequestErrorDomain')) {
        Alert.alert(
          'Simulator Limitation', 
          'Image selection may not work properly in the iOS Simulator. Please try using a physical device or test with camera capture instead.'
        );
      } else {
        Alert.alert('Error', 'Failed to open gallery. Please try again.');
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Requesting camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={80} color="#666" />
        <Text style={styles.permissionText}>Camera access is required</Text>
        <Text style={styles.permissionSubtext}>
          We need your permission to use the camera to take photos and videos
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        mode="video"
        mirror={false}
        videoQuality="1080p"
        videoBitrate={Platform.OS === 'ios' ? 8_000_000 : undefined}
        videoStabilizationMode="standard"
      />
      
      {/* Header Controls - Using absolute positioning */}
      <View 
        style={[
          styles.headerContainer,
          isRecording && { opacity: 0.3 }
        ]}
        pointerEvents={isRecording ? 'none' : 'auto'}
      >
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          {isRecording && (
            <>
              <View style={styles.recordingIndicator} />
              <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
            </>
          )}
        </View>
        
        <TouchableOpacity style={styles.headerButton} onPress={toggleFlash}>
          <Ionicons name={getFlashIcon()} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom Controls - Using absolute positioning */}
      <View style={styles.bottomContainer}>
        {/* Gallery Button */}
        <View 
          style={[
            styles.galleryButton,
            isRecording && { opacity: 0.3 }
          ]}
          pointerEvents={isRecording ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.galleryButtonInner} onPress={openGallery}>
            {lastMedia?.uri ? (
              <Image source={{ uri: lastMedia.uri }} style={styles.galleryThumbnail} />
            ) : (
              <Ionicons name="images" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Record/Capture Button */}
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity
            style={styles.captureButtonOuter}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            onPress={takePicture}
            delayLongPress={200}
          >
            <Animated.View
              style={[
                styles.captureButtonInner,
                {
                  transform: [{ scale: recordButtonScale }],
                  backgroundColor: isRecording ? '#FF0000' : '#fff',
                },
              ]}
            />
          </TouchableOpacity>
          <Text style={styles.captureHint}>
            {isRecording ? 'Recording...' : 'Tap for photo, hold for video'}
          </Text>
        </View>

        {/* Flip Camera Button */}
        <View 
          style={[
            styles.flipButton,
            isRecording && { opacity: 0.3 }
          ]}
          pointerEvents={isRecording ? 'none' : 'auto'}
        >
          <TouchableOpacity style={styles.flipButtonInner} onPress={toggleCameraFacing}>
            <MaterialIcons name="flip-camera-ios" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
  },
  permissionSubtext: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 30,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF0000',
    marginRight: 8,
  },
  recordingTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 30,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
  },
  galleryButton: {
    width: 50,
    height: 50,
    marginBottom: 20,
  },
  galleryButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  galleryThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  captureButtonContainer: {
    alignItems: 'center',
  },
  captureButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  captureHint: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  flipButton: {
    width: 50,
    height: 50,
    marginBottom: 20,
  },
  flipButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});