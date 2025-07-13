// components/VideoCard.js

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, Animated } from 'react-native';
import { Video } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import ActionBar from './ActionBar'; // Ensure this path is correct
import heartIcon from '../assets/icons/heart.png'; // Ensure this path is correct

const { height } = Dimensions.get('window');

function VideoCard({ item, index, currentVideoIndex }) {
  const videoRef = useRef(null);
  const [heartScale] = useState(new Animated.Value(0));

  useEffect(() => {
    if (videoRef.current) {
      if (index === currentVideoIndex) {
        videoRef.current.playAsync();
      } else {
        videoRef.current.pauseAsync().catch(() => {});
      }
    }
  }, [index, currentVideoIndex]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
      };
    }, [])
  );

  const animateHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, friction: 2, tension: 40, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 0, friction: 2, tension: 40, useNativeDriver: true, delay: 500 }),
    ]).start();
  };

  const handleDoubleTap = (postId) => {
    animateHeart();
    // TODO: add Supabase like logic here if you want to increment likes
    console.log("Double tapped:", postId);
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => handleDoubleTap(item.id)}
      style={styles.videoContainer}
    >
      <Video
        ref={videoRef}
        source={{ uri: item.media_url }}
        style={styles.videoPlayer}
        resizeMode="cover"
        isLooping
        shouldPlay={false}
      />

      {/* User Info & Caption Overlays */}
      <View style={styles.overlayContainer}>
        {/* Username */}
        {item.profiles?.username && (
          <View style={styles.usernameBackground}>
            <Text style={styles.usernameText}>
              @{item.profiles.username}
            </Text>
          </View>
        )}

        {/* Caption */}
        {item.content ? (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>{item.content}</Text>
          </View>
        ) : null}

        {/* Animated Heart Overlay */}
        <Animated.Image
          source={heartIcon}
          style={[
            styles.animatedHeart,
            {
              opacity: heartScale,
              transform: [{ scale: heartScale }],
            },
          ]}
        />
      </View>

      {/* Avatar */}
      {item.profiles?.avatar_url && (
        <Image
          source={{ uri: item.profiles.avatar_url }}
          style={styles.avatar}
        />
      )}

      {/* Action Bar */}
      <ActionBar post={item} onLikePress={() => handleDoubleTap(item.id)} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    height: height,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 150,
  },
  usernameBackground: {
    position: 'absolute',
    bottom: 45,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  usernameText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  captionContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    padding: 5,
  },
  captionText: {
    color: '#fff',
    fontSize: 16,
  },
  avatar: {
    position: 'absolute',
    right: 12,
    top: height * 0.45,
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#00BFFF',
    backgroundColor: '#333',
    zIndex: 1,
  },
  animatedHeart: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    width: 100,
    height: 100,
    tintColor: 'white',
  },
});

export default VideoCard;