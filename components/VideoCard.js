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
  Platform,
} from 'react-native';
import { isTablet } from '../utils/device';
import { VroomPlayer } from './VroomPlayer';
import VideoDebug from '../src/components/VideoDebug.tsx';
import { useFocusEffect } from '@react-navigation/native';
import { FEED_DIAG_MODE } from '../src/feed/diag';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import ActionBar from './ActionBar';
import CommentsSheet from './CommentsSheet';
import { savePost, unsavePost } from '../utils/supabaseSaved';
import { recordEngagement } from '../utils/personalizedFeed';
import { notifyPostLike } from '../utils/notificationHelpers';
import { getProfileImageSource } from '../utils/profileHelpers';
import * as Haptics from 'expo-haptics';
import PhoneViewport from './PhoneViewport';

// Grab the device dimensions once so we can calculate responsive styles
const { height, width } = Dimensions.get('window');

// Force iPhone-only behavior - isTablet is now always false from utils/device

// For iPad, we'll create a phone-sized container in the center
const getPhoneContainerWidth = () => {
  if (isTablet) {
    // Use iPhone 15 Pro Max width (430px) or similar phone aspect ratio
    const phoneWidth = Math.min(430, height * (9/21)); // 9:21 phone aspect ratio
    return phoneWidth;
  }
  return width; // Phone: use full width
};

const getPhoneContainerHeight = () => {
  if (isTablet) {
    const phoneWidth = getPhoneContainerWidth();
    return phoneWidth * (21/9); // Phone aspect ratio 9:21
  }
  return height; // Phone: use full height
};

