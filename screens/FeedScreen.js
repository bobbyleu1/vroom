// screens/FeedScreen.js

// The FeedScreen renders the main video feed and seamlessly inserts
// full‑screen native advertisements after every tenth video. These ads
// use the NativeAdCardFeed component, which matches the look and feel
// of a typical video post while clearly marking the content as
// sponsored. Videos autoplay as the user scrolls through the feed.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FlatList, ActivityIndicator, Dimensions, StyleSheet, View, Text, Platform, RefreshControl, AppState } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard';
import NativeAdCardFeed from '../components/NativeAdCardFeed';
import { useNavigation } from '@react-navigation/native';
import { generateFeed, trackFeedInteraction } from '../utils/feedAlgorithm';
import { useScrollLock } from '../contexts/ScrollLockContext';
import { 
  getPersonalizedFeed, 
  recordVideoImpression, 
  startVideoView, 
  endVideoView,
  recordEngagement,
  personalizedFeed 
} from '../utils/personalizedFeed';

// Determine the snap interval for paging based on the full window height
const { height } = Dimensions.get('window');

// Number of video items between ads
const ADS_FREQUENCY = 10;

function FeedScreen() {
  const navigation = useNavigation();
  const { locked } = useScrollLock();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);

  // Session management as per spec
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [sessionOpenedAt, setSessionOpenedAt] = useState(() => new Date().toISOString());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const viewStartTime = useRef({});
  const refreshTimeoutRef = useRef(null);
  const flatListRef = useRef(null);
  const viewedPostIds = useRef(new Set());
  const [usePersonalizedFeed, setUsePersonalizedFeed] = useState(true);

  const refreshFeed = useCallback(async () => {
    if (refreshing) return; // Prevent multiple simultaneous refreshes
    
    console.log('FeedScreen: Refreshing feed...');
    setRefreshing(true);
    
    // Clear existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    try {
      console.log('FeedScreen: Refreshing feed with completely new content');
      
      let videos = [];
      if (usePersonalizedFeed) {
        // Increment refresh nonce for new lineup
        const newRefreshNonce = refreshNonce + 1;
        setRefreshNonce(newRefreshNonce);
        
        console.log('FeedScreen: Pull-to-refresh with nonce:', newRefreshNonce);
        
        // Get new feed with force_refresh=true and reset pagination
        const feedResult = await getPersonalizedFeed(
          currentUserId, 
          12, // Standard page size
          null, // Reset pagination (page_after = null)
          { 
            forceRefresh: true,
            sessionId: sessionId,
            sessionOpenedAt: sessionOpenedAt,
            refreshNonce: newRefreshNonce
          }
        );
        videos = feedResult.posts.filter(post => 
          (post.mux_hls_url || post.media_url || post.mux_playback_id) // Support Mux and direct URLs
        ).map(post => ({
          ...post,
          id: post.id,
          author_id: post.author_id,
          media_url: post.mux_hls_url || post.media_url, // Prefer Mux HLS URL
          playback_id: post.mux_playback_id,
          duration_ms: post.mux_duration_ms,
          file_type: 'video',
          profiles: {
            username: post.username,
            avatar_url: post.avatar_url
          }
        }));
        console.log('FeedScreen: Using personalized feed with', videos.length, 'videos');
      } else {
        // Fallback to algorithmic feed
        const algorithmicVideos = await generateFeed(currentUserId, 50);
        videos = algorithmicVideos.filter(post => 
          post.file_type === 'video' && post.media_url
        );
        console.log('FeedScreen: Using algorithmic feed with', videos.length, 'videos');
      }
      
      // Insert ads between videos
      const itemsWithAds = [];
      let adCount = 0;
      videos.forEach((video, idx) => {
        itemsWithAds.push({ type: 'video', ...video });
        if ((idx + 1) % ADS_FREQUENCY === 0) {
          adCount += 1;
          itemsWithAds.push({ type: 'ad', id: `ad-${adCount}-refresh` });
        }
      });
      
      setItems(itemsWithAds);
      setCurrentVideoIndex(0); // Reset to top
      
      // Scroll to top only if there are items
      if (flatListRef.current && itemsWithAds.length > 0) {
        flatListRef.current.scrollToIndex({ index: 0, animated: true });
      }
      
      console.log('FeedScreen: Feed refreshed with', videos.length, 'new videos');
      
    } catch (error) {
      console.error('Error refreshing feed:', error);
    }
    
    // Add delay to prevent too frequent refreshes
    refreshTimeoutRef.current = setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [currentUserId, refreshing, refreshNonce, sessionId, sessionOpenedAt, usePersonalizedFeed]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  // Handle app state changes for new sessions (cold start or foreground after long pause)
  useEffect(() => {
    let lastBackground = 0;
    
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'background') {
        lastBackground = Date.now();
      } else if (nextAppState === 'active') {
        const pauseDuration = Date.now() - lastBackground;
        // Start new session after 5 minutes of being in background
        if (pauseDuration > 5 * 60 * 1000) {
          console.log('FeedScreen: Starting new session after long pause:', pauseDuration, 'ms');
          setSessionId(uuidv4());
          setSessionOpenedAt(new Date().toISOString());
          setRefreshNonce(0);
          // Clear seen set
          seenSet.current.clear();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  // Register refresh callback for double tap
  useEffect(() => {
    console.log('FeedScreen: Registering refresh callback, currentUserId:', currentUserId);
    if (global.registerFeedRefresh) {
      global.registerFeedRefresh(refreshFeed);
      console.log('FeedScreen: Refresh callback registered successfully');
    } else {
      console.log('FeedScreen: global.registerFeedRefresh not available');
    }
    
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      // Cleanup personalized feed manager
      if (usePersonalizedFeed) {
        personalizedFeed.cleanup();
      }
    };
  }, [refreshFeed, usePersonalizedFeed]);

  useEffect(() => {
    const fetchFeed = async () => {
      setLoading(true);
      try {
        console.log('FeedScreen: Generating initial feed...');
        
        let videos = [];
        if (usePersonalizedFeed) {
          // Get initial feed with session parameters
          const feedResult = await getPersonalizedFeed(
            currentUserId, 
            12, // Standard page size
            null, // No pagination for initial load
            {
              forceRefresh: false, // Don't force refresh on initial load
              sessionId: sessionId,
              sessionOpenedAt: sessionOpenedAt,
              refreshNonce: refreshNonce // Should be 0 for initial load
            }
          );
          
          videos = feedResult.posts.filter(post => 
            (post.mux_hls_url || post.media_url || post.mux_playback_id)
          ).map(post => ({
            ...post,
            id: post.id,
            author_id: post.author_id,
            media_url: post.mux_hls_url || post.media_url,
            playback_id: post.mux_playback_id,
            duration_ms: post.mux_duration_ms,
            file_type: 'video',
            profiles: {
              username: post.username,
              avatar_url: post.avatar_url
            }
          }));
          console.log('FeedScreen: Initial personalized feed with', videos.length, 'videos');
          console.log('FeedScreen: Sample video data:', videos[0]);
        } else {
          // Use the algorithm to get personalized feed (excluding previously viewed posts)
          const algorithmicVideos = await generateFeed(currentUserId, 50);
          
          // Filter for videos only (algorithm might return other content types)
          videos = algorithmicVideos.filter(post => 
            post.file_type === 'video' && post.media_url
          );
          console.log('FeedScreen: Initial algorithmic feed with', videos.length, 'videos');
        }
        
        // Insert ads between videos
        const itemsWithAds = [];
        let adCount = 0;
        videos.forEach((video, idx) => {
          itemsWithAds.push({ type: 'video', ...video });
          // Add ad after every ADS_FREQUENCY items (not at index 0)
          if ((idx + 1) % ADS_FREQUENCY === 0) {
            adCount += 1;
            itemsWithAds.push({ type: 'ad', id: `ad-${adCount}` });
          }
        });
        
        setItems(itemsWithAds);
        console.log('FeedScreen: Feed generated with', videos.length, 'videos');
        console.log('FeedScreen: Total items with ads:', itemsWithAds.length);
        
      } catch (error) {
        console.error('Error generating algorithmic feed:', error);
        
        // Fallback to simple chronological feed
        const { data, error: fallbackError } = await supabase
          .from('posts')
          .select(`
            id,
            media_url,
            thumbnail_url,
            content,
            file_type,
            like_count,
            comment_count,
            view_count,
            author_id,
            profiles (
              username,
              avatar_url
            )
          `)
          .eq('file_type', 'video')
          .order('created_at', { ascending: false })
          .limit(30);
          
        if (!fallbackError) {
          const videos = data || [];
          const itemsWithAds = [];
          let adCount = 0;
          videos.forEach((video, idx) => {
            itemsWithAds.push({ type: 'video', ...video });
            if ((idx + 1) % ADS_FREQUENCY === 0) {
              adCount += 1;
              itemsWithAds.push({ type: 'ad', id: `ad-${adCount}` });
            }
          });
          setItems(itemsWithAds);
          console.log('FeedScreen: Using fallback chronological feed');
        }
      }
      setLoading(false);
    };

    if (currentUserId !== null) { // Wait for user ID (null check allows for anonymous users)
      fetchFeed();
    }
  }, [currentUserId, usePersonalizedFeed]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      const currentItem = items[newIndex];
      
      console.log('FeedScreen: Viewable item changed to index:', newIndex);
      
      // Track view end for previous video
      if (currentVideoIndex !== newIndex) {
        const prevItem = items[currentVideoIndex];
        if (prevItem && prevItem.type === 'video' && currentUserId) {
          if (usePersonalizedFeed) {
            // Use new personalized feed tracking
            const watchDurationMs = endVideoView(currentUserId, prevItem.id, 'view');
            console.log('FeedScreen: Tracked view end for post', prevItem.id, 'duration:', watchDurationMs);
          } else {
            // Legacy tracking
            const viewDuration = Date.now() - (viewStartTime.current[prevItem.id] || Date.now());
            const watchDurationSeconds = Math.floor(viewDuration / 1000);
            
            const estimatedVideoDuration = 30;
            const completionRate = Math.min(1, watchDurationSeconds / estimatedVideoDuration);
            
            trackFeedInteraction(currentUserId, prevItem.id, 'view', {
              watchDuration: watchDurationSeconds,
              completionRate,
              sessionId: sessionId
            });
          }
        }
      }
      
      // Track view start for new video
      if (currentItem && currentItem.type === 'video') {
        if (usePersonalizedFeed) {
          // Use new personalized feed tracking
          startVideoView(currentItem.id);
          console.log('FeedScreen: Started tracking view for post', currentItem.id);
        } else {
          // Legacy tracking
          viewStartTime.current[currentItem.id] = Date.now();
        }
        
        // Add to viewed posts set (for session tracking)
        viewedPostIds.current.add(currentItem.id);
      }
      
      setCurrentVideoIndex(newIndex);
    }
  }, [items, currentVideoIndex, currentUserId]);

  if (loading) {
    return (
      <ActivityIndicator
        size="large"
        color="#00BFFF"
        style={styles.loadingIndicator}
      />
    );
  }

  return (
    <View style={styles.container}>
      {refreshing && (
        <View style={styles.refreshIndicator}>
          <ActivityIndicator size="small" color="#00BFFF" />
          <Text style={styles.refreshText}>Refreshing feed...</Text>
        </View>
      )}
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item, index) =>
          item.type === 'ad' ? item.id : item.id?.toString() ?? index.toString()
        }
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ 
          itemVisiblePercentThreshold: 80,
          minimumViewTime: 100
        }}
        // Performance optimizations to prevent freezing
        removeClippedSubviews={true}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        getItemLayout={(data, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        scrollEnabled={!locked}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFeed}
            tintColor="#00BFFF"
            title="Pull to refresh"
            titleColor="#00BFFF"
          />
        }
        renderItem={({ item, index }) =>
          item.type === 'ad' ? (
            <NativeAdCardFeed />
          ) : (
            <VideoCard
              item={item}
              index={index}
              currentVideoIndex={currentVideoIndex}
              navigation={navigation}
              onCommentsModalChange={setIsCommentsModalOpen}
              isAnyCommentsModalOpen={isCommentsModalOpen}
            />
          )
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
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 10,
    zIndex: 1000,
  },
  refreshText: {
    color: '#00BFFF',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default FeedScreen;