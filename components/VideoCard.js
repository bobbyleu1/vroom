// components/VideoCard.js
import React from 'react';
import { View, Dimensions } from 'react-native';
import { Video } from 'expo-av';

const { height } = Dimensions.get('window');

const VideoCard = ({ uri }) => {
  const videoRef = React.useRef(null);

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={{ height: '100%', width: '100%' }}
        resizeMode="cover"
        isLooping
        shouldPlay
      />
    </View>
  );
};

export default VideoCard;
