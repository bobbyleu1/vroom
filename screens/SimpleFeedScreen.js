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

  // Recycle existing posts to keep feed infinite - social feeds should never end
  const recycleExistingPosts = useCallback(async () => {
    if (posts.length === 0) {
      console.log('[SIMPLE FEED] No posts to recycle, loading fresh fallback content');
      // Load fresh content if we have no posts to recycle
      try {
        await loadFallbackFeed();
      } catch (error) {
        console.log('[SIMPLE FEED] Fallback failed, using ultra-fallback');
        await loadUltraFallbackFeed();
      }
      return;
    }

    console.log('[SIMPLE FEED] Recycling existing posts to maintain infinite scroll');
    
    // Take a random selection of existing posts and add them to the end
    const shuffledPosts = [...posts].sort(() => Math.random() - 0.5);
    const recycledPosts = shuffledPosts.slice(0, Math.min(10, posts.length));
    
    // Add recycled content with slight modifications to avoid exact duplicates in UI
    const recycledItems = recycledPosts.map(post => ({
      ...post,
      id: `${post.id}_recycled_${Date.now()}_${Math.random()}`, // Unique ID for recycled content
      is_recycled: true,
      recycled_at: Date.now()
    }));
    
    setPosts(prevPosts => [...prevPosts, ...recycledItems]);
    setItems(prevItems => [...prevItems, ...recycledItems]);
    setHasMore(true); // Always keep infinite scroll active
    
    console.log(`[SIMPLE FEED] Recycled ${recycledItems.length} posts to keep feed infinite`);
  }, [posts]);

  // Ultra-simple fallback that just gets posts without joining profiles
  const loadUltraFallbackFeed = useCallback(async () => {
    try {
      console.log('[SIMPLE FEED] Loading ultra-simple fallback...');
      const { data: ultraPosts, error } = await supabase
        .from('posts')
        .select('id, created_at, content, author_id, media_url, mux_hls_url, mux_playback_id, mux_duration_ms, thumbnail_url, file_type, like_count, comment_count, view_count')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(15);

      if (!error && ultraPosts && ultraPosts.length > 0) {
        const processedPosts = ultraPosts.map(post => ({
          ...post,
          username: 'User', // Fallback username since we can't join profiles
          avatar_url: null,
          type: 'content',
          engagement_score: (post.like_count || 0) + (post.comment_count || 0),
          is_ultra_fallback: true
        }));

        setPosts(processedPosts);
        setItems(processedPosts);
        setHasMore(true);
        console.log(`[SIMPLE FEED] Ultra fallback loaded: ${processedPosts.length} posts`);
      } else {
        console.error('[SIMPLE FEED] Even ultra fallback failed:', error);
        setPosts([]);
        setItems([]);
        setHasMore(true); // Keep trying - social feeds never truly end
      }
    } catch (ultraError) {
      console.error('[SIMPLE FEED] Ultra fallback error:', ultraError);
      setPosts([]);
      setItems([]);
      setHasMore(true); // Keep trying - social feeds never truly end
    }
  }, []);

  // Fallback feed loading to ensure something always loads
  const loadFallbackFeed = useCallback(async () => {
    try {
      console.log('[SIMPLE FEED] Loading fallback feed...');
      const { data: fallbackPosts, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles!posts_author_id_fkey (username, avatar_url)
        `)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && fallbackPosts && fallbackPosts.length > 0) {
        const processedPosts = fallbackPosts.map(post => ({
          ...post,
          username: post.profiles?.username || 'User',
          avatar_url: post.profiles?.avatar_url || null,
          type: 'content',
          engagement_score: (post.like_count || 0) + (post.comment_count || 0),
          is_fallback: true
        }));

        setPosts(processedPosts);
        setItems(processedPosts);
        setHasMore(true);
        console.log(`[SIMPLE FEED] Fallback feed loaded: ${processedPosts.length} posts`);
      } else {
        console.error('[SIMPLE FEED] Fallback feed failed:', error);
        // Try even simpler ultra-fallback
        await loadUltraFallbackFeed();
      }
    } catch (fallbackError) {
      console.error('[SIMPLE FEED] Fallback feed error:', fallbackError);
      setPosts([]);
      setItems([]);
      setHasMore(true); // Keep trying - social feeds never truly end
    }
  }, [currentUserId, loadUltraFallbackFeed]);

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
        setHasMore(true); // Always true - social feeds should never end
        
        console.log(`[SIMPLE FEED] Initial load: ${contentPosts.length} videos, ${result.posts.length} total items`);
      } else {
        // If no posts, still show the empty state rather than permanent loading
        console.log('[SIMPLE FEED] No posts returned, trying fallback...');
        await loadFallbackFeed();
      }
      setLoading(false);
    } catch (error) {
      console.error('[SIMPLE FEED] Error in initial load:', error);
      // Try fallback feed
      await loadFallbackFeed();
      setLoading(false);
    }
  }, [currentUserId, loadFallbackFeed]);

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
          // Always keep hasMore true - social feeds should never end
          setHasMore(true);
        } else {
          console.log('[SIMPLE FEED] No new unique content, will recycle existing posts');
          // Instead of ending, recycle existing posts to keep feed infinite
          await recycleExistingPosts();
        }
      } else {
        console.log('[SIMPLE FEED] No posts from API, will recycle existing content');
        // Instead of ending feed, recycle existing posts
        await recycleExistingPosts();
      }
    } catch (error) {
      console.error('[SIMPLE FEED] Error loading more posts:', error);
      // On error, try to recycle existing posts instead of stopping
      await recycleExistingPosts();
    }
    
    setLoading(false);
  }, [currentUserId, posts, items, loading, hasMore]);

  // Refresh feed
  const refreshFeed = useCallback(async () => {
    if (refreshing || !currentUserId) {
      console.log('[SIMPLE FEED] Skipping refresh - already refreshing or no user');
      return;
    }
    
    console.log('[SIMPLE FEED] Starting refresh...');
    setRefreshing(true);
    
    try {
      const result = await VroomFeedManager.refreshFeed(currentUserId, 25);
      
      if (!result.error && result.posts && result.posts.length > 0) {
        const contentPosts = result.posts.filter(item => item.type !== 'ad');
        
        // For refresh, replace the content completely
        setPosts(contentPosts);
        setItems(result.posts);
        setHasMore(true);
        setCurrentVideoIndex(0);
        
        // Scroll to top after refresh
        if (flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            console.log('[SIMPLE FEED] 📍 Scrolled to top after refresh');
          }, 100);
        }
        
        console.log(`[SIMPLE FEED] ✅ Refresh successful: ${contentPosts.length} fresh posts`);
      } else {
        console.log('[SIMPLE FEED] ⚠️ No new posts from refresh');
      }
    } catch (error) {
      console.error('[SIMPLE FEED] ❌ Error refreshing feed:', error);
    } finally {
      setRefreshing(false);
    }
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

  // Only refresh on manual pull-to-refresh, not on focus

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
            progressViewOffset={0}
            enabled={true}
          />
        }
        bounces={true}
        scrollsToTop={true}
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