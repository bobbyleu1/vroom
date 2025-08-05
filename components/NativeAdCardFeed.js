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

const AD_UNIT_ID_IOS = 'ca-app-pub-6842873031676463/4717662480';
const AD_UNIT_ID_ANDROID = 'ca-app-pub-6842873031676463/3404580816';

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

  if (!nativeAd) {
    return <View style={styles.loadingPlaceholder} />;
  }

  return (
    <View style={styles.container}>
      <NativeAdView nativeAd={nativeAd} style={styles.adView}>
        <NativeMediaView style={styles.media} />
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
        <Text style={styles.sponsoredLabel}>Sponsored</Text>
      </NativeAdView>
    </View>
  );
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
  },
});
