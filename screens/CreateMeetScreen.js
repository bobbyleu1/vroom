import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { locationService, LOCATION_ERROR_TYPES } from '../utils/locationService';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getIPadStyles } from '../utils/iPadStyles';

const CreateMeetScreen = ({ navigation }) => {
  const { session } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    locationName: '',
    address: '',
    date: new Date(),
    time: new Date(),
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const titleInputRef = useRef();
  const descriptionInputRef = useRef();
  const locationInputRef = useRef();
  const addressInputRef = useRef();
  const iPadStyles = getIPadStyles('#000');

  // Handle form field changes
  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Pick image for flyer
  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to add a flyer.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5], // Good aspect ratio for flyers
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, []);

  // Take photo for flyer
  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  // Show image picker options
  const showImagePicker = () => {
    Alert.alert(
      'Add Flyer',
      'Choose how you want to add a flyer for your meet',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Get current location
  const getCurrentLocation = useCallback(async () => {
    setGettingLocation(true);
    try {
      const location = await locationService.getCurrentLocation();
      setSelectedLocation(location);
      Alert.alert('Success', 'Current location captured! You can still edit the location name and address.');
    } catch (error) {
      console.error('Error getting location:', error);
      
      if (error.message === LOCATION_ERROR_TYPES.PERMISSION_DENIED) {
        Alert.alert(
          'Location Permission Required',
          'Please enable location access to use current location, or enter the location manually.'
        );
      } else {
        Alert.alert('Error', 'Failed to get current location. Please enter location manually.');
      }
    } finally {
      setGettingLocation(false);
    }
  }, []);

  // Upload image to Supabase Storage
  const uploadImage = async (imageUri) => {
    if (!imageUri) return null;

    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const fileExt = imageUri.split('.').pop();
      const fileName = `meet-flyers/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, blob, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('Failed to upload flyer image');
    }
  };

  // Validate form
  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Missing Information', 'Please enter a title for your meet.');
      titleInputRef.current?.focus();
      return false;
    }

    if (!formData.locationName.trim()) {
      Alert.alert('Missing Information', 'Please enter a location name.');
      locationInputRef.current?.focus();
      return false;
    }

    if (!selectedLocation) {
      Alert.alert(
        'Missing Location',
        'Please capture your current location or enter coordinates manually.'
      );
      return false;
    }

    const meetDateTime = new Date(formData.date);
    meetDateTime.setHours(formData.time.getHours());
    meetDateTime.setMinutes(formData.time.getMinutes());
    
    if (meetDateTime <= new Date()) {
      Alert.alert('Invalid Date', 'Please select a future date and time for your meet.');
      return false;
    }

    return true;
  };

  // Create meet
  const createMeet = async () => {
    if (!validateForm()) return;
    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to create a meet.');
      return;
    }

    setLoading(true);
    try {
      // Upload flyer image if selected
      let flyerUrl = null;
      if (selectedImage?.uri) {
        flyerUrl = await uploadImage(selectedImage.uri);
      }

      // Combine date and time
      const meetDateTime = new Date(formData.date);
      meetDateTime.setHours(formData.time.getHours());
      meetDateTime.setMinutes(formData.time.getMinutes());

      // Create meet in database
      const { data, error } = await supabase
        .from('meets')
        .insert({
          user_id: session.user.id,
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          location_name: formData.locationName.trim(),
          address: formData.address.trim() || null,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          flyer_url: flyerUrl,
          date_time: meetDateTime.toISOString(),
          starts_at: meetDateTime.toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert(
        'Success!',
        'Your meet has been created successfully!',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
              // Optionally navigate to the meet detail
              // navigation.navigate('MeetDetail', { meetId: data.id });
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error creating meet:', error);
      Alert.alert('Error', 'Failed to create meet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (date) => {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format time for display
  const formatTime = (time) => {
    return time.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={iPadStyles.container}>
        <View style={iPadStyles.phoneContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.headerButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Meet</Text>
            <TouchableOpacity 
              style={[styles.headerButton, loading && styles.headerButtonDisabled]} 
              onPress={createMeet}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#00BFFF" />
              ) : (
                <Text style={[styles.headerButtonText, styles.headerButtonPrimary]}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.keyboardAvoidingView}
          >
            <ScrollView 
              style={styles.scrollView} 
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Flyer Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Flyer (Optional)</Text>
                <TouchableOpacity style={styles.imagePickerButton} onPress={showImagePicker}>
                  {selectedImage ? (
                    <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="image-outline" size={48} color="#666" />
                      <Text style={styles.imagePlaceholderText}>Add Flyer</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {selectedImage && (
                  <TouchableOpacity 
                    style={styles.removeImageButton} 
                    onPress={() => setSelectedImage(null)}
                  >
                    <Text style={styles.removeImageText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Basic Info Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Basic Information</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meet Title *</Text>
                  <TextInput
                    ref={titleInputRef}
                    style={styles.textInput}
                    value={formData.title}
                    onChangeText={(text) => updateFormData('title', text)}
                    placeholder="Enter meet title..."
                    placeholderTextColor="#666"
                    maxLength={100}
                    returnKeyType="next"
                    onSubmitEditing={() => descriptionInputRef.current?.focus()}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    ref={descriptionInputRef}
                    style={[styles.textInput, styles.multilineInput]}
                    value={formData.description}
                    onChangeText={(text) => updateFormData('description', text)}
                    placeholder="Describe your meet..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    returnKeyType="next"
                    onSubmitEditing={() => locationInputRef.current?.focus()}
                  />
                </View>
              </View>

              {/* Location Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Location</Text>
                
                <TouchableOpacity 
                  style={styles.locationButton} 
                  onPress={getCurrentLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color="#00BFFF" />
                  ) : (
                    <Ionicons name="location-outline" size={20} color="#00BFFF" />
                  )}
                  <Text style={styles.locationButtonText}>
                    {gettingLocation ? 'Getting location...' : 'Use Current Location'}
                  </Text>
                  {selectedLocation && <Ionicons name="checkmark" size={20} color="#4CAF50" />}
                </TouchableOpacity>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Location Name *</Text>
                  <TextInput
                    ref={locationInputRef}
                    style={styles.textInput}
                    value={formData.locationName}
                    onChangeText={(text) => updateFormData('locationName', text)}
                    placeholder="e.g., Central Park, Coffee Shop..."
                    placeholderTextColor="#666"
                    maxLength={100}
                    returnKeyType="next"
                    onSubmitEditing={() => addressInputRef.current?.focus()}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Address (Optional)</Text>
                  <TextInput
                    ref={addressInputRef}
                    style={styles.textInput}
                    value={formData.address}
                    onChangeText={(text) => updateFormData('address', text)}
                    placeholder="Full address..."
                    placeholderTextColor="#666"
                    maxLength={200}
                    returnKeyType="done"
                  />
                </View>

                {selectedLocation && (
                  <View style={styles.coordsDisplay}>
                    <Text style={styles.coordsText}>
                      📍 {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Date & Time Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Date & Time</Text>
                
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity 
                    style={[styles.dateTimeButton, styles.dateButton]} 
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#00BFFF" />
                    <View style={styles.dateTimeTextContainer}>
                      <Text style={styles.dateTimeLabel}>Date</Text>
                      <Text style={styles.dateTimeValue}>{formatDate(formData.date)}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.dateTimeButton, styles.timeButton]} 
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Ionicons name="time-outline" size={20} color="#00BFFF" />
                    <View style={styles.dateTimeTextContainer}>
                      <Text style={styles.dateTimeLabel}>Time</Text>
                      <Text style={styles.dateTimeValue}>{formatTime(formData.time)}</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <DateTimePicker
                    value={formData.date}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate) {
                        updateFormData('date', selectedDate);
                      }
                    }}
                  />
                )}

                {showTimePicker && (
                  <DateTimePicker
                    value={formData.time}
                    mode="time"
                    display="default"
                    onChange={(event, selectedTime) => {
                      setShowTimePicker(false);
                      if (selectedTime) {
                        updateFormData('time', selectedTime);
                      }
                    }}
                  />
                )}
              </View>

              {/* Create Button */}
              <TouchableOpacity 
                style={[styles.createButton, loading && styles.createButtonDisabled]} 
                onPress={createMeet}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color="#FFF" />
                    <Text style={styles.createButtonText}>Create Meet</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#FFF',
  },
  headerButtonPrimary: {
    color: '#00BFFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
    textAlign: 'center',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  imagePickerButton: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  selectedImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  imagePlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: '#666',
    fontSize: 16,
    marginTop: 8,
  },
  removeImageButton: {
    alignSelf: 'center',
    marginTop: 8,
  },
  removeImageText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 8,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#00BFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  locationButtonText: {
    fontSize: 16,
    color: '#00BFFF',
    marginLeft: 8,
    flex: 1,
  },
  coordsDisplay: {
    backgroundColor: '#1C1C1E',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  coordsText: {
    fontSize: 12,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateButton: {
    flex: 1.5,
  },
  timeButton: {
    flex: 1,
  },
  dateTimeTextContainer: {
    marginLeft: 8,
    flex: 1,
  },
  dateTimeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BFFF',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginLeft: 8,
  },
});

export default CreateMeetScreen;