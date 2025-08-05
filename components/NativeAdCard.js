// NativeAdCard component renders a native AdMob ad in a style similar to the
// vertical video cards used throughout the Vroom feed. It loads a native
// advertisement using the `react-native-google-mobile-ads` library and
// displays the ad's media, headline and call‑to‑action. The entire card
// occupies the full height of the device to blend seamlessly with video
// content.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeMediaView,
  NativeAsset,
  NativeAssetType,
} from 'react-native-google-mobile-ads';

// Grab device dimensions to size the ad like a video card
const { height } = Dimensions.get('window');

// Ad unit IDs supplied by the user for each platform
const NATIVE_AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const NATIVE_AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

function NativeAdCard() {
  const [nativeAd, setNativeAd] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadAd = async () => {
      try {
        // Choose the appropriate ad unit ID based on platform
        const adUnitId = Platform.OS === 'ios'
          ? NATIVE_AD_UNIT_ID_IOS
          : NATIVE_AD_UNIT_ID_ANDROID;
        const ad = await NativeAd.createForAdRequest(adUnitId);
        if (isMounted) {
          setNativeAd(ad);
        }
      } catch (err) {
        console.warn('Failed to load native ad:', err);
      }
    };
    loadAd();

    return () => {
      isMounted = false;
      // Always destroy the ad when the component unmounts
      if (nativeAd) {
        nativeAd.destroy();
      }
    };
  }, []);

  // While the ad is loading, render a blank container to avoid layout jumps
  if (!nativeAd) {
    return <View style={[styles.container, styles.loadingContainer]} />;
  }

  return (
    <View style={styles.container}>
      <NativeAdView nativeAd={nativeAd} style={styles.adView}>
        {/* Display the ad media (image or video). It automatically fills the card */}
        <NativeMediaView style={styles.media} />
        {/* Overlay containing sponsored label, headline and call to action */}
        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.sponsoredLabel}>Sponsored</Text>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={1}>
              {nativeAd.headline}
            </Text>
          </NativeAsset>
          {nativeAd.callToActionText ? (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={styles.ctaButton}>
                <Text style={styles.ctaText}>{nativeAd.callToActionText}</Text>
              </View>
            </NativeAsset>
          ) : null}
        </View>
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card container matches the size of a video card
  container: {
    height,
    width: '100%',
    backgroundColor: '#000',
  },
  adView: {
    flex: 1,
  },
  media: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sponsoredLabel: {
    color: '#bbb',
    fontSize: 12,
    marginBottom: 4,
  },
  headline: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  ctaButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NativeAdCard;