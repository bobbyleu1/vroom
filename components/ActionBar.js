// components/ActionBar.js

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Share, Alert } from 'react-native'; // Added Share and Alert as they are used
import heartIcon from '../assets/icons/heart.png';    // Path relative to components/ActionBar.js
import commentIcon from '../assets/icons/comment.png'; // Path relative to components/ActionBar.js
import shareIcon from '../assets/icons/share.png';     // Path relative to components/ActionBar.js

function ActionBar({ post, onLikePress }) {
  // Share.share and Alert.alert are built-in React Native, no extra import needed for them
  return (
    <View style={styles.actionBar}>
      <TouchableOpacity onPress={() => onLikePress(post.id)} style={styles.actionButton}>
        <Image source={heartIcon} style={styles.actionIcon} />
        <Text style={styles.actionText}>{post.like_count}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Alert.alert('Comments', 'Coming soon')} style={styles.actionButton}>
        <Image source={commentIcon} style={styles.actionIcon} />
        <Text style={styles.actionText}>{post.comment_count}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Share.share({ message: post.media_url })} style={styles.actionButton}>
        <Image source={shareIcon} style={styles.actionIcon} />
        <Text style={styles.actionText}>Share</Text>
      </TouchableOpacity>
    </View>
  );
}

// Styles specific to the ActionBar
const styles = StyleSheet.create({
  actionBar: {
    position: 'absolute', // This keeps it floating over the video
    right: 15,            // Distance from the right edge
    bottom: 120,          // Distance from the bottom edge
    alignItems: 'center'  // Centers the items vertically
  },
  actionButton: {
    alignItems: 'center', // Centers icon and text
    marginBottom: 20      // Space between each button (heart, comment, share)
  },
  actionIcon: {
    width: 40,
    height: 40,
    tintColor: 'white', // Makes the icons white
    marginBottom: 4     // Space between icon and text
  },
  actionText: {
    color: 'white',     // Text color
    fontSize: 14        // Text size
  },
});

export default ActionBar;