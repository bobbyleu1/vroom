import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';
import { getSystemVersion } from 'react-native';

export const LOCATION_ACCURACY = {
  LOW: Location.Accuracy.Low,
  BALANCED: Location.Accuracy.Balanced,
  HIGH: Location.Accuracy.High,
  HIGHEST: Location.Accuracy.Highest,
  BEST_FOR_NAVIGATION: Location.Accuracy.BestForNavigation,
};

export const LOCATION_ERROR_TYPES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

class LocationService {
  constructor() {
    this.currentLocation = null;
    this.watchingLocation = false;
    this.locationSubscription = null;
    this.isIOS18OrLater = this.detectIOS18();
  }

  /**
   * Detect if running on problematic iOS versions (18.0-18.6.x)
   */
  detectIOS18() {
    if (Platform.OS !== 'ios') return false;
    
    try {
      const version = getSystemVersion();
      const [major, minor] = version.split('.').map(v => parseInt(v));
      console.log(`[LOCATION] Detected iOS version: ${version}, major: ${major}, minor: ${minor}`);
      
      // Disable on all iOS 18.x versions for safety
      // Expo Location has compatibility issues across iOS 18
      if (major === 18) {
        console.log(`[LOCATION] Detected iOS 18.${minor} - location will be disabled for safety`);
        return true;
      }
      
      return false; // Allow location on other versions
    } catch (error) {
      console.error('[LOCATION] Error detecting iOS version:', error);
      // If we can't detect, be cautious but not completely restrictive
      return false; // Allow location by default
    }
  }

  /**
   * Check current location permission status with iOS 18 complete bypass
   */
  async checkPermissionStatus() {
    // Complete bypass for iOS 18
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - bypassing permission check');
      return { granted: false, canAskAgain: false, denied: true, status: 'denied' };
    }

