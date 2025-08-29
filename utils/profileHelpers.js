// utils/profileHelpers.js
import { supabase } from './supabase';

/**
 * Get profile picture URL with fallback to default image
 * @param {string|null} avatarUrl - The user's avatar URL from database
 * @returns {any} - Image source object for React Native Image component
 */
export function getProfileImageSource(avatarUrl) {
  if (avatarUrl && avatarUrl.trim() !== '' && !avatarUrl.includes('undefined') && !avatarUrl.includes('null')) {
    try {
      // Only add cache buster if it's a valid URL and not causing errors
      return { uri: avatarUrl };
    } catch (error) {
      console.log('Invalid avatar URL, using default:', avatarUrl);
      return require('../assets/default-profile.png');
    }
  }
  
  // Return local default image for users without profile pictures
  return require('../assets/default-profile.png');
}

/**
 * Upload default profile picture to Supabase storage and return public URL
 * This is used when we need to store the default image in the database
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Public URL of the uploaded default image
 */
export async function uploadDefaultProfilePicture(userId) {
  try {
    const { Asset } = require('expo-asset');
    const FileSystem = require('expo-file-system');
    
    // Load the default image asset
    const defaultImageAsset = Asset.fromModule(require('../assets/default-profile.png'));
    await defaultImageAsset.downloadAsync();
    
    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(defaultImageAsset.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Convert to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const fileName = `${userId}/default-profile.png`;
    
    // Upload to Supabase storage
    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('avatars')
      .upload(fileName, bytes.buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });
      
    if (uploadError) {
      console.error('Default profile picture upload error:', uploadError);
      throw new Error(`Failed to upload default profile picture: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    return data.publicUrl;
    
  } catch (error) {
    console.error('Error uploading default profile picture:', error);
    throw error;
  }
}

/**
 * Initialize new user profile with default profile picture
 * @param {string} userId - User ID
 * @param {string} email - User email (optional, for username generation)
 * @returns {Promise<object>} - Created profile data
 */
export async function initializeUserProfile(userId, email = '') {
  try {
    console.log('Initializing profile for user:', userId);
    
    // Upload default profile picture and get URL
    const defaultAvatarUrl = await uploadDefaultProfilePicture(userId);
    
    // Generate username from email or use default
    let username = email ? email.split('@')[0] : 'user';
    username = username.replace(/[^a-zA-Z0-9]/g, ''); // Remove special characters
    
    // Make sure username is unique by appending random number if needed
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single();
      
    if (existingUser) {
      username = `${username}${Math.floor(Math.random() * 1000)}`;
    }
    
    // Create profile with default data
    const profileData = {
      id: userId,
      username: username,
      bio: null,
      location: null,
      website_link: null,
      avatar_url: defaultAvatarUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profileData)
      .select()
      .single();
      
    if (error) {
      console.error('Profile creation error:', error);
      throw new Error(`Failed to create profile: ${error.message}`);
    }
    
    console.log('Profile initialized successfully:', data);
    return data;
    
  } catch (error) {
    console.error('Error initializing user profile:', error);
    throw error;
  }
}

/**
 * Check if user has a profile, create one if they don't
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<object>} - User profile data
 */
export async function ensureUserProfile(userId, email = '') {
  try {
    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') {
      // Error other than "not found"
      console.error('Error fetching profile:', fetchError);
      throw fetchError;
    }
    
    if (existingProfile) {
      console.log('Profile already exists:', existingProfile);
      return existingProfile;
    }
    
    // Profile doesn't exist, create it
    console.log('Profile not found, creating new profile...');
    return await initializeUserProfile(userId, email);
    
  } catch (error) {
    console.error('Error ensuring user profile:', error);
    throw error;
  }
}