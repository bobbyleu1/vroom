import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AntDesign, Ionicons, Feather } from '@expo/vector-icons';

// Utility function to format numbers (copied for self-containment)
const formatCount = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

const ActionBar = ({ post, hasLiked, localLikeCount, onLikePress, onCommentPress, onSharePress }) => {
  return (
    <View style={styles.container}>
      {/* Like Button */}
      <TouchableOpacity style={styles.actionButton} onPress={onLikePress}>
        <AntDesign name="heart" size={30} color={hasLiked ? 'red' : 'white'} />
        <Text style={styles.actionText}>{formatCount(localLikeCount)}</Text>
      </TouchableOpacity>

      {/* Comment Button */}
      <TouchableOpacity style={styles.actionButton} onPress={onCommentPress}>
        <Ionicons name="chatbubble-ellipses" size={30} color="white" />
        <Text style={styles.actionText}>{formatCount(post.comment_count || 0)}</Text>
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
    bottom: 85, // Position above the bottom navigation bar
    alignItems: 'center',
    zIndex: 1, // Ensure it's above other overlays
  },
  actionButton: {
    marginBottom: 20, // Spacing between buttons
    alignItems: 'center',
    // Add subtle shadow to buttons for better visibility on video
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
    textShadowColor: 'rgba(0, 0, 0, 0.75)', // Add shadow for readability
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
});

export default ActionBar;
