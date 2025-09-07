// utils/enhancedNotificationService.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Enhanced push notification registration with better error handling and user feedback
 */
export async function registerForPushNotificationsEnhanced() {
  console.log('🔔 [ENHANCED] Starting push notification registration...');
  
  // Step 1: Device validation
  if (!Device.isDevice) {
    console.log('⚠️  [ENHANCED] Simulator detected - cannot register for push notifications');
    return { success: false, error: 'SIMULATOR', message: 'Push notifications only work on physical devices' };
  }

  console.log('✅ [ENHANCED] Physical device detected');

  // Step 2: Platform-specific setup
  if (Platform.OS === 'android') {
    console.log('📱 [ENHANCED] Setting up Android notification channel...');
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00BFFF',
    });
  }

  // Step 3: Check existing permissions
  console.log('🔐 [ENHANCED] Checking existing notification permissions...');
  let { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('📋 [ENHANCED] Current permission status:', existingStatus);

  // Step 4: Request permissions if needed
  if (existingStatus !== 'granted') {
    console.log('📝 [ENHANCED] Requesting notification permissions...');
    
    const { status: newStatus } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowDisplayInCarPlay: false,
        allowCriticalAlerts: false,
        provideAppNotificationSettings: false,
        allowProvisional: false,
        allowAnnouncements: false,
      },
    });
    
    existingStatus = newStatus;
    console.log('📋 [ENHANCED] Permission request result:', existingStatus);
  }

  // Step 5: Handle permission denial
  if (existingStatus !== 'granted') {
    console.error('❌ [ENHANCED] Push notification permission denied');
    
    const errorMessage = getPermissionDeniedMessage(existingStatus);
    return { 
      success: false, 
      error: 'PERMISSION_DENIED', 
      status: existingStatus,
      message: errorMessage,
      userAction: 'Please enable notifications in your device settings'
    };
  }

  console.log('✅ [ENHANCED] Notification permissions granted');

  // Step 6: Get Expo push token
  console.log('🎫 [ENHANCED] Requesting Expo push token...');
  
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId: '49513f8d-d50b-4469-b988-bf9caf4409ae', // Your Expo project ID
    });

    const token = tokenResult.data;
    
    if (!token) {
      console.error('❌ [ENHANCED] No token received from Expo');
      return { success: false, error: 'NO_TOKEN', message: 'Failed to get push token from Expo' };
    }

    // Step 7: Validate token format
    if (!token.startsWith('ExponentPushToken[')) {
      console.error('❌ [ENHANCED] Invalid token format:', token.substring(0, 25) + '...');
      return { success: false, error: 'INVALID_TOKEN', message: 'Received invalid push token format' };
    }

    console.log('✅ [ENHANCED] Valid push token received:', token.substring(0, 30) + '...');
    
    return { 
      success: true, 
      token: token,
      message: 'Push notification registration successful'
    };

  } catch (error) {
    console.error('💥 [ENHANCED] Exception getting push token:', error);
    
    let errorMessage = 'Unknown error occurred';
    let errorCode = 'UNKNOWN_ERROR';
    
    if (error.code === 'DEVICE_NOT_REGISTERED') {
      errorMessage = 'Device not registered with Apple Push Notification service';
      errorCode = 'DEVICE_NOT_REGISTERED';
    } else if (error.code === 'INVALID_PROJECT_ID') {
      errorMessage = 'Invalid Expo project ID';
      errorCode = 'INVALID_PROJECT_ID';
    } else if (error.message?.includes('network')) {
      errorMessage = 'Network error - check internet connection';
      errorCode = 'NETWORK_ERROR';
    }

    return { 
      success: false, 
      error: errorCode, 
      message: errorMessage,
      originalError: error.message 
    };
  }
}

/**
 * Enhanced push token saving with better error handling
 */
