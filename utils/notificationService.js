import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register for push notifications and get the push token
 */
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Enhanced device and permission checking
  console.log('Device.isDevice:', Device.isDevice);
  console.log('Platform.OS:', Platform.OS);
  
  if (Device.isDevice) {
    console.log('Physical device detected - proceeding with push token registration...');
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      console.log('Requesting push notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync({
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
      finalStatus = status;
      console.log('Permission request result:', finalStatus);
    }
    
    if (finalStatus !== 'granted') {
      console.error('Push notification permission denied by user');
      console.error('Final status:', finalStatus);
      return null;
    }
    
    console.log('Push notification permissions granted - getting token...');
    
    try {
      console.log('Attempting to get Expo push token...');
      console.log('Project ID:', '49513f8d-d50b-4469-b988-bf9caf4409ae');
      
      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId: '49513f8d-d50b-4469-b988-bf9caf4409ae',
      });
      
      token = tokenResult.data;
      console.log('✅ Successfully received push token:', token);
      console.log('Token length:', token?.length);
      console.log('Token starts with:', token?.substring(0, 20) + '...');
      
      // Verify token format
      if (!token || !token.startsWith('ExponentPushToken[')) {
        console.error('❌ Invalid token format received:', token);
        return null;
      }
      
    } catch (error) {
      console.error('❌ Error getting push token:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error stack:', error.stack);
      
      // Provide specific guidance based on error
      if (error.code === 'DEVICE_NOT_REGISTERED') {
        console.error('📱 Device not registered with APNs - this can happen in TestFlight');
      } else if (error.code === 'INVALID_PROJECT_ID') {
        console.error('🚫 Invalid Expo project ID');
      }
      
      return null;
    }
  } else {
    console.log('⚠️  Must use physical device for Push Notifications (currently on simulator)');
    console.log('Environment:', __DEV__ ? 'Development' : 'Production');
    return null;
  }

  return token;
}

/**
 * Save the push token to the user's profile in Supabase
 */
export async function savePushTokenToProfile(token) {
  if (!token) {
    console.log('No push token to save');
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('No authenticated user found');
      return;
    }

    console.log('Saving push token for user:', user.id);
    console.log('Token to save:', token);

    // First, check if the profile exists
    console.log('Checking if profile exists...');
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, push_token')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('Error fetching user profile:', fetchError);
      console.error('Fetch error details:', fetchError.message, fetchError.code, fetchError.hint);
      return;
    }

    console.log('Profile found:', profile?.id, 'Previous token:', profile?.push_token ? 'exists' : 'none');

    // Update the push token
    console.log('Updating push token...');
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id);

    if (error) {
      console.error('Error saving push token:', error);
      console.error('Save error details:', error.message, error.code, error.hint);
      // If push_token column doesn't exist, log specific error
      if (error.code === '42703') {
        console.error('CRITICAL: push_token column does not exist in profiles table!');
        console.error('Please run: ALTER TABLE profiles ADD COLUMN push_token TEXT;');
      }
      return false;
    } else {
      console.log('✅ Push token saved successfully for user:', user.id);
      console.log('Token length:', token.length);
      
      // Verify the token was actually saved by reading it back
      console.log('🔍 Verifying token was saved correctly...');
      try {
        const { data: verifyProfile, error: verifyError } = await supabase
          .from('profiles')
          .select('push_token')
          .eq('id', user.id)
          .single();
          
        if (verifyError) {
          console.error('❌ Error verifying saved token:', verifyError);
          return false;
        }
        
        if (verifyProfile?.push_token === token) {
          console.log('✅ Token verification successful - token matches in database');
          return true;
        } else {
          console.error('❌ Token verification failed - database token does not match');
          console.error('Expected:', token);
          console.error('Found:', verifyProfile?.push_token);
          return false;
        }
      } catch (verifyException) {
        console.error('❌ Exception during token verification:', verifyException);
        return false;
      }
    }
  } catch (error) {
    console.error('Exception saving push token:', error);
  }
}

/**
 * Initialize push notifications for the current user
 */
export async function initializePushNotifications() {
  try {
    console.log('===== Starting push notification initialization =====');
    console.log('Device check - Is device?', Device.isDevice);
    console.log('Platform:', Platform.OS);
    
    const token = await registerForPushNotificationsAsync();
    if (token) {
      console.log('Push token received, saving to profile...');
      const saveSuccess = await savePushTokenToProfile(token);
      if (saveSuccess) {
        console.log('===== Push notifications initialized successfully =====');
        return token;
      } else {
        console.log('===== Push token received but failed to save to database =====');
        return null;
      }
    } else {
      console.log('===== No push token received, initialization failed =====');
    }
    return token;
  } catch (error) {
    console.error('===== Error initializing push notifications =====:', error);
    console.error('Error stack:', error.stack);
    // Don't throw - just log and continue
    return null;
  }
}

/**
 * Send a push notification to a user (this would typically be called from your backend/Supabase functions)
 */
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('Push notification sent:', result);
    return result;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return null;
  }
}