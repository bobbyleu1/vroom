// screens/UserPostsFeedScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Text,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../utils/supabase';
import VideoCard from '../components/VideoCard'; // Assuming this path is correct
import { Ionicons } from '@expo/vector-icons'; // For back button

const { height: windowHeight } = Dimensions.get('window');

function UserPostsFeedScreen({ route, navigation }) {
  const { userId, initialPostIndex = 0, postsData = null, sourceTab = 'posts', openComments = false } = route.params; // Get userId and initial index
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(initialPostIndex);
  const [currentUserId, setCurrentUserId] = useState(null);
  const flatListRef = useRef(null);

  // Get current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const fetchUserPosts = async () => {
      setLoading(true);
      
      // If postsData is provided, use it instead of fetching
      if (postsData) {
        setPosts(postsData);
        // Ensure initial index is valid
        if (initialPostIndex >= postsData.length) {
          setCurrentVideoIndex(0); // Reset to 0 if initial index is out of bounds
        } else {
          setCurrentVideoIndex(initialPostIndex);
        }
        setLoading(false);
        return;
      }
      
      // Otherwise, fetch user posts from database
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          playback_id,
          mux_playback_id,
          mux_hls_url,
          profiles!posts_author_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching user posts for feed:", error.message);
        Alert.alert("Error", "Could not load posts for this user.");
        setPosts([]);
      } else {
        setPosts(data || []);
        // Ensure initial index is valid
        if (initialPostIndex >= (data?.length || 0)) {
          setCurrentVideoIndex(0); // Reset to 0 if initial index is out of bounds
        } else {
          setCurrentVideoIndex(initialPostIndex);
        }
      }
      setLoading(false);
    };

    fetchUserPosts();
  }, [userId, initialPostIndex, postsData]);

  // Scroll to the initial post when data is loaded
  useEffect(() => {
    if (!loading && posts.length > 0 && flatListRef.current) {
      // Use setTimeout to ensure the FlatList has rendered its items
      setTimeout(() => {
        flatListRef.current.scrollToIndex({
          index: currentVideoIndex,
          animated: false, // Set to true for a smooth scroll, false for instant
        });
      }, 100); // Small delay
    }
  }, [loading, posts, currentVideoIndex]);


  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentVideoIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50, // Consider item as viewable if 50% of it is visible
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.errorText}>No posts found for this user.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={30} color="#fff" />
      </TouchableOpacity>
      <FlatList
        ref={flatListRef}
        data={posts}
        renderItem={({ item, index }) => (
          <VideoCard
            item={item}
            index={index}
            currentVideoIndex={currentVideoIndex}
            navigation={navigation}
            currentUserId={currentUserId}
            shouldOpenComments={openComments && index === initialPostIndex}
            onPostDeleted={(deletedPostId) => {
              setPosts(prevPosts => prevPosts.filter(post => post.id !== deletedPostId));
            }}
          />
        )}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={windowHeight} // Each item takes full screen height
        snapToAlignment={'start'}
        decelerationRate={'fast'}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialScrollIndex={initialPostIndex} // Set initial scroll position
        getItemLayout={(data, index) => (
          { length: windowHeight, offset: windowHeight * index, index }
        )}
      />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20, // Adjust for iOS notch
    left: 10,
    zIndex: 10, // Ensure it's above the FlatList
    padding: 10, // Make touchable area larger
  },
});

export default UserPostsFeedScreen;