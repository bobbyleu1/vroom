// FriendsScreen renders the videos from users that the current user follows or
// is followed by, inserting a native advertisement after every tenth video.
// If no videos are available, a friendly message is displayed instead of the
// feed.

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
import NativeAdCard from '../components/NativeAdCard';

const { height } = Dimensions.get('window');
const ADS_FREQUENCY = 10;

function FriendsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const fetchFriendsVideos = async () => {
      setLoading(true);
      let friendOrMutualIds = [];
      try {
        // Retrieve the currently authenticated user
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
            content,
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
          .in('author_id', friendOrMutualIds)
          .order('created_at', { ascending: false }));
      }
      if (!error) {
        const videos = data || [];
        // Insert ads into the list of videos
        const itemsWithAds = [];
        let adCount = 0;
        videos.forEach((video, idx) => {
          if (idx > 0 && idx % ADS_FREQUENCY === 0) {
            adCount += 1;
            itemsWithAds.push({ type: 'ad', id: `ad-${adCount}` });
          }
          itemsWithAds.push({ type: 'video', ...video });
        });
        setItems(itemsWithAds);
      } else {
        console.error("Error fetching friends' videos:", error.message);
      }
      setLoading(false);
    };
    fetchFriendsVideos();
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
          <NativeAdCard />
        ) : (
          <VideoCard
            item={item}
            index={index}
            currentVideoIndex={currentVideoIndex}
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