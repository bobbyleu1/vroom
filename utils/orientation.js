import { Platform } from 'react-native';

export function lockPortraitIphoneOnly() {
  try {
    // Dynamically import orientation locker to handle cases where native module isn't available
    const Orientation = require('react-native-orientation-locker');
    
    // Always lock portrait
    Orientation.lockToPortrait();

    // If the device is an iPad, we still want iPhone-like behavior (already enforced natively).
    // This call is mainly a runtime safety net.
    if (Platform.OS === 'ios') {
      Orientation.lockToPortrait();
    }
    
    console.log('Orientation locked to portrait successfully');
  } catch (error) {
    console.warn('Failed to lock orientation:', error.message);
    // This is mainly a safety net - the native iOS configuration should handle orientation
  }
}