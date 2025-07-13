// ActionStack.js for Vroom
// TikTok-style vertical action bar for FeedScreen

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FontAwesome, Feather, MaterialIcons } from '@expo/vector-icons';

const ActionStack = ({
  profilePic,
  likes,
  comments,
  saves,
  shares,
  onLike,
  onComment = () => {},
  onSave = () => {},
  onShare = () => {},
}) => {
  return (
    <View style={styles.container}>
      {/* Profile Pic + Add Button */}
      <TouchableOpacity style={styles.action}>
        <Image source={{ uri: profilePic }} style={styles.profilePic} />
        <View style={styles.plusIcon}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>+</Text>
        </View>
      </TouchableOpacity>

      {/* Like */}
      <TouchableOpacity style={styles.action} onPress={onLike}>
        <FontAwesome name="heart" size={36} color="white" />
        <Text style={styles.count}>{likes}</Text>
      </TouchableOpacity>

      {/* Comment */}
      <TouchableOpacity style={styles.action} onPress={onComment}>
        <Feather name="message-circle" size={36} color="white" />
        <Text style={styles.count}>{comments}</Text>
      </TouchableOpacity>

      {/* Save */}
      <TouchableOpacity style={styles.action} onPress={onSave}>
        <MaterialIcons name="bookmark-border" size={36} color="white" />
        <Text style={styles.count}>{saves}</Text>
      </TouchableOpacity>

      {/* Share */}
      <TouchableOpacity style={styles.action} onPress={onShare}>
        <Feather name="share" size={36} color="white" />
        <Text style={styles.count}>{shares}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  action: {
    alignItems: 'center',
    marginVertical: 10,
  },
  count: {
    color: 'white',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  profilePic: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'white',
  },
  plusIcon: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: '#1E90FF', // Vroom blue
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
});

export default ActionStack;
