import React, { useCallback, useRef, useState } from 'react';
import { 
  FlatList, 
  ActivityIndicator, 
  Dimensions, 
  StyleSheet, 
  View, 
  Text, 
  Alert 
} from 'react-native';
import VideoCard from '../components/VideoCard.js';
import NativeAdCardFeed from '../components/NativeAdCardFeed.js';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useScrollLock } from '../contexts/ScrollLockContext';
import { useEndlessFeedV2 } from '../src/feed/useEndlessFeedV2';
import { useAuth } from '../contexts/AuthContext';
import { FEED_DIAG_MODE } from '../src/feed/diag';

const { height } = Dimensions.get('window');
const ADS_FREQUENCY = 10;

// Function to insert ads into video feed (DISABLED FOR NOW)
const insertAds = (videos, startAdIndex = 0) => {
  // Temporarily disable ads to clean up console errors
  return videos.map(video => ({ type: 'video', ...video }));
};

function OptimizedFeedScreen() {
  const navigation = useNavigation();
  const { locked } = useScrollLock();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [itemsWithAds, setItemsWithAds] = useState([]);
  
  const flatListRef = useRef(null);
  const itemsWithAdsRef = useRef([]);
  
  // Use the new endless feed hook
  const { 
    items: videos, 
    loading, 
    refreshing, 
    error, 
    onViewable, 
    refreshNewer, 
    resetAndLoadFresh 
  } = useEndlessFeedV2();

  // Update items with ads whenever videos change
  React.useEffect(() => {
    console.log('Videos loaded:', videos.length, 'videos');
    console.log('First video:', videos[0]);
    if (videos.length > 0) {
      const newItemsWithAds = insertAds(videos, 0); // Always start from 0 to avoid loops
      console.log('Items with ads:', newItemsWithAds.length, 'items');
      setItemsWithAds(newItemsWithAds);
      itemsWithAdsRef.current = newItemsWithAds;
    }
  }, [videos]); // Remove lastAdIndex dependency to prevent loops

  const viewabilityConfig = useRef({ 
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 50 
  }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const visibleItem = viewableItems[0];
      if (visibleItem?.index !== null && visibleItem?.item) {
        const actualIndex = visibleItem.index;
        
        // Always set the current index for VideoCard to know which should play
        setCurrentVideoIndex(actualIndex);
        
        // Call endless feed onViewable for videos only
        if (visibleItem.item.type === 'video') {
          // Calculate the actual video index (excluding ads) for the hook
          let videoIndex = 0;
          for (let i = 0; i < actualIndex; i++) {
            if (itemsWithAdsRef.current[i] && itemsWithAdsRef.current[i].type === 'video') {
              videoIndex++;
            }
          }
          onViewable(videoIndex, visibleItem.item.id);
        }
      }
    }
  }, [onViewable]);

  // Fresh on app open (reset and load fresh feed on focus)
  useFocusEffect(useCallback(() => { 
    resetAndLoadFresh(); 
  }, [resetAndLoadFresh]));

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'ad') {
      return <NativeAdCardFeed />;
    }

    return (
      <VideoCard
        item={item}
        index={index}
        currentVideoIndex={currentVideoIndex}
        navigation={navigation}
        onCommentsModalChange={(isOpen) => setIsCommentsModalOpen(isOpen)}
        isAnyCommentsModalOpen={isCommentsModalOpen}
        currentUserId={currentUserId}
        onPostDeleted={(deletedPostId) => {
          setItemsWithAds(prevItems => prevItems.filter(prevItem => prevItem.id !== deletedPostId));
        }}
      />
    );
  }, [currentVideoIndex, navigation, isCommentsModalOpen, currentUserId]);

  const keyExtractor = useCallback((item, index) => {
    return item.type === 'ad' ? item.id : item.id;
  }, []);

  const getItemLayout = useCallback((data, index) => ({
    length: height,
    offset: height * index,
    index,
  }), []);

  const handleRefresh = useCallback(async () => {
    try {
      await refreshNewer();
    } catch (error) {
      console.error('Error refreshing feed:', error);
      Alert.alert('Error', 'Failed to refresh feed. Please try again.');
    }
  }, [refreshNewer]);

  // Register refresh callback for double-tap on tab
  React.useEffect(() => {
    if (global.registerFeedRefresh) {
      global.registerFeedRefresh(handleRefresh);
    }
    return () => {
      if (global.registerFeedRefresh) {
        global.registerFeedRefresh(() => {});
      }
    };
  }, [handleRefresh]);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error loading feed: {error}</Text>
      </View>
    );
  }

  if (!itemsWithAds.length && loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={itemsWithAds}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={6}
        initialNumToRender={3}
        getItemLayout={getItemLayout}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={{ paddingBottom: 1 }}
        ListFooterComponent={loading ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : null}
        scrollEnabled={!locked && !isCommentsModalOpen}
      />
      {FEED_DIAG_MODE && (
        <View pointerEvents="none" style={styles.diagHUD}>
          <Text style={styles.diagText}>
            FEED DIAG {'\n'}
            Items: {itemsWithAds.length} {'\n'}
            Videos: {videos.length} {'\n'}
            Index: {currentVideoIndex} {'\n'}
            Loading: {loading ? 'Y' : 'N'} {'\n'}
            Refreshing: {refreshing ? 'Y' : 'N'} {'\n'}
            {error && `Error: ${error}`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
  },
  diagHUD: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 4,
    zIndex: 1000,
  },
  diagText: {
    color: 'white',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});

export default OptimizedFeedScreen;