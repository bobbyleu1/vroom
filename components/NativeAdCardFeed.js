// NativeAdCardFeed renders a full‑screen native advertisement that blends
// seamlessly into the video feed, matching the size and style of a
// standard video post. This component is used exclusively in the main
// feed and friends feeds to display ads that feel like another video
// while clearly marking them as sponsored content.

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

// Platform‑specific AdMob unit IDs supplied by the user. These IDs
// correspond to native ad units configured in the AdMob console and
// should not be modified. They match the IDs used throughout the app
// for consistency.
const AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

/**
 * NativeAdCardFeed loads and displays a native ad in a full‑screen
 * format similar to a TikTok video. The media fills the entire
 * container, with a headline and call‑to‑action overlaid near the
 * bottom. A “Sponsored” label in the top right corner clearly marks
 * the content as promotional. A placeholder view is shown while the
 * ad is loading to prevent layout shifts in the feed.
 */
export default function NativeAdCardFeed() {
  const [nativeAd, setNativeAd] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadAd() {
      try {
        const adUnitId = Platform.OS === 'ios' ? AD_UNIT_ID_IOS : AD_UNIT_ID_ANDROID;
        const ad = await NativeAd.createForAdRequest(adUnitId);
        if (isMounted) {
          setNativeAd(ad);
        }
      } catch (err) {
        console.warn('Failed to load native feed ad:', err);
      }
    }
    loadAd();
    return () => {
      isMounted = false;
      if (nativeAd) {
        nativeAd.destroy();
      }
    };
  }, []);

  // Show a blank container while the ad is loading. This preserves
  // spacing in the list and prevents the feed from jumping when the
  // ad finishes loading.
  if (!nativeAd) {
    return <View style={styles.loadingPlaceholder} />;
  }

  return (
    <View style={styles.container}>
      <NativeAdView nativeAd={nativeAd} style={styles.adView}>
        {/* The media takes up the entire card, filling the screen. */}
        <NativeMediaView style={styles.media} />
        {/* Overlay for headline and call‑to‑action. Positioned near the
            bottom of the screen to resemble a video caption area. */}
        <View style={styles.footerOverlay}>
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
        {/* “Sponsored” label to clearly identify the ad. */}
        <Text style={styles.sponsoredLabel}>Sponsored</Text>
      </NativeAdView>
    </View>
  );
}

const windowHeight = Dimensions.get('window').height;
const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: windowHeight,
    backgroundColor: '#000',
  },
  adView: {
    flex: 1,
  },
  media: {
    flex: 1,
    backgroundColor: '#000',
  },
  footerOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    flexDirection: 'column',
  },
  headline: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
    top: 10,
    right: 10,
    color: '#888',
    fontSize: 12,
  },
  loadingPlaceholder: {
    width: '100%',
    height: windowHeight,
    backgroundColor: '#000',
  },
});