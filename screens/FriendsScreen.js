// screens/FriendsScreen.js

// FriendsScreen renders the videos from users that the current user
// follows or is followed by, inserting a full‑screen native
// advertisement after every tenth video. If no videos are available,
// a friendly message is displayed instead of the feed.

import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard';
import NativeAdCardFeed from '../components/NativeAdCardFeed';
import ErrorBoundary from '../components/ErrorBoundary';

// Determine the snap interval for paging based on the full window height
const { height } = Dimensions.get('window');

// Number of video items between ads
const ADS_FREQUENCY = 10;

function FriendsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const fetchFriendsVideos = async () => {
      setLoading(true);
      console.log('🔵 [FriendsScreen] Starting to fetch friends videos');
      let friendOrMutualIds = [];
      try {
        // Retrieve the currently authenticated user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        console.log('🔵 [FriendsScreen] Got user:', user?.id);
        if (user) {
          setCurrentUserId(user.id);
          // Users the current user is following
          const { data: followingData, error: followingError } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', user.id);
          if (followingError) {
            console.error('🔴 [FriendsScreen] Following error:', followingError);
          } else {
            console.log('🔵 [FriendsScreen] Following data:', followingData?.length || 0, 'users');
          }
          const followedUsers = followingData ? followingData.map((f) => f.following_id) : [];
          
          // Users who follow the current user
          const { data: followersData, error: followersError } = await supabase
            .from('user_follows')
            .select('follower_id')
            .eq('following_id', user.id);
          if (followersError) {
            console.error('🔴 [FriendsScreen] Followers error:', followersError);
          } else {
            console.log('🔵 [FriendsScreen] Followers data:', followersData?.length || 0, 'users');
          }
          const mutualFollowers = followersData ? followersData.map((f) => f.follower_id) : [];
          friendOrMutualIds = [...new Set([...followedUsers, ...mutualFollowers])];
          console.log('🔵 [FriendsScreen] Combined friend/mutual IDs:', friendOrMutualIds.length);
        } else {
          console.log('🔴 [FriendsScreen] No authenticated user found');
        }
      } catch (error) {
        console.error('🔴 [FriendsScreen] Error fetching friend/mutual IDs:', error);
        // Still try to continue with empty friends list rather than crash
        friendOrMutualIds = [];
      }
      let data = [];
      let error = null;
      
      // Fetch only if there are friend or mutual IDs
      if (friendOrMutualIds.length > 0) {
        console.log('🔵 [FriendsScreen] Fetching posts for', friendOrMutualIds.length, 'friends');
        try {
          ({ data, error } = await supabase
            .from('posts')
            .select(`
              id,
              media_url,
              thumbnail_url,
              content,
              like_count,
              comment_count,
              view_count,
              author_id,
              profiles!posts_author_id_fkey (
                username,
                avatar_url
              )
            `)
            .eq('file_type', 'video')
            .in('author_id', friendOrMutualIds)
            .order('created_at', { ascending: false }));
            
          if (error) {
            console.error('🔴 [FriendsScreen] Posts query error:', error);
          } else {
            console.log('🔵 [FriendsScreen] Posts query successful:', data?.length || 0, 'videos');
          }
        } catch (fetchError) {
          console.error('🔴 [FriendsScreen] Posts query exception:', fetchError);
          error = fetchError;
          data = [];
        }
      } else {
        console.log('🟡 [FriendsScreen] No friends found, skipping posts query');
      }
      
      if (!error && data) {
        const videos = data || [];
        console.log('🔵 [FriendsScreen] Raw data received:', videos.length, 'videos');
        console.log('🔵 [FriendsScreen] Sample video data:', videos[0]);
        
        // Insert a full‑screen ad after every ADS_FREQUENCY videos
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
        console.log('🔵 [FriendsScreen] Total videos:', videos.length, 'Items with ads:', itemsWithAds.length);
        console.log('🔵 [FriendsScreen] Sample processed item:', itemsWithAds[0]);
        setItems(itemsWithAds);
      } else {
        console.error('🔴 [FriendsScreen] Error fetching friends videos or no data:', error);
        // Set empty items to show the "no friends" message instead of white screen
        setItems([]);
      }
      console.log('🔵 [FriendsScreen] Fetch completed, setting loading to false');
      setLoading(false);
    };
    
    fetchFriendsVideos().catch((error) => {
      console.error('FriendsScreen: Unhandled error:', error);
      setLoading(false);
    });
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentVideoIndex(viewableItems[0].index);
    }
  }, []);

  // Add missing callback functions for VideoCard
  const onCommentsModalChange = useCallback(() => {}, []);
  const onPostDeleted = useCallback((deletedPostId) => {
    setItems(prevItems => prevItems.filter(prevItem => prevItem.id !== deletedPostId));
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingIndicator}>
        <ActivityIndicator size="large" color="#00BFFF" />
        <Text style={styles.loadingText}>Loading friends' videos...</Text>
      </View>
    );
  }

  // Always show something - never a white screen
  // Check if we have any items at all (videos or ads)
  if (items.length === 0) {
    return (
      <View style={styles.emptyFeedContainer}>
        <Text style={styles.emptyFeedText}>No videos from your friends yet!</Text>
        <Text style={styles.emptyFeedSubText}>
          Start following people or get them to follow you back to see their posts here.
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <FlatList
        data={items}
        keyExtractor={(item, index) =>
          item.type === 'ad' ? item.id : `video-${item.id}-${index}`
        }
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        style={{ backgroundColor: '#000' }}
        contentContainerStyle={{ backgroundColor: '#000' }}
        renderItem={({ item, index }) =>
          item.type === 'ad' ? (
            <NativeAdCardFeed />
          ) : (
            <VideoCard
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
          )
        }
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  emptyFeedContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyFeedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyFeedSubText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default FriendsScreen;