import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  FlatList, 
  ActivityIndicator, 
  Dimensions, 
  StyleSheet, 
  View, 
  RefreshControl,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard';
import NativeAdCardFeed from '../components/NativeAdCardFeed';
import { VroomFeedManager } from '../utils/vroomFeedManager';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const { height } = Dimensions.get('window');
// Ad frequency is now handled by VroomFeedManager

function SimpleFeedScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState([]);
  const [items, setItems] = useState([]); // Posts + ads combined
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [preloadQueue, setPreloadQueue] = useState([]); // Queue of preloaded posts
  const [isPreloading, setIsPreloading] = useState(false);
  const flatListRef = useRef(null);

  // Get current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    fetchUser();
  }, []);

  // Register refresh callback for double-tap feed refresh
  useEffect(() => {
    if (global.registerFeedRefresh && refreshFeed) {
      global.registerFeedRefresh(refreshFeed);
      console.log('Feed refresh callback registered');
    }
    
    return () => {
      // Cleanup on unmount
      if (global.registerFeedRefresh) {
        global.registerFeedRefresh(() => {});
      }
    };
  }, [refreshFeed]);

  // Refresh feed when screen comes into focus (e.g., after posting)
  useFocusEffect(
    useCallback(() => {
      if (currentUserId && posts.length > 0) {
        // Only refresh if we already have posts loaded to avoid unnecessary loading
        console.log('[SIMPLE FEED] Screen focused - refreshing feed');
        refreshFeed();
      }
    }, [currentUserId, posts.length, refreshFeed])
  );

  // Load initial feed with faster loading and optimistic loading
  const loadFeed = useCallback(async () => {
    if (!currentUserId) return;
    
    try {
      // Start loading immediately without setting loading state first to avoid black screen
      const result = await VroomFeedManager.getFeed(currentUserId, 20); // Start with smaller batch for faster initial load
      
      if (!result.error && result.posts && result.posts.length > 0) {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        setPosts(contentPosts);
        setItems(result.posts); // Posts already include ads
        setHasMore(result.hasMore);
        setLoading(false); // Only set loading to false after we have content
        
        // Trigger initial aggressive preloading using a separate effect
        if (result.hasMore && contentPosts.length > 0) {
          console.log('[SIMPLE FEED] Scheduling initial preload...');
          setTimeout(async () => {
            console.log('[SIMPLE FEED] Starting initial background preload...');
            try {
              const preloadResult = await VroomFeedManager.getFeed(
                currentUserId,
                40, // Large batch for preloading
                contentPosts[contentPosts.length - 1]?.id
              );
              
              if (!preloadResult.error && preloadResult.posts && preloadResult.posts.length > 0) {
                const newContentPosts = preloadResult.posts.filter(item => item.type !== 'ad');
                const existingPostIds = new Set(contentPosts.map(p => p.id));
                const uniqueNewPosts = newContentPosts.filter(post => !existingPostIds.has(post.id));
                
                if (uniqueNewPosts.length > 0) {
                  console.log(`[SIMPLE FEED] Initial preload complete: ${uniqueNewPosts.length} posts ready`);
                  setPreloadQueue(uniqueNewPosts);
                  setHasMore(preloadResult.hasMore);
                }
              }
            } catch (error) {
              console.error('[SIMPLE FEED] Error in initial preload:', error);
            }
          }, 2000);
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('[SIMPLE FEED] Error in initial load:', error);
      setLoading(false);
    }
  }, [currentUserId]);

  // Load more posts - now uses preloaded content first
  const loadMore = useCallback(async () => {
    console.log(`[SIMPLE FEED] loadMore called - hasMore: ${hasMore}, loading: ${loading}, posts.length: ${posts.length}, preloadQueue: ${preloadQueue.length}`);
    
    if (loading) {
      console.log('[SIMPLE FEED] loadMore blocked - already loading');
      return;
    }

    // First, try to consume preloaded content
    if (preloadQueue.length > 0) {
      consumePreloadedContent();
      // Trigger another preload for the next batch
      setTimeout(() => preloadContent(), 500);
      return;
    }
    
    if (!currentUserId) {
      console.log('[SIMPLE FEED] loadMore blocked - no user');
      return;
    }
    
    console.log('[SIMPLE FEED] Loading more posts...');
    setLoading(true);
    
    const lastPost = posts.length > 0 ? posts[posts.length - 1] : null;
    console.log('[SIMPLE FEED] Last post ID:', lastPost?.id);
    
    const result = await VroomFeedManager.getFeed(
      currentUserId, 
      30, // Larger batch size for smoother scrolling
      lastPost?.id
    );
    
    if (!result.error && result.posts) {
      if (result.posts.length === 0) {
        console.log('[SIMPLE FEED] No more posts available');
        setHasMore(false);
      } else {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        
        // Deduplicate posts to prevent duplicate keys
        const existingPostIds = new Set(posts.map(p => p.id));
        const newContentPosts = contentPosts.filter(post => !existingPostIds.has(post.id));
        
        // Deduplicate all items (posts + ads)
        const existingItemIds = new Set(items.map(item => item.id || item.adId));
        const newItems = result.posts.filter(item => {
          const itemId = item.id || item.adId;
          return !existingItemIds.has(itemId);
        });
        
        if (newContentPosts.length > 0 || newItems.length > 0) {
          const updatedPosts = [...posts, ...newContentPosts];
          const updatedItems = [...items, ...newItems];
          
          // Debug: Check for any remaining duplicates
          const postIds = updatedPosts.map(p => p.id);
          const itemIds = updatedItems.map(item => item.id || item.adId);
          const duplicatePostIds = postIds.filter((id, index) => postIds.indexOf(id) !== index);
          const duplicateItemIds = itemIds.filter((id, index) => itemIds.indexOf(id) !== index);
          
          if (duplicatePostIds.length > 0) {
            console.warn('[SIMPLE FEED] Duplicate post IDs found:', duplicatePostIds);
          }
          if (duplicateItemIds.length > 0) {
            console.warn('[SIMPLE FEED] Duplicate item IDs found:', duplicateItemIds);
          }
          
          setPosts(updatedPosts);
          setItems(updatedItems);
          console.log(`[SIMPLE FEED] Added ${newContentPosts.length} more posts, total: ${updatedPosts.length}`);
        } else {
          console.log('[SIMPLE FEED] No new unique content to add');
        }
        
        setHasMore(true); // Always keep hasMore true for endless feed
      }
    } else {
      console.error('[SIMPLE FEED] Error loading more posts:', result.error);
    }
    
    setLoading(false);
  }, [currentUserId, posts, items, loading, preloadQueue, consumePreloadedContent, preloadContent]);

  // Refresh feed with random nonce to ensure fresh content
  const refreshFeed = useCallback(async () => {
    const refreshNonce = Date.now(); // Unique identifier for this refresh
    console.log(`[SIMPLE FEED] refreshFeed called - nonce: ${refreshNonce}, refreshing: ${refreshing}, currentUserId: ${currentUserId}`);
    
    if (refreshing || !currentUserId) {
      console.log(`[SIMPLE FEED] refreshFeed blocked - refreshing: ${refreshing}, currentUserId: ${currentUserId}`);
      return;
    }
    
    console.log(`[SIMPLE FEED] Starting feed refresh with nonce ${refreshNonce}...`);
    setRefreshing(true);
    
    // Clear preload queue to force fresh content
    setPreloadQueue([]);
    
    const result = await VroomFeedManager.refreshFeed(currentUserId, 50);
    
    if (!result.error && result.posts) {
      const contentPosts = result.posts.filter(item => item.type !== 'ad');
      
      // Log the first few post IDs to verify we got different content
      const newPostIds = contentPosts.slice(0, 5).map(p => p.id);
      const currentPostIds = posts.slice(0, 5).map(p => p.id);
      console.log(`[SIMPLE FEED] Refresh ${refreshNonce} - New posts:`, newPostIds);
      console.log(`[SIMPLE FEED] Refresh ${refreshNonce} - Current posts:`, currentPostIds);
      
      // For refresh, we replace all content, so no deduplication needed
      setPosts(contentPosts);
      setItems(result.posts); // Already includes ads
      setHasMore(result.hasMore);
      
      // Reset to first item
      setCurrentVideoIndex(0);
      if (flatListRef.current) {
        flatListRef.current.scrollToIndex({ index: 0, animated: false });
      }
      
      console.log(`[SIMPLE FEED] Feed refreshed successfully with ${result.posts.length} items (nonce: ${refreshNonce})`);
    } else {
      console.log(`[SIMPLE FEED] Feed refresh failed (nonce: ${refreshNonce}):`, result.error);
    }
    
    setRefreshing(false);
  }, [currentUserId, refreshing, posts, preloadQueue]); // Include dependencies for content tracking

  // Track posts as seen when they become visible
  const trackPostAsSeen = useCallback(async (item) => {
    if (item.type === 'ad' || !currentUserId) return;
    
    try {
      await VroomFeedManager.markPostAsSeen(currentUserId, item.id);
      
      // Mark recycled posts as reshown
      if (item.is_recycled) {
        await VroomFeedManager.markPostAsReshown(currentUserId, item.id);
      }
    } catch (error) {
      console.error('Error tracking post as seen:', error);
    }
  }, [currentUserId]);

  // Load feed when user is available
  useEffect(() => {
    if (currentUserId) {
      loadFeed();
    }
  }, [currentUserId, loadFeed]);

  // Aggressive preloading function
  const preloadContent = useCallback(async () => {
    if (!currentUserId || isPreloading || !hasMore || posts.length === 0) return;
    
    setIsPreloading(true);
    console.log('[SIMPLE FEED] Preloading more content...');
    
    try {
      const lastPost = posts[posts.length - 1];
      const preloadResult = await VroomFeedManager.getFeed(
        currentUserId,
        40, // Larger batch for better preloading
        lastPost?.id
      );
      
      if (!preloadResult.error && preloadResult.posts && preloadResult.posts.length > 0) {
        const newContentPosts = preloadResult.posts.filter(item => item.type !== 'ad');
        const existingPostIds = new Set(posts.map(p => p.id));
        const uniqueNewPosts = newContentPosts.filter(post => !existingPostIds.has(post.id));
        
        if (uniqueNewPosts.length > 0) {
          console.log(`[SIMPLE FEED] Preloaded ${uniqueNewPosts.length} posts to queue`);
          setPreloadQueue(prev => [...prev, ...uniqueNewPosts]);
          setHasMore(preloadResult.hasMore);
        }
      }
    } catch (error) {
      console.error('[SIMPLE FEED] Error preloading content:', error);
    } finally {
      setIsPreloading(false);
    }
  }, [currentUserId, isPreloading, hasMore, posts]);

  // Enhanced scroll handler for aggressive preloading
  const handleScroll = useCallback((event) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    
    // Start preloading when user is still 2 screen heights away from the end
    const preloadTriggerDistance = layoutMeasurement.height * 2;
    
    // Only trigger preloading if conditions are met
    if (distanceFromEnd < preloadTriggerDistance && !isPreloading && hasMore) {
      preloadContent();
    }
  }, [preloadContent, isPreloading, hasMore]);

  // Function to consume preloaded content
  const consumePreloadedContent = useCallback(() => {
    if (preloadQueue.length > 0) {
      console.log(`[SIMPLE FEED] Adding ${preloadQueue.length} preloaded posts to feed`);
      setPosts(prev => [...prev, ...preloadQueue]);
      
      // Add preloaded posts to items with ads
      const preloadedItems = [...preloadQueue];
      // Insert ads every 10 posts in preloaded content
      const itemsWithAds = [];
      preloadedItems.forEach((post, index) => {
        if (index > 0 && index % 10 === 0) {
          itemsWithAds.push({ type: 'ad', adId: `preload-ad-${Date.now()}-${index}` });
        }
        itemsWithAds.push(post);
      });
      
      setItems(prev => [...prev, ...itemsWithAds]);
      setPreloadQueue([]); // Clear the queue
    }
  }, [preloadQueue]);

  // Debug logging for items count
  useEffect(() => {
    console.log(`[SIMPLE FEED] Items count updated: ${items.length} total items`);
  }, [items.length]);

  // Track current video index and mark posts as seen
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const firstVisibleItem = viewableItems[0];
      if (firstVisibleItem) {
        setCurrentVideoIndex(firstVisibleItem.index);
        
        const totalItems = items.length;
        const currentIndex = firstVisibleItem.index;
        const remainingItems = totalItems - currentIndex;
        
        // Trigger preloading when user is getting close to the end
        if (remainingItems <= 10 && !isPreloading && hasMore && preloadQueue.length === 0) {
          console.log(`[SIMPLE FEED] Triggering preload - ${remainingItems} items remaining`);
          preloadContent();
        }
        
        // Track post as seen
        const item = firstVisibleItem.item;
        if (item.type !== 'ad') {
          trackPostAsSeen(item);
        }
        
        // If less than 10 items remaining, also trigger loadMore for fallback
        if (remainingItems <= 10 && !loading && hasMore) {
          console.log('[SIMPLE FEED] Also triggering loadMore fallback - remaining items:', remainingItems);
          loadMore();
        }
      }
    }
  }, [trackPostAsSeen, items.length, loading, hasMore, loadMore, isPreloading, preloadQueue.length, preloadContent]);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 50,
  };

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'ad') {
      return <NativeAdCardFeed key={`ad-${item.adId}-${index}`} adId={item.adId} />;
    }

    return (
      <VideoCard
        key={`video-${item.id}-${index}`}
        item={item}
        index={index}
        currentVideoIndex={currentVideoIndex}
        navigation={navigation}
        onCommentsModalChange={() => {}}
        isAnyCommentsModalOpen={false}
        currentUserId={currentUserId}
        onPostDeleted={(deletedPostId) => {
          setItems(prevItems => prevItems.filter(prevItem => prevItem.id !== deletedPostId));
        }}
      />
    );
  }, [currentVideoIndex, navigation, currentUserId]);

  const keyExtractor = useCallback((item, index) => {
    // Create a stable unique key combining item info with position
    if (item.type === 'ad') {
      return `ad-${item.adId || item.id || 'unknown'}-at-${index}`;
    }
    return `content-${item.id || 'unknown'}-at-${index}`;
  }, []);

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#00BFFF" />
      </View>
    );
  };

  // Add debug logging for FlatList events
  const onEndReached = useCallback(() => {
    console.log('[SIMPLE FEED] onEndReached triggered');
    loadMore();
  }, [loadMore]);

  const getItemLayout = useCallback((data, index) => ({
    length: height,
    offset: height * index,
    index,
  }), []);

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Icon - positioned absolute in top right */}
      <TouchableOpacity
        style={[styles.searchButton, { top: insets.top + 10 }]}
        onPress={() => navigation.navigate('Search')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="search" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        getItemLayout={getItemLayout}
        ListFooterComponent={renderFooter}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        initialNumToRender={3}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFeed}
            tintColor="#00BFFF"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  searchButton: {
    position: 'absolute',
    right: 16,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  footerLoader: {
    padding: 20,
    alignItems: 'center',
  },
});

export default SimpleFeedScreen;