    try {
      // Add timeout to prevent hanging on other iOS versions
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Permission check timeout')), 5000);
      });

      const permissionPromise = Location.getForegroundPermissionsAsync();
      const { status } = await Promise.race([permissionPromise, timeoutPromise]);
      
      return {
        granted: status === 'granted',
        canAskAgain: status === 'undetermined',
        denied: status === 'denied',
        status
      };
    } catch (error) {
      console.error('Error checking location permission:', error);
      return { granted: false, canAskAgain: false, denied: true, status: 'denied' };
    }
  }

  /**
   * Request location permission with iOS 18 complete bypass
   */
  async requestPermission() {
    // Complete bypass for iOS 18
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - bypassing permission request');
      throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
    }
    try {
      // First check current status with timeout
      let existingStatus;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Permission check timeout')), 5000);
        });
        const permissionPromise = Location.getForegroundPermissionsAsync();
        const result = await Promise.race([permissionPromise, timeoutPromise]);
        existingStatus = result.status;
      } catch (checkError) {
        console.warn('Permission check failed, assuming undetermined:', checkError);
        existingStatus = 'undetermined';
      }
      
      if (existingStatus === 'granted') {
        return { granted: true, status: existingStatus };
      }

      if (existingStatus === 'denied') {
        // Permission was previously denied, show settings alert
        return this.showSettingsAlert();
      }

      // Request permission for the first time with timeout
      let status;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Permission request timeout')), 10000);
        });
        const requestPromise = Location.requestForegroundPermissionsAsync();
        const result = await Promise.race([requestPromise, timeoutPromise]);
        status = result.status;
      } catch (requestError) {
        console.error('Permission request failed:', requestError);
        // If request fails on iOS 18, try to gracefully handle
        throw new Error('Location permission request failed. Please enable location access in Settings.');
      }
      
      if (status === 'granted') {
        return { granted: true, status };
      } else if (status === 'denied') {
        // User just denied permission, show settings alert
        return this.showSettingsAlert();
      }

      return { granted: false, status };
    } catch (error) {
      console.error('Error requesting location permission:', error);
      throw error;
    }
  }

  /**
   * Show alert to request location permission or go to settings
   */
  showSettingsAlert() {
    return new Promise((resolve) => {
      Alert.alert(
        'Location Access Required',
        'To find meets near you, please allow location access.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve({ granted: false, status: 'denied' }),
          },
          {
            text: 'Allow',
            onPress: async () => {
              try {
                // First try to request permission again
                const { status } = await Location.requestForegroundPermissionsAsync();
                
                if (status === 'granted') {
                  resolve({ granted: true, status });
                } else if (status === 'denied') {
                  // If still denied, then go to settings
                  Alert.alert(
                    'Location Permission Required',
                    'Location access is required to find nearby meets. Please enable it in Settings.',
                    [
                      {
                        text: 'Not Now',
                        style: 'cancel',
                        onPress: () => resolve({ granted: false, status: 'denied' }),
                      },
                      {
                        text: 'Open Settings',
                        onPress: async () => {
                          try {
                            await Linking.openSettings();
                            // After user returns from settings, check permission again
                            setTimeout(async () => {
                              const result = await this.checkPermissionStatus();
                              resolve(result);
                            }, 1000);
                          } catch (error) {
                            console.error('Error opening settings:', error);
                            resolve({ granted: false, status: 'denied' });
                          }
                        },
                      },
                    ]
                  );
                } else {
                  resolve({ granted: false, status });
                }
              } catch (error) {
                console.error('Error requesting permission:', error);
                resolve({ granted: false, status: 'denied' });
              }
            },
          },
        ],
        { cancelable: false }
      );
    });
  }

  /**
   * Get current location with iOS 18 complete bypass
   */
  async getCurrentLocation(options = {}) {
    // Complete bypass for iOS 18 - immediately throw error
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - bypassing location access completely');
      throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
    }
    const {
      accuracy = LOCATION_ACCURACY.BALANCED,
      timeout = 15000,
      maxAge = 60000, // 1 minute
    } = options;

    try {
      // Check permission first with timeout protection
      const permission = await this.checkPermissionStatus();
      if (!permission.granted) {
        const requestResult = await this.requestPermission();
        if (!requestResult.granted) {
          throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
        }
      }

      // Check if location services are enabled with timeout
      let enabled = true;
      try {
        const serviceTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Service check timeout')), 3000);
        });
        const servicePromise = Location.hasServicesEnabledAsync();
        enabled = await Promise.race([servicePromise, serviceTimeoutPromise]);
      } catch (serviceError) {
        console.warn('Location services check failed, assuming enabled:', serviceError);
      }

      if (!enabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to find nearby meets.',
          [{ text: 'OK' }]
        );
        throw new Error(LOCATION_ERROR_TYPES.LOCATION_UNAVAILABLE);
      }

      // Get current location with timeout protection
      const locationTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Location fetch timeout')), timeout + 2000);
      });
      
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy,
        maximumAge: maxAge,
        timeout: Math.min(timeout, 10000), // Cap at 10 seconds to prevent hangs
      });

      const location = await Promise.race([locationPromise, locationTimeoutPromise]);

      this.currentLocation = location;
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      
      if (error.code === 'E_LOCATION_TIMEOUT' || error.message.includes('timeout')) {
        throw new Error(LOCATION_ERROR_TYPES.TIMEOUT);
      } else if (error.code === 'E_LOCATION_UNAVAILABLE') {
        throw new Error(LOCATION_ERROR_TYPES.LOCATION_UNAVAILABLE);
      } else if (error.message === LOCATION_ERROR_TYPES.PERMISSION_DENIED) {
        throw error;
      } else if (error.message.includes('permission')) {
        throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
      } else {
        throw new Error(LOCATION_ERROR_TYPES.NETWORK_ERROR);
      }
    }
  }

  /**
   * Start watching location changes
   */
  async startWatchingLocation(callback, options = {}) {
    const {
      accuracy = LOCATION_ACCURACY.BALANCED,
      distanceInterval = 100, // meters
      timeInterval = 30000, // 30 seconds
    } = options;

    try {
      if (this.watchingLocation) {
        await this.stopWatchingLocation();
      }

      // Check permission
      const permission = await this.checkPermissionStatus();
      if (!permission.granted) {
        const requestResult = await this.requestPermission();
        if (!requestResult.granted) {
          throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
        }
      }

      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval,
          timeInterval,
        },
        (location) => {
          this.currentLocation = location;
          if (callback) {
            callback({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              timestamp: location.timestamp,
            });
          }
        }
      );

      this.watchingLocation = true;
      return this.locationSubscription;
    } catch (error) {
      console.error('Error starting location watch:', error);
      throw error;
    }
  }

  /**
   * Stop watching location changes
   */
  async stopWatchingLocation() {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.watchingLocation = false;
  }

  /**
   * Calculate distance between two coordinates (in km)
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Format distance for display
   */
  static formatDistance(distanceKm) {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    } else if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)}km`;
    } else {
      return `${Math.round(distanceKm)}km`;
    }
  }

  /**
   * Get location with fallback - iOS 18 complete bypass
   */
  async getLocationWithFallback() {
    // Complete bypass for iOS 18
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - bypassing fallback location access');
      throw new Error(LOCATION_ERROR_TYPES.PERMISSION_DENIED);
    }
    try {
      return await this.getCurrentLocation();
    } catch (error) {
      console.warn('Failed to get current location, trying last known location:', error);
      
      try {
        // Try last known location with timeout protection
        const fallbackTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Fallback location timeout')), 5000);
        });
        
        const lastLocationPromise = Location.getLastKnownPositionAsync({
          maxAge: 300000, // 5 minutes
        });
        
        const lastKnownLocation = await Promise.race([lastLocationPromise, fallbackTimeoutPromise]);
        
        if (lastKnownLocation) {
          return {
            latitude: lastKnownLocation.coords.latitude,
            longitude: lastKnownLocation.coords.longitude,
            accuracy: lastKnownLocation.coords.accuracy,
            timestamp: lastKnownLocation.timestamp,
          };
        }
      } catch (fallbackError) {
        console.error('Failed to get last known location:', fallbackError);
      }
      
      // If all location methods fail, throw the original error
      throw error;
    }
  }

  /**
   * Safe location check - iOS 18 complete bypass
   */
  async safeLocationCheck() {
    // Complete bypass for iOS 18
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - returning false for safe check');
      return false;
    }
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Safe check timeout')), 3000);
      });
      
      const checkPromise = this.checkPermissionStatus();
      const result = await Promise.race([checkPromise, timeoutPromise]);
      
      return result.granted;
    } catch (error) {
      console.warn('Safe location check failed, assuming no permission:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopWatchingLocation();
    this.currentLocation = null;
  }
}

// Export singleton instance
export const locationService = new LocationService();

// Export location utilities
export const LocationUtils = {
  calculateDistance: LocationService.calculateDistance,
  formatDistance: LocationService.formatDistance,
  toRadians: LocationService.toRadians,
};

export default LocationService;