const getContainerMarginLeft = () => {
  if (isTablet) {
    return (width - getPhoneContainerWidth()) / 2;
  }
  return 0; // Phone: no margin
};

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
const VideoCard = React.memo(({ item, index, currentVideoIndex, navigation, onCommentsModalChange, isAnyCommentsModalOpen, currentUserId, onPostDeleted, disableIPadCentering = false, usePhoneViewport = false }) => {
  const videoRef = useRef(null);
  const [heartScale] = useState(new Animated.Value(0));
  const [playPauseScale] = useState(new Animated.Value(0));
  const [loggedInUserId, setLoggedInUserId] = useState(null);
  const [hasLiked, setHasLiked] = useState(false);
  // localLikeCount and commentCount mirror the values in Supabase and are
  // updated both optimistically when the user likes/unlikes and via the
  // realtime subscription below.
  const [localLikeCount, setLocalLikeCount] = useState(item.like_count || 0);
  const [commentCount, setCommentCount] = useState(0);
  const [isCommentsModalVisible, setIsCommentsModalVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaved, setIsSaved] = useState(Boolean(item?.saved_by_user));
  const [savePending, setSavePending] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [showThumbnail, setShowThumbnail] = useState(true);
  const [avatarError, setAvatarError] = useState(false);
  
  // Double tap detection
  const lastTap = useRef(null);
  const DOUBLE_TAP_DELAY = 300;

  // Fetch the authenticated user's ID on mount
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setLoggedInUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  /**
   * Fetch accurate comment count using canonical visibility filter
   */
  const fetchCommentCount = useCallback(async () => {
    if (!currentUserId || !item.id) return;
    
    try {
      const { data, error } = await supabase.rpc('get_comment_summary', {
        post_id: item.id,
        viewer_id: currentUserId
      });

      if (error) {
        console.error('Error fetching comment summary:', error);
        return;
      }

      if (data && data.length > 0) {
        const summary = data[0];
        setCommentCount(summary.display_count || 0);
      }
    } catch (error) {
      console.error('Exception in fetchCommentCount:', error);
    }
  }, [currentUserId, item.id]);

  /**
   * Determine whether the current user has liked this post and sync counts.
   * This ensures the UI state matches the database state.
   */
  const fetchUserLikeStatus = useCallback(async () => {
    if (!currentUserId || !item.id) return;
    
    try {
      // Check if user has liked this post and get current like count
      const [likeResult, postResult] = await Promise.all([
        supabase
          .from('post_likes')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('post_id', item.id)
          .single(),
        supabase
          .from('posts')
          .select('like_count')
          .eq('id', item.id)
          .single()
      ]);
      
      // Update like status
      if (likeResult.error && likeResult.error.code !== 'PGRST116') {
        console.error('Error fetching like status:', likeResult.error.message);
      } else {
        const userHasLiked = !!likeResult.data;
        setHasLiked(userHasLiked);
        console.log(`VideoCard ${item.id}: User ${userHasLiked ? 'has' : 'has not'} liked this post`);
      }
      
      // Update like count from database
      if (!postResult.error && postResult.data) {
        setLocalLikeCount(postResult.data.like_count || 0);
        console.log(`VideoCard ${item.id}: Synced counts - likes: ${postResult.data.like_count}, comments: ${commentCount}`);
      }
      
      // Fetch accurate comment count using canonical filter
      fetchCommentCount();
      
    } catch (error) {
      console.error('Error syncing like status and counts:', error);
    }
  }, [currentUserId, item.id, fetchCommentCount, commentCount]);

  useEffect(() => {
    if (currentUserId) {
      fetchUserLikeStatus();
    }
  }, [currentUserId, fetchUserLikeStatus]);

  // Also refresh like status when the video becomes visible
  useEffect(() => {
    if (index === currentVideoIndex && currentUserId) {
      // Small delay to avoid too many calls
      const timer = setTimeout(() => {
        fetchUserLikeStatus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [index, currentVideoIndex, currentUserId, fetchUserLikeStatus]);

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
    if (!currentUserId) return;
    
    // Get like count from posts table
    const { data, error } = await supabase
      .from('posts')
      .select('like_count')
      .eq('id', item.id)
      .single();
    if (!error && data) {
      setLocalLikeCount(data.like_count);
    } else if (error) {
      console.error('Error fetching like count:', error.message);
    }
    
    // Get accurate comment count using canonical filter
    fetchCommentCount();
  }, [item.id, currentUserId, fetchCommentCount]);

  useEffect(() => {
    if (!currentUserId) return;
    
    // Initially fetch counts
    refreshCounts();
    
    // Set up realtime subscription for this post and its comments
    const channel = supabase
      .channel(`video-card:${item.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${item.id}` },
        (payload) => {
          const { like_count: newLikeCount } = payload.new;
          setLocalLikeCount(newLikeCount);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${item.id}` },
        () => {
          // Refresh comment count when comments change
          fetchCommentCount();
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [item.id, currentUserId, refreshCounts, fetchCommentCount]);

  /**
   * Enhanced video playback logic with preloading support
   */
  useEffect(() => {
    const shouldPlay = index === currentVideoIndex;
    const isCurrentVideo = index === currentVideoIndex;
    const isUpcomingVideo = index === currentVideoIndex + 1 || index === currentVideoIndex + 2;
    
    // Only update playing state when it actually changes
    if (isCurrentVideo && !isPlaying) {
      setIsPlaying(true);
      console.log(`[VideoCard ${item.id}] Started playing current video`);
    } else if (!isCurrentVideo && isPlaying) {
      setIsPlaying(false);
    }
  }, [index, currentVideoIndex, item.id]);

  // Pause the video when the screen loses focus and refresh like status when focused
  useFocusEffect(
    useCallback(() => {
      // Remove excessive logging for performance
      // Refresh like status when screen comes into focus
      if (currentUserId) {
        fetchUserLikeStatus();
      }
      return () => {
        setIsPlaying(false);
      };
    }, [currentUserId, fetchUserLikeStatus]),
  );

  /**
   * Scale and fade the heart icon when a like is triggered. This uses
   * Animated.sequence to handle the in/out timing.
   */
  const animateHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 0,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
        delay: 200, // Reduced from 500ms to 200ms
      }),
    ]).start();
  };

  /**
   * Animate play/pause icon when user taps to play or pause
   */
  const animatePlayPause = (willPlay) => {
    setShowPlayIcon(!willPlay); // Show play icon if pausing, pause icon if playing
    
    Animated.sequence([
      Animated.timing(playPauseScale, {
        toValue: 1.1, // Smaller overshoot
        duration: 100, // Much faster
        useNativeDriver: true,
      }),
      Animated.timing(playPauseScale, {
        toValue: 0,
        duration: 150, // Quicker fade out
        delay: 100, // Much shorter delay
        useNativeDriver: true,
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
    console.log(`VideoCard ${item.id}: handleLike called. Currently liked: ${currentlyLiked}, will ${currentlyLiked ? 'unlike' : 'like'}`);
    
    // Optimistically update UI
    setHasLiked(!currentlyLiked);
    setLocalLikeCount((prevCount) => prevCount + (currentlyLiked ? -1 : 1));
    
    try {
      if (currentlyLiked) {
        // User is unliking
        console.log(`VideoCard ${item.id}: Attempting to unlike post`);
        const { error, count } = await supabase
          .from('post_likes')
          .delete({ count: 'exact' })
          .eq('user_id', currentUserId)
          .eq('post_id', item.id);
        if (error) {
          console.error('Error unliking post:', error.message, error);
          Alert.alert('Error', `Failed to unlike post: ${error.message}`);
          // Revert optimistic update
          setHasLiked(currentlyLiked);
          setLocalLikeCount((prevCount) => prevCount + 1);
        } else if (count === 0) {
          console.log(`VideoCard ${item.id}: No like record found to delete, updating UI state`);
          // No like record was found, so update UI to reflect user hasn't liked
          setHasLiked(false);
          // Fetch actual like count to ensure accuracy
          const { data: postData } = await supabase
            .from('posts')
            .select('like_count')
            .eq('id', item.id)
            .single();
          if (postData) {
            setLocalLikeCount(postData.like_count);
          }
        } else {
          console.log(`VideoCard ${item.id}: Successfully unliked post`);
        }
      } else {
        // User is liking
        console.log(`VideoCard ${item.id}: Attempting to like post`);
        const { error } = await supabase
          .from('post_likes')
          .insert({ user_id: currentUserId, post_id: item.id });
        if (error) {
          console.error('Error liking post:', error.message, error);
          
          // Check if this is a duplicate key error (user already liked this post)
          if (error.code === '23505' || error.message.includes('duplicate key')) {
            console.log(`VideoCard ${item.id}: User has already liked this post, updating UI state`);
            // User has already liked this post, so update UI to reflect that
            setHasLiked(true);
            // Don't show error to user, just silently correct the state
            // Fetch the actual like count to ensure accuracy
            const { data: postData } = await supabase
              .from('posts')
              .select('like_count')
              .eq('id', item.id)
              .single();
            if (postData) {
              setLocalLikeCount(postData.like_count);
            }
          } else {
            Alert.alert('Error', 'Unable to like post. Please try again.');
            // Revert optimistic update
            setHasLiked(currentlyLiked);
            setLocalLikeCount((prevCount) => prevCount - 1);
          }
        } else {
          console.log(`VideoCard ${item.id}: Successfully liked post`);
          // Record engagement signal for personalized feed
          recordEngagement(currentUserId, item.id, 'like', 1.0);
          // Send push notification to post owner
          await notifyPostLike(item.id, currentUserId, item.author_id);
        }
      }
    } catch (error) {
      console.error('Exception during like/unlike:', error.message, error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      // Revert optimistic update
      setHasLiked(currentlyLiked);
      setLocalLikeCount((prevCount) => prevCount + (currentlyLiked ? 1 : -1));
    }
  };

  /**
   * Handle single tap - toggle play/pause and show animation
   */
  const handleSingleTap = async () => {
    if (!isCommentsModalVisible) {
      const willPlay = !isPlaying;
      setIsPlaying(willPlay);
      animatePlayPause(willPlay);
    }
  };

  /**
   * Handle tap with double tap detection
   */
  const handleTap = () => {
    const now = Date.now();
    
    if (lastTap.current && (now - lastTap.current) < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (!isCommentsModalVisible) {
        // Only animate heart when liking (not unliking)
        if (!hasLiked) {
          animateHeart();
        }
        // Always call handleLike - it will toggle like/unlike properly
        handleLike();
      }
      lastTap.current = null; // Reset to avoid triple tap
    } else {
      // Potential single tap - wait to see if there's a second tap
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          // No second tap within delay, execute single tap
          handleSingleTap();
          lastTap.current = null;
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Show the comments sheet
  const handleComment = () => {
    setIsCommentsModalVisible(true);
    onCommentsModalChange?.(true);
    // Record engagement signal for opening comments
    if (currentUserId) {
      recordEngagement(currentUserId, item.id, 'comment_open', 0.5);
    }
  };


  const handleFavorite = async () => {
    if (savePending || !currentUserId) return;
    setSavePending(true);
    const target = !isSaved;
    
    // Optimistic UI
    setIsSaved(target);
    
    try {
      if (target) {
        await savePost(item.id);
      } else {
        await unsavePost(item.id);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Rollback on failure
      setIsSaved(!target);
      if (error.message !== 'AUTH_REQUIRED') {
        Alert.alert('Error', 'Failed to save post');
      }
    } finally {
      setSavePending(false);
    }
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

  // Debug logging - only when diag mode is enabled
  if (FEED_DIAG_MODE) {
    console.log('FEED_DIAG_MODE:', FEED_DIAG_MODE, 'for post:', item.id);
  }

  // Check if the media is an image or video
  const isImage = item.media_url?.includes('.jpg') || item.media_url?.includes('.jpeg') || item.media_url?.includes('.png') || item.media_url?.includes('.JPG') || item.media_url?.includes('.JPEG') || item.media_url?.includes('.PNG');
  const isVideo = item.media_url?.includes('.mp4') || item.media_url?.includes('.mov') || item.media_url?.includes('.MOV') || item.playback_id;
  
  // Reduce logging frequency for better performance - only in debug mode
  if (__DEV__ && Math.random() < 0.01) { // Only log 1% of the time in development
    console.log(`VideoCard ${item.id}: isImage=${isImage}, isVideo=${isVideo}, media_url=${item.media_url}`);
  }
  
  // Create Instagram-style centered phone container for iPad
  const responsiveVideoContainer = {
    ...styles.videoContainer,
    ...(isTablet && !disableIPadCentering && {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
    }),
    // When iPad centering is disabled, add flex layout to position content to the left
    ...(isTablet && disableIPadCentering && {
      justifyContent: 'center',
      alignItems: 'flex-start',
      backgroundColor: '#000',
    })
  };

  const phoneContainer = {
    ...(isTablet && {
      width: getPhoneContainerWidth(),
      height: getPhoneContainerHeight(),
      backgroundColor: '#000',
      overflow: 'hidden',
      position: 'relative', // Ensure absolutely positioned children are relative to this container
    })
  };

  // Dynamic video player styles for proper aspect ratio on iPad
  const videoPlayerStyle = {
    ...styles.videoPlayer,
    // When iPad centering is disabled, constrain video to fit screen properly
    ...(isTablet && disableIPadCentering && {
      width: width * 0.9, // Use 90% of screen width
      height: height * 0.9, // Use 90% of screen height to ensure full video is visible
      alignSelf: 'flex-start',
    })
  };

  // Pass leftAlignContent prop for profile screens to ensure proper alignment
  const leftAlignContent = isTablet && disableIPadCentering;


  const renderVideoContent = () => (
    <View style={{ flex: 1 }}>
      {FEED_DIAG_MODE ? (
        <VideoDebug post={item} active={isPlaying} />
      ) : isImage ? (
        <Image
          source={{ uri: item.media_url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onLoadStart={() => {
            console.log(`[VideoCard ${item.id}] Image load started`);
          }}
          onLoad={() => {
            console.log(`[VideoCard ${item.id}] Image loaded successfully`);
          }}
          onError={(error) => {
            console.error(`[VideoCard ${item.id}] Image load error:`, error.nativeEvent.error);
          }}
          defaultSource={require('../assets/video-placeholder.png')}
        />
      ) : (
        <View style={{ position: 'relative', width: '100%', height: '100%' }}>
          <VroomPlayer
            ref={videoRef}
            videoUrl={item.media_url}
            playbackId={item.playback_id}
            posterSource={item.thumbnail_url}
            title={item.content}
            postId={item.id}
            userId={currentUserId}
            style={{ width: '100%', height: '100%' }}
            repeat={true}
            paused={!isPlaying}
            muted={isMuted}
            onVideoLoadStart={() => {
              setIsVideoLoading(true);
              setShowThumbnail(true);
            }}
            onLoad={(data) => {
              console.log(`[VideoCard ${item.id}] Video loaded - duration: ${data.duration}s`);
              setIsVideoLoading(false);
              // Keep thumbnail visible for a short moment to ensure smooth transition
              setTimeout(() => setShowThumbnail(false), 200);
            }}
            onBuffer={({ isBuffering }) => {
              if (isBuffering && !showThumbnail) {
                console.log(`[VideoCard ${item.id}] Video buffering, showing thumbnail...`);
                setShowThumbnail(true);
              } else if (!isBuffering && !isVideoLoading) {
                console.log(`[VideoCard ${item.id}] Video ready to play`);
                setTimeout(() => setShowThumbnail(false), 100);
              }
            }}
            onError={(error) => {
              console.error(`[VideoCard ${item.id}] Video error:`, error);
              setShowThumbnail(true); // Keep thumbnail visible on error
            }}
          />
          
          {/* Thumbnail overlay to prevent black screens */}
          {(showThumbnail && item.thumbnail_url) && (
            <View style={styles.thumbnailOverlay}>
              <Image
                source={{ uri: item.thumbnail_url }}
                style={styles.thumbnailImage}
                resizeMode="cover"
                onError={() => {
                  console.log(`[VideoCard ${item.id}] Thumbnail failed to load:`, item.thumbnail_url);
                }}
              />
              {isVideoLoading && (
                <View style={styles.loadingOverlay}>
                  <View style={styles.loadingIndicator}>
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                </View>
              )}
            </View>
          )}
          
          {/* Fallback loading state when no thumbnail available */}
          {(isVideoLoading && !item.thumbnail_url) && (
            <View style={styles.noThumbnailLoading}>
              <View style={styles.loadingIndicator}>
                <Text style={styles.loadingText}>Loading video...</Text>
              </View>
            </View>
          )}
        </View>
      )}
      
      {/* Tap area for video controls */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleTap}
        style={styles.videoTapArea}
        disabled={isCommentsModalVisible}
      />
      
      {/* Overlay for text and actions */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        <TouchableOpacity onPress={handleProfilePress} style={styles.leftContent}>
          {isImage && (
            <View style={styles.photoTag}>
              <Text style={styles.photoTagText}>PHOTO</Text>
            </View>
          )}
          {item.profiles?.username && (
            <Text style={styles.usernameText}>@{item.profiles.username}</Text>
          )}
          {item.content ? (
            <Text style={styles.captionText} numberOfLines={2} ellipsizeMode="tail">
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

        {/* Animated Play/Pause Overlay */}
        <Animated.View
          style={[
            styles.animatedPlayPause,
            {
              opacity: playPauseScale,
              transform: [{ scale: playPauseScale }],
            },
          ]}
        >
          <View style={styles.playPauseIconBackground}>
            {showPlayIcon ? (
              <View style={styles.playIconContainer}>
                <Ionicons name="play" size={60} color="white" />
              </View>
            ) : (
              <Ionicons name="pause" size={60} color="white" />
            )}
          </View>
        </Animated.View>
      </View>
      
      {/* Avatar */}
      <TouchableOpacity onPress={handleProfilePress} style={[
        styles.avatarContainer,
        usePhoneViewport && {
          // When using PhoneViewport (iPad), align with action stack positioning
          right: '6%', // Match action stack position to prevent clipping
        }
      ]}>
        <Image 
          source={avatarError ? require('../assets/default-profile.png') : getProfileImageSource(item.profiles?.avatar_url)} 
          style={styles.avatar}
          onError={(error) => {
            console.log('VideoCard: Avatar load error for URL:', item.profiles?.avatar_url, 'Error:', error.nativeEvent.error);
            setAvatarError(true);
          }}
        />
      </TouchableOpacity>
      
      {/* Action Bar */}
      {!isCommentsModalVisible && (
        <View style={[
          styles.actionBarContainer,
          usePhoneViewport && {
            // When using PhoneViewport (iPad), provide more margin to prevent clipping
            right: '6%', // Moved slightly right (reduced margin)
            alignItems: 'center', // Center the action buttons horizontally
          }
        ]}>
          <ActionBar
            post={item}
            hasLiked={hasLiked}
            localLikeCount={localLikeCount}
            commentCount={commentCount}
            onLikePress={handleLike}
            onCommentPress={handleComment}
            isFavorited={isSaved}
            onFavoritePress={handleFavorite}
            currentUserId={currentUserId || loggedInUserId}
            onPostDeleted={() => {
              if (onPostDeleted) {
                onPostDeleted(item.id);
              } else {
                navigation?.goBack?.();
              }
            }}
          />
        </View>
      )}
      
      {/* Comments Sheet */}
      <CommentsSheet
        visible={isCommentsModalVisible}
        postId={item.id}
        postOwnerId={item.author_id}
        onClose={() => {
          setIsCommentsModalVisible(false);
          onCommentsModalChange?.(false);
          refreshCounts();
        }}
      />
    </View>
  );

  return usePhoneViewport ? (
    <PhoneViewport align={disableIPadCentering ? "left" : "center"}>
      {renderVideoContent()}
    </PhoneViewport>
  ) : (
    renderVideoContent()
  );
});

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
  videoTapArea: {
    position: 'absolute',
    top: 60, // Add top padding to account for status bar/notch
    left: 0,
    right: 100, // Leave space for action bar on the right
    bottom: 120, // Reduced to match new caption positioning
    zIndex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 100, // Reduced from 150 to lower caption position
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 5, // Higher than video tap area but lower than action bar
  },
  leftContent: {
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 85, // Increased from 10 to 85 to prevent overlap with action bar
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
    top: height * 0.45, // Original position restored
    zIndex: 10, // Same level as action bar
  },
  actionBarContainer: {
    position: 'absolute',
    right: 15,
    bottom: 120,
    alignItems: 'center',
    zIndex: 99,
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
  animatedPlayPause: {
    position: 'absolute',
    left: (width - 120) / 2,
    top: (height - 120) / 2,
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseIconBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  playIconContainer: {
    marginLeft: 6, // Better visual centering for the play triangle
  },
  photoTag: {
    backgroundColor: 'rgba(0, 191, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  photoTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a', // Dark gray instead of pure black
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  noThumbnailLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a', // Dark gray background instead of black
    zIndex: 2,
  },
});

export default VideoCard;