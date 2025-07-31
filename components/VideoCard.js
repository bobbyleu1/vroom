// components/VideoCard.js

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { Video } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import ActionBar from './ActionBar';
import CommentsModal from './CommentsModal';

// Grab the device dimensions once so we can calculate responsive styles
const { height, width } = Dimensions.get('window');

/**
 * Format a numeric count into a more human‑readable string. For example
 * 1234 → "1.2K". Values under 1k are returned as‑is.
 *
 * @param {number|null|undefined} num The number to format
 * @returns {string}
*/
const formatCount = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
};

/**
 * VideoCard renders a single vertical video along with the associated meta
 * information (author, caption, like/comment buttons, etc.) similar to a
 * TikTok or Instagram Reels card.
 *
 * It handles playing/pausing the video based on visibility and user
 * interactions such as double tapping to like and opening the comments
 * modal. Like and comment counts are kept in sync with Supabase in real
 * time via a channel subscription.
*/
function VideoCard({ item, index, currentVideoIndex, navigation }) {
  const videoRef = useRef(null);
  const [heartScale] = useState(new Animated.Value(0));
  const [currentUserId, setCurrentUserId] = useState(null);
  const [hasLiked, setHasLiked] = useState(false);
  // localLikeCount and commentCount mirror the values in Supabase and are
  // updated both optimistically when the user likes/unlikes and via the
  // realtime subscription below.
  const [localLikeCount, setLocalLikeCount] = useState(item.like_count || 0);
  const [commentCount, setCommentCount] = useState(item.comment_count || 0);
  const [isCommentsModalVisible, setIsCommentsModalVisible] = useState(false);

  // Fetch the authenticated user's ID on mount
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  /**
   * Determine whether the current user has liked this post. Supabase RLS
   * ensures each user can only see their own like record. We call this
   * whenever the user ID or post ID changes.
   */
  const fetchUserLikeStatus = useCallback(async () => {
    if (!currentUserId || !item.id) return;
    const { data, error } = await supabase
      .from('post_likes')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('post_id', item.id)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching like status:', error.message);
    } else {
      setHasLiked(!!data);
    }
  }, [currentUserId, item.id]);

  useEffect(() => {
    if (currentUserId) {
      fetchUserLikeStatus();
    }
  }, [currentUserId, fetchUserLikeStatus]);

  /**
   * Fetch the latest like_count and comment_count from Supabase for this
   * post. This runs when the component mounts and whenever the post ID
   * changes. It ensures our counts are in sync even if the feed item is
   * stale. We also set up a realtime channel subscription to listen for
   * updates on this specific post row.
   */
  /**
   * Fetch and subscribe to like/comment counts for this post. Exposed as a
   * function so it can also be triggered manually (e.g. when closing the
   * comments modal). The subscription listens for updates on the posts table
   * filtered by this post's ID.
   */
  const refreshCounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('like_count, comment_count')
      .eq('id', item.id)
      .single();
    if (!error && data) {
      setLocalLikeCount(data.like_count);
      setCommentCount(data.comment_count);
    } else if (error) {
      console.error('Error fetching counts:', error.message);
    }
  }, [item.id]);

  useEffect(() => {
    // Initially fetch counts
    refreshCounts();
    // Set up realtime subscription for this post
    const channel = supabase
      .channel(`public:posts:${item.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${item.id}` },
        (payload) => {
          const { like_count: newLikeCount, comment_count: newCommentCount } = payload.new;
          setLocalLikeCount(newLikeCount);
          setCommentCount(newCommentCount);
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [item.id, refreshCounts]);

  /**
   * Auto‑play or pause the video depending on whether it is the currently
   * visible card. The FeedScreen passes down the index of the visible card
   * via currentVideoIndex.
   */
  useEffect(() => {
    if (videoRef.current) {
      if (index === currentVideoIndex) {
        videoRef.current.playAsync();
      } else {
        videoRef.current.pauseAsync().catch(() => {});
      }
    }
  }, [index, currentVideoIndex]);

  // Pause the video when the screen loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      };
    }, []),
  );

  /**
   * Scale and fade the heart icon when a like is triggered. This uses
   * Animated.sequence to handle the in/out timing.
   */
  const animateHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 2,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 0,
        friction: 2,
        tension: 40,
        useNativeDriver: true,
        delay: 500,
      }),
    ]).start();
  };

  /**
   * Handle liking or unliking the post. We optimistically update UI and
   * revert if an error occurs. The actual insertion/deletion in
   * post_likes will trigger the database trigger to update posts.like_count,
   * which our realtime subscription above will catch.
   */
  const handleLike = async () => {
    if (!currentUserId) {
      Alert.alert('Login Required', 'Please log in to like posts.');
      return;
    }
    // Capture current like state before toggling to avoid race conditions
    const currentlyLiked = hasLiked;
    // Optimistically update UI
    setHasLiked(!currentlyLiked);
    setLocalLikeCount((prevCount) => prevCount + (currentlyLiked ? -1 : 1));
    try {
      if (currentlyLiked) {
        // User is unliking
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', item.id);
        if (error) {
          console.error('Error unliking post:', error.message);
          Alert.alert('Error', 'Failed to unlike post. Please try again.');
          // Revert optimistic update
          setHasLiked((prev) => !prev);
          setLocalLikeCount((prevCount) => prevCount + 1);
        }
      } else {
        // User is liking
        const { error } = await supabase
          .from('post_likes')
          .insert({ user_id: currentUserId, post_id: item.id });
        if (error) {
          console.error('Error liking post:', error.message);
          Alert.alert('Error', 'Failed to like post. Please try again.');
          // Revert optimistic update
          setHasLiked((prev) => !prev);
          setLocalLikeCount((prevCount) => prevCount - 1);
        }
      }
    } catch (error) {
      console.error('Exception during like/unlike:', error.message);
      Alert.alert('Error', 'An unexpected error occurred.');
      // Revert optimistic update
      setHasLiked((prev) => !prev);
      setLocalLikeCount((prevCount) => prevCount + (currentlyLiked ? 1 : -1));
    }
  };

  /**
   * Trigger the heart animation and like action on a double tap. Disabled
   * when the comments modal is open so the user can scroll freely.
   */
  const handleDoubleTap = () => {
    if (!isCommentsModalVisible) {
      animateHeart();
      if (!hasLiked) {
        handleLike();
      }
    }
  };

  // Show the comments modal
  const handleComment = () => {
    setIsCommentsModalVisible(true);
  };

  // Placeholder share handler
  const handleShare = () => {
    console.log(`Share post: ${item.id}`);
    Alert.alert('Share', 'This would open the share options for the post.');
  };

  /**
   * Handles navigating to the user's profile page when their avatar or username is pressed.
   */
  const handleProfilePress = () => {
    if (navigation && item.author_id) {
      // You'll need to have a 'UserProfile' screen registered in your navigator
      navigation.navigate('UserProfile', { userId: item.author_id });
    } else {
      console.warn("Navigation prop or author_id missing, cannot navigate to profile.");
      Alert.alert('Error', 'Could not open user profile.');
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleDoubleTap}
      style={styles.videoContainer}
      // Disable interactions when the comments modal is open
      disabled={isCommentsModalVisible}
    >
      <Video
        ref={videoRef}
        source={{ uri: item.media_url }}
        style={styles.videoPlayer}
        resizeMode="cover"
        isLooping
        shouldPlay={false} // Controlled externally via useEffect
      />
      {/* Overlay for text and actions */}
      <View style={styles.overlayContainer}>
        {/* Left side: Username and Caption */}
        <TouchableOpacity onPress={handleProfilePress} style={styles.leftContent}>
          {item.profiles?.username && (
            <Text style={styles.usernameText}>@{item.profiles.username}</Text>
          )}
          {item.content ? (
            // Use numberOfLines and ellipsizeMode to truncate long captions to
            // two lines rather than allowing scrolling or overlap.
            <Text
              style={styles.captionText}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.content}
            </Text>
          ) : null}
        </TouchableOpacity>
        {/* Animated Heart Overlay */}
        <Animated.View
          style={[
            styles.animatedHeart,
            {
              opacity: heartScale,
              transform: [{ scale: heartScale }],
            },
          ]}
        >
          <AntDesign name="heart" size={100} color="white" />
        </Animated.View>
      </View>
      {/* Avatar - Now wrapped in TouchableOpacity */}
      {item.profiles?.avatar_url && (
        <TouchableOpacity onPress={handleProfilePress} style={styles.avatarContainer}>
          <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
        </TouchableOpacity>
      )}
      {/* Action Bar */}
      <ActionBar
        post={item}
        hasLiked={hasLiked}
        localLikeCount={localLikeCount}
        commentCount={commentCount}
        onLikePress={handleLike}
        onCommentPress={handleComment}
        onSharePress={handleShare}
      />
      {/* Comments Modal */}
      <CommentsModal
        isVisible={isCommentsModalVisible}
        onClose={() => {
          setIsCommentsModalVisible(false);
          // Refresh counts when closing the modal to pick up any new comments
          refreshCounts();
        }}
        postId={item.id}
        postCommentCount={commentCount}
      />
    </TouchableOpacity>
  );
}

// Stylesheet for the component. Many values are derived from the screen
// dimensions so the layout adapts gracefully to different device sizes.
const styles = StyleSheet.create({
  videoContainer: {
    height: height,
    width: width,
    backgroundColor: '#000',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  leftContent: {
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 10,
    paddingBottom: 10,
  },
  usernameText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  avatarContainer: {
    position: 'absolute',
    right: 12,
    top: height * 0.45,
    zIndex: 1, // Ensure the TouchableOpacity is above other elements
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#00BFFF',
    backgroundColor: '#333',
  },
  animatedHeart: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateX: -50 }, { translateY: -50 }],
  },
});

export default VideoCard;