import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeMediaView,
  NativeAsset,
  NativeAssetType,
} from 'react-native-google-mobile-ads';

// Production ad unit IDs
const AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

// Test ad unit IDs
const TEST_AD_UNIT_ID_IOS = 'ca-app-pub-3940256099942544/3986624511';
const TEST_AD_UNIT_ID_ANDROID = 'ca-app-pub-3940256099942544/2247696110';

const USE_TEST_ADS = true; // Temporarily force test ads for debugging

export default function NativeAdCardFeed({ adId }) {
  const [nativeAd, setNativeAd] = useState(null);
  const [error, setError] = useState(false);
  const [isViewReady, setIsViewReady] = useState(false);
  
  console.log(`[NATIVE AD] Component created with adId: ${adId}`);

  useEffect(() => {
    let isMounted = true;
    async function loadAd() {
      try {
        let adUnitId;
        if (USE_TEST_ADS) {
          adUnitId = Platform.OS === 'ios' ? TEST_AD_UNIT_ID_IOS : TEST_AD_UNIT_ID_ANDROID;
          console.log(`[AD DEBUG] Loading TEST feed ad - Unit ID: ${adUnitId}, Platform: ${Platform.OS}, __DEV__: ${__DEV__}`);
        } else {
          adUnitId = Platform.OS === 'ios' ? AD_UNIT_ID_IOS : AD_UNIT_ID_ANDROID;
          console.log(`[AD DEBUG] Loading PRODUCTION feed ad - Unit ID: ${adUnitId}, Platform: ${Platform.OS}, __DEV__: ${__DEV__}`);
        }
        
        console.log(`[AD DEBUG] Starting ad request for adId: ${adId}`);
        
        const ad = await NativeAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: false,
        });
        
        if (isMounted) {
          setNativeAd(ad);
          // Small delay to ensure view is ready for asset registration
          setTimeout(() => setIsViewReady(true), 100);
          console.log(`[AD DEBUG] Native feed ad loaded successfully for adId: ${adId}`);
        }
      } catch (err) {
        console.error(`[AD DEBUG] Failed to load native feed ad for adId: ${adId}`, {
          message: err.message,
          code: err.code,
          domain: err.domain,
          stack: err.stack
        });
        if (isMounted) {
          setError(true);
        }
      }
    }
    
    loadAd();
    
    return () => {
      isMounted = false;
      if (nativeAd) {
        try {
          nativeAd.destroy();
          console.log(`[NATIVE AD ${adId}] Ad destroyed successfully`);
        } catch (error) {
          console.error(`[NATIVE AD ${adId}] Error destroying ad:`, error);
        }
      }
    };
  }, []);

  console.log(`[NATIVE AD ${adId}] Render state - nativeAd:`, !!nativeAd, 'isViewReady:', isViewReady, 'error:', error);

  if (error) {
    console.log(`[NATIVE AD ${adId}] Rendering error state`);
    return (
      <View style={styles.errorPlaceholder}>
        <Text style={styles.errorText}>Feed ad failed to load</Text>
      </View>
    );
  }

  if (!nativeAd || !isViewReady) {
    console.log(`[NATIVE AD ${adId}] Rendering loading state`);
    return (
      <View style={styles.loadingPlaceholder}>
        <Text style={styles.placeholderText}>Loading Ad...</Text>
        <Text style={styles.debugText}>AD SLOT: {adId}</Text>
      </View>
    );
  }

  console.log(`[NATIVE AD ${adId}] Rendering full ad with headline:`, nativeAd?.headline);

  // Additional safety check to prevent crashes
  if (!nativeAd || typeof nativeAd.headline === 'undefined') {
    console.log(`[NATIVE AD ${adId}] Ad data not fully loaded, showing loading state`);
    return (
      <View style={styles.loadingPlaceholder}>
        <Text style={styles.placeholderText}>Loading Ad...</Text>
        <Text style={styles.debugText}>AD SLOT: {adId}</Text>
      </View>
    );
  }

  try {
    return (
      <View style={styles.container}>
        <NativeAdView nativeAd={nativeAd} style={styles.adView}>
          <NativeMediaView 
            style={styles.media}
            resizeMode="contain" 
          />
          <View style={styles.footerOverlay}>
            {nativeAd?.headline && (
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text style={styles.headline} numberOfLines={2}>
                  {nativeAd.headline}
                </Text>
              </NativeAsset>
            )}
            {nativeAd?.callToActionText && (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <TouchableOpacity style={styles.ctaButton}>
                  <Text style={styles.ctaText}>{nativeAd.callToActionText}</Text>
                </TouchableOpacity>
              </NativeAsset>
            )}
          </View>
          <Text style={styles.sponsoredLabel}>Sponsored</Text>
          
          {/* Debug indicator */}
          <View style={styles.debugIndicator}>
            <Text style={styles.debugText}>AD: {adId}</Text>
          </View>
        </NativeAdView>
      </View>
    );
  } catch (error) {
    console.error(`[NATIVE AD ${adId}] Render error:`, error);
    return (
      <View style={styles.errorPlaceholder}>
        <Text style={styles.errorText}>Ad render error</Text>
      </View>
    );
  }
}

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    width: windowWidth,
    height: windowHeight,
    backgroundColor: '#000',
  },
  adView: {
    flex: 1,
    width: windowWidth,
    height: windowHeight,
    overflow: 'hidden',
  },
  media: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: windowWidth,
    height: windowHeight,
    backgroundColor: '#000',
  },
  footerOverlay: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
  },
  headline: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  ctaButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  ctaText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sponsoredLabel: {
    position: 'absolute',
    top: 12,
    right: 12,
    color: '#888',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  loadingPlaceholder: {
    width: windowWidth,
    height: windowHeight,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#888',
    fontSize: 16,
  },
  errorPlaceholder: {
    width: windowWidth,
    height: windowHeight,
    backgroundColor: '#2A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  errorText: {
    color: '#FF4444',
    fontSize: 16,
  },
  debugIndicator: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1000,
  },
  debugText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
