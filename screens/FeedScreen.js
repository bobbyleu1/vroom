// screens/FeedScreen.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { FlatList, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { supabase } from '../utils/supabase'; // Ensure this path is correct
import VideoCard from '../components/VideoCard'; // Ensure this path is correct

const { height } = Dimensions.get('window');

function FeedScreen() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          media_url,
          content,
          like_count,
          comment_count,
          view_count,
          author_id,
          profiles (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'video')
        .order('created_at', { ascending: false });

      if (!error) {
        setVideos(data || []);
      } else {
        console.error("Error fetching feed videos:", error.message);
      }
      setLoading(false);
    };
    fetchVideos();
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentVideoIndex(viewableItems[0].index);
    }
  }, []);

  if (loading) {
    return <ActivityIndicator size="large" color="#00BFFF" style={styles.loadingIndicator} />;
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 80
      }}
      renderItem={({ item, index }) => (
        <VideoCard
          item={item}
          index={index}
          currentVideoIndex={currentVideoIndex}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  loadingIndicator: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FeedScreen;