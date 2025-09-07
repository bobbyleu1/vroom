import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

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
      const version = Platform.constants.osVersion || Platform.Version;
      console.log(`[LOCATION] Detected iOS version: ${version}`);
      
      // Parse version string
      if (typeof version === 'string') {
        const [major, minor] = version.split('.').map(v => parseInt(v));
        
        // For iOS 18.5, let's try to make location work but with better error handling
        if (major === 18) {
          console.log(`[LOCATION] Detected iOS 18.${minor} - using careful location handling`);
          // Don't disable completely, but be more careful
          return false;
        }
      }
      
      return false; // Allow location on all versions
    } catch (error) {
      console.error('[LOCATION] Error detecting iOS version:', error);
      return false; // Allow location by default
    }
  }

  /**
   * Check current location permission status 
   */
  async checkPermissionStatus() {
    console.log('[LOCATION] Checking permission status...');

    try {
      // Use shorter timeout for iOS 18 compatibility
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Permission check timeout')), 3000);
      });

      const permissionPromise = Location.getForegroundPermissionsAsync();
      const { status } = await Promise.race([permissionPromise, timeoutPromise]);
      
      console.log(`[LOCATION] Current permission status: ${status}`);
      
      return {
        granted: status === 'granted',
        canAskAgain: status === 'undetermined',
        denied: status === 'denied',
        status
      };
    } catch (error) {
      console.error('[LOCATION] Error checking permission:', error.message);
      return { granted: false, canAskAgain: true, denied: false, status: 'undetermined' };
    }
  }

  /**
   * Request location permission with better iOS 18 handling
   */
  async requestPermission() {
    console.log('[LOCATION] Requesting location permission...');
    
    try {
      // Direct permission request with shorter timeout for iOS 18
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 8000);
      });

      const requestPromise = Location.requestForegroundPermissionsAsync();
      const { status } = await Promise.race([requestPromise, timeoutPromise]);
      
      console.log(`[LOCATION] Permission request result: ${status}`);
      
      if (status === 'granted') {
        return { granted: true, status };
      } else if (status === 'denied') {
        // Show settings alert
        return this.showSettingsAlert();
      } else {
        return { granted: false, status };
      }
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
        'Location Permission Required',
        'To find nearby meetups, please enable location access in Settings.',
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
                console.log('[LOCATION] Opening Settings app...');
                await Linking.openSettings();
                resolve({ granted: false, status: 'denied' });
              } catch (error) {
                console.error('[LOCATION] Error opening settings:', error);
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
   * Get current location with iOS 18 cautious handling
   */
  async getCurrentLocation(options = {}) {
    // For iOS 18+, still try but with shorter timeouts and better error handling
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - using cautious location access with shorter timeouts');
      // Reduce timeouts for iOS 18 but still try
      options.timeout = Math.min(options.timeout || 15000, 8000);
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
   * Get location with fallback - iOS 18 cautious handling
   */
  async getLocationWithFallback() {
    // For iOS 18+, still try fallback but with shorter timeouts
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - using cautious fallback location access');
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
   * Safe location check - iOS 18 cautious handling
   */
  async safeLocationCheck() {
    // For iOS 18+, still check but with shorter timeout
    if (this.isIOS18OrLater) {
      console.log('[LOCATION] iOS 18+ detected - using cautious permission check');
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