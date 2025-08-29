// NativeAdCard renders a small native AdMob advertisement that blends
// seamlessly with other cards in the forums and groups feeds. The card
// resembles a typical post: it has a dark background, a border, and
// rounded corners consistent with the rest of the Vroom UI. The ad
// includes media (image or video) at the top, a headline, an optional
// call‑to‑action button, and a small "Sponsored" label to clearly
// indicate that the content is promotional.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Dimensions } from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeMediaView,
  NativeAsset,
  NativeAssetType,
} from 'react-native-google-mobile-ads';

// Define the AdMob unit IDs for each platform. These are provided by the
// user and must correspond to native ad units configured in the AdMob
// console. The same IDs are reused from the feed implementation to
// ensure monetisation consistency across the app.

// Production ad unit IDs
const AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

// Test ad unit IDs (use these during development)
const TEST_AD_UNIT_ID_IOS = 'ca-app-pub-3940256099942544/3986624511';
const TEST_AD_UNIT_ID_ANDROID = 'ca-app-pub-3940256099942544/2247696110';

// Set to true during development, false for production
const USE_TEST_ADS = true; // Temporarily force test ads for debugging

/**
 * A reusable component that displays a single native ad. It loads the
 * advertisement when mounted and destroys it on unmount to free
 * resources. While the ad is loading, an empty container is rendered
 * to avoid any layout shift.
 */
export default function NativeAdCard() {
  const [nativeAd, setNativeAd] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadAd() {
      try {
        let adUnitId;
        if (USE_TEST_ADS) {
          adUnitId = Platform.OS === 'ios' ? TEST_AD_UNIT_ID_IOS : TEST_AD_UNIT_ID_ANDROID;
          console.log('Loading test ad with unit ID:', adUnitId);
        } else {
          adUnitId = Platform.OS === 'ios' ? AD_UNIT_ID_IOS : AD_UNIT_ID_ANDROID;
          console.log('Loading production ad with unit ID:', adUnitId);
        }
        
        const ad = await NativeAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: false,
        });
        
        if (isMounted) {
          setNativeAd(ad);
          console.log('Native ad loaded successfully');
        }
      } catch (err) {
        console.error('[AD DEBUG] Failed to load native ad:', {
          message: err.message,
          code: err.code,
          domain: err.domain,
          stack: err.stack,
          adUnitId: adUnitId,
          platform: Platform.OS,
          __DEV__: __DEV__
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
          console.log('Native ad destroyed successfully');
        } catch (error) {
          console.error('Error destroying native ad:', error);
        }
      }
    };
  }, []);

  // Don't render anything if there's an error
  if (error) {
    return (
      <View style={styles.errorPlaceholder}>
        <Text style={styles.errorText}>Ad failed to load</Text>
      </View>
    );
  }

  // Render a placeholder while the ad is loading to maintain consistent
  // spacing in the list.
  if (!nativeAd) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Loading ad...</Text>
      </View>
    );
  }

  // Additional safety check to prevent crashes
  if (!nativeAd || typeof nativeAd.headline === 'undefined') {
    console.log('Native ad data not fully loaded, showing loading state');
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Loading ad...</Text>
      </View>
    );
  }

  try {
    return (
      <View style={styles.cardContainer}>
        <NativeAdView nativeAd={nativeAd} style={styles.adView}>
          {/* Media content displayed at the top of the card. The media will
              automatically adjust its aspect ratio and fill the width of
              the card. */}
          <NativeMediaView style={styles.media} />

          {/* Content section: headline and call‑to‑action button. These
              elements are taken from the ad itself and displayed in
              typical Vroom styling. */}
          <View style={styles.contentSection}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.headline} numberOfLines={2}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>
            {nativeAd.callToActionText ? (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <TouchableOpacity style={styles.ctaButton}>
                  <Text style={styles.ctaText}>{nativeAd.callToActionText}</Text>
                </TouchableOpacity>
              </NativeAsset>
            ) : null}
          </View>

          {/* Overlay the "Sponsored" label in the top right corner of the
              card. This clearly marks the content as an advertisement. */}
          <Text style={styles.sponsoredLabel}>Sponsored</Text>
        </NativeAdView>
      </View>
    );
  } catch (error) {
    console.error('Native ad render error:', error);
    return (
      <View style={styles.errorPlaceholder}>
        <Text style={styles.errorText}>Ad render error</Text>
      </View>
    );
  }
}

const CARD_WIDTH = Dimensions.get('window').width - 30; // account for padding
const MEDIA_HEIGHT = 150; // height of the media section

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#00BFFF',
    overflow: 'hidden',
  },
  adView: {
    flex: 1,
  },
  media: {
    width: '100%',
    height: MEDIA_HEIGHT,
    backgroundColor: '#000',
  },
  contentSection: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  headline: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#00BFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  ctaText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sponsoredLabel: {
    position: 'absolute',
    top: 8,
    right: 10,
    color: '#888',
    fontSize: 12,
  },
  placeholder: {
    height: MEDIA_HEIGHT + 60, // approximate space while loading
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#888',
    fontSize: 14,
  },
  errorPlaceholder: {
    height: MEDIA_HEIGHT + 60,
    backgroundColor: '#2A0A0A',
    borderRadius: 12,
    marginBottom: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  errorText: {
    color: '#FF4444',
    fontSize: 14,
  },
});