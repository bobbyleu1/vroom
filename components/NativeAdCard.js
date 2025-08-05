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
const AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

/**
 * A reusable component that displays a single native ad. It loads the
 * advertisement when mounted and destroys it on unmount to free
 * resources. While the ad is loading, an empty container is rendered
 * to avoid any layout shift.
 */
export default function NativeAdCard() {
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
        console.warn('Failed to load native ad:', err);
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

  // Render a placeholder while the ad is loading to maintain consistent
  // spacing in the list.
  if (!nativeAd) {
    return <View style={styles.placeholder} />;
  }

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
  },
});