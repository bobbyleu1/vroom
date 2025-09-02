import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { AntDesign, Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { savePost, unsavePost } from '../utils/supabaseSaved';
import ShareModal from './ShareModal';

/**
 * Format a numeric count into a more human readable string. 1,234 → 1.2K, etc.
 *
 * @param {number|null|undefined} num
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
 * A compact vertical action bar that displays like, comment, favorite and more buttons.
 * The like button reflects whether the current user has liked the post via
 * its icon and colour. Counts are formatted and truncated.
 * The More button provides options for sharing, reporting, blocking, and deletion.
 *
 * Props:
 * - post: The post object (used to fallback to comment_count when a custom
 *   commentCount prop isn't provided).
 * - hasLiked: boolean indicating if the current user has liked the post.
 * - localLikeCount: number of likes to display.
 * - commentCount: optional override for the displayed comment count.
 * - onLikePress: callback when the like button is pressed.
 * - onCommentPress: callback when the comment button is pressed.
 * - isFavorited: boolean indicating if the current user has favorited the post.
 * - onFavoritePress: callback when the favorite button is pressed.
 * - currentUserId: current user's ID for ownership checks.
 * - onPostDeleted: callback when a post is deleted.
 */
const ActionBar = ({
  post,
  hasLiked,
  localLikeCount,
  commentCount,
  onLikePress,
  onCommentPress,
  onSharePress,
  isFavorited = false,
  onFavoritePress,
  currentUserId,
  onPostDeleted,
}) => {
  const [pending, setPending] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);


  const handleFavorite = async () => {
    if (pending) return;
    setPending(true);
    const target = !isFavorited;
    
    // Optimistic UI
    onFavoritePress?.(target);
    
    try {
      if (target) {
        await savePost(post.id);
      } else {
        await unsavePost(post.id);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Rollback on failure
      onFavoritePress?.(!target);
    } finally {
      setPending(false);
    }
  };

  const handleMorePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShareModalVisible(true);
  };
  // Prefer the provided commentCount state from VideoCard. Fallback to the
  // comment_count on the post if undefined.
  const displayedCommentCount =
    commentCount !== undefined ? commentCount : post.comment_count || 0;
  return (
    <View style={styles.container}>
      {/* Like Button */}
      <TouchableOpacity style={styles.actionButton} onPress={onLikePress}>
        <AntDesign
          name={hasLiked ? 'heart' : 'hearto'}
          size={30}
          color={hasLiked ? 'red' : 'white'}
        />
        <Text style={styles.actionText}>{formatCount(localLikeCount)}</Text>
      </TouchableOpacity>
      {/* Comment Button */}
      <TouchableOpacity style={styles.actionButton} onPress={onCommentPress}>
        <Ionicons name="chatbubble-ellipses" size={30} color="white" />
        <Text style={styles.actionText}>{formatCount(displayedCommentCount)}</Text>
      </TouchableOpacity>
      {/* Favorite Button */}
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={handleFavorite}
        disabled={pending}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <AntDesign 
          name={isFavorited ? 'star' : 'staro'} 
          size={30} 
          color={isFavorited ? '#FFD700' : 'white'} 
        />
        <Text style={styles.actionText}>Favorite</Text>
      </TouchableOpacity>

      {/* More Button */}
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={handleMorePress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <MaterialIcons name="more-horiz" size={30} color="white" />
        <Text style={styles.actionText}>More</Text>
      </TouchableOpacity>

      {/* Share Modal */}
      <ShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        post={post}
        currentUserId={currentUserId}
        onPostDeleted={onPostDeleted}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    zIndex: 99,
  },
  actionButton: {
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
});

export default ActionBar;