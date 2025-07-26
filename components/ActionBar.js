import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AntDesign, Ionicons, Feather } from '@expo/vector-icons';

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
 * A compact vertical action bar that displays like, comment and share buttons.
 * The like button reflects whether the current user has liked the post via
 * its icon and colour. Counts are formatted and truncated.
 *
 * Props:
 * - post: The post object (used to fallback to comment_count when a custom
 *   commentCount prop isn't provided).
 * - hasLiked: boolean indicating if the current user has liked the post.
 * - localLikeCount: number of likes to display.
 * - commentCount: optional override for the displayed comment count.
 * - onLikePress: callback when the like button is pressed.
 * - onCommentPress: callback when the comment button is pressed.
 * - onSharePress: callback when the share button is pressed.
 */
const ActionBar = ({
  post,
  hasLiked,
  localLikeCount,
  commentCount,
  onLikePress,
  onCommentPress,
  onSharePress,
}) => {
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
      {/* Share Button */}
      <TouchableOpacity style={styles.actionButton} onPress={onSharePress}>
        <Feather name="share" size={30} color="white" />
        <Text style={styles.actionText}>Share</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 15,
    bottom: 85,
    alignItems: 'center',
    zIndex: 1,
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