// screens/FriendsScreen.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { FlatList, ActivityIndicator, Dimensions, StyleSheet, View, Text } from 'react-native';
import { supabase } from '../utils/supabase'; // Ensure this path is correct
import VideoCard from '../components/VideoCard'; // Ensure this path is correct

const { height } = Dimensions.get('window');

function FriendsScreen() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const fetchFriendsVideos = async () => {
      setLoading(true);
      let friendOrMutualIds = []; // This will hold the IDs of users whose posts we want to show

      // --- START: YOUR CUSTOM SUPABASE LOGIC TO FETCH FRIEND/MUTUAL IDs ---
      // This is the section you will replace with the precise Supabase query or RPC call
      // that your "Lovable AI" provides for fetching posts from direct follows/mutuals.
      //
      // For now, as a temporary placeholder, this will fetch ALL videos (like FeedScreen).
      // You will replace this entire 'try...catch' block with the actual logic once you get it.

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Fetch users the current user is FOLLOWING
          const { data: followingData, error: followingError } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', user.id);

          if (followingError) throw followingError;

          const followedUsers = followingData ? followingData.map(f => f.following_id) : [];

          // Fetch users who are FOLLOWING the current user
          const { data: followersData, error: followersError } = await supabase
            .from('user_follows')
            .select('follower_id')
            .eq('following_id', user.id);

          if (followersError) throw followersError;

          const mutualFollowers = followersData ? followersData.map(f => f.follower_id) : [];

          // Combine both lists and ensure uniqueness
          friendOrMutualIds = [...new Set([...followedUsers, ...mutualFollowers])];

          // If you want to include the current user's own posts on their friends feed:
          // friendOrMutualIds.push(user.id);
          // friendOrMutualIds = [...new Set(friendOrMutualIds)]; // Ensure uniqueness after adding self

        }
      } catch (error) {
        console.error("Error fetching friend/mutual IDs (placeholder logic):", error.message);
        setLoading(false);
        return;
      }
      // --- END: YOUR CUSTOM SUPABASE LOGIC TO FETCH FRIEND/MUTUAL IDs ---


      // Now fetch posts only from those friend/mutual IDs
      let { data, error } = { data: [], error: null }; // Initialize data and error

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
          .in('author_id', friendOrMutualIds) // Filter posts by the determined friend/mutual IDs
          .order('created_at', { ascending: false }));
      } else {
        console.log("No friend/mutual IDs found or user not logged in. Friends feed will be empty.");
      }

      if (!error) {
        setVideos(data || []);
      } else {
        console.error("Error fetching friends' videos (final fetch):", error.message);
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
    return <ActivityIndicator size="large" color="#00BFFF" style={styles.loadingIndicator} />;
  }

  // Display a message if no friends' videos are found
  if (videos.length === 0 && !loading) {
    return (
      <View style={styles.emptyFeedContainer}>
        <Text style={styles.emptyFeedText}>No videos from your friends yet!</Text>
        <Text style={styles.emptyFeedSubText}>Start following people, or get them to follow you back, to see their posts here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 80
      }}
      renderItem={({ item, index }) => (
        <VideoCard
          item={item}
          index={index}
          currentVideoIndex={currentVideoIndex}
        />
      )}
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