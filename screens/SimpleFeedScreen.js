import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  FlatList, 
  ActivityIndicator, 
  Dimensions, 
  StyleSheet, 
  View, 
  Text,
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
  const flatListRef = useRef(null);

  // Get current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    fetchUser();
  }, []);

  // Register refresh callback for double-tap feed refresh (moved after refreshFeed is defined)

  // Load initial feed with good batch size
  const loadFeed = useCallback(async () => {
    if (!currentUserId) return;
    
    try {
      console.log('[SIMPLE FEED] Loading initial feed...');
      const result = await VroomFeedManager.getFeed(currentUserId, 25); // Good initial batch
      
      if (!result.error && result.posts && result.posts.length > 0) {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        setPosts(contentPosts);
        setItems(result.posts);
        setHasMore(result.hasMore !== false);
        
        console.log(`[SIMPLE FEED] Initial load: ${contentPosts.length} videos, ${result.posts.length} total items`);
      } else {
        // If no posts, still show the empty state rather than permanent loading
        console.log('[SIMPLE FEED] No posts returned, showing empty state');
        setPosts([]);
        setItems([]);
        setHasMore(false);
      }
      setLoading(false);
    } catch (error) {
      console.error('[SIMPLE FEED] Error in initial load:', error);
      // Always set loading to false to prevent black screen
      setLoading(false);
      setPosts([]);
      setItems([]);
    }
  }, [currentUserId]);

  // Load more posts - simple and reliable
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !currentUserId) {
      return;
    }
    
    console.log('[SIMPLE FEED] Loading more posts...');
    setLoading(true);
    
    try {
      const lastPost = posts.length > 0 ? posts[posts.length - 1] : null;
      const result = await VroomFeedManager.getFeed(currentUserId, 20, lastPost?.id); // Consistent batch
      
      if (!result.error && result.posts && result.posts.length > 0) {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        
        // Deduplicate posts
        const existingPostIds = new Set(posts.map(p => p.id));
        const newContentPosts = contentPosts.filter(post => !existingPostIds.has(post.id));
        
        if (newContentPosts.length > 0) {
          const updatedPosts = [...posts, ...newContentPosts];
          const updatedItems = [...items, ...result.posts];
          
          setPosts(updatedPosts);
          setItems(updatedItems);
          
          console.log(`[SIMPLE FEED] Added ${newContentPosts.length} posts, total: ${updatedPosts.length}`);
          setHasMore(result.hasMore !== false && newContentPosts.length > 0);
        } else {
          console.log('[SIMPLE FEED] No new content after deduplication');
          setHasMore(false);
        }
      } else {
        console.log('[SIMPLE FEED] No more posts available');
        setHasMore(false);
      }
    } catch (error) {
      console.error('[SIMPLE FEED] Error loading more posts:', error);
    }
    
    setLoading(false);
  }, [currentUserId, posts, items, loading, hasMore]);

  // Refresh feed
  const refreshFeed = useCallback(async () => {
    if (refreshing || !currentUserId) return;
    
    console.log('[SIMPLE FEED] Refreshing feed...');
    setRefreshing(true);
    
    try {
      const result = await VroomFeedManager.refreshFeed(currentUserId, 20);
      
      if (!result.error && result.posts) {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        
        if (contentPosts.length > 0) {
          // For refresh, replace the content completely
          setPosts(contentPosts);
          setItems(result.posts);
          setHasMore(true);
          
          console.log(`[SIMPLE FEED] Refresh complete: ${contentPosts.length} new posts`);
        }
      }
    } catch (error) {
      console.error('[SIMPLE FEED] Error refreshing feed:', error);
    }
    
    setRefreshing(false);
  }, [currentUserId, refreshing]);

  // Register refresh callback now that refreshFeed is defined
  useEffect(() => {
    if (global.registerFeedRefresh) {
      global.registerFeedRefresh(refreshFeed);
      console.log('[SIMPLE FEED] Feed refresh callback registered for double-tap');
    }
    
    return () => {
      // Cleanup on unmount
      if (global.registerFeedRefresh) {
        global.registerFeedRefresh(() => {});
      }
    };
  }, [refreshFeed]);

  // Load feed when user available
  useEffect(() => {
    if (currentUserId) {
      loadFeed().catch(error => {
        console.error('[SIMPLE FEED] Critical error in initial load:', error);
        setLoading(false); // Prevent permanent loading state
      });
    }
  }, [currentUserId, loadFeed]);

  // Track post as seen (simplified)
  const trackPostAsSeen = useCallback((post) => {
    // Simple seen tracking without complex logic
    if (post && post.id) {
      console.log(`[SIMPLE FEED] Viewed post: ${post.id}`);
    }
  }, []);

  // Aggressive loading trigger - load when 10 items left
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const firstVisibleItem = viewableItems[0];
      if (firstVisibleItem) {
        setCurrentVideoIndex(firstVisibleItem.index);
        
        const totalItems = items.length;
        const currentIndex = firstVisibleItem.index;
        const remainingItems = totalItems - currentIndex;
        
        // Track post as seen
        const item = firstVisibleItem.item;
        if (item.type !== 'ad') {
          trackPostAsSeen(item);
        }
        
        // Aggressive loading: trigger when 10 items left
        if (remainingItems <= 10 && !loading && hasMore) {
          console.log(`[SIMPLE FEED] Loading more - ${remainingItems} items remaining (${currentIndex}/${totalItems})`);
          loadMore();
        }
      }
    }
  }, [trackPostAsSeen, items.length, loading, hasMore, loadMore]);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 50,
  };

  // Render callbacks
  const onCommentsModalChange = useCallback(() => {}, []);
  const onPostDeleted = useCallback((deletedPostId) => {
    setItems(prevItems => prevItems.filter(prevItem => prevItem.id !== deletedPostId));
    setPosts(prevPosts => prevPosts.filter(prevPost => prevPost.id !== deletedPostId));
  }, []);

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'ad') {
      return <NativeAdCardFeed key={`ad-${item.adId}-${index}`} />;
    }

    return (
      <VideoCard
        key={`video-${item.id}-${index}`}
        item={item}
        index={index}
        currentVideoIndex={currentVideoIndex}
        navigation={navigation}
        onCommentsModalChange={onCommentsModalChange}
        isAnyCommentsModalOpen={false}
        currentUserId={currentUserId}
        usePhoneViewport={true}
        onPostDeleted={onPostDeleted}
      />
    );
  }, [currentVideoIndex, navigation, onCommentsModalChange, currentUserId, onPostDeleted]);

  const keyExtractor = useCallback((item, index) => {
    return item.type === 'ad' ? `ad-${item.adId || index}` : `video-${item.id}`;
  }, []);

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  // Show empty state if no loading and no items
  if (!loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No videos yet!</Text>
          <Text style={styles.emptySubtext}>Pull down to refresh</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        ref={flatListRef}
        data={items}
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
        maxToRenderPerBatch={8}
        initialNumToRender={4}
        getItemLayout={(data, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFeed}
            tintColor="#00BFFF"
            colors={["#00BFFF"]}
          />
        }
        ListFooterComponent={loading && items.length > 0 ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color="#00BFFF" />
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  emptyText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 16,
  },
});

export default SimpleFeedScreen;