export async function savePushTokenEnhanced(token) {
  if (!token) {
    console.error('❌ [ENHANCED] No token provided to save');
    return { success: false, error: 'NO_TOKEN' };
  }

  try {
    console.log('💾 [ENHANCED] Saving push token to database...');
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ [ENHANCED] No authenticated user:', authError?.message);
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    console.log('👤 [ENHANCED] Saving token for user:', user.email);

    // Check if profile exists
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, username, push_token')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('❌ [ENHANCED] Error fetching profile:', fetchError);
      return { success: false, error: 'PROFILE_FETCH_ERROR', details: fetchError.message };
    }

    console.log('📋 [ENHANCED] Current token status:', profile.push_token ? 'HAS_TOKEN' : 'NO_TOKEN');

    // Update push token
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        push_token: token,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ [ENHANCED] Error updating push token:', updateError);
      return { success: false, error: 'UPDATE_ERROR', details: updateError.message };
    }

    // Verify the save worked
    const { data: verifyProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', user.id)
      .single();

    if (verifyError) {
      console.error('❌ [ENHANCED] Error verifying saved token:', verifyError);
      return { success: false, error: 'VERIFY_ERROR' };
    }

    if (verifyProfile.push_token === token) {
      console.log('✅ [ENHANCED] Push token saved and verified successfully');
      return { success: true, message: 'Push token saved successfully' };
    } else {
      console.error('❌ [ENHANCED] Token verification failed - mismatch');
      return { success: false, error: 'VERIFICATION_FAILED' };
    }

  } catch (error) {
    console.error('💥 [ENHANCED] Exception saving push token:', error);
    return { success: false, error: 'EXCEPTION', details: error.message };
  }
}

/**
 * Complete push notification setup with automatic handling (no user prompts)
 */
export async function setupPushNotificationsWithFeedback(showUserPrompts = false) {
  console.log('🚀 [ENHANCED] Starting complete push notification setup...');
  
  // Step 1: Register for push notifications
  const registrationResult = await registerForPushNotificationsEnhanced();
  
  if (!registrationResult.success) {
    console.error('❌ [ENHANCED] Registration failed:', registrationResult);
    
    // Silently handle failures without user prompts for better UX
    if (registrationResult.error === 'PERMISSION_DENIED') {
      console.log('📱 [ENHANCED] Notifications disabled by user - continuing silently');
    } else if (registrationResult.error === 'SIMULATOR') {
      console.log('📱 [ENHANCED] Running on simulator - notifications not available');
    } else {
      console.log('📱 [ENHANCED] Notification setup failed:', registrationResult.message);
    }
    
    return registrationResult;
  }

  console.log('✅ [ENHANCED] Registration successful, saving token...');

  // Step 2: Save token to database
  const saveResult = await savePushTokenEnhanced(registrationResult.token);
  
  if (!saveResult.success) {
    console.error('❌ [ENHANCED] Token save failed:', saveResult);
    console.log('📱 [ENHANCED] Push notifications enabled but could not save to account');
    return saveResult;
  }

  console.log('🎉 [ENHANCED] Push notification setup completed successfully!');
  
  return { success: true, token: registrationResult.token, message: 'Push notifications enabled successfully' };
}

/**
 * Check current notification setup status
 */
export async function checkNotificationSetupStatus() {
  const result = {
    isPhysicalDevice: Device.isDevice,
    hasPermission: false,
    permissionStatus: null,
    hasTokenInDatabase: false,
    tokenPreview: null,
    overallStatus: 'DISABLED'
  };

  try {
    // Check device
    if (!Device.isDevice) {
      result.overallStatus = 'SIMULATOR';
      return result;
    }

    // Check permissions
    const { status } = await Notifications.getPermissionsAsync();
    result.permissionStatus = status;
    result.hasPermission = status === 'granted';

    if (!result.hasPermission) {
      result.overallStatus = 'NO_PERMISSION';
      return result;
    }

    // Check database token
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', user.id)
        .single();

      if (profile?.push_token) {
        result.hasTokenInDatabase = true;
        result.tokenPreview = profile.push_token.substring(0, 30) + '...';
        result.overallStatus = 'ENABLED';
      } else {
        result.overallStatus = 'MISSING_TOKEN';
      }
    } else {
      result.overallStatus = 'NOT_AUTHENTICATED';
    }

  } catch (error) {
    console.error('Error checking notification status:', error);
    result.overallStatus = 'ERROR';
  }

  return result;
}

function getPermissionDeniedMessage(status) {
  switch (status) {
    case 'denied':
      return 'Notifications were denied. You will not receive push notifications.';
    case 'undetermined':
      return 'Notification permission was not determined. Please try again.';
    default:
      return `Notification permission status: ${status}. Notifications may not work properly.`;
  }
}

// Legacy compatibility
export const initializePushNotifications = setupPushNotificationsWithFeedback;