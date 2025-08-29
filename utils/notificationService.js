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

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    try {
      console.log('Attempting to get Expo push token...');
      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId: '49513f8d-d50b-4469-b988-bf9caf4409ae', // Your Expo project ID
      });
      token = tokenResult.data;
      console.log('Successfully received push token:', token);
    } catch (error) {
      console.error('Error getting push token:', error);
      console.error('Error details:', error.message, error.code);
      return null;
    }
  } else {
    console.log('Must use physical device for Push Notifications');
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
    } else {
      console.log('Push token saved successfully for user:', user.id);
      console.log('Token length:', token.length);
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
      await savePushTokenToProfile(token);
      console.log('===== Push notifications initialized successfully =====');
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