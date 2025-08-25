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

// Determine the snap interval for paging based on the full window height
const { height } = Dimensions.get('window');

// Number of video items between ads
const ADS_FREQUENCY = 10;

function FriendsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const fetchFriendsVideos = async () => {
      setLoading(true);
      console.log('FriendsScreen: Starting to fetch friends videos');
      let friendOrMutualIds = [];
      try {
        // Retrieve the currently authenticated user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        console.log('FriendsScreen: Got user:', user?.id);
        if (user) {
          // Users the current user is following
          const { data: followingData, error: followingError } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', user.id);
          if (followingError) throw followingError;
          const followedUsers = followingData ? followingData.map((f) => f.following_id) : [];
          // Users who follow the current user
          const { data: followersData, error: followersError } = await supabase
            .from('user_follows')
            .select('follower_id')
            .eq('following_id', user.id);
          if (followersError) throw followersError;
          const mutualFollowers = followersData ? followersData.map((f) => f.follower_id) : [];
          friendOrMutualIds = [...new Set([...followedUsers, ...mutualFollowers])];
          console.log('FriendsScreen: Found friend/mutual IDs:', friendOrMutualIds.length);
        }
      } catch (error) {
        console.error('Error fetching friend/mutual IDs:', error.message);
        setLoading(false);
        return;
      }
      let data = [];
      let error = null;
      // Fetch only if there are friend or mutual IDs
      if (friendOrMutualIds.length > 0) {
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
            profiles:author_id (
              username,
              avatar_url
            )
          `)
          .eq('file_type', 'video')
          .in('author_id', friendOrMutualIds)
          .order('created_at', { ascending: false }));
      }
      if (!error) {
        const videos = data || [];
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
        console.log('FriendsScreen: Total videos:', videos.length, 'Items with ads:', itemsWithAds.length);
        setItems(itemsWithAds);
      } else {
        console.error("Error fetching friends' videos:", error.message);
      }
      console.log('FriendsScreen: Fetch completed, setting loading to false');
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

  if (loading) {
    return (
      <ActivityIndicator
        size="large"
        color="#00BFFF"
        style={styles.loadingIndicator}
      />
    );
  }

  // Determine if there are any video items in the list
  const hasVideos = items.some((item) => item.type === 'video');
  if (!hasVideos) {
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
    <FlatList
      data={items}
      keyExtractor={(item, index) =>
        item.type === 'ad' ? item.id : item.id?.toString() ?? index.toString()
      }
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
      renderItem={({ item, index }) =>
        item.type === 'ad' ? (
          <NativeAdCardFeed />
        ) : (
          <VideoCard
            item={item}
            index={index}
            currentVideoIndex={currentVideoIndex}
            navigation={navigation}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
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